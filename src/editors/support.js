/**
 * Small helpers shared by the two editors: the interface texts and the event lists.
 *
 * @license GPL-2.0-or-later
 */

/**
 * The translation of an interface text. app.tpl hands the translations to the page as
 * window.explayoutsSpaI18n (spa_strings.tpl), keyed by the English text; without one the English
 * text is shown. Read on every call: the editors are built after the page has set the table.
 */
export function t( text ) {
    const table = typeof window !== 'undefined' && window.explayoutsSpaI18n ? window.explayoutsSpaI18n : {};
    return Object.prototype.hasOwnProperty.call( table, text ) && table[text] ? table[text] : text;
}

/** The element passed to CKEDITOR.inline() / ace.edit(): an element, or the id of one. */
export function resolveElement( elementOrId ) {
    if ( typeof elementOrId === 'string' ) {
        const element = document.getElementById( elementOrId );
        if ( !element )
            throw new Error( 'Element "' + elementOrId + '" not found' );
        return element;
    }
    if ( !elementOrId || elementOrId.nodeType !== 1 )
        throw new Error( 'An element is required' );
    return elementOrId;
}

/**
 * Listeners by event name. CKEditor style (evt object, listener called with the scope given or the
 * owner as this) and Ace style (arguments passed through) are both built on this.
 */
export class Listeners {
    constructor() {
        this.lists = Object.create( null );
    }

    add( name, fn, scope ) {
        if ( typeof fn !== 'function' )
            return () => {};
        ( this.lists[name] = this.lists[name] || [] ).push( { fn, scope } );
        return () => this.remove( name, fn );
    }

    remove( name, fn ) {
        const list = this.lists[name];
        if ( !list )
            return;
        const at = list.findIndex( ( entry ) => entry.fn === fn );
        if ( at !== -1 )
            list.splice( at, 1 );
    }

    has( name ) {
        return !!( this.lists[name] && this.lists[name].length );
    }

    /** Calls every listener of name; a listener that throws does not keep the others from running. */
    call( name, owner, args ) {
        const list = this.lists[name];
        if ( !list )
            return;
        for ( const entry of list.slice() ) {
            try {
                entry.fn.apply( entry.scope || owner, args );
            } catch ( e ) {
                if ( typeof console !== 'undefined' )
                    console.error( e );
            }
        }
    }
}

/** A CKEditor 4 event object: what the layouts bundle reads is evt.editor and evt.data. */
export function ckEvent( name, sender, editor, data ) {
    let stopped = false;
    return {
        name,
        sender,
        editor,
        data,
        stop() { stopped = true; },
        cancel() { stopped = true; },
        get stopped() { return stopped; }
    };
}
