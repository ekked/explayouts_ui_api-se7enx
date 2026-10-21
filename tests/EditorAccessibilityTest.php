<?php
/**
 * The layout editor page's accessibility (1.3.21): the sidebar's Content/Design tabs are WAI-ARIA tabs (tablist,
 * tab, tabpanel, aria-selected, a roving tabindex, arrow keys, one tab selected), the icon-only buttons of the left
 * toolbar and the block palette have names, the palette's scrolling list can be reached by keyboard, the editor's
 * CSS is a stylesheet with contrast tokens instead of an inline style block, and the new texts are translated.
 * The colours themselves are checked in a browser (axe); this test keeps the wiring in place.
 *
 * @license GPL-2.0-or-later
 */
use PHPUnit\Framework\TestCase;

class EditorAccessibilityTest extends TestCase
{
    protected static function read( string $path ): string
    {
        $file = dirname( __DIR__ ) . '/' . $path;
        self::assertFileExists( $file );
        return file_get_contents( $file );
    }

    public function testTheSidebarTabsAreATabList()
    {
        $tpl = self::read( 'design/standard/templates/explayouts_ui_api/form_block_edit.tpl' );
        $this->assertMatchesRegularExpression( '~<ul class="aside-tab-control" role="tablist" aria-label="~', $tpl );
        $this->assertSame( 2, substr_count( $tpl, '<li role="presentation"' ) );
        // one tab is selected, not two: Content when the block has content parameters, else Design
        $this->assertStringContainsString( '<li role="presentation"{if $content_first} class="active"{/if}><a href="#" id="tab-content"', $tpl );
        $this->assertStringContainsString( '<li role="presentation"{if $content_first|not} class="active"{/if}><a href="#" id="tab-design"', $tpl );
        $this->assertStringContainsString( 'id="tab-content" role="tab" aria-selected="{if $content_first}true{else}false{/if}"{if $content_first|not} tabindex="-1"{/if} aria-controls="tab-content-tab"', $tpl );
        $this->assertStringContainsString( 'id="tab-design" role="tab" aria-selected="{if $content_first}false{else}true{/if}"{if $content_first} tabindex="-1"{/if} aria-controls="tab-design-tab"', $tpl );
        $this->assertStringContainsString( 'id="tab-content-tab" role="tabpanel" aria-labelledby="tab-content"', $tpl );
        $this->assertStringContainsString( 'id="tab-design-tab" role="tabpanel" aria-labelledby="tab-design"', $tpl );
    }

    public function testTheBundleKeepsTheTabsInStepAndMovesWithTheArrowKeys()
    {
        $bundle = self::read( 'design/standard/javascript/netgen-layouts.js' );
        $this->assertSame( 1, substr_count( $bundle, 'r.fn.browser_tabs=function(e){' ) );
        foreach ( array( 'i.attr("role","tablist")', '"aria-selected":"true",tabindex:"0"', '"aria-selected":"false",tabindex:"-1"',
                         'ArrowRight:t+1', 'ArrowLeft:t-1', 'Home:0', 'End:n-1', '.trigger("click").trigger("focus")' ) as $needle )
            $this->assertStringContainsString( $needle, $bundle );
    }

    public function testTheIconButtonsHaveNames()
    {
        $bundle = self::read( 'design/standard/javascript/netgen-layouts.js' );
        $this->assertStringContainsString( 'class="button js-open" data-target="blocks" aria-expanded="false" aria-label="\'+window.nglTh("Add a block")+\'"', $bundle );
        $this->assertStringContainsString( 'class="panel-content" tabindex="0" role="region" aria-label="\'+window.nglTh("Block types")+\'"', $bundle );
        $this->assertStringContainsString( '.attr("aria-expanded","true")', $bundle );
        $this->assertStringContainsString( '.attr("aria-expanded","false")', $bundle );
        $this->assertStringContainsString( 'class="button ngl-tooltip \'+e(a(null!=t?l.r(t,"className"):t,t))+\'" aria-label="\'+e(a(null!=t?l.r(t,"title"):t,t))+\'"', $bundle );
    }

    public function testTheEditorCssIsAStylesheetWithContrastTokens()
    {
        $tpl = self::read( 'design/standard/templates/explayouts_ui_api/app.tpl' );
        $this->assertStringNotContainsString( '<style', $tpl );
        $this->assertDoesNotMatchRegularExpression( '~\sstyle="|\.style\.cssText~', $tpl );
        $this->assertStringNotContainsString( '?v=', $tpl, 'no version query on asset links' );
        $this->assertStringContainsString( "<link rel=\"stylesheet\" href=\"{'stylesheets/explayouts-editor.css'|ezdesign('no')}\">", $tpl );
        $this->assertGreaterThan( strpos( $tpl, 'explayouts-tiptap.css' ), strpos( $tpl, 'explayouts-editor.css' ), 'the editor CSS comes last' );
        $css = self::read( 'design/standard/stylesheets/explayouts-editor.css' );
        foreach ( array( '--exp-le-accent: #1f63d6', '--exp-le-on-accent: #fff', '--exp-le-muted: #6b6b6b', '--exp-le-on-dark-muted: #c8c8c8' ) as $token )
            $this->assertStringContainsString( $token, $css );
        // the colours below 4.5:1 that netgen-layouts.css drew are not used for text any more
        $this->assertDoesNotMatchRegularExpression( '~(?<![-\w])color:\s*#(2a72ef|8c8c8c|9c9c9c|9b9b9b|a6a6a6)\b~i', $css );
    }

    /**
     * 1.3.23: the page can be zoomed (WCAG 1.4.4; axe meta-viewport), and the placeholder of an empty block takes its
     * colour from the muted token instead of an inline #888, which was 3.3:1 on the selected block.
     */
    public function testThePageCanBeZoomedAndTheEmptyBlockUsesTheMutedToken()
    {
        $tpl = self::read( 'design/standard/templates/explayouts_ui_api/app.tpl' );
        $this->assertStringContainsString( '<meta name="viewport" content="width=device-width, initial-scale=1">', $tpl );
        $this->assertDoesNotMatchRegularExpression( '~user-scalable|maximum-scale~i', $tpl );

        $api = self::read( 'classes/explayoutsuiapplicationapi.php' );
        $this->assertStringContainsString( '<p class="block-empty">No content</p>', $api );
        $this->assertStringNotContainsString( 'color:#888', $api );
        $this->assertStringContainsString( '.block-empty { color: var(--exp-le-muted);', self::read( 'design/standard/stylesheets/explayouts-editor.css' ) );
    }

    public function testTheNewTextsAreHandedOverAndTranslated()
    {
        $strings = self::read( 'design/standard/templates/explayouts_ui_api/spa_strings.tpl' );
        $ts = self::read( 'translations/ger-DE/translation.ts' );
        foreach ( array( 'Add a block', 'Block types' ) as $text )
        {
            $this->assertStringContainsString( '"' . $text . '", "' . $text . "\"|i18n( 'design/standard/explayouts_ui_api/spa' )", $strings );
            $this->assertMatchesRegularExpression( '~<source>' . preg_quote( $text, '~' ) . '</source>\s*<translation>[^<]+</translation>~', $ts );
        }
        $this->assertMatchesRegularExpression( '~<source>Block settings</source>\s*<translation>[^<]+</translation>~', $ts );
        foreach ( glob( dirname( __DIR__ ) . '/translations/*/translation.ts' ) as $file )
            $this->assertStringContainsString( '<source>Block settings</source>', file_get_contents( $file ), $file );
    }
}
