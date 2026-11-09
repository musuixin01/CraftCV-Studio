import type { ResumeDocument } from '../types/resume';
import { newClaimWarnings } from './resumeGenerationGuard.ts';

/**
 * Text-only, user-reviewable data contract. Identity, contact details, photos,
 * degrees, dates, grades and repository evidence are never sent in this list.
 */
export interface OnePageTextField {
  id: string;
  label: string;
  original: string;
}
export interface OnePageCandidate {
  id: string;
  proposed: string;
  reason: string;
}

export type OnePageRelevance = 'high' | 'medium' | 'low';

/** Job-fit assessments are AI opinions, not verified hiring requirements. */
export interface OnePageJobSuggestion extends OnePageCandidate {
  relevance: OnePageRelevance;
  /** Exact excerpt from the resume field, validated against the original. */
  evidenceQuote: string;
  /** Exact excerpt from a supplied JD, or empty when only a role title exists. */
  jobBasis: string;
  /** Potential loss of nuance the user should personally review. */
  tradeoff: string;
}
export interface OnePageKeepRecommendation {
  id: string;
  evidenceQuote: string;
  reason: string;
}
export const MAX_ONEPAGE_JOB_DESCRIPTION = 3000;

export function validateOnePageJobSuggestion(
  field: OnePageTextField,
  candidate: OnePageJobSuggestion,
  jobDescription = '',
): string[] {
  const issues = validateOnePageCandidate(field, candidate.proposed);
  if (!['high', 'medium', 'low'].includes(candidate.relevance)) {
    issues.push('岗位相关性必须是高/中/低之一');
  }
  if (typeof candidate.evidenceQuote !== 'string' ||
      candidate.evidenceQuote.trim().length < 3 ||
      !field.original.includes(candidate.evidenceQuote.trim())) {
    issues.push('原文证据引文无法追溯');
  }
  if (typeof candidate.reason !== 'string' ||
      candidate.reason.trim().length < 8 || candidate.reason.length > 240) {
    issues.push('缺少具体精简理由');
  }
  if (typeof candidate.tradeoff !== 'string' ||
      candidate.tradeoff.trim().length < 4 || candidate.tradeoff.length > 180) {
    issues.push('缺少精简风险说明');
  }
  if (typeof candidate.jobBasis !== 'string' ||
      candidate.jobBasis.length > 120 ||
      (jobDescription
        ? (candidate.jobBasis.trim().length < 3 ||
          !jobDescription.includes(candidate.jobBasis.trim()))
        : candidate.jobBasis.trim().length > 0)) {
    issues.push('岗位要求依据无法追溯');
  }
  return [...new Set(issues)];
}

export function validateOnePageKeepRecommendation(
  field: OnePageTextField,
  item: OnePageKeepRecommendation,
): string[] {
  const issues: string[] = [];
  if (typeof item.evidenceQuote !== 'string' ||
      item.evidenceQuote.trim().length < 3 ||
      !field.original.includes(item.evidenceQuote.trim())) {
    issues.push('保留建议缺少对应原文证据');
  }
  if (typeof item.reason !== 'string' ||
      item.reason.trim().length < 8 || item.reason.length > 240) {
    issues.push('保留建议缺少解释');
  }
  return issues;
}

export const MAX_ONEPAGE_AI_FIELDS = 48;
export const MAX_ONEPAGE_AI_TEXT_LENGTH = 16000;

/** Conservative screening for contact identifiers accidentally pasted into free text. */
export function containsOnePageSensitiveContact(text: string): boolean {
  return /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(text) ||
    /(?:^|\D)1[3-9]\d{9}(?:\D|$)/.test(text) ||
    /(?:^|\D)\d{17}[\dXx](?:\D|$)/.test(text) ||
    /data:image\//i.test(text);
}

export function collectOnePageTextFields(resume: ResumeDocument): OnePageTextField[] {
  const fields: OnePageTextField[] = [];
  const add = (id: string, label: string, original: string | undefined) => {
    const source = String(original ?? '').trim();
    if (source.length >= 24 && source.length <= 1600 &&
        !containsOnePageSensitiveContact(source)) fields.push({ id, label, original: source });
  };

  add('basics.summary', '个人简介', resume.basics.summary);
  resume.projects.forEach((item, i) => {
    add(`projects.${i}.summary`, `项目 ${i + 1} · 项目简介`, item.summary);
    item.bullets.forEach((bullet, j) =>
      add(`projects.${i}.bullets.${j}`, `项目 ${i + 1} · 要点 ${j + 1}`, bullet));
  });
  resume.experience.forEach((item, i) => item.bullets.forEach((bullet, j) =>
    add(`experience.${i}.bullets.${j}`, `实习/经历 ${i + 1} · 要点 ${j + 1}`, bullet)));
  resume.skills.forEach((item, i) => add(`skills.${i}.items`, `专业技能 ${i + 1}`, item.items));
  resume.awards.forEach((item, i) => add(`awards.${i}.description`, `奖项 ${i + 1} · 描述`, item.description));
  resume.education.forEach((item, i) => {
    add(`education.${i}.courses`, `教育经历 ${i + 1} · 课程描述`, item.courses);
    add(`education.${i}.honors`, `教育经历 ${i + 1} · 荣誉描述`, item.honors);
  });
  resume.customSections.forEach((section, k) => section.items.forEach((item, i) =>
    item.bullets.forEach((bullet, j) =>
      add(`custom.${k}.${i}.bullets.${j}`, `自定义模块 ${k + 1} · 条目 ${i + 1} · 要点 ${j + 1}`, bullet))));
  return fields;
}

function numericTokens(text: string): Set<string> {
  return new Set((text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, '')));
}

function technicalTokens(text: string): Set<string> {
  const terms = new Set((text.match(/[A-Z][A-Za-z0-9+#.\-]{1,}/g) ?? []).map((n) => n.toLowerCase()));
  for (const known of ['C++', 'C#', 'RT-Thread', 'FreeRTOS', 'STM32', 'ESP32']) {
    if (text.toLowerCase().includes(known.toLowerCase())) terms.add(known.toLowerCase());
  }
  return terms;
}

/** Reject new claims and erased technical evidence, but do not call this proof of semantic truth. */
export function validateOnePageCandidate(
  field: OnePageTextField, proposal: unknown,
): string[] {
  if (typeof proposal !== 'string') return ['候选文字类型错误'];
  const next = proposal.trim();
  // Professional wording may be slightly longer than the original.
  // One-page fit is decided by the actual A4 layout, never by this length check.
  if (!next || next === field.original.trim()) return ['候选必须是与原文不同的非空内容'];
  if (next.length > 1600) return ['候选文字过长'];
  const issues = [...newClaimWarnings(field.original, next)];
  const afterNums = numericTokens(next);
  for (const token of numericTokens(field.original)) {
    if (!afterNums.has(token)) issues.push('原有数字或指标被删去：' + token);
  }
  const afterTerms = technicalTokens(next);
  for (const token of technicalTokens(field.original)) {
    if (!afterTerms.has(token)) issues.push('原有技术术语被删去：' + token);
  }
  if (/参与|协助|配合/.test(field.original) &&
      !/主导|独立负责|全权负责/.test(field.original) &&
      /主导|独立负责|全权负责/.test(next)) {
    issues.push('不得将参与或协作包装成主导或独立负责');
  }
  const workPending = /开发中|调试中|测试中|待验证|未验证|尚未验证|仍需.{0,8}(?:测试|验证|校准)/.test(field.original);
  if (workPending && /(?:验证|测试|验收)(?:已)?通过|通过(?:验证|测试|验收)|稳定运行|正式上线|已投入生产/.test(next) &&
      !/(?:验证|测试|验收)(?:已)?通过|通过(?:验证|测试|验收)|稳定运行|正式上线|已投入生产/.test(field.original)) {
    issues.push('不能将进行中或待验证的项目包装为已通过测试或稳定上线');
  }
  return [...new Set(issues)];
}

/**
 * Nuance warnings are advisory, not automatic rejections. Users can choose a
 * candidate after reviewing the highlighted before/after text. They never
 * elevate an unsupported fact into verified evidence.
 */
export function getOnePageWritingWarnings(original: string, proposed: string): string[] {
  const warnings: string[] = [];
  const participating = /参与|协助|配合/.test(original);
  const changedResponsibility = /主导|独立负责|全权负责|负责/.test(proposed) &&
    !/主导|独立负责|全权负责|负责/.test(original);
  if (participating && changedResponsibility) {
    warnings.push('原文是参与或协作经历，请核对是否扩大了个人职责');
  }
  const tentative = /开发中|调试中|测试中|待验证|未验证|尚未验证|仍需.{0,8}(?:测试|验证|校准)|计划(?:进行|完成)/.test(original);
  const preservedTentative = /开发中|调试中|测试中|待验证|未验证|尚未验证|仍需.{0,8}(?:测试|验证|校准)|正在(?:开发|调试|测试)|尚待(?:测试|验证)/.test(proposed);
  if (tentative && !preservedTentative) {
    warnings.push('原文含进行中或待验证状态，请核对是否遗漏了项目阶段');
  }
  if (proposed.length > original.length + Math.max(24, Math.ceil(original.length * 0.25))) {
    warnings.push('润色扩写较多，可能影响单页排版，请确认内容确有必要');
  }
  return warnings;
}

/**
 * Applies only explicitly accepted field edits to the exact source content.
 * Any concurrent editing or unknown id fails rather than overwriting changes.
 */
export function applyReviewedOnePageCandidates(
  resume: ResumeDocument,
  selected: OnePageCandidate[],
): ResumeDocument {
  const original = new Map(collectOnePageTextFields(resume).map((f) => [f.id, f]));
  const updates = new Map<string, string>();
  for (const candidate of selected) {
    const field = original.get(candidate.id);
    if (!field || updates.has(candidate.id)) throw new Error('精简条目已变化或重复，请重新生成建议');
    const issues = validateOnePageCandidate(field, candidate.proposed);
    if (issues.length) throw new Error(`精简候选未通过校验：${issues.join('；')}`);
    updates.set(candidate.id, candidate.proposed.trim());
  }
  if (!updates.size) return resume;

  const read = (id: string, value: string) => updates.get(id) ?? value;
  return {
    ...resume,
    basics: {
      ...resume.basics,
      summary: read('basics.summary', resume.basics.summary),
    },
    projects: resume.projects.map((item, i) => ({
      ...item,
      summary: read(`projects.${i}.summary`, item.summary),
      bullets: item.bullets.map((bullet, j) => read(`projects.${i}.bullets.${j}`, bullet)),
    })),
    experience: resume.experience.map((item, i) => ({
      ...item,
      bullets: item.bullets.map((bullet, j) => read(`experience.${i}.bullets.${j}`, bullet)),
    })),
    skills: resume.skills.map((item, i) => ({
      ...item,
      items: read(`skills.${i}.items`, item.items),
    })),
    awards: resume.awards.map((item, i) => ({
      ...item,
      description: read(`awards.${i}.description`, item.description),
    })),
    education: resume.education.map((item, i) => ({
      ...item,
      courses: read(`education.${i}.courses`, item.courses),
      honors: read(`education.${i}.honors`, item.honors),
    })),
    customSections: resume.customSections.map((section, k) => ({
      ...section,
      items: section.items.map((item, i) => ({
        ...item,
        bullets: item.bullets.map((bullet, j) => read(`custom.${k}.${i}.bullets.${j}`, bullet)),
      })),
    })),
  };
}
