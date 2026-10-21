/**
 * The app bundle design/standard/javascript/netgen-layouts.js is the bundle of netgen/layouts-ui 2.0.0 plus the
 * patches in src/app-patches/, byte for byte: nothing in it is changed that is not a patch file, and every patch file
 * is what the bundle carries. The original bundle is not part of this package; its skeleton and the hash of every
 * module are (manifest.json). With LAYOUTS_UI_BUNDLE pointing to the original, or LAYOUTS_UI_BUNDLE=download (manifest.json
 * "base.url"), the bundle is also rebuilt from it and compared.
 *
 * Run: npm ci && npm test (in extension/explayouts_ui_api)
 *
 * @license GPL-2.0-or-later
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBundle, verifyBundle, sha256 } from '../../src/app-patches/bundle.mjs';
import { build, patchText, readManifest } from '../../src/app-patches/apply.mjs';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const bundle = readFileSync( resolve( root, 'design/standard/javascript/netgen-layouts.js' ), 'utf8' );
const manifest = readManifest();

test( 'the bundle is netgen/layouts-ui 2.0.0 with exactly the patches of src/app-patches/', () => {
    assert.deepEqual( verifyBundle( bundle, manifest, patchText ), [] );
} );

test( 'rebuilding from the bundle in place gives the same bytes', () => {
    assert.equal( build( manifest ), bundle );
} );

test( 'every patch file exists, is a changed module and says why', () => {
    const ids = new Set();
    for ( const p of manifest.modules ) {
        assert.ok( existsSync( resolve( root, 'src/app-patches', p.file ) ), p.file );
        assert.ok( !ids.has( p.id ), 'module ' + p.id + ' once' );
        ids.add( p.id );
        assert.notEqual( sha256( patchText( p.file ) ), p.original_sha256, p.file + ' differs from the original' );
        assert.ok( Array.isArray( p.changes ) && p.changes.length > 0, p.file + ' lists its changes' );
    }
} );

test( 'a change to the bundle that is not in a patch file is found', () => {
    const parsed = parseBundle( bundle );
    const plain = [ ...parsed.modules ].find( ( [ id ] ) => !manifest.modules.some( ( p ) => String( p.id ) === id ) );
    const [ id, m ] = plain;
    const changed = bundle.slice( 0, parsed.header.length + m.start ) + m.source.replace( /^function\(/, 'function (' )
        + bundle.slice( parsed.header.length + m.start + m.source.length );
    assert.deepEqual( verifyBundle( changed, manifest, patchText ), [ 'module ' + id + ' is changed but has no patch file' ] );
    const patched = manifest.modules[ 0 ];
    const other = bundle.replace( patchText( patched.file ), patchText( patched.file ).replace( /^function\(/, 'function (' ) );
    assert.ok( verifyBundle( other, manifest, patchText ).includes( 'module ' + patched.id + ' is not ' + patched.file ) );
} );

// LAYOUTS_UI_BUNDLE=<file> or LAYOUTS_UI_BUNDLE=download (manifest.json base.url; needs the network). Without it the
// test is skipped: the normal run needs no network.
test( 'rebuilt from the original bundle (LAYOUTS_UI_BUNDLE) it is the bundle in place', { skip: !process.env.LAYOUTS_UI_BUNDLE && 'LAYOUTS_UI_BUNDLE not set' }, async () => {
    let from = process.env.LAYOUTS_UI_BUNDLE;
    if ( from === 'download' ) {
        const response = await fetch( manifest.base.url );
        assert.ok( response.ok, manifest.base.url + ' answers' );
        from = { text: await response.text() };
        assert.equal( sha256( from.text ), manifest.base.sha256, 'the download is the bundle of ' + manifest.base.version );
    }
    assert.equal( build( manifest, from ), bundle );
} );
