/**
 * Runs the editor's main flows (./editor-flows.mjs) on a fresh page (./editor-page.mjs) in a process of its own and
 * prints what they saw as JSON: `node run-flows.mjs` without jQuery, `node run-flows.mjs jquery` with the page's
 * jQuery 4 in place of the bundle's DOM layer, recording what the bundle calls of it (./jquery-recorder.mjs).
 * A process each, so that nothing of one page (timers, pending requests) runs on in the other.
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
import { openEditor } from './editor-page.mjs';
import { createApi } from './fake-api.mjs';
import { recordingJQuery } from './jquery-recorder.mjs';
import * as flows from './editor-flows.mjs';


const withJQuery = process.argv[ 2 ] === 'jquery';
const rejections = [];
process.on( 'unhandledRejection', ( reason ) => rejections.push( String( reason && reason.stack || reason ) ) );

const api = createApi();
let recorder;
const page = await openEditor( withJQuery
    ? { api, jQuery: async ( window ) => ( recorder = await recordingJQuery( window ) ).$, afterBundle: () => recorder.wrapFn() }
    : { api } );
flows.installGeometry();
const seen = { jQueryOnPage: [ typeof window.jQuery, typeof window.$ ], layer: Object.keys( window.Core.$ ).sort() };
for ( const name of flows.FLOWS ) {
    seen[ name ] = await flows[ name ]( page );
    seen[ name + ' (document)' ] = document.body.innerHTML;
}
seen.unknownRequests = api.unknown;
seen.errors = page.errors.map( String );
seen.rejections = rejections;
if ( recorder ) {
    // what code outside jQuery (the bundle, the page scripts) called of it
    seen.used = [ ...recorder.calls.keys() ].filter( ( name ) =>
        [ ...recorder.details.fromWhere.get( name ) ].some( ( where ) => /netgen-layouts\.js|explayouts-/.test( where ) ) ).sort();
    seen.selectors = [ ...recorder.details.selectors ].sort();
}
// exit once all of it is out (a pipe takes it in parts); the page's timers would keep the process alive
process.stdout.write( '\n@@FLOWS@@' + JSON.stringify( seen ) + '\n', () => process.exit( 0 ) );
