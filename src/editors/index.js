/**
 * The editors of the layout editor, built on Tiptap: window.CKEDITOR (rich text) and window.ace
 * (HTML snippet, Markdown) with exactly the calls javascript/netgen-layouts.js makes of them.
 * Loaded before that bundle (app.tpl): its rich text module registers CKEDITOR listeners as soon
 * as it is evaluated.
 *
 * @license GPL-2.0-or-later
 */
import { createCkeditor } from './ckeditor.js';
import { createAce } from './ace.js';

export { createCkeditor, createAce };

if ( typeof window !== 'undefined' ) {
    window.CKEDITOR = createCkeditor();
    window.ace = createAce();
}
