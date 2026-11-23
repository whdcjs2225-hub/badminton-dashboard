import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {redact} from './lib.mjs';
import {parseProductEvidence,relevantMarketTitle,retainMarketRecords,readProductDom} from './market-logic.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),file=path.join(root,'data/market.json'),now=new Date().toISOString();
if(!process.env.GITHUB_ACTIONS&&!process.argv.includes('--local'))throw Error('Local inspection requires --local; not a cloud result');
const old=JSON.parse(await fs.readFile(file,'utf8')),source=old.sources.find(x=>x.id==='joongna');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({locale:'ko-KR',timezoneId:'Asia/Seoul',viewport:{width:1440,height:1000},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/'+browser.version()+' Safari/537.36'}),page=await context.newPage();
const observed=[],failures=[],queryResults=[];let domainBlocked=false;
const message=e=>redact(e.message).split('\n')[0].slice(0,180);
function checkResponse(response){const status=response?.status()||0;if([401,403,429].includes(status)){domainBlocked=true;throw Error('Public source HTTP '+status+'; no credentials or bypass attempted')}if(status>=400)throw Error('Public source HTTP '+status);return status}
try{
 for(const category of ['machine','racket']){
  const query=source.searchLinks.find(x=>x.category===category);let urls=[],httpStatus=null,pageTitle='';
  if(domainBlocked){queryResults.push({category,status:'blocked',latestSortAccepted:false});continue}
  if(query){try{
   const response=await page.goto(query.url,{waitUntil:'domcontentloaded',timeout:35000});httpStatus=response?.status()||0;checkResponse(response);pageTitle=redact(await page.title());
   if(/access denied|접근.*제한|captcha|로그인/i.test(pageTitle)){domainBlocked=true;throw Error('Public search unavailable: '+pageTitle)}
   if(!page.url().includes('sort=RECENT_SORT'))throw Error('Configured native latest-sort URL not retained');
   await page.waitForFunction(()=>[...document.querySelectorAll('main a[href*="/product/"]')].some(a=>/원/.test(a.innerText)),null,{timeout:15000});
   const exclude=page.getByRole('checkbox',{name:/판매완료 상품 제외/}).first();let excludeSoldConfirmed=false;
   if(await exclude.count()){await exclude.check({timeout:5000});excludeSoldConfirmed=await exclude.isChecked()}
   const mainText=await page.locator('main').innerText();if(/총\s*0\s*개/.test(mainText))throw Error('Public result count zero; retain previous records');
   const cards=await page.locator('main a[href*="/product/"]').evaluateAll(nodes=>nodes.map(a=>({url:a.href,text:a.innerText})).filter(x=>/원/.test(x.text)));
   urls=[...new Set(cards.filter(x=>{try{const u=new URL(x.url);return u.hostname==='web.joongna.com'&&/^\/product\/\d+$/.test(u.pathname)&&relevantMarketTitle(x.text,category)}catch{return false}}).map(x=>new URL(x.url).origin+new URL(x.url).pathname))].slice(0,4);
   if(!urls.length)throw Error('No validated native product cards');queryResults.push({category,status:'ok',httpStatus,latestSortAccepted:true,excludeSoldConfirmed,candidates:urls.length});
  }catch(e){failures.push({category,phase:'search',httpStatus,pageTitle,message:message(e)});queryResults.push({category,status:domainBlocked?'blocked':'failed',httpStatus,latestSortAccepted:false})}}
  if(domainBlocked)continue;
  if(!urls.length)urls=old.items.filter(x=>x.category===category&&x.source==='중고나라').map(x=>x.url).slice(0,4);
  for(const url of urls){let detailStatus=null,detailTitle='';try{
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});detailStatus=response?.status()||0;checkResponse(response);detailTitle=redact(await page.title());
   if(/access denied|접근.*제한|captcha|로그인/i.test(detailTitle)){domainBlocked=true;throw Error('Public product unavailable: '+detailTitle)}
   const heading=page.getByRole('heading',{level:1}).first();await heading.waitFor({timeout:12000});const headingText=await heading.textContent();if(!relevantMarketTitle(headingText||'',category))throw Error('Unexpected product heading: '+redact(headingText||'').slice(0,100));
   const evidence=await heading.evaluate(readProductDom);if(!evidence.priceBlock)throw Error('No validated price near product heading');
   const mainText=await page.locator('main').innerText();const shippingText=mainText.match(/거래\s*방법([\s\S]*?)(?:결제\s*혜택|새\s*상품|상품\s*정보)/)?.[1]||'';
   const description=await page.getByRole('article').first().textContent().catch(()=>'');const item=parseProductEvidence({...evidence,shippingText,description,url,category,checkedAt:now});if(!item)throw Error('Product title/price/type not validated');observed.push(item);
  }catch(e){failures.push({category,phase:'detail',url,httpStatus:detailStatus,pageTitle:detailTitle,message:message(e)});if(domainBlocked)break}}
 }
}finally{await context.close();await browser.close()}
const full=queryResults.length===2&&queryResults.every(q=>q.status==='ok'&&q.excludeSoldConfirmed)&&failures.length===0&&observed.length>0,status=full?'ok':observed.length?'partial':domainBlocked?'blocked':'failed';
const failureNote=domainBlocked?' 공개 출처의 접근 제한 응답을 확인해 추가 요청을 중단했습니다.':'';
const updated={...old,attemptedAt:now,lastSuccessfulRefreshAt:observed.length?now:old.lastSuccessfulRefreshAt,refreshMode:'GitHub 주간 익명 공개 검색·재확인. 전체 시장 실시간 자료가 아닙니다.',items:retainMarketRecords(old.items,observed),sources:old.sources.map(s=>s.id==='joongna'?{...s,status,lastAttemptAt:now,lastSuccessAt:full?now:s.lastSuccessAt,message:'신규검색 '+queryResults.filter(x=>x.status==='ok').length+'/2, 상세확인 '+observed.length+'건, 실패 '+failures.length+'건.'+failureNote+' 기존 자료와 확인 시각을 보존합니다.'}:s)};
await fs.writeFile(file,JSON.stringify(updated,null,2)+'\n','utf8');await fs.mkdir(path.join(root,'reports'),{recursive:true});const report={checkedAt:now,environment:process.env.GITHUB_ACTIONS?'github-actions':'explicit-local-test',status,queryResults,detailVerified:observed.length,retained:updated.items.length,failures};await fs.writeFile(path.join(root,'reports/market-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
