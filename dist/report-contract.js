(function(root){
'use strict';
const HEADINGS=['Activities this week','Beneficiaries reached (numbers)','Challenges','Next week','Photos (list captions)'];
const PROMPT="You write donor reports for a small NGO in India. Notes from this week (JSON): {{notes}}. Donor's required sections: 1) Activities this week 2) Beneficiaries reached (numbers) 3) Challenges 4) Next week 5) Photos (list captions).\nWrite in clear, plain English, factual, no adjectives like 'incredible'. Use only the numbers in the notes. Under 400 words.";
const count=text=>String(text).trim().split(/\s+/u).filter(Boolean).length;
function beneficiaries(notes){return String(notes).split(/\n|(?<=[.!?])\s+/u).map(x=>x.trim()).filter(x=>/\d/.test(x)&&/\b(beneficiar\w*|participants?|attendances?|attendees?|people|persons?|children|women|men|families|households?|students?)\b/i.test(x));}
function build(input,report){
 const sections=[report.activities.map(x=>x.summary),input.beneficiaries?.trim()?input.beneficiaries.split('\n').map(x=>x.trim()).filter(Boolean):beneficiaries(input.notes),report.challenges.map(x=>x.summary),report.next_steps.map(x=>x.summary),String(input.photos||'').split('\n').map(x=>x.trim()).filter(Boolean)];
 const text=['WEEKLY DONOR REPORT',input.org,'Reporting period: '+input.period,...HEADINGS.flatMap((h,i)=>['',h.toUpperCase(),...(sections[i].length?sections[i]:[i===4?'No photo captions provided.':'Not provided in the notes.'])])].join('\n');
 if(count(text)>=400)throw Error('The report must be under 400 words. Shorten your notes or summaries and try again.');
 return text;
}
function valid(text){return HEADINGS.every(h=>String(text).includes(h.toUpperCase()))&&count(text)<400;}
const api={HEADINGS,PROMPT,count,build,valid,beneficiaries};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReportContract=api;
})(typeof window!=='undefined'?window:globalThis);
