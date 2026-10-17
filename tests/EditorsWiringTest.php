<?php
/**
 * The editors of the layout editor: Tiptap (javascript/explayouts-tiptap.js, built from src/editors/) in place
 * of CKEditor 4 and Ace. app.tpl loads the bundle before the app bundle and nothing of the old editors, the old
 * editors are gone from the extension, every interface text of the editors is handed to the page and translated
 * into German, and the build is pinned. What the editors do is tested in node: tests/js/editors.test.mjs.
 *
 * @license GPL-2.0-or-later
 */
use PHPUnit\Framework\TestCase;

class EditorsWiringTest extends TestCase
{
    protected static function root(): string
    {
        return dirname( __DIR__ );
    }

    protected static function read( string $path ): string
    {
        $file = self::root() . '/' . $path;
        self::assertFileExists( $file );
        return file_get_contents( $file );
    }

    public function testTheAppLoadsTheTiptapBundleBeforeTheAppBundle()
    {
        $tpl = self::read( 'design/standard/templates/explayouts_ui_api/app.tpl' );
        $editors = strpos( $tpl, "'javascript/explayouts-tiptap.js'|ezdesign('no')" );
        $app = strpos( $tpl, "'javascript/netgen-layouts.js'|ezdesign('no')" );
        $this->assertNotFalse( $editors );
        $this->assertNotFalse( $app );
        $this->assertLessThan( $app, $editors, 'the app bundle registers CKEDITOR listeners when it is evaluated' );
        $this->assertMatchesRegularExpression( '~<script src="\{\'javascript/explayouts-tiptap\.js\'\|ezdesign\(\'no\'\)\}[^"]*" defer></script>~', $tpl );
        $this->assertStringContainsString( "'stylesheets/explayouts-tiptap.css'|ezdesign('no')", $tpl );
        // no version query on asset links: a changed file reaches the browser with a reload
        $this->assertStringContainsString( "<script src=\"{'javascript/explayouts-tiptap.js'|ezdesign('no')}\" defer></script>", $tpl );
        $this->assertStringContainsString( "<link rel=\"stylesheet\" href=\"{'stylesheets/explayouts-tiptap.css'|ezdesign('no')}\">", $tpl );
    }

    public function testNothingLoadsTheOldEditors()
    {
        foreach ( array( 'design/standard/templates/explayouts_ui_api/app.tpl', 'design/standard/javascript/explayouts-mobile.js' ) as $path )
        {
            $source = self::read( $path );
            $this->assertDoesNotMatchRegularExpression( '~vendor/(ckeditor|ace-editor)|ckeditor\.js|ace\.js~i', $source, $path );
        }
        $this->assertDirectoryDoesNotExist( self::root() . '/design/standard/vendor/ckeditor' );
        $this->assertDirectoryDoesNotExist( self::root() . '/design/standard/vendor/ace-editor' );
    }

    public function testTheBuiltBundleIsThere()
    {
        $bundle = self::read( 'design/standard/javascript/explayouts-tiptap.js' );
        $this->assertStringStartsWith( '/*! explayouts_ui_api editors', $bundle );
        $this->assertStringContainsString( 'CKEDITOR', $bundle );
        $this->assertStringNotContainsString( 'sourceMappingURL', $bundle, 'a --dev build is not committed' );
    }

    /** Every text the editors pass through t(), from src/editors/. */
    protected static function editorTexts(): array
    {
        $texts = array();
        foreach ( glob( self::root() . '/src/editors/*.js' ) as $file )
        {
            $source = file_get_contents( $file );
            preg_match_all( "~\\bt\\(\\s*'((?:[^'\\\\]|\\\\.)+)'\\s*\\)~", $source, $m );
            $texts = array_merge( $texts, $m[1] );
            // toolbar buttons: button( g, 'name', 'Label', ... ), formats and alignments: [ 'value', 'Label' ]
            preg_match_all( "~button\\(\\s*g,\\s*(?:'[^']*'|name),\\s*(?:'((?:[^'\\\\]|\\\\.)+)'|label)~", $source, $m );
            $texts = array_merge( $texts, array_filter( $m[1] ) );
            preg_match_all( "~\\[\\s*'[\\w-]+',\\s*(?:'[\\w-]+',\\s*)?'([A-Z][^']*[a-z][^']*)'\\s*\\]~", $source, $m );
            $texts = array_merge( $texts, $m[1] );
        }
        $texts = array_values( array_unique( $texts ) );
        sort( $texts );
        return $texts;
    }

    public function testEveryEditorTextIsHandedToThePageAndTranslated()
    {
        $texts = self::editorTexts();
        $this->assertContains( 'Bold', $texts );
        $this->assertContains( 'Heading 1', $texts );
        $this->assertContains( 'Align left', $texts );
        $this->assertContains( 'Open in a new window', $texts );

        $strings = self::read( 'design/standard/templates/explayouts_ui_api/spa_strings.tpl' );
        $german = new DOMDocument();
        $german->loadXML( self::read( 'translations/ger-DE/translation.ts' ) );
        $xpath = new DOMXPath( $german );
        foreach ( $texts as $text )
        {
            $key = str_replace( "'", "\\'", $text );
            $this->assertStringContainsString( "'" . $key . "': '{\"" . $text . "\"|i18n( 'design/standard/explayouts_ui_api/spa' )|wash( javascript )}'", $strings, $text );
            $literal = strpos( $text, '"' ) === false ? '"' . $text . '"' : "'" . $text . "'";
            $translation = $xpath->query( '//context[name="design/standard/explayouts_ui_api/spa"]/message[source=' . $literal . ']/translation' );
            $this->assertSame( 1, $translation->length, $text );
            $this->assertNotSame( '', trim( $translation->item( 0 )->textContent ), $text );
        }
    }

    public function testTheBuildIsPinned()
    {
        $package = json_decode( self::read( 'package.json' ), true );
        $lock = json_decode( self::read( 'package-lock.json' ), true );
        foreach ( array_merge( $package['dependencies'], $package['devDependencies'] ) as $name => $version )
        {
            $this->assertMatchesRegularExpression( '~^\d+\.\d+\.\d+$~', $version, $name . ' has an exact version' );
            $this->assertSame( $version, $lock['packages']['node_modules/' . $name]['version'] ?? null, $name . ' in package-lock.json' );
        }
    }
}
