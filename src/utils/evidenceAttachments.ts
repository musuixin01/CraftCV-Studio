import type { ResumeDocument } from '../types/resume';

/** User evidence is private material, not a resume and not a verified fact. */
export const MAX_EVIDENCE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_EVIDENCE_FILES_PER_SLOT = 12;
export const EVIDENCE_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
export const EVIDENCE_TARGETS = [
  'education.school', 'education.major', 'education.degree',
  'education.startDate', 'education.endDate', 'education.gpa',
  'education.ranking', 'education.course', 'education.courseGrade',
  'education.weightedAverage', 'education.honors',
  'award.title', 'award.issuer', 'award.date', 'award.level',
  'certificate.name', 'certificate.level', 'certificate.date',
  'experience.company', 'experience.position', 'experience.startDate',
  'experience.endDate', 'other',
] as const;
export type EvidenceTarget = typeof EVIDENCE_TARGETS[number];

export interface EvidenceFact {
  target: EvidenceTarget;
  /** Which institution / award / employer the source line belongs to. */
  scope: string;
  label: string;
  value: string;
  /** Short exact quotation as read by the model; user must check against original. */
  quote: string;
}
export interface EvidenceReview {
  documentType: 'transcript' | 'award' | 'certificate' | 'internship' | 'other';
  facts: EvidenceFact[];
  notes: string[];
}
export type EvidenceComparison = {
  status: 'same' | 'conflict' | 'not-in-resume' | 'needs-review';
  current?: string;
  location?: string;
};

export function evidenceMimeFromFile(file: Pick<File, 'name' | 'size' | 'type'>): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = EVIDENCE_MIME_BY_EXTENSION[ext];
  if (!mime || file.size <= 0 || file.size > MAX_EVIDENCE_FILE_BYTES ||
      file.name.length > 160 || /[\/\\\u0000-\u001f]/.test(file.name)) {
    throw new Error('仅支持单个不超过 8MB 的 PDF、PNG、JPG 或 WebP 附件（文件名不超过 160 字）。');
  }
  if (file.type && file.type !== mime && !(ext === 'jpg' && file.type === 'image/jpeg')) {
    throw new Error('附件扩展名与媒体类型不一致，请核对原始文件。');
  }
  return mime;
}

export function validateEvidenceReview(value: unknown): EvidenceReview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI 附件识别结构无效');
  const raw = value as Record<string, unknown>;
  const kinds = ['transcript','award','certificate','internship','other'];
  if (!kinds.includes(String(raw.documentType)) ||
      !Array.isArray(raw.facts) || raw.facts.length > 40 ||
      !Array.isArray(raw.notes) || raw.notes.length > 8 ||
      !raw.notes.every((note) => typeof note === 'string' && note.length <= 300)) {
    throw new Error('AI 附件识别字段缺失或超过安全限制');
  }
  const facts: EvidenceFact[] = [];
  for (const candidate of raw.facts) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('附件识别项目不是对象');
    const fact = candidate as Record<string, unknown>;
    if (!EVIDENCE_TARGETS.includes(fact.target as EvidenceTarget) ||
        typeof fact.scope !== 'string' || fact.scope.length > 120 ||
        typeof fact.label !== 'string' || !fact.label.trim() || fact.label.length > 100 ||
        typeof fact.value !== 'string' || !fact.value.trim() || fact.value.length > 240 ||
        typeof fact.quote !== 'string' || !fact.quote.trim() || fact.quote.length > 400) {
      throw new Error('附件识别存在无来源、越界或未知字段，请重新识别并人工核对');
    }
    facts.push({
      target: fact.target as EvidenceTarget, scope: fact.scope.trim(),
      label: fact.label.trim(), value: fact.value.trim(), quote: fact.quote.trim(),
    });
  }
  return {
    documentType: raw.documentType as EvidenceReview['documentType'],
    facts,
    notes: (raw.notes as string[]).map((note) => note.trim()),
  };
}

function normalize(value: string): string {
  return value.replace(/[\s，,。.·:：;；()（）]/g, '').toLocaleLowerCase();
}
function matchesLabel(left: string, right: string): boolean {
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

/** Conservative same-record comparison. Uncertain scope is NEVER a conflict. */
export function compareEvidenceFact(resume: ResumeDocument, fact: EvidenceFact): EvidenceComparison {
  const [domain, field] = fact.target.split('.');
  let current = '';
  let location = '';
  if (domain === 'education') {
    const item = resume.education.find((entry) => Boolean(normalize(fact.scope)) && normalize(entry.school) === normalize(fact.scope)) ??
      (!fact.scope && resume.education.length === 1 ? resume.education[0] : undefined);    if (!item) return { status:'needs-review' };
    location = item.school;
    if (field === 'course') return {status:'needs-review',current:item.courses,location};
    if (field === 'courseGrade') {
      const matches=(item.courseGrades??[]).filter((grade)=>normalize(grade.course)===normalize(fact.label));
      if (matches.length!==1)return {status:'needs-review',location};
      current=matches[0].score;
    } else if (field === 'weightedAverage') {
      current=item.weightedAverage??'';
    } else {
      current=String(item[field as keyof typeof item]??'');
    }
  } else if (domain === 'award') {
    const item = resume.awards.find((entry) => matchesLabel(entry.title, fact.scope));
    if (!item) return { status:'needs-review' };
    location = item.title;
    current = String(item[field as keyof typeof item] ?? '');
  } else if (domain === 'experience') {
    const item = resume.experience.find((entry) => matchesLabel(entry.company, fact.scope));
    if (!item) return { status:'needs-review' };
    location = item.company;
    current = String(item[field as keyof typeof item] ?? '');
  } else {
    return { status:'needs-review' };
  }
  if (!current.trim()) return { status:'not-in-resume',location };
  return { status:normalize(current) === normalize(fact.value) ? 'same' : 'conflict',current,location };
}
