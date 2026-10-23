/* The layout editor's page (explayouts_ui_api/app.tpl), second part: a blocking script after the cancel link and the
   tags of the deferred bundles, where the inline scripts of app.tpl stood until 1.3.22, so it runs before the app
   bundle as they did. It reads the globals javascript/explayouts-app-head.js set. In order: the Cancel link, the
   header dropdowns, dragging block types into a zone, the form token and the return after publish/discard on every
   write request, and the content browser dialog of collections and browse fields. */
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
// Bootstrap JS. The dialog shows and hides itself as Bootstrap 3's modal did (classes modal-open, in, the backdrop,
// Escape, a click beside the dialog, focus kept inside), so the stylesheets apply as before.
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

    // The Backbone view of an element of the app. The app keeps it in its DOM layer's data store
    // ($el.data('_view'), module ./extended/backbone_override), which only that layer can read; an app that keeps it
    // on the element itself (el._view) needs no DOM layer here.
    function viewOf(el) {
        var $ = Core.$;
        if (el && el._view) return el._view;
        if (!el || typeof $ !== 'function') return null;
        try { return $(el).data('_view') || null; } catch (e) { return null; }
    }

    // Requests go through the app's own request function while it has one (Core.$.ajax): its progress bar, its
    // dialogs for a lost session or a missing permission and its count of running writes (the warning on leaving
    // the editor) see them, as before. Without it, fetch with the headers that function sent.
    function request(o) {
        var $ = Core.$;
        if ($ && typeof $.ajax === 'function') {
            return new Promise(function(resolve, reject){
                $.ajax(o).then(function(data){ resolve(data); }, function(xhr){ reject(xhr); });
            });
        }
        var headers = { 'Accept': o.dataType === 'json' ? 'application/json, text/javascript, */*; q=0.01' : '*/*',
                        'X-Requested-With': 'XMLHttpRequest' };
        if (o.contentType) headers['Content-Type'] = o.contentType;
        // An empty token is left out, so that the form token of the page goes in (the fetch wrapper above)
        Object.keys(o.headers || {}).forEach(function(name){ if (o.headers[name]) headers[name] = o.headers[name]; });
        return fetch(o.url, { method: o.method || 'GET', headers: headers, body: o.data, credentials: 'same-origin' }).then(function(r){
            if (!r.ok) throw r;
            return o.dataType === 'json' ? r.json() : r.text();
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
        modal.addEventListener('keydown', function(e){
            if (!e.target.closest('.exp-cb-search input')) return;
            if (e.keyCode === 13) { e.preventDefault(); state.search = e.target.value; load(); }
        });
        modal.addEventListener('change', function(e){
            if (e.target.closest('.exp-cb-search input')) state.search = e.target.value;
        });
        dialogBehaviour();
    }

    // Showing and hiding, as Bootstrap 3.4's modal: the backdrop fades in (150 ms), then the dialog (300 ms) and
    // it takes the focus; Escape and a click beside the dialog close it; the focus does not leave it while it is
    // open. On closing, the focus goes back to where it was before the dialog opened.
    var TRANSITION = 300, BACKDROP_TRANSITION = 150;
    var shown = false, step = 0, backdrop = null, opener = null, bodyPad = null, bodyOverflowing = false, scrollbarWidth = 0;
    var ignoreBackdropClick = false, pressInDialog = false;

    function afterTransition(el, ms, fn) {
        var done = false, timer;
        function finish(e) {
            if (done || (e && e.target !== el)) return;
            done = true;
            clearTimeout(timer);
            el.removeEventListener('transitionend', finish);
            fn();
        }
        el.addEventListener('transitionend', finish);
        timer = setTimeout(finish, ms);
    }

    function onEscape(e) { if (e.which === 27 || e.keyCode === 27) hideModal(); }
    function onResize() { adjustDialog(); }
    function enforceFocus(e) {
        if (document !== e.target && modal !== e.target && !modal.contains(e.target)) modal.focus();
    }

    function dialogBehaviour() {
        var dialog = find('.modal-dialog');
        // A press that starts in the dialog and ends beside it is no click beside it
        dialog.addEventListener('mousedown', function(){ if (shown) pressInDialog = true; });
        modal.addEventListener('mouseup', function(e){
            if (pressInDialog && e.target === modal) ignoreBackdropClick = true;
            pressInDialog = false;
        });
        modal.addEventListener('click', function(e){
            if (!shown || !backdrop) return;
            if (ignoreBackdropClick) { ignoreBackdropClick = false; return; }
            if (e.target === e.currentTarget) hideModal();
        });
    }

    function measureScrollbar() {
        var probe = document.createElement('div');
        probe.className = 'modal-scrollbar-measure';
        document.body.appendChild(probe);
        var width = probe.offsetWidth - probe.clientWidth;
        document.body.removeChild(probe);
        return width;
    }

    function adjustDialog() {
        var modalOverflowing = modal.scrollHeight > document.documentElement.clientHeight;
        modal.style.paddingLeft = !bodyOverflowing && modalOverflowing ? scrollbarWidth + 'px' : '';
        modal.style.paddingRight = bodyOverflowing && !modalOverflowing ? scrollbarWidth + 'px' : '';
    }

    function showModal() {
        if (shown) return;
        shown = true;
        var current = ++step;
        opener = document.activeElement;
        bodyOverflowing = document.body.clientWidth < window.innerWidth;
        scrollbarWidth = measureScrollbar();
        if (bodyPad === null) bodyPad = document.body.style.paddingRight || '';
        if (bodyOverflowing) {
            var pad = parseInt(window.getComputedStyle(document.body).paddingRight || 0, 10) || 0;
            document.body.style.paddingRight = (pad + scrollbarWidth) + 'px';
        }
        document.body.classList.add('modal-open');
        modal.addEventListener('keydown', onEscape);
        window.addEventListener('resize', onResize);

        if (backdrop) backdrop.remove();
        backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop fade';
        document.body.appendChild(backdrop);
        void backdrop.offsetWidth;
        backdrop.classList.add('in');
        afterTransition(backdrop, BACKDROP_TRANSITION, function(){
            if (current !== step) return;
            modal.style.display = 'block';
            modal.scrollTop = 0;
            adjustDialog();
            void modal.offsetWidth;
            modal.classList.add('in');
            document.removeEventListener('focusin', enforceFocus);
            document.addEventListener('focusin', enforceFocus);
            afterTransition(find('.modal-dialog'), TRANSITION, function(){
                if (current === step) modal.focus();
            });
        });
    }

    function hideModal() {
        if (!shown) return;
        shown = false;
        var current = ++step;
        modal.removeEventListener('keydown', onEscape);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('focusin', enforceFocus);
        modal.classList.remove('in');
        afterTransition(modal, TRANSITION, function(){
            if (current !== step) return;
            modal.style.display = 'none';
            var gone = backdrop;
            if (gone) gone.classList.remove('in');
            function done() {
                if (gone) gone.remove();
                if (backdrop === gone) backdrop = null;
                if (current !== step) return;
                document.body.classList.remove('modal-open');
                modal.style.paddingLeft = '';
                modal.style.paddingRight = '';
                document.body.style.paddingRight = bodyPad || '';
                bodyPad = null;
                var active = document.activeElement;
                if (opener && opener !== document.body && document.contains(opener) && (!active || active === document.body || modal.contains(active))) {
                    try { opener.focus(); } catch (e) {}
                }
                opener = null;
            }
            if (gone) afterTransition(gone, BACKDROP_TRANSITION, done); else done();
        });
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
        pendingView = view;
        state.singleSelect = false;
        state.callback = null;
        openDialog(explayoutsI18n.add_to_collection, explayoutsI18n.add_selected);
    }

    function openSingleSelectModal(callback, options) {
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
            if (model.fetch_results) model.fetch_results();
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
