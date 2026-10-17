/**
 * window.ace for the layout editor's bundle (javascript/netgen-layouts.js), backed by Tiptap.
 * The Ace editor is no longer loaded; this covers exactly what the bundle calls (module ace_editor,
 * used by the HTML snippet and Markdown blocks):
 *
 *   ace.edit( element )                         → editor, the element's text is the value
 *   editor.getSession()                         → session: setMode( 'ace/mode/…' ), setTabSize( n ),
 *                                                 setUseSoftTabs( bool ), on( 'changeAnnotation', fn ),
 *                                                 getAnnotations() / setAnnotations( list )
 *   editor.setTheme() / setHighlightActiveLine() accepted, the look comes from the stylesheet
 *   editor.commands.addCommand( { name, bindKey: { win, mac }, exec } )
 *   editor.on( 'change', fn )                   fn( delta, editor )
 *   editor.getValue() / setValue( text )
 *   editor.container                            the element (the bundle sets style.pointerEvents)
 *   editor.renderer.setStyle( 'disabled', on )  also makes the text read-only while disabled
 *   editor.focus() / blur() / resize() / destroy()
 *
 * @license GPL-2.0-or-later
 */
import { CodeEditor, languageForMode } from './code.js';
import { Listeners, resolveElement } from './support.js';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test( navigator.platform || navigator.userAgent || '' );

/** Parses an Ace key binding ("Ctrl-S", "Command-Shift-Z"; several separated by "|"). */
export function parseBinding( binding ) {
    if ( !binding )
        return [];
    return String( binding ).split( '|' ).map( ( one ) => {
        const parts = one.split( '-' ).map( ( p ) => p.trim() ).filter( Boolean );
        const key = ( parts.pop() || '' ).toLowerCase();
        const mods = parts.map( ( p ) => p.toLowerCase() );
        return {
            key,
            ctrl: mods.includes( 'ctrl' ) || mods.includes( 'control' ),
            meta: mods.includes( 'command' ) || mods.includes( 'cmd' ) || mods.includes( 'meta' ),
            alt: mods.includes( 'alt' ) || mods.includes( 'option' ),
            shift: mods.includes( 'shift' )
        };
    } ).filter( ( b ) => b.key !== '' );
}

function matches( binding, event ) {
    return String( event.key || '' ).toLowerCase() === binding.key &&
        !!event.ctrlKey === binding.ctrl && !!event.metaKey === binding.meta &&
        !!event.altKey === binding.alt && !!event.shiftKey === binding.shift;
}

class Session {
    constructor( editor ) {
        this.editor = editor;
        this.listeners = new Listeners();
        this.annotations = [];
        this.mode = null;
        this.tabSize = 4;
        this.softTabs = true;
    }

    setMode( mode ) {
        this.mode = typeof mode === 'string' ? mode : mode && mode.$id || null;
        this.editor.code && this.editor.code.setLanguage( languageForMode( this.mode ) );
        this.listeners.call( 'changeMode', this, [ {}, this ] );
    }

    getMode() {
        return { $id: this.mode };
    }

    setTabSize( size ) {
        this.tabSize = parseInt( size, 10 ) || 4;
        this.editor.code && this.editor.code.setTabSize( this.tabSize );
    }

    getTabSize() {
        return this.tabSize;
    }

    /** Indentation is always spaces; the setting is kept for getUseSoftTabs(). */
    setUseSoftTabs( soft ) {
        this.softTabs = !!soft;
    }

    getUseSoftTabs() {
        return this.softTabs;
    }

    getValue() {
        return this.editor.getValue();
    }

    setValue( value ) {
        this.editor.setValue( value );
    }

    /** No syntax checking: the annotations are what was set, and never change by themselves. */
    getAnnotations() {
        return this.annotations.slice();
    }

    setAnnotations( annotations ) {
        this.annotations = Array.isArray( annotations ) ? annotations.slice() : [];
    }

    clearAnnotations() {
        this.annotations = [];
    }

    on( name, fn ) {
        this.listeners.add( name, fn );
        return fn;
    }

    off( name, fn ) {
        this.listeners.remove( name, fn );
    }

    removeListener( name, fn ) {
        this.off( name, fn );
    }
}

class AceEditor {
    constructor( element ) {
        this.container = element;
        this.listeners = new Listeners();
        this.session = new Session( this );
        this.commandList = [];
        this.disabled = false;

        const self = this;
        this.commands = {
            addCommand( command ) {
                if ( !command || typeof command.exec !== 'function' )
                    return;
                self.commandList = self.commandList.filter( ( c ) => c.name !== command.name || !command.name );
                self.commandList.push( command );
            },
            removeCommand( command ) {
                const name = typeof command === 'string' ? command : command && command.name;
                self.commandList = self.commandList.filter( ( c ) => c.name !== name );
            }
        };
        this.renderer = {
            setStyle( style, on ) {
                const enabled = on === undefined ? true : !!on;
                element.classList.toggle( style, enabled );
                if ( style === 'disabled' ) {
                    self.disabled = enabled;
                    self.code && self.code.setEditable( !enabled );
                }
            },
            unsetStyle( style ) {
                this.setStyle( style, false );
            },
            setShowGutter() {},
            updateFull() {}
        };

        this.code = new CodeEditor( element, {
            onChange: () => this.listeners.call( 'change', this, [ { action: 'change' }, this ] ),
            onKeyDown: ( event ) => this.runCommand( event )
        } );
    }

    runCommand( event ) {
        const platform = isMac() ? 'mac' : 'win';
        for ( const command of this.commandList ) {
            const key = command.bindKey;
            const binding = typeof key === 'string' ? key : key && ( key[platform] || null );
            if ( parseBinding( binding ).some( ( b ) => matches( b, event ) ) ) {
                event.preventDefault();
                command.exec( this, {}, {} );
                return true;
            }
        }
        return false;
    }

    getSession() {
        return this.session;
    }

    getValue() {
        return this.code ? this.code.getValue() : '';
    }

    setValue( value ) {
        this.code && this.code.setValue( value );
        return value;
    }

    setTheme() {}
    setHighlightActiveLine() {}
    setShowPrintMargin() {}
    setOption() {}
    setOptions() {}
    resize() {}

    setReadOnly( readOnly ) {
        this.code && this.code.setEditable( !readOnly );
    }

    focus() {
        this.code && this.code.focus();
    }

    blur() {
        this.code && this.code.blur();
    }

    on( name, fn ) {
        this.listeners.add( name, fn );
        return fn;
    }

    off( name, fn ) {
        this.listeners.remove( name, fn );
    }

    removeListener( name, fn ) {
        this.off( name, fn );
    }

    destroy() {
        if ( !this.code )
            return;
        this.code.destroy();
        this.code = null;
        if ( this.container.__expAceEditor === this )
            delete this.container.__expAceEditor;
    }
}

export function createAce() {
    const live = new Set();
    return {
        version: 'tiptap',
        /**
         * As in Ace, a second call on the same element returns the editor already there. The bundle
         * draws a code block again (new element) without destroying its editor; editors whose element
         * left the page are put away here, so their listeners on the document go with them.
         */
        edit( elementOrId ) {
            const element = resolveElement( elementOrId );
            for ( const editor of live ) {
                if ( !editor.code || !editor.container.isConnected ) {
                    editor.destroy();
                    live.delete( editor );
                }
            }
            if ( element.__expAceEditor && element.__expAceEditor.code )
                return element.__expAceEditor;
            const editor = new AceEditor( element );
            element.__expAceEditor = editor;
            live.add( editor );
            return editor;
        },

        /** The editors not put away yet (for the tests). */
        get liveCount() {
            return live.size;
        }
    };
}
