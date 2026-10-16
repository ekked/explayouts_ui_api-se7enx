<?php
/**
 * Bootstrap of the explayouts_ui_api tests: no kernel, no database. eZDebug, eZLog and eZUser are stand-ins,
 * unless the kernel's classes are already loaded (checked without autoloading, so a stand-in is not skipped for
 * the real class). The ezxFormToken stand-in reports the form token as switched off, so the form token check lets
 * every request through and the tests see the policy check alone. expLayoutsCoreLayoutService is a stand-in that
 * fails like a lost database connection, for the error answer. expLayoutsLayout is a stand-in that records every
 * call and then fails, so a test can tell whether an import got as far as the layouts.
 *
 * Run with:
 *   vendor/bin/phpunit --bootstrap extension/explayouts_ui_api/tests/bootstrap.php extension/explayouts_ui_api/tests/
 *
 * @license GPL-2.0-or-later
 */
if ( !class_exists( 'eZDebug', false ) )
{
    class eZDebug
    {
        const HANDLE_NONE = 0;
        public static $enabled = false;
        public static $warnings = array();
        public static function isDebugEnabled() { return self::$enabled; }
        public static function updateSettings( $settings ) { if ( isset( $settings['debug-enabled'] ) ) self::$enabled = (bool)$settings['debug-enabled']; }
        public static function setHandleType( $type ) {}
        public static function writeWarning( $message, $label = '' ) { self::$warnings[] = $message; }
        public static function writeError( $message, $label = '' ) {}
        public static function writeDebug( $message, $label = '' ) {}
    }
}
if ( !class_exists( 'eZLog', false ) )
{
    class eZLog
    {
        public static $lines = array();
        public static function write( $message, $logName = 'common.log', $dir = 'var/log' ) { self::$lines[] = $message; }
    }
}
if ( !class_exists( 'eZUser', false ) )
{
    class eZUser
    {
        /** policy functions the current user has, as 'module/function' */
        public static $functions = array();
        public static $asked = array();
        public static function currentUser() { return new self(); }
        public function hasAccessTo( $module, $function = false )
        {
            self::$asked[] = $module . '/' . $function;
            return array( 'accessWord' => in_array( $module . '/' . $function, self::$functions, true ) ? 'yes' : 'no' );
        }
    }
}
if ( !class_exists( 'ezxFormToken', false ) )
{
    class ezxFormToken
    {
        const FORM_FIELD = 'ezxform_token';
        public static function isEnabled() { return false; }
        public static function getToken() { return ''; }
    }
}
if ( !class_exists( 'expLayoutsCoreLayoutService', false ) )
{
    class expLayoutsCoreLayoutService
    {
        public function __call( $name, $arguments ) { throw new RuntimeException( 'Lost connection to the database server' ); }
    }
}
if ( !class_exists( 'expLayoutsLayout', false ) )
{
    class expLayoutsLayout
    {
        public static $calls = array();
        public static function __callStatic( $name, $arguments )
        {
            self::$calls[] = $name;
            throw new RuntimeException( 'expLayoutsLayout stand-in: ' . $name );
        }
    }
}
require_once dirname( __DIR__ ) . '/classes/explayoutsuiapplicationapi.php';
