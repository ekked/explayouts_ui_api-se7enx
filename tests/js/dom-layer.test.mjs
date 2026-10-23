/**
 * The layout editor's DOM layer (module jquery of design/standard/javascript/netgen-layouts.js, patch
 * src/app-patches/modules/140-jquery.js), on its own: collections and traversal, events (delegation, namespaces,
 * trigger, native events), data, forms, $.ajax with its global events, $.Deferred and $.when. Where jQuery 4 can say
 * what is right, the same steps run on both and the results are compared.
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
const bundle = parseBundle( readFileSync( resolve( root, 'design/standard/javascript/netgen-layouts.js' ), 'utf8' ) );

function bundleModule( name, deps = {} ) {
    let id = null;
    for ( const m of bundle.modules.values() ) if ( name in m.deps ) id = String( m.deps[ name ] );
    const module = { exports: {} };
    ( 0, eval )( '(' + bundle.modules.get( id ).source + ')' ).call( module.exports, ( dep ) => deps[ dep ], module, module.exports );
    return module.exports;
}

let $, jQuery, xhrs;
const wait = ( ms = 0 ) => new Promise( ( done ) => setTimeout( done, ms ) );

before( async () => {
    GlobalRegistrator.register( { url: 'https://example.test/admin/explayouts_ui_api/app' } );
    window.Element.prototype.toString = function () { return '[object ' + this.constructor.name + ']'; };
    // as in support/editor-page.mjs: happy-dom's selectedIndex of a select in a form put in by innerHTML is -1 although
    // an option is selected; jQuery's val() reads it, a browser answers the index
    Object.defineProperty( window.HTMLSelectElement.prototype, 'selectedIndex', {
        configurable: true,
        get() { return Array.prototype.findIndex.call( this.options, ( o ) => o.selected ); },
        set( i ) { Array.prototype.forEach.call( this.options, ( o, k ) => { o.selected = k === i; } ); }
    } );
    $ = bundleModule( 'jquery', { 101: bundleModule( 'bootstrap/js/transition' ) } );
    const { jQueryFactory } = await import( 'jquery/factory' );
    jQuery = jQueryFactory( window );
    // requests stay open until the test answers them
    window.XMLHttpRequest = class {
        open( method, url ) { Object.assign( this, { method, url, headers: {}, aborted: false } ); }
        setRequestHeader( name, value ) { this.headers[ name ] = value; }
        getResponseHeader( name ) { return /^content-type$/i.test( name ) ? this.type || null : null; }
        getAllResponseHeaders() { return ''; }
        abort() { this.aborted = true; }
        send( body ) {
            this.body = body;
            this.answer = ( status, text, type = 'application/json' ) => {
                Object.assign( this, { status, statusText: status === 200 ? 'OK' : 'Bad', responseText: text, type } );
                this.onload();
            };
            xhrs.push( this );
        }
    };
} );

after( () => GlobalRegistrator.unregister() );

beforeEach( () => {
    xhrs = [];
    document.body.innerHTML = '<div id="root" class="a"><ul id="list"><li id="i1" class="x">1</li><li id="i2">2 <b>b</b></li>'
        + '<li id="i3" class="x" data-n="7" data-on="true" data-j=\'{"a":1}\' data-s="text" data-null="null" data-two-words="w">3</li></ul>'
        + '<p id="p"><span id="s">s</span></p></div>';
} );

const ids = ( c ) => c.toArray().map( ( el ) => el.id || el.nodeName );

test( 'collections and traversal as jQuery', () => {
    for ( const [ label, run ] of [
        [ 'find', ( q ) => q( '#root' ).find( 'li.x' ) ],
        [ 'find > relative', ( q ) => q( '#root' ).find( '> ul > li' ) ],
        [ 'context', ( q ) => q( 'li', document.getElementById( 'list' ) ) ],
        [ 'closest', ( q ) => q( 'b, #s' ).closest( 'li, p' ) ],
        [ 'parents', ( q ) => q( '#s' ).parents() ],
        [ 'parents filtered', ( q ) => q( 'b' ).parents( 'ul, div' ) ],
        [ 'parent', ( q ) => q( 'li' ).parent() ],
        [ 'children', ( q ) => q( '#root' ).children( 'ul' ) ],
        [ 'siblings', ( q ) => q( '#i2' ).siblings() ],
        [ 'next', ( q ) => q( '#i1, #i3' ).next() ],
        [ 'filter', ( q ) => q( 'li' ).filter( '.x' ) ],
        [ 'filter fn', ( q ) => q( 'li' ).filter( function ( i ) { return i === 1; } ) ],
        [ 'eq', ( q ) => q( 'li' ).eq( -1 ) ],
        [ 'first', ( q ) => q( 'li' ).first() ]
    ] ) {
        assert.deepEqual( ids( run( $ ) ), ids( run( jQuery ) ), label );
    }
    assert.equal( $( '#i3' ).index(), jQuery( '#i3' ).index() );
    assert.equal( $( 'li' ).index( document.getElementById( 'i2' ) ), 1 );
    assert.deepEqual( $( 'li' ).map( function () { return this.id; } ).get(), [ 'i1', 'i2', 'i3' ] );
    assert.equal( $( 'li' ).get( -1 ).id, 'i3' );
    const created = $( '<div>', { height: 12, title: 'T' } );
    assert.equal( created[ 0 ].style.height, '12px' );
    assert.equal( created.attr( 'title' ), 'T' );
    assert.equal( $( ' <i>a</i><b>b</b>' ).length, 2 );
    assert.ok( $( document.body ) instanceof $, 'instanceof, as Backbone checks' );
    assert.equal( $( $( '#p' ) )[ 0 ].id, 'p' );
} );

test( 'classes, attributes, data and values as jQuery', () => {
    for ( const q of [ $, jQuery ] ) q( '#p' ).removeClass( 'none' );
    assert.equal( document.getElementById( 'p' ).hasAttribute( 'class' ), false, 'no class attribute written for nothing' );
    $( '#p' ).addClass( 'one two' ).removeClass( 'one' );
    assert.equal( document.getElementById( 'p' ).className, 'two' );
    assert.equal( $( 'li' ).hasClass( 'x' ), true );
    assert.equal( $( '#p' ).attr( 'missing' ), jQuery( '#p' ).attr( 'missing' ) );
    $( '#p' ).attr( { role: 'tab', 'aria-selected': true } ).attr( 'role', null );
    assert.deepEqual( [ $( '#p' ).attr( 'role' ), $( '#p' ).attr( 'aria-selected' ) ], [ undefined, 'true' ] );
    for ( const key of [ 'n', 'on', 'j', 's', 'null', 'twoWords', 'two-words', 'missing' ] ) {
        document.body.insertAdjacentHTML( 'beforeend', '<i id="d1" data-n="7" data-on="true" data-j=\'{"a":1}\' data-s="text" data-null="null" data-two-words="w"></i>' );
        const a = $( '#d1' ).data( key ), b = jQuery( '#i3' ).data( key );
        document.getElementById( 'd1' ).remove();
        assert.deepEqual( a, b, 'data ' + key );
    }
    $( '#i1' ).data( 'k', 5 ).data( { m: 6 } );
    assert.deepEqual( [ $( '#i1' ).data( 'k' ), $( '#i1' ).data( 'm' ) ], [ 5, 6 ] );
    $( '#i1' ).removeData( 'k' );
    assert.equal( $( '#i1' ).data( 'k' ), undefined );
    // the view of an element is its ngl_view
    const view = {};
    $( '#i1' ).data( '_view', view );
    assert.equal( document.getElementById( 'i1' ).ngl_view, view );
    document.getElementById( 'i2' ).ngl_view = view;
    assert.equal( $( '#i2' ).data( '_view' ), view );
    $( '#list' ).remove();
    assert.equal( document.getElementById( 'i1' ), null );

    document.body.innerHTML = '<form><input name="a" value="x y"><input name="b" type="checkbox" value="1" checked>'
        + '<input name="c" type="checkbox"><input name="d" disabled value="no"><select name="e[]" multiple><option selected>1</option>'
        + '<option selected>2</option><option>3</option></select><select name="f"><option value="v" selected>V</option></select>'
        + '<textarea name="g">l1\nl2</textarea><input type="submit" name="h" value="s"><input type="file" name="i"></form>';
    for ( const [ label, run ] of [
        [ 'serialize', ( q ) => q( 'form' ).serialize() ],
        [ 'serializeArray', ( q ) => q( 'form' ).serializeArray() ],
        [ 'serialize of controls', ( q ) => q( 'input' ).serialize() ],
        [ 'val select multiple', ( q ) => q( 'select[multiple]' ).val() ],
        [ 'val select', ( q ) => q( 'select[name="f"]' ).val() ],
        [ 'param', ( q ) => q.param( { a: 1, b: [ 1, 2 ], c: { d: 'x y' }, e: null, f: [ { g: 1 } ] } ) ],
        [ 'extend', ( q ) => q.extend( true, { a: { b: 1 } }, { a: { c: 2 }, d: [ 1 ] } ) ],
        [ 'inArray', ( q ) => q.inArray( 2, [ 1, 2 ] ) ]
    ] ) {
        assert.deepEqual( run( $ ), run( jQuery ), label );
    }
    $( 'input[name="a"]' ).val( '' ).val( 3 );
    assert.equal( document.querySelector( 'input[name="a"]' ).value, '3' );
    $( 'select[name="f"]' ).val( 'none' );
    const ours = document.querySelector( 'select[name="f"]' ).selectedIndex;
    jQuery( 'select[name="f"]' ).val( 'v' ).val( 'none' );
    assert.equal( ours, document.querySelector( 'select[name="f"]' ).selectedIndex, 'a value no option has: as jQuery' );
} );

test( 'html, append, after, replaceWith, empty: what is taken out loses its handlers and data', () => {
    let clicks = 0;
    const li = document.getElementById( 'i1' );
    $( li ).on( 'click', () => clicks++ ).data( 'k', 1 );
    li.ngl_view = {};
    $( '#list' ).html( '<li id="n1">n</li>' );
    li.click();
    assert.equal( clicks, 0, 'the handlers of what html() replaced are gone' );
    assert.equal( li.ngl_view, undefined );
    $( '#list' ).append( [ $( '<li id="n2"></li>' ), '<li id="n3"></li>', document.createElement( 'li' ) ] );
    assert.deepEqual( ids( $( '#list' ).children() ), [ 'n1', 'n2', 'n3', 'LI' ] );
    $( '#n1' ).after( '<li id="a1"></li>' );
    $( '#n3' ).replaceWith( $( '<li id="r3"></li>' ) );
    assert.deepEqual( ids( $( '#list' ).children() ).slice( 0, 4 ), [ 'n1', 'a1', 'n2', 'r3' ] );
    $( '#list, #p' ).append( '<i class="twice"></i>' );
    assert.equal( document.querySelectorAll( '.twice' ).length, 2, 'copies for every target but the last' );
    $( '#list' ).html( [ document.createElement( 'em' ) ] );
    assert.equal( document.getElementById( 'list' ).innerHTML, '<em></em>' );
    $( '#p' ).text( '<b>' );
    assert.equal( document.getElementById( 'p' ).innerHTML, '&lt;b&gt;' );
    $( '#p' ).empty();
    assert.equal( document.getElementById( 'p' ).childNodes.length, 0 );
} );

test( 'events: delegation in jQuery\'s order, currentTarget, return false, namespaces, focus by focusin', () => {
    const run = ( q ) => {
        document.body.innerHTML = '<div id="root"><div class="block-header"><a class="js-copy" id="a"><b id="b">x</b></a></div><div><a class="js-copy" id="deep">y</a></div></div>';
        const log = [];
        const root = q( '#root' );
        root.on( 'click.ns1', ( e ) => log.push( 'direct ' + e.currentTarget.id + ' ' + e.delegateTarget.id ) );
        root.on( 'click.ns2', 'a', function ( e ) { log.push( 'a ' + this.id + ' ' + e.currentTarget.id + ' ' + e.target.id ); } );
        root.on( 'click', '> .block-header .js-copy', ( e ) => log.push( 'relative ' + e.currentTarget.id ) );
        root.on( 'custom', ( e, x, y ) => log.push( 'custom ' + x + ' ' + y ) );
        document.getElementById( 'b' ).click();
        document.getElementById( 'deep' ).click();
        root.off( '.ns2' );
        document.getElementById( 'b' ).click();
        root.find( '#b' ).trigger( 'custom', [ 1, 2 ] );
        root.on( 'click', 'b', () => false );
        const ev = new MouseEvent( 'click', { bubbles: true, cancelable: true } );
        document.getElementById( 'b' ).dispatchEvent( ev );
        log.push( 'prevented ' + ev.defaultPrevented );
        root.off();
        document.getElementById( 'b' ).click();
        return log;
    };
    assert.deepEqual( run( $ ), run( jQuery ) );

    // trigger reaches addEventListener listeners too, with the arguments as detail
    const detail = [];
    document.body.addEventListener( 'browser:change', ( e ) => detail.push( e.detail ) );
    $( '#root' ).trigger( 'browser:change', [ 'x' ] );
    assert.deepEqual( detail, [ [ 'x' ] ] );
    // and native events reach the layer's handlers
    const got = [];
    $( document.body ).on( 'change', 'input', ( e ) => got.push( e.type + ' ' + e.currentTarget.nodeName ) );
    document.body.insertAdjacentHTML( 'beforeend', '<input id="in">' );
    document.getElementById( 'in' ).dispatchEvent( new Event( 'change', { bubbles: true } ) );
    // a delegated focus listens to focusin
    $( document.body ).on( 'focus', 'input', ( e ) => got.push( 'focus ' + e.currentTarget.id ) );
    $( '#in' ).trigger( 'focus' );
    assert.deepEqual( got, [ 'change INPUT', 'focus in' ] );
    assert.equal( document.activeElement.id, 'in', 'trigger( "focus" ) focuses' );
} );

test( '$.ajax: requests, headers, callbacks and global events in jQuery\'s order', async () => {
    const log = [];
    const doc = $( document );
    const handlers = {
        ajaxStart: () => log.push( 'start ' + $.active ),
        ajaxSend: ( e, xhr, s ) => log.push( 'send ' + s.type + ' ' + s.url ),
        ajaxSuccess: () => log.push( 'success' ),
        ajaxError: ( e, xhr, s, err ) => log.push( 'error ' + xhr.status + ' ' + err ),
        ajaxComplete: () => log.push( 'complete' ),
        ajaxStop: () => log.push( 'stop ' + $.active )
    };
    for ( const name in handlers ) doc[ name ]( handlers[ name ] );

    const get = $.ajax( { url: '/admin/x?a=1#h', data: { b: 'c d' }, dataType: 'json', success: ( d ) => log.push( 'success cb ' + d.ok ) } );
    get.done( ( d, status, xhr ) => log.push( 'done ' + status + ' ' + ( xhr === get ) ) ).always( () => log.push( 'always' ) );
    get.then( ( d ) => log.push( 'then ' + d.ok ) );
    assert.equal( xhrs[ 0 ].url, '/admin/x?a=1&b=c%20d#h' );
    assert.deepEqual( xhrs[ 0 ].headers, { Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' } );
    xhrs[ 0 ].answer( 200, '{"ok":true}' );
    log.push( 'answered' );
    await wait( 5 );
    assert.deepEqual( log, [ 'start 1', 'send GET /admin/x?a=1&b=c%20d#h', 'success cb true', 'done success true', 'always',
                             'success', 'complete', 'stop 0', 'answered', 'then true' ] );
    assert.deepEqual( get.responseJSON, { ok: true } );

    log.length = 0;
    const post = $.ajax( { url: '/admin/y', method: 'post', data: 'a=1%20b', headers: { 'X-CSRF-Token': 't' } } );
    assert.equal( xhrs[ 1 ].body, 'a=1+b', '%20 sent as + in a form body' );
    assert.equal( xhrs[ 1 ].headers[ 'Content-Type' ], 'application/x-www-form-urlencoded; charset=UTF-8' );
    assert.equal( xhrs[ 1 ].headers[ 'X-CSRF-Token' ], 't' );
    post.fail( ( xhr, status ) => log.push( 'fail ' + status + ' ' + xhr.responseJSON.error ) );
    xhrs[ 1 ].answer( 403, '{"error":"no"}' );
    assert.deepEqual( log, [ 'start 1', 'send POST /admin/y', 'fail error no', 'error 403 Bad', 'complete', 'stop 0' ] );

    log.length = 0;
    const json = $.ajax( { url: '/admin/z', type: 'DELETE', contentType: 'application/json', data: '{}', processData: false } );
    assert.equal( xhrs[ 2 ].headers[ 'Content-Type' ], 'application/json' );
    json.done( ( d, status ) => log.push( 'deleted ' + status + ' ' + d ) );
    xhrs[ 2 ].answer( 204, '' );
    assert.ok( log.includes( 'deleted nocontent undefined' ) );

    log.length = 0;
    const aborted = $.ajax( { url: '/admin/slow' } );
    aborted.fail( ( xhr, status ) => log.push( 'aborted ' + xhr.status + ' ' + status ) );
    aborted.abort();
    assert.equal( xhrs[ 3 ].aborted, true );
    assert.ok( log.includes( 'aborted 0 canceled' ), log.join( ' | ' ) );
    assert.equal( $.active, 0 );

    log.length = 0;
    const html = $.get( '/admin/form' );
    html.done( ( d ) => log.push( 'html ' + d ) );
    xhrs[ 4 ].answer( 200, '<form></form>', 'text/html' );
    assert.ok( log.includes( 'html <form></form>' ) );
    const bad = $.ajax( { url: '/admin/bad', dataType: 'json' } );
    bad.fail( ( xhr, status ) => log.push( 'bad ' + status ) );
    xhrs[ 5 ].answer( 200, 'not json' );
    assert.ok( log.includes( 'bad parsererror' ) );
    assert.equal( $.ajax( { url: '/admin/no', beforeSend: () => false } ).statusText, 'canceled' );
    assert.equal( xhrs.length, 6, 'beforeSend returning false sends nothing' );
    for ( const name in handlers ) doc.off( name );
} );

test( '$.Deferred and $.when as jQuery 3+: done at once, then later, with all arguments', async () => {
    const run = async ( q ) => {
        const log = [];
        const a = q.Deferred(), b = q.Deferred();
        a.done( ( x, y ) => log.push( 'done ' + x + y ) );
        a.then( ( x, y ) => { log.push( 'then ' + x + y ); return b; } ).then( ( v ) => log.push( 'adopted ' + v ) );
        q.when( a, b, 3 ).done( ( ra, rb, c ) => log.push( 'when ' + JSON.stringify( [ ra, rb, c ] ) ) );
        q.when( a ).then( ( x, y ) => log.push( 'when one ' + x + y ) );
        a.resolve( 1, 2 );
        log.push( 'sync' );
        a.done( () => log.push( 'late done' ) );
        await wait( 5 );
        b.resolve( 'B' );
        await wait( 5 );
        const c = q.Deferred();
        c.then( () => { throw new Error( 'x' ); } ).catch( ( e ) => log.push( 'caught ' + e.message ) );
        c.fail( () => log.push( 'never' ) ).resolve();
        q.Deferred().reject( 'r' ).then( null, ( r ) => log.push( 'rejected ' + r ) );
        await wait( 5 );
        return log;
    };
    assert.deepEqual( await run( $ ), await run( jQuery ) );
} );

test( 'fadeIn and fadeOut queue as jQuery\'s: the last one wins, also when it comes during a fade', async () => {
    const el = document.getElementById( 'p' );
    $( el ).fadeOut( 20 );
    $( el ).css( { display: 'flex' } ).fadeIn( 1 );
    $( el ).fadeOut( 20 );
    await wait( 80 );
    assert.equal( el.style.display, 'none' );
    $( el ).css( { display: 'flex' } ).fadeIn( 1 );
    await wait( 10 );
    assert.equal( el.style.display, 'flex' );
    $( el ).hide();
    assert.equal( el.style.display, 'none' );
    $( el ).show();
    assert.equal( el.style.display, 'flex', 'show() gives back the display it had' );
} );
