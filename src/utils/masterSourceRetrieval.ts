import {listMasterDocuments,type MasterSourceDocument} from './masterDocumentImportStore.ts';
import {chooseRawTextExcerpt,loadMasterRawExcerpts,type MasterRawExcerpt} from './masterRawRetrieval.ts';

export interface MasterStructuredExcerpt {
  id:string;
  name:string;
  excerpt:string;
  matched:string[];
}
const LIMIT=2;
const MAX_CHARS=2600;
const CONTACT=/(?:\b1[3-9]\d{9}\b|\b\d{17}[\dXx]\b|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i;
const HOSTILE=/(?:ignore\s+(?:all\s+)?previous|忽略.{0,15}(?:指令|规则)|system\s*prompt)/i;

const text=(parts:unknown[]):string=>parts.flatMap((part)=>
  Array.isArray(part)?part:[part]).filter((part)=>typeof part==='string'&&part.trim())
  .map((part)=>String(part).trim()).join(' · ');

/** Use the user's latest saved fields, not the original sourceLines or DOCX/PDF Blob.
 * In particular, corrections saved after extraction must replace the stale source text.
 */
export function structuredDocumentLines(doc:MasterSourceDocument):string[]{
  const lines:string[]=[];
  for(const row of doc.education)lines.push(text([
    '教育经历',row.school,row.degree,row.major,row.startDate,row.endDate,
    row.gpa&&'绩点 '+row.gpa,row.weightedAverage&&'加权均分 '+row.weightedAverage,
    row.courses,row.honors,
  ]));
  for(const row of doc.projects)lines.push(text([
    '项目经历',row.name,row.role,row.startDate,row.endDate,
    row.techStack,row.summary,row.bullets,
  ]));
  for(const row of doc.experience)lines.push(text([
    '工作实习经历',row.company,row.position,row.startDate,row.endDate,
    row.techStack,row.bullets,
  ]));
  for(const row of doc.skills)lines.push(text(['专业技能',row.category,row.items]));
  for(const row of doc.awards)lines.push(text([
    '荣誉奖项',row.title,row.issuer,row.level,row.date,row.description,
  ]));
  if(doc.summary.trim())lines.push(text(['个人总结',doc.summary]));
  return lines.filter(Boolean);
}
export function selectMasterStructuredExcerpts(
  sources:MasterSourceDocument[],query:string,
):MasterStructuredExcerpt[]{
  const snippets=sources.filter((doc)=>doc.confirmedByUser)
    .map((doc)=>{
      const relevant=chooseRawTextExcerpt(structuredDocumentLines(doc),query,MAX_CHARS);
      return {id:doc.id,name:doc.name.replace(
        /(?:\b1[3-9]\d{9}\b|\b\d{17}[\dXx]\b|[\w.+-]+@[\w.-]+\.[a-z]{2,})/gi,
        '[个人标识已隐藏]').slice(0,150),
      excerpt:relevant.excerpt,matched:relevant.matched};
    }).filter((row)=>row.excerpt.trim().length>0)
    .sort((a,b)=>b.matched.length-a.matched.length);
  return snippets.slice(0,LIMIT);
}
/** Database reads are metadata/structured fields only for saved sources.
 * Original file Blob is opened only by the raw loader for hashes without a saved extraction.
 */
export async function loadMasterAIReferences(query:string):Promise<{
  masterStructured:MasterStructuredExcerpt[];
  masterRaw:MasterRawExcerpt[];
}> {
  const sources=await listMasterDocuments();
  return {
    masterStructured:selectMasterStructuredExcerpts(sources,query),
    masterRaw:await loadMasterRawExcerpts(query,sources),
  };
}
export function formatMasterStructuredExcerptsForPrompt(raw:unknown):string{
  if(raw===undefined)return '';
  if(!Array.isArray(raw)||raw.length>LIMIT)throw new Error('母版结构化摘要数量超限。');
  const safe:MasterStructuredExcerpt[]=[];
  for(const x of raw){
    if(!x||typeof x!=='object'||Array.isArray(x))throw new Error('母版结构化摘要格式无效。');
    const row=x as Record<string,unknown>;
    if(typeof row.id!=='string'||!/^import-[a-f\d]{28}$/.test(row.id)||
      typeof row.name!=='string'||row.name.length>150||
      typeof row.excerpt!=='string'||row.excerpt.length>MAX_CHARS||
      !Array.isArray(row.matched)||row.matched.length>8||
      !row.matched.every((term)=>typeof term==='string'&&term.length<40)||
      CONTACT.test(row.name+' '+row.excerpt)||HOSTILE.test(row.name+' '+row.excerpt))
      throw new Error('母版结构化摘要包含敏感或异常内容，未发送给 AI。');
    safe.push({id:row.id,name:row.name,excerpt:row.excerpt,matched:row.matched as string[]});
  }
  if(!safe.length)return '';
  return '\n【用户已提取并保存到内容库的简历字段摘录（以用户最新编辑内容为准，而非原 Word/PDF）；只作为候选参考，未核实事实不能自动添加到正式简历】\n'+
    JSON.stringify(safe).replace(/</g,'\\u003c').replace(/>/g,'\\u003e');
}
