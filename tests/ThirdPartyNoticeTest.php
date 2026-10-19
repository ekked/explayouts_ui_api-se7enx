<?php
/**
 * 1.3.25: the code that comes from Netgen Layouts ships with its MIT License notice. The editor's application bundle
 * (netgen-layouts.js, from netgen/layouts-ui) and its icon font (from netgen/layouts-core) each have the notice next
 * to them, and the README names both.
 *
 * @license GPL-2.0-or-later
 */
use PHPUnit\Framework\TestCase;

class ThirdPartyNoticeTest extends TestCase
{
    protected static function read( string $path ): string
    {
        $file = dirname( __DIR__ ) . '/' . $path;
        self::assertFileExists( $file );
        return file_get_contents( $file );
    }

    public static function noticeProvider(): array
    {
        return array(
            'application bundle' => array( 'design/standard/javascript/netgen-layouts.js', 'design/standard/javascript/netgen-layouts-LICENSE.txt', 'netgen/layouts-ui' ),
            'icon font'          => array( 'design/standard/media/netgen-layouts.woff', 'design/standard/media/netgen-layouts-LICENSE.txt', 'netgen/layouts-core' ),
        );
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('noticeProvider')]
    public function testNetgenCodeShipsWithTheMitNotice( string $code, string $notice, string $package )
    {
        $this->assertFileExists( dirname( __DIR__ ) . '/' . $code );
        $text = self::read( $notice );

        $this->assertStringContainsString( $package, $text );
        $this->assertStringContainsString( 'MIT License', $text );
        $this->assertMatchesRegularExpression( '/Copyright \(c\) 2015-\d{4} Netgen/', $text );
        $this->assertStringContainsString( 'The above copyright notice and this permission notice shall be included in all', $text );
        $this->assertStringContainsString( $notice, self::read( 'README.md' ) );
    }
}
