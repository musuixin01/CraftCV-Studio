import type { ResumeDocument } from '../types/resume';
import { validateStoredResume } from './resumeGenerationGuard.ts';
import type { ExportQualityReport } from './exportQualityPreflight.ts';

/** Conservative, deterministic terminology; never an interview probability. */
const TOPICS: ReadonlyArray<{label:string;variants:string[]}> = [
  {label:'STM32',variants:['stm32']},
  {label:'FreeRTOS / RTOS',variants:['freertos','rtos','实时操作系统']},
  {label:'嵌入式 / MCU',variants:['嵌入式','mcu','单片机','微控制器']},
  {label:'FPGA',variants:['fpga']},
  {label:'软件测试',variants:['软件测试','测试工程师','测试开发','测试用例']},
  {label:'数字信号处理',variants:['数字信号处理','dsp']},
  {label:'C 语言',variants:['c语言','c 语言','c/c++','embedded c']},
  {label:'C++',variants:['c++']},
  {label:'C#',variants:['c#','csharp']},
  {label:'Python',variants:['python']},
  {label:'Linux',variants:['linux']},
  {label:'UART / USART',variants:['uart','usart','串口通信']},
  {label:'CAN',variants:['can总线','can bus','can通信']},
  {label:'SPI',variants:['spi总线','spi通信']},
  {label:'I2C',variants:['i2c','i²c']},
  {label:'SQL',variants:['sql','数据库']},
  {label:'PCB',variants:['pcb','电路板设计']},
  {label:'PID',variants:['pid']},
];
function matches(text:string,variants:readonly string[]):boolean {
  const hay=text.toLocaleLowerCase();
  return variants.some((token)=>hay.includes(token));
}
function topics(text:string):string[] {
  return TOPICS.filter((item)=>matches(text,item.variants)).map((item)=>item.label);
}
function itemTopics(text:string, required:string[]):string[] {
  return TOPICS.filter((topic)=>required.includes(topic.label)&&matches(text,topic.variants))
    .map((topic)=>topic.label);
}
export type EvidenceSuggestionKind='project'|'course'|'credential'|'education';
export interface JobEvidenceSuggestion {
  id:string; kind:EvidenceSuggestionKind; title:string; description:string;
  related:string[]; sourcePath:string; section:'education'|'awards'|'projects';
  evidenceLabel:string; shownInResume:boolean;
}
export interface JobEvidenceMatch {
  matched:string[]; notLocated:string[]; inspected:string[];
}
export interface JobEvidenceAnalysis {
  matches:JobEvidenceMatch; suggestions:JobEvidenceSuggestion[];
}

/** Suggestions only refer to facts already in the current resume. */
export function analyzeJobEvidence(resume:ResumeDocument,jdText:string):JobEvidenceAnalysis {
  const required=topics(jdText.trim());
  const visible=new Set(resume.sections.filter((item)=>item.visible).map((item)=>item.type));
  const suggestions:JobEvidenceSuggestion[]=[];
  const matched=new Set<string>();
  const push=(item:JobEvidenceSuggestion)=>{
    if(!item.related.length)return;
    item.related.forEach((x)=>matched.add(x));
    suggestions.push(item);
  };
  for(const project of resume.projects) {
    const related=itemTopics([project.name,project.summary,project.role,
      ...(project.techStack??[]),...(project.bullets??[])].join(' '),required);
    if(related.length)push({
      id:'project:'+project.id,kind:'project',title:project.name,
      description:'项目与 JD 的技术术语相关；本人职责、实测结论仍需面试前核实。',
      related,sourcePath:'projects/'+encodeURIComponent(project.id),
      section:'projects',evidenceLabel:project.evidence?.repository?'关联代码仓库线索，不证明个人贡献':'当前简历中的本人项目陈述',
      shownInResume:visible.has('projects'),
    });
  }
  for(const edu of resume.education) {
    for(const grade of edu.courseGrades??[]) {
      const related=itemTopics(grade.course,required);
      if(!related.length||!grade.course.trim()||!grade.score.trim())continue;
      const path='education/'+encodeURIComponent(edu.id)+'/courseGrades/'+encodeURIComponent(grade.id)+'/score';
      const record=resume.factLedger?.records.find((item)=>item.path===path &&
        item.normalizedValue===grade.score && item.candidateConfirmed);
      push({id:path,kind:'course',title:grade.course+' · '+grade.score,
        description:'课程与 JD 相关；已留存在结构化资料中，但默认不自动加到 A4。',
        related,sourcePath:path,section:'education',
        evidenceLabel:record?.sources.some((source)=>source.sourceId.startsWith('evidence:'))
          ?'当前版本已采用附件候选，仍需对照原件':'当前版本填写的成绩，尚未关联已采用附件',
        shownInResume:false});
    }
    if(/(?:绩点|平均分|成绩单|gpa|学业成绩)/i.test(jdText)&&edu.weightedAverage?.trim()){
      const path='education/'+encodeURIComponent(edu.id)+'/weightedAverage';
      push({id:path,kind:'education',title:edu.school+' · 加权平均分 '+edu.weightedAverage,
        description:'独立于 GPA；只有岗位需要时才考虑展示，防止重复。',
        related:['学业成绩'],sourcePath:path,section:'education',
        evidenceLabel:'当前教育记录（原始成绩单仍需核实）',shownInResume:false});
    }
  }
  for(const award of resume.awards) {
    const related=itemTopics([award.title,award.level,award.description].join(' '),required);
    if(related.length)push({
      id:'award:'+award.id,kind:'credential',title:award.title,
      description:award.credentialType==='certificate'?'岗位相关证书，投递前核对名称、级别和日期。':'岗位相关奖项，核对团体/个人性质及赛事年度。',
      related,sourcePath:'awards/'+encodeURIComponent(award.id),
      section:'awards',evidenceLabel:'当前简历的记录，关键词不证明证书真伪',
      shownInResume:visible.has('awards')});
  }
  const rank:Record<EvidenceSuggestionKind,number>={project:0,course:1,credential:2,education:3};

  // Skills already stated in the current version count as "located", but are
  // user assertions, not verified achievements or automatic recommendations.
  const skillText=resume.skills.map((group)=>group.category+' '+group.items).join(' ')+' '+resume.basics.summary;
  itemTopics(skillText,required).forEach((item)=>matched.add(item));
  suggestions.sort((a,b)=>b.related.length-a.related.length||rank[a.kind]-rank[b.kind]);
  return {matches:{matched:required.filter((x)=>matched.has(x)),
    notLocated:required.filter((x)=>!matched.has(x)),inspected:required},
    suggestions:suggestions.slice(0,12)};
}
export type SubmissionSeverity='block'|'review'|'layout'|'suggestion';
export interface SubmissionIssue {
  id:string;rule:string;severity:SubmissionSeverity;title:string;detail:string;
  action:string;path?:string;
}
export interface SubmissionReview {
  status:'BLOCKED'|'REVIEW_REQUIRED'|'NEEDS_LAYOUT';
  issues:SubmissionIssue[];topIssues:SubmissionIssue[];
  estimatedPages:number|null;matches:JobEvidenceMatch;finalPdfVerified:false;
  inspectedFormat:'ats'|'image'|'unavailable';
}
function addIssue(issues:SubmissionIssue[],x:SubmissionIssue):void {
  if(!issues.some((item)=>item.id===x.id))issues.push(x);
}
export function reviewResumeSubmission(
  resume:ResumeDocument,jdText:string,preflight:ExportQualityReport|null,
):SubmissionReview {
  const issues:SubmissionIssue[]=[];
  const structural=validateStoredResume(resume);
  if(structural.length)addIssue(issues,{id:'structure',rule:'Q-01',severity:'block',
    title:'简历数据结构需要修正',detail:structural.slice(0,3).join('；'),
    action:'先在编辑器修正字段或重新导入合规数据。'});
  // Invalid persisted objects must fail closed before dereferencing nested arrays.
  if(structural.length) {
    return {status:'BLOCKED',issues,topIssues:issues.slice(0,5),
      estimatedPages:preflight?.estimatedPages??null,
      matches:{matched:[],notLocated:[],inspected:[]},
      finalPdfVerified:false,inspectedFormat:preflight?.format??'unavailable'};
  }

  if(!resume.basics.name.trim())addIssue(issues,{id:'name',rule:'Q-01',severity:'review',
    title:'未填写姓名',detail:'正式投递简历必须标明本人身份。',
    action:'填写真实姓名。',path:'basics/name'});
  if(!resume.basics.email.trim()&&!resume.basics.phone.trim())
    addIssue(issues,{id:'contact',rule:'Q-01',severity:'review',
      title:'缺少可用联系方式',detail:'招聘人员无法根据简历联系你。',
      action:'提供至少一种本人确认可用的联系方式。',path:'basics/email'});
  if(resume.id==='ee-default-pdf-1to1' || resume.versionName.includes('示例简历'))
    addIssue(issues,{id:'demo',rule:'Q-02',severity:'review',
      title:'检测到演示简历',detail:'示例姓名、学校及项目不能作为求职者的真实经历直接投递。',
      action:'使用本人真实材料替换所有演示内容。'});
  const suspicious=resume.factLedger?.records.filter((item)=>
    item.status==='conflicting' || (item.status==='inferred-suggestion'&&!item.candidateConfirmed))??[];
  if(suspicious.length)addIssue(issues,{id:'source',rule:'Q-02',severity:'review',
    title:'部分来源候选仍未确认',detail:'事实账本中有 '+suspicious.length+' 项冲突或尚未采用的 AI 候选。',
    action:'检查来源及当前版本的字段；不能将 AI 猜测直接当成已证实内容。',
    path:suspicious[0]?.path});
  if(resume.projects.length===0 && resume.experience.length===0)
    addIssue(issues,{id:'project',rule:'Q-05',severity:'review',
      title:'缺少项目或实践经历',detail:'技术岗位简历通常需要可以解释的工程实践。',
      action:'补充本人确实参与的工程或实习内容。'});
  const numerical=resume.projects.flatMap((project)=>project.bullets.map((bullet,index)=>({
    project,index,bullet
  }))).filter(({bullet})=>/(?:提升|降低|减少|提高|节省|缩短|加速|优化).{0,18}\d+(?:\.\d+)?\s*%/.test(bullet));
  if(numerical.length)addIssue(issues,{id:'metrics',rule:'Q-03',severity:'review',
    title:'量化改善指标需要复核',detail:'检测到 '+numerical.length+' 项百分比改善陈述，代码或自述不等于实测结果。',
    action:'确认基准、测试方法及结果；无记录时改成能够解释的实际工作。',
    path:'projects/'+encodeURIComponent(numerical[0].project.id)+'/bullets/'+numerical[0].index});
  const jd=analyzeJobEvidence(resume,jdText);
  if(jdText.trim() && jd.matches.notLocated.length)addIssue(issues,{
    id:'jd',rule:'Q-04',severity:'suggestion',title:'部分 JD 术语未在现有经历中找到',
    detail:'未检出：'+jd.matches.notLocated.slice(0,6).join('、')+'。这不意味着你不会。',
    action:'如确实具备相关经历，可提供证据并手动补充；不要按 JD 自动添加技能。'});
  if(!jdText.trim())addIssue(issues,{id:'jd-absent',rule:'Q-04',severity:'suggestion',
    title:'尚未指定目标 JD',detail:'本次只能审核通用简历，无法判断具体岗位适配。',
    action:'粘贴实际招聘 JD 后重新检查。'});
  if(!preflight)addIssue(issues,{id:'layout-unchecked',rule:'Q-07',severity:'layout',
    title:'尚未进行 A4 排版测量',detail:'没有可用的浏览器导出预检结果，不能判断分页及裁切。',
    action:'在已加载的简历页面运行 ATS 文字版预检。'});
  else{
    for(const issue of preflight.issues.filter((item)=>item.severity!=='info')){
      addIssue(issues,{id:'layout:'+issue.id,rule:'Q-07',
        severity:issue.severity==='error'?'layout':'review',
        title:issue.title,detail:issue.detail,action:issue.action});
    }
    if(preflight.format==='image')addIssue(issues,{id:'ats',rule:'Q-07',severity:'review',
      title:'图片式 PDF 不等于 ATS 文字 PDF',
      detail:'图片版通常没有可复制的正文文字层。',action:'优先使用 ATS 文字版。'});
  }
  addIssue(issues,{id:'pdf-file',rule:'Q-07',severity:'review',title:'最终 PDF 文件尚未验收',
    detail:'浏览器预检不能验证实际 PDF 的文字层、字体、页数和阅读顺序。',
    action:'另存为 PDF 后复制正文、核对首页末页，并检查 A4 页数。'});
  const severityOrder:Record<SubmissionSeverity,number>={block:0,layout:1,review:2,suggestion:3};
  issues.sort((a,b)=>severityOrder[a.severity]-severityOrder[b.severity]);
  return {status:issues.some((item)=>item.severity==='block')?'BLOCKED':
    issues.some((item)=>item.severity==='layout')?'NEEDS_LAYOUT':'REVIEW_REQUIRED',
    issues,topIssues:issues.slice(0,5),estimatedPages:preflight?.estimatedPages??null,
    matches:jd.matches,finalPdfVerified:false,inspectedFormat:preflight?.format??'unavailable'};
}
