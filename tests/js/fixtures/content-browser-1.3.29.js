/* Reference for tests/js/content-browser.test.mjs: the content browser dialog of javascript/explayouts-app.js as it
   was in 1.3.29, on jQuery and Bootstrap 3's modal ($modal.modal(...)). The test runs it with jQuery 4 and the
   bundle's Bootstrap modal beside the plain DOM version and compares what both do. Not loaded by any page.
   @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
   @license GPL-2.0-or-later */
(function(){
    var initInterval = setInterval(function(){
        var Core = window.Core;
        if (!Core || !Core.$) return;
        clearInterval(initInterval);
        init(Core);
    }, 500);

    function init(Core){
        var $ = Core.$;

    var modalHtml = '<div class="modal fade" id="exp-content-browser-modal" tabindex="-1" role="dialog">' +
        '<div class="modal-dialog exp-cb-dialog" role="document">' +
        '<div class="modal-content">' +
        '<div class="modal-header"><h4 class="modal-title">' + $('<div>').text(explayoutsI18n.add_to_collection).html() + '</h4></div>' +
        '<div class="modal-body">' +
        '<div class="exp-cb-search form-group"><input type="text" class="form-control" placeholder="' + $('<div>').text(explayoutsI18n.search).html() + '" /></div>' +
        '<div class="exp-cb-breadcrumbs"></div>' +
        '<div class="exp-cb-list" tabindex="0"></div>' +
        '</div>' +
        '<div class="modal-footer">' +
        '<button class="btn btn-default exp-cb-cancel" data-dismiss="modal">' + $('<div>').text(explayoutsI18n.cancel).html() + '</button>' +
        '<button class="btn btn-primary exp-cb-apply">' + $('<div>').text(explayoutsI18n.add_selected).html() + '</button>' +
        '</div>' +
        '</div></div></div>';

    var $modal;
    var state = { parentId: 2, search: '', path: [{ node_id: 2, name: explayoutsI18n.content }], singleSelect: false, callback: null };
    var pendingView = null;

    function ensureModal() {
        if ($modal) return;
        var $app = $('#app');
        if ($app.length === 0) $app = $(document.body);
        $app.append(modalHtml);
        $modal = $('#exp-content-browser-modal');
        $modal.on('click', '.exp-cb-cancel', function(e){ e.preventDefault(); $modal.modal('hide'); });
        $modal.on('click', '.exp-cb-apply', function(e){ onApply(); });
        $modal.on('keydown', '.exp-cb-search input', function(e){ if (e.keyCode === 13) { e.preventDefault(); state.search = $(this).val(); load(); } });
        $modal.on('change', '.exp-cb-search input', function(){ state.search = $(this).val(); });
        $modal.on('click', '.exp-cb-breadcrumbs a', function(e){ e.preventDefault(); var idx = parseInt($(this).data('idx')); state.path = state.path.slice(0, idx + 1); state.parentId = state.path[idx].node_id; state.search = ''; $modal.find('.exp-cb-search input').val(''); load(); });
        $modal.on('click', '.exp-cb-list .js-cb-browse', function(e){ e.preventDefault(); var nodeId = parseInt($(this).data('node-id')); var name = $(this).data('name'); state.parentId = nodeId; state.path.push({ node_id: nodeId, name: name }); state.search = ''; $modal.find('.exp-cb-search input').val(''); load(); });
        $modal.on('change', '.exp-cb-list .js-cb-select', function(){});
    }

    function renderBreadcrumbs() {
        var html = '';
        state.path.forEach(function(item, idx){
            html += (idx > 0 ? ' / ' : '') + '<a href="#" data-idx="' + idx + '">' + $('<div>').text(item.name).html() + '</a>';
        });
        $modal.find('.exp-cb-breadcrumbs').html(html);
    }

    function load() {
        var url = explayoutsBase() + '/app/api/content_browser?parent_node_id=' + state.parentId + '&search=' + encodeURIComponent(state.search) + '&offset=0&limit=50';
        $modal.find('.exp-cb-list').html($('<p>').text(explayoutsI18n.loading));
        $.getJSON(url).done(function(data){
            var html = '';
            if (!data.values || data.values.length === 0) {
                html = $('<p>').text(explayoutsI18n.no_content).prop('outerHTML');
            } else {
                html += '<table class="table table-condensed"><tbody>';
                // Every value from the server is escaped for where it goes: text, or an attribute value (quotes too;
                // jQuery's .html() leaves " as it is); the ids are numbers.
                function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
                data.values.forEach(function(item){
                    var nodeId = parseInt(item.node_id, 10) || 0, objectId = parseInt(item.object_id, 10) || 0;
                    var cbId = 'exp-cb-' + nodeId;
                    var inputType = state.singleSelect ? 'radio' : 'checkbox';
                    var inputName = state.singleSelect ? ' name="exp-cb-single"' : '';
                    html += '<tr>';
                    html += '<td><input type="' + inputType + '"' + inputName + ' id="' + cbId + '" class="js-cb-select" data-node-id="' + nodeId + '" data-object-id="' + objectId + '" data-name="' + esc(item.name) + '" />';
                    html += '<label for="' + cbId + '">' + esc(item.name) + ' <small>(' + esc(item.class_name) + ')</small></label></td>';
                    html += '<td class="exp-cb-actions">';
                    if (item.is_container) {
                        html += '<a href="#" class="js-cb-browse" data-node-id="' + nodeId + '" data-name="' + esc(item.name) + '">' + $('<div>').text(explayoutsI18n.open).html() + '</a>';
                    }
                    html += '</td></tr>';
                });
                html += '</tbody></table>';
            }
            $modal.find('.exp-cb-list').html(html);
            renderBreadcrumbs();
        }).fail(function(){
            $modal.find('.exp-cb-list').html($('<p>').text(explayoutsI18n.load_failed));
        });
    }

    function openModal(view) {
        pendingView = view;
        state.singleSelect = false;
        state.callback = null;
        ensureModal();
        $modal.find('.modal-title').text(explayoutsI18n.add_to_collection);
        $modal.find('.exp-cb-apply').text(explayoutsI18n.add_selected);
        state.parentId = 2;
        state.search = '';
        state.path = [{ node_id: 2, name: explayoutsI18n.content }];
        $modal.find('.exp-cb-search input').val('');
        load();
        $modal.modal('show');
    }

    function openSingleSelectModal(callback, options) {
        options = options || {};
        pendingView = null;
        state.singleSelect = true;
        state.callback = callback;
        ensureModal();
        $modal.find('.modal-title').text(options.title || explayoutsI18n.select_content);
        $modal.find('.exp-cb-apply').text(options.buttonText || explayoutsI18n.select);
        state.parentId = 2;
        state.search = '';
        state.path = [{ node_id: 2, name: explayoutsI18n.content }];
        $modal.find('.exp-cb-search input').val('');
        load();
        $modal.modal('show');
    }

    function onApply() {
        var selected = [];
        $modal.find('.exp-cb-list .js-cb-select:checked').each(function(){
            selected.push($(this));
        });
        if (selected.length === 0) { $modal.modal('hide'); return; }

        if (state.singleSelect && typeof state.callback === 'function') {
            var $sel = selected[0];
            state.callback({
                nodeId: parseInt($sel.data('node-id')),
                objectId: parseInt($sel.data('object-id')),
                name: String($sel.data('name') || '')
            });
            $modal.modal('hide');
            return;
        }

        if (!pendingView) return;
        selected = selected.map(function($el){ return parseInt($el.data('node-id')); });

        var model = pendingView.model;
        var blockId = model.get('block_id');
        var identifier = model.get('identifier') || 'default';
        var locale = model.get('locale') || 'eng';
        var valueType = model.get('canAddItems') ? (pendingView.$el.closest('.collection-items').find('.js-browser-item-type').val() || 'ez_location') : 'ez_location';
        var position = model.get('offset') || 0;

        var items = selected.reverse().map(function(nodeId){
            return { value: nodeId, value_type: valueType, item_type: 'manual', position: position };
        });

        $.ajax({
            url: explayoutsBase() + '/app/api/' + locale + '/blocks/' + blockId + '/collections/' + identifier + '/items',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ items: items }),
            headers: { 'X-CSRF-Token': Core.g && Core.g.config ? Core.g.config.get('csrf_token') : '' }
        }).done(function(){
            $modal.modal('hide');
            if (model.fetch_results) model.fetch_results();
        }).fail(function(){
            $modal.modal('hide');
            alert(explayoutsI18n.add_failed);
        });
    }

    document.addEventListener('click', function(e){
        var target = e.target.closest ? e.target.closest('.add-items') : null;
        if (!target) return;
        var body = document.querySelector('.collection-items .body');
        if (!body) return;
        var view = $(body).data('_view');
        if (!view || !view.model) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        openModal(view);
    }, true);

    function triggerBrowserChange($wrap) {
        $wrap.find('input.js-value').trigger('change');
        $wrap[0].dispatchEvent(new CustomEvent('browser:change', { bubbles: true, detail: { instance: $wrap[0] } }));
    }

    document.addEventListener('click', function(e){
        if (!e.target.closest) return;
        var trigger = e.target.closest('.exp-input-browse .js-trigger');
        var clear = e.target.closest('.exp-input-browse .js-clear');
        if (!trigger && !clear) return;
        e.preventDefault();
        e.stopImmediatePropagation();

        var $wrap = $(trigger || clear).closest('.exp-input-browse');
        var $input = $wrap.find('input.js-value');
        var $name = $wrap.find('.js-name');
        var $row = $wrap.closest('.row-input');
        var $cms = $row.find('.js-view-cms');
        var itemType = $wrap.find('input.js-item-type').val() || 'exp_content';

        if (clear) {
            $input.val('').trigger('change');
            $name.text($name.data('empty-note') || explayoutsI18n.select_item);
            $wrap.addClass('item-empty');
            $cms.hide();
            triggerBrowserChange($wrap);
            return;
        }

        var title = explayoutsI18n.select_content;
        var $label = $row.find('label').first();
        if ($label.length) title = explayoutsI18n.select_label.replace('%label', $label.text().trim());

        openSingleSelectModal(function(data){
            var value = (itemType === 'exp_location') ? data.nodeId : data.objectId;
            $input.val(value).trigger('change');
            $name.text(data.name);
            $wrap.removeClass('item-empty');
            $cms.attr('href', window.explayoutsInSiteaccess('/content/view/full/' + data.nodeId)).show();
            triggerBrowserChange($wrap);
        }, { title: title, buttonText: explayoutsI18n.select });
    }, true);

}
})();
