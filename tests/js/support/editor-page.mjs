/**
 * The layout editor's page in happy-dom, for tests that run the whole app: app.tpl's markup and scripts in the order
 * the page runs them (explayouts-app-head.js and explayouts-app.js blocking, then the deferred explayouts-tiptap.js,
 * netgen-layouts.js and explayouts-mobile.js), with a fake server behind XMLHttpRequest and fetch.
 *
 *   const page = await openEditor( { hash: '#layout/1/edit', api, jQuery } )
 *
 * api( request ) answers a request { method, url, path, query, headers, body, json() } with { status, body } (an object
 * is sent as JSON) or with undefined (404). jQuery: async ( window ) => a jQuery function to put on the page before
 * the bundle, as ezjscore did until the editor ran without it, and for the bundle in place of its DOM layer
 * (JQUERY_MODULE; for comparisons); left out, the page has no jQuery.
 * afterBundle( page ): called after netgen-layouts.js ran, before the page is ready.
 * page.requests lists every request; page.settle() waits until no request is open and no timer of the app is due.
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { parseBundle, replaceModules } from '../../../src/app-patches/bundle.mjs';

export const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '../../..' );
const script = ( name ) => readFileSync( resolve( root, 'design/standard/javascript', name ), 'utf8' );

/**
 * For the comparison with jQuery: module jquery (140) is the page's jQuery again, as until 1.3.29, with .data( '_view' )
 * on the element's ngl_view as the DOM layer keeps it (./extended/view sets only that now).
 */
export const JQUERY_MODULE = 'function(e,t,n){var $=window.jQuery,d=$.fn.data,r=$.fn.removeData;'
    + '$.fn.data=function(k,v){if(k!=="_view")return d.apply(this,arguments);if(v===undefined)return this[0]?this[0].ngl_view:void 0;return this.each(function(){this.ngl_view=v})};'
    + '$.fn.removeData=function(k){return k==="_view"?this.each(function(){delete this.ngl_view}):r.apply(this,arguments)};t.exports=$}';

function bundleWithJQuery() {
    const parsed = parseBundle( script( 'netgen-layouts.js' ) );
    return parsed.header + replaceModules( parsed, { 140: JQUERY_MODULE } );
}

export const BASE = '/admin/explayouts_ui_api';
export const TOKEN = 'form-token-1';

/** A stand-in for the browser's XMLHttpRequest: each request goes to the page's fake server, answered after a tick. */
function fakeXhr( page ) {
    return class FakeXMLHttpRequest extends EventTarget {
        static UNSENT = 0; static OPENED = 1; static HEADERS_RECEIVED = 2; static LOADING = 3; static DONE = 4;
        constructor() {
            super();
            this.readyState = 0; this.status = 0; this.statusText = ''; this.responseText = ''; this.response = '';
            this.responseType = ''; this.timeout = 0; this.withCredentials = false; this.upload = new EventTarget();
            this.onload = this.onerror = this.onabort = this.ontimeout = this.onreadystatechange = this.onloadend = null;
            this._headers = {}; this._responseHeaders = {};
        }
        open( method, url ) { this._method = String( method ).toUpperCase(); this._url = String( url ); this.readyState = 1; }
        setRequestHeader( name, value ) {
            const key = String( name ).toLowerCase();
            this._headers[ key ] = key in this._headers ? this._headers[ key ] + ', ' + value : String( value );
        }
        getResponseHeader( name ) { return this._responseHeaders[ String( name ).toLowerCase() ] ?? null; }
        getAllResponseHeaders() {
            return Object.entries( this._responseHeaders ).map( ( [ k, v ] ) => k + ': ' + v + '\r\n' ).join( '' );
        }
        overrideMimeType() {}
        abort() {
            if ( this.readyState === 4 || this._aborted ) return;
            this._aborted = true; this.readyState = 4; this.status = 0;
            this._fire( 'readystatechange' ); this._fire( 'abort' ); this._fire( 'loadend' );
        }
        _fire( type ) {
            const handler = this[ 'on' + type ];
            const event = new Event( type );
            if ( typeof handler === 'function' ) handler.call( this, event );
            this.dispatchEvent( event );
        }
        send( body ) {
            const request = page.record( this._method, this._url, this._headers, body === undefined ? null : body );
            page.open++;
            setTimeout( async () => {
                try {
                    if ( this._aborted ) return;
                    const answer = await page.answer( request );
                    if ( this._aborted ) return;
                    this.status = answer.status;
                    this.statusText = answer.status === 200 ? 'OK' : String( answer.status );
                    this._responseHeaders = { 'content-type': answer.contentType };
                    this.responseText = this.response = answer.text;
                    this.readyState = 4;
                    this._fire( 'readystatechange' ); this._fire( 'load' ); this._fire( 'loadend' );
                } finally {
                    page.open--;
                }
            }, 0 );
        }
    };
}

/** Normalises an answer of api(): { status, contentType, text }. */
function normalise( answer ) {
    if ( answer === undefined ) return { status: 404, contentType: 'application/json', text: '{"error":"Unknown resource."}' };
    const status = answer.status ?? 200;
    if ( typeof answer.body === 'string' ) return { status, contentType: answer.contentType || 'text/html; charset=utf-8', text: answer.body };
    return { status, contentType: 'application/json', text: answer.body === undefined ? '' : JSON.stringify( answer.body ) };
}

/**
 * @param {{hash?: string, api: Function, jQuery?: Function, afterBundle?: Function}} options
 */
export async function openEditor( options ) {
    GlobalRegistrator.register( { url: 'https://example.test' + BASE + '/app' + ( options.hash || '#layout/1/edit' ),
                                  settings: { navigation: { disableMainFrameNavigation: true },
                                              disableJavaScriptFileLoading: true, disableCSSFileLoading: true } } );
    const page = {
        requests: [], open: 0, errors: [],
        record( method, url, headers, body ) {
            const parsed = new URL( url, window.location.href );
            const text = body == null ? '' : typeof body === 'string' ? body : body instanceof URLSearchParams ? body.toString() : String( body );
            const request = { method, url, path: parsed.pathname, query: Object.fromEntries( parsed.searchParams ), headers, body: text,
                              json: () => JSON.parse( text ),
                              form: () => Object.fromEntries( new URLSearchParams( text ) ) };
            page.requests.push( request );
            return request;
        },
        async answer( request ) { return normalise( await options.api( request ) ); },
        /** Waits until the app has no request open and its timers (up to `ms` each) have run. */
        async settle( ms = 600 ) {
            for ( let i = 0; i < 50; i++ ) {
                await new Promise( ( done ) => setTimeout( done, 0 ) );
                if ( page.open === 0 ) {
                    await new Promise( ( done ) => setTimeout( done, ms ) );
                    if ( page.open === 0 ) return;
                }
            }
            throw new Error( 'requests still open: ' + page.open );
        },
        close: () => GlobalRegistrator.unregister()
    };
    window.addEventListener( 'error', ( e ) => page.errors.push( e.error || e.message ) );
    window.XMLHttpRequest = fakeXhr( page );
    window.fetch = async ( input, init = {} ) => {
        const url = typeof input === 'string' ? input : input.url;
        const headers = {};
        new Headers( init.headers || {} ).forEach( ( v, k ) => { headers[ k ] = v; } );
        const request = page.record( ( init.method || 'GET' ).toUpperCase(), url, headers, init.body ?? null );
        page.open++;
        try {
            await new Promise( ( done ) => setTimeout( done, 0 ) );
            const answer = await page.answer( request );
            return new Response( answer.status === 204 ? null : answer.text, { status: answer.status, headers: { 'Content-Type': answer.contentType } } );
        } finally { page.open--; }
    };
    // happy-dom turns an element into a string as its outerHTML, a browser as "[object HTMLFormElement]": jQuery( [ form ] )
    // then parsed that string into a copy of the form.
    window.Element.prototype.toString = function () { return '[object ' + this.constructor.name + ']'; };
    // happy-dom answers selectedIndex -1 for a select in a form put in by innerHTML, although its option is selected
    // (option.selected, value); a browser answers the option's index. jQuery's val() goes by selectedIndex.
    Object.defineProperty( window.HTMLSelectElement.prototype, 'selectedIndex', {
        configurable: true,
        get() { return Array.prototype.findIndex.call( this.options, ( o ) => o.selected ); },
        set( i ) { Array.prototype.forEach.call( this.options, ( o, k ) => { o.selected = k === i; } ); }
    } );
    // happy-dom has no layout: a window with a size, for the code that measures it.
    window.happyDOM.setViewport( { width: 1280, height: 800 } );

    document.documentElement.lang = 'en';
    document.head.innerHTML = '<meta charset="utf-8">'
        + '<meta name="explayouts-route-prefix" content="' + BASE + '">'
        + '<meta name="explayouts-base-path" content="' + BASE + '">'
        + '<meta name="ngcb-base-path" content="/admin/explayouts_content_browser_ui">'
        + '<meta name="ezxform-token" content="' + TOKEN + '"><title>Layouts</title>';
    document.body.innerHTML = '<script type="application/json" id="explayouts-app-data">'
        + JSON.stringify( { return_to: '/admin/content/view/full/2', site_root: '/admin/', i18n: {
            content: 'Content', add_to_collection: 'Add content to collection', add_selected: 'Add selected',
            select_content: 'Select content', select: 'Select', select_label: 'Select %label', select_item: 'Select item',
            add_failed: 'Failed to add items.', search: 'Search...', cancel: 'Cancel', loading: 'Loading...',
            no_content: 'No content found.', open: 'Open', load_failed: 'Failed to load content.' } } ) + '</script>'
        + '<script type="application/json" id="explayouts-spa-i18n">{}</script>'
        + '<div id="app" class="ngc" data-version="1.3.29 Open Source"></div>'
        + '<a id="ng-cancel-link" href="#">Cancel</a>';

    const run = ( name, text ) => ( 0, eval )( ( text || script( name ) ) + '\n//# sourceURL=' + name );
    run( 'explayouts-app-head.js' );
    // ezjscore's jQuery stood here until the editor ran without it
    if ( options.jQuery ) window.jQuery = await options.jQuery( window );
    run( 'explayouts-app.js' );
    // Deferred, in document order, after the parser is done.
    run( 'explayouts-tiptap.js' );
    run( 'netgen-layouts.js', options.jQuery ? bundleWithJQuery() : null );
    if ( options.afterBundle ) options.afterBundle( page );
    run( 'explayouts-mobile.js' );
    document.dispatchEvent( new Event( 'DOMContentLoaded', { bubbles: true } ) );
    page.Core = window.Core;
    await page.settle();
    return page;
}

/** Clicks an element as a user does: pointer and mouse events, then the click. */
export function click( el ) {
    if ( typeof el === 'string' ) {
        const found = document.querySelector( el );
        if ( !found ) throw new Error( 'nothing to click: ' + el );
        el = found;
    }
    const init = { bubbles: true, cancelable: true, composed: true, button: 0 };
    el.dispatchEvent( new PointerEvent( 'pointerdown', init ) );
    el.dispatchEvent( new MouseEvent( 'mousedown', init ) );
    el.dispatchEvent( new PointerEvent( 'pointerup', init ) );
    el.dispatchEvent( new MouseEvent( 'mouseup', init ) );
    el.click();
    return el;
}
