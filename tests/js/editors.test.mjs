/**
 * The editors of the layout editor (node --test, happy-dom): window.CKEDITOR and window.ace as the
 * bundle javascript/netgen-layouts.js uses them, backed by Tiptap. Value round trips (rich text HTML
 * as CKEditor stored it, code byte for byte), change events, read-only state, destroy, and the
 * built bundle (design/standard/javascript/explayouts-tiptap.js) setting both globals.
 *
 * Run: npm ci && npm test (in extension/explayouts_ui_api)
 *
 * @license GPL-2.0-or-later
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '../..' );
let createCkeditor, createAce, parseBinding;

before( async () => {
    GlobalRegistrator.register( { url: 'https://example.test/exponential_admin/explayouts_ui_api/app' } );
    ( { createCkeditor } = await import( '../../src/editors/ckeditor.js' ) );
    ( { createAce, parseBinding } = await import( '../../src/editors/ace.js' ) );
} );
after( async () => {
    await GlobalRegistrator.unregister();
} );
beforeEach( () => {
    document.body.innerHTML = '';
    delete window.explayoutsSpaI18n;
} );

/** A block as renderBlockHtml() draws it: a wrapper with the editor element inside. */
function block( inner ) {
    const wrapper = document.createElement( 'div' );
    wrapper.className = 'block-content';
    wrapper.innerHTML = inner;
    document.body.appendChild( wrapper );
    return wrapper.firstElementChild;
}

function codeElement( text ) {
    const el = block( '<div data-attr="content" class="ace-editor"></div>' );
    el.textContent = text;
    return el;
}

/* ---------- rich text (CKEDITOR) ---------- */

test( 'CKEDITOR: the bundle registers its listeners before any editor exists, and they run on inline()', () => {
    const CKEDITOR = createCkeditor();
    const seen = [];
    CKEDITOR.on( 'instanceCreated', ( e ) => {
        const t = e.editor;
        t.on( 'configLoaded', () => {
            t.config.extraPlugins = 'justify';
            t.config.toolbarGroups = [ { name: 'undo' } ];
            seen.push( 'configLoaded' );
        } );
        seen.push( 'instanceCreated' );
    } );
    CKEDITOR.on( 'dialogDefinition', () => seen.push( 'dialogDefinition' ) );
    const editor = CKEDITOR.inline( block( '<div class="rich-text-editor" data-attr="content"><p>Hi</p></div>' ) );
    assert.deepEqual( seen, [ 'instanceCreated', 'configLoaded' ] );
    assert.equal( CKEDITOR.instances[editor.name], editor );
    editor.destroy();
    assert.equal( CKEDITOR.instances[editor.name], undefined );
} );

/** Markup as CKEditor 4 (Standard, the bundle's configuration) wrote it. */
const CK_SAMPLES = [
    '<p>Plain text</p>',
    '<p><strong>Bold</strong> <em>italic</em> <u>underline</u> <s>strike</s></p>',
    '<h1>One</h1><h2>Two</h2><h3>Three</h3>',
    '<p><a href="https://example.com/a?b=1&amp;c=2">link</a> and <a href="https://example.org" target="_blank">new window</a></p>',
    '<ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul><ol><li>first</li></ol>',
    '<blockquote><p>Quoted</p></blockquote>',
    '<p style="text-align:center">Centered</p><h2 style="text-align:right">Right</h2><p style="text-align:justify">Justified</p>',
    '<p>Line<br>break</p><hr>',
    '<table border="1" cellpadding="1" cellspacing="1" style="width:500px"><tbody><tr><th>H</th><th>I</th></tr><tr><td>a</td><td style="width:50%">b</td></tr></tbody></table>',
    '<pre>a  b\n  c</pre>',
    '<p class="lead">Lead</p><ul class="check"><li>x</li></ul>',
    '<p>Umlaute äöü ß € &lt;tag&gt; &amp;</p>'
];

/** Same elements, attributes (in any order), styles and text. */
function sameMarkup( actual, expected, message ) {
    const tree = ( html ) => {
        const t = document.createElement( 'template' );
        t.innerHTML = html;
        const walk = ( node ) => node.nodeType === 3 ? node.textContent : {
            tag: node.tagName,
            attrs: [ ...node.attributes ].map( ( a ) => a.name + '=' + a.value ).sort(),
            children: [ ...node.childNodes ].map( walk )
        };
        return [ ...t.content.childNodes ].map( walk );
    };
    assert.deepEqual( tree( actual ), tree( expected ), message );
}

test( 'CKEDITOR: unedited content comes back exactly as stored, also after undoing an edit', () => {
    const CKEDITOR = createCkeditor();
    for ( const html of CK_SAMPLES.concat( [ '<div class="box"><span style="color:red">kept</span></div>', '<ul><li><p>a</p></li></ul>' ] ) ) {
        const editor = CKEDITOR.inline( block( '<div class="rich-text-editor">' + html + '</div>' ) );
        assert.equal( editor.getData(), html, html );
        const tiptap = editor.rich.tiptap;
        tiptap.commands.insertContentAt( 1, 'X' );
        assert.notEqual( editor.getData(), html );
        tiptap.commands.undo();
        assert.equal( editor.getData(), html, 'after undo: ' + html );
        editor.destroy();
    }
} );

test( 'CKEDITOR: edited content is written as CKEditor wrote it', () => {
    const CKEDITOR = createCkeditor();
    for ( const html of CK_SAMPLES ) {
        const editor = CKEDITOR.inline( block( '<div class="rich-text-editor">' + html + '</div>' ) );
        sameMarkup( editor.rich.serialize(), html, html );
        editor.destroy();
    }
} );

test( 'CKEDITOR: a real edit keeps lists, cells, links and alignment tight', () => {
    const CKEDITOR = createCkeditor();
    const editor = CKEDITOR.inline( block( '<div class="rich-text-editor"><ul><li>one</li></ul><table><tbody><tr><td>x</td></tr></tbody></table><p style="text-align:center"><a href="/a" target="_blank">c</a></p></div>' ) );
    const tiptap = editor.rich.tiptap;
    tiptap.commands.insertContentAt( 6, '!' ); // after "one"
    const data = editor.getData();
    assert.equal( data, '<ul><li>one!</li></ul><table><tbody><tr><td>x</td></tr></tbody></table><p style="text-align:center"><a href="/a" target="_blank">c</a></p>' );
    assert.doesNotMatch( data, /colgroup|min-width/ );
    editor.destroy();
} );

test( 'CKEDITOR: Tiptap markup that CKEditor never wrote is normalised on edit', () => {
    const CKEDITOR = createCkeditor();
    const cases = [
        [ '<p><b>b</b> <i>i</i> <del>d</del> <strike>s</strike></p>', '<p><strong>b</strong> <em>i</em> <s>d</s> <s>s</s></p>' ],
        [ '<p style="text-align: center;">c</p>', '<p style="text-align:center">c</p>' ],
        // no div or span in the schema: their text stays, the element does not
        [ '<div class="box"><span style="color:red">kept</span></div>', '<p>kept</p>' ]
    ];
    for ( const [ input, output ] of cases ) {
        const editor = CKEDITOR.inline( block( '<div class="rich-text-editor">' + input + '</div>' ) );
        assert.equal( editor.rich.serialize(), output, input );
        editor.destroy();
    }
} );

test( 'CKEDITOR and ace: no <style> element is added (CSP style-src without unsafe-inline)', () => {
    const CKEDITOR = createCkeditor();
    const ace = createAce();
    const rich = CKEDITOR.inline( block( '<div class="rich-text-editor"><p>x</p></div>' ) );
    const code = ace.edit( codeElement( 'x' ) );
    assert.equal( document.querySelectorAll( 'style' ).length, 0 );
    rich.destroy();
    code.destroy();
} );

test( 'CKEDITOR: a table keeps its rows and cells', () => {
    const CKEDITOR = createCkeditor();
    const editor = CKEDITOR.inline( block( '<div class="rich-text-editor"><table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table></div>' ) );
    const out = document.createElement( 'div' );
    out.innerHTML = editor.getData();
    assert.deepEqual( [ ...out.querySelectorAll( 'tr' ) ].map( ( tr ) => [ ...tr.children ].map( ( c ) => c.textContent ) ), [ [ 'a', 'b' ], [ 'c', 'd' ] ] );
    editor.destroy();
} );

test( 'CKEDITOR: script and event handlers do not survive an edit (unedited, the stored value is returned as it was)', () => {
    const CKEDITOR = createCkeditor();
    const stored = '<p onclick="x()">a<script>alert(1)</script></p><p><a href="javascript:alert(1)">j</a></p>';
    const editor = CKEDITOR.inline( block( '<div class="rich-text-editor">' + stored + '</div>' ) );
    assert.equal( editor.rich.tiptap.view.dom.querySelector( 'script, [onclick], a[href^="javascript"]' ), null, 'nothing of it is in the editor' );
    editor.rich.tiptap.commands.insertContentAt( 1, 'X' );
    assert.doesNotMatch( editor.getData(), /script|onclick|javascript:/i );
    editor.destroy();
} );

test( 'CKEDITOR: an empty editor gives an empty string, as CKEditor did', () => {
    const CKEDITOR = createCkeditor();
    const editor = CKEDITOR.inline( block( '<div class="rich-text-editor"><p></p></div>' ) );
    assert.equal( editor.getData(), '' );
    editor.destroy();
} );

test( 'CKEDITOR: change fires on edits with the editor as this, not on setup, setData or read-only switches', () => {
    const CKEDITOR = createCkeditor();
    const editor = CKEDITOR.inline( block( '<div class="rich-text-editor"><p>Hello</p></div>' ) );
    const calls = [];
    editor.config.readOnly = true;
    editor.on( 'change', function () { calls.push( this.getData() ); } );
    editor.setReadOnly( false );
    editor.setReadOnly();
    editor.setReadOnly( false );
    editor.setData( '<p>Set</p>' );
    assert.deepEqual( calls, [] );
    assert.equal( editor.getData(), '<p>Set</p>' );

    editor.rich.tiptap.commands.insertContentAt( editor.rich.tiptap.state.doc.content.size - 1, ' more' );
    assert.deepEqual( calls, [ '<p>Set more</p>' ] );
    editor.rich.tiptap.chain().selectAll().toggleBold().run();
    assert.equal( calls.length, 2 );
    assert.equal( calls[1], '<p><strong>Set more</strong></p>' );
    editor.destroy();
} );

test( 'CKEDITOR: config.readOnly and setReadOnly() switch editing and the toolbar', () => {
    const CKEDITOR = createCkeditor();
    const el = block( '<div class="rich-text-editor"><p>x</p></div>' );
    const editor = CKEDITOR.inline( el );
    const toolbar = el.previousElementSibling;
    assert.ok( toolbar.classList.contains( 'exp-tt-toolbar' ) );
    assert.equal( toolbar.getAttribute( 'role' ), 'toolbar' );

    editor.config.readOnly = true;
    assert.equal( editor.readOnly, true );
    assert.equal( editor.rich.tiptap.isEditable, false );
    assert.equal( toolbar.hidden, true );

    editor.setReadOnly( false );
    assert.equal( editor.rich.tiptap.isEditable, true );
    assert.equal( toolbar.hidden, false );

    editor.setReadOnly();
    assert.equal( editor.rich.tiptap.isEditable, false );
    editor.destroy();
} );

test( 'CKEDITOR: destroy() puts the current HTML back for the next inline() on the same element', () => {
    const CKEDITOR = createCkeditor();
    const el = block( '<div class="rich-text-editor"><p>Before</p></div>' );
    let editor = CKEDITOR.inline( el );
    editor.setData( '<p>After <strong>edit</strong></p>' );
    editor.destroy();
    assert.equal( el.innerHTML, '<p>After <strong>edit</strong></p>' );
    assert.equal( el.parentNode.querySelector( '.exp-tt-toolbar' ), null );
    editor = CKEDITOR.inline( el );
    assert.equal( editor.getData(), '<p>After <strong>edit</strong></p>' );
    editor.destroy( true );
    assert.equal( el.innerHTML, '' );
} );

test( 'CKEDITOR: toolbar labels come from window.explayoutsSpaI18n', () => {
    window.explayoutsSpaI18n = { Bold: 'Fett', 'Paragraph format': 'Absatzformat', 'Heading 1': 'Überschrift 1' };
    const CKEDITOR = createCkeditor();
    const el = block( '<div class="rich-text-editor"><p>x</p></div>' );
    const editor = CKEDITOR.inline( el );
    const toolbar = el.previousElementSibling;
    assert.equal( toolbar.querySelector( '[data-command="bold"]' ).getAttribute( 'aria-label' ), 'Fett' );
    assert.equal( toolbar.querySelector( '[data-command="italic"]' ).getAttribute( 'aria-label' ), 'Italic' );
    const select = toolbar.querySelector( 'select' );
    assert.equal( select.getAttribute( 'aria-label' ), 'Absatzformat' );
    assert.equal( select.options[1].textContent, 'Überschrift 1' );
    editor.destroy();
} );

test( 'CKEDITOR: toolbar buttons and the link form change the content', () => {
    const CKEDITOR = createCkeditor();
    const el = block( '<div class="rich-text-editor"><p>word</p></div>' );
    const editor = CKEDITOR.inline( el );
    const toolbar = el.previousElementSibling;
    let changes = 0;
    editor.on( 'change', () => changes++ );
    editor.rich.tiptap.commands.selectAll();

    toolbar.querySelector( '[data-command="italic"]' ).click();
    assert.equal( editor.getData(), '<p><em>word</em></p>' );

    toolbar.querySelector( '[data-command="link"]' ).click();
    const form = toolbar.querySelector( '.exp-tt-linkform' );
    assert.equal( form.hidden, false );
    form.querySelector( '.exp-tt-linkurl' ).value = 'https://example.com/';
    form.querySelector( 'input[type="checkbox"]' ).checked = true;
    form.querySelector( '.exp-tt-primary' ).click();
    assert.equal( form.hidden, true );
    assert.equal( editor.getData(), '<p><a href="https://example.com/" target="_blank"><em>word</em></a></p>' );

    const select = toolbar.querySelector( 'select' );
    editor.rich.tiptap.commands.selectAll();
    select.value = 'h2';
    select.dispatchEvent( new Event( 'change' ) );
    assert.match( editor.getData(), /^<h2>/ );
    assert.ok( changes >= 3 );
    editor.destroy();
} );

/* ---------- code (ace) ---------- */

const CODE_SAMPLES = [
    '',
    'plain',
    '<div class="a">&amp; &lt;b&gt; "quotes" \'single\'</div>\n',
    '<script>\n\tif (a < b && c > d) {}\n</script>\n\n\n',
    '# Title\n\n* item\n    indented code\n\ntrailing spaces   \n',
    'line one\r\nline two\r\n',
    '\n\nleading newlines',
    'unicode äöü ß € 😀  nbsp'
];

test( 'ace: the element\'s text is the value, and getValue() returns it byte for byte', () => {
    const ace = createAce();
    for ( const text of CODE_SAMPLES ) {
        const el = codeElement( text );
        const editor = ace.edit( el );
        editor.getSession().setMode( 'ace/mode/html' );
        assert.equal( editor.getValue(), text, JSON.stringify( text ) );
        editor.destroy();
        assert.equal( el.textContent, text );
    }
} );

test( 'ace: setValue() round trip, also for text that looks like HTML', () => {
    const ace = createAce();
    const editor = ace.edit( codeElement( 'x' ) );
    for ( const text of CODE_SAMPLES ) {
        editor.setValue( text, -1 );
        assert.equal( editor.getValue(), text, JSON.stringify( text ) );
    }
    editor.destroy();
} );

test( 'ace: the setup calls of the bundle are accepted', () => {
    const ace = createAce();
    const el = codeElement( '<p>x</p>' );
    const n = ace.edit( el );
    const e = n.getSession();
    n.setTheme( 'ace/theme/monokai' );
    n.setHighlightActiveLine( true );
    e.setMode( 'ace/mode/markdown' );
    e.setTabSize( 4 );
    e.setUseSoftTabs( true );
    let saved = 0;
    n.commands.addCommand( { name: 'saveFile', bindKey: { win: 'Ctrl-S', mac: 'Command-S', sender: 'editor|cli' }, exec: () => saved++ } );
    e.on( 'changeAnnotation', () => {
        const list = e.getAnnotations() || [];
        e.setAnnotations( list.filter( ( a ) => !/DOCTYPE/.test( a.text ) ) );
    } );
    assert.deepEqual( e.getAnnotations(), [] );
    assert.equal( n.container, el );
    assert.equal( n.code.tiptap.state.doc.firstChild.attrs.language, 'markdown' );

    // pointer events and the disabled style, as enable_editor()/disable_editor() set them
    n.container.style.pointerEvents = 'none';
    n.renderer.setStyle( 'disabled', true );
    n.blur();
    assert.ok( el.classList.contains( 'disabled' ) );
    assert.equal( n.code.tiptap.isEditable, false );
    n.container.style.pointerEvents = 'auto';
    n.renderer.setStyle( 'disabled', false );
    n.focus();
    assert.equal( el.classList.contains( 'disabled' ), false );
    assert.equal( n.code.tiptap.isEditable, true );
    n.resize();

    const isMac = /Mac|iPhone|iPad|iPod/.test( navigator.platform || navigator.userAgent || '' );
    const key = new KeyboardEvent( 'keydown', { key: 's', ctrlKey: !isMac, metaKey: isMac, bubbles: true, cancelable: true } );
    n.code.tiptap.view.dom.dispatchEvent( key );
    assert.equal( saved, 1 );
    assert.equal( key.defaultPrevented, true );
    n.destroy();
} );

test( 'ace: change fires for text changes only, with the editor', () => {
    const ace = createAce();
    const n = ace.edit( codeElement( 'abc' ) );
    const values = [];
    n.on( 'change', ( delta, editor ) => values.push( editor.getValue() ) );
    n.getSession().setMode( 'ace/mode/html' );
    n.renderer.setStyle( 'disabled', true );
    n.renderer.setStyle( 'disabled', false );
    assert.deepEqual( values, [] );

    n.code.tiptap.commands.insertContentAt( 4, 'd' );
    assert.deepEqual( values, [ 'abcd' ] );
    n.setValue( 'abcd' );
    assert.deepEqual( values, [ 'abcd' ] );
    n.setValue( 'new\n' );
    assert.deepEqual( values, [ 'abcd', 'new\n' ] );
    n.destroy();
} );

test( 'ace: the language follows the mode, also after everything was deleted', () => {
    const ace = createAce();
    const n = ace.edit( codeElement( '<b>x</b>' ) );
    n.getSession().setMode( 'ace/mode/html' );
    const tiptap = n.code.tiptap;
    assert.equal( tiptap.state.doc.firstChild.attrs.language, 'xml' );
    tiptap.chain().selectAll().deleteSelection().run();
    assert.equal( n.getValue(), '' );
    assert.equal( tiptap.state.doc.firstChild.attrs.language, 'xml' );
    n.getSession().setMode( 'ace/mode/markdown' );
    assert.equal( tiptap.state.doc.firstChild.attrs.language, 'markdown' );
    assert.ok( tiptap.view.dom.querySelector( 'pre' ), 'one code block' );
    n.destroy();
} );

test( 'ace: Tab inserts spaces to the next tab stop, Shift+Tab takes them away on each selected line', () => {
    const ace = createAce();
    const n = ace.edit( codeElement( 'ab\ncd' ) );
    n.getSession().setTabSize( 4 );
    const tiptap = n.code.tiptap;
    const press = ( shiftKey ) => tiptap.view.dom.dispatchEvent( new KeyboardEvent( 'keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true } ) );

    tiptap.commands.setTextSelection( 3 ); // after "ab"
    press( false );
    assert.equal( n.getValue(), 'ab  \ncd' );

    tiptap.commands.setTextSelection( { from: 1, to: tiptap.state.doc.content.size - 1 } );
    press( false );
    assert.equal( n.getValue(), '    ab  \n    cd' );
    press( true );
    assert.equal( n.getValue(), 'ab  \ncd' );
    n.destroy();
} );

test( 'ace: Enter keeps the indentation of the line', () => {
    const ace = createAce();
    const n = ace.edit( codeElement( '<ul>\n    <li>a</li>' ) );
    const tiptap = n.code.tiptap;
    tiptap.commands.setTextSelection( tiptap.state.doc.content.size - 1 );
    tiptap.view.dom.dispatchEvent( new KeyboardEvent( 'keydown', { key: 'Enter', bubbles: true, cancelable: true } ) );
    assert.equal( n.getValue(), '<ul>\n    <li>a</li>\n    ' );
    n.destroy();
} );

test( 'CKEDITOR: an editor whose element left the page is put away on the next inline()', () => {
    const CKEDITOR = createCkeditor();
    const first = block( '<div class="rich-text-editor"><p>old</p></div>' );
    const stale = CKEDITOR.inline( first );
    first.parentNode.remove();
    const fresh = CKEDITOR.inline( block( '<div class="rich-text-editor"><p>new</p></div>' ) );
    assert.deepEqual( Object.values( CKEDITOR.instances ), [ fresh ] );
    assert.equal( stale.rich, null );
    fresh.destroy();
} );

test( 'ace: edit() on the same element returns the editor already there', () => {
    const ace = createAce();
    const el = codeElement( 'x' );
    const a = ace.edit( el );
    assert.equal( ace.edit( el ), a );
    a.destroy();
    assert.notEqual( ace.edit( el ), a );
} );

test( 'ace: key bindings are parsed as Ace writes them', () => {
    assert.deepEqual( parseBinding( 'Ctrl-S' ), [ { key: 's', ctrl: true, meta: false, alt: false, shift: false } ] );
    assert.deepEqual( parseBinding( 'Command-Shift-Z|Ctrl-Y' ).map( ( b ) => [ b.key, b.meta, b.shift, b.ctrl ] ), [ [ 'z', true, true, false ], [ 'y', false, false, true ] ] );
} );

test( 'CKEDITOR: the link form refuses addresses Tiptap would not link, and completes host names', () => {
    window.explayoutsSpaI18n = { 'This address cannot be used as a link.': 'Nicht als Link verwendbar.' };
    const CKEDITOR = createCkeditor();
    const el = block( '<div class="rich-text-editor"><p>word</p></div>' );
    const editor = CKEDITOR.inline( el );
    const toolbar = el.previousElementSibling;
    const form = toolbar.querySelector( '.exp-tt-linkform' );
    const url = form.querySelector( '.exp-tt-linkurl' );
    const message = form.querySelector( '.exp-tt-linkmessage' );
    const apply = form.querySelector( '.exp-tt-primary' );
    const tiptap = editor.rich.tiptap;

    for ( const bad of [ 'javascript:alert(1)', 'data:text/html,x', ' JavaScript:void(0)' ] ) {
        for ( const select of [ false, true ] ) {
            if ( select )
                tiptap.commands.selectAll();
            else
                tiptap.commands.setTextSelection( 3 );
            toolbar.querySelector( '[data-command="link"]' ).click();
            url.value = bad;
            apply.click();
            assert.equal( form.hidden, false, bad );
            assert.equal( message.hidden, false, bad );
            assert.equal( message.textContent, 'Nicht als Link verwendbar.' );
            assert.equal( url.getAttribute( 'aria-invalid' ), 'true' );
            assert.equal( editor.getData(), '<p>word</p>', bad );
            form.querySelector( '.exp-tt-textbutton:not(.exp-tt-primary)' ).click();
        }
    }

    tiptap.commands.selectAll();
    toolbar.querySelector( '[data-command="link"]' ).click();
    assert.equal( message.hidden, true, 'the message is gone when the form opens again' );
    url.value = 'example.com/x';
    apply.click();
    assert.equal( editor.getData(), '<p><a href="https://example.com/x">word</a></p>' );
    editor.destroy();
} );

test( 'linkHref(): what is completed and what stays as typed', async () => {
    const { linkHref } = await import( '../../src/editors/rich-text.js' );
    const cases = {
        // host names get https://
        'example.com/x': 'https://example.com/x',
        'www.example.com': 'https://www.example.com',
        'www.example': 'https://www.example',
        'example.com:8080/a': 'https://example.com:8080/a',
        'localhost': 'https://localhost',
        'localhost:8080': 'https://localhost:8080',
        'localhost/x': 'https://localhost/x',
        'intranet:8080/x': 'https://intranet:8080/x',
        'sub.example.museum?x=1': 'https://sub.example.museum?x=1',
        // e-mail addresses get mailto:, never a userinfo URL
        'x@y.de': 'mailto:x@y.de',
        'first.last+tag@example.co.uk': 'mailto:first.last+tag@example.co.uk',
        'x@y': 'x@y',
        'x@y.de/path': 'x@y.de/path',
        // file names stay relative
        'page.html': 'page.html',
        'foo.php?x=1': 'foo.php?x=1',
        'page.html/x': 'page.html/x',
        'Report.PDF': 'Report.PDF',
        'image.jpeg#top': 'image.jpeg#top',
        'docs/readme.md': 'docs/readme.md',
        'plain': 'plain',
        // relative and with a scheme: as typed
        '/relative/path': '/relative/path',
        '#anchor': '#anchor',
        '?q=1': '?q=1',
        './a': './a',
        '../a': '../a',
        'mailto:a@example.com': 'mailto:a@example.com',
        'tel:+49123': 'tel:+49123',
        'http://example.org': 'http://example.org',
        'https://user@example.org': 'https://user@example.org',
        '  ': ''
    };
    for ( const [ input, output ] of Object.entries( cases ) )
        assert.equal( linkHref( input ), output, input );
    for ( const refused of [ 'javascript:alert(1)', 'data:text/html,x', ' JavaScript:void(0)', 'vbscript:x' ] )
        assert.equal( linkHref( refused ), null, refused );
} );

test( 'kept style attributes: only allowed properties, no unsafe values', async () => {
    const { safeStyle } = await import( '../../src/editors/ckeditor-html.js' );
    assert.equal( safeStyle( 'text-align:center; width:50%; border:1px solid #ccc; padding-left:4px; vertical-align:top' ),
        'text-align:center; width:50%; border:1px solid #ccc; padding-left:4px; vertical-align:top' );
    assert.equal( safeStyle( 'color:#c00; background-color:yellow; font-weight:bold; font-style:italic; text-decoration:underline; list-style-type:square; margin-left:40px' ),
        'color:#c00; background-color:yellow; font-weight:bold; font-style:italic; text-decoration:underline; list-style-type:square; margin-left:40px' );
    assert.equal( safeStyle( 'position:fixed; top:0; left:0; z-index:9999; background:url(//evil/x); width:100%' ), 'width:100%' );
    assert.equal( safeStyle( 'background-color:url(//evil/x); color:expression(alert(1)); width:javascript:x; border:1px solid behavior; height:-moz-binding(x)' ), '' );
    assert.equal( safeStyle( 'color:red; color:\\75 rl(x); width:<b>' ), 'color:red' );
    assert.equal( safeStyle( 'text-align:center; color:red', [ 'text-align' ] ), 'color:red' );

    const CKEDITOR = createCkeditor();
    const pasted = '<p style="position:fixed;top:0;left:0;width:100%;height:100%;background:url(//evil/x);color:red">p</p>' +
                   '<table style="width:500px;behavior:url(x.htc)"><tbody><tr><td style="width:50%;background-image:url(//evil/y)">c</td></tr></tbody></table>';
    const editor = CKEDITOR.inline( block( '<div class="rich-text-editor">' + pasted + '</div>' ) );
    const data = editor.rich.serialize();
    assert.doesNotMatch( data, /url\(|position|behavior|background-image/ );
    assert.equal( data, '<p style="width:100%; height:100%; color:red">p</p><table style="width:500px"><tbody><tr><td style="width:50%">c</td></tr></tbody></table>' );
    // unedited, the stored HTML is returned as it was (it is what the server stored and draws)
    assert.equal( editor.getData(), pasted );
    editor.destroy();
} );

test( 'ace: Escape moves the focus to the editor element, not to the page', () => {
    const ace = createAce();
    const el = codeElement( 'x' );
    const n = ace.edit( el );
    assert.equal( el.getAttribute( 'tabindex' ), '-1' );
    n.focus();
    n.code.tiptap.view.dom.dispatchEvent( new KeyboardEvent( 'keydown', { key: 'Escape', bubbles: true, cancelable: true } ) );
    assert.equal( document.activeElement, el );
    n.destroy();
    assert.equal( el.hasAttribute( 'tabindex' ), false );
} );

test( 'ace: editors whose element left the page are put away on the next edit()', () => {
    const ace = createAce();
    // selectionchange listeners on the document, as ProseMirror adds one per editor
    let listening = 0;
    const add = document.addEventListener, remove = document.removeEventListener;
    document.addEventListener = function ( type, ...rest ) { if ( type === 'selectionchange' ) listening++; return add.call( this, type, ...rest ); };
    document.removeEventListener = function ( type, ...rest ) { if ( type === 'selectionchange' ) listening--; return remove.call( this, type, ...rest ); };
    const stale = [];
    const elements = [];
    for ( let i = 0; i < 5; i++ ) {
        elements.push( codeElement( 'old ' + i ) );
        stale.push( ace.edit( elements[i] ) );
    }
    assert.equal( listening, 5, 'one listener per editor' );
    elements.forEach( ( el ) => el.parentNode.remove() );
    assert.equal( ace.liveCount, 5 );
    const fresh = ace.edit( codeElement( 'new' ) );
    assert.equal( ace.liveCount, 1 );
    assert.ok( stale.every( ( e ) => e.code === null ) );
    assert.ok( listening <= 1, 'listeners left: ' + listening );
    fresh.destroy();
    assert.equal( listening, 0 );
    document.addEventListener = add;
    document.removeEventListener = remove;
} );

/* ---------- the built bundle ---------- */

test( 'the built bundle sets window.CKEDITOR and window.ace', () => {
    const file = resolve( root, 'design/standard/javascript/explayouts-tiptap.js' );
    const source = readFileSync( file, 'utf8' );
    delete window.CKEDITOR;
    delete window.ace;
    window.eval( source );
    assert.equal( typeof window.CKEDITOR.inline, 'function' );
    assert.equal( typeof window.CKEDITOR.on, 'function' );
    assert.equal( typeof window.ace.edit, 'function' );
    const rich = window.CKEDITOR.inline( block( '<div class="rich-text-editor"><p>Bundle</p></div>' ) );
    assert.equal( rich.getData(), '<p>Bundle</p>' );
    rich.destroy();
    const code = window.ace.edit( codeElement( '<p>\n</p>\n' ) );
    assert.equal( code.getValue(), '<p>\n</p>\n' );
    code.destroy();
} );
