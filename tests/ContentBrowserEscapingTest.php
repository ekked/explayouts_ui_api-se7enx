<?php
/**
 * The content browser dialog of javascript/explayouts-app.js builds its list as an HTML string. Every value of the
 * content_browser answer goes in through esc() (text and attribute values, quotes included) or as a number: a class
 * or object name with markup or a quote stays text. Until 1.3.24 the class name went in as it was, and data-name got
 * $('<div>').text( ... ).html(), which leaves " alone.
 *
 * @license GPL-2.0-or-later
 */
use PHPUnit\Framework\TestCase;

class ContentBrowserEscapingTest extends TestCase
{
    protected static function script(): string
    {
        $file = dirname( __DIR__ ) . '/design/standard/javascript/explayouts-app.js';
        self::assertFileExists( $file );
        return file_get_contents( $file );
    }

    /** @return string the list loop of the dialog, from esc() to the end of the rows */
    protected static function listCode(): string
    {
        $js = self::script();
        $start = strpos( $js, 'function esc(v)' );
        self::assertNotFalse( $start, 'esc() is defined before the rows' );
        $end = strpos( $js, "html += '</tbody></table>';", $start );
        self::assertNotFalse( $end );
        return substr( $js, $start, $end - $start );
    }

    public function testEveryValueOfAnItemIsEscapedOrANumber()
    {
        $code = self::listCode();
        preg_match_all( '~\+\s*(item\.[a-z_]+)\s*\+~', $code, $raw );
        $this->assertSame( array(), $raw[1], 'item values concatenated as they are' );
        $this->assertStringNotContainsString( '.text(item.', $code, 'jQuery .text().html() does not escape quotes' );
        foreach ( array( 'esc(item.name)', 'esc(item.class_name)', 'parseInt(item.node_id, 10)', 'parseInt(item.object_id, 10)' ) as $use )
            $this->assertStringContainsString( $use, $code );
    }

    public function testEscEscapesMarkupAndQuotes()
    {
        $node = trim( (string)shell_exec( 'command -v node 2>/dev/null' ) );
        if ( $node === '' )
            $this->markTestSkipped( 'node is not installed' );
        $code = self::listCode();
        $this->assertSame( 1, preg_match( '~function esc\(v\) \{.*?\}\n~s', $code, $m ) );
        $probe = $m[0] . 'process.stdout.write(JSON.stringify([esc(\'<img src=x onerror=a()>\'), esc(\'a" onmouseover="b\'), esc("\'&"), esc(null), esc(7)]));';
        $out = shell_exec( escapeshellarg( $node ) . ' -e ' . escapeshellarg( $probe ) );
        $this->assertSame(
            array( '&lt;img src=x onerror=a()&gt;', 'a&quot; onmouseover=&quot;b', '&#39;&amp;', '', '7' ),
            json_decode( (string)$out, true )
        );
    }
}
