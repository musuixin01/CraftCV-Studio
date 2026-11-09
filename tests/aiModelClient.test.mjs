import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aiFetch, selectedAIModelId, saveSelectedAIModelId, SELECTED_AI_MODEL_KEY } from '../src/utils/aiModelClient.ts';

test('browser forwards only a selected model ID, never a credential', async () => {
  const values = new Map();
  const oldStore = globalThis.localStorage;
  const oldFetch = globalThis.fetch;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = {url, options};
    return new Response('{"ok":true}',{status:200});
  };
  try {
    saveSelectedAIModelId('deepseek:deepseek-flash');
    assert.equal(selectedAIModelId(),'deepseek:deepseek-flash');
    assert.equal(values.get(SELECTED_AI_MODEL_KEY),'deepseek:deepseek-flash');
    await aiFetch('/api/ai/jd-match', {
      method:'POST',headers:{'Content-Type':'application/json'},body:'{}',
    });
    assert.equal(captured.url,'/api/ai/jd-match');
    const headers=new Headers(captured.options.headers);
    assert.equal(headers.get('X-CraftCV-AI-Model'),'deepseek:deepseek-flash');
    assert.equal(headers.get('Content-Type'),'application/json');
    assert.equal(headers.has('Authorization'),false);
    saveSelectedAIModelId('');
    assert.equal(selectedAIModelId(),'');
  } finally {
    globalThis.localStorage=oldStore;
    globalThis.fetch=oldFetch;
  }
});

test('all six backend AI endpoints use the common model gateway',()=>{
  const server = fs.readFileSync('server.ts','utf8');
  const generated=(server.match(/const response = await generateStructuredAI\(/g)||[]).length;
  const selected=(server.match(/modelId: req\.header\('X-CraftCV-AI-Model'\)/g)||[]).length;
  assert.equal(generated,6);
  assert.equal(selected,6);
  assert.ok(server.includes("app.get('/api/ai/models'"));
  const files=[
    'src/components/AIOptimizeModal.tsx',
    'src/components/GitHubImportPanel.tsx',
    'src/components/JDMatchPanel.tsx',
    'src/components/ResumeImportModal.tsx',
    'src/components/OnePageAICompactDialog.tsx',
  ];
  for(const name of files){
    const text=fs.readFileSync(name,'utf8');
    assert.ok(text.includes('await aiFetch('),name);
    assert.ok(!text.includes("await fetch('/api/ai/"),name);
  }
  assert.ok(fs.readFileSync('src/App.tsx','utf8').includes('<AIModelSelector />'));
});
