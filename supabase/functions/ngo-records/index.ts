// Browser capability authentication: 256-bit random key, stored only hashed in DB.
// No account/login required. Losing the browser key loses access to its records.
const ALLOWED_ORIGIN = 'https://ngo-report-desk.vercel.app';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'content-type, x-workspace-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin',
  };
  const reply = (status, body) => new Response(JSON.stringify(body), {status, headers});
  if (origin && origin !== ALLOWED_ORIGIN) return reply(403, {error:'Origin not allowed.'});
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (!['GET','POST'].includes(req.method)) return reply(405, {error:'Method not allowed.'});
  const resource = new URL(req.url).searchParams.get('resource') || 'reports';
  const key = req.headers.get('x-workspace-key') || '';
  if (resource!=='worker' && !/^[a-f0-9]{64}$/.test(key)) return reply(401, {error:'A valid workspace key is required.'});
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))), b=>b.toString(16).padStart(2,'0')).join('');
  const url = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !secret) return reply(503, {error:'Record storage is unavailable.'});
  const base = `${url}/rest/v1/` + (resource==='deliveries'?'ngo_delivery_log':resource==='donations'||resource==='lapsed'?'ngo_donations':'ngo_report_records');
  const dbHeaders = {apikey:secret, Authorization:`Bearer ${secret}`, 'Content-Type':'application/json'};
  const query = async (path, options={}) => {
    const response = await fetch(base+path, {...options, headers:{...dbHeaders,...options.headers}, signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('Storage request failed');
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  };
  const table = async(name,path='',options={})=>{
    const response=await fetch(`${url}/rest/v1/${name}${path}`,{...options,headers:{...dbHeaders,...options.headers},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Storage request failed');const text=await response.text();return text?JSON.parse(text):null;
  };
  async function relayAllowed(){
    const relay=req.headers.get('x-relay-key')||'';if(!/^[a-f0-9]{64}$/.test(relay))return false;
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(relay))),b=>b.toString(16).padStart(2,'0')).join('');
    const rows=await table('ngo_engine_keys','?key_hash=eq.'+digest+'&select=key_hash');return rows.length===1;
  }
  try {
    if(resource==='worker'){
      if(req.method!=='POST'||!await relayAllowed())return reply(401,{error:'Worker authentication required.'});
      const text=await req.text();if(text.length>100000)return reply(413,{error:'Job too large.'});const b=JSON.parse(text);
      if(b.action==='settings'){return reply(200,{settings:await table('ngo_automation_settings','?select=*&order=owner_hash&limit=100')});}
      if(!/^[a-f0-9]{64}$/.test(b.owner_hash||''))return reply(400,{error:'Invalid workspace.'});
      if(b.action==='claim_run'){if(!/^\d{4}-\d{2}$/.test(b.period||''))return reply(400,{error:'Invalid run period.'});const rows=await table('ngo_schedule_runs','?on_conflict=owner_hash,period,kind',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({owner_hash:b.owner_hash,period:b.period,kind:'monthly'})});return reply(200,{claimed:rows?.length===1});}
      if(b.action==='grant_access'){await table('ngo_channel_access','?on_conflict=owner_hash',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({owner_hash:b.owner_hash,enabled:true})});return reply(200,{connected:true});}
      if(b.action==='notes'){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(b.from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(b.to||''))return reply(400,{error:'Invalid dates.'});
        return reply(200,{notes:await table('ngo_field_notes',`?owner_hash=eq.${b.owner_hash}&note_date=gte.${b.from}&note_date=lte.${b.to}&select=note_date,org,notes&order=note_date&limit=1000`)});
      }
      if(b.action==='save_draft'){
        if(typeof b.content!=='string'||b.content.length>80000||typeof b.period!=='string'||b.period.length>150||typeof b.org!=='string'||b.org.length>200)return reply(400,{error:'Invalid draft.'});
        await table('ngo_report_drafts','?on_conflict=owner_hash,period',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({owner_hash:b.owner_hash,org:b.org,period:b.period,content:b.content})});return reply(200,{saved:true});
      }
      if(b.action==='donations')return reply(200,{donations:await table('ngo_donations',`?owner_hash=eq.${b.owner_hash}&select=donor,email,whatsapp,donated_on&order=donated_on.desc&limit=1000`)});
      return reply(400,{error:'Unknown worker action.'});
    }
    if(resource==='report_delivery'){
      if(req.method!=='POST'||!await relayAllowed())return reply(401,{error:'Relay access required.'});
      const text=await req.text();if(text.length>2000)return reply(413,{error:'Input too large.'});const b=JSON.parse(text);
      if(!/^[a-f0-9]{64}$/.test(b.id||''))return reply(400,{error:'Invalid delivery ID.'});
      if(b.action==='claim'){
        const rows=await table('ngo_report_delivery_log','?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({id:b.id,owner_hash:hash,status:'sending'})});
        return rows?.length?reply(200,{claimed:true}):reply(409,{error:'Already sent or uncertain. Check provider history before retrying.'});
      }
      if(b.action==='finish'&&['sent','uncertain'].includes(b.status)){await table('ngo_report_delivery_log',`?id=eq.${b.id}&owner_hash=eq.${hash}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:b.status})});return reply(200,{updated:true});}
      return reply(400,{error:'Invalid action.'});
    }
    if(resource==='access'){if(req.method!=='GET')return reply(405,{error:'Read only.'});const rows=await table('ngo_channel_access',`?owner_hash=eq.${hash}&enabled=eq.true&select=enabled`);return reply(200,{enabled:rows.length===1});}
    if(['settings','field_notes','drafts'].includes(resource)){
      const name={settings:'ngo_automation_settings',field_notes:'ngo_field_notes',drafts:'ngo_report_drafts'}[resource];
      if(req.method==='GET'){
        const id=new URL(req.url).searchParams.get('id');if(id&&!UUID.test(id))return reply(400,{error:'Invalid record ID.'});
        const rows=await table(name,`?owner_hash=eq.${hash}&select=*`+(id?`&id=eq.${id}&limit=1`:'&limit=100'));
        for(const row of rows){delete row.owner_hash;if(resource==='drafts')row.status='draft';}
        if(id&&!rows.length)return reply(404,{error:'Draft not found.'});
        return reply(200,id?{record:rows[0]}:{records:rows});
      }
      const text=await req.text();if(text.length>35000)return reply(413,{error:'Input too large.'});const b=JSON.parse(text);
      if(resource==='settings'){
        if(typeof b.org!=='string'||!b.org.trim()||b.org.length>200)return reply(400,{error:'Organisation is required.'});
        const email=typeof b.coordinator_email==='string'?b.coordinator_email.trim():'';const whatsapp=typeof b.coordinator_whatsapp==='string'?b.coordinator_whatsapp.trim():'';
        if((email&&(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))||(whatsapp&&!/^\+?[1-9]\d{7,14}$/.test(whatsapp)))return reply(400,{error:'Invalid coordinator contact.'});
        if(b.monthly_enabled===true&&!email&&!whatsapp)return reply(400,{error:'Add a coordinator contact for monthly alerts.'});
        if((b.weekly_enabled===true||b.monthly_enabled===true)&&!(await table('ngo_channel_access',`?owner_hash=eq.${hash}&enabled=eq.true&select=enabled`)).length)return reply(403,{error:'Connect coordinator access before enabling schedules.'});
        await table(name,'?on_conflict=owner_hash',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({owner_hash:hash,org:b.org.trim(),weekly_enabled:b.weekly_enabled===true,monthly_enabled:b.monthly_enabled===true,coordinator_email:email,coordinator_whatsapp:whatsapp,updated_at:new Date().toISOString()})});return reply(200,{saved:true});
      }
      if(resource==='field_notes'){
        if(!UUID.test(b.client_id||'')||!/^\d{4}-\d{2}-\d{2}$/.test(b.note_date||'')||!b.notes||typeof b.org!=='string'||!b.org.trim()||b.org.length>200)return reply(400,{error:'Invalid field note.'});
        if(!Number.isFinite(Date.parse(b.note_date))||new Date(b.note_date).toISOString().slice(0,10)!==b.note_date)return reply(400,{error:'Invalid note date.'});
        for(const k of ['notes','beneficiaries','challenges','next','photos'])if(typeof b.notes[k]!=='string'||b.notes[k].length>14000)return reply(400,{error:'Invalid note field.'});
        await table(name,'?on_conflict=owner_hash,client_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({owner_hash:hash,client_id:b.client_id,note_date:b.note_date,org:b.org.trim(),notes:b.notes})});return reply(200,{saved:true});
      }
      return reply(405,{error:'Read-only resource.'});
    }
    if (['donations','lapsed','deliveries'].includes(resource)) {
      if(req.method==='GET') {
        const id=new URL(req.url).searchParams.get('id');
        if(id&&!UUID.test(id))return reply(400,{error:'Invalid record ID.'});
        const rows=await query(`?owner_hash=eq.${hash}&select=*`+(id?`&id=eq.${id}&limit=1`:'&order=created_at.desc&limit=1000'));
        // Never expose the workspace's hashed access key to clients.
        for(const row of rows)delete row.owner_hash;
        if(resource==='lapsed') {
          const latest=new Map();
          for(const row of rows){const identity=row.email.toLowerCase()||row.whatsapp||row.donor.toLowerCase();const prev=latest.get(identity);if(!prev||row.donated_on>prev.donated_on)latest.set(identity,row);}
          const cutoff=new Date();cutoff.setUTCFullYear(cutoff.getUTCFullYear()-1);
          return reply(200,{donors:[...latest.values()].filter(row=>row.donated_on<cutoff.toISOString().slice(0,10)),limited:rows.length===1000});
        }
        if(id&&!rows.length)return reply(404,{error:'Record not found in this workspace.'});
        return reply(200,id?{record:rows[0]}:{records:rows,limited:rows.length===1000});
      }
      const text=await req.text();if(text.length>10000)return reply(413,{error:'Input too large.'});
      let data;try{data=JSON.parse(text);}catch{return reply(400,{error:'Invalid JSON.'});}
      if(!data||data.approved!==true)return reply(400,{error:'Human approval is required.'});
      if(resource==='deliveries') {
        if(!await relayAllowed())return reply(401,{error:'Use the delivery service.'});
        if(!UUID.test(data.donation_id||'')||!['gmail','whatsapp'].includes(data.channel))return reply(400,{error:'Invalid delivery.'});
        const owned=await table('ngo_donations',`?owner_hash=eq.${hash}&id=eq.${data.donation_id}&select=id`);if(!owned.length)return reply(404,{error:'Donation not found.'});
        if(data.action==='claim'){
          const rows=await query('?on_conflict=donation_id,channel',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({owner_hash:hash,donation_id:data.donation_id,channel:data.channel,status:'sending'})});
          if(!rows?.length)return reply(409,{error:'This delivery was already sent or has an uncertain result. Check the provider before retrying.'});
          return reply(200,{claimed:true});
        }
        if(data.action==='finish'&&['sent','uncertain'].includes(data.status)){
          await query(`?owner_hash=eq.${hash}&donation_id=eq.${data.donation_id}&channel=eq.${data.channel}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:data.status})});
          if(data.status==='sent')await table('ngo_donations',`?owner_hash=eq.${hash}&id=eq.${data.donation_id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({receipt_sent:true,thank_you_sent:true})});return reply(200,{updated:true});
        }
        return reply(400,{error:'Invalid delivery action.'});
      }
      if(resource!=='donations')return reply(405,{error:'Read-only resource.'});
      if(!UUID.test(data.client_id||''))return reply(400,{error:'Invalid donation identifier.'});
      for(const field of ['org','donor'])if(typeof data[field]!=='string'||!data[field].trim()||data[field].length>200)return reply(400,{error:'Invalid '+field});
      if(!/^\d{4}-\d{2}-\d{2}$/.test(data.donated_on||'')||!Number.isFinite(Date.parse(data.donated_on))||new Date(data.donated_on).toISOString().slice(0,10)!==data.donated_on||data.donated_on>new Date().toISOString().slice(0,10))return reply(400,{error:'Use a valid donation date that is not in the future.'});
      const amount=String(data.amount||'');if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(amount)||Number(amount)<=0)return reply(400,{error:'Enter a positive amount with at most two decimal places.'});
      if(data.currency!=='INR'||!['UPI','Bank transfer','Cash','Cheque','Other'].includes(data.mode))return reply(400,{error:'Invalid currency or payment mode.'});
      const email=typeof data.email==='string'?data.email.trim():'';const whatsapp=typeof data.whatsapp==='string'?data.whatsapp.trim():'';
      if((email&&(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))||(whatsapp&&!/^\+?[1-9]\d{7,14}$/.test(whatsapp)))return reply(400,{error:'Enter a valid email or international WhatsApp number.'});
      if(typeof data.thank_you!=='string'||!data.thank_you.trim()||data.thank_you.length>1000)return reply(400,{error:'Review the thank-you message.'});
      await query('?on_conflict=owner_hash,client_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({owner_hash:hash,client_id:data.client_id,org:data.org.trim(),donor:data.donor.trim(),donated_on:data.donated_on,amount,currency:'INR',mode:data.mode,email,whatsapp,thank_you:data.thank_you.trim()})});
      const rows=await query(`?owner_hash=eq.${hash}&client_id=eq.${data.client_id}&select=id,receipt_no,created_at&limit=1`);
      return reply(200,{record:rows[0]});
    }
    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id');
      if (id && !UUID.test(id)) return reply(400, {error:'Invalid record ID.'});
      const fields = id ? 'id,org,period,content,status,created_at,attachments' : 'id,org,period,status,created_at';
      const rows = await query(`?owner_hash=eq.${hash}&select=${fields}`+(id?`&id=eq.${id}&limit=1`:'&order=created_at.desc&limit=100'));
      if (id && !rows.length) return reply(404, {error:'Record not found in this workspace.'});
      return reply(200, id ? {record:rows[0]} : {records:rows});
    }
    if (!req.headers.get('content-type')?.includes('application/json')) return reply(415, {error:'Use JSON.'});
    // Stream with a byte limit; do not buffer arbitrary public request bodies.
    const reader = req.body?.getReader();
    if (!reader) return reply(400, {error:'Missing report.'});
    const chunks=[]; let size=0;
    while (true) {
      const {value,done}=await reader.read(); if(done) break;
      size+=value.length;
      if(size>2000000){await reader.cancel();return reply(413,{error:'Report is too large.'});}
      chunks.push(value);
    }
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let data;
    try {data=JSON.parse(new TextDecoder().decode(bytes));} catch {return reply(400,{error:'Invalid JSON.'});}
    if (!data || data.approved !== true) return reply(400, {error:'Review and approve the report before saving.'});
    for (const [field,min,max] of [['org',1,200],['period',1,150],['content',30,80000]]) {
      if(typeof data[field]!=='string'||data[field].trim().length<min||data[field].length>max) return reply(400,{error:`Invalid ${field}.`});
    }
    const headings=['ACTIVITIES THIS WEEK','BENEFICIARIES REACHED (NUMBERS)','CHALLENGES','NEXT WEEK','PHOTOS (LIST CAPTIONS)'];
    if(!headings.every(h=>data.content.includes(h))||data.content.trim().split(/\s+/u).length>=400)return reply(400,{error:'A report needs all five sections and fewer than 400 words.'});
    const attachments=data.attachments||[];
    if(!Array.isArray(attachments)||attachments.length>2)return reply(400,{error:'At most two photos are allowed.'});
    for(const photo of attachments){
      if(!photo||typeof photo.name!=='string'||photo.name.length>150||typeof photo.data_url!=='string'||photo.data_url.length>667000||!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(photo.data_url))return reply(400,{error:'Invalid photo attachment.'});
      const bytes=atob(photo.data_url.split(',')[1]);const png=bytes.startsWith('\x89PNG\r\n\x1a\n');const jpg=bytes.charCodeAt(0)===255&&bytes.charCodeAt(1)===216;
      if(!png&&!jpg)return reply(400,{error:'Photo file content is invalid.'});
    }
    if (!/^[a-f0-9]{64}$/.test(data.client_id || '')) return reply(400,{error:'Invalid save identifier.'});
    await query('?on_conflict=owner_hash,client_id', {method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({owner_hash:hash,client_id:data.client_id,org:data.org.trim(),period:data.period.trim(),content:data.content,attachments,status:'approved'})});
    const rows=await query(`?owner_hash=eq.${hash}&client_id=eq.${data.client_id}&select=id,org,period,status,created_at&limit=1`);
    if(!rows.length) throw new Error('Missing saved report');
    return reply(200,{record:rows[0]});
  } catch {
    return reply(503, {error:'Could not access saved records. Please try again.'});
  }
});
