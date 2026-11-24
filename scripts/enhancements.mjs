import fs from 'node:fs/promises';
import path from 'node:path';
import {scriptJSON,sanitizeRecord,safeUrl,redact} from './lib.mjs';

function gradeDisplay(r,stale){
 const text=v=>redact(String(v??'')),list=v=>Array.isArray(v)?v.map(text):[];
 const system=r.system?{label:text(r.system.label),description:text(r.system.description),...Object.fromEntries(['self','external','association'].map(k=>[k,{status:['yes','partial','registration','not-stated','unknown'].includes(r.system[k]?.status)?r.system[k].status:'unknown',detail:text(r.system[k]?.detail)}]))}:null;
 return {system:stale?null:system,gradeCards:stale?[]:(r.gradeCards||[]).map(c=>({key:text(c.key),label:text(c.label),basis:text(c.basis),criteria:list(c.criteria),limits:list(c.limits),period:text(c.period),notes:list(c.notes),evidence:text(c.evidence)})),commonRules:list(r.commonRules),reviewedAt:r.reviewedAt||null,reviewSource:safeUrl(r.reviewSource)||null,verifiedExtract:text(r.verifiedExtract)};
}
export function buildGradePageData(events,structured,checkedAt){
  return {checkedAt,events:events.map(original=>{const t=sanitizeRecord(original),r=structured.rules.find(x=>x.id===t.id);const stale=!!r&&!!(r.sourceGrade!==t.grade||r.sourceConditions!==t.conditions||(r.sourceEventDate&&r.sourceEventDate!==t.date)||(r.sourceEventTitle&&r.sourceEventTitle!==t.title));return {...t,summary:r?{family:r.family,reference:r.reference,period:r.period,promotion:r.promotion,highest:r.highest,restrictions:r.restrictions,ageAndDiscipline:r.ageAndDiscipline,missing:r.missing,evidenceLevel:r.evidenceLevel,summaryStale:stale,...gradeDisplay(r,stale)}:{family:'새 대회 · 요강 미분석',reference:'미확인',period:'미확인',promotion:'미확인',highest:'미확인',restrictions:['원문 요강 확인 필요'],ageAndDiscipline:'미확인',missing:['자동 목록 수집만 완료. 급수 규칙은 임의 생성하지 않습니다.'],evidenceLevel:'목록만 확인 · 판정 보류',newUnanalyzed:true,summaryStale:true,system:null,gradeCards:[],commonRules:[]}}})};
}
export function publicMarketData(data){
  const categories=new Set(['machine','racket']),text=v=>redact(String(v??''));
  return {attemptedAt:data.attemptedAt||null,lastSuccessfulRefreshAt:data.lastSuccessfulRefreshAt||null,refreshMode:text(data.refreshMode),sources:(data.sources||[]).map(s=>({id:text(s.id),name:text(s.name),status:text(s.status),lastAttemptAt:s.lastAttemptAt||null,lastSuccessAt:s.lastSuccessAt||null,message:text(s.message),searchLinks:(s.searchLinks||[]).filter(l=>safeUrl(l.url)).map(l=>({category:l.category,url:safeUrl(l.url)}))})),items:(data.items||[]).filter(x=>categories.has(x.category)&&safeUrl(x.url)).map(x=>({id:text(x.id),category:x.category,title:text(x.title||''),brand:text(x.brand||'미표기'),priceKRW:Number.isFinite(x.priceKRW)&&x.priceKRW>0?x.priceKRW:null,feeKRW:Number.isFinite(x.feeKRW)?x.feeKRW:null,shippingKRW:Number.isFinite(x.shippingKRW)?x.shippingKRW:null,totalKRW:[x.priceKRW,x.shippingKRW,x.feeKRW].every(v=>Number.isFinite(v)&&v>=0)?x.priceKRW+x.shippingKRW+x.feeKRW:null,saleStatus:['active','sold','reserved'].includes(x.saleStatus)?x.saleStatus:'unknown',saleStatusEvidence:text(x.saleStatusEvidence||'판매 상태 미확인'),listedAt:x.listedAt||null,checkedAt:x.checkedAt||null,url:safeUrl(x.url),region:text(x.region||'지역 미확인'),condition:text(x.condition||'상태 미확인'),shippingEvidence:text(x.shippingEvidence||'배송 미확인'),risks:Array.isArray(x.risks)?x.risks.map(text):[],source:text(x.source||'공개 원문'),quality:x.quality==='archived'?'archived':'inspected',postedConditionEvidence:text(x.postedConditionEvidence||''),comparisonNotes:text(x.comparisonNotes||'')}))};
}
export async function buildEnhancements(root,events,state){
  const structured=JSON.parse(await fs.readFile(path.join(root,'data/grade-rules.json'),'utf8'));
  let market;try{market=JSON.parse(await fs.readFile(path.join(root,'data/market.json'),'utf8'))}catch{market={attemptedAt:null,lastSuccessfulRefreshAt:null,refreshMode:'아직 수집되지 않았습니다.',sources:[],items:[]}}
  const pages=[['grades',buildGradePageData(events,structured,state.lastAttemptAt||state.seedCheckedAt)],['market',publicMarketData(market)]];
  for(const [name,data]of pages){const template=await fs.readFile(path.join(root,'ui',name+'.template.html'),'utf8');if(!template.includes('__PAGE_DATA__'))throw Error('Missing page data slot: '+name);const html=template.replace('__PAGE_DATA__',()=>scriptJSON(data));if(/__[A-Z_]+__/.test(html))throw Error('Unfilled enhancement slot');await fs.writeFile(path.join(root,'site',name+'.html'),html,'utf8')}
  await fs.writeFile(path.join(root,'site/market-data.json'),JSON.stringify(publicMarketData(market),null,2)+'\n','utf8');
  return {gradeEvents:events.length,marketItems:market.items.length};
}
