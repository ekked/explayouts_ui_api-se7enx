/**
 * Builds design/standard/javascript/netgen-layouts.js from the bundle of netgen/layouts-ui 2.0.0 and the patches
 * in this directory. The source of netgen/layouts-ui is not rebuilt: its build (Grunt, browserify, Node 14,
 * node-sass) is not reproducible any more, and the changes made for Exponential were made to the built bundle.
 * What is versioned instead is the exact module functions that differ from the original:
 *
 *   manifest.json        the original (version, commit, sha256 of the bundle, of each module and of the skeleton
 *                        around the modules) and the patched modules with what was changed and why
 *   header.js            what is put in front of the bundle (nglT/nglTh, the interface texts)
 *   modules/NNN-*.js     module NNN's function as it stands in the bundle (one final newline is not part of it)
 *
 * Usage (in extension/explayouts_ui_api):
 *
 *   node src/app-patches/apply.mjs                  rebuild the bundle from the bundle in place (its unpatched
 *                                                   modules are the original ones, checked by hash) and the patches
 *   node src/app-patches/apply.mjs --from=FILE      the same from the original bundle of netgen/layouts-ui 2.0.0
 *                                                   (manifest.json "base.url"), checked by its sha256
 *   node src/app-patches/apply.mjs --check [...]    build in memory and compare with the bundle in place, exit 1 if
 *                                                   it differs
 *   node src/app-patches/apply.mjs --extract=ID     copy module ID out of the bundle into modules/ and the manifest,
 *                                                   to change it there
 *   node src/app-patches/apply.mjs --from=FILE --diff[=ID]
 *                                                   show what the patches change against the original
 *
 * Changing the bundle: edit the module file (--extract it first if it is not patched yet), note the change in
 * manifest.json, run apply.mjs, raise the ?v= of the script in app.tpl. tests/js/app-patches.test.mjs fails as
 * long as the bundle and the patches disagree.
 *
 * @license GPL-2.0-or-later
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBundle, moduleNames, replaceModules, verifyBundle, sha256, tokens, diffLines } from './bundle.mjs';

const here = dirname( fileURLToPath( import.meta.url ) );
const bundlePath = resolve( here, '../../design/standard/javascript/netgen-layouts.js' );
const manifestPath = resolve( here, 'manifest.json' );

export function patchText( file ) {
    const text = readFileSync( resolve( here, file ), 'utf8' );
    return text.endsWith( '\n' ) ? text.slice( 0, -1 ) : text;
}

export function readManifest() {
    return JSON.parse( readFileSync( manifestPath, 'utf8' ) );
}

/** The bundle the patches give, from the original (from) or from the bundle in place. */
export function build( manifest, from ) {
    let source;
    if ( from ) {
        source = readFileSync( from, 'utf8' );
        if ( sha256( source ) !== manifest.base.sha256 ) {
            throw new Error( from + ' is not the bundle of ' + manifest.base.package + ' ' + manifest.base.version );
        }
    } else {
        source = readFileSync( bundlePath, 'utf8' );
        const changed = verifyBundle( source, manifest, patchText ).filter( ( p ) => /has no patch file|not that of|modules of/.test( p ) );
        if ( changed.length ) throw new Error( 'the bundle in place has changes the patches do not know:\n  ' + changed.join( '\n  ' ) );
    }
    const parsed = parseBundle( source );
    const replacements = {};
    for ( const p of manifest.modules ) replacements[ String( p.id ) ] = patchText( p.file );
    return patchText( manifest.header ) + replaceModules( parsed, replacements );
}

function slug( names ) {
    const name = [ ...( names || [] ) ].sort( ( a, b ) => a.length - b.length )[ 0 ] || 'entry';
    return name.replace( /^[./]+/, '' ).replace( /[^A-Za-z0-9]+/g, '-' ).replace( /^-|-$/g, '' ).toLowerCase();
}

function main( argv ) {
    const opt = ( name ) => {
        const a = argv.find( ( x ) => x === '--' + name || x.startsWith( '--' + name + '=' ) );
        return a === undefined ? undefined : ( a.includes( '=' ) ? a.slice( a.indexOf( '=' ) + 1 ) : true );
    };
    const manifest = readManifest();
    const from = opt( 'from' );

    const extract = opt( 'extract' );
    if ( extract ) {
        const parsed = parseBundle( readFileSync( bundlePath, 'utf8' ) );
        const m = parsed.modules.get( String( extract ) );
        if ( !m ) throw new Error( 'no module ' + extract );
        if ( manifest.modules.some( ( p ) => String( p.id ) === String( extract ) ) ) throw new Error( 'module ' + extract + ' is patched already' );
        if ( sha256( m.source ) !== manifest.base.modules[ extract ] ) throw new Error( 'module ' + extract + ' is not the original one' );
        const names = moduleNames( parsed.modules ).get( String( extract ) );
        const file = 'modules/' + String( extract ).padStart( 3, '0' ) + '-' + slug( names ) + '.js';
        if ( existsSync( resolve( here, file ) ) ) throw new Error( file + ' exists' );
        writeFileSync( resolve( here, file ), m.source + '\n' );
        manifest.modules.push( { id: Number( extract ), name: [ ...( names || [] ) ].join( ' | ' ), file,
                                 original_sha256: manifest.base.modules[ extract ], changes: [] } );
        manifest.modules.sort( ( a, b ) => a.id - b.id );
        writeFileSync( manifestPath, JSON.stringify( manifest, null, 2 ) + '\n' );
        console.log( 'EXTRACTED module ' + extract + ' to src/app-patches/' + file );
        return 0;
    }

    if ( opt( 'diff' ) ) {
        if ( !from ) throw new Error( '--diff needs --from=<original bundle>' );
        const original = parseBundle( readFileSync( from, 'utf8' ) );
        const only = opt( 'diff' ) === true ? null : String( opt( 'diff' ) );
        for ( const p of manifest.modules ) {
            if ( only && String( p.id ) !== only ) continue;
            const a = tokens( original.modules.get( String( p.id ) ).source );
            const b = tokens( patchText( p.file ) );
            console.log( '=== module ' + p.id + ' (' + p.name + ')' );
            for ( const line of diffLines( a, b ) ) console.log( line );
        }
        return 0;
    }

    const built = build( manifest, from );
    if ( opt( 'check' ) ) {
        const current = readFileSync( bundlePath, 'utf8' );
        if ( current !== built ) {
            console.error( 'DIFFERS  design/standard/javascript/netgen-layouts.js is not what the patches give' );
            return 1;
        }
        console.log( 'OK  design/standard/javascript/netgen-layouts.js = ' + manifest.base.package + ' ' + manifest.base.version + ' + patches' );
        return 0;
    }
    writeFileSync( bundlePath, built );
    console.log( 'WROTE  design/standard/javascript/netgen-layouts.js  ' + Buffer.byteLength( built ) + ' bytes, sha256 ' + sha256( built ) );
    return 0;
}

if ( process.argv[ 1 ] && resolve( process.argv[ 1 ] ) === fileURLToPath( import.meta.url ) ) {
    try {
        process.exitCode = main( process.argv.slice( 2 ) );
    } catch ( e ) {
        console.error( 'ERROR  ' + e.message );
        process.exitCode = 1;
    }
}
