/**
 * The plain DOM code of the layout editor in place of jQuery plugins (design/standard/javascript/netgen-layouts.js,
 * patches in src/app-patches/modules/): Core.ui from bootstrap/js/transition with the dialog (bootstrap/js/modal),
 * the collapsible panels (bootstrap/js/collapse) and the dropdown menus (bootstrap/js/dropdown); the helpers of
 * ./lib/jquery/* (xeditable, dependable_select, bm_tooltip); the date field of ./views/datetime_picker; the date
 * formatter in place of Moment.js (module moment).
 *
 * What the tests expect is what Bootstrap 3.4.1 and Moment.js did, compared click by click with the old modules of
 * the bundle (jQuery 4) when they were replaced; the additions (role, aria-modal and aria-hidden of the dialog, Tab
 * kept inside, the focus back on close) are marked as such.
 *
 * Run: npm ci && npm test (in extension/explayouts_ui_api)
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { parseBundle } from '../../src/app-patches/bundle.mjs';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const parsed = parseBundle( readFileSync( resolve( root, 'design/standard/javascript/netgen-layouts.js' ), 'utf8' ) );

function idOf( name ) {
    for ( const m of parsed.modules.values() ) if ( name in m.deps ) return String( m.deps[ name ] );
    throw new Error( 'no module ' + name );
}

function load( name, standIns = {} ) {
    const id = idOf( name );
    const module = { exports: {} };
    ( 0, eval )( '(' + parsed.modules.get( id ).source + ')' ).call( module.exports, ( dep ) => {
        if ( dep in standIns ) return standIns[ dep ];
        throw new Error( 'module ' + id + ' asks for ' + dep );
    }, module, module.exports );
    return module.exports;
}

const wait = ( ms ) => new Promise( ( done ) => setTimeout( done, ms ) );
// Past every transition (a backdrop of 150 ms and then the dialog of 300 ms), with room for a busy machine whose timers
// run late: half a second left a dialog still fading in under load.
const PAST_TRANSITIONS = 1000;
const click = ( el ) => el.dispatchEvent( new MouseEvent( 'click', { bubbles: true, cancelable: true, button: 0 } ) );
const key = ( el, name, code, extra ) => {
    const ev = new KeyboardEvent( 'keydown', Object.assign( { key: name, keyCode: code, which: code, bubbles: true, cancelable: true }, extra ) );
    el.dispatchEvent( ev );
    return ev;
};
const $id = ( id ) => document.getElementById( id );

let ui;
let events;
let moment;
let DateTimePicker;

before( () => {
    GlobalRegistrator.register( { url: 'https://example.test/exponential_admin/explayouts_ui_api/app' } );
    // no layout in happy-dom: an element takes up room unless it or a parent is display none
    Element.prototype.getClientRects = function () {
        for ( let el = this; el && el.nodeType === 1; el = el.parentElement ) if ( getComputedStyle( el ).display === 'none' ) return [];
        return this.isConnected ? [ {} ] : [];
    };
    ui = load( 'bootstrap/js/transition' );
    ui.dropdown = load( 'bootstrap/js/dropdown' )( ui );
    ui.dialog = load( 'bootstrap/js/modal' )( ui );
    ui.collapse = load( 'bootstrap/js/collapse' )( ui );
    const core = { ui };
    load( './lib/jquery/bm_tooltip', { '../../core': core } );
    load( './lib/jquery/master_slave_selects', { '../../core': core } );
    load( './lib/jquery/video_thumb_fetcher', { '../../core': core } );
    moment = load( 'moment' );
    DateTimePicker = load( './views/datetime_picker', { '../core_base': {}, '../extended/view': { extend: ( proto ) => proto, prototype: { initialize() {} } } } );
    events = [];
    for ( const type of [ 'show', 'shown', 'hide', 'hidden' ] ) {
        for ( const plugin of [ 'modal', 'collapse', 'dropdown' ] ) {
            document.addEventListener( type + '.bs.' + plugin, ( e ) => events.push( type + '.bs.' + plugin + ' ' + e.target.id ) );
        }
    }
} );

after( async () => {
    await GlobalRegistrator.unregister();
} );

beforeEach( () => {
    events.length = 0;
    document.body.className = '';
    document.body.removeAttribute( 'style' );
} );

// ---------------------------------------------------------------- dialog

function dialogMarkup() {
    document.body.innerHTML = '<button id="opener">Publish</button><input id="outside">' +
        '<div class="mymodal modal fade" id="m" tabindex="-1"><div class="modal-dialog"><div class="modal-content">' +
        '<h1 class="modal-title" id="mt">Discard changes</h1><input id="field">' +
        '<button type="button" id="cancel" data-dismiss="modal">Cancel</button><button type="button" id="apply">OK</button>' +
        '</div></div></div>';
    $id( 'opener' ).focus();
    return $id( 'm' );
}

test( 'dialog: opens as Bootstrap 3 did, with backdrop, body class and the focus on the dialog', async () => {
    const m = dialogMarkup();
    let shown = 0;
    ui.dialog.show( m, { on_shown: () => shown++ } );
    assert.equal( document.body.className, 'modal-open' );
    assert.deepEqual( [ ...document.querySelectorAll( '.modal-backdrop' ) ].map( ( b ) => b.className ), [ 'modal-backdrop fade in' ] );
    assert.ok( !m.classList.contains( 'in' ), 'the dialog fades in after the backdrop' );
    await wait( PAST_TRANSITIONS );
    assert.ok( m.classList.contains( 'in' ) );
    assert.equal( m.style.display, 'block' );
    assert.equal( document.activeElement, m );
    assert.equal( shown, 1 );
    assert.deepEqual( events, [ 'show.bs.modal m', 'shown.bs.modal m' ] );
    // added: a named modal dialog
    assert.equal( m.getAttribute( 'role' ), 'dialog' );
    assert.equal( m.getAttribute( 'aria-modal' ), 'true' );
    assert.equal( m.getAttribute( 'aria-labelledby' ), 'mt' );
    assert.ok( ui.dialog.is_shown( m ) );
    ui.dialog.hide( m );
    await wait( PAST_TRANSITIONS );
} );

test( 'dialog: Escape closes; then hidden, backdrop gone, focus back on the opener', async () => {
    const m = dialogMarkup();
    let hidden = 0;
    ui.dialog.show( m, { on_hidden: () => hidden++ } );
    await wait( PAST_TRANSITIONS );
    key( $id( 'field' ), 'Escape', 27 );
    assert.ok( !m.classList.contains( 'in' ) );
    await wait( PAST_TRANSITIONS );
    assert.equal( m.style.display, 'none' );
    assert.equal( m.getAttribute( 'aria-hidden' ), 'true' );
    assert.equal( document.querySelectorAll( '.modal-backdrop' ).length, 0 );
    assert.equal( document.body.className, '' );
    assert.equal( hidden, 1 );
    assert.deepEqual( events, [ 'show.bs.modal m', 'shown.bs.modal m', 'hide.bs.modal m', 'hidden.bs.modal m' ] );
    assert.equal( document.activeElement, $id( 'opener' ), 'added: the focus goes back' );
} );

test( 'dialog: keyboard false and backdrop static keep it open; data-dismiss closes', async () => {
    const m = dialogMarkup();
    ui.dialog.show( m, { keyboard: false, backdrop: 'static' } );
    await wait( PAST_TRANSITIONS );
    key( $id( 'field' ), 'Escape', 27 );
    click( m );
    await wait( PAST_TRANSITIONS );
    assert.ok( ui.dialog.is_shown( m ) && m.classList.contains( 'in' ) );
    assert.equal( document.activeElement, m, 'a click on the static backdrop focuses the dialog' );
    click( $id( 'cancel' ) );
    await wait( PAST_TRANSITIONS );
    assert.ok( !ui.dialog.is_shown( m ) );
    assert.equal( m.style.display, 'none' );
} );

test( 'dialog: a click on the backdrop closes, a press started in the dialog does not', async () => {
    const m = dialogMarkup();
    ui.dialog.show( m );
    await wait( PAST_TRANSITIONS );
    $id( 'field' ).dispatchEvent( new MouseEvent( 'mousedown', { bubbles: true } ) );
    m.dispatchEvent( new MouseEvent( 'mouseup', { bubbles: true } ) );
    click( m );
    assert.ok( ui.dialog.is_shown( m ) );
    click( m );
    assert.ok( !ui.dialog.is_shown( m ) );
    await wait( PAST_TRANSITIONS );
} );

test( 'dialog: the focus stays inside (focusin and Tab); added: Tab wraps around', async () => {
    const m = dialogMarkup();
    ui.dialog.show( m );
    await wait( PAST_TRANSITIONS );
    $id( 'outside' ).focus();
    assert.equal( document.activeElement, m, 'focus outside comes back, as Bootstrap did' );
    $id( 'apply' ).focus();
    assert.ok( key( $id( 'apply' ), 'Tab', 9 ).defaultPrevented );
    assert.equal( document.activeElement, $id( 'field' ) );
    key( $id( 'field' ), 'Tab', 9, { shiftKey: true } );
    assert.equal( document.activeElement, $id( 'apply' ) );
    ui.dialog.hide( m );
    await wait( PAST_TRANSITIONS );
} );

test( 'dialog: hide of a closed dialog does nothing; a prevented show does not open', async () => {
    const m = dialogMarkup();
    ui.dialog.hide( m );
    assert.deepEqual( events, [] );
    const stop = ( e ) => e.preventDefault();
    m.addEventListener( 'show.bs.modal', stop );
    ui.dialog.show( m );
    m.removeEventListener( 'show.bs.modal', stop );
    assert.ok( !ui.dialog.is_shown( m ) );
    assert.equal( document.body.className, '' );
} );

test( 'dialog: shown again while it still fades out, it stays open: one backdrop, no aria-hidden, the focus inside', async () => {
    const m = dialogMarkup();
    let hidden = 0;
    ui.dialog.show( m, { on_hidden: () => hidden++ } );
    await wait( PAST_TRANSITIONS );
    $id( 'field' ).focus();
    click( $id( 'cancel' ) );
    await wait( 100 );   // the dialog fades out for 300 ms
    ui.dialog.show( m, { on_hidden: () => hidden++ } );
    await wait( 800 );   // past every transition of the first close
    assert.ok( ui.dialog.is_shown( m ) );
    assert.equal( m.style.display, 'block' );
    assert.ok( m.classList.contains( 'in' ) );
    assert.equal( m.hasAttribute( 'aria-hidden' ), false );
    assert.equal( m.getAttribute( 'aria-modal' ), 'true' );
    assert.deepEqual( [ ...document.querySelectorAll( '.modal-backdrop' ) ].map( ( b ) => b.className ), [ 'modal-backdrop fade in' ] );
    assert.equal( document.body.className, 'modal-open' );
    assert.ok( m.contains( document.activeElement ) || document.activeElement === m, 'the focus is in the dialog' );
    assert.equal( hidden, 0, 'the close turned round is no close' );
    assert.deepEqual( events, [ 'show.bs.modal m', 'shown.bs.modal m', 'hide.bs.modal m', 'show.bs.modal m', 'shown.bs.modal m' ] );
    ui.dialog.hide( m );
    await wait( PAST_TRANSITIONS );
    assert.equal( m.style.display, 'none' );
    assert.equal( document.querySelectorAll( '.modal-backdrop' ).length, 0 );
    assert.equal( document.body.className, '' );
    assert.equal( document.body.style.paddingRight, '' );
    assert.equal( hidden, 1 );
    assert.equal( document.activeElement, $id( 'opener' ), 'the focus goes back to the opener of the first show' );
} );

test( 'dialog: closed while it still fades in, it stays closed: not shown later, no backdrop left', async () => {
    const m = dialogMarkup();
    let shown = 0, hidden = 0;
    ui.dialog.show( m, { on_shown: () => shown++, on_hidden: () => hidden++ } );
    await wait( 50 );    // the backdrop fades in for 150 ms, then the dialog
    ui.dialog.hide( m );
    await wait( 200 );
    assert.notEqual( m.style.display, 'block', 'the dialog does not come up after it was closed' );
    await wait( PAST_TRANSITIONS );
    assert.ok( !ui.dialog.is_shown( m ) );
    assert.equal( m.style.display, 'none' );
    assert.ok( !m.classList.contains( 'in' ) );
    assert.equal( m.getAttribute( 'aria-hidden' ), 'true' );
    assert.equal( document.querySelectorAll( '.modal-backdrop' ).length, 0 );
    assert.equal( document.body.className, '' );
    assert.deepEqual( [ shown, hidden ], [ 0, 1 ] );
    assert.equal( document.activeElement, $id( 'opener' ) );
} );

// ---------------------------------------------------------------- collapse

test( 'collapse: the sidebar panels hide and show as with Bootstrap, aria-expanded on toggle and panel', async () => {
    document.body.innerHTML =
        '<a id="t1" class="toggle-link" role="button" data-toggle="collapse" href="#collapseSettings" aria-expanded="true" aria-controls="collapseSettings">Options</a>' +
        '<div class="collapse in" id="collapseSettings">one</div>' +
        '<a id="t2" class="toggle-link sub-toggle" role="button" data-toggle="collapse" href="#collapseAdvanced" aria-expanded="false" aria-controls="collapseAdvanced">Advanced</a>' +
        '<div class="collapse" id="collapseAdvanced">two</div>';
    const panel = $id( 'collapseSettings' );
    click( $id( 't1' ) );
    assert.equal( panel.className, 'collapsing' );
    assert.equal( panel.style.height, '0px' );
    assert.equal( $id( 't1' ).getAttribute( 'aria-expanded' ), 'false' );
    assert.ok( $id( 't1' ).classList.contains( 'collapsed' ) );
    click( $id( 't1' ) );
    assert.equal( panel.className, 'collapsing', 'a click while it moves is ignored' );
    await wait( 400 );
    assert.equal( panel.className, 'collapse' );
    assert.equal( panel.getAttribute( 'aria-expanded' ), 'false' );
    click( $id( 't1' ) );
    await wait( 400 );
    assert.equal( panel.className, 'collapse in' );
    assert.equal( panel.style.height, '' );
    assert.equal( $id( 't1' ).getAttribute( 'aria-expanded' ), 'true' );
    assert.ok( !$id( 't1' ).classList.contains( 'collapsed' ) );
    click( $id( 't2' ) );
    await wait( 400 );
    assert.equal( $id( 'collapseAdvanced' ).className, 'collapse in' );
    assert.deepEqual( events, [ 'hide.bs.collapse collapseSettings', 'hidden.bs.collapse collapseSettings',
        'show.bs.collapse collapseSettings', 'shown.bs.collapse collapseSettings',
        'show.bs.collapse collapseAdvanced', 'shown.bs.collapse collapseAdvanced' ] );
} );

// ---------------------------------------------------------------- dropdown

function dropdownMarkup() {
    document.body.innerHTML =
        '<div class="dropdown" id="dd"><button class="dropdown-toggle" id="tg" type="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">more</button>' +
        '<ul class="dropdown-menu" id="menu"><li><a href="#" id="a1">1</a></li><li class="disabled"><a href="#" id="a2">2</a></li><li><a href="#" id="a3">3</a></li></ul></div>' +
        '<div class="dropdown" id="dd2"><button class="dropdown-toggle" id="tg2" type="button" data-toggle="dropdown" aria-expanded="false">more</button>' +
        '<ul class="dropdown-menu"><li><input id="field"></li></ul></div><p id="else">x</p>';
}

test( 'dropdown: a click opens one menu and closes the others; a click elsewhere closes', () => {
    dropdownMarkup();
    let reached = 0;
    const count = () => reached++;
    document.addEventListener( 'click', count );
    click( $id( 'tg' ) );
    document.removeEventListener( 'click', count );
    assert.equal( reached, 0, 'nothing else sees a click on a toggle (Bootstrap returned false)' );
    assert.ok( $id( 'dd' ).classList.contains( 'open' ) );
    assert.equal( $id( 'tg' ).getAttribute( 'aria-expanded' ), 'true' );
    assert.equal( document.activeElement, $id( 'tg' ) );
    click( $id( 'tg2' ) );
    assert.ok( !$id( 'dd' ).classList.contains( 'open' ) && $id( 'dd2' ).classList.contains( 'open' ) );
    assert.equal( $id( 'tg' ).getAttribute( 'aria-expanded' ), 'false' );
    click( $id( 'field' ) );
    assert.ok( $id( 'dd2' ).classList.contains( 'open' ), 'a click in a text field of the open menu keeps it' );
    click( $id( 'else' ) );
    assert.ok( !$id( 'dd2' ).classList.contains( 'open' ) );
    assert.deepEqual( events, [ 'show.bs.dropdown dd', 'shown.bs.dropdown dd', 'hide.bs.dropdown dd', 'hidden.bs.dropdown dd',
        'show.bs.dropdown dd2', 'shown.bs.dropdown dd2', 'hide.bs.dropdown dd2', 'hidden.bs.dropdown dd2' ] );
} );

test( 'dropdown: keys on the toggle and in the menu', () => {
    dropdownMarkup();
    assert.ok( key( $id( 'tg' ), 'ArrowDown', 40 ).defaultPrevented );
    assert.ok( $id( 'dd' ).classList.contains( 'open' ), 'Down opens' );
    key( $id( 'tg' ), 'ArrowDown', 40 );
    assert.equal( document.activeElement, $id( 'a1' ) );
    key( $id( 'a1' ), 'ArrowDown', 40 );
    assert.equal( document.activeElement, $id( 'a3' ), 'the disabled item is skipped' );
    key( $id( 'a3' ), 'ArrowDown', 40 );
    assert.equal( document.activeElement, $id( 'a3' ), 'stays on the last' );
    key( $id( 'a3' ), 'ArrowUp', 38 );
    assert.equal( document.activeElement, $id( 'a1' ) );
    key( $id( 'a1' ), 'Escape', 27 );
    assert.ok( !$id( 'dd' ).classList.contains( 'open' ) );
    assert.equal( document.activeElement, $id( 'tg' ), 'Escape gives the focus back to the toggle' );
    key( $id( 'tg' ), ' ', 32 );
    assert.ok( $id( 'dd' ).classList.contains( 'open' ), 'Space opens' );
    ui.dropdown.close_all();
} );

test( 'dropdown: Escape with the focus elsewhere closes the open menu and leaves the focus where it is', () => {
    dropdownMarkup();
    $id( 'tg' ).click();
    assert.ok( $id( 'dd' ).classList.contains( 'open' ) );
    // the click that opened the menu also selected the block, whose editor then took the focus
    $id( 'else' ).setAttribute( 'tabindex', '-1' );
    $id( 'else' ).focus();
    const ev = key( $id( 'else' ), 'Escape', 27 );
    assert.ok( !$id( 'dd' ).classList.contains( 'open' ), 'closed' );
    assert.equal( $id( 'tg' ).getAttribute( 'aria-expanded' ), 'false' );
    assert.equal( document.activeElement, $id( 'else' ), 'the focus stays' );
    assert.ok( !ev.defaultPrevented, 'the key goes on to its other listeners' );
    key( $id( 'else' ), 'Escape', 27 );
    assert.ok( !$id( 'dd' ).classList.contains( 'open' ), 'nothing open: nothing happens' );
} );

test( 'dropdown: a menu with no room below opens upwards (dropup), and loses it on close', () => {
    dropdownMarkup();
    $id( 'menu' ).getBoundingClientRect = () => ( { top: 700, height: 200, left: 0, width: 100, right: 100, bottom: 900 } );
    $id( 'tg' ).getBoundingClientRect = () => ( { top: 670, height: 30, left: 0, width: 30, right: 30, bottom: 700 } );
    Object.defineProperty( document.documentElement, 'clientHeight', { configurable: true, get: () => 768 } );
    click( $id( 'tg' ) );
    assert.equal( $id( 'dd' ).className, 'dropdown open dropup' );
    click( $id( 'else' ) );
    assert.equal( $id( 'dd' ).className, 'dropdown' );
    $id( 'menu' ).getBoundingClientRect = () => ( { top: 100, height: 200, left: 0, width: 100, right: 100, bottom: 300 } );
    click( $id( 'tg' ) );
    assert.equal( $id( 'dd' ).className, 'dropdown open' );
    delete document.documentElement.clientHeight;
} );

// ---------------------------------------------------------------- helpers of ./lib/jquery/*

test( 'xeditable: Change shows the form, Cancel brings back the text, Apply tells the view', () => {
    document.body.innerHTML = '<div class="sidebar" data-view="" id="sb"><div class="xeditable" data-xeditable-name="collection_type">' +
        '<div class="current"><a href="#" class="js-edit" id="edit"><span class="text">Manual</span></a></div>' +
        '<div class="form"><select name="block_collection[new_type]"><option>manual</option></select>' +
        '<a href="#" class="js-apply" id="apply">Apply</a><a href="#" class="js-cancel" id="cancel">Cancel</a></div></div></div>';
    const calls = [];
    const view = { el: $id( 'sb' ), trigger: ( name ) => calls.push( name ), trigger_with_global: ( name ) => calls.push( 'global ' + name ) };
    $id( 'sb' ).ngl_view = view;
    const form = document.querySelector( '.form' );
    const html = form.innerHTML;
    ui.xeditable( document.querySelectorAll( '.xeditable' ) );
    assert.equal( form.innerHTML, '' );
    assert.equal( document.querySelector( '.xeditable' ).getAttribute( 'data-input' ), '' );
    ui.xeditable( document.querySelectorAll( '.xeditable' ) );
    click( $id( 'edit' ).querySelector( '.text' ) );
    assert.equal( form.innerHTML, html );
    assert.equal( document.querySelector( '.current' ).style.display, 'none' );
    assert.ok( $id( 'sb' ).classList.contains( 'xeditable-active' ) );
    assert.deepEqual( calls, [ 'global plugins:reinitialize' ] );
    click( $id( 'cancel' ) );
    assert.equal( form.innerHTML, '' );
    assert.notEqual( document.querySelector( '.current' ).style.display, 'none' );
    assert.ok( !$id( 'sb' ).classList.contains( 'xeditable-active' ) );
    click( $id( 'edit' ) );
    click( $id( 'apply' ) );
    assert.deepEqual( calls.slice( -1 ), [ 'xeditable:apply:collection_type' ] );
    assert.ok( !$id( 'sb' ).classList.contains( 'xeditable-active' ) );
} );

test( 'dependable_select: only the part linked to the chosen value shows', async () => {
    document.body.innerHTML = '<div class="js-dependable-selects-group"><select class="js-master" id="type">' +
        '<option value="manual" selected>m</option><option value="dynamic">d</option></select>' +
        '<div data-linked-value="dynamic" id="dyn">query</div><div data-linked-value="manual" id="man">items</div></div>';
    ui.dependable_select( document.querySelectorAll( '.js-dependable-selects-group .js-master' ) );
    assert.equal( $id( 'dyn' ).style.display, 'none' );
    assert.notEqual( $id( 'man' ).style.display, 'none' );
    $id( 'type' ).value = 'dynamic';
    $id( 'type' ).dispatchEvent( new Event( 'change', { bubbles: true } ) );
    await wait( 450 );
    assert.equal( $id( 'man' ).style.display, 'none' );
    assert.notEqual( $id( 'dyn' ).style.display, 'none' );
} );

test( 'bm_tooltip: the title shows beside the element on hover', () => {
    document.body.innerHTML = '<div id="app"><span class="ngl-tooltip" id="tip" title="Linked to &lt;b&gt;Zone&lt;/b&gt;">i</span></div>';
    ui.bm_tooltip( document.querySelectorAll( '.ngl-tooltip' ) );
    ui.bm_tooltip( document.querySelectorAll( '.ngl-tooltip' ) );
    assert.equal( $id( 'tip' ).title, '' );
    $id( 'tip' ).dispatchEvent( new MouseEvent( 'mouseenter' ) );
    const shown = document.querySelectorAll( '#app .ngl-tooltip-title' );
    assert.equal( shown.length, 1, 'set up once' );
    assert.equal( shown[ 0 ].innerHTML, 'Linked to <b>Zone</b>' );
    assert.ok( shown[ 0 ].dataset.x && shown[ 0 ].dataset.y );
    $id( 'tip' ).dispatchEvent( new MouseEvent( 'mouseleave' ) );
    assert.equal( document.querySelectorAll( '.ngl-tooltip-title' ).length, 0 );
} );

// ---------------------------------------------------------------- dates

test( 'datetime picker: the browser\'s date and time field, the value sent as before (YYYY-MM-DDTHH:mm, local time)', () => {
    document.body.innerHTML = '<div class="datetimepicker" id="dp"><input type="text" class="datetime">' +
        '<input type="hidden" class="datetime-formatted" name="date" value="2026-10-23T14:05:00Z"><a href="#" class="js-clear-input">x</a></div>';
    const el = $id( 'dp' );
    const changes = [];
    const view = Object.assign( Object.create( DateTimePicker ), { el, trigger: ( name ) => changes.push( name ) } );
    view.initialize( {} );
    const input = el.querySelector( '.datetime' ), hidden = el.querySelector( '.datetime-formatted' );
    const local = new Date( '2026-10-23T14:05:00Z' );
    const expected = moment.format( local, 'YYYY-MM-DD' ) + 'T' + moment.format( local, 'HH:mm' );
    assert.equal( input.type, 'datetime-local' );
    assert.equal( input.value, expected, 'shown in local time, as the picker did' );
    assert.equal( hidden.value, expected );
    assert.ok( el.classList.contains( 'date-entered' ) );
    input.value = '2027-01-02T09:30';
    view.dateTimeChange();
    assert.equal( hidden.value, '2027-01-02T09:30' );
    view.clearInput( { preventDefault() {} } );
    assert.equal( hidden.value, '' );
    assert.ok( !el.classList.contains( 'date-entered' ) );
    assert.deepEqual( changes, [ 'change', 'change', 'change' ] );
} );

test( 'date helper: what Moment.js gave for the editor\'s formats (en, de, fr)', () => {
    // captured from moment 2 with its locales (the module it replaces)
    const at = '2026-10-23T14:05:00';
    assert.equal( moment.format( at, 'LLLL', 'en-US' ), 'Friday, October 23, 2026 2:05 PM' );
    assert.equal( moment.format( at, 'llll', 'en-US' ), 'Fri, Oct 23, 2026 2:05 PM' );
    assert.equal( moment.format( at, 'LLLL', 'de-DE' ), 'Freitag, 23. Oktober 2026 14:05' );
    assert.equal( moment.format( at, 'llll', 'de' ), 'Fr., 23. Okt. 2026 14:05' );
    assert.equal( moment.format( '2026-01-02 09:07', 'LLLL', 'de' ), 'Freitag, 2. Januar 2026 09:07' );
    assert.equal( moment.format( at, 'LLLL', 'fr' ), 'vendredi 23 octobre 2026 14:05' );
    assert.equal( moment.format( '2026-10-23', 'Y-MM-DDTHH:mm' ), '2026-10-23T00:00', 'a date alone is local midnight' );
    const utc = new Date( Date.UTC( 2026, 2, 4, 21, 59, 30 ) );
    assert.equal( moment.format( '2026-03-04T23:59:30+02:00', 'YYYY-MM-DD HH:mm:ss' ), moment.format( utc, 'YYYY-MM-DD HH:mm:ss' ), 'an offset is that instant' );
    assert.equal( moment.format( null, 'LLLL' ), 'Invalid date' );
    assert.equal( moment.format( 'garbage', 'LLLL' ), 'Invalid date' );
    assert.ok( Math.abs( moment.parse( undefined ) - Date.now() ) < 1000, 'no value is now' );
} );
