/* The layout editor's page (explayouts_ui_api/app.tpl), second part: a blocking script after the cancel link and the
   tags of the deferred bundles, where the inline scripts of app.tpl stood until 1.3.22, so it runs before the app
   bundle as they did. It reads the globals javascript/explayouts-app-head.js set. In order: the Cancel link, the
   header dropdowns, dragging block types into a zone, the form token and the return after publish/discard on every
   write request, and the content browser dialog of collections and browse fields. */
if (!window.explayoutsAppReady) {
window.explayoutsAppReady = true;

(function(){
    var link = document.getElementById('ng-cancel-link');
    if (!link) return;
    var returnTo = window.explayoutsReturnTo;
    if (returnTo) link.href = returnTo;
    link.addEventListener('click', function(e){
        if (!returnTo) {
            e.preventDefault();
            window.history.back();
        }
    });

    function placeCancel() {
        if (link._placed) return;
        var createBtn = document.querySelector('.btn-primary.action_apply, .btn-primary');
        if (!createBtn) return;
        var parent = createBtn.parentNode;
        if (!parent) return;
        link._placed = true;
        link.className = 'btn btn-primary action_apply green';
        parent.insertBefore(link, createBtn);
    }

    var app = document.getElementById('app');
    if (app) {
        new MutationObserver(function(){ placeCancel(); }).observe(app, { childList: true, subtree: true });
    }
    setTimeout(placeCancel, 1000);
})();

document.addEventListener('click', function(e) {
    var toggle = e.target.closest('.dropdown-toggle');
    if (toggle) {
        e.preventDefault();
        e.stopPropagation();
        var dropdown = toggle.closest('.dropdown');
        if (dropdown) {
            var wasOpen = dropdown.classList.contains('open');
            document.querySelectorAll('.app-header .dropdown.open').forEach(function(d) { d.classList.remove('open'); });
            if (!wasOpen) dropdown.classList.add('open');
        }
        return;
    }
    var openDropdown = document.querySelector('.app-header .dropdown.open');
    if (openDropdown && !openDropdown.contains(e.target)) {
        openDropdown.classList.remove('open');
    }
}, true);

(function(){
    function definitionFromClass(el) {
        var m = el.className.match(/icn-([a-zA-Z0-9_-]+)/);
        return m ? m[1] : '';
    }
    function initButtons(root) {
        root.querySelectorAll('.add-block-btn').forEach(function(btn){
            if (btn.draggable) return;
            btn.draggable = true;
            btn.dataset.definition = definitionFromClass(btn);
        });
    }
    var app = document.getElementById('app');
    if (app) {
        new MutationObserver(function(mutations){
            mutations.forEach(function(mutation){
                if (mutation.type !== 'childList') return;
                mutation.addedNodes.forEach(function(node){
                    if (node.nodeType === 1) initButtons(node);
                });
            });
        }).observe(app, { childList: true, subtree: true });
    }
    initButtons(document);

    document.addEventListener('dragstart', function(e){
        var btn = e.target.closest('.add-block-btn');
        if (!btn) return;
        document.body.classList.add('is-dragging');
        e.dataTransfer.setData('text/plain', btn.dataset.definition);
        e.dataTransfer.setData('definition', btn.dataset.definition);
    }, true);

    document.addEventListener('dragend', function(e){
        document.body.classList.remove('is-dragging');
    }, true);

    document.addEventListener('dragover', function(e){
        if (e.target.closest('[data-zone]')) e.preventDefault();
    }, true);

    document.addEventListener('drop', function(e){
        var zone = e.target.closest('[data-zone]');
        if (!zone) return;
        e.preventDefault();
        var definition = e.dataTransfer.getData('definition') || e.dataTransfer.getData('text/plain');
        if (!definition) return;
        var layoutId = (window.location.hash.match(/#layout\/(\d+)/) || [])[1];
        var zoneIdentifier = zone.getAttribute('data-zone');
        if (!layoutId || !zoneIdentifier) return;
        var body = new URLSearchParams();
        body.append('layout_id', layoutId);
        body.append('zone_identifier', zoneIdentifier);
        body.append('definition_identifier', definition);
        var tokenMeta = document.querySelector('meta[name="ezxform-token"]');
        if (tokenMeta) body.append('ezxform_token', tokenMeta.content);
        fetch(explayoutsBase() + '/app/api/eng/blocks', { method: 'POST', body: body, credentials: 'same-origin' }).then(function(r){
            if (r.ok) window.location.reload();
        });
    }, true);
})();

(function(){
    if (!sessionStorage.getItem('explayouts_return_to') && document.referrer) {
        sessionStorage.setItem('explayouts_return_to', document.referrer);
    }

    function checkRedirect() {
        var returnTo = sessionStorage.getItem('explayouts_return_to');
        if (!returnTo) return;
        sessionStorage.removeItem('explayouts_return_to');
        setTimeout(function() { window.location.href = returnTo; }, 100);
    }

    function shouldRedirect(url, method) {
        if (typeof url !== 'string') return false;
        method = (method || 'GET').toUpperCase();
        return url.match(/\/api\/layouts\/\d+\/publish([?#]|$)/) ||
               (url.match(/\/api\/layouts\/\d+\/draft([?#]|$)/) && method === 'DELETE');
    }

    // Every request that can change something carries the session's form
    // token in X-CSRF-Token, or the API refuses it with 403. Most calls
    // already set it; this adds it to any same-site write that does not.
    function formToken() {
        var m = document.querySelector('meta[name="ezxform-token"]');
        return m ? m.content : '';
    }
    function isWrite(method) {
        method = (method || 'GET').toUpperCase();
        return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
    }
    function isSameOrigin(url) {
        try { return new URL(url, window.location.href).origin === window.location.origin; }
        catch (e) { return false; }
    }

    if (window.fetch) {
        var origFetch = window.fetch;
        window.fetch = function(url, options) {
            var isRequest = typeof Request !== 'undefined' && url instanceof Request;
            var method = options && options.method ? options.method : (isRequest ? url.method : 'GET');
            var urlString = typeof url === 'string' ? url : (url && url.url ? url.url : String(url));
            var token = formToken();
            if (token && isWrite(method) && isSameOrigin(urlString)) {
                var headers = new Headers((options && options.headers) || (isRequest ? url.headers : undefined));
                if (!headers.has('X-CSRF-Token')) {
                    headers.set('X-CSRF-Token', token);
                    options = Object.assign({}, options || {}, { headers: headers });
                    return window.fetch.call(this, url, options);
                }
            }
            return origFetch.apply(this, arguments).then(function(response) {
                if (response.ok && shouldRedirect(urlString, method)) {
                    checkRedirect();
                }
                return response;
            });
        };
    }

    var origXhrOpen = XMLHttpRequest.prototype.open;
    var origXhrSend = XMLHttpRequest.prototype.send;
    var origXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
        this._ngMethod = method;
        this._ngUrl = url;
        this._ngHasToken = false;
        return origXhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        if (String(name).toLowerCase() === 'x-csrf-token') {
            // An empty value would only stand in the way of the real one
            if (!value) return;
            // Set once: a second value would be joined to the first
            if (this._ngHasToken) return;
            this._ngHasToken = true;
        }
        return origXhrSetRequestHeader.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(body) {
        var xhr = this;
        var method = xhr._ngMethod;
        var url = xhr._ngUrl;
        var token = formToken();
        if (token && !xhr._ngHasToken && isWrite(method) && isSameOrigin(String(url))) {
            xhr.setRequestHeader('X-CSRF-Token', token);
        }
        xhr.addEventListener('load', function() {
            if (xhr.status >= 200 && xhr.status < 300 && shouldRedirect(url, method)) {
                checkRedirect();
            }
        });
        return origXhrSend.apply(this, arguments);
    };
})();

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
                data.values.forEach(function(item){
                    var cbId = 'exp-cb-' + item.node_id;
                    var inputType = state.singleSelect ? 'radio' : 'checkbox';
                    var inputName = state.singleSelect ? ' name="exp-cb-single"' : '';
                    html += '<tr>';
                    html += '<td><input type="' + inputType + '"' + inputName + ' id="' + cbId + '" class="js-cb-select" data-node-id="' + item.node_id + '" data-object-id="' + item.object_id + '" data-name="' + $('<div>').text(item.name).html() + '" />';
                    html += '<label for="' + cbId + '">' + $('<div>').text(item.name).html() + ' <small>(' + item.class_name + ')</small></label></td>';
                    html += '<td class="exp-cb-actions">';
                    if (item.is_container) {
                        html += '<a href="#" class="js-cb-browse" data-node-id="' + item.node_id + '" data-name="' + $('<div>').text(item.name).html() + '">' + $('<div>').text(explayoutsI18n.open).html() + '</a>';
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

}
