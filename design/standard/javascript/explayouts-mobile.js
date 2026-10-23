/**
 * Mobile behaviour for the layouts editor.
 *
 * explayouts-mobile.css does the arranging. Two things cannot be done in a
 * stylesheet, and they are all that is here:
 *
 *   1. The header's height. Everything below it is `position: fixed` with a
 *      hard coded `top`, so once the header is allowed to wrap, its real
 *      height has to be published as --exp-header-h for the rest to sit under
 *      it rather than behind it.
 *
 *   2. The properties drawer. A panel that opens has to be opened by
 *      something: the toggle in the rail, and closed again on the scrim, its
 *      own close button or Escape. Selecting a block deliberately does not
 *      open it - see watchSelection().
 *
 * Dragging by finger or pen needs nothing here any more. Up to 1.3.29 this
 * file turned touches into the mouse events jQuery UI's sortable listened
 * for; the editor's drag and drop is now its own and reads Pointer Events
 * (netgen-layouts.js, modules 135-138), and its handles carry touch-action:
 * none (explayouts-editor.css), so a finger on a handle moves the block and
 * a finger anywhere else scrolls the page.
 *
 * Nothing here runs above the breakpoint, and everything it adds is removed
 * again when the viewport grows past it, so rotating a phone into landscape or
 * docking a tablet gives back the desktop editor rather than a half mobile one.
 */
( function () {
    'use strict';

    var BREAKPOINT = '(max-width: 820px)';

    var app     = null;
    var sidebar = null;
    var header  = null;
    var scrim   = null;
    var toggle  = null;
    var closer  = null;
    var mql     = window.matchMedia( BREAKPOINT );

    // Interface texts go through the translations the page hands the editor
    // bundle (nglT, window.explayoutsSpaI18n); English when there are none.
    function tr( text )
    {
        return window.nglT ? window.nglT( text ) : text;
    }

    function isMobile()
    {
        return mql.matches;
    }

    // ── 1. header height ────────────────────────────────────────────────────

    function publishHeaderHeight()
    {
        if ( !header )
            return;

        var h = Math.ceil( header.getBoundingClientRect().height );

        // Below 50px means the header has not been drawn yet; the stylesheet
        // default is the right answer until it has.
        if ( h > 0 )
            document.documentElement.style.setProperty( '--exp-header-h', h + 'px' );
    }

    function watchHeader()
    {
        if ( !header )
            return;

        publishHeaderHeight();

        if ( window.ResizeObserver )
        {
            new ResizeObserver( publishHeaderHeight ).observe( header );
        }
        else
        {
            window.addEventListener( 'resize', publishHeaderHeight );
            setInterval( publishHeaderHeight, 1000 );
        }
    }

    // ── 2. the drawer ───────────────────────────────────────────────────────

    function hasSelection()
    {
        // The panel renders .not-selected - "Select a block to access its
        // properties." - whenever nothing is selected. Its absence is the only
        // signal the app gives that something now is.
        return !!sidebar && !sidebar.querySelector( '.not-selected' );
    }

    function openDrawer()
    {
        if ( isMobile() )
            app.classList.add( 'exp-sidebar-open' );

        refreshToggle();
    }

    function closeDrawer()
    {
        app.classList.remove( 'exp-sidebar-open' );
        refreshToggle();
    }

    function toggleDrawer()
    {
        if ( app.classList.contains( 'exp-sidebar-open' ) )
            closeDrawer();
        else
            openDrawer();
    }

    function refreshToggle()
    {
        if ( !toggle )
            return;

        var selected = hasSelection();
        toggle.classList.toggle( 'has-selection', selected );
        toggle.setAttribute( 'aria-expanded',
            app.classList.contains( 'exp-sidebar-open' ) ? 'true' : 'false' );
        toggle.setAttribute( 'title',
            tr( selected ? 'Block options' : 'Block options (nothing selected)' ) );
        toggle.setAttribute( 'aria-label', toggle.getAttribute( 'title' ) );
    }

    function buildDrawerControls()
    {
        if ( scrim )
            return;

        scrim = document.createElement( 'button' );
        scrim.type = 'button';
        scrim.className = 'exp-scrim';
        scrim.setAttribute( 'aria-label', tr( 'Close the properties panel' ) );
        scrim.addEventListener( 'click', closeDrawer );
        app.appendChild( scrim );

        // In the rail, directly under the add-block button. The rail is where
        // the editor keeps its tools, and a tool that is always in the same
        // place is the point: the drawer can otherwise only be reached by
        // tapping exactly the right part of exactly the right block, and there
        // is then no way back to the properties of the block already selected.
        toggle = document.createElement( 'button' );
        toggle.type = 'button';
        toggle.className = 'exp-rail-toggle';
        toggle.innerHTML = '<i class="material-icons">tune</i>';
        toggle.addEventListener( 'click', toggleDrawer );

        var topMenu = app.querySelector( '.left-toolbar .top-menu' );
        var blocks  = topMenu && topMenu.querySelector( '.blocks' );

        if ( blocks && blocks.parentNode === topMenu )
            topMenu.insertBefore( toggle, blocks.nextSibling );
        else if ( topMenu )
            topMenu.appendChild( toggle );
        else
            // No rail to hang it on - better loose in the app than absent.
            app.appendChild( toggle );

        closer = document.createElement( 'button' );
        closer.type = 'button';
        closer.className = 'exp-drawer-close';
        closer.innerHTML = '<i class="material-icons">close</i>';
        closer.setAttribute( 'aria-label', tr( 'Close the properties panel' ) );
        closer.addEventListener( 'click', closeDrawer );
        sidebar.appendChild( closer );

        refreshToggle();
    }

    /**
     * Keeps the rail toggle's state in step with the panel.
     *
     * Deliberately does NOT open the drawer. It used to: selecting a block
     * brought the panel out over the layout, which on a phone means the thing
     * you just tapped disappears behind a panel you did not ask for, on every
     * tap. Now that the rail carries a toggle that is always in the same place,
     * selecting and looking are separate: tap blocks freely, open the panel
     * when you actually want it.
     *
     * The toggle turns accent coloured instead, which is how a selection makes
     * itself known without taking the screen.
     */
    function watchSelection()
    {
        new MutationObserver( refreshToggle )
            .observe( sidebar, { childList: true, subtree: true } );
    }

    document.addEventListener( 'keydown', function ( e ) {
        if ( e.key === 'Escape' && app && app.classList.contains( 'exp-sidebar-open' ) )
            closeDrawer();
    } );

    // ── wiring ──────────────────────────────────────────────────────────────

    function applyMode()
    {
        if ( !app )
            return;

        if ( isMobile() )
        {
            app.classList.add( 'exp-mobile' );
        }
        else
        {
            app.classList.remove( 'exp-mobile' );
            app.classList.remove( 'exp-sidebar-open' );
        }

        publishHeaderHeight();
        refreshToggle();
    }

    function start()
    {
        app = document.getElementById( 'app' );
        if ( !app )
            return;

        // The app draws itself into #app after its bundle has run, so wait for
        // the parts rather than for an event that is never fired.
        var ready = new MutationObserver( function () {
            header  = header  || app.querySelector( '.app-header' );
            sidebar = sidebar || app.querySelector( '#sidebar' );

            if ( !header || !sidebar )
                return;

            ready.disconnect();
            watchHeader();
            buildDrawerControls();
            watchSelection();
            applyMode();
        } );

        ready.observe( app, { childList: true, subtree: true } );

        if ( mql.addEventListener )
            mql.addEventListener( 'change', applyMode );
        else if ( mql.addListener )
            mql.addListener( applyMode );
    }

    if ( document.readyState === 'loading' )
        document.addEventListener( 'DOMContentLoaded', start );
    else
        start();
} )();
