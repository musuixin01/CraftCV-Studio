import type { ResumeDocument } from '../types/resume';
import { compareEvidenceFact, type EvidenceFact, type EvidenceReview } from './evidenceAttachments.ts';

/**
 * Local, deterministic triage of AI-extracted *claims*. Neither AI quotations nor
 * agreement between documents proves that an issuer validated the documents.
 */
export interface EvidenceAuditSource {
  id: string;
  contentHash?: string;
  review?: EvidenceReview;
}
export type EvidenceAuditStatus = 'indexed' | 'consistent' | 'attention';
export interface EvidenceAuditedFact {
  sourceId: string;
  index: number;
  key: string;
  fact: EvidenceFact;
  status: EvidenceAuditStatus;
  issues: string[];
  consistentSourceCount: number;
}
export interface EvidenceAuditResult {
  facts: EvidenceAuditedFact[];
  total: number;
  indexed: number;
  consistent: number;
  attention: number;
  noteCount: number;
}

function compact(text: string): string {
  return text.trim().toLocaleLowerCase()
    .replace(/[\s，,。.·:：;；()（）【】\[\]—–_]/g, '');
}
function normalizeDate(text: string): string {
  return text
    .replace(/(\d{4})\s*年\s*(\d{1,2})\s*月/g, (_all, year: string, month: string) =>
      year + month.padStart(2, '0'))
    .replace(/(\d{4})[./-](\d{1,2})(?!\d)/g, (_all, year: string, month: string) =>
      year + month.padStart(2, '0'));
}
function normalizedValue(value: string): string {
  return compact(normalizeDate(value));
}
function quoteSupportsValue(fact: EvidenceFact): boolean {
  const value = normalizedValue(fact.value);
  return Boolean(value && normalizedValue(fact.quote).includes(value));
}
/** A fact signature is deterministic for a given extraction and must not imply truth. */
export function evidenceFactKey(fact: EvidenceFact): string {
  return [fact.target, compact(fact.scope), compact(fact.label), normalizedValue(fact.value), compact(fact.quote)].join('\u001f');
}

/**
 * Terms like event year, issue date and award date must not be collapsed.
 * A grade must also name the course rather than grouping all grades for a school.
 */
function groupingKey(fact: EvidenceFact): string | null {
  // School and award/certificate names identify different entities even if the issuer matches.
  if(['education.school','award.title','certificate.name'].includes(fact.target))return null;
  const scope = compact(fact.scope);
  if (!scope || fact.target === 'other') return null;
  const target = fact.target;
  let qualifier = '';
  if (target === 'award.date' || target === 'certificate.date') {
    const label = compact(fact.label);
    if (/颁发|签发|发证|证书/.test(label)) qualifier = 'issued';
    else if (/赛事|比赛|竞赛|获奖|取得|年度/.test(label)) qualifier = 'event';
    else return null; // Unqualified dates cannot safely be cross-compared.
  } else if (target === 'education.courseGrade' || target === 'education.course') {
    const label = compact(fact.label);
    if (!label || /^(成绩|分数|单科成绩|课程|主修课程|课程成绩)$/.test(label)) return null;
    qualifier = label;
  } else if (target === 'education.weightedAverage' || target === 'education.gpa') {
    // GPA is never conflated with weighted average. Scales must be explicit for GPA.
    if (target === 'education.gpa') {
      const scale = compact(fact.label).match(/(?:满分|\/)([45](?:\.0)?)/)?.[1];
      qualifier = scale || 'scale-unknown';
    }
  } else if (target === 'award.level') {
    // 团体/个人奖项 with the same competition are different claims.

    const label = compact(fact.label + fact.value);
    qualifier = /团体/.test(label) ? 'team' : /个人/.test(label) ? 'individual' : 'unspecified';
  }
  return [target, scope, qualifier].join('\u001f');
}

export function auditEvidence(sources: EvidenceAuditSource[], resume: ResumeDocument): EvidenceAuditResult {
  const facts: EvidenceAuditedFact[] = [];
  const groups = new Map<string, EvidenceAuditedFact[]>();
  let noteCount = 0;

  for (const source of sources) {
    if (!source.review) continue;
    noteCount += source.review.notes.filter((note) => note.trim().length > 0).length;
    source.review.facts.forEach((fact, index) => {
      const issues: string[] = [];

      // Root identity fields can stand on their own without a parent institution.
      const rootField = ['education.school','award.title','experience.company','certificate.name'].includes(fact.target);
      if (!fact.scope.trim() && fact.target !== 'other' && !rootField) issues.push('缺少学校、单位或奖项的归属信息');
      if (!quoteSupportsValue(fact)) issues.push('识别值与引用原文不完全对应');
      const comparison = compareEvidenceFact(resume, fact);
      if (comparison.status === 'conflict') {
        issues.push('与当前简历的对应字段存在差异');
      }
      const entry: EvidenceAuditedFact = {
        sourceId: source.id, index, key: evidenceFactKey(fact), fact,
        issues, status: issues.length ? 'attention' : 'indexed', consistentSourceCount: 0,
      };
      facts.push(entry);
      const group = groupingKey(fact);
      if (group) {
        const members = groups.get(group) ?? [];
        members.push(entry);
        groups.set(group, members);
      }
    });
  }

  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    // One document cannot corroborate itself, even with repeated OCR rows.
    const values = new Map<string, EvidenceAuditedFact[]>();
    for (const entry of members) {
      const normalized = normalizedValue(entry.fact.value);
      const group = values.get(normalized) ?? [];
      group.push(entry);
      values.set(normalized, group);
    }
    if (values.size > 1) {
      for (const entry of members) {
        if (!entry.issues.includes('不同证据材料或同一材料对该字段给出不同结果')) {
          entry.issues.push('不同证据材料或同一材料对该字段给出不同结果');
        }
      }
      continue;
    }
    const fingerprintSet = new Set(members.map((entry) => {
      const source = sourcesById.get(entry.sourceId);
      // Unknown legacy fingerprints cannot count as independent corroboration.
      return source?.contentHash && /^[0-9a-f]{64}$/.test(source.contentHash)
        ? source.contentHash : null;
    }).filter((hash): hash is string => Boolean(hash)));
    if (fingerprintSet.size < 2) continue;
    for (const entry of members) {
      if (!entry.issues.length) entry.consistentSourceCount = fingerprintSet.size;
    }
  }

  for (const entry of facts) {
    entry.status = entry.issues.length ? 'attention'
      : entry.consistentSourceCount >= 2 ? 'consistent' : 'indexed';
  }
  return {
    facts,
    total:facts.length,
    indexed:facts.filter((entry) => entry.status === 'indexed').length,
    consistent:facts.filter((entry) => entry.status === 'consistent').length,
    attention:facts.filter((entry) => entry.status === 'attention').length,
    noteCount,
  };
}
