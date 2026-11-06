export type TemplateId = 'pdf-classic' | 'modern' | 'classic-ats' | 'creative-split';

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
  showPageBreakGuide: boolean;
  showIcons: boolean;
  leftColumnWidth?: number;
  sectionSpacing?: number;
  useThemeColorInPdf?: boolean;
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
