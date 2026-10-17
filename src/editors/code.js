/**
 * The code editor of the layout editor (HTML snippet and Markdown blocks): a Tiptap document of
 * exactly one code block, highlighted with lowlight. Plain text in, the same plain text out: the
 * value is the text of the code block, byte for byte, line breaks and a trailing newline included.
 *
 * Tab inserts spaces up to the next tab stop (Shift+Tab takes them away again, on every selected
 * line), Enter keeps the indentation of the line; Escape leaves the editor so the keyboard can move on.
 *
 * @license GPL-2.0-or-later
 */
import { Editor, Extension, Node } from '@tiptap/core';
import Text from '@tiptap/extension-text';
import { UndoRedo } from '@tiptap/extensions';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { createLowlight } from 'lowlight';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import markdown from 'highlight.js/lib/languages/markdown';
import twig from 'highlight.js/lib/languages/twig';
import { t } from './support.js';

const lowlight = createLowlight( { xml, css, javascript, markdown, twig } );

/** Ace mode → highlight.js language; anything else is shown without highlighting. */
export const MODE_LANGUAGES = {
    'ace/mode/html': 'xml',
    'ace/mode/xml': 'xml',
    'ace/mode/markdown': 'markdown',
    'ace/mode/twig': 'twig',
    'ace/mode/css': 'css',
    'ace/mode/javascript': 'javascript'
};

export function languageForMode( mode ) {
    const name = typeof mode === 'string' ? mode : mode && mode.$id;
    return Object.prototype.hasOwnProperty.call( MODE_LANGUAGES, name ) ? MODE_LANGUAGES[name] : null;
}

/** The document holds one code block and nothing else. */
const CodeDocument = Node.create( {
    name: 'doc',
    topNode: true,
    content: 'codeBlock'
} );

/**
 * The code block without its own keys (they turn it into a paragraph or leave it, and this
 * document has neither), with Tab indentation instead.
 */
function codeBlock( state ) {
    return CodeBlockLowlight.extend( {
        addKeyboardShortcuts() {
            return {
                Tab: () => indent( this.editor, state.tabSize, false ),
                'Shift-Tab': () => indent( this.editor, state.tabSize, true ),
                Enter: () => newline( this.editor ),
                Escape: () => {
                    leave( this.editor );
                    return true;
                }
            };
        }
    } ).configure( {
        lowlight,
        defaultLanguage: null,
        exitOnTripleEnter: false,
        exitOnArrowDown: false,
        HTMLAttributes: { spellcheck: 'false' }
    } );
}

/**
 * Keeps the code block's language at the editor's mode, also after the block was replaced (select
 * all and delete builds a new one) or the mode changed.
 */
function languageKeeper( state ) {
    return Extension.create( {
        name: 'expCodeLanguage',
        addProseMirrorPlugins() {
            return [ new Plugin( {
                key: new PluginKey( 'expCodeLanguage' ),
                appendTransaction: ( transactions, oldState, newState ) => {
                    const block = newState.doc.firstChild;
                    if ( !block || block.attrs.language === state.language )
                        return null;
                    return newState.tr.setNodeMarkup( 0, null, { ...block.attrs, language: state.language } ).setMeta( 'addToHistory', false );
                }
            } ) ];
        }
    } );
}

/**
 * Escape: focus goes to the editor's element (focusable, tabindex -1), so the keyboard continues
 * from the block instead of from the top of the page.
 */
function leave( editor ) {
    const container = editor.options.element;
    editor.commands.blur();
    if ( container && typeof container.focus === 'function' )
        container.focus( { preventScroll: true } );
}

/** A line break that keeps the indentation of the line it breaks, as Ace did. */
function newline( editor ) {
    const { state, view } = editor;
    const { from, to } = state.selection;
    const text = state.doc.firstChild ? state.doc.firstChild.textContent : '';
    const offset = from - 1;
    const lineStart = text.lastIndexOf( '\n', offset - 1 ) + 1;
    const indentation = /^[ \t]*/.exec( text.slice( lineStart, offset ) )[0];
    view.dispatch( state.tr.insertText( '\n' + indentation, from, to ).scrollIntoView() );
    return true;
}

/** Indents (or outdents) the lines of the selection, or inserts spaces up to the next tab stop. */
function indent( editor, tabSize, outdent ) {
    const { state, view } = editor;
    const { from, to, empty } = state.selection;
    const block = state.doc.firstChild;
    if ( !block )
        return false;
    const start = 1; // text of the code block starts after its opening token
    const text = block.textContent;
    const offFrom = from - start, offTo = to - start;
    const lineStart = ( offset ) => text.lastIndexOf( '\n', offset - 1 ) + 1;

    if ( !outdent && empty ) {
        const column = offFrom - lineStart( offFrom );
        const spaces = ' '.repeat( tabSize - ( column % tabSize ) );
        view.dispatch( state.tr.insertText( spaces, from, to ).scrollIntoView() );
        return true;
    }

    // every line touched by the selection
    const lines = [];
    let at = lineStart( offFrom );
    const last = offTo > offFrom && text[offTo - 1] === '\n' ? offTo - 1 : offTo;
    while ( true ) {
        lines.push( at );
        const next = text.indexOf( '\n', at );
        if ( next === -1 || next >= last )
            break;
        at = next + 1;
    }

    const tr = state.tr;
    let mappedFrom = from, mappedTo = to;
    // from the last line backwards, so the earlier offsets stay valid
    for ( let i = lines.length - 1; i >= 0; i-- ) {
        const pos = start + lines[i];
        if ( outdent ) {
            let n = 0;
            while ( n < tabSize && text[lines[i] + n] === ' ' )
                n++;
            if ( n === 0 && text[lines[i]] === '\t' )
                n = 1;
            if ( n > 0 ) {
                tr.delete( pos, pos + n );
                mappedTo -= Math.min( n, Math.max( 0, to - pos ) );
                if ( pos < from )
                    mappedFrom -= Math.min( n, from - pos );
            }
        } else {
            tr.insertText( ' '.repeat( tabSize ), pos );
            mappedTo += tabSize;
            if ( pos < from )
                mappedFrom += tabSize;
        }
    }
    if ( !tr.docChanged )
        return true;
    tr.setSelection( TextSelection.create( tr.doc, Math.max( start, mappedFrom ), Math.max( start, mappedTo ) ) );
    view.dispatch( tr.scrollIntoView() );
    return true;
}

function docFor( value, language ) {
    const text = value == null ? '' : String( value );
    return {
        type: 'doc',
        content: [ { type: 'codeBlock', attrs: { language }, content: text === '' ? [] : [ { type: 'text', text } ] } ]
    };
}

export class CodeEditor {
    /**
     * @param {HTMLElement} element  the element holding the code as text; the editor replaces its content
     * @param {object}      hooks    onChange(): called when the text changed;
     *                               onKeyDown( event ): true when the key was handled (commands of the caller)
     */
    constructor( element, hooks = {} ) {
        this.element = element;
        this.hooks = hooks;
        this.state = { language: null, tabSize: 4 };

        const value = element.textContent;
        element.textContent = '';
        element.classList.add( 'exp-tt-code' );
        this.hadTabIndex = element.hasAttribute( 'tabindex' );
        if ( !this.hadTabIndex )
            element.setAttribute( 'tabindex', '-1' );

        this.tiptap = new Editor( {
            element,
            // the stylesheet carries Tiptap's base rules: a <style> element would need style-src 'unsafe-inline'
            injectCSS: false,
            extensions: [ CodeDocument, Text, codeBlock( this.state ), UndoRedo, languageKeeper( this.state ) ],
            content: docFor( value, null ),
            editorProps: {
                attributes: {
                    class: 'exp-tt-content',
                    role: 'textbox',
                    'aria-multiline': 'true',
                    'aria-label': t( 'Code' ),
                    spellcheck: 'false',
                    autocapitalize: 'off',
                    autocorrect: 'off'
                },
                handleKeyDown: ( view, event ) => !!( this.hooks.onKeyDown && this.hooks.onKeyDown( event ) )
            }
        } );
        this.lastValue = this.getValue();
        this.tiptap.on( 'transaction', () => this.afterTransaction() );
    }

    getValue() {
        if ( !this.tiptap || this.tiptap.isDestroyed )
            return this.lastValue || '';
        const block = this.tiptap.state.doc.firstChild;
        return block ? block.textContent : '';
    }

    /** Replaces the text (one undoable step); reported as a change when it differs. */
    setValue( value ) {
        const block = this.tiptap.state.doc.firstChild;
        const text = value == null ? '' : String( value );
        const tr = this.tiptap.state.tr;
        if ( text === '' )
            tr.delete( 1, 1 + block.content.size );
        else
            tr.replaceWith( 1, 1 + block.content.size, this.tiptap.schema.text( text ) );
        tr.setSelection( TextSelection.create( tr.doc, 1 + text.length ) );
        this.tiptap.view.dispatch( tr );
    }

    setLanguage( language ) {
        this.state.language = language;
        // an empty transaction lets languageKeeper put the language on the block
        this.tiptap.view.dispatch( this.tiptap.state.tr.setMeta( 'addToHistory', false ) );
    }

    setTabSize( size ) {
        const n = parseInt( size, 10 );
        if ( n > 0 )
            this.state.tabSize = n;
    }

    setEditable( editable ) {
        this.tiptap.setEditable( !!editable, false );
    }

    focus() {
        this.tiptap.commands.focus();
    }

    blur() {
        this.tiptap.commands.blur();
    }

    destroy() {
        const value = this.getValue();
        this.tiptap.destroy();
        this.element.classList.remove( 'exp-tt-code' );
        if ( !this.hadTabIndex )
            this.element.removeAttribute( 'tabindex' );
        this.element.textContent = value;
    }

    afterTransaction() {
        const value = this.getValue();
        if ( value !== this.lastValue ) {
            this.lastValue = value;
            this.hooks.onChange && this.hooks.onChange();
        }
    }
}
