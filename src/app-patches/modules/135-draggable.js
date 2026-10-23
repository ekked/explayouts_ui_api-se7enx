function(e,t,n){
/**
 * Drag and drop of the layout editor, part 3: draggables and droppables, in place of jQuery UI's draggable and
 * droppable (1.14). Plain DOM, no jQuery; the gesture is ./mouse (module 137). jquery-ui/droppable (module 136) hands
 * out droppable() from here. The caller is ./bm_collection_items (require(135)): manual items of a dynamic collection
 * dragged onto another slot.
 *
 *   draggable( elements, options )  options appendTo, axis, cancel, delay, distance, handle, helper ("clone" or
 *                                   "original"), scroll, zIndex; callbacks start,
 *                                   drag, stop as ( event, ui ) with the draggable element as this
 *   droppable( elements, options )  options accept (a selector or a function), activeClass, hoverClass, tolerance
 *                                   ("intersect", "pointer", "fit", "touch"); callbacks activate, over, out, drop,
 *                                   deactivate as ( event, ui ) with the droppable as this and event.target
 *
 * ui = { helper, position, originalPosition, offset } for a draggable, { draggable, helper, position, offset } for a
 * droppable: elements, not jQuery objects. A start or drag callback returning false ends the drag, as in jQuery UI.
 *
 * As jQuery UI with its compatibility options: activeClass goes on every droppable that accepts the drag while it
 * lasts, hoverClass on the one the helper is over (jQuery UI 1.14 drops both unless $.uiBackCompat is true; the
 * editor's styles of a collection being sorted rely on them, as they did with the 1.10 the editor was built with).
 * Geometry is read when needed, not cached. Escape or a cancelled pointer ends a drag without a drop.
 *
 * Keyboard moves (module 139, ./widget, told about each draggable when its grips are marked): a draggable's
 * keyStart(), keyTargets(), keyOver( droppable element ) and keyDrop( droppable element or null ) run a drag without a
 * pointer through the same callbacks (start, activate, drop on the droppable chosen, deactivate, stop), so a move by
 * keyboard is saved exactly as one by pointer. The droppable chosen gets the hover classes without over/out (the
 * caller's over callback previews the new order by hiding items, the focused one among them).
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
"use strict";
var m=e("./mouse"),kbd=e("./widget"),draggables=new WeakMap,droppables=new WeakMap,drops=[],current=null;

function addClasses(el,c){if(c)c.split(/\s+/).forEach(function(x){x&&el.classList.add(x)})}
function removeClasses(el,c){if(c)c.split(/\s+/).forEach(function(x){x&&el.classList.remove(x)})}

/* ---- droppables ---- */

function Droppable(el,options){
    this.element=el;
    this.options=Object.assign({accept:"*",activeClass:!1,hoverClass:!1,tolerance:"intersect",disabled:!1},options);
    this.isover=!1;
    droppables.set(el,this);
    drops.push(this);
    el.classList.add("ui-droppable");
}
var D=Droppable.prototype;

D.accepts=function(el){
    var a=this.options.accept;
    return typeof a=="function"?!!a.call(this.element,el):el.matches(a);
};
D._trigger=function(name,original,drag){
    var cb=this.options[name],ev=m.uiEvent("drop"+(name==="drop"?"":name),this.element,original);
    if(typeof cb=="function")cb.call(this.element,ev,{draggable:drag.element,helper:drag.helper,position:drag.position,offset:drag.positionAbs});
};
D._activate=function(ev,drag){
    this.element.classList.add("ui-droppable-active");addClasses(this.element,this.options.activeClass);
    this._trigger("activate",ev,drag);
};
D._deactivate=function(ev,drag){
    this.element.classList.remove("ui-droppable-active");removeClasses(this.element,this.options.activeClass);
    this._trigger("deactivate",ev,drag);
};
D._over=function(ev,drag){
    if(drag.element===this.element||!this.accepts(drag.element))return;
    this.element.classList.add("ui-droppable-hover");addClasses(this.element,this.options.hoverClass);
    this._trigger("over",ev,drag);
};
D._out=function(ev,drag){
    if(drag.element===this.element||!this.accepts(drag.element))return;
    this.element.classList.remove("ui-droppable-hover");removeClasses(this.element,this.options.hoverClass);
    this._trigger("out",ev,drag);
};
D._drop=function(ev,drag){
    if(drag.element===this.element||!this.accepts(drag.element))return!1;
    this.element.classList.remove("ui-droppable-active","ui-droppable-hover");
    removeClasses(this.element,this.options.activeClass);removeClasses(this.element,this.options.hoverClass);
    this._trigger("drop",ev,drag);
    return!0;
};

/**
 * jQuery UI's $.ui.intersect: the helper (its border box) against the droppable, by tolerance. Against where the
 * droppable was when the drag started (or the page last scrolled), as jQuery UI did: the callers move items around
 * while the helper is over them (a preview of the new order), and that must not move the target under the pointer.
 */
D.measure=function(){this.rect=m.box(this.element)};
D.intersects=function(drag,ev){
    var r=this.rect||m.box(this.element),x1=drag.positionAbs.left+drag.margins.left,y1=drag.positionAbs.top+drag.margins.top,
        w=drag.size.width,h=drag.size.height,x2=x1+w,y2=y1+h;
    switch(this.options.tolerance){
    case"fit":return r.left<=x1&&x2<=r.right&&r.top<=y1&&y2<=r.bottom;
    case"intersect":return r.left<x1+w/2&&x2-w/2<r.right&&r.top<y1+h/2&&y2-h/2<r.bottom;
    case"pointer":return ev.clientY>=r.top&&ev.clientY<r.bottom&&ev.clientX>=r.left&&ev.clientX<r.right;
    case"touch":return(y1>=r.top&&y1<=r.bottom||y2>=r.top&&y2<=r.bottom||y1<r.top&&y2>r.bottom)&&
        (x1>=r.left&&x1<=r.right||x2>=r.left&&x2<=r.right||x1<r.left&&x2>r.right);
    }
    return!1;
};

/** The droppables in play for a drag: connected, enabled, accepting it, shown, not the dragged element or inside it. */
function inPlay(drag){
    // Droppables whose element left the page are forgotten (jQuery UI destroyed them when jQuery removed it).
    drops=drops.filter(function(d){
        if(d.element.isConnected)return!0;
        droppables.delete(d.element);
        return!1;
    });
    return drops.filter(function(d){
        return!d.options.disabled&&d.element.isConnected&&!drag.element.contains(d.element)&&d.accepts(drag.element)&&m.isVisible(d.element);
    });
}

/* ---- draggables ---- */

function Draggable(el,options){
    this.element=el;
    this.options=Object.assign({appendTo:"parent",axis:!1,cancel:m.CANCEL,delay:0,distance:1,handle:!1,helper:"original",
        scroll:!0,zIndex:!1,disabled:!1},options);
    draggables.set(el,this);
    el.classList.add("ui-draggable");
    m.bind(el,this);
    this._markHandles();
    // a handle drawn again inside the draggable is marked again (touch-action: none, the keyboard grip)
    if(typeof MutationObserver=="function"){
        var self=this,queued=!1;
        new MutationObserver(function(records){
            if(queued||!records.some(function(r){return Array.prototype.some.call(r.addedNodes,function(n){return n.nodeType===1})}))return;
            queued=!0;
            Promise.resolve().then(function(){queued=!1;if(el.isConnected)self._markHandles()});
        }).observe(el,{childList:!0,subtree:!0});
    }
}
var G=Draggable.prototype;

G._markHandles=function(){
    var h=this.options.handle;
    (h?Array.prototype.slice.call(this.element.querySelectorAll(h)):[this.element]).forEach(function(g){g.classList.add("ui-draggable-handle")});
    if(kbd.draggable)kbd.draggable(this);
};

G._trigger=function(name,original){
    var cb=this.options[name],ev=m.uiEvent("drag"+(name==="drag"?"":name),this.element,original);
    if(typeof cb!="function")return!0;
    return!(cb.call(this.element,ev,{helper:this.helper,position:this.position,originalPosition:this.originalPosition,offset:this.positionAbs})===!1||ev.isDefaultPrevented());
};

G._capture=function(ev){
    if(this.helper||this.options.disabled)return!1;
    var h=this.options.handle;
    if(h){
        var g=ev.target.closest(h);
        if(!g||!this.element.contains(g))return!1;
    }
    // As jQuery UI: a press elsewhere takes the focus away from a field being edited.
    var a=document.activeElement;
    if(a&&a!==document.body&&!a.contains(ev.target)&&typeof a.blur=="function")a.blur();
    return!0;
};

G._start=function(down,ev){
    var o=this.options,el=this.element,s=getComputedStyle(el),r=m.box(el),helper;
    helper=o.helper==="clone"?el.cloneNode(!0):el;
    if(helper!==el)helper.removeAttribute("id");
    if(!helper.isConnected)(o.appendTo==="parent"?el.parentNode:m.element(o.appendTo,el)).appendChild(helper);
    if(helper!==el&&!/fixed|absolute/.test(getComputedStyle(helper).position))helper.style.position="absolute";
    this.helper=helper;
    helper.classList.add("ui-draggable-dragging");
    current=this;
    this.margins={left:m.px(s,"marginLeft"),top:m.px(s,"marginTop")};
    this.click={x:down.clientX-(r.left-this.margins.left),y:down.clientY-(r.top-this.margins.top)};
    var hr=m.box(helper);
    this.size={width:hr.width||r.width,height:hr.height||r.height};
    this.scrollParent=m.scrollParent(helper,!0);
    this.originalPointer={x:down.clientX,y:down.clientY};
    this.position=this.originalPosition=this._position(down);
    this.positionAbs=this.position;
    if(o.zIndex)helper.style.zIndex=o.zIndex;
    if(!this._trigger("start",down)){this._clear();return!1}
    this.active=inPlay(this);
    this.active.forEach(function(d){d.isover=!1;d._activate(down,this);d.measure()},this);
    this._move(down,!0);
    return!0;
};

/** The helper's margin box in client coordinates (axis "y" keeps the column it started in, "x" the row). */
G._position=function(ev){
    var a=this.options.axis,x=a==="y"?this.originalPointer.x:ev.clientX,y=a==="x"?this.originalPointer.y:ev.clientY;
    return{left:x-this.click.x,top:y-this.click.y};
};

G._drag=function(ev){this._move(ev,!1)};

/** What ./mouse scrolls near its edges: the helper's scroll parent (null: the window). */
G._scroller=function(){return this.helper?this.scrollParent:void 0};

/** ./mouse scrolled: the droppables are where they are now (jQuery UI's ddmanager on scroll). */
G._scrolled=function(){(this.active||[]).forEach(function(d){d.measure()})};

G._move=function(ev,silent){
    if(!this.helper)return;
    this.position=this.positionAbs=this._position(ev);
    if(!silent&&!this._trigger("drag",ev)){m.release(this);this._stop(ev,!1);return}
    m.place(this.helper,this.position.left,this.position.top,null);
    // jQuery UI's ddmanager.drag: over / out as the helper comes and goes.
    (this.active||[]).forEach(function(d){
        var hit=d.intersects(this,ev);
        if(hit&&!d.isover){d.isover=!0;d._over(ev,this)}
        else if(!hit&&d.isover){d.isover=!1;d._out(ev,this)}
    },this);
};

G._stop=function(ev,cancelled){
    if(!this.helper)return;
    var active=this.active||[],keep=!1;
    this.active=null;
    try{
        active.forEach(function(d){
            if(!cancelled&&m.isVisible(d.element)&&d.intersects(this,ev))d._drop(ev,this);
            else if(d.isover){d.element.classList.remove("ui-droppable-hover");removeClasses(d.element,d.options.hoverClass)}
            d.isover=!1;
            d.rect=null;
            d._deactivate(ev,this);
        },this);
        keep=!this._trigger("stop",ev);
    }finally{
        // also when a callback threw: no droppable stays marked, and the next drag can start
        active.forEach(function(d){
            d.element.classList.remove("ui-droppable-active","ui-droppable-hover");
            removeClasses(d.element,d.options.activeClass);removeClasses(d.element,d.options.hoverClass);
            d.isover=!1;
            d.rect=null;
        });
        if(!keep)this._clear();
    }
};

G._clear=function(){
    var h=this.helper;
    if(h){
        h.classList.remove("ui-draggable-dragging");
        if(h!==this.element&&h.parentNode)h.parentNode.removeChild(h);
    }
    this.helper=null;
    if(current===this)current=null;
};

/* ---- keyboard (module 139) ---- */

/** Picks the draggable up: start, then activate on the droppables in play. False if refused. */
G.keyStart=function(){
    if(this.helper||this.options.disabled||m.pressed())return!1;
    var o=this.options,el=this.element,helper=o.helper==="clone"?el.cloneNode(!0):el;
    if(helper!==el){
        helper.removeAttribute("id");
        helper.style.display="none";
        if(!helper.isConnected)(o.appendTo==="parent"?el.parentNode:m.element(o.appendTo,el)).appendChild(helper);
    }
    this.helper=helper;
    helper.classList.add("ui-draggable-dragging");
    current=this;
    this.keyboard=!0;
    this.position=this.originalPosition=this.positionAbs={left:0,top:0};
    if(o.zIndex&&helper!==el)helper.style.zIndex=o.zIndex;
    if(!this._trigger("start",null)){this._clear();return!1}
    this.active=inPlay(this);
    this.active.forEach(function(d){d.isover=!1;d._activate(null,this)},this);
    return!0;
};

/** The elements of the droppables in play, in document order. */
G.keyTargets=function(){
    return(this.active||[]).map(function(d){return d.element}).sort(function(a,b){return a.compareDocumentPosition(b)&4?-1:1});
};

/** Shows `target` (a droppable element in play) as the one the item would be dropped on. */
G.keyOver=function(target){
    (this.active||[]).forEach(function(d){
        var on=d.element===target;
        d.element.classList.toggle("ui-droppable-hover",on);
        (on?addClasses:removeClasses)(d.element,d.options.hoverClass);
    });
};

/** Drops on `target` (null: nowhere, as Escape), then deactivate and stop. */
G.keyDrop=function(target){
    if(!this.helper||!this.keyboard)return;
    var active=this.active||[];
    this.active=null;
    this.keyboard=!1;
    active.forEach(function(d){
        if(target&&d.element===target)d._drop(null,this);
        else{d.element.classList.remove("ui-droppable-hover");removeClasses(d.element,d.options.hoverClass)}
        d.isover=!1;
        d.rect=null;
        d._deactivate(null,this);
    },this);
    if(this._trigger("stop",null))this._clear();
};

function make(Type,map){
    return function(targets,options){
        return m.elements(targets).map(function(el){
            var inst=map.get(el);
            if(inst){Object.assign(inst.options,options||{});inst._markHandles&&inst._markHandles();return inst}
            return new Type(el,options);
        });
    };
}

t.exports={draggable:make(Draggable,draggables),droppable:make(Droppable,droppables),
    current:function(){return current}};
}
