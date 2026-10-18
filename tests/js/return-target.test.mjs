/**
 * Where the layout editor returns to (the script "Where the editor returns to" in
 * design/standard/templates/explayouts_ui_api/app.tpl, node --test, happy-dom): only an http(s) address of this site,
 * whether it comes from return_to (explayoutsServerReturnTo), sessionStorage, the referrer or ngl_referrer.
 * Anything else used to reach window.location.replace() as the editor loaded.
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

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const template = readFileSync( resolve( root, 'design/standard/templates/explayouts_ui_api/app.tpl' ), 'utf8' );

/** The {literal}<script> that contains the marker. */
function script( marker ) {
    const at = template.indexOf( marker );
    assert.ok( at > 0, marker );
    const start = template.lastIndexOf( '{literal}<script>', at ) + '{literal}<script>'.length;
    return template.slice( start, template.indexOf( '</script>{/literal}', at ) );
}
const returnScript = script( 'Where the editor returns to' );
const run = () => new Function( returnScript )();

before( () => {
    GlobalRegistrator.register( { url: 'https://example.test/admin/explayouts_ui_api/app#layout/3',
                                  settings: { navigation: { disableMainFrameNavigation: true } } } );
} );
after( async () => {
    await GlobalRegistrator.unregister();
} );
beforeEach( () => {
    window.explayoutsServerReturnTo = '';
    window.explayoutsSiteRoot = '/admin/';
    globalThis.explayoutsServerReturnTo = '';
    globalThis.explayoutsSiteRoot = '/admin/';
    window.sessionStorage.clear();
    window.localStorage.clear();
} );

for ( const [ what, value ] of [ [ 'a script address', 'javascript:alert(1)' ], [ 'another host', 'https://evil.example/x' ],
                                 [ 'a protocol relative host', '//evil.example/x' ], [ 'a data address', 'data:text/html,x' ] ] ) {
    test( `return_to with ${what} is not returned to`, () => {
        globalThis.explayoutsServerReturnTo = value;
        run();
        assert.equal( window.explayoutsReturnTo, '' );
        assert.ok( !String( window.localStorage.getItem( 'ngl_referrer' ) ).startsWith( 'javascript' ) );
        assert.equal( new URL( window.localStorage.getItem( 'ngl_referrer' ) ).origin, 'https://example.test' );
    } );
    test( `sessionStorage with ${what} is not returned to`, () => {
        window.sessionStorage.setItem( 'explayouts_return_to', value );
        run();
        assert.equal( window.explayoutsReturnTo, '' );
    } );
}

test( 'a path of this site is returned to, inside the siteaccess', () => {
    globalThis.explayoutsServerReturnTo = '/admin/content/view/full/2';
    run();
    assert.equal( window.explayoutsReturnTo, 'https://example.test/admin/content/view/full/2' );
} );

test( 'explayoutsInSiteaccess and explayoutsSafeTarget refuse foreign and script addresses', () => {
    run();
    assert.equal( window.explayoutsInSiteaccess( 'javascript:alert(1)' ), '' );
    assert.equal( window.explayoutsInSiteaccess( 'https://evil.example/' ), '' );
    assert.equal( window.explayoutsInSiteaccess( '/content/view/full/2' ), 'https://example.test/admin/content/view/full/2' );
    assert.equal( window.explayoutsSafeTarget( 'https://example.test/admin/x' ), 'https://example.test/admin/x' );
    assert.equal( window.explayoutsSafeTarget( 'JavaScript:alert(1)' ), '' );
} );

test( 'a foreign ngl_referrer is not kept', () => {
    window.localStorage.setItem( 'ngl_referrer', 'https://evil.example/admin/x' );
    run();
    assert.equal( window.localStorage.getItem( 'ngl_referrer' ), 'https://example.test/admin/' );
} );
