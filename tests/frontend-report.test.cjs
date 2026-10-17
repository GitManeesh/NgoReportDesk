const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function app(fetch){
 const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,disabled:false,hidden:false,textContent:'',srcdoc:'',scrolls:0,scrollIntoView(){this.scrolls++;},addEventListener(){}});return elements.get(id);};
 const input={org:'Fictional NGO',period:'This week',notes:'Held a workshop with 24 participants.',beneficiaries:'24 participants at the workshop.',challenges:'Materials arrived late.',next:'Plan the next workshop.',photos:'Volunteers preparing materials.'};for(const[k,v]of Object.entries(input))get(k).value=v;get('ai-consent').checked=true;
 const context={document:{getElementById:get,querySelectorAll:()=>[]},location:{hash:'#report'},window:{addEventListener(){},dispatchEvent(){}},navigator:{onLine:true},MutationObserver:class{observe(){}},ReportContract:require('../dist/report-contract'),ReportLayout:require('../dist/report-layout'),fetch,AbortSignal,Event:class{},setInterval:()=>1,clearInterval(){},setTimeout,URL,Blob};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../dist/app.js','utf8'),context);return{get,input};
}
test('AI response populates and reveals the formatted report in the frontend',async()=>{
 const C=require('../dist/report-contract');let input;const report={activities:[{summary:'Held a workshop with 24 participants.',source_quote:'Held a workshop with 24 participants.'}],challenges:[],next_steps:[],warnings:[]};
 const a=app(async(url,options)=>{input=JSON.parse(options.body);return{ok:true,json:async()=>({report,report_text:C.build(input,report),requires_review:true})};});
 await a.get('ai-draft').onclick();assert.ok(a.get('review').value.includes('BENEFICIARIES REACHED (NUMBERS)'));assert.equal(a.get('draft-area').hidden,false);assert.equal(a.get('empty-report').hidden,true);assert.equal(a.get('report-preview').hidden,false);assert.ok(a.get('report-preview').srcdoc.includes('24 participants'));assert.ok(a.get('draft-area').scrolls>0);assert.match(a.get('report-progress').textContent,/Report received/);assert.equal(a.get('approve').checked,false);assert.equal(a.get('ai-draft').disabled,false);
});
test('backend failure is visible beside the report and keeps input intact',async()=>{
 const a=app(async()=>({ok:false,json:async()=>({error:'The AI service took too long to respond.'})}));await a.get('ai-draft').onclick();assert.match(a.get('report-progress').textContent,/too long/);assert.equal(a.get('notes').value,a.input.notes);assert.equal(a.get('ai-draft').disabled,false);assert.equal(a.get('draft-area').hidden,true);
});
