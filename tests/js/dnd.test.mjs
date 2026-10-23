/**
 * The layout editor's drag and drop without jQuery UI (design/standard/javascript/netgen-layouts.js, modules 137
 * ./mouse, 138 jquery-ui/sortable, 135 ./draggable, 136 jquery-ui/droppable; patches in src/app-patches/modules/).
 *
 * The modules run from the bundle itself. happy-dom has no layout, so the geometry is a small mock: the children of
 * a list registered with layout() stack from its top, 40px each (a placeholder of class no-placeholder 10px, a hidden
 * or absolutely positioned element nothing), recomputed whenever it is asked for, as a browser would. Pointer Events
 * are dispatched as a mouse, a finger or a pen would send them.
 *
 * Three parts: the sortable and draggable/droppable on their own; differentially against jQuery UI 1.14.2 (ezjscore's,
 * the one the editor ran on): the same lists, the same gestures, the same callbacks in the same order with the same
 * this/item/sender, the same DOM afterwards; and the editor's own callers (./dnd, ./draggable, ./receiver,
 * ./bm_collection_items), on the editor's DOM layer (module jquery), on the paths the editor takes: a block type from the toolbar into a zone, a block moved
 * between zones, zones that refuse, the trash, Escape, the items of manual and dynamic collections.
 *
 * Run: npm ci && npm test (in extension/explayouts_ui_api)
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { parseBundle } from '../../src/app-patches/bundle.mjs';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const parsed = parseBundle( readFileSync( resolve( root, 'design/standard/javascript/netgen-layouts.js' ), 'utf8' ) );
// jQuery UI as the page had it (ezjscore), for the differential tests; skipped where it is not at hand.
// (the package's sibling in extension/, or JQUERY_UI_FILE=<path> for a checkout elsewhere).
const JQUERY_UI = [ process.env.JQUERY_UI_FILE, resolve( root, '../ezjscore/design/standard/javascript/jquery-ui-1.14.2.js' ) ]
    .find( ( f ) => f && existsSync( f ) );
const haveJQueryUI = !!JQUERY_UI;

let jQuery, dom, mouse, sortable, dd;

function idOf( name ) {
    for ( const m of parsed.modules.values() ) if ( name in m.deps ) return String( m.deps[ name ] );
    throw new Error( 'no module ' + name );
}

function load( id, standIns = {} ) {
    const m = parsed.modules.get( String( id ) );
    const module = { exports: {} };
    const fn = ( 0, eval )( '(' + m.source + ')' );
    fn.call( module.exports, ( name ) => {
        if ( String( name ) in standIns ) return standIns[ String( name ) ];
        throw new Error( 'module ' + id + ' asks for ' + name );
    }, module, module.exports );
    return module.exports;
}

const wait = ( ms = 0 ) => new Promise( ( done ) => setTimeout( done, ms ) );

// ---- geometry ----------------------------------------------------------------------------------------------------

const lists = new Map();

function hidden( el ) {
    for ( let n = el; n && n.nodeType === 1; n = n.parentElement ) if ( n.style && n.style.display === 'none' ) return true;
    return !el.isConnected;
}

function heightOf( el ) {
    if ( el.style.display === 'none' || el.style.position === 'absolute' ) return 0;
    if ( el.classList.contains( 'no-placeholder' ) ) return 10;
    if ( el.classList.contains( 'ui-sortable-placeholder' ) ) return parseFloat( el.style.height ) || 0;
    return 40;
}

function rect( left, top, width, height ) {
    return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON() {} };
}

function boxOf( el ) {
    if ( hidden( el ) ) return rect( 0, 0, 0, 0 );
    if ( lists.has( el ) ) {
        const l = lists.get( el );
        let h = 0;
        for ( const c of el.children ) h += heightOf( c );
        return rect( l.left, l.top - ( l.scroller ? l.scroller.scrollTop : 0 ), l.width, Math.max( l.height || 0, h ) );
    }
    const p = el.parentElement;
    if ( p && lists.has( p ) && heightOf( el ) ) {
        const l = boxOf( p );
        let y = l.top;
        for ( const c of p.children ) {
            if ( c === el ) break;
            y += heightOf( c );
        }
        return rect( l.left, y, l.width, heightOf( el ) );
    }
    if ( el.__rect ) return rect( ...el.__rect );
    return rect( 0, 0, 0, 0 );
}

/** Registers lists: { element, left, top, width, height } (height: a minimum). */
function layout( ...specs ) {
    for ( const s of specs ) lists.set( s.element, s );
}

// ---- gestures ----------------------------------------------------------------------------------------------------

let pointerId = 1;

function pointer( type, target, x, y, { pointerType = 'mouse', id = pointerId } = {} ) {
    const ev = new PointerEvent( type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id,
        pointerType, isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 } );
    target.dispatchEvent( ev );
    return ev;
}

/** Presses on `target` at its middle (or at `from`), moves through `path` (a tick between steps), lets go. */
async function drag( target, path, { from, pointerType = 'mouse', hold = 0, release = true } = {} ) {
    pointerId++;
    const r = boxOf( target.closest( '[data-test-item]' ) || target );
    const [ x0, y0 ] = from || [ r.left + r.width / 2, r.top + r.height / 2 ];
    const down = pointer( 'pointerdown', target, x0, y0, { pointerType } );
    if ( hold ) await wait( hold );
    let last = [ x0, y0 ];
    for ( const [ x, y ] of path ) {
        pointer( 'pointermove', document.body, x, y, { pointerType } );
        last = [ x, y ];
        await wait();
    }
    if ( release ) pointer( 'pointerup', document.body, ...last, { pointerType } );
    await wait();
    return down;
}

function escape() {
    const ev = new KeyboardEvent( 'keydown', { key: 'Escape', bubbles: true, cancelable: true } );
    document.body.dispatchEvent( ev );
    return ev;
}

const ids = ( el ) => [ ...el.children ].map( ( c ) => c.id || c.className );

/** What matches `selector` under `root`, as text: a failing assertion must not print a happy-dom node (that takes minutes). */
const found = ( selector, root = document ) => [ ...root.querySelectorAll( selector ) ].map( ( n ) => n.id + '.' + n.className );

before( async () => {
    GlobalRegistrator.register( { url: 'https://example.test/exponential_admin/explayouts_ui_api/app#layout/1/edit' } );
    window.Element.prototype.getBoundingClientRect = function () { return boxOf( this ); };
    window.Element.prototype.getClientRects = function () {
        const r = boxOf( this );
        return r.width || r.height ? [ r ] : [];
    };
    for ( const [ prop, key ] of [ [ 'offsetWidth', 'width' ], [ 'offsetHeight', 'height' ] ] ) {
        Object.defineProperty( window.HTMLElement.prototype, prop, { configurable: true, get() { return boxOf( this )[ key ]; } } );
    }
    // A browser's querySelectorAll throws on jQuery's own selectors (":first"), and jQuery then reads them itself;
    // happy-dom's answers with nothing instead.
    for ( const proto of [ window.Element.prototype, window.Document.prototype, window.DocumentFragment.prototype ] ) {
        for ( const name of [ 'querySelectorAll', 'querySelector', 'matches' ] ) {
            const original = proto[ name ];
            if ( !original ) continue;
            proto[ name ] = function ( selector, ...rest ) {
                if ( /:(first|last|eq|even|odd|gt|lt)\b/.test( selector ) ) throw new window.DOMException( 'not a valid selector', 'SyntaxError' );
                return original.call( this, selector, ...rest );
            };
        }
    }
    const { jQueryFactory } = await import( 'jquery/factory' );
    jQuery = jQueryFactory( window );
    window.jQuery = globalThis.jQuery = jQuery;
    // the editor's DOM layer (module jquery) for the callers below; jQuery 4 only for jQuery UI in the comparison
    dom = load( idOf( 'jquery' ), { 101: load( idOf( 'bootstrap/js/transition' ) ) } );
    mouse = load( idOf( './mouse' ) );
    sortable = load( idOf( 'jquery-ui/sortable' ), { './mouse': mouse, './core': {}, './widget': {} } );
    dd = load( idOf( 'jquery-ui/draggable' ), { './mouse': mouse, './core': {}, './widget': {} } );
} );

after( async () => {
    await GlobalRegistrator.unregister();
} );

beforeEach( () => {
    escape();   // a test that failed half way leaves no press behind
    lists.clear();
    document.body.innerHTML = '';
} );

// ---- fixtures ----------------------------------------------------------------------------------------------------

/** Two lists side by side: #L1 (a1 a2 a3) at x 0-200, #L2 (b1 b2) at x 300-500, both from y 100, at least 200 high. */
function twoLists( { second = 'list', sized = false } = {} ) {
    // sized: the sizes also as styles, for jQuery UI (jQuery reads widths and heights from the computed style)
    const list = sized ? ' style="width: 200px; height: 200px"' : '', item = sized ? ' style="width: 200px; height: 40px"' : '';
    document.body.innerHTML =
        '<div id="L1" class="list"' + list + '>' + [ 'a1', 'a2', 'a3' ].map( ( i ) => '<div id="' + i + '"' + item + ' data-test-item><span class="grip">' + i + '</span></div>' ).join( '' ) + '</div>' +
        '<div id="L2" class="' + second + '"' + list + '>' + [ 'b1', 'b2' ].map( ( i ) => '<div id="' + i + '"' + item + ' data-test-item><span class="grip">' + i + '</span></div>' ).join( '' ) + '</div>';
    const L1 = document.getElementById( 'L1' );
    const L2 = document.getElementById( 'L2' );
    layout( { element: L1, left: 0, top: 100, width: 200, height: 200 }, { element: L2, left: 300, top: 100, width: 200, height: 200 } );
    return { L1, L2 };
}

const CALLBACKS = [ 'start', 'activate', 'over', 'out', 'change', 'beforeStop', 'update', 'remove', 'receive', 'deactivate', 'stop' ];

/** Callbacks that write down "name this item sender" (elements or jQuery objects alike). */
function recorder( trace, extra = {} ) {
    const el = ( x ) => x && ( x.nodeType === 1 ? x : x[ 0 ] );
    const options = {};
    for ( const name of CALLBACKS ) {
        options[ name ] = function ( event, ui ) {
            assert.ok( event.target === this, name + ': event.target is the list' );
            trace.push( [ name, this.id, el( ui.item ) && el( ui.item ).id, ui.sender ? el( ui.sender ).id : null ].join( ' ' ) );
            if ( extra[ name ] ) return extra[ name ].call( this, event, ui );
        };
    }
    return options;
}

// ---- the sortable on its own -------------------------------------------------------------------------------------

test( 'a press becomes a drag only after delay and distance; a press without them is a click', async () => {
    const { L1 } = twoLists();
    const trace = [];
    sortable.sortable( L1, { delay: 150, distance: 20, ...recorder( trace ) } );
    const a1 = document.getElementById( 'a1' );
    let clicks = 0;
    a1.addEventListener( 'click', () => clicks++ );

    await drag( a1, [ [ 100, 150 ] ] );                       // moved far enough, but at once
    assert.deepEqual( trace, [] );
    await drag( a1, [ [ 105, 125 ] ], { hold: 170 } );         // long enough, not far enough
    assert.deepEqual( trace, [] );
    a1.dispatchEvent( new MouseEvent( 'click', { bubbles: true, detail: 1 } ) );
    assert.equal( clicks, 1, 'the click of a press that was no drag goes through' );

    await drag( a1, [ [ 100, 160 ] ], { hold: 170 } );
    assert.equal( trace[ 0 ], 'start L1 a1 ' );
    assert.equal( trace.at( -1 ), 'stop L1 a1 ' );
} );

test( 'sorting within a list: update and stop with item, the list as this, one drag object; helper and placeholder go', async () => {
    const { L1 } = twoLists();
    const trace = [];
    const drags = new Set();
    let helper, placeholder;
    const opts = recorder( trace, {
        start: ( e, ui ) => { helper = ui.helper; placeholder = ui.placeholder; drags.add( ui.drag ); },
        update: ( e, ui ) => { drags.add( ui.drag ); },
        stop: ( e, ui ) => { drags.add( ui.drag ); },
    } );
    sortable.sortable( L1, { placeholder: 'no-placeholder', ...opts } );
    await drag( document.getElementById( 'a1' ), [ [ 100, 130 ], [ 100, 175 ] ] );

    assert.deepEqual( ids( L1 ), [ 'a2', 'a3', 'a1' ] );
    assert.ok( trace.includes( 'update L1 a1 ' ) );
    assert.equal( drags.size, 1, 'ui.drag is the same object in every callback of a drag' );
    assert.ok( helper.classList.contains( 'ui-sortable-helper' ) && !helper.isConnected, 'the helper is gone' );
    assert.equal( placeholder.className, 'no-placeholder ui-sortable-placeholder' );
    assert.ok( !placeholder.isConnected, 'the placeholder is gone' );
    assert.equal( document.getElementById( 'a1' ).style.display, '', 'the item is shown again' );
} );

test( 'connected lists: remove, receive and update with the sender, in jQuery UI\'s order', async () => {
    const { L1, L2 } = twoLists();
    const trace = [];
    sortable.sortable( [ L1, L2 ], { connectWith: '.list', placeholder: 'no-placeholder', tolerance: 'pointer', ...recorder( trace ) } );
    await drag( document.getElementById( 'a1' ), [ [ 150, 130 ], [ 400, 130 ], [ 400, 145 ] ] );

    assert.deepEqual( ids( L1 ), [ 'a2', 'a3' ] );
    assert.deepEqual( ids( L2 ), [ 'b1', 'a1', 'b2' ] );
    const end = trace.slice( trace.indexOf( 'beforeStop L1 a1 ' ) );
    assert.deepEqual( end, [ 'beforeStop L1 a1 ', 'update L1 a1 ', 'remove L1 a1 ', 'receive L2 a1 L1', 'update L2 a1 L1',
        'deactivate L2 a1 L1', 'out L2 a1 L1', 'deactivate L1 a1 L1', 'stop L1 a1 ' ] );
} );

test( 'a list refusing in receive puts the item back with cancel( sender ); stop calling preventDefault does too', async () => {
    let { L1, L2 } = twoLists();
    sortable.sortable( [ L1, L2 ], { connectWith: '.list', tolerance: 'pointer',
        receive: ( e, ui ) => sortable.cancel( ui.sender ) } );
    await drag( document.getElementById( 'a2' ), [ [ 150, 170 ], [ 400, 130 ], [ 400, 145 ] ] );
    assert.deepEqual( ids( L1 ), [ 'a1', 'a2', 'a3' ] );
    assert.deepEqual( ids( L2 ), [ 'b1', 'b2' ] );

    ( { L1, L2 } = twoLists() );
    sortable.sortable( [ L1, L2 ], { connectWith: '.list', tolerance: 'pointer', stop: ( e ) => e.preventDefault() } );
    await drag( document.getElementById( 'a3' ), [ [ 150, 210 ], [ 400, 130 ], [ 400, 145 ] ] );
    assert.deepEqual( ids( L1 ), [ 'a1', 'a2', 'a3' ] );
    assert.deepEqual( ids( L2 ), [ 'b1', 'b2' ] );
} );

test( 'cancel( list ) after the drag puts the item last dragged back (the trash\'s dialog cancelled)', async () => {
    const { L1, L2 } = twoLists();
    sortable.sortable( [ L1, L2 ], { connectWith: '.list', tolerance: 'pointer' } );
    await drag( document.getElementById( 'a2' ), [ [ 150, 170 ], [ 400, 130 ], [ 400, 145 ] ] );
    assert.deepEqual( ids( L2 ), [ 'b1', 'a2', 'b2' ] );
    await wait( 5 );
    sortable.cancel( L1 );
    assert.deepEqual( ids( L1 ), [ 'a1', 'a2', 'a3' ] );
    assert.deepEqual( ids( L2 ), [ 'b1', 'b2' ] );
} );

test( 'Escape cancels a drag: all back, no update/remove/receive; out, deactivate and stop; the click after is dropped', async () => {
    const { L1, L2 } = twoLists();
    const trace = [];
    sortable.sortable( [ L1, L2 ], { connectWith: '.list', tolerance: 'pointer', ...recorder( trace ) } );
    const a1 = document.getElementById( 'a1' );
    await drag( a1, [ [ 150, 130 ], [ 400, 130 ], [ 400, 145 ] ], { release: false } );
    assert.ok( document.querySelector( '.ui-sortable-helper' ) );
    const key = escape();
    assert.ok( key.defaultPrevented, 'Escape is taken by the drag' );
    assert.deepEqual( ids( L1 ), [ 'a1', 'a2', 'a3' ] );
    assert.deepEqual( ids( L2 ), [ 'b1', 'b2' ] );
    assert.deepEqual( found( '.ui-sortable-helper, .ui-sortable-placeholder' ), [] );
    assert.ok( !trace.some( ( t ) => /^(update|remove|receive|beforeStop) /.test( t ) ), trace.join( ', ' ) );
    assert.deepEqual( trace.slice( -4 ), [ 'deactivate L2 a1 L1', 'out L2 a1 L1', 'deactivate L1 a1 L1', 'stop L1 a1 ' ] );

    // The button still down: moves and the release do nothing any more, and its click is not a click on the block.
    pointer( 'pointermove', document.body, 420, 160 );
    pointer( 'pointerup', document.body, 420, 160 );
    assert.equal( trace.at( -1 ), 'stop L1 a1 ' );
    let clicks = 0;
    a1.addEventListener( 'click', () => clicks++ );
    a1.dispatchEvent( new MouseEvent( 'click', { bubbles: true, cancelable: true, detail: 1 } ) );
    assert.equal( clicks, 0, 'the click ending the drag is dropped' );
    a1.dispatchEvent( new MouseEvent( 'click', { bubbles: true, cancelable: true, detail: 1 } ) );
    assert.equal( clicks, 1, 'the next one is not' );
} );

test( 'a click from the keyboard is never taken for the end of a drag', async () => {
    const { L1 } = twoLists();
    sortable.sortable( L1, {} );
    await drag( document.getElementById( 'a1' ), [ [ 100, 130 ], [ 100, 205 ] ] );
    let clicks = 0;
    L1.addEventListener( 'click', () => clicks++ );
    L1.dispatchEvent( new MouseEvent( 'click', { bubbles: true, detail: 0 } ) );
    assert.equal( clicks, 1 );
} );

test( 'connectWith is read when the drag starts: a list it does not match (a linked zone) takes nothing', async () => {
    const { L1, L2 } = twoLists( { second: 'list linked' } );
    sortable.sortable( [ L1, L2 ], { connectWith: '.list:not(.linked)', tolerance: 'pointer' } );
    await drag( document.getElementById( 'a1' ), [ [ 150, 130 ], [ 400, 130 ], [ 400, 145 ] ] );
    assert.deepEqual( ids( L1 ), [ 'a1', 'a2', 'a3' ] );
    assert.deepEqual( ids( L2 ), [ 'b1', 'b2' ] );
} );

test( 'touch and pen drag like the mouse; the press is not prevented (taps stay taps), the grips carry the class for touch-action', async () => {
    for ( const pointerType of [ 'touch', 'pen' ] ) {
        const { L1, L2 } = twoLists();
        sortable.sortable( [ L1, L2 ], { connectWith: '.list', tolerance: 'pointer', handle: '.grip' } );
        assert.ok( [ ...document.querySelectorAll( '.grip' ) ].every( ( g ) => g.classList.contains( 'ui-sortable-handle' ) ) );
        const down = await drag( document.querySelector( '#a1 .grip' ), [ [ 150, 130 ], [ 400, 130 ], [ 400, 145 ] ], { pointerType } );
        assert.equal( down.defaultPrevented, false, pointerType );
        assert.deepEqual( ids( L2 ), [ 'b1', 'a1', 'b2' ], pointerType );
    }
    // A mouse press on a grip is prevented: no text selection, no native drag.
    const { L1 } = twoLists();
    sortable.sortable( L1, { handle: '.grip' } );
    const down = await drag( document.querySelector( '#a1 .grip' ), [] );
    assert.equal( down.defaultPrevented, true );
    // Items added later get the class too (blocks created after the list was set up).
    L1.insertAdjacentHTML( 'beforeend', '<div id="a4"><span class="grip">a4</span></div>' );
    await wait();
    assert.ok( document.querySelector( '#a4 .grip' ).classList.contains( 'ui-sortable-handle' ) );
} );

test( 'only the handle starts a drag; a press inside a nested list is that list\'s', async () => {
    const { L1 } = twoLists();
    const a2 = document.getElementById( 'a2' );
    a2.insertAdjacentHTML( 'beforeend', '<div id="N" class="list"><div id="n1"><span class="grip">n1</span></div><div id="n2"><span class="grip">n2</span></div></div>' );
    const outer = [], inner = [];
    sortable.sortable( L1, { handle: '.grip', start: () => outer.push( 'start' ) } );
    sortable.sortable( document.getElementById( 'N' ), { handle: '.grip', start: () => inner.push( 'start' ) } );
    await drag( document.getElementById( 'a1' ), [ [ 100, 160 ] ], { from: [ 100, 139 ] } );   // a1, not on its grip
    assert.deepEqual( outer, [] );
    document.getElementById( 'n1' ).__rect = [ 0, 140, 200, 20 ];
    await drag( document.querySelector( '#n1 .grip' ), [ [ 100, 190 ] ], { from: [ 100, 150 ] } );
    assert.deepEqual( inner, [ 'start' ] );
    assert.deepEqual( outer, [], 'the outer list leaves the press to the inner one' );
} );

test( 'auto-scroll while the pointer stays near the edge of the scroll parent, faster nearer the edge; the window when there is none', async () => {
    const { L1 } = twoLists();
    const scroller = document.createElement( 'div' );
    document.body.appendChild( scroller );
    scroller.appendChild( L1 );
    scroller.__rect = [ 0, 50, 600, 300 ];
    let top = 0;
    Object.defineProperty( scroller, 'scrollTop', { configurable: true, get: () => top, set: ( v ) => { top = Math.max( 0, v ); } } );
    sortable.sortable( L1, { scrollParent: scroller } );
    await drag( document.getElementById( 'a1' ), [ [ 100, 200 ] ], { release: false } );
    await wait( 50 );
    assert.equal( top, 0, 'not near an edge: no scrolling' );
    pointer( 'pointermove', document.body, 100, 345 );         // 5px above the bottom edge (350)
    await wait( 80 );
    const near = top;
    assert.ok( near >= 30, 'the pointer held still near the bottom keeps scrolling: ' + near );
    pointer( 'pointermove', document.body, 100, 200 );
    await wait( 50 );
    assert.ok( top - near <= 15, 'away from the edge it stops' );
    pointer( 'pointermove', document.body, 100, 60 );          // near the top edge (50)
    await wait( 80 );
    assert.ok( top < near, 'near the top it scrolls back' );
    escape();
    const stopped = top;
    await wait( 50 );
    assert.equal( top, stopped, 'the drag over, the scrolling stops' );

    const { L1: L } = twoLists();
    const calls = [];
    const original = window.scrollBy;
    window.scrollBy = ( x, y ) => calls.push( y );
    try {
        sortable.sortable( L, {} );
        await drag( document.getElementById( 'a1' ), [ [ 100, 200 ], [ 100, window.innerHeight - 1 ] ], { release: false } );
        await wait( 50 );
        escape();
    } finally {
        window.scrollBy = original;
    }
    assert.ok( calls.length > 0 && calls.every( ( y ) => y > 0 && y <= 16 ), calls.join( ',' ) );
} );

test( 'a placeholder without a class: the item\'s tag and classes, hidden, the item\'s size', async () => {
    const { L1 } = twoLists();
    document.getElementById( 'a1' ).className = 'collection-item manual-item';
    let placeholder;
    sortable.sortable( L1, { axis: 'y', start: ( e, ui ) => { placeholder = ui.placeholder; } } );
    await drag( document.getElementById( 'a1' ), [ [ 100, 130 ] ], { release: false } );
    // As jQuery UI: the item's classes, its grip class included (no handle: the item is the grip).
    assert.equal( placeholder.className, 'collection-item manual-item ui-sortable-handle ui-sortable-placeholder' );
    assert.equal( placeholder.style.visibility, 'hidden' );
    assert.equal( placeholder.style.height, '40px' );
    const helper = document.querySelector( '.ui-sortable-helper' );
    assert.equal( helper.style.left, '', 'axis y: the helper keeps its column' );
    assert.equal( helper.style.top, ( 130 - 20 ) + 'px' );
    escape();
} );

// ---- draggables and droppables -----------------------------------------------------------------------------------

function slots() {
    document.body.innerHTML = '<div id="items">' + [ 0, 1, 2, 3 ].map( ( i ) =>
        '<div id="s' + i + '" class="slot"><div class="panel" id="p' + i + '"><span class="handle">=</span></div></div>' ).join( '' ) + '</div>';
    const list = document.getElementById( 'items' );
    layout( { element: list, left: 0, top: 100, width: 200 } );
    for ( let i = 0; i < 4; i++ ) document.getElementById( 'p' + i ).__rect = [ 0, 100 + 40 * i, 200, 40 ];
    return list;
}

test( 'draggable over droppables: activeClass while it lasts, hoverClass where the helper is, drop with the draggable', async () => {
    const list = slots();
    const trace = [];
    const panel = document.getElementById( 'p0' );
    dd.draggable( panel, { axis: 'y', helper: 'clone', handle: '.handle', zIndex: 100, appendTo: '#items',
        start() { trace.push( 'start ' + this.id ); }, stop() { trace.push( 'stop ' + this.id ); } } );
    dd.droppable( list.querySelectorAll( '.slot' ), { activeClass: 'sorting', hoverClass: 'highlight',
        over( e, ui ) { assert.ok( e.target === this ); trace.push( 'over ' + this.id ); },
        out() { trace.push( 'out ' + this.id ); },
        drop( e, ui ) { trace.push( 'drop ' + this.id + ' ' + ui.draggable.id ); } } );
    assert.ok( document.querySelector( '#p0 .handle' ).classList.contains( 'ui-draggable-handle' ) );

    await drag( document.querySelector( '#p0 .handle' ), [ [ 300, 125 ], [ 300, 205 ] ], { from: [ 50, 120 ], hold: 0, release: false } );
    const helper = document.querySelector( '.ui-draggable-dragging' );
    assert.ok( helper && helper !== panel && helper.parentNode === list, 'a copy in #items' );
    assert.equal( helper.style.zIndex, '100' );
    assert.equal( helper.style.top, ( 205 - 20 ) + 'px' );
    assert.ok( [ ...list.querySelectorAll( '.slot' ) ].every( ( s ) => s.classList.contains( 'sorting' ) ), 'activeClass on all' );
    assert.ok( document.getElementById( 's2' ).classList.contains( 'highlight' ) );
    pointer( 'pointerup', document.body, 300, 205 );

    assert.deepEqual( trace, [ 'start p0', 'over s0', 'out s0', 'over s2', 'drop s2 p0', 'stop p0' ] );
    assert.deepEqual( found( '.sorting, .highlight, .ui-draggable-dragging' ), [] );
} );

test( 'Escape ends a draggable\'s drag without a drop', async () => {
    const list = slots();
    const trace = [];
    dd.draggable( document.getElementById( 'p0' ), { axis: 'y', helper: 'clone', handle: '.handle', stop() { trace.push( 'stop' ); } } );
    dd.droppable( list.querySelectorAll( '.slot' ), { activeClass: 'sorting', hoverClass: 'highlight', drop() { trace.push( 'drop' ); } } );
    await drag( document.querySelector( '#p0 .handle' ), [ [ 50, 205 ] ], { from: [ 50, 120 ], release: false } );
    escape();
    pointer( 'pointerup', document.body, 50, 205 );
    assert.deepEqual( trace, [ 'stop' ] );
    assert.deepEqual( found( '.sorting, .highlight, .ui-draggable-dragging' ), [] );
} );

// ---- differential: jQuery UI 1.14.2 ------------------------------------------------------------------------------

function mouseEvent( type, target, x, y ) {
    const ev = new MouseEvent( type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1 } );
    Object.defineProperty( ev, 'which', { value: 1 } );
    Object.defineProperty( ev, 'pageX', { value: x } );
    Object.defineProperty( ev, 'pageY', { value: y } );
    target.dispatchEvent( ev );
}

async function dragWithMouse( target, path ) {
    const r = boxOf( target );
    const [ x0, y0 ] = [ r.left + r.width / 2, r.top + r.height / 2 ];
    mouseEvent( 'mousedown', target, x0, y0 );
    let last = [ x0, y0 ];
    for ( const [ x, y ] of path ) {
        mouseEvent( 'mousemove', document, x, y );
        last = [ x, y ];
        await wait();
    }
    mouseEvent( 'mouseup', document, ...last );
    await wait();
}

let jqui = false;
function jQueryUI() {
    if ( !jqui ) {
        ( 0, eval )( readFileSync( JQUERY_UI, 'utf8' ) );
        jqui = true;
    }
    return jQuery;
}

const SCENARIOS = {
    'a1 down below a3 (tolerance intersect, steps)': { options: {}, item: 'a1', path: [ [ 100, 130 ], [ 100, 165 ], [ 100, 200 ], [ 100, 225 ] ] },
    'a3 up to the top': { options: {}, item: 'a3', path: [ [ 100, 200 ], [ 100, 160 ], [ 100, 115 ] ] },
    'a1 into L2 between b1 and b2 (pointer)': { options: { tolerance: 'pointer' }, item: 'a1', path: [ [ 150, 130 ], [ 400, 130 ], [ 400, 145 ] ] },
    'a2 into L2 at its end, then back into L1': { options: { tolerance: 'pointer' }, item: 'a2', path: [ [ 150, 170 ], [ 400, 175 ], [ 400, 185 ], [ 100, 115 ] ] },
    'a1 into L2, refused in receive': { options: { tolerance: 'pointer' }, refuse: true, item: 'a1', path: [ [ 150, 130 ], [ 400, 130 ], [ 400, 145 ] ] },
    'a2 into L2, stop calls preventDefault': { options: { tolerance: 'pointer' }, prevent: true, item: 'a2', path: [ [ 150, 170 ], [ 400, 130 ], [ 400, 145 ] ] },
    // jQuery UI measured the items before it hid the item and put in the placeholder, and again only after the first
    // rearrangement; ./dnd's zones called refreshPositions in start for that (refresh). The module measures when it
    // needs to, which is jQuery UI with that refresh.
    'a1 over a2 at once, then dropped outside every list': { options: { tolerance: 'pointer' }, refresh: true, item: 'a1', path: [ [ 150, 130 ], [ 250, 600 ] ] },
};

for ( const [ name, s ] of Object.entries( SCENARIOS ) ) {
    test( 'as jQuery UI 1.14.2: ' + name, { skip: !haveJQueryUI && 'jQuery UI not at ' + JQUERY_UI }, async () => {
        const run = async ( own ) => {
            const { L1, L2 } = twoLists( { sized: true } );
            const trace = [];
            const $ = jQueryUI();
            const extra = {};
            if ( s.refuse ) extra.receive = ( e, ui ) => ( own ? sortable.cancel( ui.sender ) : $( ui.sender ).sortable( 'cancel' ) );
            if ( s.prevent ) extra.stop = ( e ) => e.preventDefault();
            if ( s.refresh && !own ) extra.start = function () { $( this ).sortable( 'refreshPositions' ); };
            // scroll: false for both: happy-dom's window has no height, and jQuery UI would scroll it on every move.
            const options = { connectWith: '.list', placeholder: 'no-placeholder', scroll: false, ...s.options, ...recorder( trace, extra ) };
            if ( own ) sortable.sortable( [ L1, L2 ], options );
            else $( '#L1, #L2' ).sortable( options );
            const item = document.getElementById( s.item );
            if ( own ) await drag( item, s.path );
            else await dragWithMouse( item, s.path );
            const dom = [ ids( L1 ), ids( L2 ) ];
            if ( !own ) $( '#L1, #L2' ).sortable( 'destroy' );
            return { trace: trace.filter( ( t ) => !/^(sort|change) /.test( t ) ), changes: trace.filter( ( t ) => /^change /.test( t ) ).length > 0, dom };
        };
        const theirs = await run( false );
        const ours = await run( true );
        assert.deepEqual( ours.dom, theirs.dom, 'the lists afterwards' );
        assert.deepEqual( ours.trace, theirs.trace, 'the callbacks, in order, with this, item and sender' );
        assert.equal( ours.changes, theirs.changes, 'change fired or not' );
    } );
}

// ---- the editor's callers ----------------------------------------------------------------------------------------

/** core (../core) as far as ./dnd, ./draggable and ./receiver use it; events land in `events`. */
function editorCore( events ) {
    return {
        $: dom,
        trigger: ( name ) => events.push( name ),
        state: { in_mode: () => false },
        g: { layout: { id: 7, blocks: { models: [] } } },
        model_helper: { init_block_from_type: ( type, attrs ) => {
            const model = { attrs, id: null, url: () => '/blocks', save() { events.push( 'save ' + JSON.stringify( attrs ) ); return { then() {} }; } };
            return model;
        } },
        blocks: { create_view: ( identifier ) => ( { $el: dom( '<div id="new" data-block>' + identifier + '</div>' ) } ) },
    };
}

/**
 * The editor's page: the toolbar's block types, zones main (two blocks), side (one), linked (a linked zone), the
 * trash. Views as ./zone, ./block and ./block_type have them: on their elements (el.ngl_view, the layer's data _view).
 */
function editorPage( events, { accept = () => true } = {} ) {
    document.body.innerHTML =
        '<div class="left-panel"><div class="block-items" id="toolbar">' +
        '<div class="add-block-btn" id="t-title">Title</div><div class="add-block-btn" id="t-text">Text</div></div></div>' +
        '<div class="main-content">' +
        [ [ 'main', [ 'm1', 'm2' ] ], [ 'side', [ 's1' ] ], [ 'linked', [ 'l1' ] ] ].map( ( [ zone, blocks ] ) =>
            '<div class="zone-view' + ( zone === 'linked' ? ' linked_zone' : '' ) + '" data-view data-zone="' + zone + '" id="zone-' + zone + '">' +
            '<div class="zone-body" data-receiver id="body-' + zone + '">' +
            blocks.map( ( b ) => '<div data-view data-block id="' + b + '"><div class="block-header"><span class="name">' + b + '</span></div></div>' ).join( '' ) +
            '</div></div>' ).join( '' ) +
        '</div><div id="trash"><div data-trash></div></div>';
    const $ = dom;
    const toolbar = document.getElementById( 'toolbar' );
    layout( { element: toolbar, left: 0, top: 50, width: 100 } );
    [ 'main', 'side', 'linked' ].forEach( ( zone, i ) => layout( { element: document.getElementById( 'body-' + zone ), left: 200, top: 50 + 150 * i, width: 400, height: 120 } ) );
    layout( { element: document.querySelector( '[data-trash]' ), left: 700, top: 400, width: 200, height: 200 } );
    for ( const id of [ 't-title', 't-text' ] ) {
        $( '#' + id ).data( '_view', { model: { class_name: 'block_type', get: () => id.slice( 2 ), is_container: () => false } } );
    }
    const blockModels = {};
    for ( const el of document.querySelectorAll( '[data-block]' ) ) {
        const model = blockModels[ el.id ] = { id: el.id, class_name: 'block', is_container: () => false, is_linked: () => false,
            set( attrs ) { events.push( 'set ' + el.id + ' ' + JSON.stringify( attrs ) ); },
            move( order ) { events.push( 'move ' + el.id + ' ' + order.join( ',' ) ); } };
        const view = { model, $destroy() {
            events.push( 'destroy ' + el.id );
            const handlers = {};
            view.dialog = { cancel: () => handlers.cancel && handlers.cancel() };
            return { on( name, fn ) { handlers[ name ] = fn; return this; } };
        } };
        $( el ).data( '_view', view );
    }
    const zoneViews = {};
    for ( const el of document.querySelectorAll( '[data-zone]' ) ) {
        const zone = el.getAttribute( 'data-zone' );
        zoneViews[ zone ] = { model: { class_name: 'zone', is_inherited: () => false, should_accept: ( model ) => accept( zone, model ) } };
        $( el ).data( '_view', zoneViews[ zone ] );
    }
    return { toolbar, blockModels, zoneViews };
}

function editorModules( events ) {
    const core = editorCore( events );
    const Draggable = load( idOf( './draggable' ) === '135' ? '76' : idOf( './draggable' ), { '../core': core } );
    const Receiver = load( idOf( './receiver' ), { '../core': core } );
    const dnd = load( idOf( './dnd' ), { '../core': core, './draggable': Draggable, './receiver': Receiver, 138: sortable } );
    const view = ( el, extra ) => Object.assign( Object.create( dnd ), { $: ( sel ) => dom( el ).find( sel ) }, extra );
    return { core, dnd, view };
}

function setUpEditor( events, options ) {
    const page = editorPage( events, options );
    const { view } = editorModules( events );
    const toolbarView = view( document.querySelector( '.left-panel' ) );
    toolbarView.setup_dnd_for_blocks();
    for ( const zone of document.querySelectorAll( '[data-zone]' ) ) {
        const v = view( zone, { is_zone: true } );
        v.setup_dnd_for_containers_and_zones();
        v.setup_trash();
    }
    return page;
}

test( 'editor: a block type dragged from the toolbar into a zone becomes a block there; the toolbar keeps the type', async () => {
    const events = [];
    const { toolbar } = setUpEditor( events );
    const title = document.getElementById( 't-title' );
    await drag( title, [ [ 60, 90 ], [ 400, 85 ], [ 400, 92 ] ] );

    assert.deepEqual( ids( document.getElementById( 'body-main' ) ), [ 'm1', 'new', 'm2' ] );
    assert.deepEqual( ids( toolbar ), [ 't-title', 't-text' ], 'a copy of the type stays in the toolbar' );
    assert.ok( document.getElementById( 't-title' ) !== title, 'the copy, not the type dragged' );
    assert.equal( dom( '#t-title' ).data( '_view' ).model.get(), 'title', 'the copy is a block type with its view' );
    const save = events.find( ( e ) => e.startsWith( 'save ' ) );
    assert.ok( save, events.join( ' | ' ) );
    assert.deepEqual( JSON.parse( save.slice( 5 ) ), { block_type: 'title', zone_identifier: 'main', layout_id: 7, parent_position: 1, parent_block_id: null } );
    assert.equal( events[ 0 ], 'sortable:start' );
    assert.equal( events.at( -1 ), 'sortable:end' );
} );

test( 'editor: a zone that does not take the block type, and a linked zone, leave the toolbar as it was', async () => {
    for ( const target of [ 'side', 'linked' ] ) {
        const events = [];
        const { toolbar } = setUpEditor( events, { accept: ( zone ) => zone !== 'side' } );
        const y = target === 'side' ? 240 : 390;
        await drag( document.getElementById( 't-text' ), [ [ 60, 120 ], [ 400, y - 5 ], [ 400, y ] ] );
        assert.deepEqual( ids( toolbar ), [ 't-title', 't-text' ], target );
        assert.equal( document.querySelectorAll( '.add-block-btn' ).length, 2, target + ': no copy left over' );
        assert.ok( !document.getElementById( 'new' ), target );
        assert.ok( !events.some( ( e ) => e.startsWith( 'save ' ) ), target );
        assert.equal( events.at( -1 ), 'sortable:end' );
    }
} );

test( 'editor: a block moved into another zone is saved with its position and the new order', async () => {
    const events = [];
    setUpEditor( events );
    await drag( document.querySelector( '#m1 .block-header' ), [ [ 400, 80 ], [ 400, 215 ], [ 400, 236 ] ], { hold: 160 } );
    assert.deepEqual( ids( document.getElementById( 'body-side' ) ), [ 's1', 'm1' ] );
    assert.deepEqual( events.filter( ( e ) => !e.startsWith( 'sortable:' ) ), [
        'set m1 {"parent_position":1,"zone_identifier":"side"}', 'move m1 s1,m1' ] );
    assert.deepEqual( [ events[ 0 ], events.at( -1 ) ], [ 'sortable:start', 'sortable:end' ] );
} );

test( 'editor: a block moved within its zone is saved; a press without the 150ms hold or 20px is no move', async () => {
    const events = [];
    setUpEditor( events );
    await drag( document.querySelector( '#m1 .block-header' ), [ [ 400, 140 ] ] );
    assert.deepEqual( events, [] );
    await drag( document.querySelector( '#m1 .block-header' ), [ [ 400, 80 ], [ 400, 125 ] ], { hold: 160 } );
    assert.deepEqual( ids( document.getElementById( 'body-main' ) ), [ 'm2', 'm1' ] );
    assert.ok( events.includes( 'move m1 m2,m1' ), events.join( ' | ' ) );
} );

test( 'editor: a block dropped on the trash asks; cancelling the dialog puts it back, nothing saved', async () => {
    const events = [];
    setUpEditor( events );
    const m2 = document.getElementById( 'm2' );
    await drag( m2.querySelector( '.block-header' ), [ [ 400, 120 ], [ 800, 480 ], [ 800, 500 ] ], { hold: 160 } );
    assert.ok( m2.parentNode === document.querySelector( '[data-trash]' ), 'the block waits in the trash' );
    assert.ok( events.includes( 'destroy m2' ) );
    assert.ok( !events.some( ( e ) => /^(set|move) /.test( e ) ), events.join( ' | ' ) );
    dom( m2 ).data( '_view' ).dialog.cancel();
    assert.deepEqual( ids( document.getElementById( 'body-main' ) ), [ 'm1', 'm2' ] );
} );

test( 'editor: Escape during a block\'s move puts it back, saves nothing and ends the sorting state', async () => {
    const events = [];
    setUpEditor( events );
    await drag( document.querySelector( '#m1 .block-header' ), [ [ 400, 80 ], [ 400, 215 ], [ 400, 236 ] ], { hold: 160, release: false } );
    escape();
    pointer( 'pointerup', document.body, 400, 236 );
    assert.deepEqual( ids( document.getElementById( 'body-main' ) ), [ 'm1', 'm2' ] );
    assert.deepEqual( ids( document.getElementById( 'body-side' ) ), [ 's1' ] );
    assert.deepEqual( events, [ 'sortable:start', 'sortable:end' ] );
    assert.deepEqual( found( '.forbidden, .ui-sortable-helper, .no-placeholder' ), [] );
} );

/** ./bm_collection_items with a collection of `type`: items 0-3 at positions offset + i. */
function collection( type, events ) {
    document.body.innerHTML = '<div id="block"><div class="bm-items"></div></div>';
    const list = document.querySelector( '.bm-items' );
    for ( let i = 0; i < 4; i++ ) {
        list.insertAdjacentHTML( 'beforeend', '<div id="c' + i + '" class="collection-item ' + ( i === 2 && type === 'dynamic' ? 'dynamic-item' : 'manual-item' ) + '">' +
            '<div class="item-panel" id="ip' + i + '"><div class="handle">=</div><span class="name">' + i + '</span></div></div>' );
        const el = document.getElementById( 'c' + i );
        dom( el ).data( '_view', { model: { get: ( k ) => ( { position: 10 + i, is_dynamic: i === 2 && type === 'dynamic' }[ k ] ) },
            $move: ( to, via ) => events.push( 'move c' + i + ' ' + to + ( via ? ' ' + via : '' ) ) } );
        document.getElementById( 'ip' + i ).__rect = [ 0, 100 + 40 * i, 200, 40 ];
    }
    layout( { element: list, left: 0, top: 100, width: 200 } );
    const core = { $: dom, View: { extend: ( proto ) => proto } };
    const Items = load( idOf( './bm_collection_items' ), { '../core': core, './bm_collection_item': {}, 135: dd, 138: sortable } );
    const model = { get: ( k ) => ( { loading: false, collection_type: type, offset: 10 }[ k ] ) };
    const view = Object.assign( Object.create( Items ), { bm_collection_model: model, $: ( sel ) => dom( document.getElementById( 'block' ) ).find( sel ) } );
    view.setup_dnd();
    return list;
}

test( 'editor: an item of a manual collection dragged to another place moves to that position', async () => {
    const events = [];
    const list = collection( 'manual', events );
    assert.ok( document.querySelector( '#c0 .handle' ).classList.contains( 'ui-sortable-handle' ) );
    await drag( document.querySelector( '#c0 .handle' ), [ [ 50, 165 ], [ 50, 205 ] ], { from: [ 50, 120 ], hold: 160 } );
    assert.deepEqual( ids( list ), [ 'c1', 'c2', 'c0', 'c3' ] );
    assert.deepEqual( events, [ 'move c0 12 move_manual' ] );
} );

test( 'editor: an item of a manual collection with an offset put back where it was is not moved', async () => {
    const events = [];
    const list = collection( 'manual', events );
    // moved, then Escape: the item goes back, and the stop that follows must not move it to its own place
    await drag( document.querySelector( '#c1 .handle' ), [ [ 50, 205 ], [ 50, 245 ] ], { from: [ 50, 160 ], hold: 160, release: false } );
    escape();
    pointer( 'pointerup', document.body, 50, 245 );
    await wait();
    assert.deepEqual( ids( list ), [ 'c0', 'c1', 'c2', 'c3' ] );
    assert.deepEqual( events, [], 'position 11 is index 1 plus the offset 10' );
} );

test( 'editor: a manual item of a dynamic collection dropped on another slot moves there; dropped nowhere, the preview goes', async () => {
    let events = [];
    let list = collection( 'dynamic', events );
    const panel = document.getElementById( 'ip0' );
    await drag( panel.querySelector( '.handle' ), [ [ 50, 150 ], [ 50, 225 ] ], { from: [ 50, 120 ], hold: 160, release: false } );
    assert.ok( list.querySelector( '.collection-item.sorting' ), 'activeClass "sorting" while dragging' );
    assert.ok( document.getElementById( 'c3' ).classList.contains( 'highlight' ), 'hoverClass "highlight" on the slot under the helper' );
    assert.ok( list.querySelector( '.cloned-manual' ), 'the preview of the new order' );
    pointer( 'pointerup', document.body, 50, 225 );
    await wait();
    assert.deepEqual( events, [ 'move c0 13' ] );
    assert.ok( !panel.isConnected, 'the panel dragged is removed until the collection is drawn again' );
    // The preview copies keep the classes they were copied with until the collection is drawn again (as with jQuery UI).
    assert.deepEqual( found( '.collection-item:not(.cloned-manual):is(.sorting, .highlight, .start-item), .ui-draggable-dragging', list ), [] );

    events = [];
    list = collection( 'dynamic', events );
    await drag( document.querySelector( '#ip0 .handle' ), [ [ 50, 150 ], [ 50, 225 ] ], { from: [ 50, 120 ], hold: 160, release: false } );
    escape();
    pointer( 'pointerup', document.body, 50, 225 );
    assert.deepEqual( events, [] );
    assert.deepEqual( found( '.cloned-manual, .sorting-hidden, .sorting, .highlight, .start-item', list ), [] );
    assert.deepEqual( ids( list ), [ 'c0', 'c1', 'c2', 'c3' ] );
} );
