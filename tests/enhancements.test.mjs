import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGradePageData,publicMarketData} from '../scripts/enhancements.mjs';
import {parseProductEvidence,relevantMarketTitle,retainMarketRecords,readProductDom} from '../scripts/market-logic.mjs';
const original={id:'a',title:'전국 배드민턴',grade:'2025년까지만 인정',conditions:'F급 지역 제한',detailLastChecked:'2026-11-16'};
const rules={rules:[{id:'a',sourceGrade:original.grade,sourceConditions:original.conditions,family:'대회 입상',period:'2025년까지',missing:[],restrictions:[],evidenceLevel:'보존된 요강'}]};
test('급수 원문과 요강 확인일을 보존하고 목록 시각과 분리',()=>{const r=buildGradePageData([original],rules,'2026-11-23');assert.equal(r.events[0].grade,original.grade);assert.equal(r.events[0].detailLastChecked,'2026-11-16');assert.equal(r.events[0].summary.summaryStale,false)});
test('요강 내용이 바뀌면 기존 요약을 재검토 대상으로 표시',()=>assert.equal(buildGradePageData([{...original,grade:'변경됨'}],rules,'now').events[0].summary.summaryStale,true));
test('신규 대회의 급수 규칙은 자동으로 추정하지 않음',()=>{const r=buildGradePageData([{...original,id:'new'}],rules,'now').events[0];assert.equal(r.summary.summaryStale,true);assert.match(r.summary.family,/미분석/)});
test('중고 공개 스키마에는 개인 예산·판매자 정보 포함 안 함',()=>{const r=publicMarketData({privateBudget:1,sources:[],items:[{id:'x',category:'racket',url:'https://example.com/p',title:'라켓',sellerName:'PRIVATE',privateAddress:'PRIVATE'}]});assert.equal(r.privateBudget,undefined);assert.equal(r.items[0].sellerName,undefined);assert.equal(r.items[0].privateAddress,undefined)});
test('수수료 미확정이면 확인된 총액으로 표시하지 않음',()=>{const r=publicMarketData({sources:[],items:[{id:'x',category:'machine',url:'https://example.com/p',title:'머신',priceKRW:100,shippingKRW:0,feeKRW:null,totalKRW:100}]});assert.equal(r.items[0].totalKRW,null)});
const evidence={url:'https://web.joongna.com/product/123',category:'racket',title:'배드민턴 라켓',priceBlock:'배드민턴 라켓80,000원',header:'배드민턴 라켓80,000원47분 전',description:'미사용 보관품. 거트는 새로 끼워야 합니다. 정가 235,000원.',shippingText:'',checkedAt:'2026-11-23T13:00:00Z'};
test('상품가와 본문 정가를 혼동하지 않음',()=>assert.equal(parseProductEvidence(evidence).priceKRW,80000));
test('구매 버튼만으로 판매중 판정하지 않음',()=>assert.equal(parseProductEvidence(evidence).saleStatus,'unknown'));
test('배송 설명이 없으면 배송비도 미확인',()=>assert.equal(parseProductEvidence(evidence).shippingKRW,null));
test('삽니다·가방·수동 제목은 각각 해당 매물에서 제외',()=>{assert.equal(relevantMarketTitle('배드민턴 스트링머신 삽니다','machine'),false);assert.equal(relevantMarketTitle('배드민턴 라켓 가방','racket'),false);assert.equal(relevantMarketTitle('배드민턴 수동 스트링머신','machine'),false)});
test('상징 가격은 실제 구매가로 오해하지 않게 미확인 표시',()=>assert.equal(parseProductEvidence({...evidence,priceBlock:'라켓1원'}).priceKRW,null));
test('출처 실패는 기존 중고 기록을 삭제하지 않음',()=>{const old=[{url:'https://example.com/a',saleStatus:'unknown'}];assert.deepEqual(retainMarketRecords(old,[]),old)});
test('이전 판매완료를 미확인 재조회로 판매중처럼 되살리지 않음',()=>{const r=retainMarketRecords([{url:evidence.url,saleStatus:'sold'}],[{url:evidence.url,saleStatus:'unknown'}]);assert.equal(r[0].saleStatus,'sold')});

test('판매자 본문은 그대로 저장하지 않고 상태 신호만 요약',()=>{const p=parseProductEvidence({...evidence,description:'미사용 장기보관품. 제 이름은 PRIVATE_PERSON 입니다. 거트는 새로 끼워야 합니다.'});assert.ok(!p.condition.includes('PRIVATE_PERSON'));assert.match(p.condition,/미사용/);assert.match(p.condition,/거트/)});

test('개최일이 바뀌면 이전 연도 급수 요약을 그대로 확정하지 않음',()=>{const r={rules:[{...rules.rules[0],sourceEventDate:'2026.12.05'}]};assert.equal(buildGradePageData([{...original,date:'2027.12.05'}],r,'now').events[0].summary.summaryStale,true)});

test('중고 상세 DOM 깊이가 달라도 제목 근처 실제 가격을 읽음',()=>{const price={tagName:'SECTION',textContent:'배드민턴 라켓80,000원',innerText:'배드민턴 라켓\n80,000원',parentElement:{tagName:'MAIN',innerText:'배드민턴 라켓\n80,000원\n5분 전'}};const heading={textContent:'배드민턴 라켓',parentElement:{tagName:'DIV',textContent:'배드민턴 라켓',innerText:'배드민턴 라켓',parentElement:price}};assert.match(readProductDom(heading).priceBlock,/80,000/)});
test('접근 오류처럼 단순한 DOM도 부모 null 예외 없이 거부',()=>{const heading={textContent:'접근 제한',parentElement:{tagName:'BODY',textContent:'접근 제한',parentElement:null}};assert.equal(readProductDom(heading).priceBlock,'')});
