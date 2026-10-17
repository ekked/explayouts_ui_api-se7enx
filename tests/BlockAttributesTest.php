<?php
/**
 * The dispatcher sets on a block only the attributes explayouts_block has. A block has no modification time of its
 * own (only the layout has one): setting 'modified' on a block logged "expLayoutsBlock: Undefined attribute
 * 'modified', cannot set" with every save and every move.
 *
 * @license GPL-2.0-or-later
 */
use PHPUnit\Framework\TestCase;

class BlockAttributesTest extends TestCase
{
    public function testTheDispatcherSetsNoModificationTimeOnABlock()
    {
        $source = file_get_contents( dirname( __DIR__ ) . '/classes/explayoutsuiapplicationapi.php' );
        $this->assertDoesNotMatchRegularExpression( '/\$block->setAttribute\(\s*\'modified\'/', $source );
    }

    public function testTheBlockDefinitionHasNoModifiedColumnWhenExplayoutsIsBeside()
    {
        $file = dirname( __DIR__, 2 ) . '/explayouts/classes/explayoutsblock.php';
        if ( !is_file( $file ) )
            $this->markTestSkipped( 'explayouts is not installed beside this extension' );
        $this->assertDoesNotMatchRegularExpression( "/'modified'\s*=>\s*array\(/", file_get_contents( $file ) );
    }
}
