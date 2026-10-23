function(e,t,n){
/*
 * The dialogs of the layout editor without jQuery, in place of Bootstrap 3.4.1's modal.js (the module keeps its id
 * and name). Same markup and classes as Bootstrap's (the CSS stays): .modal shown with display block and .in, a
 * .modal-backdrop, modal-open on the body, the scrollbar padding; Escape closes unless keyboard is false, a click on
 * the backdrop closes unless backdrop is "static", a [data-dismiss="modal"] inside closes. On top of Bootstrap's:
 * role="dialog" and aria-modal while open, aria-hidden while closed, Tab and Shift+Tab stay in the open dialog, and
 * on close the focus goes back to where it was. Instead of the jQuery events, options.on_shown and
 * options.on_hidden are called; DOM events show.bs.modal (cancelable), shown.bs.modal, hide.bs.modal (cancelable)
 * and hidden.bs.modal are fired on the element as well.
 *
 * The module exports function( ui ), called by ./extended/jquery_override with the helpers of
 * bootstrap/js/transition; it returns { show( el, options ), hide( el ), is_shown( el ) }.
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
t.exports = function( ui ) {
    var TRANSITION = 300, BACKDROP_TRANSITION = 150, FIXED_CONTENT = '.navbar-fixed-top, .navbar-fixed-bottom',
        states = new WeakMap(), open = [];

    function top() {
        return open.length ? open[ open.length - 1 ] : null;
    }

    function measure_scrollbar() {
        var probe = document.createElement( 'div' ), width;
        probe.className = 'modal-scrollbar-measure';
        document.body.appendChild( probe );
        width = probe.offsetWidth - probe.clientWidth;
        document.body.removeChild( probe );
        return width;
    }

    function set_scrollbar( s ) {
        var width = window.innerWidth, rect;
        if ( !width ) {
            rect = document.documentElement.getBoundingClientRect();
            width = rect.right - Math.abs( rect.left );
        }
        s.body_overflowing = document.body.clientWidth < width;
        s.scrollbar_width = measure_scrollbar();
        s.body_padding = document.body.style.paddingRight || '';
        if ( !s.body_overflowing ) return;
        var padding = parseInt( getComputedStyle( document.body ).paddingRight || 0, 10 ) || 0;
        document.body.style.paddingRight = ( padding + s.scrollbar_width ) + 'px';
        s.fixed = Array.prototype.map.call( document.querySelectorAll( FIXED_CONTENT ), function( el ) {
            var kept = el.style.paddingRight;
            el.style.paddingRight = ( ( parseFloat( getComputedStyle( el ).paddingRight ) || 0 ) + s.scrollbar_width ) + 'px';
            return [ el, kept ];
        } );
    }

    function reset_scrollbar( s ) {
        document.body.style.paddingRight = s.body_padding;
        ( s.fixed || [] ).forEach( function( pair ) {
            pair[ 0 ].style.paddingRight = pair[ 1 ] || '';
        } );
        s.fixed = null;
    }

    function adjust( el, s ) {
        var overflowing = el.scrollHeight > document.documentElement.clientHeight;
        el.style.paddingLeft = !s.body_overflowing && overflowing ? s.scrollbar_width + 'px' : '';
        el.style.paddingRight = s.body_overflowing && !overflowing ? s.scrollbar_width + 'px' : '';
    }

    function backdrop( el, s, done ) {
        var fade = el.classList.contains( 'fade' );
        if ( s.shown && s.options.backdrop ) {
            s.backdrop = document.createElement( 'div' );
            s.backdrop.className = 'modal-backdrop' + ( fade ? ' fade' : '' );
            document.body.appendChild( s.backdrop );
            if ( fade ) ui.reflow( s.backdrop );
            s.backdrop.classList.add( 'in' );
            if ( fade ) ui.transition_end( s.backdrop, BACKDROP_TRANSITION, done );
            else done();
        } else if ( !s.shown && s.backdrop ) {
            var remove = function() {
                if ( s.backdrop && s.backdrop.parentNode ) s.backdrop.parentNode.removeChild( s.backdrop );
                s.backdrop = null;
                done();
            };
            s.backdrop.classList.remove( 'in' );
            if ( fade ) ui.transition_end( s.backdrop, BACKDROP_TRANSITION, remove );
            else remove();
        } else {
            done();
        }
    }

    // the focus stays in the dialog on top: Bootstrap's enforceFocus, and Tab wraps around
    document.addEventListener( 'focusin', function( ev ) {
        var el = top();
        if ( el && ev.target !== document && ev.target !== el && !el.contains( ev.target ) ) el.focus();
    } );

    function on_keydown( ev ) {
        var el = ev.currentTarget, s = states.get( el );
        if ( !s || !s.shown ) return;
        if ( ( ev.key === 'Escape' || ev.keyCode === 27 ) && s.options.keyboard ) {
            hide( el );
            return;
        }
        if ( ( ev.key !== 'Tab' && ev.keyCode !== 9 ) || el !== top() ) return;
        var tabbables = ui.tabbables( el ), first = tabbables[ 0 ], last = tabbables[ tabbables.length - 1 ],
            active = document.activeElement;
        if ( !tabbables.length ) {
            ev.preventDefault();
            el.focus();
        } else if ( ev.shiftKey && ( active === first || active === el || !el.contains( active ) ) ) {
            ev.preventDefault();
            last.focus();
        } else if ( !ev.shiftKey && ( active === last || !el.contains( active ) ) ) {
            ev.preventDefault();
            first.focus();
        }
    }

    function on_click( ev ) {
        var el = ev.currentTarget, s = states.get( el ), dismiss;
        if ( !s || !s.shown ) return;
        dismiss = ev.target.closest && ev.target.closest( '[data-dismiss="modal"]' );
        if ( dismiss && el.contains( dismiss ) ) {
            ev.preventDefault();
            hide( el );
            return;
        }
        if ( !s.options.backdrop ) return;
        if ( s.ignore_backdrop_click ) {
            s.ignore_backdrop_click = false;
        } else if ( ev.target === el ) {
            if ( s.options.backdrop === 'static' ) el.focus();
            else hide( el );
        }
    }

    // a press in the dialog let go over the backdrop is no click on the backdrop
    function on_mousedown( ev ) {
        var el = ev.currentTarget, s = states.get( el ), dialog = el.querySelector( '.modal-dialog' );
        if ( !s || !dialog || !dialog.contains( ev.target ) ) return;
        el.addEventListener( 'mouseup', function up( up_ev ) {
            el.removeEventListener( 'mouseup', up );
            if ( up_ev.target === el ) s.ignore_backdrop_click = true;
        } );
    }

    function show( el, options ) {
        var s = states.get( el );
        if ( !s ) states.set( el, s = {} );
        if ( s.shown ) return;
        if ( !ui.fire( el, 'show.bs.modal' ) ) return;
        s.options = Object.assign( { backdrop: true, keyboard: true }, options || {} );
        s.shown = true;
        s.ignore_backdrop_click = false;
        s.return_focus = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
        set_scrollbar( s );
        document.body.classList.add( 'modal-open' );
        el.addEventListener( 'keydown', on_keydown );
        el.addEventListener( 'click', on_click );
        el.addEventListener( 'mousedown', on_mousedown );
        s.on_resize = function() {
            adjust( el, s );
        };
        window.addEventListener( 'resize', s.on_resize );
        open.push( el );
        backdrop( el, s, function() {
            var fade = el.classList.contains( 'fade' ), dialog = el.querySelector( '.modal-dialog' ), title;
            if ( !el.parentNode ) document.body.appendChild( el );
            if ( !el.hasAttribute( 'role' ) ) el.setAttribute( 'role', 'dialog' );
            if ( !el.hasAttribute( 'aria-labelledby' ) && !el.hasAttribute( 'aria-label' ) && ( title = el.querySelector( '.modal-title' ) ) ) {
                if ( !title.id ) title.id = 'ngl-dialog-title-' + ( ++show.count );
                el.setAttribute( 'aria-labelledby', title.id );
            }
            el.setAttribute( 'aria-modal', 'true' );
            el.removeAttribute( 'aria-hidden' );
            el.style.display = 'block';
            el.scrollTop = 0;
            adjust( el, s );
            if ( fade ) ui.reflow( el );
            el.classList.add( 'in' );
            var shown = function() {
                if ( !s.shown ) return;
                el.focus();
                ui.fire( el, 'shown.bs.modal' );
                if ( s.options.on_shown ) s.options.on_shown();
            };
            if ( fade && dialog ) ui.transition_end( dialog, TRANSITION, shown );
            else shown();
        } );
    }
    show.count = 0;

    function hide( el ) {
        var s = states.get( el );
        if ( !s || !s.shown ) return;
        if ( !ui.fire( el, 'hide.bs.modal' ) ) return;
        s.shown = false;
        el.removeEventListener( 'keydown', on_keydown );
        el.removeEventListener( 'click', on_click );
        el.removeEventListener( 'mousedown', on_mousedown );
        window.removeEventListener( 'resize', s.on_resize );
        open.splice( open.indexOf( el ), 1 );
        el.classList.remove( 'in' );
        var hidden = function() {
            el.style.display = 'none';
            el.setAttribute( 'aria-hidden', 'true' );
            el.removeAttribute( 'aria-modal' );
            backdrop( el, s, function() {
                var next = top(), back = s.return_focus;
                if ( !next ) document.body.classList.remove( 'modal-open' );
                el.style.paddingLeft = el.style.paddingRight = '';
                reset_scrollbar( s );
                ui.fire( el, 'hidden.bs.modal' );
                if ( s.options.on_hidden ) s.options.on_hidden();
                // back to where the focus was, unless that is gone or outside the dialog still open
                if ( back && back.isConnected && ( !next || next.contains( back ) ) && typeof back.focus === 'function' ) back.focus();
                else if ( next ) next.focus();
            } );
        };
        if ( el.classList.contains( 'fade' ) ) ui.transition_end( el, TRANSITION, hidden );
        else hidden();
    }

    return {
        show: show,
        hide: hide,
        is_shown: function( el ) {
            var s = states.get( el );
            return !!( s && s.shown );
        }
    };
};
}
