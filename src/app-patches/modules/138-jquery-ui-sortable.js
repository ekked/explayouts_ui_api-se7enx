function(e,t,n){
/**
 * Drag and drop of the layout editor, part 2: sortable lists, in place of jQuery UI's sortable (1.14). Plain DOM, no
 * jQuery; the gesture is ./mouse (module 137). Callers reach it as require(138) (./dnd: blocks in and between zones,
 * the block types of the toolbar, the trash; ./bm_collection_items: the items of a manual collection).
 *
 *   sortable( elements, options )  makes each element (Element | NodeList | array | jQuery-like) a sortable list, or
 *                                  sets the options of one that is; returns the instances
 *   cancel( element )              puts the item last dragged out of `element`'s list back where it was, also after
 *                                  the drag (a receive callback refusing it, the trash's dialog cancelled)
 *   instance( element )            the instance of a list, or undefined
 *
 * Keyboard moves (module 139, ./widget, which this module tells about each list it marks the grips of): an instance's
 * keyStart( item ), keyMove( list, index ), keyDrop() and keyCancel() run a drag without a pointer through the same
 * callbacks in the same order, so a move by keyboard is saved exactly as one by pointer. The item itself travels
 * (it keeps the focus of its grip), the placeholder stays hidden right behind it, the helper is made (the callers
 * rely on it) but not shown.
 *
 * What jQuery UI's sortable did and the editor uses is kept, down to the order of the callbacks: options appendTo,
 * axis, connectWith (a selector, resolved when a drag starts), delay, distance, cancel, handle, helper ("clone" or a
 * function ( event, item ) returning the element to carry), items ("> *"), placeholder (a class name; without one a
 * hidden copy of the item's tag and classes with its size), scroll, tolerance
 * ("pointer" or "intersect"), zIndex, dropOnEmpty; callbacks start, activate, over, out, change, sort, beforeStop,
 * update, remove, receive, deactivate, stop, called with the list element as this and ( event, ui ), event.target
 * being that element. A callback returning false or calling event.preventDefault() cancels, as in jQuery UI.
 *
 * ui = { item, helper, placeholder, sender, drag }: elements, not jQuery objects (sender is the list the item came
 * from, set as jQuery UI set it); drag is one object per drag, the same in every callback of it, for the callers'
 * own notes.
 *
 * Differences, on purpose: geometry is read when needed instead of cached at the start (no refreshPositions needed,
 * nothing goes stale when a list scrolls); scrollParent (an element) replaces the editor's former patch
 * customScrollParent: that element is scrolled near its edges instead of the placeholder's scroll parent, and it
 * scrolls as long as the pointer stays near the edge (./mouse), not once per move by 20px; Escape or
 * a cancelled pointer ends a drag with everything put back, no update/remove/receive, then out, deactivate and stop.
 * Whether items lie side by side is judged by the dragged item.
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
"use strict";
var m=e("./mouse"),kbd=e("./widget"),instances=new WeakMap;

var DEFAULTS={appendTo:"parent",axis:!1,connectWith:!1,delay:0,distance:1,cancel:m.CANCEL,handle:!1,helper:"clone",
    items:"> *",placeholder:!1,scroll:!0,scrollParent:null,tolerance:"intersect",
    zIndex:1e3,dropOnEmpty:!0,disabled:!1};

function Sortable(el,options){
    this.element=el;
    this.options=Object.assign({},DEFAULTS,options);
    this.over=!1;
    this.dragging=!1;
    this.last=null;
    instances.set(el,this);
    el.classList.add("ui-sortable");
    m.bind(el,this);
    this._markHandles();
    // Items added, and items drawn again (a block's header, a collection item's handle are new elements then): their
    // grips are marked again, once per batch of changes, so that touch-action: none and the keyboard grip stay.
    if(typeof MutationObserver=="function"){
        var self=this,queued=!1;
        new MutationObserver(function(records){
            if(queued||!records.some(function(r){return Array.prototype.some.call(r.addedNodes,function(n){return n.nodeType===1})}))return;
            queued=!0;
            Promise.resolve().then(function(){queued=!1;if(el.isConnected)self._markHandles()});
        }).observe(el,{childList:!0,subtree:!0});
    }
}

var S=Sortable.prototype;

/** The list's items: children (items "> *" / "> selector") or descendants matching items; never helper or placeholder. */
S._items=function(){
    var sel=this.options.items,el=this.element,list;
    if(/^\s*>/.test(sel)){
        sel=sel.replace(/^\s*>\s*/,"");
        list=Array.prototype.filter.call(el.children,function(c){return c.matches(sel)});
    }else list=Array.prototype.slice.call(el.querySelectorAll(sel));
    return list.filter(function(c){return!c.classList.contains("ui-sortable-helper")&&!c.classList.contains("ui-sortable-placeholder")});
};

/** Marks the grips (handle, or the whole item) as jQuery UI did; touch-action: none hangs on the class. */
S._markHandles=function(){
    var h=this.options.handle;
    this._items().forEach(function(item){
        (h?Array.prototype.slice.call(item.querySelectorAll(h)):[item]).forEach(function(g){g.classList.add("ui-sortable-handle")});
    });
    if(kbd.sortable)kbd.sortable(this);
};

S._trigger=function(name,original,ui){
    var cb=this.options[name],ev=m.uiEvent("sort"+name,this.element,original);
    if(typeof cb=="function"&&(cb.call(this.element,ev,ui)===!1||ev.isDefaultPrevented()))this.cancel();
};

S._ui=function(sender){
    var d=this.drag||{};
    return{item:d.item||null,helper:d.helper||null,placeholder:d.placeholder||null,sender:sender?sender.element:null,
        drag:d.notes||null};
};

S._capture=function(ev){
    if(this.dragging||this.options.disabled)return!1;
    var items=this._items(),item=null;
    for(var n=ev.target;n&&n!==this.element;n=n.parentElement)if(items.indexOf(n)>=0){item=n;break}
    if(!item)return!1;
    if(this.options.handle){
        var h=ev.target.closest(this.options.handle);
        if(!h||h===item||!item.contains(h))return!1;
    }
    this.captured=item;
    return!0;
};

/** The lists of this drag: this one first, then those of connectWith (jQuery UI's order). */
S._containers=function(){
    var list=[this],cw=this.options.connectWith;
    if(cw)(Array.isArray(cw)?cw:[cw]).slice().reverse().forEach(function(sel){
        m.elements(sel).reverse().forEach(function(el){
            var inst=instances.get(el);
            if(inst&&inst!==this&&!inst.options.disabled&&list.indexOf(inst)<0)list.push(inst);
        },this);
    },this);
    return list;
};

S._start=function(down,ev){
    var o=this.options,item=this.captured,r=m.box(item),s=getComputedStyle(item),d;
    d=this.drag={item:item,notes:{},floating:o.axis==="x"||m.isFloating(item)};
    this.currentContainer=this;
    this.containers=this._containers();
    var appendTo=o.appendTo==="parent"?item.parentNode:m.element(o.appendTo,item);
    var helper=typeof o.helper=="function"?m.elements(o.helper.call(this.element,m.uiEvent("sortstart",this.element,down),item))[0]:item.cloneNode(!0);
    if(!helper.isConnected)appendTo.appendChild(helper);
    d.helper=helper;
    // jQuery UI gave the helper the item's content size unless it had one of its own.
    var hs=getComputedStyle(helper),border=hs.boxSizing==="border-box";
    if(!helper.style.width)helper.style.width=(border?r.width:r.width-m.px(s,"paddingLeft")-m.px(s,"paddingRight")-m.px(s,"borderLeftWidth")-m.px(s,"borderRightWidth"))+"px";
    if(!helper.style.height)helper.style.height=(border?r.height:r.height-m.px(s,"paddingTop")-m.px(s,"paddingBottom")-m.px(s,"borderTopWidth")-m.px(s,"borderBottomWidth"))+"px";
    d.size={width:r.width,height:r.height};
    // Where the pointer took the item, from the item's margin edge.
    d.click={x:down.clientX-(r.left-m.px(s,"marginLeft")),y:down.clientY-(r.top-m.px(s,"marginTop"))};
    helper.style.position="absolute";
    d.prev=item.previousElementSibling;
    d.parent=item.parentNode;
    d.display=item.style.display;
    item.style.display="none";
    d.placeholder=this._placeholder(item,r,s);
    item.parentNode.insertBefore(d.placeholder,item.nextSibling);
    if(this._sizePlaceholder)this._sizePlaceholder();
    d.scrollParent=o.scrollParent?m.element(o.scrollParent):m.scrollParent(d.placeholder);
    if(o.zIndex)helper.style.zIndex=o.zIndex;
    this.last={item:item,prev:d.prev,parent:d.parent,placeholder:d.placeholder};
    this.dragging=!0;
    this._trigger("start",down,this._ui());
    for(var i=this.containers.length-1;i>=0&&this.drag;i--)this.containers[i]._trigger("activate",down,this._ui(this));
    if(!this.drag)return!1;   // cancelled in start or activate
    helper.classList.add("ui-sortable-helper");
    if(helper.parentNode!==appendTo)appendTo.appendChild(helper);
    d.pos=d.lastPos={left:down.clientX-d.click.x,top:down.clientY-d.click.y};
    this._drag(down);
    return!0;
};

S._placeholder=function(item,r,s){
    var cls=this.options.placeholder,p=document.createElement(item.nodeName.toLowerCase());
    p.className=(cls||item.className)+" ui-sortable-placeholder";
    p.classList.remove("ui-sortable-helper");
    if(!cls){
        p.style.visibility="hidden";
        // Sized as the item, unless the class gives it a size of its own (jQuery UI's placeholder.update).
        this._sizePlaceholder=function(){
            var pr=m.box(p),ps=getComputedStyle(p);
            if(!(pr.height-m.px(ps,"paddingTop")-m.px(ps,"paddingBottom")-m.px(ps,"borderTopWidth")-m.px(ps,"borderBottomWidth")))
                p.style.height=(r.height-m.px(s,"paddingTop")-m.px(s,"paddingBottom")-m.px(s,"borderTopWidth")-m.px(s,"borderBottomWidth"))+"px";
            if(!(pr.width-m.px(ps,"paddingLeft")-m.px(ps,"paddingRight")-m.px(ps,"borderLeftWidth")-m.px(ps,"borderRightWidth")))
                p.style.width=(r.width-m.px(s,"paddingLeft")-m.px(s,"paddingRight")-m.px(s,"borderLeftWidth")-m.px(s,"borderRightWidth"))+"px";
        };
    }else this._sizePlaceholder=null;
    return p;
};

/** What ./mouse scrolls near its edges: scrollParent, else the placeholder's scroll parent (null: the window). */
S._scroller=function(){return this.drag?this.drag.scrollParent:void 0};

/** Where the pointer is now, as jQuery UI's positionAbs + click offset (the helper's margin box + where it was taken). */
S._pointer=function(){var d=this.drag;return{x:d.pos.left+d.click.x,y:d.pos.top+d.click.y}};

/**
 * The pointer moved to `ev` (clientX, clientY), or ./mouse scrolled by `scrolled` px (down > 0) with the pointer
 * held still: the content moved under it, which is a move of the pointer the other way.
 */
S._drag=function(ev,scrolled){
    var o=this.options,d=this.drag;
    if(!d)return;
    d.pos={left:ev.clientX-d.click.x,top:ev.clientY-d.click.y};
    m.place(d.helper,d.pos.left,d.pos.top,o.axis);
    var dy=d.pos.top-d.lastPos.top||scrolled||0,dx=d.pos.left-d.lastPos.left;
    d.vertical=dy!==0&&(dy>0?"down":"up");
    d.horizontal=dx!==0&&(dx>0?"right":"left");
    // Rearrange within the list the placeholder is in (jQuery UI's _mouseDrag).
    var items=this.currentContainer._items(),p=d.placeholder;
    for(var i=items.length-1;i>=0;i--){
        var it=items[i],hit=this._overItem(it);
        if(!hit||it===d.item)continue;
        if((hit===1?p.nextElementSibling:p.previousElementSibling)===it||p.contains(it))continue;
        d.direction=hit===1?"down":"up";
        if(o.tolerance==="pointer"||this._overSide(it)){
            this._rearrange(it,null);
            this._trigger("change",ev,this._ui());
        }
        break;
    }
    if(this.drag)this._contactContainers(ev);
    if(this.drag){this._trigger("sort",ev,this._ui());d.lastPos=d.pos}
};

/** 0: not over the item; 1 or 2 by the direction of the drag (jQuery UI's _intersectsWithPointer). */
S._overItem=function(it){
    var d=this.drag,a=this.options.axis,p=this._pointer(),r=m.box(it);
    var over=(a==="x"||p.y>=r.top&&p.y<r.top+r.height)&&(a==="y"||p.x>=r.left&&p.x<r.left+r.width);
    if(!over)return 0;
    if(d.floating)return d.horizontal==="right"||d.vertical==="down"?2:1;
    return d.vertical?d.vertical==="down"?2:1:0;
};

/** Over the half of the item the drag is heading for (jQuery UI's _intersectsWithSides). */
S._overSide=function(it){
    var d=this.drag,p=this._pointer(),r=m.box(it),
        bottom=p.y>=r.top+r.height/2&&p.y<r.top+r.height*1.5,
        right=p.x>=r.left+r.width/2&&p.x<r.left+r.width*1.5;
    if(d.floating&&d.horizontal)return d.horizontal==="right"&&right||d.horizontal==="left"&&!right;
    return!!d.vertical&&(d.vertical==="down"&&bottom||d.vertical==="up"&&!bottom);
};

/** Over a list (jQuery UI's _intersectsWith): the pointer, or with tolerance "intersect" the helper's centre. */
S._overList=function(inst){
    var d=this.drag,a=this.options.axis,p=this._pointer(),r=m.box(inst.element);
    if(!r.width&&!r.height)return!1;
    var key=d.floating?"width":"height",
        over=(a==="x"||p.y>r.top&&p.y<r.bottom)&&(a==="y"||p.x>r.left&&p.x<r.right);
    if(this.options.tolerance==="pointer"||d.size[key]>r[key])return over;
    var cx=d.pos.left+d.size.width/2,cy=d.pos.top+d.size.height/2;
    return r.left<cx&&cx<r.right&&r.top<cy&&cy<r.bottom;
};

S._rearrange=function(it,into){
    var p=this.drag.placeholder;
    if(into)into.appendChild(p);
    else it.parentNode.insertBefore(p,this.drag.direction==="down"?it:it.nextSibling);
};

/** Moving into another list (jQuery UI's _contactContainers). */
S._contactContainers=function(ev){
    var d=this.drag,cs=this.containers,inner=null,i;
    for(i=cs.length-1;i>=0;i--){
        if(d.item.contains(cs[i].element))continue;
        if(this._overList(cs[i])){
            if(inner&&cs[i].element.contains(inner.element))continue;
            inner=cs[i];
        }else if(cs[i].over){
            cs[i].over=!1;
            cs[i]._trigger("out",ev,this._ui(this));
            if(!this.drag)return;
        }
    }
    if(!inner)return;
    if(cs.length===1){
        if(!inner.over){inner.over=!0;inner._trigger("over",ev,this._ui(this))}
        return;
    }
    // Entering a list: next to its nearest item, or at its end when it has none.
    var floating=inner.floating||d.floating,pos=floating?"left":"top",size=floating?"width":"height",
        at=floating?ev.clientX:ev.clientY,dist=1e4,nearest=null,all=[];
    cs.forEach(function(c){all=all.concat(c._items())});
    all.forEach(function(it){
        if(it===d.item||!inner.element.contains(it))return;
        var r=m.box(it),cur=r[pos];
        if(Math.abs(at-cur)<dist){
            dist=Math.abs(at-cur);
            nearest=it;
            d.direction=at-cur>r[size]/2?"up":"down";
        }
    });
    if(!nearest&&!this.options.dropOnEmpty)return;
    if(this.currentContainer===inner){
        if(!inner.over){inner.over=!0;inner._trigger("over",ev,this._ui())}
        return;
    }
    this._rearrange(nearest,nearest?null:inner.element);
    this._trigger("change",ev,this._ui());
    if(!this.drag)return;
    inner._trigger("change",ev,this._ui(this));
    if(!this.drag)return;
    this.currentContainer=inner;
    if(this._sizePlaceholder)this._sizePlaceholder();
    if(!this.options.scrollParent)d.scrollParent=m.scrollParent(d.placeholder);
    inner.over=!0;
    inner._trigger("over",ev,this._ui(this));
};

/** The drag is over: the item takes the placeholder's place and the lists are told (jQuery UI's _clear). */
S._stop=function(ev,cancelled){
    var d=this.drag;
    if(!d)return;
    if(cancelled)return this._abort(ev);
    var item=d.item,later=[],self=this,cc=this.currentContainer,i;
    if(item.parentNode)d.placeholder.parentNode.insertBefore(item,d.placeholder);
    item.style.display=d.display;
    var prev=item.previousElementSibling;
    if(prev&&prev.classList.contains("ui-sortable-helper"))prev=null;
    if(d.prev!==prev||d.parent!==item.parentNode)later.push(function(){self._trigger("update",ev,self._ui())});
    if(this!==cc){
        later.push(function(){self._trigger("remove",ev,self._ui())});
        later.push(function(){cc._trigger("receive",ev,self._ui(self))});
        later.push(function(){cc._trigger("update",ev,self._ui(self))});
    }
    this.containers.slice().reverse().forEach(function(c){
        later.push(function(){c._trigger("deactivate",ev,self._ui(self))});
        if(c.over){c.over=!1;later.push(function(){c._trigger("out",ev,self._ui(self))})}
    });
    this.dragging=!1;
    try{
        this._trigger("beforeStop",ev,this._ui());
        this._clear(d);
        for(i=0;i<later.length;i++)later[i]();
        this._trigger("stop",ev,this._ui());
    }finally{this._end(d)}
};

/** The drag `d` is over also when a callback threw: nothing of it stays behind, the next drag can start. */
S._end=function(d){
    this.dragging=!1;
    if(d.helper)this._clear(d);
    (this.containers||[]).forEach(function(c){c.over=!1});
    if(this.drag===d)this.drag=null;
};

/** Escape, a cancelled pointer or cancel() during the drag: everything back, then out, deactivate and stop. */
S._abort=function(ev){
    var d=this.drag,self=this;
    if(!d)return;
    this.dragging=!1;
    if(d.parent){
        this._restore(d.item,d.prev,d.parent);
        d.item.style.display=d.display;
    }
    this._clear(d);
    try{
        this.containers.slice().reverse().forEach(function(c){
            c._trigger("deactivate",ev,self._ui(self));
            if(c.over){c.over=!1;c._trigger("out",ev,self._ui(self))}
        });
        this._trigger("stop",ev,this._ui());
    }finally{this._end(d)}
};

S._clear=function(d){
    if(d.placeholder&&d.placeholder.parentNode)d.placeholder.parentNode.removeChild(d.placeholder);
    if(d.helper&&d.helper!==d.item&&d.helper.parentNode)d.helper.parentNode.removeChild(d.helper);
    d.helper=null;
    this._sizePlaceholder=null;
};

S._restore=function(item,prev,parent){
    if(prev&&prev.parentNode)prev.parentNode.insertBefore(item,prev.nextSibling);
    else if(parent)parent.insertBefore(item,parent.firstChild);
};

/**
 * jQuery UI's sortable("cancel"): during a drag it ends it as cancelled; after it (from receive, from stop, or later)
 * it puts the item last dragged out of this list back where it was.
 */
S.cancel=function(){
    if(this.dragging){
        m.release(this);
        this._abort(null);
        return this;
    }
    var l=this.last;
    if(l){
        if(l.placeholder.parentNode)l.placeholder.parentNode.removeChild(l.placeholder);
        if(this.drag&&this.drag.helper&&this.drag.helper.parentNode)this.drag.helper.parentNode.removeChild(this.drag.helper);
        this._restore(l.item,l.prev,l.parent);
    }
    return this;
};

/* ---- keyboard (module 139) ---- */

/** Picks `item` up: start, activate and over as a pointer drag that starts over its own list. False if refused. */
S.keyStart=function(item){
    if(this.dragging||this.options.disabled||m.pressed())return!1;
    var o=this.options,d;
    d=this.drag={item:item,notes:{},floating:!1,keyboard:!0,scrollParent:null};
    this.currentContainer=this;
    this.containers=this._containers();
    var appendTo=o.appendTo==="parent"?item.parentNode:m.element(o.appendTo,item);
    var helper=typeof o.helper=="function"?m.elements(o.helper.call(this.element,m.uiEvent("sortstart",this.element,null),item))[0]:item.cloneNode(!0);
    if(helper!==item){
        if(!helper.isConnected)appendTo.appendChild(helper);
        helper.style.display="none";
    }
    d.helper=helper;
    d.prev=item.previousElementSibling;
    d.parent=item.parentNode;
    d.display=item.style.display;
    d.placeholder=this._placeholder(item,null,null);
    this._sizePlaceholder=null;
    d.placeholder.style.display="none";
    item.parentNode.insertBefore(d.placeholder,item.nextSibling);
    this.last={item:item,prev:d.prev,parent:d.parent,placeholder:d.placeholder};
    this.dragging=!0;
    this._trigger("start",null,this._ui());
    for(var i=this.containers.length-1;i>=0&&this.drag;i--)this.containers[i]._trigger("activate",null,this._ui(this));
    if(!this.drag)return!1;
    if(helper!==item){
        helper.classList.add("ui-sortable-helper");
        if(helper.parentNode!==appendTo)appendTo.appendChild(helper);
    }
    this.over=!0;
    this._trigger("over",null,this._ui());
    return!!this.drag;
};

/**
 * Moves the item picked up to place `index` of `list` (an instance of this drag's lists; index among its items
 * without the item), with out, change and over as a pointer moving there.
 */
S.keyMove=function(list,index){
    var d=this.drag;
    if(!d||!d.keyboard||!list)return;
    var items=list._items().filter(function(it){return it!==d.item}),ref=items[index]||null,from=this.currentContainer;
    if(ref)ref.parentNode.insertBefore(d.item,ref);
    else if(items.length)items[items.length-1].parentNode.insertBefore(d.item,items[items.length-1].nextSibling);
    else list.element.appendChild(d.item);
    d.item.parentNode.insertBefore(d.placeholder,d.item.nextSibling);
    if(list===from){this._trigger("change",null,this._ui());return}
    if(from.over){
        from.over=!1;
        from._trigger("out",null,this._ui(this));
        if(!this.drag)return;
    }
    this._trigger("change",null,this._ui());
    if(!this.drag)return;
    list._trigger("change",null,this._ui(this));
    if(!this.drag)return;
    this.currentContainer=list;
    list.over=!0;
    list._trigger("over",null,this._ui(this));
};

/** Drops the item where it is (update, remove, receive, ... stop as a pointer letting go). */
S.keyDrop=function(){if(this.drag&&this.drag.keyboard)this._stop(null,!1)};

/** Puts everything back (as Escape during a pointer drag). */
S.keyCancel=function(){if(this.drag&&this.drag.keyboard)this._abort(null)};

S.option=function(options){
    Object.assign(this.options,options||{});
    this._markHandles();
    return this;
};

function sortable(targets,options){
    return m.elements(targets).map(function(el){
        var inst=instances.get(el);
        return inst?inst.option(options):new Sortable(el,options);
    });
}

t.exports={sortable:sortable,
    cancel:function(target){m.elements(target).forEach(function(el){var i=instances.get(el);i&&i.cancel()})},
    instance:function(el){return instances.get(m.element(el))}};
}
