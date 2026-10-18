(() => {
 const EDGE='https://houvoogshtllqbsbckqr.supabase.co/functions/v1/ngo-records';
 const key=()=>localStorage.getItem('ngo-report-desk-workspace-v1');
 let clientId=crypto.randomUUID(),busy=false;
 const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
 async function request(path,options={}){
  let token=key();if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('ngo-report-desk-workspace-v1',token);}
  let r;try{r=await fetch(EDGE+path,{...options,headers:{'Content-Type':'application/json','X-Workspace-Key':token},signal:AbortSignal.timeout(20000)});}catch(e){throw Error(e.name==='TimeoutError'?'Saving took too long. Retry safely; a duplicate receipt will not be created.':'Could not reach record storage. Check your connection and try again.');}
  let data;try{data=await r.json();}catch{throw Error('Record storage returned an unreadable response.');}if(!r.ok)throw Error(data.error||'Record storage is unavailable.');return data;
 }
 async function downloadPdf(payload,filename,status){
  status.textContent='Preparing PDF…';
  try{
   const r=await fetch('/api/pdf',{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Key':key()||''},body:JSON.stringify({...payload,approved:true}),signal:AbortSignal.timeout(45000)});
   if(!r.ok){const d=await r.json();throw Error(d.error||'PDF unavailable.');}
   const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='PDF downloaded.';
  }catch(e){status.textContent=e.message;}
 }
 $('donation-date').value=new Date().toLocaleDateString('en-CA');$('donation-date').max=$('donation-date').value;
 $('prepare-thanks').onclick=()=>{
  const name=$('donor-name').value.trim(),org=$('donation-org').value.trim(),amount=$('donation-amount').value;
  if(!name||!org||!amount){$('donation-status').textContent='Add the organisation, donor and amount first.';return;}
  $('thank-you').value=`Dear ${name}, thank you for your donation of INR ${Number(amount).toFixed(2)} to ${org}. Please find your donation receipt attached.`;$('donation-approval').checked=false;
 };
 for(const input of $('donation-form').querySelectorAll('input,textarea,select'))if(input.id!=='donation-approval')input.addEventListener('input',()=>{clientId=crypto.randomUUID();$('donation-approval').checked=false;});
 let customThanks=false;$('thank-you').addEventListener('input',()=>customThanks=true);
 for(const id of ['donor-name','donation-org','donation-amount'])$(id).addEventListener('input',()=>{if(!customThanks&&$('donor-name').value.trim()&&$('donation-org').value.trim()&&Number($('donation-amount').value)>0){$('thank-you').value='Dear '+$('donor-name').value.trim()+', thank you for your donation of INR '+Number($('donation-amount').value).toFixed(2)+' to '+$('donation-org').value.trim()+'. Your donation receipt is attached.';}});
 $('donation-form').onsubmit=async(event)=>{
  event.preventDefault();if(busy)return;if(!$('donation-approval').checked){$('donation-status').textContent='Check the confirmation box before saving.';$('donation-approval').focus();return;}if(!$('donation-org').value.trim()){$('donation-status').textContent='Enter the organisation name.';$('donation-org').focus();return;}
  busy=true;$('save-donation').disabled=true;
  const fields={org:'donation-org',donor:'donor-name',donated_on:'donation-date',amount:'donation-amount',mode:'donation-mode',email:'donor-email',whatsapp:'donor-whatsapp',thank_you:'thank-you'};
  const data=Object.fromEntries(Object.entries(fields).map(([k,id])=>[k,$(id).value.trim()]));
  if(!data.email&&!data.whatsapp){$('donation-status').textContent='Add an email address, WhatsApp number, or both.';$('donor-email').focus();busy=false;$('save-donation').disabled=false;return;}
  $('donation-status').textContent='Creating receipt…';
  try{
   const result=await request('?resource=donations',{method:'POST',body:JSON.stringify({...data,client_id:clientId,currency:'INR',approved:true})});
   $('donation-status').textContent=`Receipt created · ${result.record.receipt_no}. Delivery has not been sent.`;
   $('donation-approval').checked=false;await load();
   await downloadPdf({type:'receipt',id:result.record.id},result.record.receipt_no+'.pdf',$('donation-status'));
   try{const delivery=await window.runAutomaticNotifications();$('donation-status').textContent=result.record.receipt_no+' · '+delivery.accepted+' notification(s) accepted by provider'+(delivery.uncertain?' · Some deliveries need review.':'');await load();}catch(e){$('donation-status').textContent=result.record.receipt_no+' saved. '+e.message;}
  }catch(e){$('donation-status').textContent=e.message;}
  finally{busy=false;$('save-donation').disabled=false;}
 };
 async function load(){
  $('donation-list-status').textContent='Loading donations…';$('donation-list').replaceChildren();
  try{
   const {records,limited}=await request('?resource=donations');$('donation-list-status').textContent=records.length?`${records.length} donations${limited?' · latest 1,000 shown':''}`:'No donations recorded yet.';
   for(const d of records){
    const row=el('tr','');for(const text of [d.donated_on,d.donor,'INR '+Number(d.amount).toFixed(2),d.mode,d.receipt_no,d.receipt_sent?'Sent':'Pending',d.thank_you_sent?'Sent':'Pending'])row.append(el('td',text));
    const pdf=el('button','Download receipt PDF ↓');pdf.className='secondary';pdf.onclick=()=>downloadPdf({type:'receipt',id:d.id},d.receipt_no+'.pdf',$('donation-list-status'));row.children[4].append(document.createElement('br'),pdf);
    $('donation-list').append(row);
   }
  }catch(e){$('donation-list-status').textContent=e.message;}
 }
 $('refresh-donations').onclick=load;
 $('check-lapsed').onclick=async()=>{
  $('lapsed-status').textContent='Checking donor history…';$('lapsed-list').replaceChildren();
  try{const {donors,limited}=await request('?resource=lapsed');$('lapsed-status').textContent=limited?'History exceeds 1,000 donations. The inactivity list may be incomplete.':donors.length?`${donors.length} donors have no recorded donation in the past 12 months.`:'No inactive donors found in your recorded history.';for(const d of donors)$('lapsed-list').append(el('p',`${d.donor} · Last recorded donation: ${d.donated_on}`));}catch(e){$('lapsed-status').textContent=e.message;}
 };
 $('download-pdf').onclick=()=>{if(approvedReport())downloadPdf({type:'report',content:$('review').value,attachments:window.reportAttachments||[]},'Weekly-Donor-Report.pdf',$('status'));};
 $('approve').addEventListener('change',()=>{$('download-pdf').disabled=!approvedReport();});
 for(const id of ['org','period','notes','challenges','next','beneficiaries','photos','review'])$(id).addEventListener('input',()=>{$('download-pdf').disabled=true;});
 for(const id of ['clear','sample','draft','ai-draft'])$(id).addEventListener('click',()=>{$('download-pdf').disabled=true;});
 window.addEventListener('hashchange',()=>{if(location.hash==='#log')load();});if(location.hash==='#log')load();
})();
