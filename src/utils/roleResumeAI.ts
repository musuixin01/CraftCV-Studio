import type {OnePageCandidate,OnePageTextField} from './onePageAI.ts';
import {MAX_ONEPAGE_AI_FIELDS,MAX_ONEPAGE_AI_TEXT_LENGTH,
  MAX_ONEPAGE_JOB_DESCRIPTION,containsOnePageSensitiveContact,
  validateOnePageCandidate,collectOnePageTextFields,
  applyReviewedOnePageCandidates} from './onePageAI.ts';
import type {ResumeDocument} from '../types/resume.ts';
import {validateStoredResume} from './resumeGenerationGuard.ts';

export interface RoleResumeAISuggestion extends OnePageCandidate{
  evidenceQuote:string;
}
export interface RoleAIRequest{
  targetRole:string;
  jobDescription:string;
  fields:OnePageTextField[];
}
const VALID_ID=/^(?:basics\.summary|(?:projects|experience|skills|awards|education)\.\d+\.(?:summary|bullets\.\d+|items|description|courses|honors)|custom\.\d+\.\d+\.bullets\.\d+)$/;
/** User-facing and server-side payload validation, without sending identity/attachments. */
export function validateRoleAIRequest(raw:unknown):RoleAIRequest{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('AI 岗位生成参数无效。');
  const x=raw as Record<string,unknown>;
  if(typeof x.targetRole!=='string'||!x.targetRole.trim()||x.targetRole.length>120||
    containsOnePageSensitiveContact(x.targetRole)||
    typeof x.jobDescription!=='string'||x.jobDescription.length>MAX_ONEPAGE_JOB_DESCRIPTION||
    containsOnePageSensitiveContact(x.jobDescription))
    throw new Error('目标岗位或 JD 包含不允许发送的联系方式，或超过长度限制。');
  if(!Array.isArray(x.fields)||x.fields.length<1||x.fields.length>MAX_ONEPAGE_AI_FIELDS)
    throw new Error('本次可润色字段数量应为 1–48 条；请按模块减少内容。');
  const seen=new Set<string>();
  let length=0;
  const fields:OnePageTextField[]=[];
  for(const rawField of x.fields){
    if(!rawField||typeof rawField!=='object'||Array.isArray(rawField))
      throw new Error('候选描述字段格式无效。');
    const f=rawField as Record<string,unknown>;
    if(typeof f.id!=='string'||!VALID_ID.test(f.id)||seen.has(f.id)||
      typeof f.label!=='string'||!f.label.trim()||f.label.length>100||
      containsOnePageSensitiveContact(f.label)||
      typeof f.original!=='string'||f.original.trim().length<24||
      f.original.length>1600||containsOnePageSensitiveContact(f.original))
      throw new Error('描述内容包含敏感信息或无效字段，未提交给模型。');
    seen.add(f.id);length+=f.original.length;
    fields.push({id:f.id,label:f.label,original:f.original.trim()});
  }
  if(length>MAX_ONEPAGE_AI_TEXT_LENGTH)
    throw new Error('本次候选文字超过 16000 字，请先分模块精简后再使用 AI。');
  return {targetRole:x.targetRole.trim(),jobDescription:x.jobDescription.trim(),fields};
}

function unsupportedStatusShift(original:string,proposed:string):boolean{
  const tentative=/(?:仍在|正在|尚在).{0,8}(?:验证|测试|开发|调试)(?:中|阶段)?|(?:验证|测试|开发|调试)中|待(?:测试|验证)/.test(original);
  const unsupportedSuccess=/(?:已?稳定运行|正式上线|已投入生产|验证通过|测试通过|验收通过|通过(?:验证|测试|验收))/.test(proposed);
  const established=/(?:已?稳定运行|正式上线|已投入生产|验证通过|测试通过|验收通过|通过(?:验证|测试|验收))/.test(original);
  return tentative&&unsupportedSuccess&&!established;
}

/** High-confidence contradictions to explicit scope, not a semantic truth detector. */
function highConfidenceDutyConflicts(original:string,proposed:string):string[]{
  const warnings:string[]=[];
  // "协助处理" may be legitimately explained in stronger prose, but "全面负责"
  // is an unsupported escalation without an explicit original leadership claim.
  const participated=/(?:参与|协助|配合)/.test(original);
  const broadLeadership=/(?:全面负责|全盘负责|全权负责|统筹主导)/;
  if(participated&&broadLeadership.test(proposed)&&!broadLeadership.test(original))
    warnings.push('原文仅记录协作或参与，不得直接升级为全面负责。');

  // A direct negative ("不含预算审批") cannot become the positive responsibility
  // ("负责预算审批") even if no new numbers or technology names appear.
  const negated=/(?:不含|不涉及|未涉及|不负责|未负责|未参与|没有承担)\s*([\u4e00-\u9fffA-Za-z]{2,12})/g;
  for(const match of original.matchAll(negated)){
    const duty=match[1];
    if(!duty)continue;
    // The captured duty contains only Chinese characters or letters.
    const positive=new RegExp('(?:负责|承担|主导|主持|统筹|执行|审批|参与)[^，。；;]{0,8}'+duty,'i');
    const stillNegated=new RegExp('(?:不含|不涉及|未涉及|不负责|未负责|未参与|没有承担)\\s*'+duty,'i');
    if(positive.test(proposed)&&!stillNegated.test(proposed)){
      warnings.push('原文明确排除「'+duty+'」，不得反向声称承担该职责。');
    }
  }
  return [...new Set(warnings)];
}
export function validateRoleAISuggestion(
  field:OnePageTextField,candidate:unknown,
):string[]{
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))
    return ['AI 建议结构不是对象'];
  const x=candidate as Record<string,unknown>;
  const issues:string[]=[];
  if(x.id!==field.id)issues.push('字段 ID 不匹配');
  if(typeof x.reason!=='string'||x.reason.trim().length<8||x.reason.length>240)
    issues.push('需要真实且具体的写作理由');
  if(typeof x.evidenceQuote!=='string'||x.evidenceQuote.trim().length<3||
    !field.original.includes(x.evidenceQuote.trim()))
    issues.push('原文字句引文无法追溯');
  issues.push(...validateOnePageCandidate(field,x.proposed));
  if(typeof x.proposed==='string'&&unsupportedStatusShift(field.original,x.proposed))
    issues.push('原文仍在开发、测试或验证中，不得改写成已经通过或稳定运行');
  if(typeof x.proposed==='string')issues.push(...highConfidenceDutyConflicts(field.original,x.proposed));
  if(typeof x.proposed==='string'&&containsOnePageSensitiveContact(x.proposed))
    issues.push('AI 候选出现敏感联系方式');
  return [...new Set(issues)];
}
export function filterRoleAISuggestions(
  fields:OnePageTextField[],items:unknown,
):{suggestions:RoleResumeAISuggestion[];rejectedCount:number}{
  if(!Array.isArray(items)||items.length>100)
    throw new Error('AI 建议格式或数量异常，未应用任何修改。');
  const source=new Map(fields.map((field)=>[field.id,field]));
  const seen=new Set<string>();
  let rejectedCount=0;
  const suggestions:RoleResumeAISuggestion[]=[];
  for(const raw of items){
    const id=raw&&typeof raw==='object'&&(raw as Record<string,unknown>).id;
    if(typeof id!=='string'||seen.has(id)||!source.has(id)){
      rejectedCount++;continue;
    }
    seen.add(id);
    const field=source.get(id)!;
    if(validateRoleAISuggestion(field,raw).length){rejectedCount++;continue;}
    const x=raw as Record<string,string>;
    suggestions.push({id,proposed:x.proposed.trim(),reason:x.reason.trim(),
      evidenceQuote:x.evidenceQuote.trim()});
  }
  return {suggestions,rejectedCount};
}
/** Compose a copy only. The original draft and confirmed master remain untouched. */
export function previewRoleAIChanges(draft:ResumeDocument,selected:OnePageCandidate[]):ResumeDocument{
  const originals=new Map(collectOnePageTextFields(draft).map((row)=>[row.id,row.original]));
  for(const item of selected){
    const before=originals.get(item.id);
    if(before&&unsupportedStatusShift(before,item.proposed))
      throw new Error('候选项目状态与原文矛盾：仍在开发或验证中的经历不能写成已完成。');
    if(before){
      const forbidden=highConfidenceDutyConflicts(before,item.proposed);
      if(forbidden.length)throw new Error('候选职责与原文矛盾：'+forbidden[0]);
    }
  }
  const result=applyReviewedOnePageCandidates(draft,selected);
  const errors=validateStoredResume(result);
  if(errors.length)throw new Error('改写后简历结构不完整：'+errors.slice(0,2).join('；'));
  return result;
}
