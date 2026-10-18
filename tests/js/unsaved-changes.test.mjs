/**
 * The warning on leaving the layout editor (module ./init of design/standard/javascript/netgen-layouts.js, with
 * save_via_form of module ./extended/model; patches in src/app-patches/modules/). The editor saves every change to the
 * draft at once, so leaving is only a loss while a save runs, shortly after typing in a block (its save waits 500 ms
 * for the last key), or while a form of the sidebar or of a dialog holds values that were not saved. netgen/layouts-ui
 * warned on every leave that was not publish, discard or close, also right after opening a layout (B17).
 *
 * The two modules run from the bundle itself, with jQuery 4 (as on the page) and stand-ins for the rest of the app.
 *
 * Run: npm ci && npm test (in extension/explayouts_ui_api)
 *
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
const WARNING = 'There could be unsaved changes. Are you sure you want to leave?';

let jQuery;
let Core;
let Model;
let onBeforeUnload;
let requests;
let now;

class Stand {
    fetch() { return this; }
    on() { return this; }
    get() { return undefined; }
    save() { return this; }
    set() { return this; }
}

/** Runs bundle modules by id; a require of a name in stand-ins gets the stand-in instead of the bundle's module. */
function loader( standIns ) {
    const cache = new Map();
    const load = ( id ) => {
        if ( cache.has( id ) ) return cache.get( id ).exports;
        const m = parsed.modules.get( id );
        const module = { exports: {} };
        cache.set( id, module );
        const fn = ( 0, eval )( '(' + m.source + ')' );
        fn.call( module.exports, ( name ) => ( name in standIns ? standIns[ name ] : load( String( m.deps[ name ] ) ) ), module, module.exports );
        return module.exports;
    };
    return load;
}

const idOf = ( name ) => {
    for ( const m of parsed.modules.values() ) if ( name in m.deps ) return String( m.deps[ name ] );
    throw new Error( 'no module ' + name );
};

before( async () => {
    GlobalRegistrator.register( { url: 'https://example.test/exponential_admin/explayouts_ui_api/app#layout/1/edit',
                                  settings: { navigation: { disableMainFrameNavigation: true } } } );
    const { jQueryFactory } = await import( 'jquery/factory' );
    jQuery = jQueryFactory( window );
    window.jQuery = globalThis.jQuery = jQuery;
    globalThis.nglT = window.nglT = ( s ) => s;
    globalThis.nglTh = window.nglTh = ( s ) => s;

    // Requests answer only when the test says so.
    requests = [];
    jQuery.ajaxTransport( '+*', () => ( {
        send: ( headers, complete ) => { requests.push( complete ); },
        abort: () => {}
    } ) );

    const events = {};
    const core = {
        $: jQuery, g: {}, Backbone: { history: { start() {} } },
        on( names, fn, context ) {
            for ( const name of names.split( /\s+/ ) ) ( events[ name ] = events[ name ] || [] ).push( [ fn, context || core ] );
            return core;
        },
        trigger( name, data ) {
            for ( const [ fn, context ] of events[ name ] || [] ) fn.call( context, data );
            return core;
        }
    };
    const load = loader( {
        './core': core, '../core_base': core, './environments/default': {},
        './collections/block_types': Stand, './collections/layout_types': Stand, './collections/layouts': Stand,
        './views/blocks/load': {}, './models/blocks/helper': {}, './router': Stand, './models/config': Stand,
        './models/state': Stand, './models/local_config': Stand, nprogress: { start() {}, done() {} },
        '@netgen/content-browser-ui': { InputBrowse: class {}, MultipleBrowse: class {} },
        backbone: { Model: { extend: ( proto ) => proto }, $: jQuery }, './utils': {}
    } );
    for ( const plugin of [ 'xeditable', 'dependable_select', 'master_slave_selects', 'video_thumb_fetcher', 'view_types', 'bm_tooltip' ] ) {
        jQuery.fn[ plugin ] = function () { return this; };
    }
    jQuery.fn.ajax_submit = function () {
        return jQuery.ajax( { url: this.attr( 'action' ), method: this.attr( 'method' ), data: this.serialize() } );
    };

    const listen = window.addEventListener;
    window.addEventListener = function ( type, fn ) {
        if ( type === 'beforeunload' ) onBeforeUnload = fn;
        return listen.apply( this, arguments );
    };
    Core = load( idOf( './init' ) );
    Model = load( idOf( './extended/model' ) );
    Core.init();
    window.addEventListener = listen;

    const realNow = Date.now;
    Date.now = () => ( now === undefined ? realNow() : now );
} );

after( async () => {
    await GlobalRegistrator.unregister();
} );

beforeEach( () => {
    document.body.innerHTML = '<div id="app"><div class="zones"></div><aside id="sidebar"><div class="right-sidebar"></div></aside></div>';
    Core.should_navigate_away = false;
    Core.inline_edit_at = 0;
    now = undefined;
} );

/** What the browser is told on leaving: the warning, or null for no warning. */
function leave() {
    const event = { returnValue: undefined };
    const result = onBeforeUnload( event );
    assert.equal( result === null ? undefined : result, event.returnValue, 'returned and set alike' );
    return result;
}

/** A view rendered by the app: the app's render event runs the plugins and takes the forms' state. */
function render( html, into = '.right-sidebar' ) {
    const el = document.createElement( 'div' );
    el.innerHTML = html;
    document.querySelector( into ).appendChild( el );
    Core.trigger( 'render', { view: { $: ( selector ) => jQuery( el ).find( selector ), el } } );
    return el;
}

const sidebarForm = '<div class="sidebar"><form action="/api/blocks/1" method="post">'
    + '<input name="block_update[title]" value="Welcome">'
    + '<select name="block_update[view_type]"><option value="gallery" selected>Gallery</option><option value="slider">Slider</option></select>'
    + '<textarea name="block_update[html]">&lt;p&gt;Text&lt;/p&gt;</textarea>'
    + '<input type="hidden" name="block_update[_token]" value="t1">'
    + '</form></div>';

const tick = () => new Promise( ( done ) => setTimeout( done, 0 ) );

test( 'right after opening a layout leaving does not warn', () => {
    render( sidebarForm );
    assert.equal( leave(), null );
} );

test( 'a value changed in the sidebar and not yet saved warns; changing it back does not', () => {
    const el = render( sidebarForm );
    const input = el.querySelector( '[name="block_update[title]"]' );
    input.value = 'Hello';
    assert.equal( leave(), WARNING );
    input.value = 'Welcome';
    assert.equal( leave(), null );
    el.querySelector( 'select' ).value = 'slider';
    assert.equal( leave(), WARNING, 'a select counts' );
} );

test( 'the rich text and code editors write into the sidebar textarea: that counts as a change', () => {
    const el = render( sidebarForm );
    jQuery( el.querySelector( 'textarea' ) ).html( '<p>Other</p>' );
    assert.equal( leave(), WARNING );
} );

test( 'a saved form no longer warns; a change made while the save ran still does', async () => {
    const el = render( sidebarForm );
    const form = el.querySelector( 'form' );
    const input = form.querySelector( '[name="block_update[title]"]' );
    const model = { get() {}, set() { return this; }, trigger_events() { return this; } };

    input.value = 'Hello';
    Model.save_via_form.call( model, jQuery( form ), 'save_inline', { silent: true } );
    assert.equal( Core.pending_writes, 1, 'the save is a running write' );
    assert.equal( leave(), WARNING, 'while the save runs' );
    requests.shift()( 200, 'OK', { text: '{}' }, 'Content-Type: application/json' );
    await tick();
    assert.equal( Core.pending_writes, 0 );
    assert.equal( leave(), null, 'saved' );

    input.value = 'Hello again';
    Model.save_via_form.call( model, jQuery( form ), 'save_inline', { silent: true } );
    input.value = 'Hello once more';
    requests.shift()( 200, 'OK', { text: '{}' }, 'Content-Type: application/json' );
    await tick();
    assert.equal( leave(), WARNING, 'typed after the save was sent' );
} );

test( 'a failed save keeps the warning', async () => {
    const el = render( sidebarForm );
    const form = el.querySelector( 'form' );
    form.querySelector( '[name="block_update[title]"]' ).value = 'Hello';
    Model.save_via_form.call( { get() {}, set() { return this; }, trigger_events() { return this; } }, jQuery( form ), 'save_inline', {} );
    requests.shift()( 422, 'Unprocessable', { text: '{"error":"x"}' }, 'Content-Type: application/json' );
    await tick();
    assert.equal( Core.pending_writes, 0 );
    assert.equal( leave(), WARNING );
} );

test( 'a running write warns, a running read does not', async () => {
    jQuery.ajax( { url: '/api/layouts/1/draft', method: 'GET' } );
    assert.equal( leave(), null, 'GET' );
    jQuery.ajax( { url: '/api/blocks/1/move', method: 'POST' } );
    assert.equal( leave(), WARNING, 'POST' );
    for ( const complete of requests.splice( 0 ) ) complete( 200, 'OK', { text: '{}' }, 'Content-Type: application/json' );
    await tick();
    assert.equal( leave(), null );
} );

test( 'typing in a block warns until its save has started', () => {
    const block = document.createElement( 'div' );
    block.setAttribute( 'data-block', '' );
    block.innerHTML = '<h2 data-inline-child data-attr="title" contenteditable="true">Welcome</h2>';
    document.querySelector( '.zones' ).appendChild( block );
    now = 1000000;
    block.querySelector( 'h2' ).dispatchEvent( new window.KeyboardEvent( 'keyup', { bubbles: true, key: 'x' } ) );
    assert.equal( leave(), WARNING );
    now += 600;
    assert.equal( leave(), WARNING, 'the save waits 500 ms for the last key' );
    now += 500;
    assert.equal( leave(), null, 'by then the save runs (a running write) or there was nothing to save' );
} );

test( 'a dialog with a typed value warns; closed, it does not', () => {
    const el = render( '<div class="modal"><form action="/api/layouts" method="post"><input name="create[name]" value=""></form></div>', '#app' );
    el.querySelector( 'input' ).value = 'My layout';
    assert.equal( leave(), WARNING );
    el.remove();
    assert.equal( leave(), null );
} );

test( 'a form inside a block preview is not the editor\'s', () => {
    const el = render( '<form action="/search"><input name="SearchText" value=""></form>', '.zones' );
    el.querySelector( 'input' ).value = 'term';
    assert.equal( leave(), null );
} );

test( 'publish, discard and close still leave without a warning', () => {
    const el = render( sidebarForm );
    el.querySelector( 'input' ).value = 'Hello';
    Core.should_navigate_away = true;
    assert.equal( leave(), null );
} );

test( 'the form token is no change', () => {
    const el = render( sidebarForm );
    el.querySelector( '[name="block_update[_token]"]' ).value = 't2';
    assert.equal( leave(), null );
} );
