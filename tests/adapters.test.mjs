import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRange,recordFromRow,applyDetail} from '../scripts/adapters.mjs';
test('대회 기간의 연도·월·일 변형 파싱',()=>{assert.deepEqual(parseRange('2026-12-05 ~ 2026-12-06'),{start:'2026-12-05',end:'2026-12-06'});assert.deepEqual(parseRange('2026.12.05–12.06'),{start:'2026-12-05',end:'2026-12-06'});assert.deepEqual(parseRange('12/05~12/06',2026),{start:'2026-12-05',end:'2026-12-06'});assert.equal(parseRange('미게시').start,undefined)});
test('시각 미명시를 확정 시각으로 표현하지 않음',()=>{const r=applyDetail({title:'전국 배드민턴대회',sourceLinks:[]},{pairs:{대회기간:'2026-12-05~2026-12-06',접수기간:'2026-11-01~2026-11-29'},links:[]},'2026-11-23T00:00:00Z');assert.equal(r.deadlineTimeKnown,false);assert.equal(r.detailVerified,true);assert.equal(r.rulesVerified,undefined)});
test('일반 소개·임의 문자열은 대회 행으로 성공처리 안 함',()=>{const source={id:'x',name:'source',url:'https://example.com'};assert.equal(recordFromRow({title:'로그인',dateText:'미확인'},source,2026),null);assert.equal(recordFromRow({title:'배드민턴 기계 판매',dateText:'날짜 없음'},source,2026),null)});

test('0000년 접수기간은 실제 접수 정보로 반영하지 않음',()=>{const r=applyDetail({title:'전국 배드민턴대회',registrationPeriod:'기존 접수기간',sourceLinks:[]},{pairs:{대회기간:'2026-12-05~2026-12-06',접수기간:'0000년 0월 0일 ~ 0000년 0월 0일'},links:[]},'2026-11-23T00:00:00Z');assert.equal(r.registrationPeriod,'기존 접수기간');assert.equal(r.verifiedFields.includes('registrationPeriod'),false)});
