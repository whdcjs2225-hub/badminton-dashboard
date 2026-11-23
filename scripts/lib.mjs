export const SOURCE_NAMES={wekkuk:'위꾹',facecock:'페이스콕',bkplay:'BKPLAY',sponet:'스포넷',badmintongame:'전국배드민턴대회',ohmy:'오마이민턴'};
export function cleanText(value){return String(value??'').replace(/\r/g,'').replace(/[\t ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim()}
export function redact(value){return cleanText(value).replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[이메일은 원문 확인]').replace(/(?<!\d)(?:\+82[-. ]?)?0\d{1,2}[-. ]?\d{3,4}[-. ]?\d{4}(?!\d)/g,'[연락처는 원문 확인]').replace(/(?<!\d)\d{3,6}[- ]\d{2,6}[- ]\d{3,8}(?!\d)/g,'[번호는 원문 확인]').replace(/\b\d{10,18}\b/g,'[번호는 원문 확인]').replace(/(?:담당자|전무이사|사무국장|연락담당)\s*[가-힣]{2,4}/g,'[담당자 정보는 원문 확인]').replace(/[A-Z]:\\[^\s<>"']+/gi,'[개인 경로 제외]').replace(/\/(?:Users|home\/runner)\/[^\s<>"']+/g,'[개인 경로 제외]')}
export function safeUrl(value){try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return '';for(const k of [...u.searchParams.keys()])if(/(?:token|password|secret|auth|session|api.?key|signature|credential)/i.test(k))u.searchParams.delete(k);return u.href}catch{return ''}}
export function sanitizeRecord(t){const out={};for(const [k,v] of Object.entries(t)){if(k==='sourceLinks'){out[k]=(Array.isArray(v)?v:[]).map(x=>({site:redact(x.site),url:safeUrl(x.url)})).filter(x=>x.url)}else if(k==='url'){out[k]=safeUrl(v)}else if(Array.isArray(v)){out[k]=v.map(x=>typeof x==='string'?redact(x):x)}else if(typeof v==='string'){out[k]=redact(v)}else out[k]=v}return out}
export function scopeDecision(t){const title=cleanText(t.title),evidence=cleanText(t.scopeEvidence||''),location=cleanText(t.location||'');if(/선수권|엘리트|소년체전|전국체전|학생선수|학교대항|실업연맹|대학연맹/.test(title))return {include:false,reason:'elite_or_school'};if(/전국/.test(title+' '+evidence)){let scope='national';if(/충주/.test(title+' '+location))scope+=' chungju chungcheong';else if(/충북|충남|충청북도|충청남도|단양|제천/.test(location))scope+=' chungcheong';return {include:true,scope,scopeLabel:scope.includes('chungju')?'전국 · 충주시 · 충청권':scope.includes('chungcheong')?'전국 · 충청권':'전국'}}if(/충주/.test(title+' '+evidence)&&!/충주가 아닌/.test(evidence))return {include:true,scope:'chungju chungcheong',scopeLabel:'충주시 · 충청권'};if(/충청북도|충청남도|충북|충남/.test(title)&&/도지사|도협회|도민|충청북도|충청남도/.test(title)&&!/시장기|군수기|구청장기|시협회|군협회/.test(title))return {include:true,scope:'chungcheong',scopeLabel:'충북·충남 도 단위'};return {include:false,reason:'outside_scope_or_unverified'}}
export function normalizeTitle(s){return cleanText(s).normalize('NFKC').replace(/open/gi,'오픈').replace(/\(\s*준자강\s*신청\s*\)/g,'').replace(/\s|[()\[\]{}·,.\-_/]/g,'').toLowerCase()}
export function aliases(t){const a=new Set(t.platformAliases||[]);if(t.id)a.add(t.id);for(const s of t.sourceLinks||[]){try{const u=new URL(s.url),ga=u.searchParams.get('ga_id')||u.searchParams.get('wr_id'),bk=u.searchParams.get('tnmtId');if(ga&&/facecock|badmintongame/.test(u.hostname))a.add('game-'+ga);if(bk&&u.hostname.endsWith('bkplay.kr'))a.add('bk-'+bk)}catch{}}return a}
export function dateIdentity(t){return t.startDate||String(t.date||'').match(/20\d{2}[.-]\d{1,2}[.-]\d{1,2}/)?.[0].replaceAll('.','-')||''}
export function sameEvent(a,b){const aa=aliases(a),bb=aliases(b);if([...aa].some(x=>bb.has(x)))return true;const ad=dateIdentity(a),bd=dateIdentity(b);return !!ad&&ad===bd&&normalizeTitle(a.title)===normalizeTitle(b.title)}
export function unionLinks(a,b){const seen=new Set();return [...(a||[]),...(b||[])].map(x=>({site:redact(x.site),url:safeUrl(x.url)})).filter(x=>x.url&&!seen.has(x.url)&&seen.add(x.url))}
export function mergeRecords(previous,incoming,now){
  const result=previous.map(t=>structuredClone(t));
  const changes=[];
  for(const raw of incoming){
    const item=sanitizeRecord(raw);
    const index=result.findIndex(t=>sameEvent(t,item));
    if(index<0){
      const decision=scopeDecision(item);
      if(!decision.include)continue;
      result.push({...item,...decision,section:'new',firstSeen:now.slice(0,10),lastListSeenAt:now,gradeLabel:item.gradeLabel||'요강 확인 필요',grade:item.grade||'자동 목록 수집만 완료했습니다. 참가 자격·급수·입상·승급 기준은 원문 요강에서 확인해야 합니다.',conditions:item.conditions||'원문 상세 요강 미검증',unknowns:item.unknowns||'목록에서 확인되지 않은 내용은 추정하지 않음'});
      changes.push({id:item.id,type:'new',title:item.title});
      continue;
    }
    const old=result[index];
    const next={...old};
    for(const field of ['title','date','startDate','endDate','location','registrationPeriod','deadline','deadlineISO','host']){
      const allowed=item.detailVerified||['date','startDate','endDate'].includes(field)||!old[field];
      if(!item[field]||!allowed||/^(?:미확인|미게시|원문 확인 필요)$/.test(item[field]))continue;
      if(old[field]&&old[field]!==item[field]){
        next.changes=[...(next.changes||[]),now.slice(0,10)+' '+field+': '+old[field]+' → '+item[field]].slice(-20);
        next.section='new';
        if(!changes.some(x=>x.id===item.id))changes.push({id:item.id,type:'changed',title:item.title});
        if(field==='date')next.conflicts=[...new Set([...(next.conflicts||[]),'일정 변경 기록: '+old[field]+' → '+item[field]])];
      }
      next[field]=item[field];
    }
    next.sourceLinks=unionLinks(old.sourceLinks,item.sourceLinks);
    next.sourceSites=[...new Set([...(old.sourceSites||[]),...(item.sourceSites||[])])];
    next.platformAliases=[...new Set([...aliases(old),...aliases(item)])];
    next.lastListSeenAt=now;
    if(item.detailVerified){next.lastChecked=now.slice(0,10);next.lastBasicDetailCheckAt=now;}
    if(item.rulesVerified){for(const k of ['conditions','grade','gradeLabel','fee','method'])if(item[k])next[k]=item[k];next.detailLastChecked=now.slice(0,10);}
    result[index]=next;
  }
  return {tournaments:result,changes};
}
export function applySourceResults(state,results,now,{probe=false}={}){const next=structuredClone(state);next.lastAttemptAt=now;next.sources=Object.keys(SOURCE_NAMES).map(id=>{const old=(state.sources||[]).find(x=>x.id===id)||{id,name:SOURCE_NAMES[id],lastSuccessAt:null};const r=results.find(x=>x.id===id)||{status:'failed',message:'결과 없음'};return {...old,...Object.fromEntries(Object.entries(r).filter(([k])=>!['records','lastSuccessAt','name'].includes(k))),id,name:SOURCE_NAMES[id],lastAttemptAt:now,lastSuccessAt:r.status==='ok'?now:old.lastSuccessAt||null}});const accepted=results.filter(r=>['ok','partial'].includes(r.status)).flatMap(r=>r.records||[]);if(!probe){const weeklyBase=accepted.length?state.tournaments.map(t=>({...t,section:'existing'})):state.tournaments;const m=mergeRecords(weeklyBase,accepted,now);next.tournaments=m.tournaments;next.latestChanges=m.changes;next.tournaments=next.tournaments.map(sanitizeRecord);if(results.some(r=>['ok','partial'].includes(r.status)&&r.records?.length))next.lastSuccessfulRefreshAt=now;next.history=[{at:now,ok:results.filter(r=>r.status==='ok').map(r=>r.id),failed:results.filter(r=>r.status!=='ok').map(r=>r.id),new:m.changes.filter(x=>x.type==='new').length},...(state.history||[])].slice(0,52)}return next}
export function assertState(state){if(!state||!Array.isArray(state.tournaments)||!Array.isArray(state.sources))throw Error('Invalid state shape');const ids=new Set();for(const t of state.tournaments){if(!t.id||!t.title||ids.has(t.id))throw Error('Missing or duplicate event id');ids.add(t.id)}if(state.sources.length!==6)throw Error('Six source statuses required');return true}
export function getCounts(events,at=new Date()){const now=at.getTime();return {total:events.length,new:events.filter(t=>t.section==='new').length,existing:events.filter(t=>t.section==='existing').length,urgent:events.filter(t=>{const d=Date.parse(t.deadlineISO||'');return Number.isFinite(d)&&d>=now&&d-now<=10*86400000}).length}}
export function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
export function scriptJSON(v){return JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')}
