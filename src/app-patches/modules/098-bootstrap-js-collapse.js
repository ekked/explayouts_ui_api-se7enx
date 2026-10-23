function(e,t,n){
/*
 * Collapsible panels of the layout editor without jQuery, in place of Bootstrap 3.4.1's collapse.js (the module
 * keeps its id and name). Same markup and classes: a click on [data-toggle="collapse"] (href="#id" or
 * data-target) shows or hides the element, .collapse / .collapsing / .collapse.in with the height animated over
 * 350 ms, aria-expanded on the element and on its toggles, "collapsed" on the toggles. DOM events
 * show.bs.collapse and hide.bs.collapse (both cancelable), shown.bs.collapse and hidden.bs.collapse are fired on the
 * element. Accordions (data-parent) are not supported: the editor has none.
 *
 * The module exports function( ui ), called by ./extended/jquery_override with the helpers of
 * bootstrap/js/transition; it returns { show( el ), hide( el ), toggle( el ) }.
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
t.exports = function( ui ) {
    var TRANSITION = 350, TOGGLE = '[data-toggle="collapse"]', busy = new WeakSet(), known = new WeakSet();

    function dimension( el ) {
        return el.classList.contains( 'width' ) ? 'width' : 'height';
    }

    function toggles_of( el ) {
        if ( !el.id ) return [];
        var id = '#' + el.id;
        return Array.prototype.filter.call( document.querySelectorAll( TOGGLE ), function( toggle ) {
            return toggle.getAttribute( 'href' ) === id || toggle.getAttribute( 'data-target' ) === id;
        } );
    }

    function set_expanded( el, expanded ) {
        el.setAttribute( 'aria-expanded', String( expanded ) );
        toggles_of( el ).forEach( function( toggle ) {
            toggle.classList.toggle( 'collapsed', !expanded );
            toggle.setAttribute( 'aria-expanded', String( expanded ) );
        } );
    }

    function show( el ) {
        if ( busy.has( el ) || el.classList.contains( 'in' ) ) return;
        if ( !ui.fire( el, 'show.bs.collapse' ) ) return;
        var dim = dimension( el );
        el.classList.remove( 'collapse' );
        el.classList.add( 'collapsing' );
        el.style[ dim ] = '0px';
        set_expanded( el, true );
        busy.add( el );
        ui.transition_end( el, TRANSITION, function() {
            el.classList.remove( 'collapsing' );
            el.classList.add( 'collapse', 'in' );
            el.style[ dim ] = '';
            busy.delete( el );
            ui.fire( el, 'shown.bs.collapse' );
        } );
        el.style[ dim ] = el[ dim === 'width' ? 'scrollWidth' : 'scrollHeight' ] + 'px';
    }

    function hide( el ) {
        if ( busy.has( el ) || !el.classList.contains( 'in' ) ) return;
        if ( !ui.fire( el, 'hide.bs.collapse' ) ) return;
        var dim = dimension( el );
        el.style[ dim ] = getComputedStyle( el )[ dim ];
        ui.reflow( el );
        el.classList.add( 'collapsing' );
        el.classList.remove( 'collapse', 'in' );
        set_expanded( el, false );
        busy.add( el );
        el.style[ dim ] = '0px';
        ui.transition_end( el, TRANSITION, function() {
            busy.delete( el );
            el.classList.remove( 'collapsing' );
            el.classList.add( 'collapse' );
            ui.fire( el, 'hidden.bs.collapse' );
        } );
    }

    function toggle( el ) {
        // the first time, as Bootstrap does when it sets a panel up: aria-expanded and "collapsed" from .in
        if ( !known.has( el ) ) {
            known.add( el );
            set_expanded( el, el.classList.contains( 'in' ) );
        }
        if ( el.classList.contains( 'in' ) ) hide( el );
        else show( el );
    }

    function targets_of( toggle ) {
        var selector = toggle.getAttribute( 'data-target' ) || ( toggle.getAttribute( 'href' ) || '' ).replace( /.*(?=#[^\s]+$)/, '' );
        if ( !selector ) return [];
        try {
            return Array.prototype.slice.call( document.querySelectorAll( selector ) );
        } catch ( err ) {
            return [];
        }
    }

    document.addEventListener( 'click', function( ev ) {
        var toggle_el = ev.target.closest && ev.target.closest( TOGGLE );
        if ( !toggle_el ) return;
        if ( !toggle_el.hasAttribute( 'data-target' ) ) ev.preventDefault();
        targets_of( toggle_el ).forEach( toggle );
    } );

    return { show: show, hide: hide, toggle: toggle };
};
}
