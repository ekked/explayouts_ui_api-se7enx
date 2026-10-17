/**
 * HTML as CKEditor 4 wrote it, from what Tiptap writes: the rich text blocks keep the markup the
 * frontend templates and stylesheets were written for.
 *
 *  - attributes CKEditor wrote are kept through the schema (preserveAttributes(): class and style on
 *    blocks, list items and table parts, style limited to safeStyle(); border, cellpadding,
 *    cellspacing on tables)
 *  - a list item or table cell whose content is one plain paragraph (and, in a list item, nested
 *    lists) is written without the <p>, as CKEditor did: <li>a</li>, <td>x</td>
 *  - <pre><code>…</code></pre> without a language becomes <pre>…</pre>
 *  - links carry href first, as CKEditor wrote them
 *  - styles are written as CKEditor wrote them: "text-align:center", declarations joined by "; "
 *    (alignment with the justify plugin's default, a style, not a class: the bundle set no
 *    justifyClasses, vendor/ckeditor/config.js neither)
 *
 * The table itself is written without Tiptap's <colgroup> and min-width (tableWithoutColgroup()).
 *
 * @license GPL-2.0-or-later
 */
import { Extension } from '@tiptap/core';

/** Declarations of a style attribute, without empty ones. */
function declarations( style ) {
    return String( style || '' ).split( ';' ).map( ( d ) => {
        const at = d.indexOf( ':' );
        if ( at === -1 )
            return null;
        const name = d.slice( 0, at ).trim().toLowerCase();
        const value = d.slice( at + 1 ).trim();
        return name && value ? [ name, value ] : null;
    } ).filter( Boolean );
}

/** A style attribute as CKEditor wrote it: "name:value; name:value". */
export function ckStyle( style ) {
    return declarations( style ).map( ( [ n, v ] ) => n + ':' + v ).join( '; ' );
}

/**
 * Style properties kept from the HTML (stored or pasted): what CKEditor content and this editor
 * use. Anything else (position, background with images, …) is dropped when the HTML is parsed.
 */
const STYLE_PROPERTIES = /^(text-align|width|height|border(-(top|right|bottom|left))?(-(width|style|color))?|border-collapse|padding(-(top|right|bottom|left))?|vertical-align|color|background-color|font-weight|font-style|text-decoration|list-style-type|margin-left)$/;
const UNSAFE_VALUE = /url\s*\(|expression|javascript:|behavior|-moz-binding|@import|[\\<>]/i;

/** The style attribute with only the allowed properties and safe values, minus the ones named. */
export function safeStyle( style, without = [] ) {
    return declarations( style )
        .filter( ( [ n, v ] ) => STYLE_PROPERTIES.test( n ) && !without.includes( n ) && !UNSAFE_VALUE.test( v ) )
        .map( ( [ n, v ] ) => n + ':' + v ).join( '; ' );
}

const keep = ( name, without ) => ( {
    default: null,
    parseHTML: ( element ) => {
        let value = element.getAttribute( name );
        if ( value !== null && name === 'style' )
            value = safeStyle( value, without || [] );
        return value === null || value === '' ? null : value;
    },
    renderHTML: ( attributes ) => attributes[name] ? { [name]: attributes[name] } : {}
} );

/** Keeps the attributes CKEditor wrote on the nodes Tiptap otherwise strips them from. */
export const preserveAttributes = Extension.create( {
    name: 'expPreserveAttributes',
    addGlobalAttributes() {
        return [
            // text-align is the TextAlign extension's
            { types: [ 'paragraph', 'heading' ], attributes: { class: keep( 'class' ), style: keep( 'style', [ 'text-align' ] ) } },
            { types: [ 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'tableRow', 'horizontalRule' ], attributes: { class: keep( 'class' ), style: keep( 'style' ) } },
            // text-align on cells is the table extension's "align" attribute
            { types: [ 'tableCell', 'tableHeader' ], attributes: { class: keep( 'class' ), style: keep( 'style', [ 'text-align' ] ) } },
            { types: [ 'table' ], attributes: { class: keep( 'class' ), style: keep( 'style' ), border: keep( 'border' ), cellpadding: keep( 'cellpadding' ), cellspacing: keep( 'cellspacing' ) } }
        ];
    }
} );

/** The table node renderHTML: the table's own attributes and the body, no colgroup or min-width. */
export function tableWithoutColgroup( { HTMLAttributes } ) {
    return [ 'table', HTMLAttributes, [ 'tbody', 0 ] ];
}

const LIST_TAGS = [ 'UL', 'OL' ];

function plainParagraph( node ) {
    return node && node.nodeType === 1 && node.tagName === 'P' && node.attributes.length === 0;
}

function unwrap( p ) {
    while ( p.firstChild )
        p.parentNode.insertBefore( p.firstChild, p );
    p.remove();
}

/** Tiptap's HTML → HTML as CKEditor wrote it (see the head of this file). */
export function toCkeditorHtml( html ) {
    const template = document.createElement( 'template' );
    template.innerHTML = html;
    const root = template.content;

    for ( const li of root.querySelectorAll( 'li' ) ) {
        const children = [ ...li.childNodes ].filter( ( n ) => !( n.nodeType === 3 && n.textContent.trim() === '' ) );
        if ( plainParagraph( children[0] ) && children.slice( 1 ).every( ( n ) => n.nodeType === 1 && LIST_TAGS.includes( n.tagName ) ) )
            unwrap( children[0] );
    }
    for ( const cell of root.querySelectorAll( 'td, th' ) ) {
        const children = [ ...cell.childNodes ].filter( ( n ) => !( n.nodeType === 3 && n.textContent.trim() === '' ) );
        if ( children.length === 1 && plainParagraph( children[0] ) )
            unwrap( children[0] );
    }
    for ( const code of root.querySelectorAll( 'pre > code' ) ) {
        if ( code.attributes.length === 0 && code.parentNode.childNodes.length === 1 )
            unwrap( code );
    }
    // href first, as CKEditor wrote links (Tiptap writes target first)
    for ( const link of root.querySelectorAll( 'a[href]' ) ) {
        const rest = [ ...link.attributes ].filter( ( attr ) => attr.name !== 'href' ).map( ( attr ) => [ attr.name, attr.value ] );
        for ( const [ name ] of rest )
            link.removeAttribute( name );
        for ( const [ name, value ] of rest )
            link.setAttribute( name, value );
    }
    for ( const element of root.querySelectorAll( '[style]' ) ) {
        const style = ckStyle( element.getAttribute( 'style' ) );
        if ( style )
            element.setAttribute( 'style', style );
        else
            element.removeAttribute( 'style' );
    }
    return template.innerHTML;
}
