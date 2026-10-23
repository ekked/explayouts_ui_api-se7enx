/**
 * jQuery 4 with a record of what the app calls of it (for the inventory of the editor's DOM layer): every method of
 * jQuery.fn and every static property the code outside jQuery reaches, with the selectors, event names, data keys and
 * request options it passes. Calls jQuery makes of itself are not recorded (the caller's frame is jQuery's file).
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
export async function recordingJQuery( window ) {
    const { jQueryFactory } = await import( 'jquery/factory' );
    const $ = jQueryFactory( window );
    const calls = new Map();
    const details = { selectors: new Set(), events: new Set(), data: new Set(), ajax: new Set(), fromWhere: new Map() };
    const outside = () => {
        const lines = String( new Error().stack ).split( '\n' );
        // [0] Error, [1] outside(), [2] the wrapper, [3] its caller
        const caller = lines[ 3 ] || '';
        return caller.includes( 'node_modules/jquery' ) ? null : caller.trim();
    };
    const note = ( name, args, where ) => {
        calls.set( name, ( calls.get( name ) || 0 ) + 1 );
        if ( !details.fromWhere.has( name ) ) details.fromWhere.set( name, new Set() );
        details.fromWhere.get( name ).add( where.replace( /^at /, '' ).replace( /\(eval at .*?\), /, '' ).slice( 0, 120 ) );
        const sel = ( x ) => { if ( typeof x === 'string' && !/^\s*</.test( x ) ) details.selectors.add( x ); };
        if ( /^(\$\(\)|fn\.(find|closest|is|filter|not|children|parents|parent|siblings|next|prev|has|index|nextAll|prevAll|parentsUntil))$/.test( name ) ) sel( args[ 0 ] );
        if ( /^fn\.(on|off|one|trigger|triggerHandler)$/.test( name ) ) {
            if ( typeof args[ 0 ] === 'string' ) details.events.add( name.slice( 3 ) + ' ' + args[ 0 ] );
            else if ( args[ 0 ] && typeof args[ 0 ] === 'object' ) details.events.add( name.slice( 3 ) + ' {' + Object.keys( args[ 0 ] ).join( ',' ) + '}' );
            if ( typeof args[ 1 ] === 'string' && name !== 'fn.trigger' ) sel( args[ 1 ] );
        }
        if ( /^fn\.(data|removeData)$/.test( name ) ) details.data.add( name.slice( 3 ) + ' ' + ( typeof args[ 0 ] === 'object' ? JSON.stringify( Object.keys( args[ 0 ] ) ) : String( args[ 0 ] ) ) + ' /' + args.length );
        if ( name === '$.ajax' ) {
            const o = typeof args[ 0 ] === 'object' ? args[ 0 ] : args[ 1 ] || {};
            details.ajax.add( Object.keys( o ).sort().join( ',' ) );
        }
    };
    const wrapped = new WeakSet();
    // Wraps the methods of jQuery.fn; called again after the app has added its own (./extended/jquery_override).
    const wrapFn = () => {
        for ( const key of Object.keys( $.fn ) ) {
            const fn = $.fn[ key ];
            if ( typeof fn !== 'function' || key === 'init' || key === 'constructor' || wrapped.has( fn ) ) continue;
            const wrapper = function ( ...args ) {
                const where = outside();
                if ( where ) note( 'fn.' + key, args, where );
                return fn.apply( this, args );
            };
            wrapped.add( wrapper );
            $.fn[ key ] = wrapper;
        }
    };
    wrapFn();
    const proxy = new Proxy( $, {
        apply( target, self, args ) {
            const where = outside();
            if ( where ) note( '$()', args, where );
            return target.apply( self, args );
        },
        get( target, key, receiver ) {
            const value = Reflect.get( target, key, receiver );
            if ( typeof key !== 'string' || key === 'prototype' ) return value;
            const where = outside();
            if ( !where ) return value;
            if ( typeof value === 'function' && key !== 'fn' ) {
                return function ( ...args ) {
                    note( '$.' + key, args, where );
                    return value.apply( this === proxy ? target : this, args );
                };
            }
            note( '$.' + key + ' (read)', [], where );
            return value;
        },
        set( target, key, value ) {
            const where = outside();
            if ( where ) note( '$.' + String( key ) + ' (set)', [], where );
            target[ key ] = value;
            return true;
        }
    } );
    return { $: proxy, raw: $, calls, details, wrapFn };
}
