/**
 * Moving blocks, block types and collection items with the keyboard (design/standard/javascript/netgen-layouts.js,
 * module 139 ./widget, with the keyboard entries of module 138 jquery-ui/sortable and 135 jquery-ui/draggable;
 * patches in src/app-patches/modules/).
 *
 * The modules run from the bundle itself, with the editor's callers (./dnd, ./draggable, ./receiver,
 * ./bm_collection_items) on a page as the editor draws it. Each move is also made with the pointer on the same page
 * (the geometry mock of dnd.test.mjs), and both must end in the same calls of the models, in the same order: a move
 * by keyboard is saved exactly as one by pointer.
 *
 * Run: npm ci && npm test (in extension/explayouts_ui_api)
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { parseBundle } from '../../src/app-patches/bundle.mjs';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const parsed = parseBundle( readFileSync( resolve( root, 'design/standard/javascript/netgen-layouts.js' ), 'utf8' ) );

let jQuery, mouse, kbd, sortable, dd;

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

// ---- geometry (as in dnd.test.mjs) -------------------------------------------------------------------------------

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
        return rect( l.left, l.top, l.width, Math.max( l.height || 0, h ) );
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

function layout( ...specs ) {
    for ( const s of specs ) lists.set( s.element, s );
}

// ---- gestures ----------------------------------------------------------------------------------------------------

let pointerId = 1;

function pointer( type, target, x, y ) {
    const ev = new PointerEvent( type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId,
        pointerType: 'mouse', isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 } );
    target.dispatchEvent( ev );
    return ev;
}

async function drag( target, path, { from, hold = 0 } = {} ) {
    pointerId++;
    const r = boxOf( target );
    const [ x0, y0 ] = from || [ r.left + r.width / 2, r.top + r.height / 2 ];
    pointer( 'pointerdown', target, x0, y0 );
    if ( hold ) await wait( hold );
    let last = [ x0, y0 ];
    for ( const [ x, y ] of path ) {
        pointer( 'pointermove', document.body, x, y );
        last = [ x, y ];
        await wait();
    }
    pointer( 'pointerup', document.body, ...last );
    await wait();
}

/** Presses `keys` on the element with the focus, one after the other ("Alt+ArrowDown" for a modifier). */
function press( ...keys ) {
    for ( const k of keys ) {
        const alt = k.startsWith( 'Alt+' );
        const key = alt ? k.slice( 4 ) : k;
        const target = document.activeElement || document.body;
        target.dispatchEvent( new KeyboardEvent( 'keydown', { key, altKey: alt, bubbles: true, cancelable: true } ) );
    }
}

const ids = ( el ) => [ ...el.children ].filter( ( c ) => c.style.display !== 'none' ).map( ( c ) => c.id || c.className );
const live = () => ( document.querySelector( '.exp-kbd-sr[aria-live]' )?.textContent || '' ).replace( / $/, '' );
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
    // A browser's querySelectorAll throws on jQuery's own selectors (":first"), and jQuery then reads them itself.
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
    // nglT / nglTh as the bundle's header defines them
    ( 0, eval )( readFileSync( resolve( root, 'src/app-patches/header.js' ), 'utf8' ) );
    const { jQueryFactory } = await import( 'jquery/factory' );
    jQuery = jQueryFactory( window );
    window.jQuery = globalThis.jQuery = jQuery;
    mouse = load( idOf( './mouse' ) );
    kbd = load( idOf( './widget' ) );
    sortable = load( idOf( 'jquery-ui/sortable' ), { './mouse': mouse, './core': {}, './widget': kbd } );
    dd = load( idOf( 'jquery-ui/draggable' ), { './mouse': mouse, './core': {}, './widget': kbd } );
} );

after( async () => {
    await GlobalRegistrator.unregister();
} );

beforeEach( () => {
    if ( document.activeElement && document.activeElement !== document.body ) document.activeElement.blur();
    document.body.dispatchEvent( new KeyboardEvent( 'keydown', { key: 'Escape', bubbles: true } ) );
    lists.clear();
    delete window.explayoutsSpaI18n;
    document.body.innerHTML = '';
} );

// ---- the editor's page -------------------------------------------------------------------------------------------

function editorCore( events ) {
    return {
        $: jQuery,
        trigger: ( name ) => events.push( name ),
        state: { in_mode: () => false },
        g: { layout: { id: 7, blocks: { models: [] } } },
        model_helper: { init_block_from_type: ( type, attrs ) => {
            const model = { attrs, id: null, url: () => '/blocks', save() { events.push( 'save ' + JSON.stringify( attrs ) ); return { then() {} }; } };
            return model;
        } },
        blocks: { create_view: ( identifier, model ) => {
            const $el = jQuery( '<div id="new" data-view data-block><div class="block-header"><div class="handle">=</div><div class="name">' + identifier + '</div></div></div>' );
            const view = { $el, model };
            $el.data( '_view', view );
            $el[ 0 ].ngl_view = view;
            return view;
        } },
    };
}

/** Sets the view of `el` as module 21 does: jQuery data _view and the element's ngl_view. */
function view( el, v ) {
    jQuery( el ).data( '_view', v );
    el.ngl_view = v;
    return v;
}

const ZONES = [ [ 'main', [ 'm1', 'm2' ] ], [ 'side', [ 's1' ] ], [ 'linked', [ 'l1' ] ], [ 'extra', [ 'x1' ] ] ];

/**
 * The toolbar's block types (Title, Text), zones main (m1 m2), side (s1), linked (a linked zone, l1), extra (x1),
 * the trash; ./dnd set up on them as the editor does. accept( zone, model ): the zone model's should_accept.
 */
function editor( events, { accept = () => true } = {} ) {
    document.body.innerHTML =
        '<button type="button" class="button js-open" data-target="blocks">+</button>' +
        '<div class="left-panel"><div class="block-items" id="toolbar">' +
        '<div class="add-block-btn" id="t-title"><span class="title">Title</span></div><div class="add-block-btn" id="t-text"><span class="title">Text</span></div></div></div>' +
        '<div class="main-content">' +
        ZONES.map( ( [ zone, blocks ] ) =>
            '<div class="zone-view' + ( zone === 'linked' ? ' linked_zone' : '' ) + '" data-view data-zone="' + zone + '" id="zone-' + zone + '">' +
            '<div class="zone-body" data-receiver id="body-' + zone + '">' +
            blocks.map( ( b ) => '<div data-view data-block id="' + b + '"><div class="block-header"><div class="handle" title="Move block">=</div><div class="name">' + b + '<span class="ai">#css</span></div></div></div>' ).join( '' ) +
            '</div></div>' ).join( '' ) +
        '</div><div id="trash"><div data-trash></div></div>';
    const toolbar = document.getElementById( 'toolbar' );
    layout( { element: toolbar, left: 0, top: 50, width: 100 } );
    ZONES.forEach( ( [ zone ], i ) => layout( { element: document.getElementById( 'body-' + zone ), left: 200, top: 50 + 150 * i, width: 400, height: 120 } ) );
    layout( { element: document.querySelector( '[data-trash]' ), left: 700, top: 400, width: 200, height: 200 } );
    for ( const id of [ 't-title', 't-text' ] ) {
        view( document.getElementById( id ), { model: { class_name: 'block_type', get: () => id.slice( 2 ), is_container: () => false } } );
    }
    for ( const el of document.querySelectorAll( '[data-block]' ) ) {
        const model = { id: el.id, class_name: 'block', is_container: () => false, is_linked: () => false,
            set( attrs ) { events.push( 'set ' + el.id + ' ' + JSON.stringify( attrs ) ); },
            move( order ) { events.push( 'move ' + el.id + ' ' + order.join( ',' ) ); },
            move_to_container( zone, container ) { events.push( 'move_to_container ' + el.id + ' ' + zone.join( ',' ) + ' / ' + container.join( ',' ) ); } };
        view( el, { model } );
    }
    for ( const el of document.querySelectorAll( '[data-zone]' ) ) {
        const zone = el.getAttribute( 'data-zone' );
        view( el, { model: { class_name: 'zone', get: ( k ) => ( k === 'name' ? zone.toUpperCase() : undefined ),
            is_inherited: () => false, should_accept: ( model ) => accept( zone, model ) } } );
    }
    const core = editorCore( events );
    const Draggable = load( idOf( './draggable' ) === '135' ? '76' : idOf( './draggable' ), { '../core': core } );
    const Receiver = load( idOf( './receiver' ), { '../core': core } );
    const dnd = load( idOf( './dnd' ), { '../core': core, './draggable': Draggable, './receiver': Receiver, 138: sortable } );
    const v = ( el, extra ) => Object.assign( Object.create( dnd ), { $: ( sel ) => jQuery( el ).find( sel ) }, extra );
    v( document.querySelector( '.left-panel' ) ).setup_dnd_for_blocks();
    for ( const zone of document.querySelectorAll( '[data-zone]' ) ) {
        const z = v( zone, { is_zone: true } );
        z.setup_dnd_for_containers_and_zones();
        z.setup_trash();
    }
    return { toolbar };
}

const grip = ( id ) => document.querySelector( '#' + id + ' > .block-header > .handle' );
const body = ( zone ) => ids( document.getElementById( 'body-' + zone ) );
const saves = ( events ) => events.filter( ( e ) => !e.startsWith( 'sortable:' ) );

// ---- the grips ---------------------------------------------------------------------------------------------------

test( 'the grips are buttons with a name and the hint: block handles, block types, not the trash', async () => {
    editor( [] );
    const g = grip( 'm1' );
    assert.equal( g.getAttribute( 'role' ), 'button' );
    assert.equal( g.tabIndex, 0 );
    assert.equal( g.getAttribute( 'aria-label' ), 'Move block m1', 'the name without the css id and class' );
    const hint = document.getElementById( g.getAttribute( 'aria-describedby' ) );
    assert.ok( hint && /Space or Enter picks it up/.test( hint.textContent ) );
    const t = document.getElementById( 't-title' );
    assert.deepEqual( [ t.getAttribute( 'role' ), t.tabIndex, t.getAttribute( 'aria-label' ) ], [ 'button', 0, 'Add block Title' ] );
    assert.ok( !document.querySelector( '.block-header.exp-kbd-grip' ), 'the handle is the grip, not the whole header' );

    // a block drawn again gets its grip back
    document.querySelector( '#m2 > .block-header' ).outerHTML = '<div class="block-header"><div class="handle">=</div><div class="name">m2 new</div></div>';
    await wait();
    assert.equal( grip( 'm2' ).getAttribute( 'aria-label' ), 'Move block m2 new' );
    assert.equal( grip( 'm2' ).tabIndex, 0 );
} );

test( 'keyAction: admin4\'s keys', () => {
    const k = ( grabbed, key, mods = {} ) => kbd.keyAction( grabbed, { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods } );
    assert.equal( k( false, ' ' ), 'pickup' );
    assert.equal( k( false, 'Enter' ), 'pickup' );
    assert.equal( k( false, 'ArrowDown' ), null );
    assert.equal( k( false, 'ArrowUp', { altKey: true } ), 'stepUp' );
    assert.equal( k( false, 'ArrowDown', { altKey: true } ), 'stepDown' );
    assert.equal( k( false, ' ', { ctrlKey: true } ), null );
    assert.deepEqual( [ 'ArrowUp', 'ArrowDown', 'Home', 'End', ' ', 'Enter', 'Escape', 'Tab' ].map( ( key ) => k( true, key ) ),
        [ 'up', 'down', 'first', 'last', 'drop', 'drop', 'cancel', null ] );
    assert.equal( k( true, 'ArrowDown', { shiftKey: true } ), null );
} );

// ---- blocks ------------------------------------------------------------------------------------------------------

test( 'a block moved within its zone: picked up, moved, dropped; saved as the pointer saves it; the grip keeps the focus', async () => {
    const pointerEvents = [];
    editor( pointerEvents );
    await drag( document.querySelector( '#m1 .block-header' ), [ [ 400, 80 ], [ 400, 125 ] ], { hold: 160 } );
    assert.deepEqual( body( 'main' ), [ 'm2', 'm1' ] );

    const events = [];
    editor( events );
    grip( 'm1' ).focus();
    press( ' ' );
    assert.equal( live(), 'Picked up m1. Zone MAIN, position 1 of 2. Use the arrow keys to move, Space to drop, Escape to cancel.' );
    assert.equal( grip( 'm1' ).getAttribute( 'aria-pressed' ), 'true' );
    assert.ok( document.getElementById( 'm1' ).classList.contains( 'exp-kbd-grabbed' ) );
    press( 'ArrowDown' );
    assert.deepEqual( body( 'main' ), [ 'm2', 'm1' ] );
    assert.equal( live(), 'Zone MAIN, position 2 of 2.' );
    assert.equal( document.activeElement, grip( 'm1' ) );
    press( ' ' );
    assert.equal( live(), 'Dropped m1 in zone MAIN at position 2.' );
    assert.deepEqual( events, pointerEvents, 'the same calls in the same order as the pointer\'s' );
    assert.deepEqual( saves( events ), [ 'set m1 {"parent_position":1,"zone_identifier":"main"}', 'move m1 m2,m1' ] );
    assert.equal( document.activeElement, grip( 'm1' ) );
    assert.ok( !grip( 'm1' ).hasAttribute( 'aria-pressed' ) );
    assert.deepEqual( found( '.exp-kbd-grabbed, .ui-sortable-helper, .ui-sortable-placeholder, .forbidden' ), [] );
} );

test( 'a block moved into the next zone at the edge of its own; saved as the pointer saves it', async () => {
    const pointerEvents = [];
    editor( pointerEvents );
    await drag( document.querySelector( '#m1 .block-header' ), [ [ 400, 80 ], [ 400, 215 ], [ 400, 236 ] ], { hold: 160 } );
    assert.deepEqual( body( 'side' ), [ 's1', 'm1' ] );

    const events = [];
    editor( events );
    grip( 'm1' ).focus();
    press( ' ', 'ArrowDown', 'ArrowDown' );
    assert.deepEqual( body( 'side' ), [ 'm1', 's1' ] );
    assert.equal( live(), 'Zone SIDE, position 1 of 2.' );
    assert.equal( document.activeElement, grip( 'm1' ), 'the grip keeps the focus when the block changes zone' );
    press( 'ArrowDown', 'Enter' );
    assert.deepEqual( body( 'main' ), [ 'm2' ] );
    assert.deepEqual( body( 'side' ), [ 's1', 'm1' ] );
    assert.equal( live(), 'Dropped m1 in zone SIDE at position 2.' );
    assert.deepEqual( events, pointerEvents );
    assert.deepEqual( saves( events ), [ 'set m1 {"parent_position":1,"zone_identifier":"side"}', 'move m1 s1,m1' ] );
    assert.equal( document.activeElement, grip( 'm1' ) );
} );

test( 'linked zones and zones that refuse are skipped, and said; up from a zone\'s top goes to the end of the one before', async () => {
    const events = [];
    editor( events, { accept: ( zone ) => zone !== 'side' } );
    grip( 'm2' ).focus();
    press( ' ', 'ArrowDown' );
    assert.deepEqual( body( 'extra' ), [ 'm2', 'x1' ], 'side refuses, linked is linked: into extra' );
    assert.equal( live(), 'This zone does not accept m2. Zone EXTRA, position 1 of 2.' );
    press( 'ArrowDown', 'ArrowDown' );
    assert.deepEqual( body( 'extra' ), [ 'x1', 'm2' ], 'the last place of the last zone: it stays' );
    assert.equal( live(), 'Zone EXTRA, position 2 of 2.' );
    press( 'Home', 'ArrowUp' );
    assert.deepEqual( body( 'main' ), [ 'm1', 'm2' ], 'back to the end of main' );
    assert.equal( live(), 'This zone does not accept m2. Zone MAIN, position 2 of 2.' );
    press( 'Escape' );
    assert.deepEqual( saves( events ), [] );
} );

test( 'Home and End: the first and last place of the zone; Alt+ArrowUp/Down move one place at once and save', async () => {
    let events = [];
    editor( events );
    grip( 'm2' ).focus();
    press( ' ', 'Home' );
    assert.deepEqual( body( 'main' ), [ 'm2', 'm1' ] );
    assert.equal( live(), 'Zone MAIN, position 1 of 2.' );
    press( 'End' );
    assert.deepEqual( body( 'main' ), [ 'm1', 'm2' ] );
    press( 'Escape' );

    events = [];
    editor( events );
    grip( 'm1' ).focus();
    press( 'Alt+ArrowDown' );
    assert.deepEqual( body( 'main' ), [ 'm2', 'm1' ] );
    assert.deepEqual( saves( events ), [ 'set m1 {"parent_position":1,"zone_identifier":"main"}', 'move m1 m2,m1' ] );
    assert.equal( live(), 'Dropped m1 in zone MAIN at position 2.' );
    assert.equal( document.activeElement, grip( 'm1' ) );
    press( 'Alt+ArrowDown' );
    assert.deepEqual( body( 'side' ), [ 'm1', 's1' ], 'at the edge into the next zone' );
    assert.equal( events.filter( ( e ) => e.startsWith( 'move ' ) ).length, 2 );
    assert.equal( events.at( -1 ), 'sortable:end' );
    press( 'Alt+ArrowUp' );
    assert.deepEqual( body( 'main' ), [ 'm2', 'm1' ] );
} );

test( 'Escape and leaving the grip put the block back, nothing saved; Escape keeps the focus on the grip', async () => {
    const events = [];
    editor( events );
    grip( 'm1' ).focus();
    press( ' ', 'ArrowDown', 'ArrowDown' );
    assert.deepEqual( body( 'side' ), [ 'm1', 's1' ] );
    press( 'Escape' );
    assert.deepEqual( body( 'main' ), [ 'm1', 'm2' ] );
    assert.deepEqual( body( 'side' ), [ 's1' ] );
    assert.equal( live(), 'Move cancelled.' );
    assert.equal( document.activeElement, grip( 'm1' ) );
    assert.deepEqual( events, [ 'sortable:start', 'sortable:end' ] );

    press( ' ', 'ArrowDown', 'ArrowDown' );
    grip( 's1' ).focus();   // Tab, a click elsewhere
    assert.deepEqual( body( 'main' ), [ 'm1', 'm2' ] );
    assert.deepEqual( body( 'side' ), [ 's1' ] );
    assert.equal( live(), 'Move cancelled.' );
    assert.equal( document.activeElement, grip( 's1' ), 'the focus stays where it went' );
    assert.deepEqual( saves( events ), [] );
    assert.deepEqual( found( '.exp-kbd-grabbed, .ui-sortable-helper, .ui-sortable-placeholder, [aria-pressed]' ), [] );
} );

test( 'announcements are translated through nglT', async () => {
    window.explayoutsSpaI18n = {
        'Picked up %name. Zone %zone, position %position of %count. Use the arrow keys to move, Space to drop, Escape to cancel.':
            '%name aufgenommen. Zone %zone, Position %position von %count. Mit den Pfeiltasten verschieben, mit der Leertaste ablegen, mit Escape abbrechen.',
        'Move block %name': 'Block %name verschieben',
    };
    editor( [] );
    assert.equal( grip( 'm1' ).getAttribute( 'aria-label' ), 'Block m1 verschieben' );
    grip( 'm1' ).focus();
    press( ' ' );
    assert.equal( live(), 'm1 aufgenommen. Zone MAIN, Position 1 von 2. Mit den Pfeiltasten verschieben, mit der Leertaste ablegen, mit Escape abbrechen.' );
    assert.equal( document.querySelectorAll( '[aria-live]' ).length, 1, 'one live region' );
    press( 'Escape' );
} );

test( 'a container block\'s placeholder takes a block, not another container block (as ./dnd\'s check_containers)', async () => {
    const events = [];
    editor( events );
    // m2 becomes a container block with one placeholder, set up as ./block sets it up (a view that is not a zone)
    const k = document.getElementById( 'm2' );
    k.setAttribute( 'data-container', '' );
    k.insertAdjacentHTML( 'beforeend', '<div class="column-placeholder" data-placeholder="left" data-receiver id="ph-left"></div>' );
    k.ngl_view.model.is_container = () => true;
    layout( { element: document.getElementById( 'ph-left' ), left: 220, top: 140, width: 300, height: 30 } );
    const core = editorCore( events );
    const dnd = load( idOf( './dnd' ), { '../core': core, './draggable': load( '76', { '../core': core } ), './receiver': load( idOf( './receiver' ), { '../core': core } ), 138: sortable } );
    Object.assign( Object.create( dnd ), { $: ( sel ) => jQuery( k ).find( sel ) } ).setup_dnd_for_containers_and_zones();
    await wait();

    grip( 'm1' ).focus();
    press( ' ', 'ArrowDown' );
    assert.deepEqual( body( 'main' ), [ 'm2', 'm1' ] );
    press( 'ArrowDown' );
    assert.deepEqual( ids( document.getElementById( 'ph-left' ) ), [ 'm1' ], 'into the placeholder after the container' );
    assert.equal( live(), 'Zone MAIN \u203a m2, position 1 of 1.' );
    press( ' ' );
    assert.deepEqual( saves( events ), [ 'set m1 {"parent_position":0,"zone_identifier":"main","parent_placeholder":"left","parent_block_id":"m2"}', 'move_to_container m1 m2 / m1' ] );

    // a container block (s1 made one) skips the placeholder
    const s1 = document.getElementById( 's1' );
    s1.setAttribute( 'data-container', '' );
    s1.ngl_view.model.is_container = () => true;
    events.length = 0;
    grip( 's1' ).focus();
    press( ' ', 'ArrowUp' );
    assert.deepEqual( body( 'main' ), [ 'm2', 's1' ], 'past the placeholder, at the end of main' );
    assert.equal( live(), 'This zone does not accept s1. Zone MAIN, position 2 of 2.' );
    press( 'Escape' );
    assert.deepEqual( saves( events ), [] );
} );

test( 'the page follows the item: smoothly, or at once when the browser asks for reduced motion', async () => {
    editor( [] );
    const calls = [];
    const original = window.Element.prototype.scrollIntoView;
    const matchMedia = window.matchMedia;
    window.Element.prototype.scrollIntoView = function ( o ) { calls.push( this.id + ' ' + o.behavior + ' ' + o.block ); };
    try {
        grip( 'm1' ).focus();
        press( ' ', 'ArrowDown' );
        window.matchMedia = ( q ) => ( { matches: q === '(prefers-reduced-motion: reduce)' } );
        press( 'ArrowDown', 'Escape' );
    } finally {
        window.Element.prototype.scrollIntoView = original;
        window.matchMedia = matchMedia;
    }
    assert.deepEqual( calls, [ 'm1 smooth nearest', 'm1 auto nearest' ] );
} );

// ---- block types from the toolbar --------------------------------------------------------------------------------

test( 'a block type from the toolbar: into the first zone that takes it, moved, dropped: a new block, saved as by pointer', async () => {
    const pointerEvents = [];
    editor( pointerEvents );
    await drag( document.getElementById( 't-title' ), [ [ 60, 90 ], [ 400, 85 ], [ 400, 92 ] ] );
    assert.deepEqual( body( 'main' ), [ 'm1', 'new', 'm2' ] );

    const events = [];
    const { toolbar } = editor( events, { accept: ( zone ) => zone !== 'main' } );
    document.getElementById( 't-title' ).focus();
    press( 'Enter' );
    assert.deepEqual( body( 'side' ), [ 't-title', 's1' ], 'main refuses: the first place of side' );
    assert.equal( live(), 'Picked up Title. Zone SIDE, position 1 of 2. Use the arrow keys to move, Space to drop, Escape to cancel.' );
    assert.equal( document.activeElement.id, 't-title' );
    assert.deepEqual( ids( toolbar ), [ 't-title', 't-text' ], 'a copy of the type waits in the toolbar' );
    press( 'Escape' );
    assert.deepEqual( ids( toolbar ), [ 't-title', 't-text' ] );
    assert.equal( document.querySelectorAll( '.add-block-btn' ).length, 2, 'no copy left over' );
    assert.deepEqual( body( 'side' ), [ 's1' ] );
    assert.equal( document.activeElement, document.querySelector( '.js-open' ), 'back to the toolbar\'s button' );
    assert.deepEqual( saves( events ), [] );

    // the same place as the pointer's: main, between m1 and m2
    events.length = 0;
    editor( events );
    document.getElementById( 't-title' ).focus();
    press( ' ', 'ArrowDown' );
    assert.deepEqual( body( 'main' ), [ 'm1', 't-title', 'm2' ] );
    press( ' ' );
    assert.deepEqual( body( 'main' ), [ 'm1', 'new', 'm2' ] );
    assert.equal( live(), 'Dropped Title in zone MAIN at position 2.' );
    assert.deepEqual( events, pointerEvents );
    assert.deepEqual( JSON.parse( saves( events )[ 0 ].slice( 5 ) ), { block_type: 'title', zone_identifier: 'main', layout_id: 7, parent_position: 1, parent_block_id: null } );
    assert.deepEqual( ids( document.getElementById( 'toolbar' ) ), [ 't-title', 't-text' ], 'the toolbar keeps the type' );
    assert.equal( document.activeElement, document.querySelector( '#new .handle' ), 'the new block\'s grip has the focus' );
} );

test( 'a block type no zone takes stays in the toolbar', async () => {
    const events = [];
    editor( events, { accept: () => false } );
    document.getElementById( 't-text' ).focus();
    press( ' ' );
    assert.equal( live(), 'No zone accepts Text.' );
    assert.deepEqual( ids( document.getElementById( 'toolbar' ) ), [ 't-title', 't-text' ] );
    assert.deepEqual( saves( events ), [] );
} );

// ---- collection items --------------------------------------------------------------------------------------------

/** ./bm_collection_items with a collection of `type`: items 0-3 at positions offset + i (as in dnd.test.mjs). */
function collection( type, events ) {
    document.body.innerHTML = '<div id="block"><div class="bm-items"></div></div>';
    const list = document.querySelector( '.bm-items' );
    for ( let i = 0; i < 4; i++ ) {
        const dynamic = i === 2 && type === 'dynamic';
        list.insertAdjacentHTML( 'beforeend', '<div id="c' + i + '" class="collection-item ' + ( dynamic ? 'dynamic-item' : 'manual-item' ) + '">' +
            '<div class="item-panel" id="ip' + i + '">' + ( dynamic ? '' : '<div class="handle">=</div>' ) + '<p class="name">Item ' + i + '</p></div></div>' );
        const el = document.getElementById( 'c' + i );
        view( el, { model: { id: 'i' + i, get: ( k ) => ( { position: 10 + i, is_dynamic: dynamic }[ k ] ) },
            $move: ( to, via ) => events.push( 'move c' + i + ' ' + to + ( via ? ' ' + via : '' ) ) } );
        document.getElementById( 'ip' + i ).__rect = [ 0, 100 + 40 * i, 200, 40 ];
    }
    layout( { element: list, left: 0, top: 100, width: 200 } );
    const core = { $: jQuery, View: { extend: ( proto ) => proto } };
    const Items = load( idOf( './bm_collection_items' ), { '../core': core, './bm_collection_item': {}, 135: dd, 138: sortable } );
    const model = { get: ( k ) => ( { loading: false, collection_type: type, offset: 10 }[ k ] ) };
    const v = Object.assign( Object.create( Items ), { bm_collection_model: model, $: ( sel ) => jQuery( document.getElementById( 'block' ) ).find( sel ) } );
    v.setup_dnd();
    return list;
}

const handle = ( i ) => document.querySelector( '#c' + i + ' .handle' );

test( 'an item of a manual collection: moved by keyboard as by pointer, "Set position" untouched', async () => {
    const pointerEvents = [];
    let list = collection( 'manual', pointerEvents );
    await drag( handle( 0 ), [ [ 50, 165 ], [ 50, 205 ] ], { from: [ 50, 120 ], hold: 160 } );
    assert.deepEqual( ids( list ), [ 'c1', 'c2', 'c0', 'c3' ] );

    const events = [];
    list = collection( 'manual', events );
    assert.equal( handle( 0 ).getAttribute( 'aria-label' ), 'Move item Item 0' );
    handle( 0 ).focus();
    press( ' ' );
    assert.equal( live(), 'Picked up Item 0. Position 1 of 4. Use the arrow keys to move, Space to drop, Escape to cancel.' );
    press( 'ArrowDown', 'ArrowDown' );
    assert.equal( live(), 'Position 3 of 4.' );
    assert.equal( document.activeElement, handle( 0 ) );
    press( ' ' );
    assert.deepEqual( ids( list ), [ 'c1', 'c2', 'c0', 'c3' ] );
    assert.equal( live(), 'Dropped Item 0 at position 3.' );
    assert.deepEqual( events, pointerEvents );
    assert.deepEqual( events, [ 'move c0 12 move_manual' ] );

    // Escape: everything back. The stop callback runs as after Escape with the pointer, and an item put back in its
    // place (the collection's offset is 10 here) is not sent as moved.
    events.length = 0;
    handle( 3 ).focus();
    press( ' ', 'Home', 'Escape' );
    assert.deepEqual( ids( list ), [ 'c1', 'c2', 'c0', 'c3' ] );
    pointerEvents.length = 0;
    collection( 'manual', pointerEvents );
    pointer( 'pointerdown', handle( 3 ), 50, 240 );
    await wait( 160 );
    pointer( 'pointermove', document.body, 50, 120 );
    document.body.dispatchEvent( new KeyboardEvent( 'keydown', { key: 'Escape', bubbles: true, cancelable: true } ) );
    pointer( 'pointerup', document.body, 50, 120 );
    assert.deepEqual( events, pointerEvents );
    assert.deepEqual( events, [] );
} );

test( 'a manual item of a dynamic collection: another slot chosen with the keys, dropped as by pointer; Escape leaves no trace', async () => {
    const pointerEvents = [];
    collection( 'dynamic', pointerEvents );
    await drag( document.querySelector( '#ip0 .handle' ), [ [ 50, 150 ], [ 50, 225 ] ], { from: [ 50, 120 ], hold: 160 } );
    assert.deepEqual( pointerEvents, [ 'move c0 13' ] );

    const events = [];
    let list = collection( 'dynamic', events );
    assert.ok( !document.querySelector( '#c2 .exp-kbd-grip' ), 'the dynamic item has no grip' );
    handle( 0 ).focus();
    press( ' ' );
    assert.equal( live(), 'Picked up Item 0. Position 1 of 4. Use the arrow keys to move, Space to drop, Escape to cancel.' );
    assert.ok( list.querySelector( '.collection-item.sorting' ), 'activeClass "sorting" while it is picked up' );
    assert.ok( document.getElementById( 'c0' ).classList.contains( 'start-item' ) );
    press( 'End' );
    assert.equal( live(), 'Position 4 of 4.' );
    assert.ok( document.getElementById( 'c3' ).classList.contains( 'highlight' ), 'hoverClass "highlight" on the slot chosen' );
    assert.ok( !document.getElementById( 'c0' ).classList.contains( 'highlight' ) );
    assert.equal( document.activeElement, handle( 0 ) );
    press( 'Enter' );
    assert.deepEqual( events, pointerEvents, 'the same $move as the pointer\'s' );
    assert.equal( live(), 'Dropped Item 0 at position 4.' );
    assert.deepEqual( found( '.collection-item:is(.sorting, .highlight, .start-item), .ui-draggable-dragging', list ), [] );

    events.length = 0;
    list = collection( 'dynamic', events );
    handle( 1 ).focus();
    press( ' ', 'ArrowUp', 'Escape' );
    assert.deepEqual( events, [] );
    assert.deepEqual( found( '.cloned-manual, .sorting-hidden, .sorting, .highlight, .start-item, .ui-draggable-dragging', list ), [] );
    assert.equal( document.activeElement, handle( 1 ) );
    assert.equal( live(), 'Move cancelled.' );
} );

// ---- texts -------------------------------------------------------------------------------------------------------

test( 'every text of the keyboard mode is handed to the page (spa_strings.tpl) and translated in every catalogue', () => {
    const source = parsed.modules.get( idOf( './widget' ) ).source;
    const texts = [ ...source.matchAll( /\bT\("((?:[^"\\]|\\.)+)"/g ) ].map( ( m ) => JSON.parse( '"' + m[ 1 ] + '"' ) );
    assert.equal( new Set( texts ).size, 13 );
    const strings = readFileSync( resolve( root, 'design/standard/templates/explayouts_ui_api/spa_strings.tpl' ), 'utf8' );
    const xml = ( s ) => s.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
    const decode = ( s ) => s.replace( /&apos;/g, "'" ).replace( /&quot;/g, '"' ).replace( /&lt;/g, '<' ).replace( /&gt;/g, '>' ).replace( /&amp;/g, '&' );
    for ( const text of texts ) {
        assert.ok( strings.includes( '"' + text + '", "' + text + '"|i18n( \'design/standard/explayouts_ui_api/spa\' )' ), text );
        for ( const lang of readdirSync( resolve( root, 'translations' ) ) ) {
            const ts = readFileSync( resolve( root, 'translations', lang, 'translation.ts' ), 'utf8' );
            const m = ts.match( new RegExp( '<source>' + xml( text ).replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ) + '</source>\\s*<translation([^>]*)>([^<]*)</translation>' ) );
            assert.ok( m, lang + ': ' + text );
            if ( lang === 'untranslated' ) continue;
            assert.ok( m[ 2 ].trim() && !m[ 1 ].includes( 'unfinished' ), lang + ' translates ' + text );
            for ( const p of text.match( /%[a-z]+/g ) || [] ) assert.ok( decode( m[ 2 ] ).includes( p ), lang + ' keeps ' + p + ' in ' + text );
        }
    }
} );

// ---- the sortable's keyboard entries on their own ----------------------------------------------------------------

test( 'keyStart/keyMove/keyDrop: the callbacks of a pointer drag between two lists, in its order', async () => {
    const CALLBACKS = [ 'start', 'activate', 'over', 'out', 'beforeStop', 'update', 'remove', 'receive', 'deactivate', 'stop' ];
    const run = async ( keyboard ) => {
        document.body.innerHTML =
            '<div id="L1" class="list">' + [ 'a1', 'a2', 'a3' ].map( ( i ) => '<div id="' + i + '">' + i + '</div>' ).join( '' ) + '</div>' +
            '<div id="L2" class="list">' + [ 'b1', 'b2' ].map( ( i ) => '<div id="' + i + '">' + i + '</div>' ).join( '' ) + '</div>';
        const L1 = document.getElementById( 'L1' ), L2 = document.getElementById( 'L2' );
        lists.clear();
        layout( { element: L1, left: 0, top: 100, width: 200, height: 200 }, { element: L2, left: 300, top: 100, width: 200, height: 200 } );
        const trace = [];
        const options = { connectWith: '.list', placeholder: 'no-placeholder', tolerance: 'pointer' };
        for ( const name of CALLBACKS ) options[ name ] = function ( ev, ui ) { trace.push( [ name, this.id, ui.item && ui.item.id, ui.sender ? ui.sender.id : null ].join( ' ' ) ); };
        const [ s1, s2 ] = sortable.sortable( [ L1, L2 ], options );
        if ( keyboard ) {
            assert.ok( s1.keyStart( document.getElementById( 'a1' ) ) );
            s1.keyMove( s2, 1 );
            s1.keyDrop();
        } else await drag( document.getElementById( 'a1' ), [ [ 150, 130 ], [ 400, 130 ], [ 400, 145 ] ] );
        return { trace, dom: [ ids( L1 ), ids( L2 ) ] };
    };
    const byPointer = await run( false );
    const byKeyboard = await run( true );
    assert.deepEqual( byKeyboard.dom, [ [ 'a2', 'a3' ], [ 'b1', 'a1', 'b2' ] ] );
    assert.deepEqual( byKeyboard.dom, byPointer.dom );
    assert.deepEqual( byKeyboard.trace, byPointer.trace );
} );
