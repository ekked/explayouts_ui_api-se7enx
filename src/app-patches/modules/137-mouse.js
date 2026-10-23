function(e,t,n){
/**
 * Drag and drop of the layout editor, part 1: the gesture, in place of jQuery UI's mouse widget. Used by ./draggable
 * (module 135, with the droppables) and jquery-ui/sortable (module 138). Plain DOM, no jQuery.
 *
 * A press on a bound element becomes a drag once it has lasted `delay` ms and moved `distance` px (the larger of the
 * two axes), as with jQuery UI. It is read from Pointer Events, so mouse, touch and pen work alike. The handles carry
 * the classes ui-sortable-handle / ui-draggable-handle and with them touch-action: none (explayouts-editor.css): a
 * finger on a handle moves the block or item, a finger anywhere else scrolls the page.
 *
 * One press at a time, taken by the innermost bound element (the first listener it bubbles to, as jQuery UI's
 * mouseHandled did for nested sortables). Escape and pointercancel end a drag as cancelled: the widget puts
 * everything back. A mouse press does not start a text selection or the browser's own drag and drop, and the click
 * that ends a drag is not passed on (it would select the block under the pointer).
 *
 * @copyright Copyright CJW Network and Exponential Foundation. All rights reserved.
 * @license GPL-2.0-or-later
 */
"use strict";
var press=null,swallowClick=!1,taken=new WeakSet;

/** Element | NodeList | array | jQuery-like (length + index access) | selector -> array of elements. */
function elements(x){
    if(!x)return[];
    if(typeof x=="string")return Array.prototype.slice.call(document.querySelectorAll(x));
    if(x.nodeType===1)return[x];
    var out=[];
    for(var i=0;i<x.length;i++)if(x[i]&&x[i].nodeType===1)out.push(x[i]);
    return out;
}

/** One element: an Element, a jQuery-like, or a selector looked up from `near` outwards, then in the document. */
function element(x,near){
    if(!x)return null;
    if(typeof x=="string")return near&&near.closest&&near.closest(x)||document.querySelector(x);
    return elements(x)[0]||null;
}

function px(style,name){return parseFloat(style[name])||0}

function box(el){
    var r=el.getBoundingClientRect();
    return{left:r.left,top:r.top,width:r.width,height:r.height,right:r.left+r.width,bottom:r.top+r.height};
}

/** Lying side by side, as jQuery UI's sortable judged it: floated, or inline / table-cell. */
function isFloating(el){
    var s=getComputedStyle(el);
    return/left|right/.test(s.cssFloat||s.float||"")||/inline|table-cell/.test(s.display||"");
}

function isVisible(el){
    return el.isConnected&&getComputedStyle(el).display!=="none";
}

/** The nearest ancestor that scrolls, or null for the window (jQuery UI's scrollParent()). */
function scrollParent(el,includeHidden){
    var s=getComputedStyle(el),absolute=s.position==="absolute",re=includeHidden?/auto|scroll|hidden/:/auto|scroll/;
    if(s.position==="fixed")return null;
    for(var p=el.parentElement;p;p=p.parentElement){
        var ps=getComputedStyle(p);
        if(absolute&&ps.position==="static")continue;
        if(re.test((ps.overflow||"")+(ps.overflowY||"")+(ps.overflowX||"")))return p===document.body||p===document.documentElement?null:p;
    }
    return null;
}

/**
 * Auto-scroll while a drag lasts, taken over from admin4's sub items drag (subitems_priority_drag.js): each animation
 * frame, while the pointer is within 48px of the top or bottom of the widget's scroll parent (clipped to the window;
 * the window itself when there is none), that scrolls by up to 16px, the closer to the edge the faster (8px with
 * prefers-reduced-motion), and the widget is moved again for what came into view. A finger held still at the edge
 * scrolls too, which jQuery UI's scroll-on-move did not do.
 */
var EDGE=48,STEP=16;
function scrollFrame(){
    var p=press;
    if(!p||!p.started)return;
    p.frame=window.requestAnimationFrame(scrollFrame);
    var w=p.widget,el=w.options.scroll===!1?void 0:w._scroller();
    if(el===void 0)return;
    var y=p.last.clientY,top=0,bottom=window.innerHeight,dy=0;
    if(el){var r=el.getBoundingClientRect();top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom)}
    if(y<top+EDGE)dy=-Math.ceil((top+EDGE-y)/EDGE*STEP);
    else if(y>bottom-EDGE)dy=Math.ceil((y-bottom+EDGE)/EDGE*STEP);
    if(!dy)return;
    if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)dy=dy>0?8:-8;
    if(el){var before=el.scrollTop;el.scrollTop=before+dy;if(el.scrollTop===before)return}
    else window.scrollBy(0,dy);
    if(w._scrolled)w._scrolled();
    w._drag(p.last);
}

/**
 * Puts an absolutely positioned helper so that its margin box starts at the client point (left, top), in the
 * coordinates of its offset parent (of the page, when that is the body, as jQuery UI did). axis "y" leaves left
 * alone, "x" top.
 */
function place(helper,left,top,axis){
    var op=helper.offsetParent,x,y;
    if(!op||op===document.body||op===document.documentElement){
        x=left+window.pageXOffset;y=top+window.pageYOffset;
    }else{
        var r=op.getBoundingClientRect();
        x=left-r.left-op.clientLeft+op.scrollLeft;y=top-r.top-op.clientTop+op.scrollTop;
    }
    if(axis!=="y")helper.style.left=x+"px";
    if(axis!=="x")helper.style.top=y+"px";
}

/** The event handed to a widget's callbacks; target is the element whose callback it is, as with jQuery UI. */
function uiEvent(type,target,original){
    var prevented=!1;
    return{type:type,target:target,currentTarget:target,originalEvent:original||null,
        preventDefault:function(){prevented=!0},isDefaultPrevented:function(){return prevented}};
}

function onKey(ev){
    swallowClick=!1;
    if(press&&(ev.key==="Escape"||ev.key==="Esc")){
        if(press.started){ev.preventDefault();ev.stopPropagation()}
        finish(ev,!0);
    }
}
function onMove(ev){
    var p=press;
    if(!p||ev.pointerId!==p.id)return;
    if(p.type==="mouse"&&ev.buttons===0)return finish(ev,!1);   // the button went up outside the window
    p.last={clientX:ev.clientX,clientY:ev.clientY};
    if(p.started){ev.preventDefault();p.widget._drag(ev);return}
    if(!p.delayMet||Math.max(Math.abs(ev.clientX-p.down.clientX),Math.abs(ev.clientY-p.down.clientY))<p.widget.options.distance)return;
    p.started=p.widget._start(p.down,ev)!==!1;
    if(!p.started)return finish(ev,!1);
    ev.preventDefault();
    p.widget._drag(ev);
    if(press===p&&window.requestAnimationFrame)p.frame=window.requestAnimationFrame(scrollFrame);
}
function onUp(ev){if(press&&ev.pointerId===press.id)finish(ev,!1)}
function onCancel(ev){if(press&&ev.pointerId===press.id)finish(ev,!0)}
function prevent(ev){if(press)ev.preventDefault()}
function onClick(ev){
    // Only the click of a pointer (detail > 0): a click from the keyboard is never the end of a drag.
    if(!swallowClick||!ev.detail)return;
    swallowClick=!1;
    ev.preventDefault();ev.stopPropagation();
}

function listen(on){
    var f=on?"addEventListener":"removeEventListener";
    document[f]("pointermove",onMove,{capture:!0,passive:!1});
    document[f]("pointerup",onUp,!0);
    document[f]("pointercancel",onCancel,!0);
    document[f]("selectstart",prevent,!0);
    document[f]("dragstart",prevent,!0);
}

function finish(ev,cancelled){
    var p=press;
    if(!p)return;
    press=null;
    listen(!1);
    clearTimeout(p.timer);
    if(p.frame)window.cancelAnimationFrame(p.frame);
    if(p.started){
        swallowClick=!0;
        p.widget._stop(ev,cancelled);
    }
}

/** Ends the press of `widget` without telling it (it has ended the drag itself). */
function release(widget){
    var p=press;
    if(!p||p.widget!==widget)return;
    press=null;
    listen(!1);
    clearTimeout(p.timer);
    if(p.frame)window.cancelAnimationFrame(p.frame);
    if(p.started)swallowClick=!0;
}

function down(widget,ev){
    var o=widget.options;
    if(press||taken.has(ev)||ev.isPrimary===!1||ev.button!==0)return;
    if(o.disabled||o.cancel&&ev.target.closest&&ev.target.closest(o.cancel))return;
    if(!widget._capture(ev))return;
    taken.add(ev);
    press={widget:widget,down:ev,id:ev.pointerId,type:ev.pointerType,started:!1,delayMet:!o.delay,timer:0,frame:0,last:{clientX:ev.clientX,clientY:ev.clientY}};
    if(o.delay)press.timer=setTimeout(function(p){return function(){p.delayMet=!0}}(press),o.delay);
    listen(!0);
    // A mouse press on a handle is a grip: no text selection, no native drag and drop (jQuery UI prevented the
    // mousedown the same way). A touch is left alone: touch-action does that work, and a tap stays a tap.
    if(ev.pointerType==="mouse")ev.preventDefault();
}

/** Lets `widget` (options, _capture, _start, _drag, _stop) take presses on `el`. */
function bind(el,widget){
    el.addEventListener("pointerdown",function(ev){down(widget,ev)});
}

document.addEventListener("click",onClick,!0);
document.addEventListener("pointerdown",function(){swallowClick=!1},!0);
document.addEventListener("keydown",onKey,!0);

t.exports={bind:bind,elements:elements,element:element,box:box,px:px,isFloating:isFloating,isVisible:isVisible,
    scrollParent:scrollParent,place:place,uiEvent:uiEvent,
    release:release,pressed:function(){return press},
    CANCEL:"input, textarea, button, select, option"};
}
