/**
 * RGS P0 deterministic boundaries shared by the server and preview UI.
 * These checks do not establish semantic truth: personal ownership and
 * unmeasured outcomes still require user review.
 */
export type OptimizationSection =
  | 'basics' | 'summary' | 'education' | 'skills'
  | 'projects' | 'experience' | 'awards' | 'custom';

type JsonRecord = Record<string, unknown>;

const editableFields: Record<OptimizationSection, ReadonlySet<string>> = {
  basics: new Set([]), // candidate status and target role are facts
  summary: new Set(['summary']),
  education: new Set(['courses', 'honors']),
  skills: new Set(['category', 'items']),
  projects: new Set(['summary', 'bullets']),
  experience: new Set(['bullets']),
  awards: new Set(['description']),
  custom: new Set(['bullets']),
};

const techNames = [
  'FreeRTOS', 'RT-Thread', 'Zephyr', 'STM32', 'ESP32', 'Arduino',
  'USART', 'UART', 'I2C', 'SPI', 'CAN', 'DMA', 'GPIO', 'HAL',
  'RTOS', 'FPGA', 'PCB', 'C++', 'C#', 'Python', 'Rust', 'Java',
  'TypeScript', 'JavaScript', 'React', 'Vue', 'Tauri', 'Linux',
  'Docker', 'Kubernetes', 'SQL Server', 'MySQL', 'Redis', 'AWS',
  'PyTorch', 'TensorFlow', 'PostgreSQL', 'LoRa', 'MQTT',
] as const;

export function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function allNumbers(value: unknown): Set<string> {
  const text = JSON.stringify(value) ?? '';
  return new Set((text.match(/(?<![\w])\d+(?:[.,]\d+)*/g) ?? [])
    .map((v) => v.replace(/,/g, '')));
}

function knownTechnology(text: string): Set<string> {
  const result = new Set<string>();
  for (const term of techNames) {
    const escaped = term.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const pattern = new RegExp('(^|[^A-Za-z0-9])' + escaped + '(?=$|[^A-Za-z0-9])', 'i');
    if (pattern.test(text)) result.add(term.toLowerCase());
  }
  return result;
}


/** Metadata and contact details are not evidence for a resume writing claim. */
function writingClaimSurface(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const facts: JsonRecord = { ...value };
  delete facts.evidence;
  delete facts.factLedger;
  delete facts.repoUrl;
  if (isRecord(facts.basics)) {
    const basics = { ...facts.basics };
    for (const field of ['phone','email','github','website','avatarUrl','avatarWidthPx']) {
      delete basics[field];
    }
    facts.basics = basics;
  }
  if (Array.isArray(facts.projects)) {
    facts.projects = facts.projects.map((project) => writingClaimSurface(project));
  }
  return facts;
}

export function newClaimWarnings(before: unknown, after: unknown): string[] {
  const issues: string[] = [];
  const numbers = allNumbers(before);
  const addedNumbers = [...allNumbers(after)].filter((n) => !numbers.has(n));
  if (addedNumbers.length) issues.push('新增了原始材料未提供的数字：' + addedNumbers.slice(0, 8).join('、'));
  const existingTerms = knownTechnology(JSON.stringify(before) || '');
  const additions = [...knownTechnology(JSON.stringify(after) || '')].filter((t) => !existingTerms.has(t));
  if (additions.length) issues.push('新增了原始材料未出现的技术名词：' + additions.join('、'));
  // This is deliberately a small high-risk phrase list, not an AI truth detector.
  // It stops common invented claims before a human sees the draft.
  const riskClaims = [
    '独立负责', '主导开发', '从零到一', '实板验证通过',
    '已投入生产', '量产交付', '生产上线', '零丢包',
    '零故障', '显著提升', '大幅提升', '工业级稳定运行',
  ];
  const oldText = JSON.stringify(before) ?? '';
  const nextText = JSON.stringify(after) ?? '';
  const inventedClaims = riskClaims.filter((phrase) =>
    nextText.includes(phrase) && !oldText.includes(phrase));
  if (inventedClaims.length) issues.push('出现原文未记载的高风险事实断言：' + inventedClaims.join('、'));
  // A configuration number reused as a claimed improvement is still a new fact.
  const performanceClaim = /(?:提升|提高|降低|减少|下降|节省|加速|缩短|改善).{0,18}\d+(?:\.\d+)?\s*(?:%|％|倍|ms|毫秒|秒|W|mA|FPS|QPS|MB|GB)/gi;
  const originalPerformance = new Set((String(typeof before === 'string' ? before : JSON.stringify(before) ?? '')).match(performanceClaim) ?? []);
  const proposedPerformance = String(typeof after === 'string' ? after : JSON.stringify(after) ?? '').match(performanceClaim) ?? [];
  if (proposedPerformance.some((claim) => !originalPerformance.has(claim))) {
    issues.push('新增原材料没有的性能提升或量化收益断言');
  }
  // Lexical red flags for clearly escalated responsibility or completion.
  // Only block when the source explicitly narrows the claim; normal
  // professional rewording (e.g. 使用 -> 设计) remains reviewable.
  const participating = /(?:参与|协助|配合)(?:.{0,18}(?:开发|设计|调试|测试|实施|研究))?/.test(oldText);
  const claimedLeadership = /(?:主导|独立(?:负责|完成|开发|实现)|全权负责)/.test(nextText);
  const originalLeadership = /(?:主导|独立(?:负责|完成|开发|实现)|全权负责)/.test(oldText);
  if (participating && claimedLeadership && !originalLeadership) {
    issues.push('原文属于参与或协作，不能无依据改写成主导或独立负责');
  }
  const tentative = /(?:开发中|调试中|测试中|待(?:校准|验证|测试)|未(?:校准|验证|测试)|尚未(?:校准|验证|测试)|仍需.{0,10}(?:校准|验证|测试|调试))/.test(oldText);
  const assertedSuccess = /(?:已?(?:通过(?:实板)?(?:验证|测试|验收)|(?:实板)?(?:验证|测试|验收)通过)|稳定运行|正式上线|已投入生产|量产交付)/.test(nextText);
  const successAlreadySupported = /(?:已?(?:通过(?:实板)?(?:验证|测试|验收)|(?:实板)?(?:验证|测试|验收)通过)|稳定运行|正式上线|已投入生产|量产交付)/.test(oldText);
  if (tentative && assertedSuccess && !successAlreadySupported) {
    issues.push('原文仍需调试或验证，不能无依据改写为验证通过、稳定运行或已上线');
  }
  return issues;
}

export function validateOptimizedItem(sectionType: string, original: unknown, candidate: unknown): string[] {
  if (!(sectionType in editableFields) || !isRecord(original) || !isRecord(candidate)) {
    return ['单条优化结果必须是受支持类型的 JSON 对象'];
  }
  const issues: string[] = [];
  const oldKeys = Object.keys(original).sort();
  const nextKeys = Object.keys(candidate).sort();
  if (JSON.stringify(oldKeys) !== JSON.stringify(nextKeys)) {
    issues.push('字段结构变化：不能新增、删除或替换简历数据字段');
  }
  const allow = editableFields[sectionType as OptimizationSection];
  for (const key of oldKeys) {
    if (!Object.hasOwn(candidate, key)) continue;
    const before = original[key];
    const after = candidate[key];
    if (Array.isArray(before)) {
      if (!Array.isArray(after) || after.length !== before.length ||
        before.some((item, i) => typeof item !== typeof after[i])) {
        issues.push(key + ' 类型或条目数量变化');
      }
    } else if (typeof after !== typeof before) {
      issues.push(key + ' 字段类型变化');
    }
    if (!allow.has(key) && JSON.stringify(before) !== JSON.stringify(after)) {
      issues.push(key + ' 是原始事实字段，不允许 AI 自动改写');
    }
    if (allow.has(key)) {
      if (typeof after === 'string' && after.length > Math.max(6000, String(before).length * 4)) {
        issues.push(key + ' 内容异常过长');
      }
      if (Array.isArray(after) && after.some((v) => typeof v !== 'string')) {
        issues.push(key + ' 必须为字符串列表');
      }
    }
  }
  issues.push(...newClaimWarnings(writingClaimSurface(original), writingClaimSurface(candidate)));
  return [...new Set(issues)];
}

const importFields: Record<string, ReadonlySet<string>> = {
  basics: new Set([
    'name','title','directionTags','phone','email','location','github','website',
    'schoolTag','statusTag','politicalStatus','graduationYear','summary',
  ]),
  education: new Set(['school','degree','major','startDate','endDate','gpa','ranking','courses','honors']),
  skills: new Set(['category','items']),
  projects: new Set(['name','role','startDate','endDate','techStack','summary','bullets']),
  experience: new Set(['company','position','department','location','startDate','endDate','techStack','bullets']),
  awards: new Set(['title','issuer','date','level','description']),
};

export function validateParsedResume(value: unknown): string[] {
  if (!isRecord(value) || !isRecord(value.basics)) return ['简历解析结果缺少 basics 对象'];
  const issues: string[] = [];
  for (const [name, allowed] of Object.entries(importFields)) {
    const collection = value[name];
    const entries = name === 'basics' ? [collection] : collection;
    if (!Array.isArray(entries)) {
      issues.push(name + ' 必须是数组'); continue;
    }
    if (entries.length > 150) { issues.push(name + ' 条目数量异常'); continue; }
    for (const [idx, entry] of entries.entries()) {
      if (!isRecord(entry)) { issues.push(name + '[' + idx + '] 不是对象'); continue; }
      for (const [key, field] of Object.entries(entry)) {
        if (!allowed.has(key)) {
          issues.push(name + '[' + idx + '].' + key + ' 不是允许的字段'); continue;
        }
        const arrayField = (key === 'techStack' || key === 'bullets') && name !== 'basics';
        if (arrayField ? !Array.isArray(field) || field.some((item) => typeof item !== 'string')
          : typeof field !== 'string') {
          issues.push(name + '[' + idx + '].' + key + ' 字段类型错误');
        }
      }
    }
  }
  return issues;
}

export function validateTailoredSummary(resumeContent: unknown, suggestedSummary: unknown): string[] {
  if (typeof suggestedSummary !== 'string' || !suggestedSummary.trim()) return ['个人总结必须是非空文本'];
  if (suggestedSummary.length > 1800) return ['个人总结异常过长'];
  return newClaimWarnings(writingClaimSurface(resumeContent), suggestedSummary);
}

/**
 * Reject damaged local JSON backups before replacing the active resume.
 * A missing older customSections field is supported by the caller as [].
 */
export function validateStoredResume(value: unknown): string[] {
  if (!isRecord(value) || !isRecord(value.basics) || !isRecord(value.style)) {
    return ['导入文件缺少完整的个人信息或模板配置'];
  }
  const issues: string[] = [];
  const b = value.basics;
  for (const field of ['name','title','phone','email','summary']) {
    if (typeof b[field] !== 'string') issues.push('basics.' + field + ' 不是文本');
  }
  if (typeof value.style.template !== 'string' || !value.style.template) {
    issues.push('style.template 缺失或无效');
  }
  if (value.style.pageGoal !== undefined &&
      value.style.pageGoal !== 'one' && value.style.pageGoal !== 'flexible') {
    issues.push('style.pageGoal 单页约束无效');
  }
  if (!Array.isArray(value.sections) ||
    value.sections.some((sec) =>
      !isRecord(sec) || typeof sec.id !== 'string' ||
      typeof sec.type !== 'string' || typeof sec.title !== 'string' ||
      typeof sec.visible !== 'boolean')) {
    issues.push('sections 章节配置不完整');
  }
  for (const field of ['education','projects','experience','skills','awards']) {
    const collection = value[field];
    if (!Array.isArray(collection) || collection.some((item) =>
      !isRecord(item) || typeof item.id !== 'string')) {
      issues.push(field + ' 条目结构不完整');
    }
  }
  if (Array.isArray(value.education) && value.education.some((raw) => {
    if(!isRecord(raw))return false;
    if(raw.weightedAverage!==undefined && typeof raw.weightedAverage!=='string')return true;
    if(raw.courseGrades===undefined)return false; // Old documents intentionally lack this field.
    return !Array.isArray(raw.courseGrades) || raw.courseGrades.length>200 ||
      raw.courseGrades.some((grade)=>!isRecord(grade) ||
        typeof grade.id!=='string' || grade.id.length>120 ||
        typeof grade.course!=='string' || grade.course.length>150 ||
        typeof grade.score!=='string' || grade.score.length>40);
  }))issues.push('education 课程成绩或加权均分结构无效');
  if (Array.isArray(value.awards) && value.awards.some((raw)=>isRecord(raw) &&
    raw.credentialType!==undefined && !['award','certificate'].includes(String(raw.credentialType))))
    issues.push('awards 证书与奖项类型无效');
  if (value.customSections !== undefined &&
    (!Array.isArray(value.customSections) || value.customSections.some((sec) =>
      !isRecord(sec) || typeof sec.id !== 'string' || !Array.isArray(sec.items)))) {
    issues.push('customSections 自定义章节结构不完整');
  }
  if (value.factLedger !== undefined) {
    const ledger = value.factLedger;
    if (!isRecord(ledger) || ledger.version !== 1 || !Array.isArray(ledger.records) ||
      ledger.records.length > 2000 || ledger.records.some((record) =>
        !isRecord(record) || typeof record.factId !== 'string' ||
        typeof record.path !== 'string' || typeof record.normalizedValue !== 'string' ||
        typeof record.originalValue !== 'string' || typeof record.candidateConfirmed !== 'boolean' ||
        !['verified-source','user-asserted','inferred-suggestion','missing','conflicting'].includes(String(record.status)) ||
        !Array.isArray(record.sources) || record.sources.some((source) =>
          !isRecord(source) || typeof source.sourceId !== 'string' ||
          typeof source.label !== 'string' ||
          !['ai-file-extraction','ai-pasted-text'].includes(String(source.kind))))) {
      issues.push('factLedger 事实来源结构不完整');
    }
  }
  return issues;
}
