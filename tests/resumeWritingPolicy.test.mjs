import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { PRACTICAL_RESUME_WRITING_STANDARD } from '../src/utils/resumeWritingPolicy.ts';
import { newClaimWarnings, validateOptimizedItem } from '../src/utils/resumeGenerationGuard.ts';


import { DEFAULT_AI_SKILLS, loadAISkills, loadSelectedSkillIds, loadAutoSkillMode, saveAISkills, saveSelectedSkillIds, saveAutoSkillMode, recommendSkillsForTarget, ensureInitialSkillLibraryReset, STORAGE_AI_SKILLS_KEY, STORAGE_SELECTED_SKILLS_KEY, STORAGE_AUTO_SKILL_MODE_KEY, STORAGE_SKILLS_RESET_MARKER_KEY } from '../src/data/defaultAISkills.ts';

test('writing policy applies to experienced, entry-level, transfer and cross-industry roles',()=>{
  for(const term of ['实习','应届','社招','转岗','技术与非技术','职责','交付价值']) {
    assert.ok(PRACTICAL_RESUME_WRITING_STANDARD.includes(term),term);
  }
  assert.match(PRACTICAL_RESUME_WRITING_STANDARD,/不要求每一句都附第三方证明/);
  assert.match(PRACTICAL_RESUME_WRITING_STANDARD,/不能无依据增加/);
  assert.match(PRACTICAL_RESUME_WRITING_STANDARD,/不强制一页/);
});

test('the same writing policy is included in JD tailoring, one-page advising and item optimization',()=>{
  const server=readFileSync(new URL('../server.ts',import.meta.url),'utf8');
  const refs=server.match(/\$\{PRACTICAL_RESUME_WRITING_STANDARD\}/g)??[];
  assert.equal(refs.length,3);
  assert.ok(server.includes('        PRACTICAL_RESUME_WRITING_STANDARD,'));
  assert.ok(!server.includes('你是中国应届生技术岗位简历编辑'));
  assert.ok(!server.includes('你是一位资深电子信息工程（嵌入式软件'));
  assert.ok(server.includes('targetRole || \'通用岗位（用户尚未指定）\''));
});

test('only built-in skill definitions are removed; custom library and routing remain',()=>{
  const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
  const modal=readFileSync(new URL('../src/components/AIOptimizeModal.tsx',import.meta.url),'utf8');
  const server=readFileSync(new URL('../server.ts',import.meta.url),'utf8');
  assert.equal(existsSync(new URL('../src/components/AISkillLibraryCard.tsx',import.meta.url)),true);
  assert.equal(existsSync(new URL('../src/data/defaultAISkills.ts',import.meta.url)),true);
  assert.ok(app.includes('AISkillLibraryCard') && app.includes('AI技能库'));
  assert.ok(modal.includes('selectedSkills') && modal.includes('loadAISkills'));
  assert.ok(server.includes('skillMarkdown') && server.includes('selectedSkills') && server.includes('availableSkills'));
  assert.deepEqual(DEFAULT_AI_SKILLS,[]);
});
test('first read clears only three skill keys, while later new skills are retained',()=>{
  const custom={id:'skill-custom-41',name:'产品策略表达',category:'业务',
    description:'真实业务结果的表达',skillMarkdown:'# 自定义规则',isBuiltIn:false};
  const builtIn={...custom,id:'skill-star-quantify',name:'旧内置技能',isBuiltIn:true};
  const priorStore=new Map([
    ['craftcv_ai_skills_v1',JSON.stringify([builtIn,custom])],
    ['craftcv_selected_skill_ids_v1',JSON.stringify([builtIn.id,custom.id])],
    ['craftcv_auto_skill_mode_v1','false'],
    ['craftcv_ee_resume_v4_movable','{"id":"user-resume","private":"keep"}'],
    ['craftcv_slots_v3','KEEP-VERSIONS'],
    ['craftcv_ai_model_preference','KEEP-MODEL'],
  ]);
  const removals=[];
  const original=globalThis.localStorage;
  globalThis.localStorage={
    getItem(key){return priorStore.get(key)??null;},
    setItem(key,value){priorStore.set(key,String(value));},
    removeItem(key){removals.push(key);priorStore.delete(key);},
  };
  try{
    assert.deepEqual(loadAISkills(),[]);
    assert.deepEqual(loadSelectedSkillIds(),[]);
    assert.equal(loadAutoSkillMode(),true);
    assert.equal(priorStore.get(STORAGE_SKILLS_RESET_MARKER_KEY),'complete');
    assert.deepEqual(removals.sort(),[
      STORAGE_AI_SKILLS_KEY,STORAGE_AUTO_SKILL_MODE_KEY,STORAGE_SELECTED_SKILLS_KEY
    ].sort());
    assert.equal(priorStore.get('craftcv_ee_resume_v4_movable'),'{"id":"user-resume","private":"keep"}');
    assert.equal(priorStore.get('craftcv_slots_v3'),'KEEP-VERSIONS');
    assert.equal(priorStore.get('craftcv_ai_model_preference'),'KEEP-MODEL');
    saveAISkills([custom,builtIn]);
    saveSelectedSkillIds([custom.id,builtIn.id]);
    saveAutoSkillMode(false);
    assert.deepEqual(loadAISkills(),[custom]);
    assert.deepEqual(loadSelectedSkillIds(),[custom.id]);
    assert.equal(loadAutoSkillMode(),false);
    assert.equal(removals.length,3,'migration must not repeat after new user skills are created');
    assert.deepEqual(recommendSkillsForTarget(loadAISkills(),'experience','运营经历',{},'产品运营').matchedIds,[custom.id]);
  }finally {
    if(original===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=original;
  }
});
test('storage failure never marks the reset complete and never touches unrelated entries',()=>{
  const contents=new Map([
    [STORAGE_AI_SKILLS_KEY,'[]'],[STORAGE_SELECTED_SKILLS_KEY,'["skill-a"]'],
    [STORAGE_AUTO_SKILL_MODE_KEY,'true'],['resume-safe','keep'],
  ]);
  let fail=true;
  const original=globalThis.localStorage;
  globalThis.localStorage={
    getItem(key){return contents.get(key)??null;},
    setItem(key,value){contents.set(key,String(value));},
    removeItem(key){
      if(fail && key===STORAGE_SELECTED_SKILLS_KEY){fail=false;throw Error('storage blocked');}
      contents.delete(key);
    },
  };
  try{
    assert.equal(ensureInitialSkillLibraryReset(),false);
    assert.equal(contents.has(STORAGE_SKILLS_RESET_MARKER_KEY),false);
    assert.equal(contents.get('resume-safe'),'keep');
    assert.equal(ensureInitialSkillLibraryReset(),true);
    assert.equal(contents.get(STORAGE_SKILLS_RESET_MARKER_KEY),'complete');
    assert.equal(contents.get('resume-safe'),'keep');
  }finally {
    if(original===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=original;
  }
});
test('normal assertive editing is allowed while invented percentages and escalated scope remain blocked',()=>{
  const original={id:'p1',name:'系统',role:'参与开发',summary:'负责串口通信与错误处理',bullets:['完成串口命令解析与错误处理']};
  const polished={...original,summary:'实现串口通信及错误处理逻辑，提升控制指令处理的可维护性。',
    bullets:['设计并实现串口命令解析与错误处理模块']};
  assert.deepEqual(newClaimWarnings(original,polished),[]);
  assert.deepEqual(validateOptimizedItem('projects',original,polished),[]);
  const fabricated={...original,bullets:['独立负责全套系统，性能提升 70%']};
  const warnings=newClaimWarnings(original,fabricated).join('；');
  assert.match(warnings,/新增.*数字/);
  assert.match(warnings,/主导或独立负责/);
});
