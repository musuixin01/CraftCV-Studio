import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRoleAIRequest,validateRoleAISuggestion,
  filterRoleAISuggestions} from '../src/utils/roleResumeAI.ts';
import {
  ROLE_EVAL_FIXTURE_VERSION,ROLE_EVAL_SCENARIOS,ROLE_EVAL_CASES
} from './fixtures/roleResumeQualityCases.mjs';

const scenarioMap=new Map(ROLE_EVAL_SCENARIOS.map(x=>[x.id,x]));
const expectedRisks=ROLE_EVAL_CASES.filter(x=>!x.accepted);
const expectedSafe=ROLE_EVAL_CASES.filter(x=>x.accepted);
const candidate=(testCase,field)=>({
  id:field.id,proposed:testCase.proposed,
  evidenceQuote:field.original.slice(0,Math.min(12,field.original.length)),
  reason:'按本岗位要求专业整理原文已有事实，不添加没有证据的经历或数字。',
});
function check(testCase){
  const scenario=scenarioMap.get(testCase.scenarioId);
  assert.ok(scenario,'Unknown role scenario: '+testCase.scenarioId);
  const field=scenario.fields.find(x=>x.id===testCase.fieldId);
  assert.ok(field,'Unknown field in '+scenario.id+': '+testCase.fieldId);
  return {field,candidate:candidate(testCase,field),scenario};
}

test('offline quality evaluation fixtures cover job families and career seniorities',()=>{
  assert.ok(ROLE_EVAL_FIXTURE_VERSION);
  assert.equal(ROLE_EVAL_SCENARIOS.length,4);
  assert.ok(ROLE_EVAL_SCENARIOS.some(x=>x.audience.includes('校招')));
  assert.ok(ROLE_EVAL_SCENARIOS.some(x=>x.audience.includes('社招')));
  assert.ok(ROLE_EVAL_SCENARIOS.some(x=>x.audience.includes('转岗')));
  assert.ok(ROLE_EVAL_SCENARIOS.some(x=>x.audience.includes('资深')));
  const observed=new Set(ROLE_EVAL_CASES.map(x=>x.category));
  for(const category of ['ordinary-edit','invented-metric','inflated-ownership',
    'false-completion','substituted-technology','cross-project-technology','negated-duty-reversal']){
    assert.ok(observed.has(category),category);
  }
});
test('all four role requests meet the actual server privacy/size contract',()=>{
  for(const scenario of ROLE_EVAL_SCENARIOS){
    const accepted=validateRoleAIRequest(scenario);
    assert.equal(accepted.fields.length,2);
    assert.ok(accepted.jobDescription.trim());
    assert.ok(accepted.targetRole.trim());
  }
});
test('safe, cross-sector professional rewrites are not blocked by lexical checks',()=>{
  for(const entry of expectedSafe){
    const {field,candidate}=check(entry);
    const issues=validateRoleAISuggestion(field,candidate);
    assert.deepEqual(issues,[],entry.scenarioId+' / '+entry.description+': '+issues.join('；'));
  }
});
test('high-risk invented claims and missing technical/quantitative evidence are blocked',()=>{
  for(const entry of expectedRisks){
    const {field,candidate}=check(entry);
    const issues=validateRoleAISuggestion(field,candidate);
    assert.ok(issues.length>0,entry.scenarioId+' / '+entry.description+' unexpectedly accepted');
  }
});
test('role model output is never accepted as a whole document; invalid suggestions are excluded',()=>{
  for(const scenario of ROLE_EVAL_SCENARIOS){
    const entries=ROLE_EVAL_CASES.filter(x=>x.scenarioId===scenario.id);
    const raw=entries.map((entry)=>candidate(entry,scenario.fields.find(x=>x.id===entry.fieldId)));
    const result=filterRoleAISuggestions(scenario.fields,raw);
    // Repetition of same field must not let later, potentially malicious answers override.
    assert.ok(result.suggestions.length<=scenario.fields.length);
    assert.ok(result.rejectedCount>=entries.length-scenario.fields.length);
  }
});
