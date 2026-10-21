/* Exponential: this bundle uses the page's jQuery and jQuery UI (ezjscore), not copies of its own. */
/* Interface texts: nglT( 'English text', { '%name': value } ) returns the translation the page put in window.explayoutsSpaI18n (keyed by the English text), or the English text, with the placeholders filled in; nglTh() does the same and escapes the result for HTML. */
window.nglT=window.nglT||function(s,p){var t=window.explayoutsSpaI18n||{},h=Object.prototype.hasOwnProperty,r=h.call(t,s)&&t[s]?t[s]:s;if(p)for(var k in p)h.call(p,k)&&(r=r.split(k).join(null==p[k]?"":String(p[k])));return r};window.nglTh=window.nglTh||function(s,p){return String(window.nglT(s,p)).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};

