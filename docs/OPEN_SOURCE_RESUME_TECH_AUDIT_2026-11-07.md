# CraftCV-Studio：五个开源 AI 简历项目源码评审与复用决策

审查日期：2026-11-07
审查性质：只读公开源码、说明、许可证、近期提交、测试目录与 CI 配置；**未克隆、安装、执行代码或进行动态漏洞扫描**。
本项目权威规范：docs/RESUME_GENERATION_STANDARD.md（RGS v1.1）
状态：技术选型评审稿；不代表已整合第三方代码、执行第三方测试或验证运行时稳定性。

## 0. 结论

**不建议在现有 CraftCV-Studio 中整体嵌入任意一个候选软件或直接无审查执行外部 Agent Skill。**

- 可选小型源码复用：repo-to-resume 的确定性代码证据分析与关键词分析思想，需首先补安全边界、资源限制、中文/嵌入式术语、回归测试。优先整合到现有 src/server/githubEvidence.ts，而非新建第二个仓库采集后端。
- 高优先级规则借鉴：Project Resume Writer 的中文工程素材提取与证据账本；主要是 Skill 文本与引用文档，没有必须安装的二进制/运行库。
- 可选移植校验函数：tech-resume 的文本层校验、无效 AI 套话检测和 DOCX/PDF 对照；其美国 US Letter + Arial 规则和回退 Helvetica 的 PDF 方案不能直接作为中文投递默认值。
- 只吸收工作流与纯函数思路：Resume Matcher 的「候选差异 → 事实守卫 → 用户确认 → 应用」与定量指标检查；不接入完整 Next.js/FastAPI/SQLite/LiteLLM 运行时。
- 只参考体验并择点借鉴：openResume 的中文 DOCX/PDF 解析、AI 候选修改、差异比较、分页；不重建 CraftCV 的现有编辑器和模板系统。其 CI 默认分支触发条件存在实际失配。

**优先做当前工程缺失的 P0 事实验证和生成保护**，随后才按模块迁移技术方法。最小可行流程：原资料 → 有路径的来源记录 → AI 候选差异 → 结构/事实守卫 → 人工确认 → 原生模板 → PDF/DOCX（逐项验证）。

## 1. 项目与维护核验

| 项目 | 类型 | 许可证（已读 LICENSE） | 默认分支 | 最近提交（UTC） | 决策 |
| --- | --- | --- | --- | --- | --- |
| keananwongso/repo-to-resume | Python CLI + Agent Skill | MIT | main | 2026-10-09 | 改造复用其中独立模块 |
| oxygen914/project-resume-writer | 中文 Agent Skill + 11 份规则参考 | MIT | main | 2026-07-27 | 只借鉴规范并改造成内部规则 |
| mzupan/tech-resume | Python 脚本 + Agent Skill | MIT | main | 2026-10-17 | 选择性移植验证逻辑 |
| srbhr/Resume-Matcher | Next.js + FastAPI 完整系统 | Apache-2.0 | main | 2026-11-07 | 不整体引入；借鉴事务和事实守卫 |
| jonbrown66/openResume | Next.js + TS/React 完整系统 | MIT | master | 2026-11-04 | 不整体引入；选择性借鉴 |

注：最近提交日期来自 GitHub 仓库的 commits API；不能仅凭活跃日期证明安全、质量或长期维护意愿。五个项目均未显示 archived=true。许可证为仓库根 LICENSE，实际引用第三方素材或字体须分别核实各自许可。Apache-2.0 复制/再分发还需遵守 LICENSE/NOTICE 等要求（视具体文件及分发方式）。

## 2. 逐项源码观察

### 2.1 repo-to-resume

源码：
- https://github.com/keananwongso/repo-to-resume/blob/main/SKILL.md
- https://github.com/keananwongso/repo-to-resume/blob/main/scripts/analyze_repo.py
- https://github.com/keananwongso/repo-to-resume/blob/main/scripts/keyword_match.py
- https://github.com/keananwongso/repo-to-resume/blob/main/scripts/hub.py
- https://github.com/keananwongso/repo-to-resume/blob/main/scripts/render_resume.py

已经确认：analyze_repo.py（约 504 行）使用标准库扫描语言分布、依赖、接口、测试和 git 历史；README 的数字归为 claimed_metrics_UNVERIFIED。keyword_match.py（约 278 行）使用确定性英文术语映射输出 JD 覆盖情况。render_resume.py 负责 LaTeX/PDF 和预览，hub.py 管理独立的简历素材目录。脚本设计强调代码本身不能证明个人贡献。

风险与边界：
- analyze_repo.py 的 URL 分支支持 http(s)、git@ 与 .git 结尾，直接执行 git clone --depth 200；检查到的调用没有超时。应限制为允许的 HTTPS GitHub 地址或内部权限名单；隔离 temp 目录，禁用任意文件协议与本地路径越界；加入网络/时间/空间/输出字节上限及 finally 清理。
- 对本地仓库的 os.walk 扫描可能读取源码片段；即便脚本不上传，也不能默认把所有代码/README 发给第三方模型。需按用户授权范围、敏感信息规则筛选。
- Git 作者提交占比不能确定真实所有权；扫描命中的 API/测试文件不能代替运行/生产证明。
- keyword_match 的 TAXONOMY 以英文 Web/云技术为主，包含 C、C++、C#、Rust 等，但缺乏 STM32、USART、FreeRTOS、HAL、RTOS、I²C/SPI 等完整中文嵌入式规范；直接使用会遗漏大量关键能力。
- 仓库顶层未见标准 tests/ 和 CI 工作流；本次没有运行脚本，因此不能声称通过功能/边界测试。

结论：**小范围改造复用**。首选参考关键词分类、证据范围和未验证指标标识；保留 CraftCV 已存在的 GitHub API 采集实现，避免引入 git clone 造成新攻击面。LaTeX 渲染器不作为首版必要依赖。

### 2.2 Project Resume Writer

源码：
- https://github.com/oxygen914/project-resume-writer/blob/main/SKILL.md
- https://github.com/oxygen914/project-resume-writer/blob/main/references/resume_quantification_rules.md
- https://github.com/oxygen914/project-resume-writer/blob/main/references/resume_risk_rules.md
- https://github.com/oxygen914/project-resume-writer/blob/main/references/project_signal_patterns.md

已经确认：这是以 SKILL.md 和 references 规则库为主的中文技术项目分析规范，不是已实现的目录分析引擎或完整 Web 产品。技能要求沿着代码入口、调用链、配置、测试和运行证据追踪关键技术；制作 Evidence Ledger；区分 confirmed、code-verifiable、inferred、planned、blocked、unknown；提供直接写法与项目亮点库两个输出模式。

强项：真实成果与代码线索分离；资料不足可以少写；量化区分 Confirmed / Code-verifiable / Estimated / Unknown；严禁把 AI 估计数字直接加入投递稿。

限制：顶层没有 scripts/ 或标准 tests/ 目录；效果主要依赖调用该 Skill 的模型与权限/工具。引用文档中的「估算候选」只能供核实，CraftCV 的默认流程不应主动生成毫无来源的精确估计。没有实测数据时必须保留未验证状态。

结论：**只借鉴规则，转成 CraftCV 自有的事实等级和中文嵌入式表达规范**。具体整合 RGS C-05/C-06/Q-02/Q-03 和未来 Evidence Ledger。无需安装外部 Skill 即可实现其规则思想。

### 2.3 tech-resume

源码：
- https://github.com/mzupan/tech-resume/blob/main/SKILL.md
- https://github.com/mzupan/tech-resume/blob/main/scripts/extract.py
- https://github.com/mzupan/tech-resume/blob/main/scripts/build.py
- https://github.com/mzupan/tech-resume/blob/main/scripts/verify.py
- https://github.com/mzupan/tech-resume/blob/main/scripts/lint.py
- https://github.com/mzupan/tech-resume/blob/main/references/resume-rules.md

已经确认：有 5 个 Python 脚本；extract.py 可解析 PDF/DOCX/MD/TXT 并提示复杂 PDF 问题；build.py 采用 python-docx + reportlab 构建 DOCX/PDF；verify.py 检查 PDF 文本、字体、页数、DOCX 文本、关键词；lint.py 定位泛化 AI 词与机械句式。requirements.txt 仅列 python-docx/reportlab/pypdf，当前没有版本锁定；相关 PDF 工具还可使用 poppler。

强项：将导出产物反向读取校验，而不只相信预览；编辑前询问事实缺口；支持反复复用的个人 career profile 与岗位 application 资料。

直接应用风险：
- references/resume-rules.md 的默认是 **US Letter、Arial 10.5 pt、英文段落和美国招聘市场**，与国内 A4 中文工程简历不同。
- build.py 的字体搜索目录主要针对 macOS/Linux；找不到 Arial/Georgia/Calibri 会降级 Helvetica，不适于直接作为中文 PDF 可靠字体链。
- verify.py 内英文词数、Summary/Skills 固定顺序、英文标点偏好不能当作中文硬性质量门槛。
- 未见顶层 tests/ 或 CI 配置；依赖未锁版。要移植并发导出或文件解析脚本必须另外审计输入文件与安全边界。

结论：**选择性改造**。优先实现已有 CraftCV 文本 PDF 的导出后回读验证，并扩展中文字号、标点、专有名词、首页关键信息、缺字和跨页检查；DOCX 后续考虑成熟库而非整体接入该 Skill 的构建器。

### 2.4 Resume Matcher

源码：
- https://github.com/srbhr/Resume-Matcher/blob/main/apps/backend/app/services/resume_preservation.py
- https://github.com/srbhr/Resume-Matcher/blob/main/apps/backend/app/services/writing_loop.py
- https://github.com/srbhr/Resume-Matcher/blob/main/apps/backend/app/services/keyword_forcing.py
- https://github.com/srbhr/Resume-Matcher/blob/main/apps/backend/app/host_guard.py
- https://github.com/srbhr/Resume-Matcher/blob/main/apps/backend/app/services/ats.py
- https://github.com/srbhr/Resume-Matcher/releases/tag/v1.4.0

已经确认：真实代码有确定性事实保全、按 path 的 AI 差异、数值/术语核查、批量处理约束、HostGuardMiddleware，及较完整的 backend unit/service/integration 测试目录。v1.4.0 的发布说明声称通过 1,944 后端与 1,596 前端测试，**这是上游自报，本次没有独立复现**。

优点：写作循环针对弱描述提出候选改写，并用 fact_violations() 拒绝不安全差异；较好地区分 AI 诊断与最终写回。最近修复过自定义模型 API Key 转发风险及外网绑定问题，具有明确的安全维护信号。

风险：
- 完整堆栈为 Next.js 前端 + FastAPI/Python 3.13+ 后端 + 数据库/迁移 + LiteLLM + Playwright 等，侵入性很高。现有 CraftCV 的 Vite/React/Express 框架可原生完成 RGS 要求，不适合为了几项校验重建整个运行时。
- 其 ATS score 是自定义确定性计算，不是招聘平台的官方通过率。若借鉴评分，必须清楚标注数据来源与覆盖范围。
- 其 keyword_forcing 在上游流程具有「用户明确确认拥有」的条件，即使 AI 插词失败，也可以将已确认关键词加入技能区；CraftCV 必须保留实际用户确认记录，不能把自评当客观证明。
- 若未来采用任何代码片段，需核对 Apache-2.0 的 LICENSE、NOTICE 和依赖许可，并写测试证明局部功能与当前编辑状态契约兼容。

结论：**不整体引入，借鉴事实守卫的纯函数、事务式确认和结构化差异**。优先修正现有 server.ts 和 JDMatchPanel.tsx 的真实性路径；在本项目已有语言与数据模型上实现。

### 2.5 openResume

源码：
- https://github.com/jonbrown66/openResume/blob/master/src/utils/resumeAssistantGuard.ts
- https://github.com/jonbrown66/openResume/blob/master/src/utils/resumeDiff.ts
- https://github.com/jonbrown66/openResume/blob/master/src/utils/fileExtractor.ts
- https://github.com/jonbrown66/openResume/blob/master/src/lib/puppeteer.ts
- https://github.com/jonbrown66/openResume/blob/master/.github/workflows/ci.yml

已经确认：Next.js 版中文简历编辑器；文件提取器支持 TXT/MD/PDF/DOCX，并有 10 MB 输入上限和 PDF 文本行重组；AI 对候选改动提供 diff 与部分关键字段告警；src/test 与 e2e 目录包含大量单元和交互测试代码；依赖中有 PDF.js、Mammoth、中文 Noto 字体和安全 HTML 清理库。

优势：中文优先、A4 和编辑体验更接近 CraftCV 当前用户；PDF 导出浏览器禁用脚本、路由阻断普通 HTTP(S) 请求，还设置了并发限制和超时，体现一定安全设计。

待修和注意：
- 默认分支实际为 master，公开仓库分支列表也只有 master；但 .github/workflows/ci.yml 仅监听 main 的 push/PR，检查到 GitHub Actions runs total_count=0。**存在 CI 触发分支配置不一致，不能以存在测试文件认定 CI 常态通过。**
- resumeAssistantGuard.ts 的数值新增识别主要针对百分号形式；它提供的是风险提醒，不是涵盖所有数字、年份、薪酬和技术事实的完整可执行守卫。
- PDF 导出在找不到本地 Chrome 时可能从上游 Chromium release URL 获取构建产物，需要网络与供应链审查；其 Chromium 初始化、无头页面和部署依赖不能无成本直接复用。
- AI 连接依赖用户选择的云端模型时，仍会向相应服务提供商发送处理所需数据；「本地优先」不等于离线或所有步骤完全不上传。
- 完整 Next.js 编辑器与 CraftCV 的现有 React/Vite 画布、12 模板和可保存版本重复，整体迁移会引入页面、路由、状态与导出兼容风险。

结论：**只参考并选择性借鉴**。优先参考 DOCX 文本抽取与中文重建测试、AI 候选差异和导出限流。复制代码前应另做样例兼容测试，不能只复制 UI。

## 3. 五项对照（基于本次静态证据的定性判断，不是量化评分）

| 项目 | 真实代码证据采集 | 中文项目规则 | ATS/文件校验 | 成品编辑器 | 测试/CI 可信度 | 直接接入成本 |
| --- | --- | --- | --- | --- | --- | --- |
| repo-to-resume | 强：标准库扫描、Git 历史 | 弱：英文技术表 | 基础关键词匹配 + LaTeX | 无 | 顶层未见 tests/CI，未知 | 中：需要安全与术语改造 |
| Project Resume Writer | 中：Skill 指导模型检查 | 强：中文写作/证据边界 | 手工质量规则 | 无 | 规则文档，无自动执行测试 | 低：规则移植 |
| tech-resume | 中：职业档案，不专注代码扫描 | 弱：英语/美国默认值 | 强：PDF/DOCX 导出后校验 | 无 | 顶层未见 tests/CI，未知 | 中：中文/字体/文件路径改造 |
| Resume Matcher | 中：主简历与 JD | 中：有国际化语言路径 | 强：内置 ATS 和事实保全 | 有 | 公开大量测试，上游自报通过 | 高：跨前后端重架构 |
| openResume | 中：文件导入优先 | 强：中文与 Markdown | 中强：导出/结构测试 | 有 | 测试目录丰富，但 CI 分支错误 | 高：编辑器重叠 |

注意：「强/弱」表示当前目标任务的匹配程度，不是对开源项目作者工作质量的评价。没有运行代码，不对性能、安全完备性、ATS 实际通过率作保证。

## 4. CraftCV 最小复用架构

- 事实输入：沿用 ResumeDocument、ResumeImportModal 和现有 GitHub API collector；建立非破坏性的 Evidence Ledger（可选关联，不强制改旧 JSON）。
- 代码证据：吸收 repo-to-resume 的分析分类、未验证 README 数字标签；吸收 Project Resume Writer 的中文工程亮点选择方法。
- 写作引擎：只从确认资料生成 candidate changes（字段 ID、修改前后、原因和来源），统一经过 RGS Fact Guard；不需要安装完整第三方 Skill。
- 岗位匹配：参考 tech-resume 的关键词解释与 Resume Matcher 的分级提示；missing/unknown 不直接增加 Skills。
- 检查：对候选变更检查事实、新数值、技术等级；对成品检查 A4 分页、字体、PDF 文本层，并保留精致与 ATS 两种导出。
- 交互：继续使用 12 个 CraftCV 原生模板、可点击编辑、模块拖拽和本地版本，不迁移 openResume 或 Resume Matcher 的全套 UI。

### 分期与验收

P0（最高优先）：
1. 关闭无依据的 AI 强制量化，阻断简历解析对缺失事实的推断；由真实资料和本人确认决定写入。对应 RGS T01/T05/T17/T19。
2. JD 缺失关键词只能显示证据差距；在用户确认且记录来源前不得自动写进 Skills。对应 T06。
3. API AI 返回要经过字段结构、patch/diff 和版本冲突校验，失败保留原稿。对应 T10/T15/T18。

P1：
4. 将工程证据提取升级为可复核的来源条目；验证 GitHub 代码与个人职责分别处理。对应 T03/T04/T13。
5. 用确定性规则建立中文技术项目的表达质量诊断；不移植固定 US ATS 评分。
6. PDF 生成后回读中文文本，覆盖多页/空白页/内容截断，并为 DOCX 建立输入输出样例。对应 T11/T12。

P2：
7. 按岗位建立嵌入式、软件测试、硬件、后端等不同的术语参考库，辅助 JD 解释而不伪造经历。
8. 根据真实中文招聘样本验证常见 ATS 可读性，继续完善更精致的双栏视觉版和便于解析的单栏版。
9. 只有在验证不足的模块且许可兼容时，才考虑局部拷贝有维护价值的上游代码，先提交可运行回归样例到本地测试环境，不做大型移植。

### 本次明确不做

- 不执行网络获取的安装脚本，不克隆或运行第三方代码，不改变 npm/pip 锁文件。
- 不迁移或清空用户的现有简历资料、模型密钥、缓存和历史版本。
- 不把上游自称 ATS 成功率、测试数量或性能指标写成已由 CraftCV 复核。
- 不提交、推送、公开仓库或修改任何上游项目。

## 5. 静态审查覆盖与残余未知

已覆盖：五个项目的仓库目录、主分支、LICENSE、最新提交；三个 Skill 的主要说明及代表性规则/脚本；两个完整软件的事实校验/AI 差异/安全服务与测试入口；openResume CI 配置；现有 CraftCV 的真实 GitHub 分析与 JD 入口。

未覆盖：全部历史依赖/传递依赖漏洞扫描、逐仓库完整阅读、Windows 实机安装、上游测试与构建执行、完整中文 PDF/DOCX 导入导出、许可证分发合规审计、真实招聘系统内测。相应建议需经过后续本地隔离测试才能升级为「可直接采用」。

复核基准建议：记录本文件列出的仓库、最新提交 SHA 和所选源码路径；引入前应再次锁定 SHA 和依赖版本。所有外部 README、Skill、JD 均按不可信输入处理。

参考与内部规范：
- docs/RESUME_GENERATION_STANDARD.md（RGS v1.1）
- docs/TEMPLATE_REFERENCES.md（已有 12 款模板的来源说明）
