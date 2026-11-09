import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGitHubRepoUrl, extractGitHubCodeSignals, validateGitHubWritingDraft } from '../src/server/githubEvidence.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('accepts only canonical HTTPS GitHub repository URLs', () => {
  assert.deepEqual(parseGitHubRepoUrl('https://github.com/example-owner/sample-repo'), {
    owner: 'example-owner', repo: 'sample-repo',
  });
  assert.deepEqual(parseGitHubRepoUrl('https://github.com/example-owner/sample.git'), {
    owner: 'example-owner', repo: 'sample',
  });
  for (const invalid of [
    'http://github.com/a/b',
    'https://evil.example/a/b',
    'https://github.com/a/b/tree/main',
    'https://github.com/a/../admin',
    'https://github.com/a',
    'file:///etc/passwd',
  ]) {
    assert.throws(() => parseGitHubRepoUrl(invalid), invalid);
  }
});

test('source tree does not bundle a previously imported personal resume as a preset', () => {
  const preset = fs.readFileSync(path.join(root,'src/data/defaultResume.ts'),'utf8');
  const app = fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
  assert.ok(!preset.includes('UPLOADED_PDF_EXACT_RESUME'));
  assert.ok(!app.includes('UPLOADED_PDF_EXACT_RESUME'));
  const publicDir = path.join(root,'public/assets/aistudio');
  if (fs.existsSync(publicDir)) {
    assert.equal(fs.readdirSync(publicDir).filter(f=>/\.(pdf|png|jpg|jpeg)$/i.test(f)).length,0);
  }
});

test('existing one-click download and new selectable-text print are both available', () => {
  const app = fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
  assert.ok(app.includes('window.print()'));
  assert.ok(app.includes('handleDownloadImagePDF'));
  assert.ok(app.includes('pdf.save('));
  assert.ok(app.includes("await import('html2canvas-pro')"));
  assert.ok(app.includes('await html2canvas(captureNode'));
  assert.ok(!app.includes('domToCanvas('));
  assert.ok(app.includes('ATS 文字 PDF'));
  const css=fs.readFileSync(path.join(root,'src/index.css'),'utf8');
  assert.ok(css.includes('@media print'));
  assert.ok(css.includes('size: A4 portrait;'));
  assert.ok(css.includes('@media screen'));
});

const publicSnippet = {
  path:'firmware/main.c',
  url:'https://github.com/example-owner/sample-repo/blob/abc/firmware/main.c',
  content:'#include "stm32f4xx_hal.h"\nvoid init(void) { HAL_UART_Init(&huart1); USART1; xTaskCreate(task, "A", 128, NULL, 1, NULL); const int baud = 115200; }',
};
const evidenceFixture = {
  repository:'example-owner/sample-repo', revision:'abc', repositoryUrl:'https://github.com/example-owner/sample-repo',
  readme:'演示仓库 README，不能证明个人贡献', commits:[], filePaths:[publicSnippet.path],
  codeSnippets:[publicSnippet], codeSignals:extractGitHubCodeSignals([publicSnippet]), warnings:[],
};
const validDraft = {
  projectTitle:'串口控制示例',
  techStack:['C','STM32','FreeRTOS','USART/UART'],
  summary:'仓库源码展示 USART1 串口初始化及 FreeRTOS 任务接口。',
  bullets:['在 firmware/main.c 中可见 USART1 通信配置（115200 bps）和任务创建接口。'],
};

test('extracts bounded Chinese embedded technology clues from real fetched source snippets',()=>{
  const signals = extractGitHubCodeSignals([publicSnippet]);
  assert.deepEqual(signals.map((item)=>item.technology),['C','STM32','FreeRTOS','USART/UART']);
  assert.ok(signals.every((item)=>item.sourceFiles.length===1 &&
    item.sourceFiles[0].url===publicSnippet.url));
  assert.deepEqual(extractGitHubCodeSignals([]),[]);
  assert.deepEqual(validateGitHubWritingDraft(validDraft,evidenceFixture),[]);
});

test('README self-description and GitHub commit history never become code-level evidence',()=>{
  const noSource={...evidenceFixture,readme:'使用 FreeRTOS STM32，提升性能 100%',
    codeSnippets:[],codeSignals:[]};
  assert.deepEqual(extractGitHubCodeSignals(noSource.codeSnippets),[]);
  assert.match(validateGitHubWritingDraft({...validDraft,techStack:['FreeRTOS']},noSource).join('；'),/没有对应/);
  assert.match(validateGitHubWritingDraft(
    {...validDraft,techStack:[],summary:'仓库使用 FreeRTOS 进行了工业控制'},noSource,
  ).join('；'),/技术名词/);
});

test('blocks invented personal authorship, unmeasured outcomes and unsupported technologies',()=>{
  assert.match(validateGitHubWritingDraft(
    {...validDraft,summary:'本人独立负责 STM32 固件开发'},evidenceFixture).join('；'),/个人职责/);
  assert.match(validateGitHubWritingDraft(
    {...validDraft,bullets:['基于 STM32 提升吞吐率 60%']},evidenceFixture).join('；'),/量化|数字/);
  assert.match(validateGitHubWritingDraft(
    {...validDraft,techStack:['C','Docker']},evidenceFixture).join('；'),/Docker/);
  assert.match(validateGitHubWritingDraft(
    {...validDraft,summary:'系统已量产并实板验证通过'},evidenceFixture).join('；'),/个人职责|断言/);
  assert.match(validateGitHubWritingDraft(
    {...validDraft,bullets:['添加 Rust 驱动']},evidenceFixture).join('；'),/技术名词/);
  assert.match(validateGitHubWritingDraft(
    {...validDraft,summary:'深度赋能业务发展'},evidenceFixture).join('；'),/模板化表达/);
});

test('rejects empty/oversized model drafts while allowing a single grounded bullet',()=>{
  assert.ok(validateGitHubWritingDraft({...validDraft,projectTitle:''},evidenceFixture).length);
  assert.ok(validateGitHubWritingDraft({...validDraft,bullets:Array(5).fill('项目要点')},evidenceFixture).length);
  assert.deepEqual(validateGitHubWritingDraft({...validDraft,bullets:['仓库包含 FreeRTOS 任务接口。']},evidenceFixture),[]);
});
