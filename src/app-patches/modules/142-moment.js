function(e,t,n){
/*
 * Date formatting of the layout editor, in place of Moment.js and its locales (the module keeps its id and name;
 * ./helpers requires it for the template helper "date"). format( value, format, locale ) gives what
 * moment( value ).locale( locale ).format( format ) gave for the formats the editor uses, through
 * Intl.DateTimeFormat: the localised LT, L, LL, LLL, LLLL and l, ll, lll, llll, and the tokens YYYY, Y, MM, M,
 * DD, D, HH, H, mm, ss and [literal text] of a fixed format. Values as moment took them: undefined is now, a
 * number milliseconds, an ISO 8601 string without an offset local time ("2026-10-23", "2026-10-23 14:05",
 * "2026-10-23T14:05:00"), with Z or an offset that instant, any other string what Date makes of it; what is no
 * date gives "Invalid date". Moment wrote a normal space where Intl writes a narrow one (before AM/PM); so does
 * this.
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
var ISO = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d)(?::(\d\d)(?::(\d\d)(?:[.,](\d+))?)?)?)?\s*(Z|[+-]\d\d(?::?\d\d)?)?$/i,
    cache = {};

function parse( value ) {
    if ( value === undefined ) return new Date();
    if ( value === null || value === '' ) return null;
    if ( value instanceof Date ) return new Date( value.getTime() );
    if ( typeof value === 'number' ) return new Date( value );
    var m = ISO.exec( String( value ).trim() ), d, ms, offset, minutes;
    if ( !m ) return new Date( String( value ) );
    ms = m[ 7 ] ? Math.round( Number( '0.' + m[ 7 ] ) * 1000 ) : 0;
    if ( !m[ 8 ] ) return new Date( +m[ 1 ], m[ 2 ] - 1, +m[ 3 ], +( m[ 4 ] || 0 ), +( m[ 5 ] || 0 ), +( m[ 6 ] || 0 ), ms );
    d = new Date( Date.UTC( +m[ 1 ], m[ 2 ] - 1, +m[ 3 ], +( m[ 4 ] || 0 ), +( m[ 5 ] || 0 ), +( m[ 6 ] || 0 ), ms ) );
    if ( m[ 8 ].toUpperCase() !== 'Z' ) {
        offset = m[ 8 ].replace( ':', '' );
        minutes = +offset.slice( 1, 3 ) * 60 + +( offset.slice( 3, 5 ) || 0 );
        d = new Date( d.getTime() - ( offset[ 0 ] === '-' ? -1 : 1 ) * minutes * 60000 );
    }
    return d;
}

function formatter( locale, options ) {
    var key = locale + JSON.stringify( options );
    if ( !cache[ key ] ) {
        try {
            cache[ key ] = new Intl.DateTimeFormat( locale, options );
        } catch ( err ) {
            cache[ key ] = new Intl.DateTimeFormat( 'en', options );
        }
    }
    return cache[ key ];
}

// 09:07 with a 24 hour clock, 9:07 AM with a 12 hour one, as moment's locales write the time
function time_options( locale ) {
    var cycle = formatter( locale, { hour: 'numeric' } ).resolvedOptions().hourCycle;
    return { hour: cycle === 'h23' || cycle === 'h24' ? '2-digit' : 'numeric', minute: '2-digit' };
}

var DATES = {
        L: { year: 'numeric', month: '2-digit', day: '2-digit' },
        l: { year: 'numeric', month: 'numeric', day: 'numeric' },
        LL: { year: 'numeric', month: 'long', day: 'numeric' },
        ll: { year: 'numeric', month: 'short', day: 'numeric' },
        LLLL: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
        llll: { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }
    },
    // date part, with the time
    LOCALISED = { LT: [ null, true ], L: [ 'L' ], l: [ 'l' ], LL: [ 'LL' ], ll: [ 'll' ], LLL: [ 'LL', true ],
                  lll: [ 'll', true ], LLLL: [ 'LLLL', true ], llll: [ 'llll', true ] };

function pad( n, width ) {
    n = String( n );
    while ( n.length < width ) n = '0' + n;
    return n;
}

function format( value, fmt, locale ) {
    var d = parse( value ), localised, parts;
    if ( !d || isNaN( d.getTime() ) ) return 'Invalid date';
    fmt = fmt || 'llll';
    locale = locale || 'en';
    localised = LOCALISED[ fmt ];
    if ( localised ) {
        parts = [];
        if ( localised[ 0 ] ) parts.push( formatter( locale, DATES[ localised[ 0 ] ] ).format( d ) );
        if ( localised[ 1 ] ) parts.push( formatter( locale, time_options( locale ) ).format( d ) );
        return parts.join( ' ' ).replace( /[  ]/g, ' ' );
    }
    return fmt.replace( /\[([^\]]*)]|YYYY|Y|MM|M|DD|D|HH|H|mm|ss/g, function( token, literal ) {
        switch ( token ) {
            case 'YYYY': return pad( d.getFullYear(), 4 );
            case 'Y': return String( d.getFullYear() );
            case 'MM': return pad( d.getMonth() + 1, 2 );
            case 'M': return String( d.getMonth() + 1 );
            case 'DD': return pad( d.getDate(), 2 );
            case 'D': return String( d.getDate() );
            case 'HH': return pad( d.getHours(), 2 );
            case 'H': return String( d.getHours() );
            case 'mm': return pad( d.getMinutes(), 2 );
            case 'ss': return pad( d.getSeconds(), 2 );
            default: return literal;
        }
    } );
}

t.exports = { format: format, parse: parse };
}
