/**
 * Builds the editors of the layout editor with esbuild.
 *
 *   npm ci && node build.mjs     minified bundle (the committed file)
 *   node build.mjs --dev         readable bundle with inline source map, not for committing
 *
 * Output: design/standard/javascript/explayouts-tiptap.js, one classic script (IIFE) that sets
 * window.CKEDITOR and window.ace (src/editors/index.js). The stylesheet,
 * design/standard/stylesheets/explayouts-tiptap.css, is written by hand and not built.
 *
 * @license GPL-2.0-or-later
 */
import { build } from 'esbuild';
import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname( fileURLToPath( import.meta.url ) );
const dev = process.argv.includes( '--dev' );
const outfile = resolve( root, 'design/standard/javascript/explayouts-tiptap.js' );

await build( {
    entryPoints: [ resolve( root, 'src/editors/index.js' ) ],
    outfile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: [ 'chrome100', 'firefox100', 'safari15.4', 'edge100' ],
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    legalComments: 'eof',
    banner: { js: '/*! explayouts_ui_api editors - Tiptap in place of CKEditor 4 and Ace. GPL-2.0-or-later.\n' +
                  ' *  Bundles Tiptap and ProseMirror (MIT), lowlight (MIT) and highlight.js (BSD-3-Clause). */' },
    define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
    logLevel: 'info'
} );

console.log( 'SIZE  design/standard/javascript/explayouts-tiptap.js  ' + statSync( outfile ).size + ' bytes' );
