/* The layout editor's page (explayouts_ui_api/app.tpl), first part: runs as a blocking script at the start of <body>,
   where the inline scripts of app.tpl stood until 1.3.22, before the app bundle. Its values are the JSON data blocks
   #explayouts-app-data (return_to, site_root, i18n) and #explayouts-spa-i18n (the bundle's texts), printed by app.tpl
   and spa_strings.tpl; it sets the globals the bundle and javascript/explayouts-app.js read, as before:
   explayoutsBase(), explayoutsServerReturnTo, explayoutsSiteRoot, explayoutsI18n, explayoutsSpaI18n,
   explayoutsInSiteaccess(), explayoutsReturnTo. */

// The editor's base URL, with the siteaccess prefix (/admin/...) when there is one.
function explayoutsBase() { var m = document.querySelector('meta[name="explayouts-base-path"]'); return m ? m.content : '/explayouts_ui_api'; }

(function () {
    function read(id) {
        var block = document.getElementById(id);
        if (!block) return {};
        try { var v = JSON.parse(block.textContent); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; }
    }
    var data = read('explayouts-app-data');
    window.explayoutsServerReturnTo = typeof data.return_to === 'string' ? data.return_to : '';
    window.explayoutsSiteRoot = typeof data.site_root === 'string' ? data.site_root : '/';
    window.explayoutsI18n = data.i18n && typeof data.i18n === 'object' ? data.i18n : {};
    window.explayoutsSpaI18n = read('explayouts-spa-i18n');
})();

// Where the editor returns to. Discard, Cancel and closing go to
// localStorage.ngl_referrer (the bundle's fallback is "/", the domain
// root); the page's own scripts use explayoutsReturnTo. Any same-site path
// outside this siteaccess is put back inside it: the admin's Layouts tab
// stored /content/view/full/N without /admin, and pages still open keep
// storing it until reloaded. Only an http(s) address of this site is ever
// returned to (explayoutsSafeTarget): return_to, sessionStorage, the
// referrer and ngl_referrer can all be set from outside the editor.
(function(){
    function url(u) { try { return new URL(u, window.location.href); } catch (e) { return null; } }
    function sameSite(u) { var x = url(u); return !!x && ( x.protocol === 'http:' || x.protocol === 'https:' ) && x.origin === window.location.origin; }
    window.explayoutsSafeTarget = function (u) {
        if (typeof u !== 'string' || u === '') return '';
        var x = url(u);
        return x && sameSite(u) ? x.href : '';
    };
    function isEditor(u) { return /\/explayouts_ui_api\/app/.test(u); }
    var root = url(explayoutsSiteRoot || '/');
    var rootPath = root ? root.pathname.replace(/\/?$/, '/') : '/';
    function inSiteaccess(u) { var x = url(u); return !!x && sameSite(u) && (x.pathname + '/').indexOf(rootPath) === 0; }
    window.explayoutsInSiteaccess = function (u) {
        var x = url(u);
        if (!x || !sameSite(u)) return '';
        if (rootPath === '/' || inSiteaccess(u)) return x.href;
        return window.location.origin + rootPath.replace(/\/$/, '') + x.pathname + x.search + x.hash;
    };
    var stored = null, kept = null;
    try { stored = window.sessionStorage.getItem('explayouts_return_to'); } catch (e) {}
    try { kept = window.localStorage.getItem('ngl_referrer'); } catch (e) {}
    var explicit = explayoutsServerReturnTo || stored || null;
    if (!explicit && document.referrer && sameSite(document.referrer) && !isEditor(document.referrer)) explicit = document.referrer;
    if (explicit) explicit = window.explayoutsInSiteaccess(explicit);
    window.explayoutsReturnTo = explicit || '';
    var target = explicit;
    if (!target && kept && inSiteaccess(kept) && !isEditor(kept)) target = kept;
    if (!target) target = root ? root.href : '/';
    try { window.localStorage.setItem('ngl_referrer', target); } catch (e) {}
    if (explicit) { try { window.sessionStorage.setItem('explayouts_return_to', explicit); } catch (e) {} }
})();

(function(){
    var returnTo = window.explayoutsReturnTo;
    if (returnTo) sessionStorage.setItem('explayouts_return_to', returnTo);
    if ( ( window.location.hash === '' || window.location.hash === '#' ) && returnTo )
    {
        window.location.replace( returnTo );
        return;
    }
    if ( ( window.location.hash === '' || window.location.hash === '#' ) && !returnTo )
    {
        var m = document.referrer.match( /\/content\/view\/full\/(\d+)/ );
        if ( m )
        {
            window.location.replace( window.explayoutsInSiteaccess( '/content/view/full/' + m[1] ) );
            return;
        }
    }
})();
