/**
 * Cancel of the layout editor (the part "Cancel of the editor" of design/standard/javascript/explayouts-app.js,
 * node --test, happy-dom). In the new layout dialog Cancel carried the class action_apply, on which the dialog
 * submits: cancelling created the layout. Cancel is a link out of the editor and no button of the dialog.
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
const template = readFileSync( resolve( root, 'design/standard/templates/explayouts_ui_api/app.tpl' ), 'utf8' );
const appScript = readFileSync( resolve( root, 'design/standard/javascript/explayouts-app.js' ), 'utf8' );
const headScript = readFileSync( resolve( root, 'design/standard/javascript/explayouts-app-head.js' ), 'utf8' );

/** From the comment marker to the end of the function expression after it ("})();"). */
function block( source, marker ) {
    const at = source.indexOf( marker );
    assert.ok( at >= 0, marker );
    const end = source.indexOf( '\n})();', at );
    assert.ok( end > at, marker + ' ends' );
    return source.slice( at, end + '\n})();'.length );
}

/** The part of javascript/explayouts-app.js that places and handles Cancel. */
function cancelScript() {
    assert.ok( template.indexOf( '<a id="ng-cancel-link"' ) > 0, 'app.tpl has the Cancel link' );
    return block( appScript, '// Cancel of the editor' );
}

/** The part of javascript/explayouts-app-head.js that decides where the editor may return to (explayoutsSafeTarget,
    explayoutsInSiteaccess). */
function returnScript() {
    return block( headScript, '// Where the editor returns to' );
}
function setUpEditor( returnTo ) {
    globalThis.explayoutsServerReturnTo = '';
    globalThis.explayoutsSiteRoot = '/admin/';
    new Function( returnScript() )();
    window.explayoutsReturnTo = returnTo;
}

before( () => {
    GlobalRegistrator.register( { url: 'https://example.test/admin/explayouts_ui_api/app#layout',
                                  settings: { navigation: { disableMainFrameNavigation: true } } } );
} );
after( async () => {
    await GlobalRegistrator.unregister();
} );
beforeEach( () => {
    document.body.innerHTML = '<div id="app" class="ngc"></div><a id="ng-cancel-link" href="#">Cancel</a>';
    window.explayoutsReturnTo = '';
    try { window.localStorage.clear(); } catch ( e ) {}
} );

const tick = () => new Promise( ( done ) => setTimeout( done, 0 ) );

/** The new layout dialog with the delegated handlers of the SPA's Modal (click .action_apply submits). */
function newLayoutDialog( applied ) {
    const modal = document.createElement( 'div' );
    modal.className = 'mymodal modal';
    modal.innerHTML = '<div class="modal-dialog new_layout"><div class="modal-body"></div>'
        + '<div class="modal-footer"><button type="button" class="btn btn-primary action_apply green">Create layout</button></div></div>';
    modal.addEventListener( 'click', ( e ) => { if ( e.target.closest( '.action_apply' ) ) applied.count++; } );
    document.getElementById( 'app' ).appendChild( modal );
    return modal;
}

test( 'Cancel in the new layout dialog is no apply button and does not submit the dialog', async () => {
    setUpEditor( 'https://example.test/admin/content/view/full/2' );
    new Function( cancelScript() )();
    const applied = { count: 0 };
    newLayoutDialog( applied );
    await tick();

    const link = document.getElementById( 'ng-cancel-link' );
    assert.ok( link.parentNode.classList.contains( 'modal-footer' ), 'placed in the footer of the dialog' );
    assert.equal( link.nextElementSibling.textContent, 'Create layout', 'before Create layout' );
    assert.ok( !link.classList.contains( 'action_apply' ), 'not an apply button' );
    assert.ok( !link.classList.contains( 'btn-primary' ), 'not styled as the primary action' );

    link.click();
    assert.equal( applied.count, 0, 'the dialog did not submit' );
    assert.equal( link.getAttribute( 'href' ), 'https://example.test/admin/content/view/full/2', 'leads where the editor was opened from' );
} );

test( 'without a page to return to Cancel leads to the kept referrer, not back into the editor', async () => {
    setUpEditor( '' );
    window.localStorage.setItem( 'ngl_referrer', 'https://example.test/admin/explayouts_ui/layout_list' );
    let wentBack = false;
    const back = window.history.back;
    window.history.back = () => { wentBack = true; };
    new Function( cancelScript() )();
    newLayoutDialog( { count: 0 } );
    await tick();
    const link = document.getElementById( 'ng-cancel-link' );
    link.click();
    window.history.back = back;
    assert.equal( wentBack, false, 'no history.back()' );
    assert.equal( link.getAttribute( 'href' ), 'https://example.test/admin/explayouts_ui/layout_list' );
} );

test( 'a foreign return address is not followed by Cancel', async () => {
    setUpEditor( 'javascript:alert(1)' );
    window.localStorage.setItem( 'ngl_referrer', 'https://evil.example/' );
    new Function( cancelScript() )();
    newLayoutDialog( { count: 0 } );
    await tick();
    assert.equal( document.getElementById( 'ng-cancel-link' ).getAttribute( 'href' ), 'https://example.test/admin/explayouts_ui/dashboard' );
} );

test( 'only the new layout dialog or the editor header take Cancel, not the primary button of any dialog', async () => {
    setUpEditor( '' );
    new Function( cancelScript() )();
    const other = document.createElement( 'div' );
    other.className = 'modal-dialog';
    other.innerHTML = '<div class="modal-footer"><button class="btn btn-primary action_apply green">OK</button></div>';
    document.getElementById( 'app' ).appendChild( other );
    await tick();
    assert.equal( document.getElementById( 'ng-cancel-link' ).parentNode, document.body, 'left where it was' );

    const header = document.createElement( 'div' );
    header.className = 'actions';
    header.innerHTML = '<button class="btn btn-link-white js-discard">Discard</button><button class="btn btn-primary js-publish">Publish layout</button>';
    document.getElementById( 'app' ).appendChild( header );
    await tick();
    const link = document.getElementById( 'ng-cancel-link' );
    assert.equal( link.parentNode, header, 'placed in the editor header' );
    assert.equal( link.nextElementSibling.textContent, 'Publish layout' );
    assert.ok( !link.classList.contains( 'action_apply' ) );
} );

test( 'Cancel in the new layout dialog lifts the leave guard, Cancel in the editor header keeps it', async () => {
    setUpEditor( '' );
    window.Core = { should_navigate_away: false };
    new Function( cancelScript() )();
    newLayoutDialog( { count: 0 } );
    await tick();
    document.getElementById( 'ng-cancel-link' ).click();
    assert.equal( window.Core.should_navigate_away, true, 'nothing to lose in the new layout dialog' );

    document.body.innerHTML = '<div id="app" class="ngc"></div><a id="ng-cancel-link" href="#">Cancel</a>';
    window.Core = { should_navigate_away: false };
    new Function( cancelScript() )();
    const header = document.createElement( 'div' );
    header.className = 'actions';
    header.innerHTML = '<button class="btn btn-primary js-publish">Publish layout</button>';
    document.getElementById( 'app' ).appendChild( header );
    await tick();
    document.getElementById( 'ng-cancel-link' ).click();
    assert.equal( window.Core.should_navigate_away, false, 'unsaved changes are possible in the editor' );
    delete window.Core;
} );
