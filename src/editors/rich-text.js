/**
 * The rich text editor of the layout editor: Tiptap on the block's .rich-text-editor element, with
 * the toolbar CKEditor 4 had there (the bundle's configuration, javascript/netgen-layouts.js,
 * module rich_text): undo/redo, paragraph format (paragraph, heading 1-3, preformatted), bold,
 * italic, underline, strikethrough, link (target only "new window" or none), bulleted and numbered
 * list with indent, block quote, alignment, horizontal line, table, remove formatting.
 *
 * Reads and writes HTML. What CKEditor stored loads as before: <p>, <h1>-<h6>, <pre>, <strong>/<b>,
 * <em>/<i>, <u>, <s>/<del>/<strike>, <a href target>, <ul>/<ol>/<li>, <blockquote>, <hr>, <br>,
 * <table> and style="text-align: ..." on paragraphs and headings.
 *
 * @license GPL-2.0-or-later
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { isAllowedUri } from '@tiptap/extension-link';
import { icon } from './icons.js';
import { preserveAttributes, tableWithoutColgroup, toCkeditorHtml } from './ckeditor-html.js';
import { t } from './support.js';

/** The extensions of the rich text schema; exported for the tests. */
export function richTextExtensions() {
    return [
        StarterKit.configure( {
            heading: { levels: [ 1, 2, 3, 4, 5, 6 ] },
            code: false,
            link: {
                openOnClick: false,
                autolink: false,
                linkOnPaste: true,
                // CKEditor wrote href and, when chosen, target="_blank"; nothing else is added
                HTMLAttributes: { target: null, rel: null, class: null }
            },
            trailingNode: false
        } ),
        TextAlign.configure( { types: [ 'heading', 'paragraph' ], alignments: [ 'left', 'center', 'right', 'justify' ] } ),
        // no column resizing, and written without Tiptap's <colgroup> and min-width
        Table.extend( { renderHTML: tableWithoutColgroup } ).configure( { resizable: false } ),
        TableRow,
        TableHeader,
        TableCell,
        preserveAttributes
    ];
}

/** Last labels that name a file, not a top level domain: "page.html" is a relative address. */
const FILE_EXTENSIONS = [ 'html', 'htm', 'php', 'asp', 'aspx', 'jsp', 'pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'css', 'js',
                          'json', 'xml', 'txt', 'md', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx' ];

/** Whether the first segment of an address without scheme names a host (www.…, localhost, host:port, name.tld). */
function looksLikeHost( segment ) {
    if ( /^www\./i.test( segment ) )
        return true;
    const port = /^([^:]+):\d+$/.exec( segment );
    const host = port ? port[1] : segment;
    if ( port || host.toLowerCase() === 'localhost' )
        return true;
    const labels = host.split( '.' );
    if ( labels.length < 2 || labels.some( ( l ) => l === '' ) )
        return false;
    const last = labels[labels.length - 1];
    return /^[a-z]{2,24}$/i.test( last ) && !FILE_EXTENSIONS.includes( last.toLowerCase() );
}

/**
 * The address typed into the link form as it is stored:
 *  - with a scheme, or relative (/…, #…, ?…, ./…, ../…): as typed
 *  - an e-mail address (name@host.tld, no scheme): mailto:
 *  - starting with a host name (www.…, localhost, host:port, name.tld but not page.html): https://
 *  - anything else (page.html, foo.php?x=1): as typed, a relative address
 * null when Tiptap would refuse the address (javascript:, data:, …).
 */
export function linkHref( input ) {
    let href = String( input == null ? '' : input ).trim();
    if ( href === '' )
        return '';
    const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test( href );
    if ( !hasScheme && !/^(\/|#|\?|\.\.?\/)/.test( href ) ) {
        const segment = href.split( /[/?#]/ )[0];
        if ( segment.includes( '@' ) ) {
            if ( /^[^\s@/?#]+@[^\s@/?#]+\.[a-z]{2,24}$/i.test( href ) )
                href = 'mailto:' + href;
        } else if ( looksLikeHost( segment ) ) {
            href = 'https://' + href;
        }
    }
    return isAllowedUri( href ) ? href : null;
}

const FORMATS = [
    [ 'paragraph', 'Paragraph' ],
    [ 'h1', 'Heading 1' ],
    [ 'h2', 'Heading 2' ],
    [ 'h3', 'Heading 3' ],
    [ 'pre', 'Preformatted' ]
];

let toolbarCount = 0;

export class RichTextEditor {
    /**
     * @param {HTMLElement} element  the element holding the HTML; the editor replaces its content
     * @param {object}      hooks    onChange(): called when the content changed
     */
    constructor( element, hooks = {} ) {
        this.element = element;
        this.hooks = hooks;
        this.readOnly = false;

        const html = element.innerHTML;
        element.innerHTML = '';
        element.classList.add( 'exp-tt-rich' );

        this.toolbar = this.buildToolbar();
        element.parentNode && element.parentNode.insertBefore( this.toolbar, element );

        this.tiptap = new Editor( {
            element,
            // the stylesheet carries Tiptap's base rules: a <style> element would need style-src 'unsafe-inline'
            injectCSS: false,
            extensions: richTextExtensions(),
            content: html,
            editorProps: {
                attributes: {
                    class: 'exp-tt-content',
                    role: 'textbox',
                    'aria-multiline': 'true',
                    'aria-label': t( 'Rich text' )
                }
            }
        } );
        this.remember( html );
        this.lastValue = this.getData();
        this.tiptap.on( 'transaction', () => this.afterTransaction() );
    }

    /** The HTML the editor was given, returned unchanged while the content is unchanged. */
    remember( html ) {
        this.initialHtml = html;
        this.initialDoc = this.tiptap.state.doc;
    }

    /**
     * HTML of the content: as given while unchanged (also after undoing every change), otherwise
     * written as CKEditor wrote it (ckeditor-html.js); an empty editor gives '' as CKEditor did.
     */
    getData() {
        if ( !this.tiptap || this.tiptap.isDestroyed )
            return this.lastValue || '';
        if ( this.tiptap.isEmpty )
            return '';
        if ( this.tiptap.state.doc.eq( this.initialDoc ) )
            return this.initialHtml;
        return this.serialize();
    }

    /** The content written as CKEditor wrote it (what getData() returns once the content changed). */
    serialize() {
        return toCkeditorHtml( this.tiptap.getHTML() );
    }

    /** Replaces the content; not reported as a change. */
    setData( html ) {
        this.quiet = true;
        try {
            this.tiptap.commands.setContent( html == null ? '' : String( html ), { emitUpdate: false } );
        } finally {
            this.quiet = false;
        }
        this.remember( html == null ? '' : String( html ) );
        this.lastValue = this.getData();
        this.updateToolbar();
    }

    setReadOnly( readOnly ) {
        this.readOnly = !!readOnly;
        this.tiptap.setEditable( !this.readOnly, false );
        this.toolbar.hidden = this.readOnly;
        this.element.classList.toggle( 'exp-tt-readonly', this.readOnly );
        this.updateToolbar();
    }

    focus() {
        this.tiptap.commands.focus();
    }

    /** Puts the HTML back into the element (CKEditor's destroy() did the same), unless noUpdate. */
    destroy( noUpdate ) {
        const html = this.getData();
        this.closeLinkForm();
        this.tiptap.destroy();
        this.toolbar.remove();
        this.element.classList.remove( 'exp-tt-rich', 'exp-tt-readonly' );
        if ( !noUpdate )
            this.element.innerHTML = html;
    }

    afterTransaction() {
        const value = this.getData();
        if ( !this.quiet && value !== this.lastValue ) {
            this.lastValue = value;
            this.hooks.onChange && this.hooks.onChange();
        }
        this.updateToolbar();
    }

    run( command ) {
        if ( this.readOnly )
            return;
        command( this.tiptap.chain().focus() ).run();
    }

    buildToolbar() {
        const bar = document.createElement( 'div' );
        bar.className = 'exp-tt-toolbar';
        bar.setAttribute( 'role', 'toolbar' );
        bar.setAttribute( 'aria-label', t( 'Text formatting' ) );
        bar.id = 'exp-tt-toolbar-' + ( ++toolbarCount );
        this.buttons = [];

        const group = () => {
            const g = document.createElement( 'span' );
            g.className = 'exp-tt-group';
            bar.appendChild( g );
            return g;
        };
        const button = ( g, name, label, command, state ) => {
            const b = document.createElement( 'button' );
            b.type = 'button';
            b.className = 'exp-tt-button';
            b.title = t( label );
            b.setAttribute( 'aria-label', t( label ) );
            b.dataset.command = name;
            b.appendChild( icon( name ) );
            // keep the selection in the editor
            b.addEventListener( 'mousedown', ( e ) => e.preventDefault() );
            b.addEventListener( 'click', ( e ) => {
                e.preventDefault();
                e.stopPropagation();
                command();
            } );
            g.appendChild( b );
            this.buttons.push( { element: b, state } );
            return b;
        };
        const ed = () => this.tiptap;

        let g = group();
        button( g, 'undo', 'Undo', () => this.run( ( c ) => c.undo() ), { can: () => ed().can().undo() } );
        button( g, 'redo', 'Redo', () => this.run( ( c ) => c.redo() ), { can: () => ed().can().redo() } );

        g = group();
        const select = document.createElement( 'select' );
        select.className = 'exp-tt-format';
        select.title = t( 'Paragraph format' );
        select.setAttribute( 'aria-label', t( 'Paragraph format' ) );
        for ( const [ value, label ] of FORMATS ) {
            const option = document.createElement( 'option' );
            option.value = value;
            option.textContent = t( label );
            select.appendChild( option );
        }
        select.addEventListener( 'change', () => this.setFormat( select.value ) );
        select.addEventListener( 'click', ( e ) => e.stopPropagation() );
        g.appendChild( select );
        this.formatSelect = select;

        g = group();
        button( g, 'bold', 'Bold', () => this.run( ( c ) => c.toggleBold() ), { active: () => ed().isActive( 'bold' ), can: () => ed().can().toggleBold() } );
        button( g, 'italic', 'Italic', () => this.run( ( c ) => c.toggleItalic() ), { active: () => ed().isActive( 'italic' ), can: () => ed().can().toggleItalic() } );
        button( g, 'underline', 'Underline', () => this.run( ( c ) => c.toggleUnderline() ), { active: () => ed().isActive( 'underline' ), can: () => ed().can().toggleUnderline() } );
        button( g, 'strike', 'Strikethrough', () => this.run( ( c ) => c.toggleStrike() ), { active: () => ed().isActive( 'strike' ), can: () => ed().can().toggleStrike() } );
        button( g, 'clearFormatting', 'Remove formatting', () => this.run( ( c ) => c.unsetAllMarks() ), {} );

        g = group();
        this.linkButton = button( g, 'link', 'Link', () => this.toggleLinkForm(), { active: () => ed().isActive( 'link' ) } );
        this.linkButton.setAttribute( 'aria-haspopup', 'dialog' );
        this.linkButton.setAttribute( 'aria-expanded', 'false' );
        button( g, 'unlink', 'Remove link', () => this.run( ( c ) => c.extendMarkRange( 'link' ).unsetLink() ), { can: () => ed().isActive( 'link' ) } );

        g = group();
        button( g, 'bulletList', 'Bulleted list', () => this.run( ( c ) => c.toggleBulletList() ), { active: () => ed().isActive( 'bulletList' ) } );
        button( g, 'orderedList', 'Numbered list', () => this.run( ( c ) => c.toggleOrderedList() ), { active: () => ed().isActive( 'orderedList' ) } );
        button( g, 'outdent', 'Decrease indent', () => this.run( ( c ) => c.liftListItem( 'listItem' ) ), { can: () => ed().can().liftListItem( 'listItem' ) } );
        button( g, 'indent', 'Increase indent', () => this.run( ( c ) => c.sinkListItem( 'listItem' ) ), { can: () => ed().can().sinkListItem( 'listItem' ) } );
        button( g, 'blockquote', 'Block quote', () => this.run( ( c ) => c.toggleBlockquote() ), { active: () => ed().isActive( 'blockquote' ) } );

        g = group();
        for ( const [ name, align, label ] of [ [ 'alignLeft', 'left', 'Align left' ], [ 'alignCenter', 'center', 'Center' ], [ 'alignRight', 'right', 'Align right' ], [ 'alignJustify', 'justify', 'Justify' ] ] )
            button( g, name, label, () => this.run( ( c ) => ed().isActive( { textAlign: align } ) ? c.unsetTextAlign() : c.setTextAlign( align ) ), { active: () => ed().isActive( { textAlign: align } ) } );

        g = group();
        button( g, 'horizontalRule', 'Horizontal line', () => this.run( ( c ) => c.setHorizontalRule() ), { can: () => ed().can().setHorizontalRule() } );
        button( g, 'table', 'Insert table', () => this.run( ( c ) => c.insertTable( { rows: 3, cols: 3, withHeaderRow: false } ) ), { can: () => ed().can().insertTable( { rows: 3, cols: 3, withHeaderRow: false } ) } );
        button( g, 'addRow', 'Insert row below', () => this.run( ( c ) => c.addRowAfter() ), { can: () => ed().can().addRowAfter(), table: true } );
        button( g, 'addColumn', 'Insert column right', () => this.run( ( c ) => c.addColumnAfter() ), { can: () => ed().can().addColumnAfter(), table: true } );
        button( g, 'deleteRow', 'Delete row', () => this.run( ( c ) => c.deleteRow() ), { can: () => ed().can().deleteRow(), table: true } );
        button( g, 'deleteColumn', 'Delete column', () => this.run( ( c ) => c.deleteColumn() ), { can: () => ed().can().deleteColumn(), table: true } );
        button( g, 'deleteTable', 'Delete table', () => this.run( ( c ) => c.deleteTable() ), { can: () => ed().can().deleteTable(), table: true } );

        bar.appendChild( this.buildLinkForm() );
        // clicks in the toolbar are not clicks on the block
        bar.addEventListener( 'click', ( e ) => e.stopPropagation() );
        return bar;
    }

    setFormat( value ) {
        this.run( ( c ) => {
            if ( value === 'pre' )
                return c.setCodeBlock();
            if ( value === 'paragraph' )
                return c.setParagraph();
            return c.setHeading( { level: Number( value.slice( 1 ) ) } );
        } );
    }

    currentFormat() {
        const ed = this.tiptap;
        if ( ed.isActive( 'codeBlock' ) )
            return 'pre';
        for ( let level = 1; level <= 6; level++ ) {
            if ( ed.isActive( 'heading', { level } ) )
                return level <= 3 ? 'h' + level : '';
        }
        return ed.isActive( 'paragraph' ) ? 'paragraph' : '';
    }

    updateToolbar() {
        if ( !this.tiptap || this.tiptap.isDestroyed || !this.buttons )
            return;
        const inTable = this.tiptap.isActive( 'table' );
        for ( const { element, state } of this.buttons ) {
            if ( state.table )
                element.hidden = !inTable;
            if ( state.active )
                element.setAttribute( 'aria-pressed', state.active() ? 'true' : 'false' );
            element.disabled = this.readOnly || ( state.can ? !state.can() : false );
        }
        const format = this.currentFormat();
        this.formatSelect.value = format;
        if ( this.formatSelect.value !== format )
            this.formatSelect.selectedIndex = -1;
        this.formatSelect.disabled = this.readOnly;
    }

    /* The link form: CKEditor's link dialog offered the address and, as target, "new window" or none
       (the bundle filtered the other targets out). A form in the toolbar, not a browser dialog. */
    buildLinkForm() {
        const form = document.createElement( 'div' );
        form.className = 'exp-tt-linkform';
        form.setAttribute( 'role', 'dialog' );
        form.setAttribute( 'aria-label', t( 'Link' ) );
        form.hidden = true;

        const url = document.createElement( 'input' );
        url.type = 'text';
        url.className = 'exp-tt-linkurl';
        url.setAttribute( 'inputmode', 'url' );
        url.setAttribute( 'aria-label', t( 'URL' ) );
        url.placeholder = 'https://';

        const blankLabel = document.createElement( 'label' );
        blankLabel.className = 'exp-tt-linkblank';
        const blank = document.createElement( 'input' );
        blank.type = 'checkbox';
        blankLabel.appendChild( blank );
        blankLabel.appendChild( document.createTextNode( ' ' + t( 'Open in a new window' ) ) );

        const apply = document.createElement( 'button' );
        apply.type = 'button';
        apply.className = 'exp-tt-textbutton exp-tt-primary';
        apply.textContent = t( 'Apply' );
        const cancel = document.createElement( 'button' );
        cancel.type = 'button';
        cancel.className = 'exp-tt-textbutton';
        cancel.textContent = t( 'Cancel' );

        apply.addEventListener( 'click', () => this.applyLink() );
        cancel.addEventListener( 'click', () => this.closeLinkForm( true ) );
        form.addEventListener( 'keydown', ( e ) => {
            if ( e.key === 'Enter' && e.target === url ) {
                e.preventDefault();
                this.applyLink();
            } else if ( e.key === 'Escape' ) {
                e.preventDefault();
                e.stopPropagation();
                this.closeLinkForm( true );
            }
        } );

        const message = document.createElement( 'span' );
        message.className = 'exp-tt-linkmessage';
        message.setAttribute( 'role', 'alert' );
        message.hidden = true;
        url.addEventListener( 'input', () => this.linkMessage( '' ) );

        form.append( url, blankLabel, apply, cancel, message );
        this.linkForm = { form, url, blank, message };
        return form;
    }

    toggleLinkForm() {
        if ( this.readOnly )
            return;
        if ( !this.linkForm.form.hidden ) {
            this.closeLinkForm( true );
            return;
        }
        const attrs = this.tiptap.getAttributes( 'link' );
        this.linkForm.url.value = attrs.href || '';
        this.linkForm.blank.checked = attrs.target === '_blank';
        this.linkMessage( '' );
        this.linkForm.form.hidden = false;
        this.linkButton.setAttribute( 'aria-expanded', 'true' );
        this.linkForm.url.focus();
    }

    closeLinkForm( refocus ) {
        if ( !this.linkForm || this.linkForm.form.hidden )
            return;
        this.linkForm.form.hidden = true;
        this.linkButton.setAttribute( 'aria-expanded', 'false' );
        if ( refocus && this.tiptap && !this.tiptap.isDestroyed )
            this.tiptap.commands.focus();
    }

    linkMessage( text ) {
        const { message, url } = this.linkForm;
        message.textContent = text;
        message.hidden = text === '';
        if ( text === '' )
            url.removeAttribute( 'aria-invalid' );
        else
            url.setAttribute( 'aria-invalid', 'true' );
    }

    /** Sets, changes or (with an empty address) removes the link; an address Tiptap refuses is not taken. */
    applyLink() {
        const href = linkHref( this.linkForm.url.value );
        if ( href === null ) {
            this.linkMessage( t( 'This address cannot be used as a link.' ) );
            this.linkForm.url.focus();
            return;
        }
        const target = this.linkForm.blank.checked ? '_blank' : null;
        this.closeLinkForm();
        this.run( ( c ) => {
            c = c.extendMarkRange( 'link' );
            if ( href === '' )
                return c.unsetLink();
            if ( this.tiptap.state.selection.empty && !this.tiptap.isActive( 'link' ) )
                return c.insertContent( { type: 'text', text: href, marks: [ { type: 'link', attrs: { href, target } } ] } );
            return c.setLink( { href, target } );
        } );
    }
}
