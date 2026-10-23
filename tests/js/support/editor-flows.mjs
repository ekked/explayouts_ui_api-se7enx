/**
 * The main flows of the layout editor, driven as a user would on the page of ./editor-page.mjs with the server of
 * ./fake-api.mjs: each flow acts, waits for the app and returns what it saw (requests and DOM facts) for the test to
 * compare. They run unchanged on the page with and without jQuery.
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
import { click } from './editor-page.mjs';

/** The flows, in the order they run on one page (each starts where the one before left off). */
export const FLOWS = [ 'openLayout', 'editBlock', 'inlineEdit', 'moveBlock', 'addBlockFromToolbar', 'addCollectionItems',
                       'deleteBlock', 'moveBlockByKeyboard', 'discardCancelled', 'publish' ];

const wait = ( ms = 0 ) => new Promise( ( done ) => setTimeout( done, ms ) );

/** The requests since `from` as "METHOD path" with the body (form fields or JSON), token fields left out. */
export function writes( page, from = 0 ) {
    return page.requests.slice( from ).filter( ( r ) => r.method !== 'GET' ).map( ( r ) => {
        let body = r.body;
        if ( /json/.test( r.headers[ 'content-type' ] || '' ) ) body = JSON.parse( r.body );
        else if ( body ) body = Object.fromEntries( [ ...new URLSearchParams( body ) ].filter( ( [ k ] ) => !/_token\]?$/.test( k ) ) );
        return { request: r.method + ' ' + r.path + ( r.url.includes( '?' ) ? '?' + r.url.split( '?' )[ 1 ] : '' ), body,
                 token: r.headers[ 'x-csrf-token' ] || null };
    } );
}

export const gets = ( page, from = 0 ) => page.requests.slice( from ).filter( ( r ) => r.method === 'GET' ).map( ( r ) => r.url.replace( /^https:\/\/example\.test/, '' ) );

// ---- geometry for the drag and drop (happy-dom has no layout) -----------------------------------------------------

function rect( left, top, width, height ) {
    return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON() {} };
}

function shown( el ) {
    for ( let n = el; n && n.nodeType === 1; n = n.parentElement ) if ( n.style && n.style.display === 'none' ) return false;
    return el.isConnected;
}

/** Zone bodies stacked from y 100 (each 300 high, its blocks 40 each), the toolbar's block types at x 0-100 from y 100, the trash at 1000. */
function boxOf( el ) {
    if ( !shown( el ) ) return rect( 0, 0, 0, 0 );
    const zones = [ ...document.querySelectorAll( '.zone-body[data-receiver]' ) ];
    const z = zones.indexOf( el );
    if ( z >= 0 ) return rect( 200, 100 + 320 * z, 600, 300 );
    if ( el.matches( '[data-trash]' ) ) return rect( 1000, 600, 200, 200 );
    const parent = el.parentElement;
    if ( parent && ( zones.includes( parent ) || parent.matches( '.block-items' ) ) ) {
        const box = parent.matches( '.block-items' ) ? rect( 0, 100, 100, 0 ) : boxOf( parent );
        let y = box.top;
        for ( const c of parent.children ) {
            if ( c === el ) break;
            if ( shown( c ) && c.style.position !== 'absolute' ) y += c.classList.contains( 'no-placeholder' ) ? 10 : 40;
        }
        return rect( box.left, y, box.width || 100, 40 );
    }
    const block = el.closest( '[data-block], .add-block-btn' );
    if ( block && block !== el ) return boxOf( block );
    return rect( 0, 0, 0, 0 );
}

export function installGeometry() {
    window.Element.prototype.getBoundingClientRect = function () { return boxOf( this ); };
    window.Element.prototype.getClientRects = function () { const r = boxOf( this ); return r.width || r.height ? [ r ] : []; };
}

function pointer( type, target, x, y ) {
    target.dispatchEvent( new PointerEvent( type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7,
        pointerType: 'mouse', isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 } ) );
}

async function drag( target, path, { hold = 0 } = {} ) {
    const r = boxOf( target );
    pointer( 'pointerdown', target, r.left + r.width / 2, r.top + r.height / 2 );
    if ( hold ) await wait( hold );
    let last;
    for ( const [ x, y ] of path ) {
        pointer( 'pointermove', document.body, x, y );
        last = [ x, y ];
        await wait();
    }
    pointer( 'pointerup', document.body, ...last );
    await wait();
}

// ---- the flows ---------------------------------------------------------------------------------------------------

const blockIds = () => [ ...document.querySelectorAll( '.zone' ) ].map( ( z ) => z.getAttribute( 'data-zone' ) + ': '
    + [ ...z.querySelectorAll( '.zone-body > [data-block]' ) ].map( ( b ) => b.querySelector( '.name' ) && b.querySelector( '.name' ).firstChild
        ? b.querySelector( '.name' ).firstChild.textContent : '?' ).join( ', ' ) );

export async function openLayout( page ) {
    return {
        gets: gets( page ),
        blocks: blockIds(),
        types: [ ...document.querySelectorAll( '.left-panel .add-block-btn' ) ].map( ( b ) => b.className ),
        header: document.querySelector( '.app-header .js-layout-name' ).textContent,
        title: document.title,
        sidebar: document.querySelector( '.right-sidebar' ).textContent.replace( /\s+/g, ' ' ).trim()
    };
}

/** Selects the title block: the sidebar loads its forms; a change in the title field is saved. */
export async function editBlock( page ) {
    const from = page.requests.length;
    click( document.querySelector( '[data-type="title"]' ) );
    await page.settle();
    const sidebar = {
        editing: [ ...document.querySelectorAll( '[data-block].editing' ) ].map( ( b ) => b.getAttribute( 'data-type' ) ),
        tabs: [ ...document.querySelectorAll( '#aside-tabs [role="tab"]' ) ].map( ( t ) => t.id + ' ' + t.getAttribute( 'aria-selected' ) + ' ' + t.getAttribute( 'tabindex' ) ),
        panes: [ ...document.querySelectorAll( '#aside-tabs .tab-pane' ) ].map( ( p ) => p.id + ' ' + p.className + ' ' + ( p.style.display || '' ) ),
        forms: [ ...document.querySelectorAll( '.sidebar form' ) ].map( ( f ) => f.getAttribute( 'name' ) ),
        loader: document.querySelector( '#sidebar .loader' ).style.display
    };
    const loaded = gets( page, from );
    // the Design tab, by keyboard
    const content = document.getElementById( 'tab-content' );
    content.dispatchEvent( new KeyboardEvent( 'keydown', { key: 'ArrowRight', bubbles: true, cancelable: true } ) );
    const tabAfterKey = [ document.activeElement && document.activeElement.id,
        [ ...document.querySelectorAll( '#aside-tabs .tab-pane' ) ].map( ( p ) => p.id + ' ' + p.className + ' ' + ( p.style.display || '' ) ) ];
    // a new title: typed (keyup, saved 500 ms after the last key) and a new block label (change)
    const before = page.requests.length;
    const title = document.getElementById( 'content_edit_title' );
    title.value = 'Hello world';
    title.dispatchEvent( new KeyboardEvent( 'keyup', { key: 'd', bubbles: true } ) );
    await page.settle( 700 );
    const name = document.getElementById( 'design_edit_block_name' );
    name.value = 'Greeting';
    name.dispatchEvent( new Event( 'change', { bubbles: true } ) );
    await page.settle( 700 );
    return {
        sidebar, loaded, tabAfterKey,
        saved: writes( page, before ),
        reloaded: gets( page, before ),
        blocks: blockIds(),
        preview: document.querySelector( '[data-type="title"] [data-inline-child]' ).textContent
    };
}

/** The selected title block typed in place: the sidebar's title field takes the text and is saved 500 ms later. */
export async function inlineEdit( page ) {
    const before = page.requests.length;
    const h2 = document.querySelector( '[data-type="title"] [data-inline-child]' );
    const state = [ h2.getAttribute( 'contenteditable' ), document.activeElement === h2,
                    document.getElementById( 'content_edit_title' ).parentElement.classList.contains( 'hidden' ) ];
    h2.textContent = 'Typed in place';
    h2.dispatchEvent( new KeyboardEvent( 'keyup', { key: 'e', bubbles: true } ) );
    await page.settle( 700 );
    return { state, field: document.getElementById( 'content_edit_title' ).value, saved: writes( page, before ) };
}

/** Drags the title block from the top zone below the list block in the main zone. */
export async function moveBlock( page ) {
    const from = page.requests.length;
    const header = document.querySelector( '[data-type="title"] .block-header' );
    await drag( header, [ [ 500, 120 ], [ 500, 300 ], [ 500, 440 ], [ 500, 450 ] ], { hold: 170 } );
    await page.settle();
    return { saved: writes( page, from ), blocks: blockIds(), sorting: document.body.classList.contains( 'sorting' ) };
}

/** Opens the block types panel and drags "Text" to the top of the main zone. */
export async function addBlockFromToolbar( page ) {
    const from = page.requests.length;
    click( document.querySelector( '.blocks .js-open' ) );
    const open = [ document.querySelector( '.blocks .js-open' ).getAttribute( 'aria-expanded' ), document.querySelector( '.left-panel' ).style.display ];
    const text = document.querySelector( '.left-panel .add-block-btn.icn-text' );
    await drag( text, [ [ 50, 160 ], [ 400, 420 ], [ 400, 425 ] ] );
    await page.settle();
    return {
        open,
        closed: [ document.querySelector( '.blocks .js-open' ).getAttribute( 'aria-expanded' ), document.querySelector( '.left-panel' ).style.display ],
        saved: writes( page, from ),
        loaded: gets( page, from ),
        blocks: blockIds(),
        toolbar: [ ...document.querySelectorAll( '.left-panel .add-block-btn' ) ].map( ( b ) => b.className.replace( /.*icn-(\S+).*/, '$1' ) ),
        editing: [ ...document.querySelectorAll( '[data-block].editing' ) ].map( ( b ) => b.getAttribute( 'data-type' ) )
    };
}

/** Selects the list block and adds an item through the content browser dialog. */
export async function addCollectionItems( page ) {
    click( document.querySelector( '[data-type="list"]' ) );
    await page.settle();
    const items = () => [ ...document.querySelectorAll( '.collection-items .bm-items .collection-item' ) ].map( ( i ) => i.textContent.replace( /\s+/g, ' ' ).trim() );
    const listed = items();
    const from = page.requests.length;
    click( document.querySelector( '.collection-items .add-items' ) );
    await page.settle();
    const dialog = document.getElementById( 'exp-content-browser-modal' );
    const rows = [ ...dialog.querySelectorAll( '.exp-cb-list .js-cb-select' ) ].map( ( i ) => i.getAttribute( 'data-name' ) );
    dialog.querySelector( '.js-cb-select[data-node-id="70"]' ).checked = true;
    click( dialog.querySelector( '.exp-cb-apply' ) );
    await page.settle();
    return { listed, rows, saved: writes( page, from ), loaded: gets( page, from ), items: items(),
             dialog: [ dialog.className, dialog.style.display, document.body.classList.contains( 'modal-open' ) ] };
}

/** Deletes the list block from its menu: the dropdown opens, the dialog asks, Delete deletes. */
export async function deleteBlock( page ) {
    const from = page.requests.length;
    const block = document.querySelector( '[data-type="list"]' );
    const toggle = block.querySelector( '.block-header .dropdown-toggle' );
    click( toggle );
    const menu = [ block.querySelector( '.block-header .dropdown' ).classList.contains( 'open' ), toggle.getAttribute( 'aria-expanded' ) ];
    click( block.querySelector( '.block-header .js-destroy a' ) );
    await page.settle();
    const modal = document.querySelector( '.js-ngc-wrapper .modal' );
    const asked = [ modal.querySelector( '.modal-title' ).textContent.trim(), modal.className, modal.getAttribute( 'aria-modal' ) ];
    click( modal.querySelector( '.action_apply' ) );
    await page.settle();
    return { menu, asked, saved: writes( page, from ), blocks: blockIds(), modals: document.querySelectorAll( '.js-ngc-wrapper .modal' ).length,
             open: document.body.classList.contains( 'modal-open' ) };
}

/** Moves the title block one place up with the keyboard: its grip, Space, ArrowUp, Space. */
export async function moveBlockByKeyboard( page ) {
    const from = page.requests.length;
    const press = ( key ) => ( document.activeElement || document.body ).dispatchEvent( new KeyboardEvent( 'keydown', { key, bubbles: true, cancelable: true } ) );
    const live = () => ( document.querySelector( '.exp-kbd-sr[aria-live]' ) || {} ).textContent;
    const grip = document.querySelector( '[data-type="title"] > .block-header .exp-kbd-grip' );
    const name = [ grip.getAttribute( 'role' ), grip.getAttribute( 'aria-label' ), grip.tabIndex ];
    grip.focus();
    press( ' ' );
    const picked = [ live(), grip.getAttribute( 'aria-pressed' ) ];
    press( 'ArrowUp' );
    const moved = [ live(), blockIds() ];
    press( ' ' );
    await page.settle();
    const focused = document.activeElement;
    return { name, picked, moved, dropped: live(), saved: writes( page, from ), blocks: blockIds(),
             focus: focused && focused.matches( '.exp-kbd-grip' ) && focused.closest( '[data-block]' ).getAttribute( 'data-type' ),
             pressed: document.querySelectorAll( '[aria-pressed]' ).length };
}

/** Discard asks first; cancelled, nothing is sent. */
export async function discardCancelled( page ) {
    const from = page.requests.length;
    click( document.querySelector( '.app-header .js-discard' ) );
    await page.settle();
    const modal = document.querySelector( '.js-ngc-wrapper .modal' );
    const asked = modal.querySelector( '.modal-title' ).textContent.trim();
    click( modal.querySelector( '.action_cancel' ) );
    await page.settle();
    return { asked, saved: writes( page, from ), modals: document.querySelectorAll( '.js-ngc-wrapper .modal' ).length };
}

/** Publish: the header's button, the request after the app's wait, the editor leaves. */
export async function publish( page ) {
    const from = page.requests.length;
    click( document.querySelector( '.app-header .dropdown-toggle' ) );
    const menu = [ document.querySelector( '.app-header .dropdown' ).classList.contains( 'open' ),
                   document.querySelector( '.app-header .dropdown-toggle' ).getAttribute( 'aria-expanded' ) ];
    click( document.querySelector( '.main-content' ) );
    const closed = document.querySelector( '.app-header .dropdown' ).classList.contains( 'open' );
    click( document.querySelector( '.app-header .js-publish' ) );
    const overlay = document.querySelector( '.loading-overlay' ).style.display;
    await page.settle( 1300 );
    return { menu, closed, overlay, saved: writes( page, from ), leaving: page.Core.should_navigate_away === true };
}
