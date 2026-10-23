function(e,t,n){
/**
 * Drag and drop of the layout editor, part 4: moving with the keyboard. Plain DOM, no jQuery. The sortable lists
 * (module 138) and the draggables (module 135) tell this module about each list or draggable when they mark its
 * grips (sortable( instance ), draggable( instance )); nothing else calls it. Its id is that of jQuery UI's widget
 * factory, which the editor no longer needs (./widget of modules 135-138).
 *
 * The grips become buttons (role="button", tabindex 0, a name and a hint): a block's handle in its header, a block
 * type of the toolbar, a collection item's handle (manual items; in a dynamic collection the items pinned to a slot).
 *
 *   Space, Enter        pick up; picked up: drop where it is
 *   ArrowUp, ArrowDown  one place up or down; at the first or last place of a zone into the zone before or after it
 *   Home, End           the first or last place in the zone (in the collection)
 *   Escape              puts everything back, as does leaving the grip (Tab, a click elsewhere)
 *   Alt+ArrowUp/Down    (not picked up) moves one place at once, as admin4's sub items do
 *
 * The move runs through the instance's keyStart/keyMove/keyDrop/keyCancel (keyStart/keyTargets/keyOver/keyDrop of a
 * draggable): the same callbacks as a pointer drag, so ./dnd and ./bm_collection_items save it with the same calls
 * (a block's set and move, a new block from a block type, a collection item's $move). Zones the pointer cannot drop
 * into are skipped: linked zones (connectWith leaves them out), zones that do not accept the block type or are
 * inherited, the placeholders of a container block for a container block. A block type picked up from the toolbar
 * goes to the first place of the first zone that takes it.
 *
 * Every step is said in one polite live region, the texts through nglT(). After a drop the grip of the block or item
 * moved keeps the focus, also when the editor draws it again. Scrolling follows the item, smoothly unless the
 * browser asks for reduced motion.
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
"use strict";
var infos=new WeakMap,listOf=new WeakMap,grab=null,moving=0,live=null,lastSaid="",HINT="exp-kbd-move-hint";

function T(s,p){
    if(typeof window.nglT=="function")return window.nglT(s,p);
    for(var k in p||{})s=s.split(k).join(String(p[k]));
    return s;
}

function viewOf(el){
    if(!el)return null;
    return el.ngl_view||null;
}
function modelOf(el){var v=viewOf(el);return v&&v.model||null}
function call(model,name){return!!(model&&typeof model[name]=="function"&&model[name]())}

function child(el,selector){
    for(var c=el.firstElementChild;c;c=c.nextElementSibling)if(c.matches(selector))return c;
    return null;
}

/** The text of an element without what the editor adds to a block's name (its css id and class). */
function text(el){
    if(!el)return"";
    var s="";
    el.childNodes.forEach(function(c){if(!(c.nodeType===1&&c.classList.contains("ai")))s+=c.textContent});
    return s.replace(/\s+/g," ").trim();
}

function nameOf(item){
    if(item.matches("[data-block]"))return text(item.querySelector(".block-header .name"));
    if(item.matches(".add-block-btn"))return text(item.querySelector(".title"))||text(item);
    return text(item.querySelector(".name"));
}

function reducedMotion(){return!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)}

function say(s){
    if(!live||!live.isConnected){
        live=document.createElement("div");
        live.className="exp-kbd-sr";
        live.setAttribute("aria-live","polite");
        live.setAttribute("aria-atomic","true");
        document.body.appendChild(live);
    }
    // the same text twice is said twice
    live.textContent=s===lastSaid?s+" ":s;
    lastSaid=live.textContent;
}

function hint(){
    if(!document.getElementById(HINT)){
        var h=document.createElement("div");
        h.id=HINT;
        h.className="exp-kbd-sr";
        h.textContent=T("Space or Enter picks it up, the arrow keys move it, Space or Enter drops it, Escape cancels. Alt with the up or down arrow moves it by one place at once.");
        document.body.appendChild(h);
    }
    return HINT;
}

function set(el,name,value){if(el.getAttribute(name)!==value)el.setAttribute(name,value)}

/** Makes `grip` a button that picks up its item. */
function prepare(grip,label,info){
    if(grip.tagName!=="BUTTON"){
        set(grip,"role","button");
        if(!grip.hasAttribute("tabindex"))grip.tabIndex=0;
    }
    set(grip,"aria-label",label);
    set(grip,"aria-describedby",hint());
    grip.classList.add("exp-kbd-grip");
    infos.set(grip,info);
}

/* ---- the grips ---- */

/** The keyboard grip of an item of a sortable list, or null when it has none. */
function sortableGrip(item){
    if(item.matches("[data-block]")){var h=child(item,".block-header");return h&&(child(h,".handle")||h)}
    if(item.matches(".add-block-btn"))return item;
    if(item.matches(".collection-item"))return item.querySelector(".handle");
    return null;
}

function labelOf(item){
    if(item.matches("[data-block]"))return T("Move block %name",{"%name":nameOf(item)});
    if(item.matches(".add-block-btn"))return T("Add block %name",{"%name":nameOf(item)});
    return T("Move item %name",{"%name":nameOf(item)});
}

function markSortable(inst){
    if(inst.options.disabled)return;
    inst._items().forEach(function(item){
        var g=sortableGrip(item);
        if(g)prepare(g,labelOf(item),{type:"sortable",inst:inst});
    });
}

/**
 * Called by module 138 whenever it marks a list's grips, also after a block or item was drawn again (its header and
 * handle are new elements then). The trash and the zone map are not moved from.
 */
function sortable(inst){
    var el=inst.element;
    if(el.matches("[data-trash], [data-zone-receiver]"))return;
    listOf.set(el,inst);
    markSortable(inst);
}

/** Called by module 135 when it marks a draggable's grips (a manual item of a dynamic collection). */
function draggable(inst){
    var item=inst.element.closest(".collection-item"),h=inst.options.handle,g=h?inst.element.querySelector(h):inst.element;
    if(item&&g)prepare(g,labelOf(item),{type:"draggable",inst:inst});
}

/* ---- where a sortable item can go ---- */

function zoneLabel(list){
    var el=list.element,z=el.closest("[data-zone]"),m=modelOf(z),
        name=m&&typeof m.get=="function"&&m.get("name")||z&&z.getAttribute("data-zone")||"",
        c=el.closest("[data-container]");
    if(c&&(!z||z.contains(c)))name+=(name?" › ":"")+nameOf(c);
    return name;
}

/** Whether `list` takes the item picked up, by the rules the pointer's callbacks apply (./dnd). */
function accepts(list){
    var g=grab,el=list.element,model=g.model;
    if(list===g.inst&&!g.toolbar)return!0;
    if(el.closest(".linked_zone"))return!1;
    var c=el.closest("[data-container]");
    if(c&&call(modelOf(c),"is_container")&&call(model,"is_container"))return!1;   // check_containers
    var v=el.closest("[data-view]");
    if(v&&v.matches("[data-zone]")){   // zone_accept_blocks
        var zm=modelOf(v);
        if(zm&&(call(zm,"is_inherited")||typeof zm.should_accept=="function"&&!zm.should_accept(model)))return!1;
    }
    return!0;
}

/** The lists of the drag in document order: { list, ok } (ok: it takes the item). */
function targets(){
    var g=grab,item=g.item;
    return(g.inst.containers||[]).filter(function(l){
        var el=l.element;
        return el.isConnected&&!el.matches("[data-trash]")&&!item.contains(el)&&!(g.toolbar&&l===g.inst);
    }).sort(function(a,b){return a.element.compareDocumentPosition(b.element)&4?-1:1})
      .map(function(l){return{list:l,ok:accepts(l)}});
}

function where(){
    var list=grab.inst.currentContainer,items=list._items();
    return{list:list,index:items.indexOf(grab.item),count:items.length};
}

function sayPlace(prefix){
    var w=where();
    say((prefix?prefix+" ":"")+(grab.collection?T("Position %position of %count.",{"%position":w.index+1,"%count":w.count})
        :T("Zone %zone, position %position of %count.",{"%zone":zoneLabel(w.list),"%position":w.index+1,"%count":w.count})));
}

function focusGrip(grip){
    if(grip&&grip.isConnected&&document.activeElement!==grip){try{grip.focus({preventScroll:!0})}catch(x){grip.focus()}}
}

function reveal(el){
    if(el&&typeof el.scrollIntoView=="function")el.scrollIntoView({block:"nearest",inline:"nearest",behavior:reducedMotion()?"auto":"smooth"});
}

/** Moves the sortable item to place `index` of `list`, keeping its grip focused. */
function moveTo(list,index){
    var g=grab;
    moving++;
    try{g.inst.keyMove(list,index)}finally{moving--}
    if(!g.inst.drag){endGrab();say(T("Move cancelled."));return!1}
    focusGrip(g.grip);
    reveal(g.item);
    return!0;
}

/** One step (up/down/first/last) of the sortable item; a zone skipped because it refuses the item is said. */
function step(action){
    var w=where(),ts=targets(),n=w.count-1,at=-1,i,refused=!1,dest=null;
    for(i=0;i<ts.length;i++)if(ts[i].list===w.list)at=i;
    if(action==="first")dest={list:w.list,index:0};
    else if(action==="last")dest={list:w.list,index:n};
    else if(action==="down"&&w.index<n)dest={list:w.list,index:w.index+1};
    else if(action==="up"&&w.index>0)dest={list:w.list,index:w.index-1};
    else{
        var dir=action==="down"?1:-1;
        for(i=at+dir;i>=0&&i<ts.length;i+=dir){
            if(ts[i].ok){
                dest={list:ts[i].list,index:dir>0?0:ts[i].list._items().length};
                break;
            }
            refused=!0;
        }
    }
    if(dest&&(dest.list!==w.list||dest.index!==w.index)&&!moveTo(dest.list,dest.index))return!1;
    sayPlace(refused?T("This zone does not accept %name.",{"%name":grab.name}):"");
    return!0;
}

/* ---- picking up, dropping, cancelling ---- */

function begin(grip,info,quiet){
    if(info.type==="draggable")return beginDraggable(grip,info,quiet);
    // the list the item is in now (it may have been moved since its grip was prepared)
    var item=grip,inst=null,ok;
    while(item&&!(inst=listOf.get(item.parentElement)))item=item.parentElement;
    if(!item||!inst.element.isConnected)return!1;
    moving++;
    try{ok=inst.keyStart(item)}
    catch(err){
        // a callback threw: nothing stays picked up (as with the pointer), and the error goes on
        try{inst.keyCancel()}catch(again){if(window.console)console.error(again)}
        throw err;
    }finally{moving--}
    if(!ok)return!1;
    grab={type:"sortable",inst:inst,item:item,grip:grip,model:modelOf(item),name:nameOf(item),
        toolbar:item.matches(".add-block-btn"),collection:item.matches(".collection-item")};
    item.classList.add("exp-kbd-grabbed");
    grip.setAttribute("aria-pressed","true");
    if(grab.toolbar){
        var first=targets().filter(function(x){return x.ok})[0];
        if(!first){
            var name=grab.name;
            cancel(!0);
            say(T("No zone accepts %name.",{"%name":name}));
            return!1;
        }
        if(!moveTo(first.list,0))return!1;
    }
    focusGrip(grip);
    if(!quiet){
        var w=where();
        say(grab.collection?T("Picked up %name. Position %position of %count. Use the arrow keys to move, Space to drop, Escape to cancel.",{"%name":grab.name,"%position":w.index+1,"%count":w.count})
            :T("Picked up %name. Zone %zone, position %position of %count. Use the arrow keys to move, Space to drop, Escape to cancel.",{"%name":grab.name,"%zone":zoneLabel(w.list),"%position":w.index+1,"%count":w.count}));
    }
    return!0;
}

function beginDraggable(grip,info,quiet){
    var inst=info.inst,item=inst.element.closest(".collection-item"),ok;
    if(!item)return!1;
    try{ok=inst.keyStart()}
    catch(err){
        try{inst.keyDrop(null)}catch(again){if(window.console)console.error(again)}
        throw err;
    }
    if(!ok)return!1;
    var slots=inst.keyTargets(),at=Math.max(0,slots.indexOf(item));
    grab={type:"draggable",inst:inst,item:item,grip:grip,model:modelOf(item),name:nameOf(item),collection:!0,slots:slots,at:at};
    item.classList.add("exp-kbd-grabbed");
    grip.setAttribute("aria-pressed","true");
    inst.keyOver(slots[at]);
    if(!quiet)say(T("Picked up %name. Position %position of %count. Use the arrow keys to move, Space to drop, Escape to cancel.",{"%name":grab.name,"%position":at+1,"%count":slots.length}));
    return!0;
}

function stepDraggable(action){
    var g=grab,last=g.slots.length-1;
    g.at=Math.max(0,Math.min(last,{up:g.at-1,down:g.at+1,first:0,last:last}[action]));
    g.inst.keyOver(g.slots[g.at]);
    focusGrip(g.grip);
    reveal(g.slots[g.at]);
    say(T("Position %position of %count.",{"%position":g.at+1,"%count":g.slots.length}));
}

function endGrab(){
    var g=grab;
    grab=null;
    if(g){
        g.item.classList.remove("exp-kbd-grabbed");
        g.grip.removeAttribute("aria-pressed");
    }
    return g;
}

/** The grip to focus for `el` (a block, a collection item) as it is now. */
function gripFor(el){
    var g=el&&(el.matches(".collection-item")?el.querySelector(".handle"):sortableGrip(el));
    if(g&&g.tagName!=="BUTTON"&&!g.hasAttribute("tabindex"))g.tabIndex=0;
    return g;
}

/**
 * After a drop: the grip of what was moved keeps the focus, also when the editor draws it again (the element found
 * again by `find`), for a few seconds, and only until the user goes elsewhere: a press or a key outside the grip, or
 * the focus on anything else, ends it.
 */
var stopKeeping=null;
function keepFocus(el,find){
    if(stopKeeping)stopKeeping();
    var obs=null,timer=0,grip=null;
    function lost(){var a=document.activeElement;return!a||a===document.body||!a.isConnected}
    function now(){
        if(!el||!el.isConnected)el=find();
        var g=gripFor(el);
        if(g)grip=g;
        if(g&&g.isConnected&&document.activeElement!==g){focusGrip(g);reveal(el)}
    }
    function elsewhere(ev){
        var t=ev.target;
        if(!(t&&t.nodeType===1&&grip&&grip.contains(t)))stop();
    }
    function stop(){
        if(stopKeeping!==stop)return;
        stopKeeping=null;
        if(obs)obs.disconnect();
        clearTimeout(timer);
        document.removeEventListener("pointerdown",elsewhere,!0);
        document.removeEventListener("keydown",elsewhere,!0);
        document.removeEventListener("focusin",elsewhere,!0);
    }
    now();
    if(typeof MutationObserver!="function")return;
    stopKeeping=stop;
    obs=new MutationObserver(function(){if(lost())now()});
    obs.observe(document.body,{childList:!0,subtree:!0});
    timer=setTimeout(stop,5000);
    document.addEventListener("pointerdown",elsewhere,!0);
    document.addEventListener("keydown",elsewhere,!0);
    document.addEventListener("focusin",elsewhere,!0);
}

function finder(model,selector){
    return function(){
        if(!model)return null;
        return Array.prototype.find.call(document.querySelectorAll(selector),function(el){
            var m=modelOf(el);
            return m&&(m===model||model.id!=null&&m.id===model.id);
        })||null;
    };
}

function drop(){
    if(!grab)return;
    if(grab.type==="draggable"){
        var d=endGrab(),to=d.at;
        moving++;
        try{d.inst.keyDrop(d.slots[to])}finally{moving--}
        say(T("Dropped %name at position %position.",{"%name":d.name,"%position":to+1}));
        keepFocus(d.item,finder(d.model,".collection-item"));
        return;
    }
    var w=where(),zone=zoneLabel(w.list),g=endGrab();
    moving++;
    try{g.inst.keyDrop()}finally{moving--}
    // a block type is replaced by the new block where it was dropped
    var el=g.item.isConnected?g.item:w.list._items()[w.index]||null,model=el&&modelOf(el)||g.model;
    say(g.collection?T("Dropped %name at position %position.",{"%name":g.name,"%position":w.index+1})
        :T("Dropped %name in zone %zone at position %position.",{"%name":g.name,"%zone":zone,"%position":w.index+1}));
    keepFocus(el,finder(model,g.collection?".collection-item":"[data-block]"));
}

/** Puts it back; `stay`: the focus stays where it went (the grip was left). */
function cancel(stay){
    var g=endGrab();
    if(!g)return;
    moving++;
    try{
        if(g.type==="draggable")g.inst.keyDrop(null);
        else g.inst.keyCancel();
    }finally{moving--}
    say(T("Move cancelled."));
    if(stay)return;
    if(g.toolbar){
        // the toolbar closed when the block type was picked up: back to its button
        var b=document.querySelector('.js-open[data-target="blocks"]');
        if(b)b.focus();
    }else focusGrip(g.grip);
}

/* ---- keys ---- */

/**
 * What a key on a grip does (admin4's keyAction): not picked up, 'pickup' (Space, Enter), 'stepUp' / 'stepDown'
 * (Alt+Up, Alt+Down); picked up, 'up', 'down', 'first' (Home), 'last' (End), 'drop' (Space, Enter), 'cancel'
 * (Escape). null for any other key.
 */
function keyAction(grabbed,ev){
    var k=ev.key,plain=!ev.ctrlKey&&!ev.metaKey&&!ev.altKey&&!ev.shiftKey;
    if(!grabbed){
        if(ev.altKey&&!ev.ctrlKey&&!ev.metaKey&&(k==="ArrowUp"||k==="ArrowDown"))return k==="ArrowUp"?"stepUp":"stepDown";
        return plain&&(k===" "||k==="Spacebar"||k==="Enter")?"pickup":null;
    }
    if(k==="Escape"||k==="Esc")return"cancel";
    if(!plain)return null;
    return{ArrowUp:"up",ArrowDown:"down",Home:"first",End:"last"," ":"drop",Spacebar:"drop",Enter:"drop"}[k]||null;
}

function onKey(ev){
    var grip=ev.target,info=grip&&infos.get(grip);
    if(!info)return;
    var action=keyAction(!!grab&&grab.grip===grip,ev);
    if(!action)return;
    ev.preventDefault();
    ev.stopPropagation();
    if(ev.repeat&&(action==="pickup"||action==="drop"))return;
    if(action==="pickup"){
        if(grab)cancel(!0);
        begin(grip,info,!1);
    }else if(action==="stepUp"||action==="stepDown"){
        if(grab)cancel(!0);
        var dir=action==="stepUp"?"up":"down";
        if(!begin(grip,info,!0))return;
        if(grab.toolbar)return cancel(!0);
        if(grab.type==="draggable")stepDraggable(dir);
        else if(!step(dir))return;
        drop();
    }else if(action==="drop")drop();
    else if(action==="cancel")cancel(!1);
    else if(grab.type==="draggable")stepDraggable(action);
    else step(action);
}

// leaving the grip of what is picked up (Tab, a click elsewhere) cancels the move; not the moves made here
function onFocusOut(ev){
    if(!grab||moving||ev.target!==grab.grip||ev.relatedTarget===grab.grip)return;
    cancel(!0);
}

function onPointerDown(ev){
    if(grab&&!grab.grip.contains(ev.target))cancel(!0);
}

document.addEventListener("keydown",onKey,!0);
document.addEventListener("focusout",onFocusOut,!0);
document.addEventListener("pointerdown",onPointerDown,!0);

t.exports={sortable:sortable,draggable:draggable,keyAction:keyAction};
}
