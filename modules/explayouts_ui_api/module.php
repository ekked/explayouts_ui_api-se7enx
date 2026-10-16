<?php
$Module = array( 'name' => 'explayouts_ui_api',
                 'variable_params' => true );

$ViewList = array();

$ViewList['layouts'] = array(
    'script' => 'layouts.php',
    'functions' => array( 'read' ),
    'default_navigation_part' => 'ezexplayoutsuinavigationpart',
    'params' => array( 'LayoutID' )
);

$ViewList['rules'] = array(
    'script' => 'rules.php',
    'functions' => array( 'read' ),
    'default_navigation_part' => 'ezexplayoutsuinavigationpart',
    'params' => array( 'RuleID' )
);

$ViewList['blocks'] = array(
    'script' => 'blocks.php',
    'functions' => array( 'read' ),
    'default_navigation_part' => 'ezexplayoutsuinavigationpart',
    'params' => array( 'ZoneID' )
);

$ViewList['app'] = array(
    'script' => 'app.php',
    'functions' => array( 'read' ),
    'default_navigation_part' => 'ezexplayoutsuinavigationpart',
    'params' => array( )
);

$FunctionList = array();
$FunctionList['read'] = array();
// Every request that changes something (any method but GET, HEAD and OPTIONS)
// also needs edit; expLayoutsUIApplicationApi::checkEditAccess() asks for it.
$FunctionList['edit'] = array();
