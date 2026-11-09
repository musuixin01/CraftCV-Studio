/** Role-targeted selection of confirmed fields from already-extracted master documents.
 * Never loads DOCX/PDF Blob or their original sourceLines.
 */
import type {AwardItem,EducationItem,ResumeDocument,SkillCategory} from '../types/resume';
import type {MasterSourceDocument} from './masterDocumentImportStore.ts';

export type MasterRoleFieldKind='education'|'skills'|'awards';
export type MasterRoleFieldData=EducationItem|SkillCategory|AwardItem;
export interface MasterRoleField {
  key:string;
  kind:MasterRoleFieldKind;
  sourceId:string;
  sourceName:string;
  title:string;
  description:string;
  data:MasterRoleFieldData;
}
export interface RankedMasterRoleField {
  field:MasterRoleField;
  score:number;
  matched:string[];
}
export const MAX_ROLE_MASTER_FIELDS=20;
const groups=['education','skills','awards'] as const;
const tech=['stm32','freertos','rtos','esp32','fpga','python','linux','uart','c++','sql','react','vue','测试','嵌入式','硬件','软件','管理','市场','数据','设计','财务','电气','产品'];
function terms(job:string):string[]{
  const lower=job.toLowerCase();
  const direct=tech.filter((term)=>lower.includes(term));
  const english=(lower.match(/[a-z][a-z0-9+#.-]{2,24}/g)??[])
    .filter((t)=>!['with','from','have','work','experience','and','the'].includes(t));
  const chinese=(job.match(/[\u4e00-\u9fff]{2,10}/g)??[]).flatMap((t)=>t.length>4?
    [t,...Array.from({length:t.length-1},(_,i)=>t.slice(i,i+2))]:[t]);
  return [...new Set([...direct,...english,...chinese])].slice(0,48);
}
export function masterRoleFieldKey(sourceId:string,kind:MasterRoleFieldKind,itemId:string):string{
  return sourceId+'|'+kind+'|'+encodeURIComponent(itemId);
}
export function masterRoleFields(sources:MasterSourceDocument[]):MasterRoleField[]{
  const candidates:MasterRoleField[]=[];
  for(const source of sources){
    if(source.confirmedByUser!==true || !/^import-[a-f\d]{28}$/.test(source.id))continue;
    for(const kind of groups){
      const rows=source[kind]??[];
      for(const item of rows){
        const title=kind==='education'
          ?(item as EducationItem).school
          :kind==='skills'
            ?(item as SkillCategory).category
            :(item as AwardItem).title;
        const description=kind==='education'
          ?[(item as EducationItem).major,(item as EducationItem).degree,(item as EducationItem).courses,(item as EducationItem).honors].join(' · ')
          :kind==='skills'
            ?(item as SkillCategory).items
            :[(item as AwardItem).issuer,(item as AwardItem).level,(item as AwardItem).description].join(' · ');
        if(!title?.trim() || !item.id)continue;
        candidates.push({key:masterRoleFieldKey(source.id,kind,item.id),
          kind,sourceId:source.id,sourceName:source.name,
          title:title.trim().slice(0,180),description:description.trim().slice(0,850),
          data:structuredClone(item)});
      }
    }
  }
  return candidates;
}
export function rankMasterRoleFields(fields:MasterRoleField[],job:string):RankedMasterRoleField[]{
  const keys=terms(job);
  return fields.map((field)=>{
    const strong=field.title.toLowerCase();
    const weak=field.description.toLowerCase();
    const matched=keys.filter((term)=>strong.includes(term)||weak.includes(term));
    const score=matched.reduce((n,term)=>n+(strong.includes(term)?4:2),0);
    return {field,score,matched};
  }).sort((a,b)=>b.score-a.score||a.field.sourceName.localeCompare(b.field.sourceName)||
    a.field.title.localeCompare(b.field.title));
}
/** Copy only categories that the user specifically selected; keep others unchanged.
 * If a category is replaced, stale facts from that category cannot be transferred.
 */
export function applyMasterRoleFields(
  draft:ResumeDocument,sources:MasterSourceDocument[],keys:string[],
):ResumeDocument{
  if(!Array.isArray(keys)||keys.length>MAX_ROLE_MASTER_FIELDS||
    new Set(keys).size!==keys.length)throw new Error('结构化素材选择重复或超出 20 条限制。');
  if(!keys.length)return draft;
  const catalog=masterRoleFields(sources);
  const byKey=new Map(catalog.map((entry)=>[entry.key,entry]));
  const chosen=keys.map((key)=>{
    const found=byKey.get(key);
    if(!found)throw new Error('选中的母版教育／技能／奖项已发生变化，请重新打开生成器。');
    return found;
  });
  const result=structuredClone(draft);
  for(const kind of groups){
    const entries=chosen.filter((entry)=>entry.kind===kind);
    if(!entries.length)continue;
    const newIds=new Set<string>();
    const items=entries.map((entry,index)=>{
      const item=structuredClone(entry.data);
      const key='from-master-'+kind+'-'+index+'-'+entry.sourceId+'-'+item.id;
      if(newIds.has(key))throw new Error('母版内容出现重复条目，已取消生成。');
      newIds.add(key);
      return {...item,id:key};
    });
    if(kind==='education')result.education=items as EducationItem[];
    if(kind==='skills')result.skills=items as SkillCategory[];
    if(kind==='awards')result.awards=items as AwardItem[];
    if(result.factLedger)result.factLedger.records=result.factLedger.records.filter((row)=>
      !row.path.startsWith(kind+'/'));
  }
  return result;
}
