import { aiFetch } from '../utils/aiModelClient';
import React, { useRef, useState } from 'react';
import { GitHubRepoSummary, ProjectItem } from '../types/resume';
import { DEMO_GITHUB_REPOS } from '../data/defaultResume';
import { Github, Search, Sparkles, Plus, ExternalLink, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface GitHubImportPanelProps {
  targetRole: string;
  onImportProject: (project: ProjectItem) => void;
}

interface PublicEvidencePreview {
  repoId: number;
  repository: string;
  revision: string;
  codeSignals: NonNullable<ProjectItem['evidence']>['codeSignals'];
  sourceFiles: Array<{ path: string; url: string }>;
  commitCount: number;
  warnings: string[];
}

const EvidenceSignalList: React.FC<{
  signals: NonNullable<ProjectItem['evidence']>['codeSignals'];
}> = ({ signals }) => (
  <div className="space-y-1 text-xs text-slate-700">
    {signals?.length ? signals.map((signal) => (
      <div key={signal.technology} className="rounded-lg bg-slate-50 px-2 py-1.5">
        <span className="font-semibold text-slate-800">{signal.technology}</span>
        <span className="text-slate-400 px-1.5">·</span>
        {signal.sourceFiles.map((file, i) => (
          <React.Fragment key={file.url}>
            {i > 0 ? '、' : ''}
            <a href={file.url} target="_blank" rel="noreferrer"
              className="text-blue-700 hover:underline break-all">{file.path}</a>
          </React.Fragment>
        ))}
      </div>
    )) : <p className="text-amber-700">
      有限源码摘要中未识别出可展示的技术线索；不能据此断言仓库没有使用其他技术。
    </p>}
  </div>
);

export const GitHubImportPanel: React.FC<GitHubImportPanelProps> = ({ targetRole, onImportProject }) => {
  const [usernameInput, setUsernameInput] = useState('');
  const [repos, setRepos] = useState<(GitHubRepoSummary & { readme?: string })[]>(DEMO_GITHUB_REPOS);
  const [isShowingDemo, setIsShowingDemo] = useState(true);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [extractingId, setExtractingId] = useState<number | null>(null);
  const [importedIds, setImportedIds] = useState<number[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<{ repoId: number; project: ProjectItem } | null>(null);
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [inspectingId, setInspectingId] = useState<number | null>(null);
  const [sourcePreview, setSourcePreview] = useState<PublicEvidencePreview | null>(null);
  // Superseded repository responses must not become actionable drafts.
  const extractionSequence = useRef(0);
  const searchSequence = useRef(0);

  // Also allow pasting a direct GitHub repo URL like https://github.com/owner/repo
  const handleFetchGitHub = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = usernameInput.trim();
    if (!raw) return;

    ++extractionSequence.current;
    const currentSearch = ++searchSequence.current;
    setPendingDraft(null);
    setSourcePreview(null);
    setReviewAcknowledged(false);
    setExtractingId(null);
    setInspectingId(null);
    setLoadingRepos(true);
    setErrorMsg(null);

    try {
      // Check if user pasted a full repo URL or owner/repo
      if (/^\w+:\/\//.test(raw) && !/^https:\/\/github\.com\//i.test(raw)) {
        throw new Error('只接受 github.com 的 HTTPS 仓库地址');
      }
      const cleaned = raw.replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '');
      if (/[?#]/.test(cleaned)) throw new Error('请输入仓库首页地址，不包含查询或文件分支参数');
      const parts = cleaned.split('/').filter(Boolean);
      if (parts.length < 1 || parts.length > 2 ||
          !/^[a-z0-9-]{1,39}$/i.test(parts[0]) ||
          (parts.length === 2 && !/^[a-z0-9_.-]{1,100}$/i.test(parts[1]))) {
        throw new Error('请填写有效 GitHub 用户名或 owner/repo 仓库地址');
      }
      if (parts.length === 2) {
        const [owner, repo] = parts;
        const res = await fetch(`/api/github/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/details`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || '获取指定仓库失败');
        }
        if (currentSearch !== searchSequence.current) return;
        setRepos([
          {
            ...data.repo,
            readme: data.readme || '',
          },
        ]);
        setIsShowingDemo(false);
      } else {
        const username = parts[0];
        const res = await fetch(`/api/github/user/${encodeURIComponent(username)}/repos`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || '获取 GitHub 用户仓库列表失败');
        }
        if (currentSearch !== searchSequence.current) return;
        setRepos(data.repos || []);
        setIsShowingDemo(false);
      }
    } catch (err: any) {
      if (currentSearch === searchSequence.current) {
        setErrorMsg(err?.message || '连接 GitHub 失败，请检查用户名或仓库地址');
      }
    } finally {
      if (currentSearch === searchSequence.current) setLoadingRepos(false);
    }
  };

  // Fast import only copies public metadata. Do not assert personal authorship
  // or treat GitHub star counts as a technical accomplishment.
  const handleQuickDirectImport = (repo: GitHubRepoSummary) => {
    if (isShowingDemo) {
      setErrorMsg('示例仓库不属于用户的真实经历。请先输入实际 GitHub 仓库，避免将演示内容写入简历。');
      return;
    }
    if (!window.confirm(
      `将公开仓库「${repo.full_name}」的名称和描述保存为待完善项目？仓库语言、Topics 和 Star 不能证明您的个人技能或贡献。`
    )) return;
    const project: ProjectItem = {
      id: 'proj-gh-' + Date.now(),
      name: repo.name,
      role: '个人贡献待核实',
      startDate: '',
      endDate: '',
      repoUrl: repo.html_url,
      techStack: [], // Repo language/topics do not establish applicant competence.
      summary: repo.description ? '公开仓库自述（待本人核实）：' + repo.description : 'GitHub 仓库（待本人核实）：' + repo.full_name,
      bullets: [
        '仓库公开描述（未经本人履历验证）：' + (repo.description || repo.full_name),
        '请补充本人负责模块、真实技术实现及验证依据后再用于求职投递。',
      ],
    };
    onImportProject(project);
    setImportedIds((prev) => [...prev, repo.id]);
  };

  const handleInspectRepo = async (repo: GitHubRepoSummary) => {
    if (isShowingDemo) {
      setErrorMsg('请先选择真实的公开 GitHub 仓库，演示数据不能作为简历证据。');
      return;
    }
    const requestSequence = ++extractionSequence.current;
    setInspectingId(repo.id);
    setSourcePreview(null);
    setPendingDraft(null);
    setReviewAcknowledged(false);
    setErrorMsg(null);
    try {
      const response = await fetch('/api/github/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlUrl: repo.html_url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '仓库源码证据读取失败');
      if (!data || !Array.isArray(data.codeSignals) || !Array.isArray(data.sourceFiles)) {
        throw new Error('仓库证据数据结构无效');
      }
      if (requestSequence !== extractionSequence.current) return;
      setSourcePreview({
        repoId: repo.id,
        repository: String(data.repository || repo.full_name),
        revision: String(data.revision || ''),
        codeSignals: data.codeSignals,
        sourceFiles: data.sourceFiles,
        commitCount: Number(data.commitCount) || 0,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      });
    } catch (error: any) {
      if (requestSequence === extractionSequence.current) {
        setErrorMsg(error?.message || '无法分析公开仓库，请检查网络及 GitHub 权限');
      }
    } finally {
      if (requestSequence === extractionSequence.current) setInspectingId(null);
    }
  };

  // Real evidence scanning happens server-side; AI output is reviewed before import.
  const handleAIExtractImport = async (repo: GitHubRepoSummary & { readme?: string }) => {
    if (isShowingDemo) {
      setErrorMsg('示例仓库仅用于界面演示。请输入自己的真实 GitHub 仓库再进行源码证据提炼。');
      return;
    }
    if (!window.confirm(
      `将公开仓库 ${repo.full_name} 的 README、近期 Commit 和最多 4 份源码摘要发送给顶部所选 AI 模型进行分析。云端模型可能在本机外处理这些内容。是否授权本次分析？`
    )) return;
    const requestSequence = ++extractionSequence.current;
    setExtractingId(repo.id);
    setInspectingId(null);
    setSourcePreview(null);
    setErrorMsg(null);
    setPendingDraft(null);
    setReviewAcknowledged(false);
    try {
      const aiRes = await aiFetch('/api/ai/github-to-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlUrl: repo.html_url, targetRole }),
      });
      const aiData = await aiRes.json();
      if (!aiRes.ok) throw new Error([
        aiData.error || '无法完成 GitHub 证据分析',
        ...(Array.isArray(aiData.issues) ? aiData.issues.slice(0, 2) : []),
      ].join('；'));
      if (requestSequence !== extractionSequence.current) return;
      const project: ProjectItem = {
        id: 'proj-gh-ai-' + Date.now(),
        name: aiData.projectTitle || repo.name,
        role: '个人贡献待核实',
        startDate: '',
        endDate: '',
        repoUrl: repo.html_url,
        techStack: Array.isArray(aiData.techStack) ? aiData.techStack : [],
        summary: aiData.summary || '',
        bullets: Array.isArray(aiData.bullets) ? aiData.bullets : [],
        evidence: aiData.evidence,
      };
      setPendingDraft({ repoId: repo.id, project });
    } catch (err: any) {
      if (requestSequence === extractionSequence.current) {
        setErrorMsg(err?.message || 'AI 分析失败；源码、模型服务或 GitHub API 暂时不可用');
      }
    } finally {
      if (requestSequence === extractionSequence.current) setExtractingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Search Form */}
      <div className="os26-card rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Github className="w-4 h-4 text-slate-800" />
              GitHub 开源项目同步与 AI 简历转化器
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              输入 GitHub 用户名（如 <span className="font-mono text-slate-800">torvalds</span>）或具体仓库地址（如{' '}
              <span className="font-mono text-slate-800">owner/repo</span>），系统将按需读取近期 Commit、目录结构及少量核心源码，生成需要人工核验的简历草稿。不会自动推断个人贡献或实测成绩。
            </p>
          </div>
        </div>

        <form onSubmit={handleFetchGitHub} className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="输入 GitHub 用户名 或 https://github.com/用户名/仓库名..."
              className="os26-input w-full pl-9 pr-3 py-2 text-sm font-mono bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={loadingRepos || !usernameInput.trim()}
            className="os26-press px-4 py-2 text-xs font-semibold text-white bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {loadingRepos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Github className="w-3.5 h-3.5" />}
            拉取公开仓库
          </button>
          {!isShowingDemo && (
            <button
              type="button"
              onClick={() => {
                setRepos(DEMO_GITHUB_REPOS);
                setIsShowingDemo(true);
                ++searchSequence.current;
                setLoadingRepos(false);
                ++extractionSequence.current;
                setExtractingId(null);
                setPendingDraft(null);
                setSourcePreview(null);
                setReviewAcknowledged(false);
                setInspectingId(null);
                setErrorMsg(null);
              }}
              className="os26-press px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
            >
              恢复电子工程示例库
            </button>
          )}
        </form>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Repository List */}
      <div className="os26-card rounded-2xl divide-y divide-slate-200/70 overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between bg-slate-50/50">
          <span className="text-xs font-semibold text-slate-700">
            {isShowingDemo
              ? '电子信息工程公开仓库演示数据（不可直接作为真实经历导入）'
              : `共找到 ${repos.length} 个公开仓库`}
          </span>
          <span className="text-xs text-slate-500 font-mono tabular-nums">目标方向：{targetRole}</span>
        </div>

        {loadingRepos ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="animate-pulse space-y-2 border-b border-slate-100 pb-4 last:border-none">
                <div className="h-4 bg-slate-200 rounded w-1/3" />
                <div className="h-3 bg-slate-100 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : repos.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-700">该用户下暂无公开仓库</p>
            <p className="text-xs text-slate-500">请尝试输入其他 GitHub 用户名或直接粘贴仓库链接</p>
          </div>
        ) : (
          repos.map((repo) => {
            const isExtracting = extractingId === repo.id;
            const isImported = importedIds.includes(repo.id);

            return (
              <div key={repo.id} className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-bold text-slate-900 hover:text-blue-700 font-mono flex items-center gap-1"
                    >
                      {repo.name}
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs font-mono text-slate-600">{repo.language || '未标注语言'}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs font-mono tabular-nums text-slate-600">
                      ★ {repo.stargazers_count} Stars
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {repo.description || '暂无仓库简介，点击右侧 AI 提炼将自动读取 README 文档生成专业简历描述。'}
                  </p>

                  {repo.topics && repo.topics.length > 0 && (
                    <div className="text-[11px] font-mono text-slate-500">
                      关键词：{repo.topics.join(' / ')}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1.5 sm:shrink-0">
                  <button
                    type="button"
                    onClick={() => handleQuickDirectImport(repo)}
                    disabled={extractingId !== null || inspectingId !== null}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    直接导入
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInspectRepo(repo)}
                    disabled={isShowingDemo || inspectingId !== null || extractingId !== null}
                    className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 rounded-lg disabled:opacity-40 flex items-center gap-1"
                  >
                    {inspectingId === repo.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin"/>
                      : <Search className="w-3.5 h-3.5"/>}
                    只读源码线索
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAIExtractImport(repo)}
                    disabled={extractingId !== null || inspectingId !== null}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        AI 深度提炼中...
                      </>
                    ) : isImported ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        已导入（可再次生成）
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        AI 提炼为简历项目
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      {sourcePreview && !pendingDraft && (
        <section className="os26-card rounded-2xl p-5 space-y-3 border border-blue-100" aria-label="只读源码证据">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">公开仓库源码线索</h3>
              <p className="text-[11px] text-slate-500 mt-1 break-all">
                {sourcePreview.repository} · 修订 {sourcePreview.revision.slice(0, 10)}
              </p>
            </div>
            <button type="button" onClick={() => setSourcePreview(null)}
              className="text-xs text-slate-500 hover:text-slate-800">关闭</button>
          </div>
          <EvidenceSignalList signals={sourcePreview.codeSignals}/>
          <div className="border-t border-slate-200 pt-3 text-xs text-slate-600 space-y-1">
            <p>实际读取 {sourcePreview.sourceFiles.length} 份源码摘要、{sourcePreview.commitCount} 条近期 Commit。
              技术线索仅来自有限源码，不能证明个人职责、运行效果或测试通过。</p>
            {sourcePreview.warnings.map((warning, index)=>(
              <p key={index} className="text-amber-700">范围限制：{warning}</p>
            ))}
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => {
              const repo = repos.find((entry) => entry.id === sourcePreview.repoId);
              if (repo) void handleAIExtractImport(repo);
            }}
              className="px-3 py-2 rounded-xl bg-[#0071e3] text-white font-semibold text-xs hover:bg-blue-700">
              <Sparkles className="inline w-3.5 h-3.5 mr-1"/> AI 生成待核对项目草稿
            </button>
          </div>
        </section>
      )}
      {pendingDraft && (
        <div className="os26-card rounded-2xl border border-blue-200 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">GitHub 证据提炼草稿 · 待本人核实</h3>
            <span className="text-[11px] font-medium text-amber-700">尚未写入正式简历</span>
          </div>
          <div className="text-sm font-semibold">{pendingDraft.project.name}</div>
          <p className="text-xs text-slate-700 leading-relaxed">{pendingDraft.project.summary}</p>
          <ul className="list-disc pl-5 text-xs text-slate-700 leading-relaxed space-y-1">
            {pendingDraft.project.bullets.map((bullet, index) => (
              <li key={index}>{bullet}</li>
            ))}
          </ul>
          <div className="border-t border-slate-200 pt-3 text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-700">源码技术线索（不是个人贡献证明）</div>
            <EvidenceSignalList signals={pendingDraft.project.evidence?.codeSignals}/>
            <div>核实来源：{pendingDraft.project.evidence?.commitShas?.length || 0} 条近期 Commit、
              {pendingDraft.project.evidence?.sourceFiles?.length || 0} 份实际读取的代码文件。</div>
            {pendingDraft.project.evidence?.sourceFiles?.map((f) => (
              <a key={f.url} href={f.url} target="_blank" rel="noreferrer"
                className="block text-blue-700 hover:underline break-all">{f.path}</a>
            ))}
            {pendingDraft.project.evidence?.warnings?.map((warning, index) => (
              <p key={index} className="text-amber-700">注意：{warning}</p>
            ))}
            <p className="text-amber-700">GitHub 目录和提交不证明个人贡献、实机测试或量化收益；请逐项核实后再导入。</p>
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
            <input type="checkbox" checked={reviewAcknowledged}
              onChange={(event) => setReviewAcknowledged(event.target.checked)}
              className="mt-0.5 accent-[#0071e3]" />
            <span>我已核对仓库级技术线索，知道它们不代表本人贡献、实测结果或项目完成状态。导入后仍需填写本人真实职责。</span>
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setPendingDraft(null); setReviewAcknowledged(false); }}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-600">取消</button>
            <button type="button"
              onClick={() => {
                onImportProject(pendingDraft.project);
                setImportedIds((prev) => [...prev, pendingDraft.repoId]);
                setPendingDraft(null);
                setReviewAcknowledged(false);
              }}
              disabled={!reviewAcknowledged}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed">核对完成 · 导入待完善项目</button>
          </div>
        </div>
      )}
    </div>
  );
};
