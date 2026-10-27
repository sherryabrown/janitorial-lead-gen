import {useEffect,useState} from 'react';

// Keeping a workspace mounted preserves drafts; visibility controls only reads.
export function useActiveRead(active=true){
 const [visible,setVisible]=useState(()=>!document.hidden);
 useEffect(()=>{
  const changed=()=>setVisible(!document.hidden);
  document.addEventListener('visibilitychange',changed);
  return()=>document.removeEventListener('visibilitychange',changed);
 },[]);
 return active&&visible;
}
