function(e,t,n){
/*
 * Plain DOM helpers of the layout editor, in place of Bootstrap 3's transition.js (the module keeps its id and
 * name). ./extended/jquery_override adds the dialog, collapse and dropdown (modules bootstrap/js/modal, collapse
 * and dropdown) and hands the object to the core as Core.ui; ./lib/jquery/* add their helpers to it.
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
var kept_display = new WeakMap(), pending = new WeakMap(), default_display = {};

function settle( el ) {
    var p = pending.get( el );
    if ( !p ) return;
    pending.delete( el );
    clearTimeout( p.timer );
    if ( p.animation ) p.animation.cancel();
    if ( p.done ) p.done();
}

function display_of( el ) {
    var name = el.nodeName, probe, display;
    if ( !default_display[ name ] ) {
        probe = document.body.appendChild( document.createElement( name ) );
        display = getComputedStyle( probe ).display;
        document.body.removeChild( probe );
        default_display[ name ] = !display || display === 'none' ? 'block' : display;
    }
    return default_display[ name ];
}

// what jQuery's show( duration ) and hide( duration ) animate: size and opacity from or to nothing
function animate( el, showing, duration ) {
    if ( !duration || typeof el.animate !== 'function' ) return null;
    var rect = el.getBoundingClientRect(),
        shown = { opacity: 1, height: rect.height + 'px', width: rect.width + 'px', overflow: 'hidden' },
        none = { opacity: 0, height: '0px', width: '0px', overflow: 'hidden' };
    try {
        return el.animate( showing ? [ none, shown ] : [ shown, none ], { duration: duration, easing: 'ease-in-out' } );
    } catch ( err ) {
        return null;
    }
}

var ui = t.exports = {
    /** Element | NodeList | array | jQuery-like (length and index access) | selector -> array of elements */
    elements: function( x ) {
        if ( !x ) return [];
        if ( typeof x === 'string' ) return Array.prototype.slice.call( document.querySelectorAll( x ) );
        if ( x.nodeType === 1 ) return [ x ];
        var list = [];
        for ( var i = 0; i < x.length; i++ ) {
            if ( x[ i ] && x[ i ].nodeType === 1 && list.indexOf( x[ i ] ) === -1 ) list.push( x[ i ] );
        }
        return list;
    },

    /** The elements matching selector inside root, as jQuery's $( root ).find( selector ): not root itself. */
    find: function( root, selector ) {
        return root ? Array.prototype.slice.call( root.querySelectorAll( ':scope ' + selector ) ) : [];
    },

    /** Forces a style recalculation, so that a class added next starts its transition. */
    reflow: function( el ) {
        return el.offsetWidth;
    },

    /**
     * Calls done once: on the element's own transitionend, or after duration ms when no transition ends
     * (Bootstrap's emulateTransitionEnd). Returns a function that drops the call.
     */
    transition_end: function( el, duration, done ) {
        var called = false, timer;
        function end( ev ) {
            if ( called || ( ev && ev.target !== el ) ) return;
            called = true;
            clearTimeout( timer );
            el.removeEventListener( 'transitionend', end );
            done();
        }
        el.addEventListener( 'transitionend', end );
        timer = setTimeout( end, duration );
        return function() {
            called = true;
            clearTimeout( timer );
            el.removeEventListener( 'transitionend', end );
        };
    },

    /** As jQuery's :visible: the element takes up room in the layout. */
    is_visible: function( el ) {
        return !!( el.offsetWidth || el.offsetHeight || el.getClientRects().length );
    },

    is_hidden: function( el ) {
        return getComputedStyle( el ).display === 'none';
    },

    /** As jQuery's show( [duration] ): back to the display it had, else the element's default one. */
    show: function( el, duration ) {
        settle( el );
        if ( !ui.is_hidden( el ) ) return;
        if ( el.style.display === 'none' ) el.style.display = kept_display.get( el ) || '';
        if ( ui.is_hidden( el ) ) el.style.display = display_of( el );
        var animation = animate( el, true, duration );
        if ( animation ) {
            pending.set( el, { animation: animation, timer: setTimeout( function() {
                pending.delete( el );
            }, duration ) } );
        }
    },

    /** As jQuery's hide( [duration] ): display none at the end, the display it had kept for show(). */
    hide: function( el, duration ) {
        settle( el );
        if ( ui.is_hidden( el ) ) return;
        var done = function() {
            if ( el.style.display && el.style.display !== 'none' ) kept_display.set( el, el.style.display );
            el.style.display = 'none';
        };
        var animation = animate( el, false, duration );
        if ( !animation ) return done();
        pending.set( el, { animation: animation, done: done, timer: setTimeout( function() {
            settle( el );
        }, duration ) } );
    },

    /** The elements of root that Tab reaches, in document order. */
    tabbables: function( root ) {
        return Array.prototype.filter.call(
            root.querySelectorAll( 'a[href], area[href], button, input, select, textarea, iframe, summary, [tabindex], [contenteditable=""], [contenteditable="true"]' ),
            function( el ) {
                return !el.disabled && el.getAttribute( 'tabindex' ) !== '-1' &&
                    !( el.nodeName === 'INPUT' && el.type === 'hidden' ) && ui.is_visible( el );
            }
        );
    },

    /**
     * Fires a DOM event named as Bootstrap's jQuery events (show.bs.modal, hidden.bs.collapse ...) on el; false
     * when a listener prevented it. jQuery's .on( 'hidden.bs.modal' ) does not receive these (it binds "hidden"
     * with a namespace); addEventListener( 'hidden.bs.modal' ) does.
     */
    fire: function( el, type, detail ) {
        var ev = new CustomEvent( type, { bubbles: true, cancelable: true, detail: detail || {} } );
        el.dispatchEvent( ev );
        return !ev.defaultPrevented;
    }
};
}
