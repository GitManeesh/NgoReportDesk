(() => {
 const EDGE='https://houvoogshtllqbsbckqr.supabase.co/functions/v1/ngo-records';
 const key=()=>localStorage.getItem('ngo-report-desk-workspace-v1');
 let clientId=crypto.randomUUID(),busy=false;
 const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
 async function request(path,options={}){
  let token=key();if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('ngo-report-desk-workspace-v1',token);}
  const r=await fetch(EDGE+path,{...options,headers:{'Content-Type':'application/json','X-Workspace-Key':token},signal:AbortSignal.timeout(20000)});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Record storage is unavailable.');return data;
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
 for(const input of $('donation-form').querySelectorAll('input,textarea,select'))if(input.id!=='donation-approval')input.addEventListener('input',()=>{if(input.id!=='receipt-channel')clientId=crypto.randomUUID();$('donation-approval').checked=false;});
 $('donation-form').onsubmit=async(event)=>{
  event.preventDefault();if(busy||!$('donation-approval').checked)return;
  busy=true;$('save-donation').disabled=true;
  const fields={org:'donation-org',donor:'donor-name',donated_on:'donation-date',amount:'donation-amount',mode:'donation-mode',email:'donor-email',whatsapp:'donor-whatsapp',thank_you:'thank-you'};
  const data=Object.fromEntries(Object.entries(fields).map(([k,id])=>[k,$(id).value.trim()]));
  $('donation-status').textContent='Creating receipt…';
  try{
   const result=await request('?resource=donations',{method:'POST',body:JSON.stringify({...data,client_id:clientId,currency:'INR',approved:true})});
   $('donation-status').textContent=`Receipt created · ${result.record.receipt_no}. Delivery has not been sent.`;
   $('donation-approval').checked=false;await load();
   await downloadPdf({type:'receipt',id:result.record.id},result.record.receipt_no+'.pdf',$('donation-status'));
   const channel=$('receipt-channel').value;
   if(channel!=='download'){
     const outcomes=[];
     for(const selected of channel==='both'?['gmail','whatsapp']:[channel]){
       try{const r=await fetch('/api/deliver',{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Key':key()},body:JSON.stringify({id:result.record.id,channel:selected,approved:true}),signal:AbortSignal.timeout(60000)});const resultData=await r.json();outcomes.push(selected+': '+(r.ok?'accepted by provider':resultData.error||'not confirmed'));}catch{outcomes.push(selected+': result uncertain; check the provider before retrying');}
     }
     $('donation-status').textContent=result.record.receipt_no+' · '+outcomes.join(' · ');await load();
   }
  }catch(e){$('donation-status').textContent=e.message;}
  finally{busy=false;$('save-donation').disabled=false;}
 };
 async function load(){
  $('donation-list-status').textContent='Loading donations…';$('donation-list').replaceChildren();
  try{
   const {records,limited}=await request('?resource=donations');$('donation-list-status').textContent=records.length?`${records.length} donations${limited?' · latest 1,000 shown':''}`:'No donations recorded yet.';
   for(const d of records){
    const row=el('div','');row.className='donation-row';row.append(el('h4',d.receipt_no),el('p',`${d.donor} · INR ${Number(d.amount).toFixed(2)} · ${d.donated_on}`),el('p',d.receipt_sent?'Receipt and thank-you sent':'Receipt created · not sent'));
    const pdf=el('button','Download receipt PDF ↓');pdf.className='secondary';pdf.onclick=()=>downloadPdf({type:'receipt',id:d.id},d.receipt_no+'.pdf',$('donation-list-status'));row.append(pdf);
    for(const channel of ['gmail','whatsapp'])if(channel==='gmail'?d.email:d.whatsapp){const send=el('button',channel==='gmail'?'Email receipt':'WhatsApp receipt');send.className='secondary';send.onclick=async()=>{
      if(!confirm(`Send receipt ${d.receipt_no} and its approved thank-you to ${channel==='gmail'?d.email:d.whatsapp}?`))return;
      send.disabled=true;try{const r=await fetch('/api/deliver',{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Key':key()},body:JSON.stringify({id:d.id,channel,approved:true}),signal:AbortSignal.timeout(60000)});const result=await r.json();if(!r.ok)throw Error(result.error||'Delivery failed.');$('donation-list-status').textContent='Receipt accepted by the delivery provider.';await load();}catch(e){$('donation-list-status').textContent=e.message;}finally{send.disabled=false;}
    };row.append(send);}
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
 window.addEventListener('hashchange',()=>{if(location.hash==='#receipts')load();});if(location.hash==='#receipts')load();
})();
