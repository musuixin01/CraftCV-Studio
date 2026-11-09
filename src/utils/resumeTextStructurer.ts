import type {AwardItem,EducationItem,ExperienceItem,ProjectItem,SkillCategory} from '../types/resume';
import type {ExtractedResumeText} from './localResumeTextExtractor';

export type ResumeSourceSection = 'intro'|'education'|'projects'|'experience'|'skills'|'awards'|'summary'|'other';
export interface MasterDocumentCandidates {
  sourceFormat:'docx'|'pdf';
  sourceLines:string[];
  intro:string[];
  unclassified:string[];
  warnings:string[];
  education:EducationItem[];
  projects:ProjectItem[];
  experience:ExperienceItem[];
  skills:SkillCategory[];
  awards:AwardItem[];
  summary:string;
}
const SECTION_RULES:Array<[ResumeSourceSection,RegExp]> = [
  ['education',/^(?:(?:[一二三四五六七八九十]|\d+)[、.．]\s*)?(?:教育(?:背景|经历|信息)|学历(?:背景|经历)|education|academic\s+background|education\s+background)$/i],
  ['projects',/^(?:(?:[一二三四五六七八九十]|\d+)[、.．]\s*)?(?:项目(?:经验|经历|实践|成果)|科研项目|作品项目|project(?:s| experience)?|research\s+projects)$/i],
  ['experience',/^(?:(?:[一二三四五六七八九十]|\d+)[、.．]\s*)?(?:工作(?:经历|经验)|实习(?:经历|经验)|工作与实习|工作\/实习|社会实践|employment|work\s+experience|professional\s+experience|internship(?: experience)?)$/i],
  ['skills',/^(?:(?:[一二三四五六七八九十]|\d+)[、.．]\s*)?(?:专业技能|技术(?:技能|栈)|技能(?:清单|特长)|核心能力|技能与证书|technical\s+skills|skills|competencies)$/i],
  ['awards',/^(?:(?:[一二三四五六七八九十]|\d+)[、.．]\s*)?(?:荣誉(?:奖项|证书)|奖项(?:与证书)?|证书(?:与荣誉)?|竞赛获奖|获奖经历|奖励|certifications?|honou?rs?(?:\s+and\s+awards)?|awards?)$/i],
  ['summary',/^(?:(?:[一二三四五六七八九十]|\d+)[、.．]\s*)?(?:个人(?:简介|总结|评价)|自我(?:评价|介绍)|职业概述|个人优势|about\s+me|profile|summary|objective)$/i],
];
const DATE_PATTERN=/(?:20\d{2}|19\d{2})[.\/年-]?\d{0,2}(?:\s*(?:—|~|至|到|-|–)\s*(?:20\d{2}[.\/年-]?\d{0,2}|至今|现在|present))?/ig;
const BULLET=/^(?:[-•●▪◆➢▶∙]|[①-⑳]|(?:\d{1,2}[.．、)]))\s*/;
const SCHOOL=/(大学|学院|学校|职业技术|职业学院|polytechnic|university|college)/i;
const EMPLOYER=/(有限公司|股份公司|集团|公司|事务所|研究院|研究所|工作室|实验室|事业部|咨询|corporation|inc\.?|ltd\.?|studio)/i;
const MAX_ITEMS=35;
function plain(value:string):string{
  return value.replace(/\u0000/g,'').replace(/[\u200b-\u200f]/g,'').trim();
}
function splitRange(line:string):[string,string]{
  const dates=[...line.matchAll(DATE_PATTERN)].map((m)=>m[0]);
  if(!dates.length)return ['',''];
  const sep=dates[0].split(/\s*(?:—|~|至|到|-|–)\s*/);
  if(sep.length===2)return [sep[0],sep[1]];
  return [dates[0],''];
}
function cleanedBullet(s:string):string{return plain(s.replace(BULLET,''));}
function unique(arr:string[]):string[]{return [...new Set(arr.map(plain).filter(Boolean))];}
function isNewTitle(line:string,kind:'project'|'experience'):boolean{
  if(BULLET.test(line)||line.length>125)return false;
  if(kind==='experience')return EMPLOYER.test(line)&&line.length<105;
  return line.length<90 && (/(项目|系统|平台|工具|工作台|智能|控制|应用|终端|硬件|软件|project)/i.test(line)||new RegExp(DATE_PATTERN.source,'i').test(line));
}
export function parseResumeTextBlocks(source:ExtractedResumeText):MasterDocumentCandidates {
  const bins:Record<ResumeSourceSection,string[]>={
    intro:[],education:[],projects:[],experience:[],skills:[],awards:[],summary:[],other:[],
  };
  let current:ResumeSourceSection='intro';
  let recognized=0;
  const sectionBreak='__craftcv_internal_education_boundary__';
  for(let index=0;index<source.lines.length;index++){
    const line=plain(source.lines[index]);
    if(!line)continue;
    const next=plain(source.lines[index+1]??'');
    // The experience library can contain multiple role-specific resume variants.
    if(line==='原岗位简历素材'||next==='原岗位简历素材'){
      current='intro';bins.intro.push(line);continue;
    }
    const normalized=line.replace(/^#{1,6}\s*/,'')
      .replace(/[：:]$/,'').trim()
      .replace(/\s+(?:EDUCATION|EXPERTISE|ACHIEVEMENT|ABOUT ME|PROJECT EXPERIENCE|INTERNSHIP EXPERIENCE)\s*$/i,'');
    const match=SECTION_RULES.find(([,regex])=>regex.test(normalized));
    if(match){
      if(match[0]==='education'&&bins.education.length)bins.education.push(sectionBreak);
      current=match[0];recognized++;continue;
    }
    bins[current].push(line);
  }
  const id=(section:string,index:number)=>'file-'+section+'-'+String(index+1);
  const warnings=[...source.warnings];
  if(recognized===0)warnings.push('未找到明确的简历栏目标题。字段拆分可能不完整，请重点核对原文。');
  if(bins.education.includes(sectionBreak)||recognized>12)warnings.push('检测到多套岗位简历或重复模块。相同项目/课程/奖项可能重复出现，请先手动去重，再确认入库。');

  const education:EducationItem[]=[];
  let ed:EducationItem|undefined;
  const newEducation=(line:string):EducationItem=>({
    id:id('edu',education.length),school:plain(line.replace(DATE_PATTERN,'').replace(/(?:本科|专科|硕士|博士|学士|专升本|计算机|电子信息工程).*/,'').trim())||line,
    degree:(line.match(/(博士|硕士|本科|专升本|专科|大专)/)||[])[0]||'',
    major:(line.match(/(?:专业[：:]\s*)([^，,；;·\s]{2,28})/)||[])[1]||'',
    startDate:splitRange(line)[0],endDate:splitRange(line)[1],
    gpa:(line.match(/(?:GPA|绩点)[：:\s]*([0-5](?:\.\d{1,3})?)/i)||[])[1]||'',
    ranking:'',courses:'',honors:'',
  });
  for(const line of bins.education.slice(0,125)){
    if(line===sectionBreak){if(ed)education.push(ed);ed=undefined;continue;}
    if(SCHOOL.test(line)&&(!ed||line!==ed.school)){
      if(ed)education.push(ed);
      ed=newEducation(line);
      continue;
    }
    if(!ed){ed=newEducation('');ed.school='';}
    if(/主修|课程|course/i.test(line))ed.courses += (ed.courses?'；':'')+line;
    else if(/奖学金|荣誉|honor/i.test(line))ed.honors += (ed.honors?'；':'')+line;
    else if(/(?:GPA|绩点)/i.test(line)){const value=(line.match(/([0-5]\.\d{1,3})/)||[])[1];if(value)ed.gpa=value;}
    else {
      const degree=(line.match(/(博士|硕士|本科|专升本|专科|大专)/)||[])[1];
      if(degree&&!ed.degree)ed.degree=degree;
      const major=(line.match(/(?:专业[：:]\s*)([^，,；\s]{2,28})/)||
        line.match(/^([^（）()\s]{2,28})[（(](?:博士|硕士|本科|专升本|专科|大专)/))?.[1];
      if(major&&!ed.major)ed.major=major;
      const [start,end]=splitRange(line);
      if(start&&!ed.startDate)ed.startDate=start;
      if(end&&!ed.endDate)ed.endDate=end;
    }  }
  if(ed&&Object.values(ed).some(Boolean))education.push(ed);

  const projects:ProjectItem[]=[];
  let project:ProjectItem|undefined;
  function pushProject(){if(project){projects.push(project);project=undefined;}}
  const projectLines=bins.projects.slice(0,300);
  for(let index=0;index<projectLines.length;index++){
    const line=projectLines[index];
    const next=projectLines[index+1]??'';
    const isMetadataDate=/^(?:19|20)\d{2}(?:[./年-]|\s*$)/.test(line);
    const startTitle=(!isMetadataDate&&(
      isNewTitle(line,'project') ||
      (!BULLET.test(line)&&line.length<95&&/^(?:19|20)\d{2}/.test(next)) ||
      (!project&&!BULLET.test(line))
    ));
    if(startTitle){
      pushProject();
      const parts=line.split(/\s*[｜|]\s*/);
      project={id:id('project',projects.length),
        name:plain(parts[0].replace(DATE_PATTERN,'').replace(/^[\s·-]+|[\s·-]+$/g,''))||line,
        role:plain(parts[1]??''),startDate:splitRange(line)[0],endDate:splitRange(line)[1],
        repoUrl:'',techStack:[],summary:'',bullets:[]};
      continue;
    }
    if(!project){warnings.push('发现无法归属的项目描述，请核对：'+line.slice(0,70));continue;}
    if(isMetadataDate){
      const [start,end]=splitRange(line);
      if(start&&!project.startDate)project.startDate=start;
      if(end&&!project.endDate)project.endDate=end;
      const tech=line.split(/\s*[｜|]\s*/).slice(1).join(' / ');
      if(tech)project.techStack=unique([...project.techStack,...tech.split(/[,，、/]/)]);
    }else if(/^(?:项目源码|代码地址|GitHub)[：:]/i.test(line)){
      const url=line.match(/https?:\/\/\S+/);if(url)project.repoUrl=url[0];
    }else if(/(?:技术栈|技术方案|使用技术|环境)[：:]/.test(line)){
      project.techStack=unique([...project.techStack,...line.replace(/^.*?[：:]/,'').split(/[,，、/|]/)]);
    }else if(/^(?:职责|角色|负责模块)[：:]/.test(line) && line.length<85){
      project.role=line.replace(/^.*?[：:]/,'').trim();
    }else if(BULLET.test(line)||/^(?:负责|设计|实现|完成|参与|搭建|开发|优化|解决|基于|使用|通过|独立)/.test(line)){
      project.bullets.push(cleanedBullet(line));
    }else if(!project.summary)project.summary=line;
    else project.bullets.push(cleanedBullet(line));
  }  pushProject();

  const experience:ExperienceItem[]=[];
  let ex:ExperienceItem|undefined;
  function pushExp(){if(ex){experience.push(ex);ex=undefined;}}
  for(const line of bins.experience.slice(0,255)){
    const dateOnly=/^(?:19|20)\d{2}(?:[.\/年-]|\s*$)/.test(line);
    if(!dateOnly&&(isNewTitle(line,'experience')||(!ex&&!BULLET.test(line)))){
      pushExp();
      const fields=line.replace(DATE_PATTERN,'').split(/\s*[｜|·]\s*/);
      ex={id:id('exp',experience.length),company:plain(fields[0]),
        position:plain(fields[1]??''),department:'',location:'',
        startDate:splitRange(line)[0],endDate:splitRange(line)[1],
        techStack:[],bullets:[]};
      continue;
    }
    if(!ex){warnings.push('发现无法归属的工作经历描述：'+line.slice(0,60));continue;}
    if(dateOnly){
      const [start,end]=splitRange(line);
      if(start&&!ex.startDate)ex.startDate=start;
      if(end&&!ex.endDate)ex.endDate=end;
    }else if(/^(?:岗位|职位|职务)[：:]/.test(line))ex.position=line.replace(/^.*?[：:]/,'').trim();
    else if(/^(?:技术栈|工具)[：:]/.test(line))
      ex.techStack=unique([...ex.techStack,...line.replace(/^.*?[：:]/,'').split(/[,，、/]/)]);
    else ex.bullets.push(cleanedBullet(line));
  }  pushExp();

  const skills:SkillCategory[]=[];
  const skillLines=bins.skills.slice(0,90);
  for(let index=0;index<skillLines.length;index++){
    const line=skillLines[index];
    const split=line.match(/^([^：:]{2,20})[：:]\s*(.+)$/);
    if(split){
      skills.push({id:id('skill',skills.length),category:split[1],items:split[2]});
      continue;
    }
    const next=skillLines[index+1]??'';
    if(line.length<=22&&next.length>line.length+10&&!/^[-•●]/.test(next)){
      skills.push({id:id('skill',skills.length),category:line,items:next});
      index++;
    }else{
      skills.push({id:id('skill',skills.length),category:'专业技能',items:cleanedBullet(line)});
    }
  }
  const awards:AwardItem[]=bins.awards.slice(0,100)
    .filter((line)=>BULLET.test(line)||/(证书|大赛|竞赛|获奖|奖学金|荣誉|优秀|高级工|二等奖|三等奖|一等奖)/.test(line))
    .map((line,index)=>({
      id:id('award',index),title:cleanedBullet(line),issuer:'',date:splitRange(line)[0],
      level:(line.match(/(?:一|二|三|优秀|特等|金|银|铜)等奖|高级工|中级工|三级|四级/)||[])[0]||'',description:'',
    }));
  if(projects.length>MAX_ITEMS||experience.length>MAX_ITEMS||education.length>MAX_ITEMS)
    warnings.push('某些栏目条目过多，建议拆分原稿再分别确认。');

  const intro=bins.intro.filter((s)=>s.length<260);
  const summary=bins.summary.join(' ').slice(0,2200);
  const unclassified=[...bins.other,...bins.intro.filter((line)=>line.length>=260)];
  if(bins.projects.length&&!projects.length)warnings.push('原稿有项目文字，但尚未可靠识别出独立项目，请手工整理。');
  if(bins.experience.length&&!experience.length)warnings.push('原稿有实习/工作文字，但尚未可靠识别出独立单位，请手工整理。');
  if(!education.length&&!projects.length&&!experience.length&&!skills.length&&!awards.length)
    warnings.push('没有提取出可靠结构化条目，请先核对原文，不会自动入库。');
  if(unclassified.length)warnings.push('另有 '+unclassified.length+' 行未分类文字；可在原文预览中检查。');
  return {sourceFormat:source.format,sourceLines:source.lines,intro,unclassified,warnings,
    education,projects,experience,skills,awards,summary};
}
