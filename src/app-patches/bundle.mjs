/**
 * Reads the app bundle design/standard/javascript/netgen-layouts.js as what it is: the browserify bundle of
 * netgen/layouts-ui 2.0.0 with some of its modules replaced and a header put in front (see apply.mjs).
 *
 * A browserify bundle is   require=(PRELUDE)({1:[function(e,t,n){...},{deps}],2:[...],...},{},[entry]);
 * The module table is evaluated in an empty vm context, only to get the source text of each module function
 * (Function.prototype.toString returns it byte for byte); no module code runs.
 *
 * @license GPL-2.0-or-later
 */
import { createHash } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';

const START = 'require=(()=>';
const PRELUDE_END = 'return o})()';

export const sha256 = ( text ) => createHash( 'sha256' ).update( text, 'utf8' ).digest( 'hex' );

/**
 * @param {string} text  a bundle
 * @return {{header: string, body: string, modules: Map<string, {source: string, start: number, deps: object}>,
 *           skeleton: string}}  header: what stands before "require=" (empty in the original); skeleton: the body with
 *           every module function replaced by the marker {@id}, so that two bundles with the same skeleton differ only
 *           in their module functions.
 */
export function parseBundle( text ) {
    const at = text.indexOf( START );
    if ( at < 0 ) throw new Error( 'no browserify bundle: "' + START + '" is missing' );
    const header = text.slice( 0, at );
    const body = text.slice( at );
    const preludeEnd = body.indexOf( PRELUDE_END );
    if ( preludeEnd < 0 ) throw new Error( 'no browserify prelude' );
    const context = createContext( { __table: ( table ) => table } );
    const table = runInContext( '__table' + body.slice( preludeEnd + PRELUDE_END.length ), context );

    const found = [];
    for ( const id of Object.keys( table ) ) {
        const source = table[ id ][ 0 ].toString();
        // A numeric id stands bare (12:[), any other quoted ("@netgen/content-browser-ui":[).
        const key = ( /^\d+$/.test( id ) ? id : JSON.stringify( id ) ) + ':[';
        const at = body.indexOf( key + source, preludeEnd );
        if ( at < 0 || !/[{,]/.test( body[ at - 1 ] ) || body.indexOf( key + source, at + 1 ) >= 0 ) {
            throw new Error( 'module ' + id + ' not found once in place' );
        }
        found.push( [ id, { source, start: at + key.length, deps: table[ id ][ 1 ] } ] );
    }
    // In the order they stand in the bundle.
    const modules = new Map( found.sort( ( a, b ) => a[ 1 ].start - b[ 1 ].start ) );

    let skeleton = '';
    let last = 0;
    for ( const [ id, m ] of modules ) {
        skeleton += body.slice( last, m.start ) + '{@' + id + '}';
        last = m.start + m.source.length;
    }
    skeleton += body.slice( last );
    return { header, body, modules, skeleton };
}

/** The names other modules require a module by, e.g. 23 -> ['./init']. */
export function moduleNames( modules ) {
    const names = new Map();
    for ( const m of modules.values() ) {
        for ( const [ name, id ] of Object.entries( m.deps ) ) {
            const key = String( id );
            if ( !names.has( key ) ) names.set( key, new Set() );
            names.get( key ).add( name );
        }
    }
    return names;
}

/** A body with the given module functions replaced (id -> new source); everything else stays byte for byte. */
export function replaceModules( parsed, replacements ) {
    let out = '';
    let last = 0;
    for ( const [ id, m ] of parsed.modules ) {
        if ( !Object.prototype.hasOwnProperty.call( replacements, id ) ) continue;
        out += parsed.body.slice( last, m.start ) + replacements[ id ];
        last = m.start + m.source.length;
    }
    return out + parsed.body.slice( last );
}

/**
 * Checks that a bundle is the original with exactly the patches of the manifest applied, without the original at
 * hand: same skeleton (prelude, module ids, dependency maps, entry), every module not patched has the original's
 * hash, every patched one is the patch file, and the header is the header file. Returns a list of problems.
 *
 * @param {string}   text      the bundle
 * @param {object}   manifest  manifest.json
 * @param {function} patchText ( file ) => text of a file of src/app-patches/, without its final newline
 */
export function verifyBundle( text, manifest, patchText ) {
    const problems = [];
    let parsed;
    try {
        parsed = parseBundle( text );
    } catch ( e ) {
        return [ e.message ];
    }
    if ( sha256( parsed.skeleton ) !== manifest.base.skeleton_sha256 ) {
        problems.push( 'the bundle around the modules (prelude, module ids, dependencies, entry) is not that of ' + manifest.base.version );
    }
    if ( parsed.header !== patchText( manifest.header ) ) problems.push( 'the header is not ' + manifest.header );
    const patched = new Map( manifest.modules.map( ( p ) => [ String( p.id ), p ] ) );
    const ids = Object.keys( manifest.base.modules );
    if ( ids.length !== parsed.modules.size || ids.some( ( id ) => !parsed.modules.has( id ) ) ) {
        problems.push( 'the bundle does not have the modules of ' + manifest.base.version );
    }
    for ( const [ id, m ] of parsed.modules ) {
        const patch = patched.get( id );
        if ( patch ) {
            if ( m.source !== patchText( patch.file ) ) problems.push( 'module ' + id + ' is not ' + patch.file );
            if ( patch.original_sha256 !== manifest.base.modules[ id ] ) problems.push( 'manifest: original hash of module ' + id + ' differs from base' );
        } else if ( sha256( m.source ) !== manifest.base.modules[ id ] ) {
            problems.push( 'module ' + id + ' is changed but has no patch file' );
        }
    }
    return problems;
}

/** Splits minified code after ; { } for a readable diff (apply.mjs --diff). */
export function tokens( text ) {
    return text.split( /(?<=[;{}])/ );
}

/** Lines "- token" / "+ token" for what differs between two token lists (longest common subsequence). */
export function diffLines( a, b ) {
    const n = a.length;
    const m = b.length;
    const w = m + 1;
    const lcs = new Uint32Array( ( n + 1 ) * w );
    for ( let i = n - 1; i >= 0; i-- ) {
        for ( let j = m - 1; j >= 0; j-- ) {
            lcs[ i * w + j ] = a[ i ] === b[ j ] ? lcs[ ( i + 1 ) * w + j + 1 ] + 1
                : Math.max( lcs[ ( i + 1 ) * w + j ], lcs[ i * w + j + 1 ] );
        }
    }
    const out = [];
    let i = 0;
    let j = 0;
    while ( i < n || j < m ) {
        if ( i < n && j < m && a[ i ] === b[ j ] ) { i++; j++; }
        else if ( i < n && ( j === m || lcs[ ( i + 1 ) * w + j ] >= lcs[ i * w + j + 1 ] ) ) out.push( '- ' + a[ i++ ] );
        else out.push( '+ ' + b[ j++ ] );
    }
    return out;
}
