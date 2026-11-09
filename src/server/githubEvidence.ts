import { newClaimWarnings } from '../utils/resumeGenerationGuard.ts';

/**
 * Bounded public GitHub evidence for resume drafting.
 * A commit or repository file alone does NOT establish the candidate's authorship.
 */
export interface GitHubEvidence {
  repository: string;
  revision: string;
  repositoryUrl: string;
  readme: string;
  commits: Array<{ sha: string; message: string; date: string }>;
  filePaths: string[];
  codeSnippets: Array<{ path: string; content: string; url: string }>;
  codeSignals: GitHubCodeSignal[];
  warnings: string[];
}


/** Code-level clues only. A source match never establishes authorship, testing or production use. */
export interface GitHubCodeSignal {
  technology: string;
  category: 'language' | 'embedded' | 'framework';
  sourceFiles: Array<{ path: string; url: string }>;
}

type CodeSignalRule = {
  technology: string;
  category: GitHubCodeSignal['category'];
  match: (path: string, code: string) => boolean;
};

const codeSignalRules: CodeSignalRule[] = [
  { technology: 'C', category: 'language', match: (p) => /\.c$/i.test(p) },
  { technology: 'C++', category: 'language', match: (p) => /\.(cpp|cc|cxx|hpp)$/i.test(p) },
  { technology: 'Rust', category: 'language', match: (p) => /\.rs$/i.test(p) },
  { technology: 'Python', category: 'language', match: (p) => /\.py$/i.test(p) },
  { technology: 'Go', category: 'language', match: (p) => /\.go$/i.test(p) },
  { technology: 'TypeScript', category: 'language', match: (p) => /\.tsx?$/i.test(p) },
  { technology: 'STM32', category: 'embedded', match: (_p, code) => /\bstm32\w*|\bHAL_(?:UART|GPIO|SPI|I2C|DMA)_/i.test(code) },
  { technology: 'ESP32', category: 'embedded', match: (_p, code) => /\besp32\w*|\besp_wifi_\w*|\besp_err_t\b/i.test(code) },
  { technology: 'FreeRTOS', category: 'embedded', match: (_p, code) => /\bFreeRTOS\b|\bxTaskCreate\b|\bvTaskDelay\b|\bxQueue\w*|\btaskENTER_CRITICAL\b/i.test(code) },
  { technology: 'RT-Thread', category: 'embedded', match: (_p, code) => /\bRT-Thread\b|\brt_thread_\w*|\brt_device_\w*/i.test(code) },
  { technology: 'USART/UART', category: 'embedded', match: (_p, code) => /\bUSART\d*\b|\bUART\d*\b|\bHAL_UART_\w*|\buart_(?:init|read|write)\b/i.test(code) },
  { technology: 'I²C', category: 'embedded', match: (_p, code) => /\bI2C\d*\b|\bI²C\b|\bHAL_I2C_\w*|\bi2c_(?:init|read|write)\b/i.test(code) },
  { technology: 'SPI', category: 'embedded', match: (_p, code) => /\bSPI\d*\b|\bHAL_SPI_\w*|\bspi_(?:init|read|write)\b/i.test(code) },
  { technology: 'CAN', category: 'embedded', match: (_p, code) => /\bHAL_CAN_\w*|\bCAN_HandleTypeDef\b|\bFDCAN\w*|\bcan_(?:init|send|receive)\b/i.test(code) },
  { technology: 'DMA', category: 'embedded', match: (_p, code) => /\bHAL_DMA_\w*|\bDMA_InitTypeDef\b|\bDMA\d+_Stream\d+\b|\b__HAL_DMA_\w*/i.test(code) },
  { technology: 'GPIO', category: 'embedded', match: (_p, code) => /\bGPIO\w*|\bgpio_(?:init|read|write)\b/i.test(code) },
  { technology: 'MQTT', category: 'framework', match: (_p, code) => /\bMQTT\w*|\bmosquitto_\w*/i.test(code) },
  { technology: 'React', category: 'framework', match: (_p, code) => /\buseState\s*\(|\buseEffect\s*\(|from\s*['"]react['"]|\bReact\.FC\b/i.test(code) },
];

/** Deterministic taxonomy of the small set of actual source files fetched from GitHub. */
export function extractGitHubCodeSignals(
  snippets: ReadonlyArray<{ path: string; content: string; url: string }>
): GitHubCodeSignal[] {
  return codeSignalRules.flatMap((rule) => {
    const sources = snippets
      .filter((s) => rule.match(s.path, s.content))
      .slice(0, 3)
      .map(({ path, url }) => ({ path, url }));
    return sources.length
      ? [{ technology: rule.technology, category: rule.category, sourceFiles: sources }]
      : [];
  });
}

/**
 * Validate that an AI writing suggestion contains no fabricated ownership or
 * test/performance claims. It is still only a draft; deterministic checks cannot
 * establish semantic truth.
 */
export function validateGitHubWritingDraft(draft: unknown, evidence: GitHubEvidence): string[] {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    return ['AI 项目草稿必须是 JSON 对象'];
  }
  const obj = draft as Record<string, unknown>;
  if (typeof obj.projectTitle !== 'string' || !obj.projectTitle.trim() || obj.projectTitle.length > 90 ||
      typeof obj.summary !== 'string' || obj.summary.length > 320 ||
      !Array.isArray(obj.techStack) || obj.techStack.length > 14 ||
      obj.techStack.some((term) => typeof term !== 'string' || term.length > 48) ||
      !Array.isArray(obj.bullets) || obj.bullets.length > 4 ||
      obj.bullets.some((bullet) => typeof bullet !== 'string' || !bullet.trim() || bullet.length > 220)) {
    return ['AI 工程草稿结构或长度不符合中文项目写作要求'];
  }

  const issues: string[] = [];
  const availableTech = new Set(evidence.codeSignals.map((signal) => signal.technology));
  for (const term of obj.techStack as string[]) {
    if (!availableTech.has(term)) issues.push('技术栈「' + term + '」没有对应的已读取源码线索');
  }

  const candidate = [obj.summary, ...(obj.bullets as string[])].join('\n');
  if (/(?:本人|个人|我)\s*(?:独立|主导|负责|完成)|独立(?:负责|完成|开发)|主导(?:开发|设计|落地)|(?:已|完成)(?:量产|上线部署)|实板验证通过|已投入生产|工业级稳定运行|零丢包|零故障/i.test(candidate)) {
    issues.push('草稿出现不能从公开仓库推定的个人职责、运行阶段或可靠性断言');
  }
  if (/(?:提升|提高|降低|减少|下降|节省|加速|缩短|改善).{0,18}\d+(?:\.\d+)?\s*(?:%|％|倍|ms|毫秒|秒|W|mA|FPS|QPS|MB|GB)(?![A-Za-z])/i.test(candidate)) {
    issues.push('仓库材料不能单独证明性能提升或量化收益');
  }
  const emptyPhrases = ['深度赋能', '业界领先', '业界首创', '深度参与', '极大提升', '极大地提升'];
  const filler = emptyPhrases.filter((phrase) => candidate.includes(phrase));
  if (filler.length) {
    issues.push('工程草稿包含空泛或夸大的模板化表达：' + filler.join('、'));
  }

  // Keep references structured: JSON.stringify on newline-delimited strings
  // escapes newlines as \\n, which can hide word boundaries from term checks.
  const sourceFacts = {
    // README and commit subjects are unverified claims, not code-level proof.
    // Use only actually fetched code plus source-indicator taxonomy for claims.
    codeSnippets: evidence.codeSnippets.map((item) => item.content),
    codeSignals: evidence.codeSignals.map((item) => item.technology),
  };
  issues.push(...newClaimWarnings(sourceFacts, {
    projectTitle: obj.projectTitle,
    techStack: obj.techStack,
    summary: obj.summary,
    bullets: obj.bullets,
  }));
  return [...new Set(issues)];
}

export function parseGitHubRepoUrl(raw: string): { owner: string; repo: string } {
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error('仓库地址不是有效的 GitHub URL'); }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') {
    throw new Error('只支持 https://github.com/owner/repo 的公开仓库地址');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('仓库 URL 不得包含账号、密码、查询参数或片段');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) {
    throw new Error('请使用仓库首页地址，而不是具体文件或分支地址');
  }
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!/^[a-z0-9-]{1,39}$/i.test(owner) || !/^[a-z0-9_.-]{1,100}$/i.test(repo) || repo === '.' || repo === '..') {
    throw new Error('GitHub 用户名或仓库名格式不正确');
  }
  return { owner, repo };
}

async function githubJSON(path: string): Promise<any> {
  const response = await fetch('https://api.github.com' + path, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CraftCV-Studio-Evidence',
    },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) {
    throw new Error('GitHub API 请求失败（HTTP ' + response.status + '），请检查公开权限或速率限制');
  }
  return response.json();
}

function safeCodePreview(raw: string): string {
  // Do not forward obvious credential assignments into an AI prompt.
  const lines = raw.split(/\r?\n/);
  const chosen = new Set<number>();
  // Headers reveal interfaces, while bounded function/handler lines reveal implementation.
  for (let i = 0; i < Math.min(20, lines.length); i++) chosen.add(i);
  const interesting = /(function\s|const\s+\w+\s*=\s*(?:async\s*)?\(|app\.(get|post)|IRQHandler|HAL_(?:UART|CAN|DMA|GPIO|SPI|I2C)|xTaskCreate|vTaskDelay|xQueue|rt_thread|esp_wifi|osThread|FreeRTOS|PID|useEffect|handle[A-Z])/i;
  for (let i = 0; i < lines.length && chosen.size < 85; i++) {
    if (interesting.test(lines[i])) {
      for (let j = Math.max(0, i-1); j <= Math.min(lines.length-1, i+2); j++) chosen.add(j);
    }
  }
  return [...chosen].sort((a,b) => a-b).map((i) => lines[i]).map((line) =>
    /(?:api[_-]?key|secret|access[_-]?token|password|private[_-]?key)\s*[:=]/i.test(line)
      ? '[credential-like line redacted]'
      : line
  ).join('\n').slice(0, 2200);
}

function rankCodePath(p: string): number {
  const normalized = p.toLowerCase();
  let score = /^(src|firmware|app|core|drivers|include|lib)\//.test(normalized) ? 8 : 0;
  if (/(^|\/)(main|app|server|controller|scheduler|interrupt|uart|pid|system)\./i.test(p)) score += 10;
  if (/^src\/main\.(tsx|jsx|ts|js)$/i.test(p)) score -= 16;
  if (/(^|\/)(App|ResumeEditor|Controller)\.(tsx|ts|jsx|js)$/i.test(p)) score += 5;
  if (/\.(c|cpp|rs|go|py|ino)$/.test(normalized)) score += 4;
  score -= Math.min(6, p.split('/').length - 1);
  return score;
}

export async function collectGitHubEvidence(rawUrl: string): Promise<GitHubEvidence> {
  const { owner, repo } = parseGitHubRepoUrl(rawUrl);
  const base = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
  const meta = await githubJSON(base);
  const canonicalUrl = 'https://github.com/' + owner + '/' + repo;
  if (meta.private || meta.archived) {
    throw new Error('当前仅分析未归档的公开 GitHub 仓库');
  }

  const warnings: string[] = [];
  const [commitsResponse, readmeResponse] = await Promise.allSettled([
    githubJSON(base + '/commits?per_page=12'),
    githubJSON(base + '/readme'),
  ]);
  const rawCommits = commitsResponse.status === 'fulfilled' && Array.isArray(commitsResponse.value) ? commitsResponse.value : [];
  if (commitsResponse.status === 'rejected') warnings.push('近期 Commit 暂时无法读取');
  const commits = rawCommits.slice(0,12).map((c: any) => ({
    sha: String(c.sha || '').slice(0, 40),
    message: String(c.commit?.message || '').split('\n')[0].slice(0, 180),
    date: String(c.commit?.author?.date || '').slice(0, 10),
  })).filter((c) => c.sha);

  let readme = '';
  if (readmeResponse.status === 'fulfilled' && readmeResponse.value?.content) {
    readme = Buffer.from(readmeResponse.value.content, 'base64').toString('utf-8').slice(0, 4000);
  } else {
    warnings.push('README 不可用');
  }

  const revision = String(commits[0]?.sha || meta.default_branch || 'main');
  const treeRef = encodeURIComponent(revision);
  let tree: any = { tree: [] };
  try {
    tree = await githubJSON(base + '/git/trees/' + treeRef + '?recursive=1');
    if (tree.truncated) warnings.push('GitHub 返回的工程目录已截断，分析不是全量扫描');
  } catch {
    warnings.push('源码目录无法读取，仅能使用 README/Commit');
  }
  const listed = (Array.isArray(tree.tree) ? tree.tree : [])
    .filter((x: any) => x && x.type === 'blob' && typeof x.path === 'string' && x.path.length < 240)
    .slice(0, 5000);
  const filePaths = listed.map((x: any) => x.path).slice(0, 90);
  const sourceCandidates = listed.filter((x: any) =>
    /\.(c|h|cpp|hpp|cc|rs|go|py|ino|ts|tsx)$/i.test(x.path) &&
    (typeof x.size !== 'number' || x.size <= 120000) &&
    !/(^|\/)(node_modules|vendor|dist|build|target|generated|\.git|\.next|coverage)(\/|$)/i.test(x.path) &&
    !/(secret|credential|password|\.env|\.min\.)/i.test(x.path)
  ).sort((a: any, b: any) => (rankCodePath(b.path) - (b.size < 500 ? 8 : 0)) - (rankCodePath(a.path) - (a.size < 500 ? 8 : 0))).slice(0,4);

  const snippets = await Promise.all(sourceCandidates.map(async (x: any) => {
    try {
      const encoded = x.path.split('/').map(encodeURIComponent).join('/');
      const source = await githubJSON(base + '/contents/' + encoded + '?ref=' + encodeURIComponent(revision));
      if (source.encoding !== 'base64' || !source.content) return null;
      const code = Buffer.from(source.content, 'base64').toString('utf-8');
      if (!code.trim()) return null;
      return {
        path: x.path as string,
        content: safeCodePreview(code),
        url: canonicalUrl + '/blob/' + revision + '/' + x.path.split('/').map(encodeURIComponent).join('/'),
      };
    } catch {
      return null;
    }
  }));
  const codeSnippets = snippets.filter((x): x is NonNullable<typeof x> => x !== null);
  if (codeSnippets.length < sourceCandidates.length) warnings.push('部分源码无法读取；不可据此推断测试成功或个人贡献');

  if (!readme && commits.length === 0 && codeSnippets.length === 0) {
    throw new Error('没有取得可核实的公开工程证据，请稍后重试或手动填写项目经历');
  }
  return { repository: owner + '/' + repo, revision, repositoryUrl: canonicalUrl, readme, commits, filePaths, codeSnippets, codeSignals: extractGitHubCodeSignals(codeSnippets), warnings };
}
