import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CircleHelp} from 'lucide-react';
export function InfoTooltip({label,children}:{label:string;children:string}){
 const id=useId(),button=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false),[position,setPosition]=useState({left:8,top:8});
 useLayoutEffect(()=>{if(!open||!button.current)return;const box=button.current.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(box.left,window.innerWidth-228)),top:Math.max(8,Math.min(box.bottom+8,window.innerHeight-160))});},[open]);
 useEffect(()=>{if(!open)return;const close=()=>setOpen(false),outside=(e:PointerEvent)=>{if(!button.current?.contains(e.target as Node))close();};window.addEventListener('resize',close);window.addEventListener('scroll',close,true);document.addEventListener('pointerdown',outside);return()=>{window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);document.removeEventListener('pointerdown',outside);};},[open]);
 return <span className="info-tooltip"><button ref={button} aria-label={label} aria-describedby={open?id:undefined} className="info-button" type="button" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>{if(document.activeElement!==button.current)setOpen(false);}} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onClick={()=>setOpen(true)} onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}><CircleHelp size={15} aria-hidden="true"/></button>{open&&createPortal(<span id={id} role="tooltip" className="tooltip-content" style={{...position,position:'fixed',bottom:'auto',visibility:'visible',opacity:1,transform:'none',zIndex:1100}}>{children}</span>,document.body)}</span>;
}
