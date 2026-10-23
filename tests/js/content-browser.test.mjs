/**
 * The content browser dialog of the layout editor ("+ Add items" of a collection, the browse fields of a block form;
 * the last part of design/standard/javascript/explayouts-app.js), node --test, happy-dom. The dialog runs on plain DOM;
 * until 1.3.29 it ran on jQuery and Bootstrap 3's modal. The 1.3.29 version (tests/js/fixtures/, with jQuery 4 and the
 * Bootstrap modal the bundle carried) and the current one (with the app's DOM layer and dialogs, Core.$ and
 * Core.ui.dialog from the bundle) go through the same steps, and what they do is compared: the dialog's markup and
 * state, the requests (jQuery's against the DOM layer's), the callbacks into the app and the events of the browse
 * field.
 *
 * Run: npm ci && npm test (in extension/explayouts_ui_api)
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { parseBundle } from '../../src/app-patches/bundle.mjs';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const appScript = readFileSync( resolve( root, 'design/standard/javascript/explayouts-app.js' ), 'utf8' );
const oldDialog = readFileSync( resolve( root, 'tests/js/fixtures/content-browser-1.3.29.js' ), 'utf8' );
const bootstrapModal = readFileSync( resolve( root, 'tests/js/fixtures/bootstrap-modal-3.4.1.js' ), 'utf8' );
const bundle = parseBundle( readFileSync( resolve( root, 'design/standard/javascript/netgen-layouts.js' ), 'utf8' ) );

/** A module of the app bundle by name, with the modules it requires by id given in `deps`. */
function bundleModule( name, deps = {} ) {
    let id = null;
    for ( const m of bundle.modules.values() ) if ( name in m.deps ) id = String( m.deps[ name ] );
    const module = { exports: {} };
    ( 0, eval )( '(' + bundle.modules.get( id ).source + ')' ).call( module.exports, ( dep ) => deps[ dep ], module, module.exports );
    return module.exports;
}

/** The dialog part of javascript/explayouts-app.js: from its comment to the end of the function expression. */
function newDialog() {
    const marker = '// The content browser dialog';
    const at = appScript.indexOf( marker );
    assert.ok( at >= 0, marker );
    const end = appScript.indexOf( '\n})();', at );
    assert.ok( end > at );
    return appScript.slice( at, end + '\n})();'.length );
}

const I18N = {
    add_to_collection: 'Add to "collection"', search: 'Search <here>', cancel: 'Cancel & close', add_selected: 'Add selected',
    content: 'Content', loading: 'Loading…', no_content: 'No content', open: 'Open', load_failed: 'Loading failed',
    select_content: 'Select content', select: 'Select', select_label: 'Select: %label', select_item: 'Select item',
    add_failed: 'Adding failed'
};

let jQuery;
let dom;
let ui;
let requests;

before( async () => {
    GlobalRegistrator.register( { url: 'https://example.test/admin/explayouts_ui_api/app#layout/1/edit',
                                  settings: { navigation: { disableMainFrameNavigation: true } } } );
    const { jQueryFactory } = await import( 'jquery/factory' );
    jQuery = jQueryFactory( window );
    window.jQuery = globalThis.jQuery = jQuery;
    ( 0, eval )( bootstrapModal );
    assert.equal( typeof jQuery.fn.modal, 'function', 'Bootstrap modal for the 1.3.29 dialog' );
    // happy-dom has no CSS transitions, so Bootstrap would show and hide at once; with them, as in a browser, it
    // waits for the end of the fade (here the time it allows for it: 150 ms backdrop, 300 ms dialog).
    await new Promise( ( done ) => jQuery( done ) );
    jQuery.support.transition = { end: 'transitionend' };
    jQuery.event.special.bsTransitionEnd = {
        bindType: 'transitionend', delegateType: 'transitionend',
        handle( e ) { if ( jQuery( e.target ).is( this ) ) return e.handleObj.handler.apply( this, arguments ); }
    };

    // Requests wait until the test answers them.
    requests = [];
    jQuery.ajaxTransport( '+*', ( options ) => ( {
        send: ( headers, complete ) => {
            // as jQuery's XHR transport, which this stands in for
            if ( !options.crossDomain && !headers[ 'X-Requested-With' ] ) headers[ 'X-Requested-With' ] = 'XMLHttpRequest';
            requests.push( { url: options.url, method: options.type, headers: { ...headers },
                             contentType: headers[ 'Content-Type' ] || null, body: options.data === undefined ? null : options.data,
                             answer: ( status, body ) => complete( status, status === 200 ? 'OK' : 'Error', { text: body },
                                                                   'Content-Type: application/json' ) } );
        },
        abort: () => {}
    } ) );

    // The app's DOM layer and dialogs, from the bundle; its requests go to a stand-in of XMLHttpRequest that records
    // them as jQuery's transport above does.
    ui = bundleModule( 'bootstrap/js/transition' );
    ui.dialog = bundleModule( 'bootstrap/js/modal' )( ui );
    dom = bundleModule( 'jquery', { 101: ui } );
    window.XMLHttpRequest = class {
        open( method, url ) { this.method = method; this.url = url; this.headers = {}; }
        setRequestHeader( name, value ) { this.headers[ name ] = value; }
        getResponseHeader( name ) { return /^content-type$/i.test( name ) ? 'application/json' : null; }
        getAllResponseHeaders() { return 'Content-Type: application/json'; }
        abort() {}
        send( body ) {
            requests.push( { url: this.url, method: this.method, headers: { ...this.headers },
                             contentType: this.headers[ 'Content-Type' ] || null, body: body === undefined ? null : body,
                             answer: ( status, text ) => {
                                 Object.assign( this, { status, statusText: status === 200 ? 'OK' : 'Error', responseText: text } );
                                 this.onload();
                             } } );
        }
    };

    window.explayoutsI18n = globalThis.explayoutsI18n = I18N;
    window.explayoutsBase = globalThis.explayoutsBase = () => '/admin/explayouts_ui_api';
    window.explayoutsInSiteaccess = ( u ) => 'https://example.test/admin' + u;
} );
after( async () => {
    await GlobalRegistrator.unregister();
} );

const wait = ( ms ) => new Promise( ( done ) => setTimeout( done, ms ) );
// Longer than Bootstrap's 150 ms (backdrop) + 300 ms (dialog)
const settle = () => wait( 520 );

const VALUES = { values: [
    { node_id: 60, object_id: 58, name: 'Folder "A" <b>', class_name: 'Folder & co', is_container: true },
    { node_id: '61', object_id: '59', name: "It's 7", class_name: 'Article', is_container: false },
    { node_id: 62, object_id: 60, name: 'Third', class_name: 'Article', is_container: false }
] };

/**
 * A page with a collection of the sidebar and a browse field of a block form, the app (window.Core) and the dialog
 * script of the variant. Returns what the steps need and what they observe.
 */
function page( variant, options = {} ) {
    document.getElementById( 'exp-content-browser-modal' )?.remove();
    document.querySelectorAll( '.modal-backdrop' ).forEach( ( el ) => el.remove() );
    document.body.className = '';
    document.body.removeAttribute( 'style' );
    // Bootstrap 3's CSS for the dialog, as far as the scripts read it
    if ( !document.getElementById( 'bootstrap-css' ) ) {
        document.head.insertAdjacentHTML( 'beforeend', '<style id="bootstrap-css">.modal { display: none; } '
            + '.fade { opacity: 0; } .fade.in { opacity: 1; }</style>' );
    }
    document.body.innerHTML = '<div id="app" class="ngc">'
        + '<div class="collection-items"><select class="js-browser-item-type"><option value="ez_content">Content</option>'
        + '<option value="ez_location" selected>Location</option></select>'
        + '<div class="body"><button type="button" class="add-items">+ Add items</button></div></div>'
        + '<form class="sidebar"><div class="row-input"><label for="p1"> Teaser target </label>'
        + '<div class="input-browse js-input-browse exp-input-browse" data-browser="true" data-input-id="p1">'
        + '<a href="#" class="js-trigger"><span class="js-name" data-empty-note="Pick one">Old</span></a>'
        + '<a href="#" class="js-clear">x</a>'
        + '<input type="hidden" class="js-item-type" value="' + ( options.itemType || 'exp_content' ) + '" />'
        + '<input type="hidden" class="js-value" id="p1" name="parameters[target]" value="12" /></div>'
        + '<a href="/admin/content/view/full/12" target="_blank" class="js-view-cms">View in CMS</a></div></form>'
        + '</div>';

    const seen = { fetchResults: 0, alerts: [], jqChange: 0, nativeChange: 0, browserChange: [] };
    const model = {
        values: { block_id: 'b7', identifier: 'default', locale: 'ger', canAddItems: true, offset: 3 },
        get( key ) { return this.values[ key ]; },
        fetch_results() { seen.fetchResults++; }
    };
    const body = document.querySelector( '.collection-items .body' );
    const view = { model, el: body, $el: jQuery( body ) };
    // the app keeps a view on its element: until 1.3.29 as jQuery data, now as el.ngl_view
    if ( variant === 'old' ) jQuery( body ).data( '_view', view );
    else body.ngl_view = view;

    window.Core = {
        $: variant === 'old' ? jQuery : dom,
        ui: variant === 'old' ? undefined : ui,
        g: { config: { get: ( key ) => ( key === 'csrf_token' ? 'csrf-123' : undefined ) } }
    };
    window.alert = ( text ) => seen.alerts.push( text );

    const form = document.querySelector( 'form.sidebar' );
    const onJq = () => { seen.jqChange++; };
    const onNative = ( e ) => { if ( e.target.matches( 'input.js-value' ) ) seen.nativeChange++; };
    const onBrowser = ( e ) => { seen.browserChange.push( e.detail && e.detail.instance === e.target ); };
    jQuery( form ).on( 'change', 'input.js-value', onJq );
    form.addEventListener( 'change', onNative );
    form.addEventListener( 'browser:change', onBrowser );

    // The script waits for window.Core with setInterval: here it finds it at once. Its listeners on document are
    // taken down at the end of the step.
    const added = [];
    const listen = document.addEventListener;
    document.addEventListener = function ( type, fn, capture ) {
        added.push( [ type, fn, capture ] );
        return listen.apply( this, arguments );
    };
    const fakeInterval = ( fn ) => { fn(); return 0; };
    try {
        new Function( 'setInterval', 'clearInterval', variant === 'old' ? oldDialog : newDialog() )( fakeInterval, () => {} );
    } finally {
        document.addEventListener = listen;
    }
    const close = () => {
        for ( const [ type, fn, capture ] of added ) document.removeEventListener( type, fn, capture );
        jQuery( form ).off( 'change' );
    };
    return { seen, model, view, close };
}

const modal = () => document.getElementById( 'exp-content-browser-modal' );

/** What the dialog shows and how it stands. */
function snapshot() {
    const m = modal();
    if ( !m ) return null;
    return {
        // Core.ui.dialog gives the title an id for aria-labelledby (the dialog's name)
        html: m.querySelector( '.modal-content' ).innerHTML.replace( / id="ngl-dialog-title-\d+"/, '' ),
        search: m.querySelector( '.exp-cb-search input' ).value,
        classes: m.className,
        display: m.style.display,
        parent: m.parentNode.id,
        bodyOpen: document.body.classList.contains( 'modal-open' ),
        backdrops: [ ...document.querySelectorAll( '.modal-backdrop' ) ].map( ( el ) => el.className ),
        focus: document.activeElement === m ? 'dialog' : document.activeElement && document.activeElement.className
    };
}

/** The requests sent since the last call, without the answer function. */
function takeRequests() {
    const out = requests.splice( 0 ).map( ( r ) => {
        const { answer, ...rest } = r;
        lastAnswer = answer;
        return rest;
    } );
    return out;
}
let lastAnswer = null;
const answer = async ( status, data ) => { lastAnswer( status, JSON.stringify( data ) ); await wait( 5 ); };

const click = ( el ) => el.dispatchEvent( new MouseEvent( 'click', { bubbles: true, cancelable: true } ) );
const key = ( el, keyCode ) => el.dispatchEvent( new KeyboardEvent( 'keydown', { bubbles: true, cancelable: true, keyCode, which: keyCode } ) );

/** Runs the steps on both versions and compares every record. */
async function differential( steps, options ) {
    const records = {};
    for ( const variant of [ 'old', 'new' ] ) {
        const p = page( variant, options );
        const log = [];
        try {
            await steps( p, ( label, value ) => log.push( [ label, value ] ) );
        } finally {
            p.close();
        }
        records[ variant ] = { log, seen: p.seen };
    }
    assert.deepEqual( records.new.log, records.old.log );
    return records;
}

test( '+ Add items: open, browse, breadcrumb, search, select and add send the same requests and show the same', async () => {
    const { new: now } = await differential( async ( p, record ) => {
        click( document.querySelector( '.add-items' ) );
        record( 'loading', snapshot() );
        record( 'request open', takeRequests() );
        await answer( 200, VALUES );
        await settle();
        record( 'shown', snapshot() );

        click( modal().querySelector( '.js-cb-browse' ) );
        record( 'request browse', takeRequests() );
        await answer( 200, { values: [ { node_id: 70, object_id: 71, name: 'Inner', class_name: 'Article' } ] } );
        record( 'browsed', snapshot() );

        click( modal().querySelector( '.exp-cb-breadcrumbs a[data-idx="0"]' ) );
        record( 'request breadcrumb', takeRequests() );
        await answer( 200, VALUES );
        record( 'back', snapshot() );

        const input = modal().querySelector( '.exp-cb-search input' );
        input.value = 'Fo & "o"';
        input.dispatchEvent( new Event( 'change', { bubbles: true } ) );
        record( 'no request on change', takeRequests() );
        key( input, 13 );
        record( 'request search', takeRequests() );
        await answer( 200, VALUES );
        record( 'searched', snapshot() );

        modal().querySelectorAll( '.js-cb-select' )[ 0 ].checked = true;
        modal().querySelectorAll( '.js-cb-select' )[ 2 ].checked = true;
        click( modal().querySelector( '.exp-cb-apply' ) );
        record( 'request add', takeRequests() );
        await answer( 200, {} );
        await settle();
        record( 'closed', snapshot() );
        record( 'fetch_results', p.seen.fetchResults );
    } );
    assert.equal( now.seen.fetchResults, 1 );
    const add = now.log.find( ( [ label ] ) => label === 'request add' )[ 1 ][ 0 ];
    assert.equal( add.url, '/admin/explayouts_ui_api/app/api/ger/blocks/b7/collections/default/items' );
    assert.equal( add.method, 'POST' );
    assert.equal( add.headers[ 'X-CSRF-Token' ], 'csrf-123' );
    assert.deepEqual( JSON.parse( add.body ), { items: [
        { value: 62, value_type: 'ez_location', item_type: 'manual', position: 3 },
        { value: 60, value_type: 'ez_location', item_type: 'manual', position: 3 } ] } );
    const shown = now.log.find( ( [ label ] ) => label === 'shown' )[ 1 ];
    assert.equal( shown.display, 'block' );
    assert.equal( shown.focus, 'dialog' );
    assert.match( shown.classes, /\bin\b/ );
    assert.deepEqual( shown.backdrops, [ 'modal-backdrop fade in' ] );
    // markup and quotes of the server's values stay text
    assert.ok( shown.html.includes( 'data-name="Folder &quot;A&quot; <b>"' ), shown.html );
} );

test( 'Every text of the dialog is escaped, quotes too', async () => {
    const { new: now } = await differential( async ( p, record ) => {
        click( document.querySelector( '.add-items' ) );
        takeRequests();
        await answer( 200, VALUES );
        const m = modal();
        record( 'title', m.querySelector( '.modal-title' ).textContent );
        record( 'placeholder', m.querySelector( '.exp-cb-search input' ).getAttribute( 'placeholder' ) );
        record( 'cancel', m.querySelector( '.exp-cb-cancel' ).textContent );
        record( 'names', [ ...m.querySelectorAll( '.js-cb-select' ) ].map( ( el ) => el.getAttribute( 'data-name' ) ) );
        record( 'labels', [ ...m.querySelectorAll( 'label' ) ].map( ( el ) => el.textContent ) );
        record( 'bold', m.querySelectorAll( '.exp-cb-list b' ).length );
        click( m.querySelector( '.exp-cb-cancel' ) );
        await settle();
    } );
    assert.deepEqual( now.log.find( ( [ l ] ) => l === 'names' )[ 1 ], [ 'Folder "A" <b>', "It's 7", 'Third' ] );
    assert.equal( now.log.find( ( [ l ] ) => l === 'placeholder' )[ 1 ], 'Search <here>' );
    assert.equal( now.log.find( ( [ l ] ) => l === 'bold' )[ 1 ], 0 );
} );

test( 'Cancel, Escape and a click beside the dialog close it; a click inside does not', async () => {
    await differential( async ( p, record ) => {
        for ( const how of [ 'cancel', 'escape', 'backdrop', 'press in dialog, release beside' ] ) {
            click( document.querySelector( '.add-items' ) );
            takeRequests();
            await answer( 200, VALUES );
            await settle();
            click( modal().querySelector( '.modal-body' ) );
            await settle();
            record( how + ': click inside', snapshot() );
            if ( how === 'cancel' ) click( modal().querySelector( '.exp-cb-cancel' ) );
            if ( how === 'escape' ) key( modal().querySelector( '.exp-cb-search input' ), 27 );
            if ( how === 'backdrop' ) click( modal() );
            if ( how === 'press in dialog, release beside' ) {
                modal().querySelector( '.modal-body' ).dispatchEvent( new MouseEvent( 'mousedown', { bubbles: true } ) );
                modal().dispatchEvent( new MouseEvent( 'mouseup', { bubbles: true } ) );
                click( modal() );
                await settle();
                record( how + ': stays', snapshot() );
                click( modal().querySelector( '.exp-cb-cancel' ) );
            }
            await settle();
            record( how + ': closed', snapshot() );
        }
        record( 'requests', takeRequests() );
    } );
} );

test( 'Cancel and at once + Add items again: the dialog is open, with one backdrop', async () => {
    const p = page( 'new' );
    try {
        click( document.querySelector( '.add-items' ) );
        takeRequests();
        await answer( 200, VALUES );
        await settle();
        click( modal().querySelector( '.exp-cb-cancel' ) );
        await wait( 60 );
        click( document.querySelector( '.add-items' ) );
        takeRequests();
        await answer( 200, VALUES );
        await settle();
        const now = snapshot();
        assert.equal( now.display, 'block' );
        assert.deepEqual( now.backdrops, [ 'modal-backdrop fade in' ] );
        assert.ok( now.bodyOpen );
        assert.equal( modal().hasAttribute( 'aria-hidden' ), false );
        assert.ok( / in\b/.test( now.classes ), now.classes );
        click( modal().querySelector( '.exp-cb-cancel' ) );
        await settle();
        assert.equal( modal().style.display, 'none' );
        assert.equal( document.querySelectorAll( '.modal-backdrop' ).length, 0 );
    } finally {
        p.close();
    }
} );

test( 'Adding nothing closes the dialog without a request; a failed add says so', async () => {
    const { new: now } = await differential( async ( p, record ) => {
        click( document.querySelector( '.add-items' ) );
        takeRequests();
        await answer( 200, VALUES );
        await settle();
        click( modal().querySelector( '.exp-cb-apply' ) );
        await settle();
        record( 'nothing chosen', [ snapshot(), takeRequests() ] );

        click( document.querySelector( '.add-items' ) );
        takeRequests();
        await answer( 200, VALUES );
        await settle();
        modal().querySelectorAll( '.js-cb-select' )[ 1 ].checked = true;
        click( modal().querySelector( '.exp-cb-apply' ) );
        record( 'request', takeRequests() );
        await answer( 500, { error: 'x' } );
        await settle();
        record( 'failed', [ snapshot(), p.seen.alerts, p.seen.fetchResults ] );
    } );
    assert.deepEqual( now.seen.alerts, [ 'Adding failed' ] );
} );

test( 'A list that cannot be loaded or is empty says so', async () => {
    await differential( async ( p, record ) => {
        click( document.querySelector( '.add-items' ) );
        takeRequests();
        await answer( 403, { reason: 'access_denied' } );
        record( 'failed', snapshot() );
        const input = modal().querySelector( '.exp-cb-search input' );
        input.value = 'none';
        key( input, 13 );
        takeRequests();
        await answer( 200, { values: [] } );
        record( 'empty', snapshot() );
        click( modal().querySelector( '.exp-cb-cancel' ) );
        await settle();
    } );
} );

test( 'A browse field: choosing content sets the value, the name, the link and tells the form', async () => {
    for ( const itemType of [ 'exp_content', 'exp_location' ] ) {
        const { new: now, old } = await differential( async ( p, record ) => {
            click( document.querySelector( '.js-trigger' ) );
            record( 'request', takeRequests() );
            await answer( 200, VALUES );
            await settle();
            record( 'shown', snapshot() );
            modal().querySelectorAll( '.js-cb-select' )[ 1 ].checked = true;
            click( modal().querySelector( '.exp-cb-apply' ) );
            await settle();
            const wrap = document.querySelector( '.exp-input-browse' );
            record( 'field', {
                value: wrap.querySelector( '.js-value' ).value, name: wrap.querySelector( '.js-name' ).textContent,
                empty: wrap.classList.contains( 'item-empty' ), href: document.querySelector( '.js-view-cms' ).getAttribute( 'href' ),
                link: document.querySelector( '.js-view-cms' ).style.display
            } );
            record( 'events', [ p.seen.jqChange, p.seen.browserChange ] );
            record( 'closed', snapshot() );
            record( 'requests', takeRequests() );
        }, { itemType } );
        const field = now.log.find( ( [ l ] ) => l === 'field' )[ 1 ];
        assert.equal( field.value, itemType === 'exp_location' ? '61' : '59' );
        assert.equal( field.name, "It's 7" );
        assert.equal( field.href, 'https://example.test/admin/content/view/full/61' );
        const shown = now.log.find( ( [ l ] ) => l === 'shown' )[ 1 ];
        assert.ok( shown.html.includes( 'Select: Teaser target' ), 'title from the label' );
        assert.ok( shown.html.includes( 'type="radio"' ) );
        assert.deepEqual( now.seen.browserChange, [ true ] );
        // The change event is native now: listeners of the DOM layer get it as before, addEventListener too.
        assert.equal( now.seen.jqChange, 2 );
        assert.equal( now.seen.nativeChange, 2 );
        assert.equal( old.seen.nativeChange, 0, 'jQuery .trigger() reached no native listener' );
    }
} );

test( 'A browse field: clearing empties it, hides the link and tells the form', async () => {
    const { new: now } = await differential( async ( p, record ) => {
        click( document.querySelector( '.js-clear' ) );
        const wrap = document.querySelector( '.exp-input-browse' );
        record( 'field', {
            value: wrap.querySelector( '.js-value' ).value, name: wrap.querySelector( '.js-name' ).textContent,
            empty: wrap.classList.contains( 'item-empty' ), link: document.querySelector( '.js-view-cms' ).style.display
        } );
        record( 'events', [ p.seen.jqChange, p.seen.browserChange ] );
        record( 'dialog', snapshot() );
        record( 'requests', takeRequests() );
    } );
    assert.deepEqual( now.log[ 0 ][ 1 ], { value: '', name: 'Pick one', empty: true, link: 'none' } );
    assert.equal( now.seen.nativeChange, 2 );
} );

test( 'Closing the dialog gives the focus back to where it was', async () => {
    const p = page( 'new' );
    try {
        const trigger = document.querySelector( '.js-trigger' );
        trigger.focus();
        click( trigger );
        takeRequests();
        await answer( 200, VALUES );
        await settle();
        assert.equal( document.activeElement, modal() );
        // the focus does not leave the open dialog
        document.querySelector( '.add-items' ).focus();
        assert.equal( document.activeElement, modal() );
        key( modal(), 27 );
        await settle();
        assert.equal( document.activeElement, trigger );
        assert.equal( document.body.classList.contains( 'modal-open' ), false );
        assert.equal( document.querySelectorAll( '.modal-backdrop' ).length, 0 );
    } finally {
        p.close();
    }
} );

test( 'The dialog code does not use jQuery or Bootstrap JS', () => {
    const code = newDialog().replace( /\/\/.*$/gm, '' );
    assert.doesNotMatch( code, /jQuery|\.modal\(|\$\(/ );
    // through the app: its requests (Core.$.ajax) and its dialogs (Core.ui.dialog); the view an element has, as el.ngl_view
    assert.deepEqual( code.match( /Core\.[\w$]+(\.\w+)?/g ).filter( ( x, i, all ) => all.indexOf( x ) === i ).sort(),
                      [ 'Core.$.ajax', 'Core.g', 'Core.g.config', 'Core.ui.dialog' ] );
    assert.match( code, /el\.ngl_view/ );
} );
