(() => {
  const ENDPOINT = 'https://houvoogshtllqbsbckqr.supabase.co/functions/v1/ngo-records';
  const KEY_NAME = 'ngo-report-desk-workspace-v1';
  let savedVersion = '', savedRecord = null, saving = false, listSequence = 0;
  const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
  function workspaceKey() {
    let key = localStorage.getItem(KEY_NAME);
    if (!key) {
      key = hex(crypto.getRandomValues(new Uint8Array(32)));
      localStorage.setItem(KEY_NAME, key);
    }
    if (!/^[a-f0-9]{64}$/.test(key)) throw Error('The browser workspace key is unavailable. Use another browser or download your report.');
    return key;
  }
  function version() { return JSON.stringify({org:$('org').value.trim(),period:$('period').value.trim(),content:$('review').value,attachments:window.reportAttachments||[]}); }
  async function request(path='', options={}) {
    const response=await fetch(ENDPOINT+path, {...options, headers:{'Content-Type':'application/json','X-Workspace-Key':workspaceKey()}, signal:AbortSignal.timeout(20000)});
    let data;try {data=await response.json();} catch {throw Error('Record storage is temporarily unavailable.');}
    if(!response.ok) throw Error(data.error||'Could not access records.');
    return data;
  }
  function sync() {
    const approved=Boolean(approvedReport());
    const saved=approved && savedRecord && savedVersion===version();
    $('save-record').disabled=!approved||saving||Boolean(saved);
    $('save-record').textContent=saving?'Saving record…':saved?'Record saved ✓':'Save approved record →';
    $('draft-label').textContent=saved?'SAVED / APPROVED':approved?'APPROVED / READY TO SAVE':'DRAFT / REVIEW REQUIRED';
    if(saved) {
      $('save-status').textContent=`Record saved · ${savedRecord.id} · ${new Date(savedRecord.created_at).toLocaleString()}`;
      $('status').textContent='Your approved report is saved in Records.';
    } else if(approved) {
      $('save-status').textContent='Approved. Save this version to keep it in Records.';
      $('status').textContent='Report approved. Ready to save or download.';
    } else $('save-status').textContent='';
  }
  $('approve').addEventListener('change',sync);
  for(const id of ['org','period','notes','challenges','next','beneficiaries','photos','review']) $(id).addEventListener('input',()=>{
    sync();
    if(id==='review') $('status').textContent='Report changed. Review and approve this version before saving.';
  });
  for(const id of ['clear','sample','draft','ai-draft']) $(id).addEventListener('click',sync);
  window.addEventListener('report-photos-changed',sync);
  $('save-record').onclick=async()=>{
    if(!approvedReport()||saving)return;
    const before=version();const payload=JSON.parse(before);
    if(!payload.org||!payload.period){$('save-status').textContent='Add an organisation and reporting period.';return;}
    saving=true;sync();
    try {
      payload.client_id=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(before))));
      payload.approved=true;
      const data=await request('',{method:'POST',body:JSON.stringify(payload)});
      if(!data.record?.id)throw Error('Storage did not confirm the saved record.');
      savedVersion=before;savedRecord=data.record;
      saving=false;sync();
      if(before!==version()||!approvedReport()) $('save-status').textContent='The earlier approved version was saved. Review and save your current changes separately.';
    } catch(error) {
      saving=false;sync();
      $('save-status').textContent=error.name==='TimeoutError'?'Saving took too long. Retry safely; the same version will not create a duplicate.':error.message;
    }
  };
  function makeElement(tag,text,className) {
    const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;
  }
  async function openRecord(id,button,isDraft=false) {
    if(($('notes').value.trim()||$('review').value.trim()) && (!savedRecord||savedVersion!==version())) {
      if(!confirm('Opening this record replaces your unsaved workspace. Continue?'))return;
    }
    button.disabled=true;
    try {
      const {record}=await request((isDraft?'?resource=drafts&id=':'?id=')+encodeURIComponent(id));
      requestSequence++;
      resetApproval();
      $('org').value=record.org;$('period').value=record.period;
      for(const field of ['notes','challenges','next','beneficiaries','photos']) $(field).value='';
      $('review').value=record.content;window.setReportPhotos(record.attachments||[]);draftReady=true;$('approve').checked=record.status!=='draft';
      $('draft-area').hidden=false;$('empty-report').hidden=true;
      savedVersion=record.status==='draft'?'':version();savedRecord=record.status==='draft'?null:record;
      $('approve').dispatchEvent(new Event('change'));
      location.hash='report';route();showPreview();sync();
    } catch(error){$('records-status').textContent=error.message;}
    finally{button.disabled=false;}
  }
  async function loadRecords() {
    const sequence=++listSequence;
    $('records-status').textContent='Loading saved records…';$('records-list').replaceChildren();
    $('refresh-records').disabled=true;
    try {
      const {records}=await request();
      $('scheduled-drafts').replaceChildren();
      const drafts=await request('?resource=drafts');for(const d of drafts.records){const card=makeElement('article','','record-card');card.append(makeElement('span','REVIEW REQUIRED','record-badge'),makeElement('h3',d.org),makeElement('p',d.period));const button=makeElement('button','Review scheduled report →','secondary');button.onclick=()=>openRecord(d.id,button,true);card.append(button);$('scheduled-drafts').append(card);}
      if(sequence!==listSequence)return;
      $('records-status').textContent=records.length?`${records.length} saved report${records.length===1?'':'s'}${records.length===100?' · showing the latest 100':''}`:'No saved records yet. Create a report, approve it, then choose Save approved record.';
      for(const record of records) {
        const card=makeElement('article','','record-card');
        card.append(makeElement('span','APPROVED','record-badge'),makeElement('h3',record.org),makeElement('p',record.period),makeElement('p',new Date(record.created_at).toLocaleString(),'record-meta'),makeElement('p','ID · '+record.id,'record-meta'));
        const button=makeElement('button','Open report →','secondary');button.onclick=()=>openRecord(record.id,button);card.append(button);$('records-list').append(card);
      }
    } catch(error){if(sequence===listSequence)$('records-status').textContent=error.message;}
    finally{if(sequence===listSequence)$('refresh-records').disabled=false;}
  }
  $('connect-coordinator').onclick=async()=>{try{const secret=$('coordinator-key').value;$('coordinator-key').value='';const r=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Key':workspaceKey(),'X-Coordinator-Key':secret},body:'{}',signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Connection failed.');$('coordinator-access-status').textContent='Coordinator access connected for this browser.';}catch(e){$('coordinator-access-status').textContent=e.message;}};
  $('note-date').value=new Date().toLocaleDateString('en-CA');
  let noteId=crypto.randomUUID();
  for(const id of ['org','notes','challenges','next','beneficiaries','photos','note-date'])$(id).addEventListener('input',()=>noteId=crypto.randomUUID());
  $('save-field-notes').onclick=async()=>{
    const notes=snapshot();if(!notes.org||notes.notes.length<30){$('field-note-status').textContent='Add an organisation and at least 30 characters of activity notes.';return;}
    try{await request('?resource=field_notes',{method:'POST',body:JSON.stringify({client_id:noteId,org:notes.org,note_date:$('note-date').value,notes})});$('field-note-status').textContent='Field notes saved for the weekly report.';}catch(e){$('field-note-status').textContent=e.message;}
  };
  $('save-schedule').onclick=async()=>{
    try{await request('?resource=settings',{method:'POST',body:JSON.stringify({org:$('schedule-org').value.trim(),weekly_enabled:$('weekly-enabled').checked,monthly_enabled:$('monthly-enabled').checked,coordinator_email:$('coordinator-email').value.trim(),coordinator_whatsapp:$('coordinator-whatsapp').value.trim()})});$('schedule-status').textContent='Preferences saved. Schedules run when the updated n8n workflow is published.';}catch(e){$('schedule-status').textContent=e.message;}
  };
  request('?resource=settings').then(({records})=>{const s=records[0];if(!s)return;$('schedule-org').value=s.org;$('weekly-enabled').checked=s.weekly_enabled;$('monthly-enabled').checked=s.monthly_enabled;$('coordinator-email').value=s.coordinator_email;$('coordinator-whatsapp').value=s.coordinator_whatsapp;}).catch(()=>{});
  $('refresh-records').onclick=loadRecords;
  window.addEventListener('hashchange',()=>{if(location.hash==='#records')loadRecords();});
  if(location.hash==='#records')loadRecords();
  sync();
})();
