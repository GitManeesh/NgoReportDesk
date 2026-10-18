(()=>{
 const ids=['donation-org','fn-org','org'];
 function organisation(value,source){
  const clean=(value||'').trim();
  if(clean)localStorage.setItem('ngo-organisation',clean);
  for(const id of ids){
   const input=$(id);
   if(input&&input!==source&&input.value!==clean){input.value=clean;input.dispatchEvent(new Event('input',{bubbles:true}));}
  }
 }
 const stored=localStorage.getItem('ngo-organisation')||'';
 if(stored)organisation(stored);
 for(const id of ids){
  const input=$(id);
  if(input)input.addEventListener('change',()=>organisation(input.value,input));
 }
})();
