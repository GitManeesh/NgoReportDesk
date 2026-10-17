(()=>{
 const ENDPOINT='https://houvoogshtllqbsbckqr.supabase.co/functions/v1/ngo-records?resource=field_notes';let clientId=crypto.randomUUID(),busy=false;
 function key(){let value=localStorage.getItem('ngo-report-desk-workspace-v1');if(!value){value=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('ngo-report-desk-workspace-v1',value);}return value;}
 async function request(body){const r=await fetch(ENDPOINT,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Workspace-Key':key()},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not save the field note.');return d;}
 const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
 async function list(){try{const {records}=await request();$('field-note-list').replaceChildren();$('field-notes-status').textContent=records.length?records.length+' submitted activities':'No activities submitted yet.';for(const r of records){const article=node('div','');article.className='donation-row';article.append(node('strong',r.activity||'Field note'),node('p',r.note_date+' · '+r.numbers),node('p',r.notes_text||r.notes.notes));for(const photo of r.photo||[]){const img=document.createElement('img');img.src=photo.data_url;img.alt=photo.name;img.style.cssText='max-width:160px;max-height:120px;object-fit:contain;margin:8px';article.append(img);}$('field-note-list').append(article);}}catch(e){$('field-notes-status').textContent=e.message;}}
 $('fn-date').value=new Date().toLocaleDateString('en-CA');
 for(const input of $('field-note-form').querySelectorAll('input,textarea'))input.addEventListener('input',()=>clientId=crypto.randomUUID());
 $('field-note-form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;busy=true;$('submit-field-note').disabled=true;$('fn-status').textContent='Submitting…';
  try{
   const files=[...$('fn-photo').files];if(files.length>2||files.some(f=>f.size>500000||!['image/jpeg','image/png'].includes(f.type)))throw Error('Use up to two JPG or PNG photos, 500 KB each.');
   const photo=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name.slice(0,150),data_url:reader.result});reader.onerror=()=>reject(Error('Could not read photo.'));reader.readAsDataURL(file);})));
   const activity=$('fn-activity').value.trim(),numbers=$('fn-numbers').value.trim(),notes_text=$('fn-notes').value.trim();
   const notes={notes:[activity,numbers,notes_text].filter(Boolean).join('\n'),beneficiaries:numbers,challenges:$('fn-challenges').value.trim(),next:$('fn-next').value.trim(),photos:$('fn-captions').value.trim()};
   await request({client_id:clientId,org:$('fn-org').value.trim(),note_date:$('fn-date').value,activity,numbers,notes_text,photo,notes});$('fn-status').textContent='Submitted. Your activity and photos are saved for the weekly report.';await list();
  }catch(e){$('fn-status').textContent=e.message;}finally{busy=false;$('submit-field-note').disabled=false;}
 };
 $('refresh-field-notes').onclick=list;window.addEventListener('hashchange',()=>{if(location.hash==='#field-notes')list();});if(location.hash==='#field-notes')list();
})();
