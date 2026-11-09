export type TemplateId =
  | 'pdf-classic' | 'modern' | 'classic-ats' | 'creative-split'
  | 'reactive-meowth' | 'reactive-onyx' | 'reactive-bronzor'
  | 'render-engineering' | 'render-engineering-classic' | 'render-harvard'
  | 'awesome-inspired' | 'resumesample-engineer';

export type SectionType =
  | 'summary'
  | 'education'
  | 'projects'
  | 'experience'
  | 'skills'
  | 'awards'
  | 'custom';

export type SectionColumn = 'left' | 'right';

export interface SectionConfig {
  id: string;
  type: SectionType;
  title: string;
  englishTitle?: string;
  visible: boolean;
  column?: SectionColumn;
  customSectionId?: string;
  /** Optional gap immediately before this module in px; undefined inherits global spacing. */
  spacingBeforePx?: number;
}

export interface BasicsInfo {
  name: string;
  title: string;
  directionTags?: string;
  phone: string;
  email: string;
  location: string;
  github: string;
  website: string;
  schoolTag?: string;
  statusTag?: string;
  politicalStatus: string;
  graduationYear: string;
  avatarUrl: string;
  showAvatar: boolean;
  avatarPosition?: 'left' | 'right';
  avatarZoom?: number;
  avatarOffsetX?: number;
  avatarOffsetY?: number;
  avatarBgColor?: string;
  avatarWidthPx?: number;
  summary: string;
}

/** Source-backed grade data is retained structurally, not silently inserted into every A4 template. */
export interface CourseGradeItem { id: string; course: string; score: string }

export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string;
  gpa: string;
  ranking: string;
  courses: string;
  /** Kept separate: never merge the weighted percentage with GPA/5. */
  weightedAverage?: string;
  courseGrades?: CourseGradeItem[];
  honors: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  repoUrl: string;
  techStack: string[];
  summary: string;
  bullets: string[];
  /** Public GitHub materials used to draft this project. Not proof of personal contribution. */
  evidence?: {
    repository: string;
    revision: string;
    commitShas: string[];
    sourceFiles: Array<{ path: string; url: string }>;
    /** Code indicators with source links, never personal-contribution verification. */
    codeSignals?: Array<{ technology: string; category: string; sourceFiles: Array<{ path: string; url: string }> }>;
    warnings: string[];
    notice: string;
  };
}

export interface ExperienceItem {
  id: string;
  company: string;
  position: string;
  department: string;
  location: string;
  startDate: string;
  endDate: string;
  techStack: string[];
  bullets: string[];
}

export interface SkillCategory {
  id: string;
  category: string;
  items: string;
}

export interface AwardItem {
  id: string;
  /** The existing certificate-and-award section can host either kind. */
  credentialType?: 'award' | 'certificate';
  title: string;
  issuer: string;
  date: string;
  level: string;
  description: string;
}

export interface CustomSectionItem {
  id: string;
  heading: string;
  subheading: string;
  date: string;
  bullets: string[];
}

export interface CustomSection {
  id: string;
  title: string;
  items: CustomSectionItem[];
}

export interface ResumeStyleConfig {
  template: TemplateId;
  accentColor: string;
  fontSize: 'sm' | 'md' | 'lg';
  lineHeight: 'tight' | 'normal' | 'relaxed';
  pageMargin: 'compact' | 'standard' | 'generous';
  /** Optional export constraint; older resumes remain flexible by default. */
  pageGoal?: 'one' | 'flexible';
  showPageBreakGuide: boolean;
  showIcons: boolean;
  leftColumnWidth?: number;
  sectionSpacing?: number;
  /** Optional global gap between project/experience entries; absent uses template defaults. */
  itemSpacingPx?: number;
  /** Optional gap after module heading and before module content. */
  headingContentSpacingPx?: number;
  /** Optional gap between bullet points within projects and experience. */
  bulletSpacingPx?: number;
  useThemeColorInPdf?: boolean;
}

export type ResumeFactClaimType =
  | 'identity' | 'education' | 'role' | 'skill' | 'action' | 'metric' | 'outcome' | 'award' | 'date';
export type ResumeFactStatus =
  | 'verified-source' | 'user-asserted' | 'inferred-suggestion' | 'missing' | 'conflicting';

/** Local, non-authoritative provenance snapshot. It never proves an extracted claim is true. */
export interface ResumeFactRecord {
  factId: string;
  path: string;
  claimType: ResumeFactClaimType;
  originalValue: string;
  normalizedValue: string;
  sources: Array<{
    sourceId: string;
    kind: 'ai-file-extraction' | 'ai-pasted-text';
    label: string;
    capturedAt: string;
  }>;
  status: ResumeFactStatus;
  candidateConfirmed: boolean;
  editedAt: string;
  versionId: string;
  sensitivity: 'personal' | 'normal';
  cloudAllowed: boolean;
}

export interface ResumeFactLedger {
  version: 1;
  records: ResumeFactRecord[];
}

export interface ResumeDocument {
  id: string;
  versionName: string;
  updatedAt: string;
  basics: BasicsInfo;
  sections: SectionConfig[];
  education: EducationItem[];
  projects: ProjectItem[];
  experience: ExperienceItem[];
  skills: SkillCategory[];
  awards: AwardItem[];
  customSections: CustomSection[];
  style: ResumeStyleConfig;
  /** Optional RGS provenance ledger; older documents load without it. */
  factLedger?: ResumeFactLedger;
}

export interface ResumeSlot {
  id: string;
  name: string;
  /** Job Role Column / Lane (每个岗位一栏，例如：'嵌入式软件工程师'、'硬件/PCB工程师'、'软件测试工程师') */
  roleCategory: string;
  /** Version tag such as 'v1.0', 'v1.1', 'v2.0' */
  versionTag?: string;
  /** Optional target company or scenario tag */
  targetCompany?: string;
  /** Modification notes / changelog for this specific version */
  notes?: string;
  updatedAt: string;
  data: ResumeDocument;
}

export interface GitHubRepoSummary {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  topics?: string[];
}

export interface JDMatchResult {
  summaryReviewNotice?: string;
  matchScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  executiveSummary: string;
  tailoredSummary: string;
  actionableSuggestions: {
    targetSection: string;
    issue: string;
    recommendedText: string;
  }[];
}
