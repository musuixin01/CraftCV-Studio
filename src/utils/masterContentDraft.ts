import type { ResumeDocument } from '../types/resume';
import { listMasterContent, type MasterContentEntry } from './masterContentStore.ts';
import { validateStoredResume } from './resumeGenerationGuard.ts';
import { DEFAULT_EE_RESUME } from '../data/defaultResume.ts';
import {applyMasterRoleFields} from './masterRoleFields.ts';
import type {MasterSourceDocument} from './masterDocumentImportStore.ts';

const TECH=['stm32','freertos','rtos','esp32','fpga','c++','c#','python','linux','uart','usart','can','spi','i2c','sql','pcb','pid','dma','vue','react','测试','嵌入式','微控制器','硬件','软件','设计','运营','管理','销售','产品','市场','数据','财务','用户','项目','电路','智能','控制'];
const REMOVE_PII=/(?:\b1[3-9]\d{9}\b|\b\d{17}[\dXx]\b|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i;
const UNSAFE_TEXT=/(?:ignore\s+(?:all\s+)?previous|忽略.{0,15}(?:指令|规则)|system\s*prompt)/i;
export interface RankedMasterContent { entry: MasterContentEntry; score:number; matched:string[] }
function tokens(query:string):string[] {
  const lower=query.toLocaleLowerCase();
  const direct=TECH.filter((term)=>lower.includes(term));
  const english=(lower.match(/[a-z][a-z0-9+#.-]{2,28}/g)??[])
    .filter((term)=>!['and','the','with','for','work','from','job','this','that'].includes(term));
  const chinese=(lower.match(/[\u4e00-\u9fa5]{2,6}/g)??[])
    .filter((term)=>!['相关','岗位','要求','工作','项目','能力','负责','熟悉','优先'].includes(term));
  return [...new Set([...direct,...english,...chinese])].slice(0,60);
}
export function rankMasterContent(entries:MasterContentEntry[],jobText:string):RankedMasterContent[] {
  const terms=tokens(jobText);
  return entries.filter((x)=>x.userConfirmed).map((entry)=>{
    const name=entry.kind==='project'?entry.data.name:entry.data.company+' '+entry.data.position;
    const strong=[name,...entry.data.techStack].join(' ').toLocaleLowerCase();
    const weak=(entry.kind==='project'?[entry.data.summary,...entry.data.bullets]:entry.data.bullets).join(' ').toLocaleLowerCase();
    const matched=terms.filter((term)=>strong.includes(term)||weak.includes(term));
    const score=matched.reduce((n,term)=>n+(strong.includes(term)?4:1),0);
    return {entry,score,matched};
  }).sort((a,b)=>b.score-a.score || a.entry.title.localeCompare(b.entry.title));
}

/** Reject partially renamed demonstration documents that still carry the sample identity. */
export function isDemoIdentity(doc:ResumeDocument):boolean {
  if(doc.id===DEFAULT_EE_RESUME.id || doc.versionName.includes('示例简历'))return true;
  const demo=DEFAULT_EE_RESUME.basics;
  const specific=['name','phone','email','github','website'].some((key)=>{
    const value=doc.basics[key as 'name'|'phone'|'email'|'github'|'website'];
    return Boolean(value && value===demo[key as 'name'|'phone'|'email'|'github'|'website']);
  });
  const copiedDescriptors=['directionTags','statusTag','location','graduationYear','schoolTag']
    .filter((key)=>{
      const value=doc.basics[key as 'directionTags'|'statusTag'|'location'|'graduationYear'|'schoolTag'];
      return Boolean(value && value===demo[key as 'directionTags'|'statusTag'|'location'|'graduationYear'|'schoolTag']);
    }).length;
  return specific || copiedDescriptors>=2 || Boolean(doc.basics.showAvatar&&doc.basics.avatarUrl===demo.avatarUrl);
}
export interface ComposeMasterOptions {
  role:string;
  selectedIds:string[];
  selectedFieldIds?:string[];
  structuredSources?:MasterSourceDocument[];
  now?:string;
}
/** Creates a new *draft* based on current confirmed data. Never revises the mother or another slot. */
export function composeResumeFromMaster(
  base:ResumeDocument,library:MasterContentEntry[],options:ComposeMasterOptions,
):ResumeDocument {
  const role=options.role.trim();
  if(!role||role.length>120)throw new Error('请输入不超过 120 字的目标岗位。');
  if(isDemoIdentity(base))
    throw new Error('当前简历仍是演示资料，请先导入本人真实简历，再生成岗位版本。');
  const wanted=new Set(options.selectedIds);
  const fieldIds=options.selectedFieldIds??[];
  if(wanted.size!==options.selectedIds.length || wanted.size>14 ||
    (!wanted.size&&!fieldIds.length))
    throw new Error('请选择 1–14 条真实项目／工作经历，或已保存的教育／技能／奖项素材。');
  const found=library.filter((entry)=>wanted.has(entry.id)&&entry.userConfirmed);
  if(found.length!==wanted.size)throw new Error('选中的内容已经变化，请刷新内容库后重新生成。');
  const clone=JSON.parse(JSON.stringify(base)) as ResumeDocument;
  clone.basics.title=role;
  if(role!==base.basics.title)clone.basics.summary='';
  if(wanted.size){
    clone.projects=found.filter((x)=>x.kind==='project').map((x,index)=>{
      const p=JSON.parse(JSON.stringify(x.data));
      return {...p,id:'from-master-project-'+index+'-'+x.id};
    });
    clone.experience=found.filter((x)=>x.kind==='experience').map((x,index)=>{
      const ex=JSON.parse(JSON.stringify(x.data));
      return {...ex,id:'from-master-experience-'+index+'-'+x.id};
    });
    // Old provenance paths to replaced project/experience records cannot be carried forward.
    if(clone.factLedger)clone.factLedger.records=clone.factLedger.records.filter((x)=>
      !x.path.startsWith('projects/') && !x.path.startsWith('experience/'));
  }
  const result=applyMasterRoleFields(clone,options.structuredSources??[],fieldIds);
  result.updatedAt=options.now??new Date().toISOString();
  const issues=validateStoredResume(result);
  if(issues.length)throw new Error('生成草稿结构校验失败：'+issues.slice(0,2).join('；'));
  return result;
}
export interface CuratedMasterExcerpt {
  id:string;
  kind:'project'|'experience';
  title:string;
  outline:string;
  match:string[];
}
/** Send a few small, user-confirmed context excerpts, never an original attachment or whole master. */
export function retrieveCuratedContent(
  entries:MasterContentEntry[],query:string,
  section?:string,currentTitle?:string,max=3,
):CuratedMasterExcerpt[] {
  const ranked=rankMasterContent(entries,query).filter((item)=>{
    if(item.score<=0 && !currentTitle)return false;
    if(section==='projects' || section==='experience') {
      if(item.entry.kind!==(section==='projects'?'project':'experience'))return false;
      if(currentTitle) {
        const needle=currentTitle.trim().toLocaleLowerCase();
        const name=item.entry.title.trim().toLocaleLowerCase();
        return Boolean(needle&&name&&(needle===name||needle.includes(name)||name.includes(needle)));
      }
    }
    return item.score>0;
  });
  return ranked.slice(0,Math.min(Math.max(max,0),5)).map(({entry,matched})=>{
    const source=[entry.kind==='project'?entry.data.summary:entry.data.position,...entry.data.bullets.slice(0,2)].join('；');
    const safe=source.replace(REMOVE_PII,'[隐去个人标识]').slice(0,420);
    return {id:entry.id,kind:entry.kind,title:entry.title.slice(0,100),outline:safe,match:matched.slice(0,5)};
  }).filter((x)=>!UNSAFE_TEXT.test(x.outline)&&!REMOVE_PII.test(x.outline));
}

export async function loadRetrievedMasterContent(
  query:string,section?:string,currentTitle?:string,max=3,
):Promise<CuratedMasterExcerpt[]> {
  const entries=await listMasterContent();
  return retrieveCuratedContent(entries,query,section,currentTitle,max);
}
export function formatCuratedMasterForPrompt(raw:unknown):string {
  if(raw===undefined)return '';
  if(!Array.isArray(raw)||raw.length>5)throw new Error('母版内容摘要数量超出限制');
  const result:CuratedMasterExcerpt[]=[];
  for(const x of raw) {
    if(!x || typeof x!=='object' || Array.isArray(x))throw new Error('母版内容摘要格式无效');
    const row=x as Record<string,unknown>;
    if(typeof row.id!=='string'||!/^master-[a-z0-9-]{8,95}$/i.test(row.id)||
      !['project','experience'].includes(String(row.kind))||
      typeof row.title!=='string'||row.title.length>100||
      typeof row.outline!=='string'||row.outline.length>420||
      !Array.isArray(row.match)||row.match.length>5||
      !row.match.every((v)=>typeof v==='string'&&v.length<40)||
      REMOVE_PII.test(row.title+' '+row.outline)||UNSAFE_TEXT.test(row.title+' '+row.outline))
      throw new Error('母版内容包含非法或敏感文字，未发送给 AI');
    result.push({id:row.id,kind:row.kind as CuratedMasterExcerpt['kind'],
      title:row.title,outline:row.outline,match:row.match as string[]});
  }
  if(!result.length)return '';
  return '\n【本地内容库中用户确认收录的相关经历摘要：仅供本条目对照、润色，不代表第三方认证】\n'+
    JSON.stringify(result).replace(/</g,'\\u003c').replace(/>/g,'\\u003e')+
    '\n请勿将不同项目的职责和结果混为一谈，未出现在当前简历的全新经历不能擅自加入；需要新增经历时建议用户选择加入岗位版本。';
}
