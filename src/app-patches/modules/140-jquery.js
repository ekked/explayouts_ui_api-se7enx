function(e,t,n){
/*
 * The layout editor's DOM layer, in place of jQuery (the module keeps its id and name; until 1.3.29 it handed out the
 * page's jQuery 4 from ezjscore, which the page loaded for the editor alone). What the bundle calls of jQuery, with
 * jQuery's behaviour, on plain DOM: Backbone (its views, events and requests) and the app's modules reach it as
 * Backbone.$ and Core.$, javascript/explayouts-app.js as Core.$.ajax. It is not put on the page as window.jQuery.
 *
 *   $( selector [, context] ), $( html [, props] ), $( element | array | NodeList | $obj ), $( fn ) (when the document
 *   is ready, always after the current script, as jQuery 3+)
 *   collections: each, map, get, toArray, eq, first, filter, index, find, closest, children, parent, parents, next,
 *     siblings; addClass, removeClass, hasClass, attr, removeAttr, prop, data, removeData, css, height, val,
 *     html, text, append, after, replaceWith, remove, empty, show, hide, fadeIn, fadeOut, serialize, serializeArray;
 *     on, off, trigger; ajaxStart, ajaxSend, ajaxSuccess, ajaxError, ajaxComplete, ajaxStop
 *   $.ajax, $.get, $.active, $.param, $.extend, $.each, $.inArray, $.Deferred, $.when, $.fn
 *
 * Events: one native listener per element and event type runs the layer's handlers in jQuery's order (the delegated
 * ones from the target up, then those bound to the element), with jQuery's event: currentTarget the element matched,
 * delegateTarget, originalEvent, which, isDefaultPrevented() ...; a handler returning false prevents and stops.
 * Namespaces (Backbone's click.delegateEventsview12) work in on and off; a delegated focus or blur listens to focusin
 * or focusout; a delegated selector starting with a combinator (> .block-header .js-copy) is relative to the element
 * bound. trigger( type, [args] ) runs focus, blur and click as the element's own methods and dispatches anything else
 * as a bubbling, cancelable CustomEvent (detail: the args): the layer's handlers get the args after the event, as
 * with jQuery, and addEventListener listeners get the event too (jQuery's trigger never reached them). Native events
 * reach the layer's handlers alike.
 *
 * Data: .data() keeps values per element as jQuery does, read from data-* attributes on first access (converted:
 * "true", "false", "null", numbers, JSON). The key _view is the element's ngl_view property, where ./extended/view
 * keeps an element's Backbone view, so plain code finds a view as el.ngl_view. remove(), empty(), replaceWith(),
 * html() and text() drop the layer's handlers and data of what they take out, as jQuery's cleanData.
 *
 * Scripts: as with jQuery, the scripts in HTML put in by html(), append(), after() or replaceWith() run when they reach
 * the document, each once (nodes parsed by $( html ) too: they run when inserted); scripts moved around do not run
 * again.
 *
 * Requests: $.ajax on XMLHttpRequest with jQuery's options (url, type/method, data, processData, contentType,
 * dataType, headers, context, beforeSend, success, error, complete, global) and its jqXHR (a promise: done, fail,
 * always, then, catch; readyState, status, statusText, responseText, responseJSON, getResponseHeader, abort); the
 * same headers (Accept, Content-Type, X-Requested-With) and encodings (form fields, %20 sent as +, GET data in the
 * URL); ajaxStart, ajaxSend, ajaxSuccess, ajaxError, ajaxComplete and ajaxStop on the document, in jQuery's order,
 * $.active the requests open. $.Deferred and $.when as jQuery 3+: done, fail and always run at once, then() later,
 * with all arguments.
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
var ui = e( 101 ), slice = Array.prototype.slice, store = new WeakMap(), events_of = new WeakMap(),
    trigger_args = new WeakMap(), queues = new WeakMap(), unrun = new WeakSet();

function $( selector, context ) {
    return new Init( selector, context );
}

var fn = $.fn = $.prototype = {
    jquery: 'ngl',
    length: 0
};

function Init( selector, context ) {
    var list, name;
    if ( !selector ) return;
    if ( typeof selector === 'function' ) {
        ready( selector );
        list = [ document ];
    } else if ( typeof selector === 'string' ) {
        if ( /^\s*</.test( selector ) ) {
            list = parse( selector );
            // $( '<div>', { height: 10 } ): methods of that name are called, the rest set as attributes
            if ( is_plain( context ) ) {
                for ( name in context ) {
                    if ( typeof fn[ name ] === 'function' ) $( list )[ name ]( context[ name ] );
                    else $( list ).attr( name, context[ name ] );
                }
            }
        } else {
            list = context ? $( context ).find( selector ).toArray() : slice.call( select( document, selector ) );
        }
    } else if ( selector.nodeType || selector === selector.window ) {
        list = [ selector ];
    } else {
        list = slice.call( selector );
    }
    for ( var i = 0; i < list.length; i++ ) this[ i ] = list[ i ];
    this.length = list.length;
}
Init.prototype = fn;

function is_plain( o ) {
    var proto;
    if ( !o || Object.prototype.toString.call( o ) !== '[object Object]' ) return false;
    proto = Object.getPrototypeOf( o );
    return !proto || proto === Object.prototype;
}

/**
 * HTML to nodes, as jQuery.parseHTML: the top level nodes, text included. Its scripts are not run here; they run when
 * the layer puts them into the document (append, after, replaceWith, html), once, as jQuery's domManip runs them.
 */
function parse( html ) {
    var template = document.createElement( 'template' );
    template.innerHTML = String( html ).trim();
    slice.call( template.content.querySelectorAll( 'script' ) ).forEach( function( script ) {
        unrun.add( script );
    } );
    return slice.call( template.content.childNodes ).map( function( node ) {
        return document.adoptNode( node );
    } );
}

/** jQuery's find(): a selector starting with a combinator (> button) starts at root itself. */
function select( root, selector ) {
    return root.querySelectorAll( /^\s*[>+~]/.test( selector ) ? ':scope ' + selector : selector );
}

function matches( el, selector ) {
    return !!el && el.nodeType === 1 && el.matches( selector );
}

/** Without duplicates, in document order (as jQuery's results over more than one element). */
function ordered( list ) {
    var out = [];
    list.forEach( function( x ) {
        if ( x && out.indexOf( x ) === -1 ) out.push( x );
    } );
    return out.sort( function( a, b ) {
        return a === b ? 0 : a.compareDocumentPosition( b ) & 4 ? -1 : 1;
    } );
}

function ready( callback ) {
    var run = function() {
        setTimeout( function() {
            callback.call( document, $ );
        } );
    };
    if ( document.readyState !== 'loading' ) run();
    else document.addEventListener( 'DOMContentLoaded', run, { once: true } );
}

/** jQuery.extend( [deep,] target, ...sources ) */
function extend() {
    var target = arguments[ 0 ] || {}, i = 1, deep = false, name, source, copy, src;
    if ( typeof target === 'boolean' ) {
        deep = target;
        target = arguments[ 1 ] || {};
        i = 2;
    }
    for ( ; i < arguments.length; i++ ) {
        source = arguments[ i ];
        if ( source == null ) continue;
        for ( name in source ) {
            copy = source[ name ];
            if ( name === '__proto__' || target === copy ) continue;
            if ( deep && copy && ( is_plain( copy ) || Array.isArray( copy ) ) ) {
                src = target[ name ];
                target[ name ] = extend( true, Array.isArray( copy ) ? ( Array.isArray( src ) ? src : [] ) : ( is_plain( src ) ? src : {} ), copy );
            } else if ( copy !== undefined ) {
                target[ name ] = copy;
            }
        }
    }
    return target;
}
$.extend = extend;

// ---- collections -------------------------------------------------------------------------------------------------

function filtered( list, selector ) {
    return $( selector ? list.filter( function( el ) { return matches( el, selector ); } ) : list );
}

extend( fn, {
    each: function( callback ) {
        for ( var i = 0; i < this.length; i++ ) {
            if ( callback.call( this[ i ], i, this[ i ] ) === false ) break;
        }
        return this;
    },
    map: function( callback ) {
        var out = [];
        this.each( function( i, el ) {
            var value = callback.call( el, i, el );
            if ( value != null ) out = out.concat( value );
        } );
        return $( out );
    },
    get: function( i ) {
        return i == null ? slice.call( this ) : this[ i < 0 ? i + this.length : i ];
    },
    toArray: function() {
        return slice.call( this );
    },
    eq: function( i ) {
        var el = this.get( i );
        return $( el === undefined ? [] : [ el ] );
    },
    first: function() {
        return this.eq( 0 );
    },
    filter: function( test ) {
        return $( this.toArray().filter( function( el, i ) {
            return typeof test === 'function' ? test.call( el, i, el ) : matches( el, test );
        } ) );
    },
    /** index(): the first element's position among its sibling elements; index( el | $obj ): its position here */
    index: function( el ) {
        var first = this[ 0 ], i = 0;
        if ( el === undefined ) {
            if ( !first || !first.parentNode ) return -1;
            while ( ( first = first.previousElementSibling ) ) i++;
            return i;
        }
        return slice.call( this ).indexOf( el && el.jquery ? el[ 0 ] : el );
    },
    find: function( selector ) {
        var found = [];
        this.each( function() {
            if ( this.querySelectorAll ) found = found.concat( slice.call( select( this, selector ) ) );
        } );
        return $( this.length > 1 ? ordered( found ) : found );
    },
    closest: function( selector ) {
        return $( ordered( this.toArray().map( function( el ) {
            return el.nodeType === 1 ? el.closest( selector ) : null;
        } ) ) );
    },
    children: function( selector ) {
        var list = [];
        this.each( function() {
            list = list.concat( slice.call( this.children || [] ) );
        } );
        return filtered( list, selector );
    },
    parent: function( selector ) {
        return filtered( ordered( this.toArray().map( function( el ) {
            var p = el.parentNode;
            return p && p.nodeType !== 11 ? p : null;
        } ) ), selector );
    },
    parents: function( selector ) {
        var list = [];
        this.each( function() {
            for ( var p = this.parentNode; p && p.nodeType === 1; p = p.parentNode ) {
                if ( list.indexOf( p ) === -1 ) list.push( p );
            }
        } );
        return filtered( list, selector );
    },
    next: function( selector ) {
        return filtered( this.toArray().map( function( el ) {
            return el.nextElementSibling;
        } ).filter( Boolean ), selector );
    },
    siblings: function( selector ) {
        var list = [];
        this.each( function() {
            var el = this;
            slice.call( el.parentNode ? el.parentNode.children : [] ).forEach( function( s ) {
                if ( s !== el && list.indexOf( s ) === -1 ) list.push( s );
            } );
        } );
        return filtered( list, selector );
    }
} );

// ---- attributes, classes, data, styles, values -------------------------------------------------------------------

function words( value ) {
    return String( value == null ? '' : value ).split( /\s+/ ).filter( Boolean );
}

function camel( key ) {
    return String( key ).replace( /-([a-z])/g, function( m, c ) { return c.toUpperCase(); } );
}

function hyphen( key ) {
    return String( key ).replace( /[A-Z]/g, function( c ) { return '-' + c.toLowerCase(); } );
}

/** A data-* attribute value as jQuery reads it. */
function from_attribute( value ) {
    if ( value === 'true' ) return true;
    if ( value === 'false' ) return false;
    if ( value === 'null' ) return null;
    if ( value === +value + '' ) return +value;
    if ( /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/.test( value ) ) {
        try {
            return JSON.parse( value );
        } catch ( err ) {
            return value;
        }
    }
    return value;
}

function data_of( el, create ) {
    var data = store.get( el );
    if ( !data && create ) store.set( el, data = {} );
    return data;
}

function read_data( el, key ) {
    var data, name;
    if ( key === '_view' ) return el.ngl_view;
    data = data_of( el, true );
    key = camel( key );
    if ( !( key in data ) && el.nodeType === 1 ) {
        name = 'data-' + hyphen( key );
        if ( el.hasAttribute( name ) ) data[ key ] = from_attribute( el.getAttribute( name ) );
    }
    return data[ key ];
}

var UNITLESS = /^(?:opacity|z-?index|zoom|font-?weight|line-?height|flex(?:-?grow|-?shrink)?|order|orphans|widows)$/i;

extend( fn, {
    addClass: function( value ) {
        var names = words( value );
        return this.each( function() {
            var list = this.classList;
            if ( list && names.some( function( name ) { return !list.contains( name ); } ) ) list.add.apply( list, names );
        } );
    },
    removeClass: function( value ) {
        var names = words( value );
        return this.each( function() {
            var list = this.classList;
            if ( !list ) return;
            // as jQuery, the class attribute is only written when it changes
            if ( value === undefined ) this.setAttribute( 'class', '' );
            else if ( names.some( function( name ) { return list.contains( name ); } ) ) list.remove.apply( list, names );
        } );
    },
    hasClass: function( name ) {
        return this.toArray().some( function( el ) {
            return !!el.classList && el.classList.contains( name );
        } );
    },
    /** attr( name ), attr( name, value ), attr( { name: value } ); the value null removes the attribute */
    attr: function( name, value ) {
        var el = this[ 0 ], found;
        if ( typeof name === 'object' ) {
            for ( var key in name ) this.attr( key, name[ key ] );
            return this;
        }
        if ( value === undefined ) {
            found = el && el.nodeType === 1 ? el.getAttribute( name ) : null;
            return found === null ? undefined : found;
        }
        return this.each( function() {
            if ( this.nodeType !== 1 ) return;
            if ( value === null ) this.removeAttribute( name );
            else this.setAttribute( name, String( value ) );
        } );
    },
    removeAttr: function( names ) {
        names = words( names );
        return this.each( function() {
            var el = this;
            if ( el.nodeType === 1 ) names.forEach( function( name ) { el.removeAttribute( name ); } );
        } );
    },
    prop: function( name, value ) {
        if ( value === undefined ) return this[ 0 ] ? this[ 0 ][ name ] : undefined;
        return this.each( function() {
            this[ name ] = value;
        } );
    },
    /** data(), data( key ), data( key, value ), data( { key: value } ) */
    data: function( key, value ) {
        var el = this[ 0 ], all;
        if ( key === undefined ) {
            if ( !el ) return undefined;
            all = {};
            slice.call( el.attributes || [] ).forEach( function( a ) {
                if ( a.name.indexOf( 'data-' ) === 0 ) all[ camel( a.name.slice( 5 ) ) ] = read_data( el, a.name.slice( 5 ) );
            } );
            return extend( all, data_of( el, true ) );
        }
        if ( typeof key === 'object' ) {
            for ( var k in key ) this.data( k, key[ k ] );
            return this;
        }
        if ( value === undefined ) return el ? read_data( el, key ) : undefined;
        return this.each( function() {
            if ( key === '_view' ) this.ngl_view = value;
            else data_of( this, true )[ camel( key ) ] = value;
        } );
    },
    removeData: function( key ) {
        return this.each( function() {
            var data = data_of( this );
            if ( key === '_view' ) delete this.ngl_view;
            else if ( data ) delete data[ camel( key ) ];
        } );
    },
    /** css( name ): the computed value; css( name, value ), css( { name: value } ): inline, numbers in px */
    css: function( name, value ) {
        if ( typeof name === 'object' ) {
            for ( var key in name ) this.css( key, name[ key ] );
            return this;
        }
        if ( value === undefined ) return this[ 0 ] ? getComputedStyle( this[ 0 ] ).getPropertyValue( hyphen( name ) ) : undefined;
        return this.each( function() {
            this.style[ camel( name ) ] = typeof value === 'number' && !UNITLESS.test( name ) ? value + 'px' : value;
        } );
    },
    /** height(): the content height of the first element; height( value ): sets it, a number in px */
    height: function( value ) {
        var el = this[ 0 ], style, box;
        if ( value !== undefined ) return this.css( 'height', value );
        if ( el === window ) return window.innerHeight;
        if ( !el || el.nodeType !== 1 ) return undefined;
        style = getComputedStyle( el );
        box = [ 'paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth' ].reduce( function( sum, p ) {
            return sum + ( parseFloat( style[ p ] ) || 0 );
        }, 0 );
        return Math.max( 0, el.offsetHeight - box );
    },
    /** val(): the first control's value (an array for a multiple select, null for a select without one); val( v ) */
    val: function( value ) {
        var el = this[ 0 ], picked;
        if ( value === undefined ) {
            if ( !el ) return undefined;
            if ( el.nodeName === 'SELECT' ) {
                picked = slice.call( el.options ).filter( function( o ) {
                    return o.selected && !o.disabled && !( o.parentNode.disabled && o.parentNode.nodeName === 'OPTGROUP' );
                } ).map( function( o ) {
                    return o.value;
                } );
                return el.multiple ? picked : picked.length ? picked[ 0 ] : null;
            }
            return typeof el.value === 'string' ? el.value.replace( /\r/g, '' ) : el.value == null ? '' : el.value;
        }
        return this.each( function() {
            var v = value == null ? '' : value, list = [].concat( v ).map( String ), any = false;
            if ( this.nodeName === 'SELECT' ) {
                slice.call( this.options ).forEach( function( o ) {
                    o.selected = list.indexOf( o.value ) !== -1;
                    any = any || o.selected;
                } );
                if ( !any ) this.selectedIndex = -1;
            } else if ( Array.isArray( v ) && /^(?:checkbox|radio)$/i.test( this.type ) ) {
                this.checked = list.indexOf( this.value ) !== -1;
            } else {
                this.value = String( v );
            }
        } );
    }
} );

// ---- inserting, replacing and removing -----------------------------------------------------------------------------

/** jQuery's cleanData: the layer's handlers and data of the elements given (or only what is inside them) go. */
function clean( elements, inside_only ) {
    elements.forEach( function( el ) {
        var all = el.querySelectorAll ? slice.call( el.querySelectorAll( '*' ) ) : [];
        if ( !inside_only ) all.unshift( el );
        all.forEach( function( x ) {
            var events = events_of.get( x );
            if ( events ) {
                Object.keys( events ).forEach( function( type ) {
                    x.removeEventListener( type, events[ type ].listener );
                } );
                events_of.delete( x );
            }
            store.delete( x );
            if ( x.ngl_view ) delete x.ngl_view;
        } );
    } );
}

/** What can be inserted (HTML, a node, $obj, arrays of these, nested) as a list of nodes. */
function nodes( value ) {
    var list = [];
    if ( value == null || value === false ) return list;
    if ( typeof value === 'string' || typeof value === 'number' ) return parse( String( value ) );
    if ( value.nodeType ) return [ value ];
    slice.call( value ).forEach( function( v ) {
        list = list.concat( nodes( v ) );
    } );
    return list;
}

/** Puts the nodes at each element with place( el, fragment ); all but the last element get copies, as jQuery. */
function insert( targets, value, place ) {
    var list = nodes( value ), last = targets.length - 1;
    if ( !list.length ) return targets;
    targets.each( function( i ) {
        var fragment = document.createDocumentFragment();
        list.forEach( function( node ) {
            fragment.appendChild( i === last ? node : node.cloneNode( true ) );
        } );
        place( this, fragment );
    } );
    run_inserted( list );
    return targets;
}

/**
 * Runs a script element put in as HTML (the browser does not run those) as jQuery's DOMEval does: a new copy of it in
 * the head, taken out again once it ran (one with src stays to load); the element itself stays where it is.
 */
function run_script( old ) {
    if ( old.type && !/^(?:(?:text|application)\/(?:java|ecma)script|module)$/i.test( old.type ) ) return;
    var script = document.createElement( 'script' );
    slice.call( old.attributes ).forEach( function( a ) {
        script.setAttribute( a.name, a.value );
    } );
    script.text = old.text;
    ( document.head || document.documentElement ).appendChild( script );
    if ( !script.src && script.parentNode ) script.parentNode.removeChild( script );
}

/** Scripts in HTML put in by html() run, as with jQuery. */
function run_scripts( el ) {
    slice.call( el.querySelectorAll( 'script' ) ).forEach( run_script );
}

/** The scripts of the layer's parsed HTML among `list` that are now in the document run, each once. */
function run_inserted( list ) {
    list.forEach( function( node ) {
        if ( node.nodeType !== 1 ) return;
        ( node.nodeName === 'SCRIPT' ? [ node ] : slice.call( node.querySelectorAll( 'script' ) ) ).forEach( function( script ) {
            if ( !unrun.has( script ) || !script.isConnected ) return;
            unrun.delete( script );
            run_script( script );
        } );
    } );
}

extend( fn, {
    html: function( value ) {
        if ( value === undefined ) return this[ 0 ] && this[ 0 ].nodeType === 1 ? this[ 0 ].innerHTML : undefined;
        if ( typeof value !== 'string' && typeof value !== 'number' ) return this.empty().append( value );
        return this.each( function() {
            if ( this.nodeType !== 1 ) return;
            clean( [ this ], true );
            this.innerHTML = String( value );
            if ( /<script/i.test( value ) ) run_scripts( this );
        } );
    },
    text: function( value ) {
        if ( value === undefined ) {
            return this.toArray().map( function( el ) {
                return el.textContent;
            } ).join( '' );
        }
        return this.empty().each( function() {
            this.textContent = String( value );
        } );
    },
    append: function( value ) {
        return insert( this, value, function( el, fragment ) {
            el.appendChild( fragment );
        } );
    },
    after: function( value ) {
        return insert( this, value, function( el, fragment ) {
            if ( el.parentNode ) el.parentNode.insertBefore( fragment, el.nextSibling );
        } );
    },
    replaceWith: function( value ) {
        var list = nodes( value );
        return this.each( function( i, el ) {
            var fragment = document.createDocumentFragment();
            if ( !el.parentNode ) return;
            clean( [ el ] );
            list.forEach( function( node ) {
                fragment.appendChild( i === 0 ? node : node.cloneNode( true ) );
            } );
            el.parentNode.replaceChild( fragment, el );
            if ( i === 0 ) run_inserted( list );
        } );
    },
    remove: function() {
        clean( this.toArray() );
        return this.each( function() {
            if ( this.parentNode ) this.parentNode.removeChild( this );
        } );
    },
    empty: function() {
        return this.each( function() {
            clean( [ this ], true );
            this.textContent = '';
        } );
    }
} );

// ---- showing and hiding ------------------------------------------------------------------------------------------

/** jQuery's fx queue: the fades of an element run one after the other, the first one at once. */
function queue( el, step ) {
    var steps = queues.get( el );
    if ( !steps ) queues.set( el, steps = [] );
    steps.push( step );
    if ( steps.length === 1 ) next_step( steps );
}

function next_step( steps ) {
    steps[ 0 ]( function() {
        steps.shift();
        if ( steps.length ) next_step( steps );
    } );
}

/** fadeIn and fadeOut ( [duration ms | "fast" | "slow"], [callback] ): opacity, then shown or display none */
function fade( list, showing, duration, callback ) {
    var ms = typeof duration === 'number' ? duration : { fast: 200, slow: 600 }[ duration ] || 400;
    return list.each( function() {
        var el = this;
        if ( el.nodeType !== 1 ) return;
        queue( el, function( done ) {
            var finish = function() {
                el.style.opacity = '';
                if ( !showing ) ui.hide( el );
                if ( typeof callback === 'function' ) callback.call( el );
                done();
            };
            // as jQuery: fading in what is shown, or out what is hidden, does nothing
            if ( showing !== ui.is_hidden( el ) ) return finish();
            if ( showing ) ui.show( el );
            if ( typeof el.animate === 'function' ) {
                try {
                    el.animate( showing ? [ { opacity: 0 }, { opacity: 1 } ] : [ { opacity: 1 }, { opacity: 0 } ], { duration: ms } );
                } catch ( err ) {}
            }
            setTimeout( finish, ms );
        } );
    } );
}

extend( fn, {
    show: function() {
        return this.each( function() {
            if ( this.nodeType === 1 ) ui.show( this );
        } );
    },
    hide: function() {
        return this.each( function() {
            if ( this.nodeType === 1 ) ui.hide( this );
        } );
    },
    fadeIn: function( duration, callback ) {
        return fade( this, true, duration, callback );
    },
    fadeOut: function( duration, callback ) {
        return fade( this, false, duration, callback );
    }
} );

// ---- forms -------------------------------------------------------------------------------------------------------

extend( fn, {
    /** The successful controls of the forms (or the controls themselves) as [ { name, value } ], as jQuery */
    serializeArray: function() {
        var out = [];
        this.each( function() {
            slice.call( this.elements || [ this ] ).forEach( function( c ) {
                var value;
                if ( !c.name || c.disabled || ( c.matches && c.matches( ':disabled' ) ) ||
                     !/^(?:input|select|textarea|keygen)/i.test( c.nodeName ) ||
                     /^(?:submit|button|image|reset|file)$/i.test( c.type ) ||
                     ( /^(?:checkbox|radio)$/i.test( c.type ) && !c.checked ) ) return;
                value = $( c ).val();
                if ( value == null ) return;
                [].concat( value ).forEach( function( v ) {
                    out.push( { name: c.name, value: String( v ).replace( /\r?\n/g, '\r\n' ) } );
                } );
            } );
        } );
        return out;
    },
    serialize: function() {
        return param( this.serializeArray() );
    }
} );

// ---- events ------------------------------------------------------------------------------------------------------

/** jQuery's event: the native one with jQuery's currentTarget (the element whose handlers run) and methods. */
function wrap( native, root, state ) {
    var own = {};
    return new Proxy( native, {
        get: function( target, key ) {
            if ( Object.prototype.hasOwnProperty.call( own, key ) ) return own[ key ];
            switch ( key ) {
                case 'currentTarget': return state.current;
                case 'delegateTarget': return root;
                case 'originalEvent': return target;
                case 'which': return target.which || ( /^key/.test( target.type ) ? target.charCode || target.keyCode || 0 : target.which );
                case 'isDefaultPrevented': return function() { return target.defaultPrevented; };
                case 'isPropagationStopped': return function() { return state.stopped; };
                case 'isImmediatePropagationStopped': return function() { return state.immediate; };
                case 'stopPropagation': return function() {
                    state.stopped = true;
                    target.stopPropagation();
                };
                case 'stopImmediatePropagation': return function() {
                    state.stopped = state.immediate = true;
                    target.stopImmediatePropagation();
                };
            }
            var value = Reflect.get( target, key, target );
            return typeof value === 'function' ? value.bind( target ) : value;
        },
        set: function( target, key, value ) {
            own[ key ] = value;
            return true;
        }
    } );
}

/** A delegated handler's selector matches el; one starting with a combinator is relative to the bound element. */
function delegate_match( el, selector, root ) {
    if ( /^\s*[>+~]/.test( selector ) ) return slice.call( select( root, selector ) ).indexOf( el ) !== -1;
    return matches( el, selector );
}

function dispatch( root, entry, native ) {
    var state = { current: root, stopped: false, immediate: false }, event = wrap( native, root, state ),
        args = [ event ].concat( trigger_args.get( native ) || [] ), handlers = entry.list.slice(), levels = [], cur, i, j;
    var delegated = handlers.filter( function( h ) { return h.selector; } ),
        direct = handlers.filter( function( h ) { return !h.selector; } );
    // the delegated handlers, from the target up to the bound element (not for a click of another button than the first)
    if ( delegated.length && native.target && !( native.type === 'click' && native.button >= 1 ) ) {
        for ( cur = native.target.nodeType === 3 ? native.target.parentNode : native.target; cur && cur !== root; cur = cur.parentNode ) {
            if ( cur.nodeType !== 1 || ( native.type === 'click' && cur.disabled === true ) ) continue;
            var at = cur, matched = delegated.filter( function( h ) { return delegate_match( at, h.selector, root ); } );
            if ( matched.length ) levels.push( { el: cur, handlers: matched } );
        }
    }
    if ( direct.length ) levels.push( { el: root, handlers: direct } );
    for ( i = 0; i < levels.length && !state.stopped; i++ ) {
        state.current = levels[ i ].el;
        for ( j = 0; j < levels[ i ].handlers.length && !state.immediate; j++ ) {
            if ( levels[ i ].handlers[ j ].handler.apply( levels[ i ].el, args ) === false ) {
                native.preventDefault();
                event.stopPropagation();
            }
        }
    }
}

/** "click.ns1.ns2" -> { type: "click", ns: [ "ns1", "ns2" ] } */
function parse_type( name ) {
    var parts = name.split( '.' );
    return { type: parts.shift(), ns: parts };
}

function on( el, types, selector, handler ) {
    words( types ).forEach( function( name ) {
        var t = parse_type( name ), events, entry,
            bind = selector && t.type === 'focus' ? 'focusin' : selector && t.type === 'blur' ? 'focusout' : t.type;
        if ( !t.type ) return;
        events = events_of.get( el );
        if ( !events ) events_of.set( el, events = {} );
        entry = events[ bind ];
        if ( !entry ) {
            entry = events[ bind ] = { list: [] };
            entry.listener = function( ev ) {
                dispatch( el, entry, ev );
            };
            el.addEventListener( bind, entry.listener );
        }
        entry.list.push( { type: t.type, ns: t.ns, selector: selector || '', handler: handler } );
    } );
}

function off( el, types, selector, handler ) {
    var events = events_of.get( el );
    if ( !events ) return;
    ( types ? words( types ) : [ '' ] ).forEach( function( name ) {
        var t = parse_type( name );
        Object.keys( events ).forEach( function( bind ) {
            var entry = events[ bind ];
            entry.list = entry.list.filter( function( h ) {
                return !( ( !t.type || h.type === t.type ) &&
                          t.ns.every( function( ns ) { return h.ns.indexOf( ns ) !== -1; } ) &&
                          ( !selector || ( selector === '**' ? !!h.selector : h.selector === selector ) ) &&
                          ( !handler || h.handler === handler ) );
            } );
            if ( !entry.list.length ) {
                el.removeEventListener( bind, entry.listener );
                delete events[ bind ];
            }
        } );
    } );
}

extend( fn, {
    /** on( types, [selector], handler ) */
    on: function( types, selector, handler ) {
        if ( typeof selector === 'function' ) {
            handler = selector;
            selector = undefined;
        }
        return this.each( function() {
            on( this, types, selector, handler );
        } );
    },
    /** off(), off( types ), off( types, [selector], [handler] ); types may be namespaces only (".ns") */
    off: function( types, selector, handler ) {
        if ( typeof selector === 'function' ) {
            handler = selector;
            selector = undefined;
        }
        return this.each( function() {
            off( this, types, selector, handler );
        } );
    },
    /** trigger( type, [args] ): focus, blur and click as the element's own method, the rest as a CustomEvent */
    trigger: function( type, args ) {
        var extra = args === undefined ? [] : Array.isArray( args ) ? args : [ args ];
        return this.each( function() {
            var ev;
            if ( /^(?:focus|blur|click)$/.test( type ) && typeof this[ type ] === 'function' ) {
                this[ type ]();
                return;
            }
            ev = new CustomEvent( type, { bubbles: true, cancelable: true, detail: extra.length ? extra : null } );
            trigger_args.set( ev, extra );
            this.dispatchEvent( ev );
        } );
    }
} );

[ 'ajaxStart', 'ajaxStop', 'ajaxSend', 'ajaxSuccess', 'ajaxError', 'ajaxComplete' ].forEach( function( type ) {
    fn[ type ] = function( handler ) {
        return this.on( type, handler );
    };
} );

// ---- utilities ---------------------------------------------------------------------------------------------------

/** jQuery.param(): an object (nested objects and arrays as a[b]=1, a[]=1) or an array of { name, value } */
function param( a ) {
    var out = [], prefix;
    function add( key, value ) {
        value = typeof value === 'function' ? value() : value;
        out.push( encodeURIComponent( key ) + '=' + encodeURIComponent( value == null ? '' : value ) );
    }
    function build( prefix, obj ) {
        if ( Array.isArray( obj ) ) {
            obj.forEach( function( v, i ) {
                if ( /\[\]$/.test( prefix ) ) add( prefix, v );
                else build( prefix + '[' + ( typeof v === 'object' && v != null ? i : '' ) + ']', v );
            } );
        } else if ( obj && typeof obj === 'object' ) {
            for ( var name in obj ) build( prefix + '[' + name + ']', obj[ name ] );
        } else {
            add( prefix, obj );
        }
    }
    if ( a == null ) return '';
    if ( Array.isArray( a ) || a.jquery ) {
        slice.call( a ).forEach( function( item ) {
            add( item.name, item.value );
        } );
    } else {
        for ( prefix in a ) build( prefix, a[ prefix ] );
    }
    return out.join( '&' );
}

extend( $, {
    param: param,
    each: function( obj, callback ) {
        var i;
        if ( obj && typeof obj.length === 'number' && typeof obj !== 'function' ) {
            for ( i = 0; i < obj.length; i++ ) if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) break;
        } else {
            for ( i in obj ) if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) break;
        }
        return obj;
    },
    inArray: function( value, array, from ) {
        return array == null ? -1 : Array.prototype.indexOf.call( array, value, from );
    }
} );

// ---- $.Deferred, $.when ------------------------------------------------------------------------------------------

function thenable( x ) {
    return !!x && ( typeof x === 'object' || typeof x === 'function' ) && typeof x.then === 'function';
}

/** jQuery's Deferred: done, fail and always run at once (also when added after the end), then() later. */
function Deferred() {
    var state = 'pending', context, values, lists = { done: [], fail: [] }, firing = false, promise, deferred;

    function add( kind, args ) {
        slice.call( args ).forEach( function( f ) {
            if ( f && typeof f !== 'function' && typeof f.length === 'number' ) return add( kind, f );
            if ( typeof f !== 'function' ) return;
            if ( state === 'pending' || firing ) lists[ kind ].push( f );
            else if ( state === ( kind === 'done' ? 'resolved' : 'rejected' ) ) f.apply( context, values );
        } );
    }
    function settle( to, kind ) {
        return function( ctx, args ) {
            var list = lists[ kind ];
            if ( state !== 'pending' ) return deferred;
            state = to;
            context = ctx;
            values = args ? slice.call( args ) : [];
            firing = true;
            for ( var i = 0; i < list.length; i++ ) list[ i ].apply( context, values );
            firing = false;
            lists = { done: [], fail: [] };
            return deferred;
        };
    }
    /** A then() handler: later, its result (or what a thenable it returns comes to) settles `next`. */
    function step( next, handler, passes ) {
        return function() {
            var that = this, args = slice.call( arguments );
            setTimeout( function() {
                var result;
                if ( typeof handler !== 'function' ) return passes ? next.resolveWith( that, args ) : next.rejectWith( that, args );
                try {
                    result = handler.apply( that, args );
                } catch ( err ) {
                    if ( window.console && err && /^(?:Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/.test( err.name ) ) {
                        window.console.warn( 'Deferred exception: ' + err.message, err.stack );
                    }
                    return next.rejectWith( undefined, [ err ] );
                }
                if ( result === next.promise() ) return next.rejectWith( undefined, [ new TypeError( 'Thenable self-resolution' ) ] );
                if ( thenable( result ) ) {
                    result.then( function() {
                        next.resolveWith( this, arguments );
                    }, function() {
                        next.rejectWith( this, arguments );
                    } );
                } else {
                    next.resolveWith( undefined, [ result ] );
                }
            } );
        };
    }

    promise = {
        state: function() {
            return state;
        },
        done: function() {
            add( 'done', arguments );
            return this;
        },
        fail: function() {
            add( 'fail', arguments );
            return this;
        },
        always: function() {
            add( 'done', arguments );
            add( 'fail', arguments );
            return this;
        },
        then: function( on_done, on_fail ) {
            var next = Deferred();
            add( 'done', [ step( next, on_done, true ) ] );
            add( 'fail', [ step( next, on_fail, false ) ] );
            return next.promise();
        },
        'catch': function( on_fail ) {
            return promise.then( null, on_fail );
        },
        promise: function( obj ) {
            return obj != null ? extend( obj, promise ) : promise;
        }
    };
    deferred = extend( {}, promise, {
        resolveWith: settle( 'resolved', 'done' ),
        rejectWith: settle( 'rejected', 'fail' ),
        resolve: function() {
            return deferred.resolveWith( this === deferred ? promise : this, arguments );
        },
        reject: function() {
            return deferred.rejectWith( this === deferred ? promise : this, arguments );
        }
    } );
    return deferred;
}

/** $.when( ... ): resolved when all are (a value that is no promise counts as resolved), with each one's values. */
function when() {
    var subs = slice.call( arguments ), remaining = subs.length, main = Deferred(), values = [], contexts = [];
    function adopt( value, resolve ) {
        if ( value && typeof value.promise === 'function' ) value.promise().done( resolve ).fail( main.reject );
        else if ( thenable( value ) ) value.then( resolve, main.reject );
        else resolve( value );
    }
    if ( remaining <= 1 ) {
        adopt( subs[ 0 ], function() {
            main.resolveWith( this, arguments );
        } );
        // as jQuery: a promise given comes back as main.then(), one step later
        return main.state() === 'pending' || thenable( subs[ 0 ] ) ? main.then() : main.promise();
    }
    subs.forEach( function( value, i ) {
        adopt( value, function( first ) {
            contexts[ i ] = this;
            values[ i ] = arguments.length > 1 ? slice.call( arguments ) : first;
            if ( !--remaining ) main.resolveWith( contexts, values );
        } );
    } );
    return main.promise();
}

$.Deferred = Deferred;
$.when = when;

// ---- $.ajax ------------------------------------------------------------------------------------------------------

var ACCEPTS = { json: 'application/json, text/javascript', html: 'text/html', text: 'text/plain', xml: 'application/xml, text/xml' };

$.active = 0;

function global( type, args ) {
    $( document ).trigger( type, args );
}

function same_origin( url ) {
    try {
        return new URL( url, document.baseURI ).origin === window.location.origin;
    } catch ( err ) {
        return false;
    }
}

/** $.ajax( [url,] options ) -> jqXHR */
function ajax( url, options ) {
    if ( typeof url === 'object' ) {
        options = url;
        url = undefined;
    }
    options = options || {};
    var s = extend( { contentType: 'application/x-www-form-urlencoded; charset=UTF-8', processData: true, global: true }, options ),
        context = s.context || s, deferred = Deferred(), completion = Deferred(), headers = {}, xhr = null,
        completed = false, has_content, accepts, hash, name, jqXHR;
    s.url = String( url || s.url || window.location.href );
    s.type = String( s.method || s.type || 'GET' ).toUpperCase();
    has_content = !/^(?:GET|HEAD)$/.test( s.type );
    if ( s.data && s.processData && typeof s.data !== 'string' ) s.data = param( s.data );
    if ( !has_content ) {
        // GET data goes in the URL, before the hash
        if ( s.data ) {
            hash = /#.*$/.exec( s.url );
            s.url = s.url.replace( /#.*$/, '' );
            s.url += ( /\?/.test( s.url ) ? '&' : '?' ) + s.data + ( hash ? hash[ 0 ] : '' );
        }
        delete s.data;
    } else if ( s.data && s.processData && ( s.contentType || '' ).indexOf( 'application/x-www-form-urlencoded' ) === 0 ) {
        s.data = s.data.replace( /%20/g, '+' );
    }

    jqXHR = {
        readyState: 0,
        status: 0,
        statusText: '',
        setRequestHeader: function( key, value ) {
            if ( !xhr ) headers[ key ] = value;
            return this;
        },
        getResponseHeader: function( key ) {
            return xhr && jqXHR.readyState === 4 ? xhr.getResponseHeader( key ) : null;
        },
        getAllResponseHeaders: function() {
            return xhr && jqXHR.readyState === 4 ? xhr.getAllResponseHeaders() : null;
        },
        overrideMimeType: function() {
            return this;
        },
        abort: function( text ) {
            var x = xhr;
            if ( x && !completed ) {
                x.onload = x.onerror = x.onabort = x.ontimeout = null;
                x.abort();
            }
            finish( 0, text || 'canceled' );
            return this;
        }
    };
    deferred.promise( jqXHR );

    function finish( status, native_text, text ) {
        var ok, status_text = native_text, data, error, parse_error, data_type;
        if ( completed ) return;
        completed = true;
        jqXHR.readyState = status > 0 ? 4 : 0;
        ok = status >= 200 && status < 300 || status === 304;
        if ( text !== undefined ) {
            // as jQuery, the response is converted also for an error: responseText, and responseJSON for JSON
            jqXHR.responseText = data = text;
            data_type = s.dataType || ( /\bjson\b/i.test( xhr.getResponseHeader( 'Content-Type' ) || '' ) ? 'json' : 'text' );
            if ( data_type === 'json' ) {
                try {
                    data = jqXHR.responseJSON = JSON.parse( text );
                } catch ( err ) {
                    parse_error = err;
                }
            }
        }
        if ( ok ) {
            if ( status === 204 || s.type === 'HEAD' ) {
                status_text = 'nocontent';
                data = undefined;
            } else if ( status === 304 ) {
                status_text = 'notmodified';
            } else if ( parse_error ) {
                status_text = 'parsererror';
                error = parse_error;
                ok = false;
            } else {
                status_text = 'success';
            }
        } else {
            error = status_text;
            if ( status || !status_text ) {
                status_text = 'error';
                if ( status < 0 ) status = 0;
            }
        }
        jqXHR.status = status;
        jqXHR.statusText = String( native_text || status_text );
        if ( ok ) deferred.resolveWith( context, [ data, status_text, jqXHR ] );
        else deferred.rejectWith( context, [ jqXHR, status_text, error ] );
        if ( s.global ) global( ok ? 'ajaxSuccess' : 'ajaxError', [ jqXHR, s, ok ? data : error ] );
        completion.resolveWith( context, [ jqXHR, status_text ] );
        if ( s.global ) {
            global( 'ajaxComplete', [ jqXHR, s ] );
            if ( !--$.active ) global( 'ajaxStop' );
        }
    }

    if ( s.global && $.active++ === 0 ) global( 'ajaxStart' );
    if ( ( s.data && has_content && s.contentType !== false ) || options.contentType ) headers[ 'Content-Type' ] = s.contentType;
    accepts = s.dataType && ACCEPTS[ s.dataType ];
    headers.Accept = accepts ? accepts + ', */*; q=0.01' : '*/*';
    if ( same_origin( s.url ) ) headers[ 'X-Requested-With' ] = 'XMLHttpRequest';
    for ( name in s.headers || {} ) headers[ name ] = s.headers[ name ];

    if ( s.beforeSend && ( s.beforeSend.call( context, jqXHR, s ) === false || completed ) ) return jqXHR.abort();
    completion.done( s.complete );
    jqXHR.done( s.success );
    jqXHR.fail( s.error );
    if ( s.global ) global( 'ajaxSend', [ jqXHR, s ] );
    if ( completed ) return jqXHR;

    xhr = new window.XMLHttpRequest();
    jqXHR.readyState = 1;
    try {
        xhr.open( s.type, s.url, true );
        for ( name in headers ) if ( headers[ name ] != null ) xhr.setRequestHeader( name, headers[ name ] );
        xhr.onload = function() {
            finish( xhr.status === 1223 ? 204 : xhr.status, xhr.statusText, typeof xhr.responseText === 'string' ? xhr.responseText : '' );
        };
        xhr.onerror = function() {
            finish( xhr.status || 0, xhr.statusText || 'error' );
        };
        xhr.ontimeout = function() {
            finish( 0, 'timeout' );
        };
        xhr.onabort = function() {
            finish( 0, 'abort' );
        };
        xhr.send( has_content && s.data != null ? s.data : null );
    } catch ( err ) {
        if ( completed ) throw err;
        finish( 0, String( err ) );
    }
    return jqXHR;
}

$.ajax = ajax;
$.get = function( url, data, callback, type ) {
    if ( typeof data === 'function' ) {
        type = type || callback;
        callback = data;
        data = undefined;
    }
    return ajax( { url: url, type: 'GET', dataType: type, data: data, success: callback } );
};

t.exports = $;
}
