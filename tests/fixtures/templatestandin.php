<?php
/**
 * eZTemplate for BlockTemplatePreviewTest, loaded only in that test's own process: the shared factory() instance,
 * variables, the error and warning logs and the list of fetched templates as the kernel's class has them, and a
 * fetch() that resets them as the kernel's does and renders a template the test gives as a closure.
 *
 * @license GPL-2.0-or-later
 */
if ( !class_exists( 'eZTemplate', false ) )
{
    class eZTemplate
    {
        public static $instance = null;
        /** template URI => closure( eZTemplate ) returning the output; a URI without one is an error */
        public static $templates = array();
        public static $fetched = array();
        public $ErrorLog = array();
        public $WarningLog = array();
        public $TemplateFetchList = array();
        protected $variables = array();

        public static function factory()
        {
            if ( self::$instance === null )
                self::$instance = new self();
            return self::$instance;
        }
        public function setVariable( $name, $value ) { $this->variables[$name] = $value; }
        public function unsetVariable( $name ) { unset( $this->variables[$name] ); }
        public function hasVariable( $name ) { return array_key_exists( $name, $this->variables ); }
        public function variable( $name ) { return $this->hasVariable( $name ) ? $this->variables[$name] : null; }
        public function hasErrors() { return count( $this->ErrorLog ) > 0; }
        public function resetErrorLog() { $this->ErrorLog = array(); $this->WarningLog = array(); }
        public function fetch( $uri )
        {
            $this->ErrorLog = array();
            $this->WarningLog = array();
            $this->TemplateFetchList = array( $uri );
            self::$fetched[] = $uri;
            if ( !isset( self::$templates[$uri] ) )
            {
                $this->ErrorLog[] = array( 'name' => 'eZTemplate', 'text' => "No template could be loaded for \"$uri\"" );
                return '';
            }
            $render = self::$templates[$uri];
            return $render( $this );
        }
    }
}
