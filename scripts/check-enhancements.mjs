import path from 'node:path';
export async function checkEnhancements(page,baseUrl,root){
 const result={grades:false,comparison:false,market:false,categoryButtons:false,mobileOverflow:false};
 await page.goto(new URL('grades.html',baseUrl).href,{waitUntil:'domcontentloaded'});
 if(await page.locator('#eventSelect option').count()<16)throw Error('Grade event baseline missing');
 await page.locator('#eventSelect').selectOption('chungju');await page.locator('#compareToggle').check();await page.locator('#compareSelect').selectOption('game-4189');
 if(await page.locator('[data-event-id]').count()!==2)throw Error('Two event comparison missing');
 const comparisonText=await page.locator('#comparison').innerText();if(!comparisonText.includes('2025')||!comparisonText.includes('2013'))throw Error('Original grade periods not represented');
 result.grades=true;result.comparison=true;await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Grade mobile overflow');await page.screenshot({path:path.join(root,'reports/grades-phone.png'),fullPage:false});
 await page.goto(new URL('market.html',baseUrl).href,{waitUntil:'domcontentloaded'});const machineTotal=await page.evaluate(()=>APP_DATA.items.filter(x=>x.category==='machine'&&!['sold','reserved'].includes(x.saleStatus)).length);if(await page.locator('[data-item-id]').count()!==machineTotal)throw Error('Machine button data mismatch');
 await page.locator('#categoryRacket').click();if(!await page.locator('#resultCount').innerText().then(x=>x.startsWith('라켓')))throw Error('Racket category did not switch');
 if(!await page.locator('#marketFilterBox').getAttribute('open').then(x=>x!==null))await page.locator('#marketFilterBox > summary').click();await page.locator('#marketSearch').fill('no-matching-product-qa');if(await page.locator('[data-item-id]').count()!==0)throw Error('Market search filter failure');await page.locator('#marketSearch').fill('');await page.locator('#maxPrice').fill('100000');const capped=await page.evaluate(()=>[...document.querySelectorAll('[data-item-id]')].every(el=>{const x=APP_DATA.items.find(i=>i.id===el.dataset.itemId);return Number.isFinite(x.priceKRW)&&x.priceKRW<=100000}));if(!capped)throw Error('Price cap includes unknown/over-cap price');await page.locator('#maxPrice').fill('');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Market mobile overflow');await page.locator('#marketFilterBox').evaluate(el=>el.open=false);await page.screenshot({path:path.join(root,'reports/market-phone.png'),fullPage:false});
 if((await page.evaluate(()=>window.__uiErrors||[])).length)throw Error('Enhancement JavaScript error');result.market=true;result.categoryButtons=true;return result;
}
