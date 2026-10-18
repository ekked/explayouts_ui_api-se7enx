<?php
/**
 * Bootstrap of the explayouts_ui_api tests: no kernel, no database. eZDebug, eZLog and eZUser are stand-ins,
 * unless the kernel's classes are already loaded (checked without autoloading, so a stand-in is not skipped for
 * the real class). The ezxFormToken stand-in reports the form token as switched off, so the form token check lets
 * every request through and the tests see the policy check alone. expLayoutsCoreLayoutService is a stand-in that
 * fails like a lost database connection, for the error answer. The explayouts classes and eZDB are stand-ins that
 * record what is asked of them (see expLayoutsTestStandIn), so a test can tell whether a request got as far as the
 * layouts or wrote anything. Exponential\Runnable\ModuleView is a stand-in, so the view can be run as the module runs it.
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
        // Off unless a test switches it on (FormTokenTest), so the other tests see the policy check alone.
        public static $enabled = false;
        public static $token = '';
        public static function isEnabled() { return self::$enabled; }
        public static function getToken() { return self::$token; }
    }
}
// The kernel's refusal reads site.ini for its texts and retry address; the stand-ins answer the same status and shape.
if ( !class_exists( 'ezpFormTokenException', false ) )
{
    class ezpFormTokenException extends Exception
    {
        protected $reason;
        public function __construct( $reason = 'missing' ) { $this->reason = $reason; parent::__construct( 'Form token ' . $reason ); }
        public function getReason() { return $this->reason; }
        public function getReasonCode() { return 'form_token_' . $this->reason; }
    }
}
if ( !class_exists( 'ezpFormTokenRefusal', false ) )
{
    class ezpFormTokenRefusal
    {
        public static function log( ezpFormTokenException $e ) {}
        public static function sendHeaders( $contentType = null, $withSecurityHeaders = false ) { http_response_code( 403 ); }
        public static function jsonBody( ezpFormTokenException $e )
        {
            return json_encode( array( 'error' => array( 'code' => 403, 'reason' => $e->getReasonCode(), 'message' => 'Refused.' ) ) );
        }
    }
}
if ( !class_exists( 'expLayoutsCoreLayoutService', false ) )
{
    class expLayoutsCoreLayoutService
    {
        public function __call( $name, $arguments ) { throw new RuntimeException( 'Lost connection to the database server' ); }
    }
}
/**
 * The stand-ins of the explayouts classes: every static call is recorded in $calls. A call with an answer in
 * $returns (a value, or a closure that gets the arguments) returns it; any other call throws, so a test sees a
 * path it did not expect. Instances carry attributes and record store().
 */
trait expLayoutsTestStandIn
{
    public static $calls = array();
    public static $returns = array();
    public $attributes = array();
    public $stored = 0;

    public static function reset()
    {
        self::$calls = array();
        self::$returns = array();
    }

    public static function __callStatic( $name, $arguments )
    {
        self::$calls[] = $name;
        if ( array_key_exists( $name, self::$returns ) )
        {
            $answer = self::$returns[$name];
            return $answer instanceof Closure ? $answer( ...$arguments ) : $answer;
        }
        throw new RuntimeException( static::class . ' stand-in: ' . $name );
    }

    public function __construct( array $attributes = array() ) { $this->attributes = $attributes; }
    public function attribute( $name ) { return isset( $this->attributes[$name] ) ? $this->attributes[$name] : null; }
    public function setAttribute( $name, $value ) { $this->attributes[$name] = $value; }
    public function store() { $this->stored++; self::$calls[] = 'store'; }
    /** Any other instance method (isLinked(), ...) answers null. */
    public function __call( $name, $arguments ) { return null; }
}
foreach ( array( 'expLayoutsLayout', 'expLayoutsZone', 'expLayoutsLayoutType', 'expLayoutsCollection', 'expLayoutsBlock',
                 'expLayoutsBlockParameter', 'expLayoutsCollectionItem', 'expLayoutsBlockHandlerFactory', 'expLayoutsRule',
                 'expLayoutsRuleTarget', 'expLayoutsRuleCondition' ) as $standIn )
{
    if ( !class_exists( $standIn, false ) )
        eval( 'class ' . $standIn . ' { use expLayoutsTestStandIn; }' );
}

/** eZDB: the tables relationList() reports, and every statement the API sends (BEGIN, COMMIT, ROLLBACK for a transaction). */
if ( !class_exists( 'eZDB', false ) )
{
    class eZDB
    {
        public static $tables = array();
        public static $statements = array();
        public static function instance() { return new self(); }
        public function databaseName() { return 'mysql'; }
        public function relationList() { return self::$tables; }
        public function query( $sql ) { self::$statements[] = $sql; return true; }
        public function arrayQuery( $sql ) { self::$statements[] = $sql; return array(); }
        public function escapeString( $value ) { return addslashes( $value ); }
        public function begin() { self::$statements[] = 'BEGIN'; }
        public function commit() { self::$statements[] = 'COMMIT'; }
        public function rollback() { self::$statements[] = 'ROLLBACK'; }
    }
}

/** The view runs on Exponential\Runnable\ModuleView; outside the kernel only viewResult() is needed. */
if ( !class_exists( 'Exponential\\Runnable\\ModuleView', false ) )
{
    eval( 'namespace Exponential\\Runnable; abstract class ModuleView { abstract public function run( array $scope ); protected function viewResult( $result, $returned ) { return empty( $result ) ? $returned : $result; } }' );
}
require_once dirname( __DIR__ ) . '/classes/explayoutsuiapplicationapi.php';
require_once dirname( __DIR__ ) . '/classes/runnable/views/explayouts_ui_api/app.php';
