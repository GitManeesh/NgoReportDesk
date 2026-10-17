const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
function setup(){
  let handler;const rows=[];
  vm.runInNewContext(fs.readFileSync(__dirname+'/../supabase/functions/ngo-records/index.ts','utf8'),{
    Deno:{serve:fn=>handler=fn,env:{get:key=>key==='SUPABASE_URL'?'https://db.test':'private-server-key'}},
    crypto:globalThis.crypto,TextEncoder,TextDecoder,Uint8Array,Response,URL,AbortSignal,
    fetch:async(url,opts)=>{
      const q=new URL(url).searchParams;
      if(opts.method==='POST'){
        const row=JSON.parse(opts.body);
        if(!rows.some(r=>r.owner_hash===row.owner_hash&&r.client_id===row.client_id))rows.push({...row,id:crypto.randomUUID(),created_at:new Date().toISOString()});
        return new Response(null,{status:204});
      }
      const matches=rows.filter(r=>['owner_hash','client_id','id'].every(k=>!q.has(k)||q.get(k)==='eq.'+r[k]));
      return Response.json(matches.map(r=>Object.fromEntries(q.get('select').split(',').map(k=>[k,r[k]]))));
    }
  });
  return {rows,call:async(key,method='GET',body,path='')=>handler(new Request('https://edge.test/ngo-records'+path,{method,headers:{'X-Workspace-Key':key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}))};
}
const payload={org:'Fictional Test NGO',period:'October 2026',content:require('../dist/report-contract.js').build({org:'Fictional Test NGO',period:'October 2026',notes:'Held a workshop with 24 participants.'},{activities:[{summary:'Held a workshop with 24 participants.'}],challenges:[],next_steps:[]}),approved:true,client_id:'a'.repeat(64)};
test('requires a workspace key and explicit approval',async()=>{
  const {call}=setup();assert.equal((await call('')).status,401);
  assert.equal((await call('1'.repeat(64),'POST',{...payload,approved:false})).status,400);
});
test('saves once, lists metadata, opens only within the owning workspace',async()=>{
  const {call,rows}=setup();const key='1'.repeat(64),other='2'.repeat(64);
  const first=await (await call(key,'POST',payload)).json();
  const retry=await (await call(key,'POST',payload)).json();assert.equal(first.record.id,retry.record.id);assert.equal(rows.length,1);
  const list=await (await call(key)).json();assert.equal(list.records.length,1);assert.equal(list.records[0].content,undefined);
  assert.equal((await (await call(other)).json()).records.length,0);
  assert.equal((await call(other,'GET',null,'?id='+first.record.id)).status,404);
  assert.equal((await (await call(key,'GET',null,'?id='+first.record.id)).json()).record.content,payload.content);
});
test('rejects invalid IDs, long metadata and unapproved writes',async()=>{
 const {call}=setup();assert.equal((await call('1'.repeat(64),'GET',null,'?id=bad')).status,400);
 assert.equal((await call('1'.repeat(64),'POST',{...payload,org:'x'.repeat(201)})).status,400);
});
