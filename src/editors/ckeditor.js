/**
 * window.CKEDITOR for the layout editor's bundle (javascript/netgen-layouts.js), backed by Tiptap.
 * CKEditor 4 is no longer loaded; this covers exactly what the bundle calls (module rich_text):
 *
 *   CKEDITOR.on( 'instanceCreated', fn )     fn( evt ), evt.editor; the editor then fires 'configLoaded'
 *   CKEDITOR.on( 'dialogDefinition', fn )    kept, never fired: the link form offers only the targets
 *                                            the bundle allowed there ("new window" or none)
 *   CKEDITOR.inline( element )               → editor
 *   CKEDITOR.instances                       name → editor
 *   editor.config.readOnly = true            editor.config is the bundle's to write; readOnly is applied
 *   editor.on( 'change', fn )                fn called with the editor as this
 *   editor.getData() / setData( html )
 *   editor.setReadOnly( [bool] )             no argument: read-only, as in CKEditor
 *   editor.focus() / editor.destroy( [noUpdate] )
 *
 * @license GPL-2.0-or-later
 */
import { RichTextEditor } from './rich-text.js';
import { Listeners, ckEvent, resolveElement } from './support.js';

class InlineEditor {
    constructor( ckeditor, element, name ) {
        this.ckeditor = ckeditor;
        this.element = element;
        this.name = name;
        this.listeners = new Listeners();
        this.status = 'unloaded';
        let readOnly = false;
        const self = this;
        this.config = {};
        Object.defineProperty( this.config, 'readOnly', {
            enumerable: true,
            get() { return readOnly; },
            set( value ) {
                readOnly = !!value;
                if ( self.rich )
                    self.rich.setReadOnly( readOnly );
            }
        } );

        this.rich = new RichTextEditor( element, { onChange: () => this.fire( 'change' ) } );
        this.rich.setReadOnly( readOnly );
        this.status = 'ready';
    }

    get readOnly() {
        return this.rich ? this.rich.readOnly : this.config.readOnly;
    }

    on( name, fn, scope ) {
        const remove = this.listeners.add( name, fn, scope );
        return { removeListener: remove };
    }

    once( name, fn, scope ) {
        const handle = this.on( name, function () {
            handle.removeListener();
            return fn.apply( this, arguments );
        }, scope );
        return handle;
    }

    removeListener( name, fn ) {
        this.listeners.remove( name, fn );
    }

    fire( name, data ) {
        this.listeners.call( name, this, [ ckEvent( name, this, this, data ) ] );
    }

    getData() {
        return this.rich ? this.rich.getData() : '';
    }

    setData( html, options ) {
        if ( !this.rich )
            return;
        this.rich.setData( html );
        const callback = typeof options === 'function' ? options : options && options.callback;
        if ( callback )
            callback.call( this );
    }

    setReadOnly( readOnly ) {
        this.config.readOnly = readOnly === undefined ? true : !!readOnly;
        this.fire( 'readOnly' );
    }

    focus() {
        this.rich && this.rich.focus();
    }

    checkDirty() {
        return false;
    }

    destroy( noUpdate ) {
        if ( !this.rich )
            return;
        this.fire( 'destroy' );
        this.rich.destroy( noUpdate );
        this.rich = null;
        this.status = 'destroyed';
        delete this.ckeditor.instances[this.name];
        if ( this.element.__expCkEditor === this )
            delete this.element.__expCkEditor;
    }
}

export function createCkeditor() {
    const listeners = new Listeners();
    let count = 0;

    const CKEDITOR = {
        version: 'tiptap',
        status: 'loaded',
        instances: {},

        on( name, fn, scope ) {
            const remove = listeners.add( name, fn, scope );
            return { removeListener: remove };
        },

        removeListener( name, fn ) {
            listeners.remove( name, fn );
        },

        fire( name, data, editor ) {
            listeners.call( name, CKEDITOR, [ ckEvent( name, CKEDITOR, editor, data ) ] );
        },

        inline( elementOrId ) {
            const element = resolveElement( elementOrId );
            // the bundle draws a block again without destroying its editor first; an editor whose element
            // left the page is put away here (without writing back, the element is gone anyway)
            for ( const instance of Object.values( CKEDITOR.instances ) ) {
                if ( !instance.element.isConnected )
                    instance.destroy( true );
            }
            // CKEditor refuses a second editor on one element; the old one is put away instead
            if ( element.__expCkEditor )
                element.__expCkEditor.destroy();
            let name = element.id || '';
            if ( !name || CKEDITOR.instances[name] )
                name = 'editor' + ( ++count );
            const editor = new InlineEditor( CKEDITOR, element, name );
            element.__expCkEditor = editor;
            CKEDITOR.instances[name] = editor;
            CKEDITOR.fire( 'instanceCreated', null, editor );
            editor.fire( 'configLoaded' );
            editor.fire( 'instanceReady' );
            CKEDITOR.fire( 'instanceReady', null, editor );
            return editor;
        }
    };
    return CKEDITOR;
}
