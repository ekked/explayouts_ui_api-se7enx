/* The layout editor's page (explayouts_ui_api/app.tpl), second part: a blocking script after the cancel link and the
   tags of the deferred bundles, where the inline scripts of app.tpl stood until 1.3.22, so it runs before the app
   bundle as they did. It reads the globals javascript/explayouts-app-head.js set. In order: the Cancel link, the form
   token and the return after publish/discard on every write request, and the content browser dialog of collections
   and browse fields. The dropdown menus and dragging block types into a zone are the app's own (Core.ui.dropdown,
   its drag and drop). */
if (!window.explayoutsAppReady) {
window.explayoutsAppReady = true;

// Cancel of the editor: placed beside Create layout of the new layout dialog, or beside Publish layout in the
// editor's header. It is a link out of the editor, never a button of the dialog: the dialog submits on a click
// on any .action_apply inside it, and Cancel carried that class, so cancelling created the layout.
(function(){
    var link = document.getElementById('ng-cancel-link');
    if (!link) return;
    // the page the editor was opened from, else the one kept for Discard (ngl_referrer), else the dashboard;
    // not history.back(), which is the editor's own previous route
    function destination() {
        var safe = window.explayoutsSafeTarget || function () { return ''; };
        if (safe(window.explayoutsReturnTo)) return safe(window.explayoutsReturnTo);
        var kept = null;
        try { kept = window.localStorage.getItem('ngl_referrer'); } catch (e) {}
        if (safe(kept)) return safe(kept);
        var dashboard = '/explayouts_ui/dashboard';
        return window.explayoutsInSiteaccess ? window.explayoutsInSiteaccess(dashboard) : dashboard;
    }
    link.href = destination();
    link.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        // The app's beforeunload guard warns while there are unsaved changes (Core.has_unsaved_changes) unless
        // should_navigate_away is set, as its own Cancel did. Cancel of the new layout dialog discards what was
        // typed there on purpose; in the editor the guard stays and warns only if something was not saved.
        if (window.Core && link.closest('.new_layout')) window.Core.should_navigate_away = true;
        window.location.href = destination();
    });

    function placeCancel() {
        if (link._placed) return;
        var createBtn = document.querySelector('.new_layout .modal-footer .action_apply');
        var publishBtn = createBtn ? null : document.querySelector('.ngc .actions .js-publish');
        var anchor = createBtn || publishBtn;
        if (!anchor || !anchor.parentNode) return;
        link._placed = true;
        link.className = createBtn ? 'btn btn-default' : 'btn btn-link-white';
        anchor.parentNode.insertBefore(link, anchor);
    }

    var app = document.getElementById('app');
    if (app) {
        new MutationObserver(function(){ placeCancel(); }).observe(app, { childList: true, subtree: true });
    }
    setTimeout(placeCancel, 1000);
})();

(function(){
    var safe = window.explayoutsSafeTarget || function () { return ''; };
    if (!sessionStorage.getItem('explayouts_return_to') && safe(document.referrer)) {
        sessionStorage.setItem('explayouts_return_to', safe(document.referrer));
    }

    function checkRedirect() {
        var returnTo = safe(sessionStorage.getItem('explayouts_return_to'));
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

// The content browser dialog of collections ("+ Add items") and of browse fields. Plain DOM: no jQuery and no
// Bootstrap JS. It is one of the app's dialogs (Core.ui.dialog): shown and hidden as Bootstrap 3's modal did (classes
// modal-open, in, the backdrop, Escape, a click beside the dialog), the focus kept inside and given back on closing.
(function(){
    var initInterval = setInterval(function(){
        var Core = window.Core;
        if (!Core) return;
        clearInterval(initInterval);
        init(Core);
    }, 500);

    function init(Core){

    // Text for HTML, as text or as an attribute value (quotes too); every text of the dialog goes in through it.
    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

    // The Backbone view of an element of the app: the app keeps it on the element (el.ngl_view).
    function viewOf(el) {
        return el && el.ngl_view || null;
    }

    // Requests go through the app's own request function (Core.$.ajax, its DOM layer): its progress bar, its dialogs
    // for a lost session or a missing permission and its count of running writes (the warning on leaving the
    // editor) see them.
    function request(o) {
        return new Promise(function(resolve, reject){
            Core.$.ajax(o).then(function(data){ resolve(data); }, function(xhr){ reject(xhr); });
        });
    }

    var modalHtml = '<div class="modal fade" id="exp-content-browser-modal" tabindex="-1" role="dialog">' +
        '<div class="modal-dialog exp-cb-dialog" role="document">' +
        '<div class="modal-content">' +
        '<div class="modal-header"><h4 class="modal-title">' + esc(explayoutsI18n.add_to_collection) + '</h4></div>' +
        '<div class="modal-body">' +
        '<div class="exp-cb-search form-group"><input type="text" class="form-control" placeholder="' + esc(explayoutsI18n.search) + '" /></div>' +
        '<div class="exp-cb-breadcrumbs"></div>' +
        '<div class="exp-cb-list" tabindex="0"></div>' +
        '</div>' +
        '<div class="modal-footer">' +
        '<button class="btn btn-default exp-cb-cancel" data-dismiss="modal">' + esc(explayoutsI18n.cancel) + '</button>' +
        '<button class="btn btn-primary exp-cb-apply">' + esc(explayoutsI18n.add_selected) + '</button>' +
        '</div>' +
        '</div></div></div>';

    var modal;
    var state = { parentId: 2, search: '', path: [{ node_id: 2, name: explayoutsI18n.content }], singleSelect: false, callback: null };
    var pendingView = null;

    function find(selector) { return modal.querySelector(selector); }

    function ensureModal() {
        if (modal) return;
        var app = document.getElementById('app') || document.body;
        app.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('exp-content-browser-modal');
        modal.addEventListener('click', function(e){
            var t = e.target;
            if (t.closest('.exp-cb-cancel')) { e.preventDefault(); hideModal(); return; }
            if (t.closest('.exp-cb-apply')) { onApply(); return; }
            if (t.closest('[data-dismiss="modal"]')) { hideModal(); return; }
            var crumb = t.closest('.exp-cb-breadcrumbs a');
            if (crumb) {
                e.preventDefault();
                var idx = parseInt(crumb.getAttribute('data-idx'), 10);
                state.path = state.path.slice(0, idx + 1);
                state.parentId = state.path[idx].node_id;
                state.search = '';
                find('.exp-cb-search input').value = '';
                load();
                return;
            }
            var browse = t.closest('.exp-cb-list .js-cb-browse');
            if (browse) {
                e.preventDefault();
                var nodeId = parseInt(browse.getAttribute('data-node-id'), 10);
                state.parentId = nodeId;
                state.path.push({ node_id: nodeId, name: browse.getAttribute('data-name') });
                state.search = '';
                find('.exp-cb-search input').value = '';
                load();
            }
        });
        modal.addEventListener('hidden.bs.modal', function(){
            if (!focusAddItemsOnClose) return;
            setTimeout(function(){ if (!Core.ui.dialog.is_shown(modal)) focusAddItems(); }, 0);
        });
        modal.addEventListener('keydown', function(e){
            if (!e.target.closest('.exp-cb-search input')) return;
            if (e.keyCode === 13) { e.preventDefault(); state.search = e.target.value; load(); }
        });
        modal.addEventListener('change', function(e){
            if (e.target.closest('.exp-cb-search input')) state.search = e.target.value;
        });
    }

    function showModal() { Core.ui.dialog.show(modal); }
    function hideModal() { Core.ui.dialog.hide(modal); }

    // Opened from "+ Add items": the focus goes back to that button when the dialog closes. The collection may have
    // drawn itself again meanwhile (loading, the added items), so the button of the collection in place is taken
    // when the one that opened the dialog is gone.
    var focusAddItemsOnClose = false;
    function focusAddItems() {
        var active = document.activeElement;
        // still on the closed dialog (hidden, so lost in a browser) counts as lost too
        if (active && active !== document.body && active.isConnected && !(modal && modal.contains(active))) return;
        var button = document.querySelector('.collection-items .add-items');
        if (button && typeof button.focus === 'function') button.focus();
    }

    function renderBreadcrumbs() {
        var html = '';
        state.path.forEach(function(item, idx){
            html += (idx > 0 ? ' / ' : '') + '<a href="#" data-idx="' + idx + '">' + esc(item.name) + '</a>';
        });
        find('.exp-cb-breadcrumbs').innerHTML = html;
    }

    function load() {
        var url = explayoutsBase() + '/app/api/content_browser?parent_node_id=' + state.parentId + '&search=' + encodeURIComponent(state.search) + '&offset=0&limit=50';
        find('.exp-cb-list').innerHTML = '<p>' + esc(explayoutsI18n.loading) + '</p>';
        request({ url: url, dataType: 'json' }).then(function(data){
            var html = '';
            if (!data || !data.values || data.values.length === 0) {
                html = '<p>' + esc(explayoutsI18n.no_content) + '</p>';
            } else {
                html += '<table class="table table-condensed"><tbody>';
                // Every value from the server goes in through esc() or as a number (the ids).
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
                        html += '<a href="#" class="js-cb-browse" data-node-id="' + nodeId + '" data-name="' + esc(item.name) + '">' + esc(explayoutsI18n.open) + '</a>';
                    }
                    html += '</td></tr>';
                });
                html += '</tbody></table>';
            }
            find('.exp-cb-list').innerHTML = html;
            renderBreadcrumbs();
        }, function(){
            find('.exp-cb-list').innerHTML = '<p>' + esc(explayoutsI18n.load_failed) + '</p>';
        });
    }

    function openDialog(title, buttonText) {
        ensureModal();
        find('.modal-title').textContent = title;
        find('.exp-cb-apply').textContent = buttonText;
        state.parentId = 2;
        state.search = '';
        state.path = [{ node_id: 2, name: explayoutsI18n.content }];
        find('.exp-cb-search input').value = '';
        load();
        showModal();
    }

    function openModal(view) {
        focusAddItemsOnClose = true;
        pendingView = view;
        state.singleSelect = false;
        state.callback = null;
        openDialog(explayoutsI18n.add_to_collection, explayoutsI18n.add_selected);
    }

    function openSingleSelectModal(callback, options) {
        focusAddItemsOnClose = false;
        options = options || {};
        pendingView = null;
        state.singleSelect = true;
        state.callback = callback;
        openDialog(options.title || explayoutsI18n.select_content, options.buttonText || explayoutsI18n.select);
    }

    function onApply() {
        var selected = Array.prototype.slice.call(modal.querySelectorAll('.exp-cb-list .js-cb-select:checked'));
        if (selected.length === 0) { hideModal(); return; }

        if (state.singleSelect && typeof state.callback === 'function') {
            var sel = selected[0];
            state.callback({
                nodeId: parseInt(sel.getAttribute('data-node-id'), 10),
                objectId: parseInt(sel.getAttribute('data-object-id'), 10),
                name: sel.getAttribute('data-name') || ''
            });
            hideModal();
            return;
        }

        if (!pendingView) return;
        selected = selected.map(function(el){ return parseInt(el.getAttribute('data-node-id'), 10); });

        var model = pendingView.model;
        var blockId = model.get('block_id');
        var identifier = model.get('identifier') || 'default';
        var locale = model.get('locale') || 'eng';
        var itemTypeSelect = null;
        if (model.get('canAddItems') && pendingView.el && pendingView.el.closest) {
            var items = pendingView.el.closest('.collection-items');
            itemTypeSelect = items ? items.querySelector('.js-browser-item-type') : null;
        }
        var valueType = (itemTypeSelect && itemTypeSelect.value) || 'ez_location';
        var position = model.get('offset') || 0;

        var newItems = selected.reverse().map(function(nodeId){
            return { value: nodeId, value_type: valueType, item_type: 'manual', position: position };
        });

        request({
            url: explayoutsBase() + '/app/api/' + locale + '/blocks/' + blockId + '/collections/' + identifier + '/items',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ items: newItems }),
            headers: { 'X-CSRF-Token': Core.g && Core.g.config ? Core.g.config.get('csrf_token') : '' }
        }).then(function(){
            hideModal();
            var fetched = model.fetch_results ? model.fetch_results() : null;
            if (fetched && typeof fetched.then === 'function') {
                fetched.then(function(){
                    if (focusAddItemsOnClose && !Core.ui.dialog.is_shown(modal)) focusAddItems();
                });
            }
        }, function(){
            hideModal();
            alert(explayoutsI18n.add_failed);
        });
    }

    document.addEventListener('click', function(e){
        var target = e.target.closest ? e.target.closest('.add-items') : null;
        if (!target) return;
        var body = document.querySelector('.collection-items .body');
        if (!body) return;
        var view = viewOf(body);
        if (!view || !view.model) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        // a mouse click does not focus a button in every browser: the dialog gives the focus back to what had it
        if (typeof target.focus === 'function' && document.activeElement !== target) target.focus();
        openModal(view);
    }, true);

    // The form of the block saves on a change event (its Backbone events, through the app's DOM layer) and on
    // browser:change. Both are native events: they reach listeners of the DOM layer and addEventListener alike.
    function fireChange(input) {
        if (input) input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function triggerBrowserChange(wrap) {
        fireChange(wrap.querySelector('input.js-value'));
        wrap.dispatchEvent(new CustomEvent('browser:change', { bubbles: true, detail: { instance: wrap } }));
    }
    function showLink(el) {
        el.style.display = '';
        if (window.getComputedStyle(el).display === 'none') el.style.display = 'inline';
    }

    document.addEventListener('click', function(e){
        if (!e.target.closest) return;
        var trigger = e.target.closest('.exp-input-browse .js-trigger');
        var clear = e.target.closest('.exp-input-browse .js-clear');
        if (!trigger && !clear) return;
        e.preventDefault();
        e.stopImmediatePropagation();

        var wrap = (trigger || clear).closest('.exp-input-browse');
        var input = wrap.querySelector('input.js-value');
        var name = wrap.querySelector('.js-name');
        var row = wrap.closest('.row-input');
        var cms = row ? Array.prototype.slice.call(row.querySelectorAll('.js-view-cms')) : [];
        var itemTypeInput = wrap.querySelector('input.js-item-type');
        var itemType = (itemTypeInput && itemTypeInput.value) || 'exp_content';

        if (clear) {
            if (input) { input.value = ''; fireChange(input); }
            if (name) name.textContent = name.getAttribute('data-empty-note') || explayoutsI18n.select_item;
            wrap.classList.add('item-empty');
            cms.forEach(function(el){ el.style.display = 'none'; });
            triggerBrowserChange(wrap);
            return;
        }

        var title = explayoutsI18n.select_content;
        var label = row ? row.querySelector('label') : null;
        if (label) title = explayoutsI18n.select_label.replace('%label', label.textContent.trim());

        openSingleSelectModal(function(data){
            var value = (itemType === 'exp_location') ? data.nodeId : data.objectId;
            if (input) { input.value = value; fireChange(input); }
            if (name) name.textContent = data.name;
            wrap.classList.remove('item-empty');
            cms.forEach(function(el){
                el.setAttribute('href', window.explayoutsInSiteaccess('/content/view/full/' + data.nodeId));
                showLink(el);
            });
            triggerBrowserChange(wrap);
        }, { title: title, buttonText: explayoutsI18n.select });
    }, true);

}
})();

}
