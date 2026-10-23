/**
 * A fake of the editor's API (classes/explayoutsuiapplicationapi.php and the forms of
 * classes/runnable/views/explayouts_ui_api/app.php) for tests that run the whole app: one draft layout with two
 * zones, a title block and a list block with a manual collection, kept in memory and changed by the writes the
 * app sends. Answers have the shape of the real API's; the HTML of blocks and forms is much smaller.
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
import { BASE, TOKEN } from './editor-page.mjs';

const esc = ( s ) => String( s ).replace( /[&<>"']/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } )[ c ] );

export function createApi() {
    let nextBlock = 30, nextItem = 500;
    const state = {
        published: false,
        layout: { id: 1, identifier: 'home', name: 'Home page', type: 'layout_1', layout_type: 'layout_1', group: 'site',
                  description: '', status: 1, published: false, shared: false, has_published_state: true,
                  has_archived_state: false, created: 1700000000, modified: 1700000000,
                  available_locales: { eng: 'English' }, main_locale: 'eng', locale: 'eng' },
        zones: [ { identifier: 'top', name: 'top', block_ids: [ 10 ] }, { identifier: 'main', name: 'main', block_ids: [ 20 ] } ],
        blocks: {
            10: { id: 10, definition_identifier: 'title', name: 'Welcome', view_type: 'title', zone_identifier: 'top', parameters: { title: 'Hello' } },
            20: { id: 20, definition_identifier: 'list', name: 'News', view_type: 'list', zone_identifier: 'main', parameters: {},
                  items: [ { id: 401, value: 61, name: 'First article' }, { id: 402, value: 62, name: 'Second article' } ] }
        },
        content: [ { node_id: 60, object_id: 58, name: 'Folder', class_name: 'Folder', is_container: true },
                   { node_id: 70, object_id: 68, name: 'Third article', class_name: 'Article', is_container: false } ]
    };

    const blockTypes = [
        { identifier: 'title', name: 'Title', group_name: 'basic' },
        { identifier: 'text', name: 'Text', group_name: 'basic' },
        { identifier: 'list', name: 'List', group_name: 'listing' }
    ].map( ( t ) => ( { ...t, definition_identifier: t.identifier, enabled: true, is_container: false,
                        icon: '/extension/explayouts_ui_api/design/standard/images/blocks/icon-' + t.identifier + '.svg',
                        parameters: '{}', defaults: {} } ) );

    function collection( block ) {
        if ( !block.items ) return [];
        return [ { id: 900 + block.id, collection_id: 900 + block.id, identifier: 'default', block_id: block.id, type: 'manual',
                   collection_type: 'manual', query_type: null, query_parameters: {}, offset: 0, limit: 10, offset_value: 0,
                   limit_value: 10, status: 1, locale: 'eng',
                   items: block.items.map( ( item, i ) => ( { id: item.id, collection_id: 900 + block.id, value: item.value,
                       value_id: item.value, value_type: 'ez_location', item_type: 'manual', position: i, name: item.name,
                       is_dynamic: false, visible: true, cms_visible: true, can_remove_item: true,
                       cms_url: '/admin/content/view/full/' + item.value, url: '/node/' + item.value, slot_id: null } ) ),
                   overflow_items: [] } ];
    }

    // renderBlockHtml(): the header with the block's menu, the content
    function blockHtml( b ) {
        return '<div class="block-header"><div class="handle" title="Move block"><i class="material-icons">drag_handle</i></div>'
            + '<div class="template_name">' + esc( b.view_type ) + '</div><div class="name">' + esc( b.name ) + '</div>'
            + '<div class="dropdown"><button class="dropdown-toggle" type="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">'
            + '<i class="material-icons">more_horiz</i></button><ul class="dropdown-menu dropdown-menu-right">'
            + '<li class="js-modal-mode"><a title="Edit in modal">Edit in modal</a></li><li class="divider"></li>'
            + '<li class="js-revert"><a title="Revert block">Revert block</a></li>'
            + '<li class="js-copy"><a title="Duplicate block">Duplicate block</a></li>'
            + '<li class="js-destroy"><a title="Delete block">Delete block</a></li></ul></div></div>'
            // a title is edited in place (data-inline-child), as the real one; the rest is a preview
            + '<div class="block-content">' + ( b.definition_identifier === 'title'
                ? '<h2 data-inline-child data-attr="title">' + esc( b.parameters.title || '' ) + '</h2>'
                : '<p class="preview">' + esc( b.parameters.title || b.name ) + '</p>' ) + '</div>';
    }

    function block( b ) {
        const zone = state.zones.find( ( z ) => z.block_ids.includes( b.id ) );
        return { id: b.id, identifier: b.definition_identifier, definition_identifier: b.definition_identifier, name: b.name,
                 view_type: b.view_type, position: zone ? zone.block_ids.indexOf( b.id ) : 0, locale: 'eng',
                 zone_identifier: zone ? zone.identifier : b.zone_identifier, layout_id: 1, parent_block_id: 0,
                 parent_placeholder: '', is_container: false, has_published_state: false, parameters: b.parameters,
                 html: blockHtml( b ), collections: collection( b ), placeholders: [], css_id: '', css_class: '' };
    }

    function layout() {
        return { ...state.layout, published: state.published, status: state.published ? 2 : 1,
                 zones: state.zones.map( ( z ) => ( { ...z, block_ids: [ ...z.block_ids ], linked_layout_id: null,
                                                      linked_zone_identifier: null, allowed_block_definitions: true } ) ),
                 html: state.zones.map( ( z ) => '<div class="zone" data-zone="' + z.identifier + '"></div>' ).join( '\n' ) };
    }

    // form_block_edit.tpl: the tabs, the forms loaded into [data-form], the collection's items
    function editPage( b ) {
        return '<div id="aside-tabs"><ul class="aside-tab-control" role="tablist">'
            + '<li role="presentation" class="active"><a href="#" id="tab-content" role="tab" aria-controls="tab-content-tab">Content</a></li>'
            + '<li role="presentation"><a href="#" id="tab-design" role="tab" aria-controls="tab-design-tab">Design</a></li></ul>'
            + '<div class="tab-pane active" id="tab-content-tab" role="tabpanel" aria-labelledby="tab-content"><div class="sidebar-panel">'
            + '<a class="toggle-link" role="button" data-toggle="collapse" href="#collapseSettings" aria-expanded="true" aria-controls="collapseSettings">Options</a>'
            + '<div class="collapse in" id="collapseSettings"><div data-form="' + BASE + '/app/eng/blocks/' + b.id + '/form/edit/content"></div></div></div>'
            + ( b.items ? '<div class="sidebar-panel"><a class="toggle-link" role="button" data-toggle="collapse" href="#collapseItems" aria-expanded="true" aria-controls="collapseItems">Items</a>'
                + '<div class="collapse in" id="collapseItems"><div class="collection-items"><div class="value-type-wrapper"><select class="js-browser-item-type">'
                + '<option value="ez_location" data-min="0" data-max="100">eZ location</option></select></div><div class="body"></div></div></div></div>' : '' )
            + '</div><div class="tab-pane" id="tab-design-tab" role="tabpanel" aria-labelledby="tab-design">'
            + '<div data-form="' + BASE + '/app/eng/blocks/' + b.id + '/form"></div></div></div>';
    }

    // form_block_content.tpl
    function contentForm( b ) {
        return '<form method="post" action="' + BASE + '/app/api/eng/blocks/' + b.id + '" class="content-form block-form layouts-form" name="content_edit">'
            + '<input type="hidden" name="ezxform_token" value="' + TOKEN + '" />'
            + '<div class="row-input"><label for="content_edit_title">Title</label>'
            + '<input type="text" id="content_edit_title" name="parameters[title]" value="' + esc( b.parameters.title || '' ) + '" /></div></form>';
    }

    // form_block_fields.tpl
    function designForm( b ) {
        return '<div class="layouts-form"><form method="post" action="' + BASE + '/app/api/eng/blocks/' + b.id + '" class="block-form" name="design_edit">'
            + '<input type="hidden" name="ezxform_token" value="' + TOKEN + '" />'
            + '<div class="row-input"><label for="design_edit_block_name">Block label</label>'
            + '<input type="text" id="design_edit_block_name" name="name" value="' + esc( b.name ) + '" class="form-control" /></div>'
            + '<div class="row-input"><label for="design_edit_view_type">View type</label><select id="design_edit_view_type" name="view_type">'
            + [ b.view_type, 'other' ].map( ( v ) => '<option value="' + esc( v ) + '"' + ( v === b.view_type ? ' selected="selected"' : '' ) + '>' + esc( v ) + '</option>' ).join( '' )
            + '</select></div></form></div>';
    }

    const routes = [
        [ 'GET', /^\/app\/api\/config$/, () => ( { body: { csrf_token: 'api-token', automatic_cache_clear: true, edition: 'Open Source' } } ) ],
        [ 'GET', /^\/app\/api\/config\/layout_types$/, () => ( { body: { values: [ { identifier: 'layout_1', name: 'Layout 1', group: 'site',
            zones: [ { identifier: 'top', name: 'top' }, { identifier: 'main', name: 'main' } ] } ], total: 1 } } ) ],
        [ 'GET', /^\/app\/api\/config\/block_types$/, () => ( { body: { block_types: blockTypes, block_type_groups: [
            { identifier: 'basic', name: 'Basic', enabled: true, block_types: [ 'title', 'text' ] },
            { identifier: 'listing', name: 'Listing', enabled: true, block_types: [ 'list' ] } ] } } ) ],
        [ 'GET', /^\/app\/api\/layouts\/shared$/, () => ( { body: { values: [], total: 0 } } ) ],
        [ 'GET', /^\/app\/api\/layouts\/1$/, () => ( { body: layout() } ) ],
        [ 'POST', /^\/app\/api\/layouts\/1\/draft$/, () => ( { body: layout() } ) ],
        [ 'DELETE', /^\/app\/api\/layouts\/1\/draft$/, () => ( { body: layout() } ) ],
        [ 'POST', /^\/app\/api\/layouts\/1\/publish$/, () => { state.published = true; return { body: layout() }; } ],
        [ 'GET', /^\/app\/api\/eng\/layouts\/1\/blocks$/, () => ( { body: Object.values( state.blocks ).map( block ) } ) ],
        [ 'POST', /^\/app\/api\/eng\/blocks$/, ( r ) => {
            const data = r.json();
            const b = { id: nextBlock++, definition_identifier: data.block_type, name: '', view_type: data.block_type,
                        zone_identifier: data.zone_identifier, parameters: {} };
            state.blocks[ b.id ] = b;
            state.zones.find( ( z ) => z.identifier === data.zone_identifier ).block_ids.splice( Number( data.parent_position ) || 0, 0, b.id );
            return { status: 201, body: block( b ) };
        } ],
        [ 'GET', /^\/app\/eng\/blocks\/(\d+)\/edit$/, ( r, m ) => ( { body: editPage( state.blocks[ m[ 1 ] ] ) } ) ],
        [ 'GET', /^\/app\/eng\/blocks\/(\d+)\/form\/edit\/content$/, ( r, m ) => ( { body: contentForm( state.blocks[ m[ 1 ] ] ) } ) ],
        [ 'GET', /^\/app\/eng\/blocks\/(\d+)\/form$/, ( r, m ) => ( { body: designForm( state.blocks[ m[ 1 ] ] ) } ) ],
        [ 'POST', /^\/app\/api\/eng\/blocks\/(\d+)$/, ( r, m ) => {
            const b = state.blocks[ m[ 1 ] ];
            const data = r.form();
            if ( 'name' in data ) b.name = data.name;
            if ( 'view_type' in data ) b.view_type = data.view_type;
            if ( 'parameters[title]' in data ) b.parameters.title = data[ 'parameters[title]' ];
            return { body: block( b ) };
        } ],
        [ 'GET', /^\/app\/api\/eng\/blocks\/(\d+)$/, ( r, m ) => ( { body: block( state.blocks[ m[ 1 ] ] ) } ) ],
        [ 'DELETE', /^\/app\/api\/eng\/blocks\/(\d+)$/, ( r, m ) => {
            const id = Number( m[ 1 ] );
            delete state.blocks[ id ];
            for ( const z of state.zones ) z.block_ids = z.block_ids.filter( ( x ) => x !== id );
            return { status: 204 };
        } ],
        [ 'POST', /^\/app\/api\/eng\/blocks\/(\d+)\/move\/zone$/, ( r, m ) => {
            const id = Number( m[ 1 ] ), data = r.json();
            for ( const z of state.zones ) z.block_ids = z.block_ids.filter( ( x ) => x !== id );
            state.zones.find( ( z ) => z.identifier === data.zone_identifier ).block_ids.splice( data.parent_position, 0, id );
            return { body: block( state.blocks[ id ] ) };
        } ],
        [ 'GET', /^\/app\/api\/eng\/blocks\/(\d+)\/collections\/default\/result$/, ( r, m ) => ( { body: collection( state.blocks[ m[ 1 ] ] )[ 0 ] } ) ],
        [ 'POST', /^\/app\/api\/eng\/blocks\/(\d+)\/collections\/default\/items$/, ( r, m ) => {
            const b = state.blocks[ m[ 1 ] ];
            for ( const item of r.json().items ) {
                const found = state.content.find( ( c ) => c.node_id === item.value );
                b.items.splice( item.position, 0, { id: nextItem++, value: item.value, name: found ? found.name : String( item.value ) } );
            }
            return { body: collection( b )[ 0 ] };
        } ],
        [ 'GET', /^\/app\/api\/content_browser$/, ( r ) => ( { body: { values: state.content.filter( ( c ) => String( r.query.parent_node_id ) === '2' || c.node_id > 60 ),
                                                                    total: state.content.length } } ) ]
    ];

    function api( request ) {
        if ( !request.path.startsWith( BASE ) ) return undefined;
        const path = request.path.slice( BASE.length );
        for ( const [ method, pattern, answer ] of routes ) {
            const m = path.match( pattern );
            if ( m && method === request.method ) return answer( request, m );
        }
        api.unknown.push( request.method + ' ' + path );
        return undefined;
    }
    api.unknown = [];
    api.state = state;
    return api;
}
