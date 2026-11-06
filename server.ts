import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  // 1. GitHub Public API Proxy (prevents CORS or browser header issues and fetches README cleanly)
  app.get('/api/github/user/:username/repos', async (req, res) => {
    try {
      const { username } = req.params;
      const response = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=20`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'CraftCV-Studio-Builder',
          },
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        res.status(response.status).json({
          error: `GitHub API 请求失败 (${response.status})：请确认用户名是否存在或稍后重试`,
          details: errText,
        });
        return;
      }

      const repos = await response.json();
      res.json({ repos });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || '无法连接 GitHub API' });
    }
  });

  app.get('/api/github/repo/:owner/:repo/details', async (req, res) => {
    try {
      const { owner, repo } = req.params;
      const headers = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'CraftCV-Studio-Builder',
      };

      const [repoRes, readmeRes, langRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers }),
        fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`, { headers }),
        fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/languages`, { headers }),
      ]);

      if (!repoRes.ok) {
        res.status(repoRes.status).json({ error: `未找到仓库 ${owner}/${repo}` });
        return;
      }

      const repoData = await repoRes.json();
      let readmeContent = '';
      if (readmeRes.ok) {
        const readmeJson: any = await readmeRes.json();
        if (readmeJson.content) {
          readmeContent = Buffer.from(readmeJson.content, 'base64').toString('utf-8').slice(0, 4500);
        }
      }

      let languages: string[] = [];
      if (langRes.ok) {
        const langJson: any = await langRes.json();
        languages = Object.keys(langJson);
      }

      res.json({
        repo: repoData,
        readme: readmeContent,
        languages,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || '读取 GitHub 仓库详情失败' });
    }
  });

  // 2. AI Bullet & Experience Polishing (Gemini 3.8 Flash + Skill Reading)
  app.post('/api/ai/polish', async (req, res) => {
    try {
      const { title, subtitle, techStack, bullets, mode, targetRole, selectedSkills } = req.body;
      const ai = getGenAIClient();

      const modeInstructions: Record<string, string> = {
        star: '使用标准 STAR 法则（情境/背景、任务挑战、核心技术方案与系统架构、可量化的工程成果指标）重构每条要点，使其极具专业说服力。',
        hardware_arch: '突出电子信息工程/嵌入式/FPGA/软硬件协同特色：强化底层驱动、通信协议（SPI/I2C/UART/CAN/AXI）、信号处理算法、资源占用率、功耗优化、采样率或吞吐量等硬核工程细节。',
        quantify: '重点补充和强化可量化的工程指标（如延迟降低 X%、帧率提升至 X FPS、信噪比提升 X dB、误码率、资源利用率、并发吞吐量或代码覆盖率）。',
        concise: '精简冗余口语，用高信息密度的技术动词开头（如“设计并实现”、“基于...构建”、“优化...算法”），严格控制每条字数以适配一页 A4 纸排版。',
      };

      const selectedInstruction = modeInstructions[mode] || modeInstructions.star;
      const skillsArray = Array.isArray(selectedSkills) ? selectedSkills : [];
      const skillsBlock =
        skillsArray.length > 0
          ? `\n【必须先阅读并严格执行的已选技能规范 (SKILL.md)】：\n${skillsArray
              .map((sk: any, i: number) => `--- 技能 #${i + 1}: ${sk.name} ---\n${sk.skillMarkdown}`)
              .join('\n')}\n`
          : '';

      const prompt = `你是一位资深电子信息工程（EE/嵌入式/FPGA/通信/软硬件研发）与互联网大厂校招技术面试官。
求职者目标岗位：${targetRole || '嵌入式/软硬件研发工程师'}
当前经历名称：${title || '未命名项目'}
角色/副标题：${subtitle || ''}
涉及技术栈：${Array.isArray(techStack) ? techStack.join(', ') : techStack || ''}
原始经历描述要点：
${(bullets || []).map((b: string, i: number) => `${i + 1}. ${b}`).join('\n')}
${skillsBlock}
优化要求：请先阅读上方技能规范，再结合「${selectedInstruction}」进行优化。
请返回优化后的项目总结（1句话）和 3~4 条高质量简历要点（每条以强有力的技术动词开头，包含具体技术实现细节与量化结果），并简要说明本次结合技能规范增强了哪些亮点。`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction: '你是专业的理工科与技术岗简历优化专家，输出严谨、真实、符合大厂与研究所校招审美的中文技术简历内容。',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: '一句话高概括性的项目核心定位与架构概述',
              },
              polishedBullets: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '优化后的 3 到 4 条 STAR 法则技术要点',
              },
              suggestedTechStack: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '提炼出的关键技术栈词条（4~7个）',
              },
              improvementNotes: {
                type: Type.STRING,
                description: '简短说明本次润色增强了哪些技术维度与量化表达',
              },
            },
            required: ['summary', 'polishedBullets', 'suggestedTechStack', 'improvementNotes'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error: any) {
      console.error('Gemini polish error:', error);
      res.status(500).json({
        error: error?.message || 'AI 润色请求失败，请检查密钥配置或稍后重试。',
      });
    }
  });

  // 3. AI GitHub Repo to Resume Project Converter
  app.post('/api/ai/github-to-resume', async (req, res) => {
    try {
      const { repoName, description, htmlUrl, languages, topics, stars, readme, targetRole } = req.body;
      const ai = getGenAIClient();

      const prompt = `请将以下 GitHub 开源项目转化为一段可直接放进【电子信息工程 / 技术岗校招简历】的高质量项目经历。
目标求职方向：${targetRole || '电子信息工程 / 嵌入式与软硬件研发工程师'}
仓库名称：${repoName}
仓库地址：${htmlUrl}
仓库简介：${description || '无'}
编程语言分布：${(languages || []).join(', ') || '未指定'}
Topics 标签：${(topics || []).join(', ') || '无'}
Star 数量：${stars ?? 0}
README 文档内容摘录：
${readme ? readme.slice(0, 3500) : '（仓库未提供详细 README，请根据仓库名、简介与语言合理提炼工程实现要点）'}

请提炼出：
1. 专业的中文项目展示名称（可保留核心英文代号）
2. 建议担任角色（如“核心开发者 / 独立完成”或“硬件与底层驱动负责人”）
3. 核心技术栈数组（4~6个关键词）
4. 一句话项目简介
5. 3~4 条符合 STAR 法则的硬核技术要点（涵盖系统设计、核心算法/模块实现、性能优化与工程成果）`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction: '你是精通电子信息工程、嵌入式系统、信号处理与软件工程的技术面试官，擅长从 GitHub 代码库提炼高含金量的中文简历项目经历。',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              projectTitle: { type: Type.STRING, description: '专业的中文项目名称' },
              role: { type: Type.STRING, description: '项目角色' },
              techStack: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '核心技术栈标签',
              },
              summary: { type: Type.STRING, description: '一句话项目核心架构简介' },
              bullets: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3~4条遵循STAR法则的技术实现与成果要点',
              },
            },
            required: ['projectTitle', 'role', 'techStack', 'summary', 'bullets'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error: any) {
      console.error('Gemini GitHub-to-resume error:', error);
      res.status(500).json({
        error: error?.message || 'GitHub 项目 AI 提炼失败，请稍后重试。',
      });
    }
  });

  // 4. AI Job Description (JD) Match Diagnosis & Tailoring
  app.post('/api/ai/jd-match', async (req, res) => {
    try {
      const { resumeData, jobDescription } = req.body;
      const ai = getGenAIClient();

      const prompt = `请对比分析以下求职者的当前简历数据与目标岗位 JD（职位描述），给出专业、客观的匹配度诊断与定制修改建议。

【目标岗位 JD】：
${jobDescription}

【当前简历数据 JSON 摘要】：
姓名与意向：${resumeData?.basics?.name} - ${resumeData?.basics?.title}
个人总结：${resumeData?.basics?.summary}
教育背景：${JSON.stringify(resumeData?.education || [])}
专业技能：${JSON.stringify(resumeData?.skills || [])}
项目经历：${JSON.stringify(resumeData?.projects || [])}
实习与科研经历：${JSON.stringify(resumeData?.experience || [])}
竞赛与荣誉：${JSON.stringify(resumeData?.awards || [])}

请输出结构化 JSON 分析结果，包含：
- matchScore: 0~100 的匹配度整数评分
- matchedKeywords: 简历已命中的核心技术关键词数组
- missingKeywords: JD 明确要求但简历缺失或表述较弱的关键词数组
- executiveSummary: 整体竞争力点评（2~3句话）
- tailoredSummary: 针对该 JD 重新定制的个人优势总结（可直接一键替换到简历顶部）
- actionableSuggestions: 具体针对哪一段项目或技能模块的改写建议数组`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction: '你是资深技术招聘专家与电子信息/IT行业校招面试官，擅长精准分析简历与岗位JD的技术栈契合度并给出可落地的改写方案。',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matchScore: { type: Type.INTEGER, description: '0到100的匹配度整数得分' },
              matchedKeywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '已命中的技术关键词',
              },
              missingKeywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '建议补充或强化的缺失关键词',
              },
              executiveSummary: {
                type: Type.STRING,
                description: '整体匹配度诊断总结',
              },
              tailoredSummary: {
                type: Type.STRING,
                description: '为该岗位定制的简历个人总结文本，可直接替换',
              },
              actionableSuggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    targetSection: { type: Type.STRING, description: '目标模块名称，如 项目经历 或 专业技能' },
                    issue: { type: Type.STRING, description: '当前不足之处' },
                    recommendedText: { type: Type.STRING, description: '推荐改写或补充的具体话术' },
                  },
                  required: ['targetSection', 'issue', 'recommendedText'],
                },
              },
            },
            required: [
              'matchScore',
              'matchedKeywords',
              'missingKeywords',
              'executiveSummary',
              'tailoredSummary',
              'actionableSuggestions',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error: any) {
      console.error('Gemini JD match error:', error);
      res.status(500).json({
        error: error?.message || '岗位 JD 匹配分析失败，请稍后重试。',
      });
    }
  });

  // 5. Granular Item / Category AI Optimizer with Auto-Skill Routing + Skill-Reading Pipeline
  app.post('/api/ai/optimize-section', async (req, res) => {
    try {
      const {
        sectionType,
        sectionTitle,
        targetRole,
        mode,
        customPrompt,
        payload,
        selectedSkills,
        autoSelectSkills,
        availableSkills,
      } = req.body;
      const ai = getGenAIClient();

      const modeMap: Record<string, string> = {
        star: '采用 STAR 工程法则重构，强化技术方案深度与量化成果指标，并用 **关键词** 语法将核心技术栈与关键数据加粗高亮。',
        hardware_arch:
          '深度强化电子信息工程/嵌入式/MCU固件/RTOS/外设驱动/FPGA/PCB硬件专业术语，体现扎实的底层开发与实板联调能力，关键技术词用 **关键词** 加粗。',
        concise:
          '精简冗余字词、凝练句式，在不丢失核心硬核技术点的前提下压缩字数（适配单页 A4 紧凑排版），关键指标用 **关键词** 加粗。',
        quantify:
          '重点提炼和补充可量化的工程性能指标（如采样精度、帧率、延时、功耗、稳定性提升百分比等），并用 **关键词** 加粗核心数据。',
      };

      const strategyText = modeMap[mode] || modeMap.star;
      const extraUserReq = customPrompt ? `\n【用户额外优化指令】：${customPrompt}` : '';

      const catalog = Array.isArray(availableSkills) && availableSkills.length > 0 ? availableSkills : selectedSkills || [];
      const manualSkills = Array.isArray(selectedSkills) ? selectedSkills : [];

      const skillsContextBlock = autoSelectSkills
        ? `\n<skill_library_catalog>\n【系统强制要求：当前处于「AI 自动匹配技能模式」。请先根据下方待优化条目的具体内容，从以下 ${catalog.length} 个候选技能库中自动挑选最契合的 1~3 项技能（在 autoMatchedSkillIds 中返回其 id，在 autoMatchReasoning 中说明为什么挑选这几项技能），然后完整阅读所挑中技能的 SKILL.md 规则并严格按规则执行优化】：\n${catalog
            .map(
              (sk: any, idx: number) =>
                `--- [候选技能 #${idx + 1} | id: "${sk.id}" | 名称: ${sk.name} (${sk.category || '专业技能'})] ---\n技能简介：${sk.description || ''}\n${sk.skillMarkdown}\n`
            )
            .join('\n')}</skill_library_catalog>\n`
        : manualSkills.length > 0
          ? `\n<loaded_skills>\n【系统强制要求：AI 在优化前必须先完整阅读并严格遵循以下用户指定的 ${manualSkills.length} 个专业技能规范（SKILL.md）】：\n${manualSkills
              .map(
                (sk: any, idx: number) =>
                  `--- [已指定技能 #${idx + 1} | id: "${sk.id}" | 名称: ${sk.name} (${sk.category || '专业技能'})] ---\n${sk.skillMarkdown}\n`
              )
              .join('\n')}</loaded_skills>\n`
          : '\n（当前未额外挂载自定义技能包，请按默认电子信息工程面试官最高标准执行优化）\n';

      const prompt = `你是一位资深电子信息工程（嵌入式软件、MCU固件、实时系统、FPGA、硬件研发）与互联网大厂技术面试官。
求职者目标岗位：${targetRole || '嵌入式软件工程师'}
当前正在单独优化的具体条目所属类型：${sectionType}（具体类目名称：${sectionTitle || sectionType}）
基础策略要求：${strategyText}${extraUserReq}
${skillsContextBlock}
【当前单条类目原始数据 JSON】：
${JSON.stringify(payload, null, 2)}

请严格按照以下三步执行：
第一步（自动选技能 / 确认技能）：若处于 AI 自动匹配技能模式，请分析当前条目的技术领域与痛点，从候选技能库中选出最合适的 1~3 个技能 ID 填入 autoMatchedSkillIds，并在 autoMatchReasoning 中用一句话说明选技能依据；若为用户手动指定模式，则直接返回已指定技能的 ID。
第二步（先阅读技能）：仔细阅读所选中的每一项技能文档（SKILL.md），提取其中的专业术语准则、句式结构规范、禁用词清单与量化指标要求，并在返回结果的 skillApplicationLog 数组中逐条说明你是如何结合每项技能对当前条目进行改造的。
第三步（执行单项优化）：仅针对这一个单独类目进行专业级润色与升级，并在 optimizedDataJSON 字符串中返回与输入 payload 结构完全一致的单个 JSON 对象字符串（务必保留原有 id 字段）：
1. 若 sectionType === "summary"：payload 为 { summary: string }。输出极具竞争力的 2~3 句话个人简介，重要技术词用 **词** 加粗。
2. 若 sectionType === "basics"：payload 为 { title: string, directionTags: string, statusTag: string }。优化岗位名称、细分技术方向标签与状态标签。
3. 若 sectionType === "education"：payload 为单个 EducationItem 对象。保持学校、专业、时间、GPA真实数据不变，重点优化该条学历的 courses（核心课程）和 honors（荣誉奖项的专业表述）。
4. 若 sectionType === "skills"：payload 为单个 SkillCategory 对象（{ id, category, items }）。请优化这一个技能分类的 category 标题与 items 具体技术栈描述，使其术语精准、层次分明（核心技术点可用 **词** 加粗）。
5. 若 sectionType === "projects"：payload 为单个 ProjectItem 对象。请优化这一个项目的 name、role、techStack 和 bullets（每条要点以强力工程动词开头，最后一条以“项目成果：”开头，关键技术与量化指标用 **词** 加粗）。
6. 若 sectionType === "experience"：payload 为单个 ExperienceItem 对象。请优化这一段实习的 position 和 bullets，突出工程排查闭环、软硬件联调规范与实际产出，核心词用 **词** 加粗。
7. 若 sectionType === "awards"：payload 为单个 AwardItem 对象。请规范化这一条竞赛/证书的 title、level 与 description 表述，使其严谨醒目。
8. 若 sectionType === "custom"：payload 为单个 CustomSectionItem 对象。请专业化润色该条目的 heading、subheading 和 bullets。`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction:
            '你是支持 Auto-Skill-Routing（自动挑选最适技能 -> 先阅读技能规范 -> 再执行优化）的理工科与嵌入式/电子信息校招简历优化专家。必须保证 optimizedDataJSON 是合法的 JSON 对象字符串，且字段结构与输入的单个条目 payload 100% 一致（保留原有 id）。',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              autoMatchedSkillIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'AI 从候选技能库中自动挑选出的最匹配当前类目的 1~3 个技能 ID 数组',
              },
              autoMatchReasoning: {
                type: Type.STRING,
                description: '一句话说明 AI 为什么针对当前条目自动挑选了这些技能',
              },
              skillApplicationLog: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'AI 阅读所选技能后，针对每项已选技能说明具体应用了哪些规则与术语升级',
              },
              improvementNotes: {
                type: Type.STRING,
                description: '简明扼要说明本次 AI 对该单条类目做了哪些关键升级与亮点强化（1~2句话）',
              },
              highlights: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '本次优化的 2~3 个具体改进点列表',
              },
              optimizedDataJSON: {
                type: Type.STRING,
                description: '优化后的单条数据 JSON 字符串，结构必须与输入 payload 完全一致（保留原有 id）',
              },
            },
            required: [
              'autoMatchedSkillIds',
              'autoMatchReasoning',
              'skillApplicationLog',
              'improvementNotes',
              'highlights',
              'optimizedDataJSON',
            ],
          },
        },
      });

      const raw = JSON.parse((response.text ?? '{}').trim());
      let parsedData = payload;
      try {
        parsedData = JSON.parse(raw.optimizedDataJSON);
      } catch {
        parsedData = raw.optimizedDataJSON || payload;
      }

      res.json({
        autoMatchedSkillIds: Array.isArray(raw.autoMatchedSkillIds) ? raw.autoMatchedSkillIds : [],
        autoMatchReasoning: raw.autoMatchReasoning || '',
        skillApplicationLog: Array.isArray(raw.skillApplicationLog) ? raw.skillApplicationLog : [],
        improvementNotes: raw.improvementNotes || '已结合所选技能规范完成该类目的专业级优化',
        highlights: raw.highlights || [],
        optimizedData: parsedData,
      });
    } catch (error: any) {
      console.error('Gemini optimize-section error:', error);
      res.status(500).json({
        error: error?.message || '单条类目 AI 优化请求失败，请稍后重试。',
      });
    }
  });

  // 6. Multimodal Resume Parser (PDF / Image / Markdown / Plain Text -> Structured ResumeDocument)
  app.post('/api/ai/parse-resume', async (req, res) => {
    try {
      const { base64Data, mimeType, rawText, fileName } = req.body;
      const ai = getGenAIClient();

      const promptText = `请完整识别并解析这份求职简历（文件名：${fileName || '未命名简历'}），将其所有信息精准提取并转化为结构化的 JSON 数据，不要遗漏任何教育经历、专业技能、项目经历、实习经历或获奖证书。

提取规范：
1. basics：提取姓名(name)、求职岗位意向(title，若未明确写出请根据专业与项目推断如“嵌入式软件工程师”)、细分方向标签(directionTags，如“MCU固件 · 实时系统 · 传感器驱动”)、电话(phone)、邮箱(email)、所在地或籍贯(location)、GitHub或技术博客(github/website)、院校层次标签(schoolTag)、状态标签(statusTag，如“2026届应届生”)、政治面貌(politicalStatus)、毕业年份(graduationYear)、个人简介或自我评价(summary，若原文无单独简介请根据整份简历提炼2~3句话的专业核心优势)。
2. education：提取所有教育背景，包含 school、degree、major、startDate、endDate、gpa、ranking、courses（主修课程）、honors（在校荣誉）。
3. skills：将专业技能按逻辑分类整理为 2~5 个类别（如：嵌入式与外设开发、编程语言与工具、硬件与电路设计等），每项包含 category 与 items（完整描述字符串）。
4. projects：提取所有项目经历，包含 name（项目名称）、role（担任角色）、startDate、endDate、techStack（3~6个核心技术关键词数组）、summary（一句话概述）、bullets（项目具体工作要点与成果数组，最后一条若有成果请以“项目成果：”开头）。
5. experience：提取所有实习或工作经历，包含 company、position、department、location、startDate、endDate、techStack、bullets（具体工作职责与成果数组）。
6. awards：提取所有获奖荣誉、技能证书或考级证书，包含 title、issuer、date、level、description。`;

      const parts: any[] = [];
      if (base64Data && mimeType) {
        parts.push({
          inlineData: {
            mimeType,
            data: base64Data,
          },
        });
      }
      if (rawText) {
        parts.push({
          text: `【待解析的简历文本内容】：\n${rawText}`,
        });
      }
      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts },
        config: {
          systemInstruction:
            '你是精准的多模态简历解析引擎。请忠实提取用户上传的 PDF、图片或文本简历中的全部真实信息，并输出符合 schema 的完整结构化 JSON。',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              basics: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  title: { type: Type.STRING },
                  directionTags: { type: Type.STRING },
                  phone: { type: Type.STRING },
                  email: { type: Type.STRING },
                  location: { type: Type.STRING },
                  github: { type: Type.STRING },
                  website: { type: Type.STRING },
                  schoolTag: { type: Type.STRING },
                  statusTag: { type: Type.STRING },
                  politicalStatus: { type: Type.STRING },
                  graduationYear: { type: Type.STRING },
                  summary: { type: Type.STRING },
                },
                required: ['name', 'title', 'phone', 'email', 'summary'],
              },
              education: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    school: { type: Type.STRING },
                    degree: { type: Type.STRING },
                    major: { type: Type.STRING },
                    startDate: { type: Type.STRING },
                    endDate: { type: Type.STRING },
                    gpa: { type: Type.STRING },
                    ranking: { type: Type.STRING },
                    courses: { type: Type.STRING },
                    honors: { type: Type.STRING },
                  },
                  required: ['school', 'major'],
                },
              },
              skills: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    items: { type: Type.STRING },
                  },
                  required: ['category', 'items'],
                },
              },
              projects: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    role: { type: Type.STRING },
                    startDate: { type: Type.STRING },
                    endDate: { type: Type.STRING },
                    techStack: { type: Type.ARRAY, items: { type: Type.STRING } },
                    summary: { type: Type.STRING },
                    bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['name', 'bullets'],
                },
              },
              experience: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    company: { type: Type.STRING },
                    position: { type: Type.STRING },
                    department: { type: Type.STRING },
                    location: { type: Type.STRING },
                    startDate: { type: Type.STRING },
                    endDate: { type: Type.STRING },
                    techStack: { type: Type.ARRAY, items: { type: Type.STRING } },
                    bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['company', 'position', 'bullets'],
                },
              },
              awards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    issuer: { type: Type.STRING },
                    date: { type: Type.STRING },
                    level: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ['title'],
                },
              },
            },
            required: ['basics', 'education', 'skills', 'projects', 'experience', 'awards'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error: any) {
      console.error('Gemini parse-resume error:', error);
      res.status(500).json({
        error: error?.message || 'AI 解析简历失败，请确认文件清晰度或稍后重试。',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CraftCV Studio server running on http://localhost:${PORT}`);
  });
}

startServer();
