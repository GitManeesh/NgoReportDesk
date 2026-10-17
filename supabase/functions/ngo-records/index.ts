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
  const key = req.headers.get('x-workspace-key') || '';
  if (!/^[a-f0-9]{64}$/.test(key)) return reply(401, {error:'A valid workspace key is required.'});
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))), b=>b.toString(16).padStart(2,'0')).join('');
  const url = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !secret) return reply(503, {error:'Record storage is unavailable.'});
  const base = `${url}/rest/v1/ngo_report_records`;
  const dbHeaders = {apikey:secret, Authorization:`Bearer ${secret}`, 'Content-Type':'application/json'};
  const query = async (path, options={}) => {
    const response = await fetch(base+path, {...options, headers:{...dbHeaders,...options.headers}, signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('Storage request failed');
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  };
  try {
    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id');
      if (id && !UUID.test(id)) return reply(400, {error:'Invalid record ID.'});
      const fields = id ? 'id,org,period,content,status,created_at' : 'id,org,period,status,created_at';
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
      if(size>350000){await reader.cancel();return reply(413,{error:'Report is too large.'});}
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
    if (!/^[a-f0-9]{64}$/.test(data.client_id || '')) return reply(400,{error:'Invalid save identifier.'});
    await query('?on_conflict=owner_hash,client_id', {method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({owner_hash:hash,client_id:data.client_id,org:data.org.trim(),period:data.period.trim(),content:data.content,status:'approved'})});
    const rows=await query(`?owner_hash=eq.${hash}&client_id=eq.${data.client_id}&select=id,org,period,status,created_at&limit=1`);
    if(!rows.length) throw new Error('Missing saved report');
    return reply(200,{record:rows[0]});
  } catch {
    return reply(503, {error:'Could not access saved records. Please try again.'});
  }
});
