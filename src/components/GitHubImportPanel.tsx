import React, { useState } from 'react';
import { GitHubRepoSummary, ProjectItem } from '../types/resume';
import { DEMO_GITHUB_REPOS } from '../data/defaultResume';
import { Github, Search, Sparkles, Plus, ExternalLink, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface GitHubImportPanelProps {
  targetRole: string;
  onImportProject: (project: ProjectItem) => void;
}

export const GitHubImportPanel: React.FC<GitHubImportPanelProps> = ({ targetRole, onImportProject }) => {
  const [usernameInput, setUsernameInput] = useState('');
  const [repos, setRepos] = useState<(GitHubRepoSummary & { readme?: string })[]>(DEMO_GITHUB_REPOS);
  const [isShowingDemo, setIsShowingDemo] = useState(true);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [extractingId, setExtractingId] = useState<number | null>(null);
  const [importedIds, setImportedIds] = useState<number[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Also allow pasting a direct GitHub repo URL like https://github.com/owner/repo
  const handleFetchGitHub = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = usernameInput.trim();
    if (!raw) return;

    setLoadingRepos(true);
    setErrorMsg(null);

    try {
      // Check if user pasted a full repo URL or owner/repo
      const cleaned = raw.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/$/, '');
      const parts = cleaned.split('/').filter(Boolean);

      if (parts.length >= 2) {
        const [owner, repo] = parts;
        const res = await fetch(`/api/github/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/details`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || '获取指定仓库失败');
        }
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
        setRepos(data.repos || []);
        setIsShowingDemo(false);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || '连接 GitHub 失败，请检查用户名或仓库地址');
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleQuickDirectImport = (repo: GitHubRepoSummary) => {
    const newProj: ProjectItem = {
      id: `proj-gh-${Date.now()}`,
      name: repo.name,
      role: '核心开发者 / 开源维护者',
      startDate: new Date(repo.updated_at).toISOString().slice(0, 7).replace('-', '.'),
      endDate: '至今',
      repoUrl: repo.html_url,
      techStack: [repo.language || 'C/C++', ...(repo.topics?.slice(0, 4) || ['Git', 'OpenSource'])].filter(Boolean),
      summary: repo.description || `GitHub 开源项目 ${repo.full_name}`,
      bullets: [
        repo.description
          ? `项目架构与核心功能：${repo.description}`
          : `设计并实现 ${repo.name} 核心模块，完成底层驱动与系统联调验证。`,
        `代码规范与开源影响力：在 GitHub 开源完整工程源码与技术文档，累计获得 ${repo.stargazers_count} Stars 与 ${repo.forks_count} Forks。`,
      ],
    };
    onImportProject(newProj);
    setImportedIds((prev) => [...prev, repo.id]);
  };

  const handleAIExtractImport = async (repo: GitHubRepoSummary & { readme?: string }) => {
    setExtractingId(repo.id);
    setErrorMsg(null);

    try {
      let readmeText = repo.readme || '';
      let languagesList: string[] = repo.language ? [repo.language] : [];

      if (!readmeText && repo.full_name && !isShowingDemo) {
        const [owner, repoName] = repo.full_name.split('/');
        const detailRes = await fetch(
          `/api/github/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/details`
        );
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          readmeText = detailData.readme || '';
          if (detailData.languages?.length) {
            languagesList = detailData.languages;
          }
        }
      }

      const aiRes = await fetch('/api/ai/github-to-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoName: repo.name,
          description: repo.description,
          htmlUrl: repo.html_url,
          languages: languagesList,
          topics: repo.topics || [],
          stars: repo.stargazers_count,
          readme: readmeText,
          targetRole,
        }),
      });

      const aiData = await aiRes.json();
      if (!aiRes.ok) {
        throw new Error(aiData.error || 'AI 提炼仓库失败');
      }

      const newProj: ProjectItem = {
        id: `proj-gh-ai-${Date.now()}`,
        name: aiData.projectTitle || repo.name,
        role: aiData.role || '核心开发者 / 独立设计',
        startDate: new Date(repo.updated_at).toISOString().slice(0, 7).replace('-', '.'),
        endDate: '至今',
        repoUrl: repo.html_url,
        techStack: Array.isArray(aiData.techStack) && aiData.techStack.length > 0 ? aiData.techStack : languagesList,
        summary: aiData.summary || repo.description || '',
        bullets:
          Array.isArray(aiData.bullets) && aiData.bullets.length > 0
            ? aiData.bullets
            : [repo.description || '完成核心模块设计与验证。'],
      };

      onImportProject(newProj);
      setImportedIds((prev) => [...prev, repo.id]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'AI 提炼项目经历时出错，您可以使用“快速直接导入”');
    } finally {
      setExtractingId(null);
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
              输入您的 GitHub 用户名（如 <span className="font-mono text-slate-800">torvalds</span>）或具体仓库地址（如{' '}
              <span className="font-mono text-slate-800">owner/repo</span>），系统将读取仓库代码结构与 README，并结合电子信息工程专业术语自动生成符合 STAR 法则的简历项目经历。
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
              ? '电子信息工程典型 GitHub 开源仓库示例（可直接点击体验 AI 提炼导入）'
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
                    <span className="text-xs font-mono text-slate-600">{repo.language || 'C/C++'}</span>
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

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleQuickDirectImport(repo)}
                    disabled={isExtracting}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    直接导入
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAIExtractImport(repo)}
                    disabled={isExtracting}
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
    </div>
  );
};
