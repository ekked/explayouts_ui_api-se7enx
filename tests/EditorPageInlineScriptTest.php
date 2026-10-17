<?php
/**
 * 1.3.24: the layout editor page (app.tpl and spa_strings.tpl) carries no inline script, no on...= handler attribute
 * and no javascript: URL, so it runs under a Content Security Policy with script-src 'self'. Its values are JSON data
 * blocks printed through the < > escape chain, read by javascript/explayouts-app-head.js; the rest of the old inline
 * code is javascript/explayouts-app.js, after the tags of the deferred bundles.
 *
 * @license GPL-2.0-or-later
 */
use PHPUnit\Framework\TestCase;

class EditorPageInlineScriptTest extends TestCase
{
    protected static function read( string $path ): string
    {
        $file = dirname( __DIR__ ) . '/' . $path;
        self::assertFileExists( $file );
        return file_get_contents( $file );
    }

    public function testNoInlineCode()
    {
        foreach ( array( 'design/standard/templates/explayouts_ui_api/app.tpl',
                         'design/standard/templates/explayouts_ui_api/spa_strings.tpl' ) as $path )
            $this->checkNoInlineCode( $path );
    }

    protected function checkNoInlineCode( string $path )
    {
        $tpl = self::read( $path );
        preg_match_all( '~<script\b([^>]*)>(.*?)</script>~is', $tpl, $m, PREG_SET_ORDER );
        foreach ( $m as $script )
        {
            $isData = stripos( $script[1], 'type="application/json"' ) !== false;
            $isFile = preg_match( '~\bsrc=~', $script[1] ) && trim( $script[2] ) === '';
            $this->assertTrue( $isData || $isFile, $path . ': inline script ' . substr( $script[0], 0, 120 ) );
        }
        $this->assertDoesNotMatchRegularExpression( '~\son[a-z]+\s*=\s*["\']~i', $tpl, $path . ': handler attribute' );
        $this->assertStringNotContainsString( 'javascript:', $tpl, $path );
    }

    public function testDataBlocksAreEscapedAndReadByTheHeadScript()
    {
        $chain = "|explode( '<' )|implode( '\\u003c' )|explode( '>' )|implode( '\\u003e' )}</script>";
        $app = self::read( 'design/standard/templates/explayouts_ui_api/app.tpl' );
        $strings = self::read( 'design/standard/templates/explayouts_ui_api/spa_strings.tpl' );
        $this->assertStringContainsString( '<script type="application/json" id="explayouts-app-data">{json_encode( $explayouts_app_data )' . $chain, $app );
        $this->assertStringContainsString( '<script type="application/json" id="explayouts-spa-i18n">{json_encode( $explayouts_spa_i18n )' . $chain, $strings );

        $head = strpos( $app, "<script src=\"{'javascript/explayouts-app-head.js'|ezdesign('no')}\"></script>" );
        $this->assertNotFalse( $head );
        $this->assertGreaterThan( strpos( $app, "{include uri='design:explayouts_ui_api/spa_strings.tpl'}" ), $head, 'the data blocks come first' );
        $page = strpos( $app, "<script src=\"{'javascript/explayouts-app.js'|ezdesign('no')}\"></script>" );
        $this->assertNotFalse( $page );
        $this->assertGreaterThan( strpos( $app, "'javascript/netgen-layouts.js'|ezdesign('no')" ), $page );
        $this->assertGreaterThan( strpos( $app, 'id="ng-cancel-link"' ), $page, 'the Cancel link is there when it runs' );

        $js = self::read( 'design/standard/javascript/explayouts-app-head.js' );
        foreach ( array( 'function explayoutsBase()', "read('explayouts-app-data')", "read('explayouts-spa-i18n')",
                         'window.explayoutsSpaI18n', 'window.explayoutsI18n', 'window.explayoutsInSiteaccess',
                         'window.explayoutsReturnTo' ) as $needle )
            $this->assertStringContainsString( $needle, $js );
    }
}
