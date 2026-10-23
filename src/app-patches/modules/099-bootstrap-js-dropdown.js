function(e,t,n){
/*
 * The dropdown menus of the layout editor without jQuery, in place of Bootstrap 3.4.1's dropdown.js (the module
 * keeps its id and name). Same markup and classes: a click on [data-toggle="dropdown"] opens its parent (.open)
 * and closes every other menu, a click anywhere else closes them (not one in a text field of an open menu, nor one
 * in a .dropdown form); on the toggle Space, Up and Down open the menu, Escape closes it and gives the focus back
 * to the toggle (Escape with the focus elsewhere closes an open menu too and leaves the focus), Up and Down move
 * through the items. aria-expanded follows. A .dropdown opens upwards (dropup)
 * when its menu does not fit below the toggle but fits above, or fits better (from ./extended/jquery_override,
 * where this hung on Bootstrap's shown.bs.dropdown). DOM events show.bs.dropdown and hide.bs.dropdown (both
 * cancelable), shown.bs.dropdown and hidden.bs.dropdown are fired on the parent, detail.relatedTarget the toggle.
 *
 * The module exports function( ui ), called by ./extended/jquery_override with the helpers of
 * bootstrap/js/transition; it returns { toggle( toggle_el ), close_all() }.
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
t.exports = function( ui ) {
    var TOGGLE = '[data-toggle="dropdown"]';

    function parent_of( toggle ) {
        var selector = toggle.getAttribute( 'data-target' ), href, found = null;
        if ( !selector ) {
            href = toggle.getAttribute( 'href' );
            selector = href && /#[A-Za-z]/.test( href ) && href.replace( /.*(?=#[^\s]*$)/, '' );
        }
        if ( selector && selector !== '#' ) {
            try {
                found = document.querySelector( selector );
            } catch ( err ) {
                found = null;
            }
        }
        return found || toggle.parentElement;
    }

    function is_disabled( el ) {
        return el.classList.contains( 'disabled' ) || !!el.disabled;
    }

    function inner_height( el ) {
        var cs = getComputedStyle( el );
        return el.getBoundingClientRect().height - ( parseFloat( cs.paddingTop ) || 0 ) - ( parseFloat( cs.paddingBottom ) || 0 ) -
            ( parseFloat( cs.borderTopWidth ) || 0 ) - ( parseFloat( cs.borderBottomWidth ) || 0 );
    }

    // opens upwards when the menu does not fit below and fits above, or less of it is cut off there
    function place( parent ) {
        var dropdown = parent.closest( '.dropdown' ), menu, toggle, rect, above, below;
        if ( !dropdown ) return;
        menu = dropdown.querySelector( ':scope > .dropdown-menu' );
        toggle = dropdown.querySelector( ':scope > .dropdown-toggle' );
        if ( !menu || !toggle ) return;
        rect = menu.getBoundingClientRect();
        above = rect.top - inner_height( toggle ) - inner_height( menu );
        below = document.documentElement.clientHeight - ( rect.top + inner_height( menu ) );
        if ( below < 0 && ( above >= 0 || below < above ) ) dropdown.classList.add( 'dropup' );
    }

    function close_all( ev ) {
        if ( ev && ev.which === 3 ) return;
        Array.prototype.forEach.call( document.querySelectorAll( '.dropdown-backdrop' ), function( el ) {
            el.parentNode.removeChild( el );
        } );
        Array.prototype.forEach.call( document.querySelectorAll( TOGGLE ), function( toggle ) {
            var parent = parent_of( toggle ), detail = { relatedTarget: toggle };
            if ( !parent || !parent.classList.contains( 'open' ) ) return;
            if ( ev && ev.type === 'click' && /input|textarea/i.test( ev.target.tagName ) && parent.contains( ev.target ) ) return;
            if ( !ui.fire( parent, 'hide.bs.dropdown', detail ) ) return;
            toggle.setAttribute( 'aria-expanded', 'false' );
            parent.classList.remove( 'open' );
            var dropdown = parent.closest( '.dropdown' );
            if ( dropdown ) dropdown.classList.remove( 'dropup' );
            ui.fire( parent, 'hidden.bs.dropdown', detail );
        } );
    }

    function toggle( toggle_el ) {
        if ( is_disabled( toggle_el ) ) return;
        var parent = parent_of( toggle_el ), was_open = parent.classList.contains( 'open' ), detail;
        close_all();
        if ( was_open ) return;
        if ( 'ontouchstart' in document.documentElement && !parent.closest( '.navbar-nav' ) ) {
            var backdrop = document.createElement( 'div' );
            backdrop.className = 'dropdown-backdrop';
            toggle_el.parentNode.insertBefore( backdrop, toggle_el.nextSibling );
            backdrop.addEventListener( 'click', function( ev ) {
                close_all( ev );
            } );
        }
        detail = { relatedTarget: toggle_el };
        if ( !ui.fire( parent, 'show.bs.dropdown', detail ) ) return;
        toggle_el.focus();
        toggle_el.setAttribute( 'aria-expanded', 'true' );
        parent.classList.toggle( 'open' );
        place( parent );
        ui.fire( parent, 'shown.bs.dropdown', detail );
    }

    function keydown( ev, el ) {
        var key = ev.which || ev.keyCode;
        if ( [ 38, 40, 27, 32 ].indexOf( key ) === -1 || /input|textarea/i.test( ev.target.tagName ) ) return;
        ev.preventDefault();
        ev.stopPropagation();
        if ( is_disabled( el ) ) return;
        var parent = parent_of( el ), is_open = parent.classList.contains( 'open' ), items, index;
        if ( ( !is_open && key !== 27 ) || ( is_open && key === 27 ) ) {
            if ( key === 27 ) {
                var own = parent.querySelector( TOGGLE );
                if ( own ) own.focus();
            }
            // Bootstrap clicks el: a toggle toggles, a click on the menu closes the menus
            if ( el.matches( TOGGLE ) ) toggle( el );
            else close_all();
            return;
        }
        items = Array.prototype.filter.call( parent.querySelectorAll( '.dropdown-menu li:not(.disabled) a' ), function( a ) {
            return ui.is_visible( a );
        } );
        if ( !items.length ) return;
        index = items.indexOf( ev.target );
        if ( key === 38 && index > 0 ) index--;
        if ( key === 40 && index < items.length - 1 ) index++;
        items[ index === -1 ? 0 : index ].focus();
    }

    document.addEventListener( 'click', function( ev ) {
        var toggle_el = ev.target.closest && ev.target.closest( TOGGLE );
        if ( toggle_el ) {
            // Bootstrap's handler returned false; nothing else on the page sees a click on a toggle
            ev.preventDefault();
            ev.stopImmediatePropagation();
            toggle( toggle_el );
            return;
        }
        if ( ev.target.closest && ev.target.closest( '.dropdown form' ) ) return;
        close_all( ev );
    } );

    document.addEventListener( 'keydown', function( ev ) {
        var el = ev.target.closest && ( ev.target.closest( TOGGLE ) || ev.target.closest( '.dropdown-menu' ) );
        if ( el ) {
            keydown( ev, el );
            return;
        }
        // Escape with the focus elsewhere (a block opened by the same click took it, e.g. its rich text editor)
        // still closes an open menu; the focus stays where it is and the key goes on to its other listeners
        if ( ( ev.which || ev.keyCode ) === 27 && document.querySelector( '.open > .dropdown-menu' ) ) close_all();
    } );

    return { toggle: toggle, close_all: function() {
        close_all();
    } };
};
}
