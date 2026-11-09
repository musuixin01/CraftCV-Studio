import test from 'node:test';
import assert from 'node:assert/strict';
import { publicModelCatalog, resolveAIModel, verifyPartCompatibility, generateStructuredAI } from '../src/server/aiModelGateway.ts';

const CONFIG = {
  GEMINI_API_KEY:'mock-gemini', GEMINI_MODELS:'gemini-test-a,gemini-test-b',
  OPENAI_API_KEY:'mock-openai', OPENAI_MODELS:'gpt-test',
  DEEPSEEK_API_KEY:'mock-deepseek', DEEPSEEK_MODELS:'deepseek-flash',
  ANTHROPIC_API_KEY:'mock-anthropic', ANTHROPIC_MODELS:'claude-test',
  DASHSCOPE_API_KEY:'mock-qwen', QWEN_MODELS:'qwen-test',
  ARK_API_KEY:'mock-ark', DOUBAO_MODELS:'endpoint-test',
  XAI_API_KEY:'mock-xai', GROK_MODELS:'grok-test',
  OLLAMA_MODELS:'qwen3:8b',
};

function setModelEnv(values) {
  const keys = Object.keys(CONFIG);
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    if (values[key] !== undefined) process.env[key] = values[key];
    else delete process.env[key];
  }
  return () => {
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  };
}

function request(modelId, parts) {
  return {
    modelId,
    contents: parts ?? '仅生成 JSON：测试多模型配置',
    config: {
      systemInstruction: '保持事实，不要编造。输出 JSON。',
      responseMimeType: 'application/json',
      responseSchema: { type:'OBJECT', properties:{ answer:{type:'STRING'}},required:['answer'] },
    },
  };
}

test('catalog lists only configured allowlisted models without any credentials', () => {
  const result = publicModelCatalog({...CONFIG, OTHER_PRIVATE_KEY:'hidden-secret'});
  assert.equal(result.models.length,9);
  assert.ok(result.models.some((m) => m.id==='gemini:gemini-test-b'));
  assert.ok(result.models.some((m) => m.id==='ollama:qwen3:8b' && m.local));
  assert.equal(result.models.find((m)=>m.provider==='deepseek').supportsPdf,false);
  assert.equal(result.models.find((m)=>m.provider==='anthropic').supportsPdf,true);
  const text=JSON.stringify(result);
  for(const key of ['mock-gemini','mock-openai','mock-deepseek','mock-anthropic','hidden-secret'])
    assert.ok(!text.includes(key),key+' secret leaked');
});

test('models are server-side allowlisted and cannot select arbitrary URLs or keys', () => {
  assert.throws(() => resolveAIModel('openai:https://127.0.0.1', CONFIG), /未在服务端配置/);
  assert.throws(() => resolveAIModel('../secret', CONFIG), /未在服务端配置/);
  assert.throws(() => resolveAIModel('openai:gpt-test','not-env'), /TypeError|未配置|无效/);
  assert.equal(resolveAIModel(undefined,CONFIG).id,'gemini:gemini-test-a');
  assert.equal(publicModelCatalog({GEMINI_API_KEY:'MY_GEMINI_API_KEY'}).models.length,0);
  assert.equal(publicModelCatalog({OLLAMA_MODELS:'localtest:latest'}).models.length,1);
});

test('provider selection uses fixed HTTPS endpoints and provider credentials', async () => {
  const restoreEnv = setModelEnv(CONFIG);
  const originalFetch=globalThis.fetch;
  const captures=[];
  globalThis.fetch=async (url,options)=>{
    captures.push({url,authorization:options.headers.authorization,
      body:JSON.parse(options.body)});
    return new Response(JSON.stringify({choices:[{message:{content:'{"answer":"好"}'}}]}),{
      status:200,headers:{'content-type':'application/json'}});
  };
  try {
    const entries=[
      ['openai:gpt-test','https://api.openai.com/v1/chat/completions','mock-openai'],
      ['deepseek:deepseek-flash','https://api.deepseek.com/chat/completions','mock-deepseek'],
      ['qwen:qwen-test','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','mock-qwen'],
      ['doubao:endpoint-test','https://ark.cn-beijing.volces.com/api/v3/chat/completions','mock-ark'],
      ['grok:grok-test','https://api.x.ai/v1/chat/completions','mock-xai'],
      ['ollama:qwen3:8b','http://127.0.0.1:11434/v1/chat/completions',undefined],
    ];
    for(const [id,endpoint,key] of entries) {
      const result=await generateStructuredAI(request(id));
      assert.deepEqual(JSON.parse(result.text),{answer:'好'});
      assert.equal(result.modelId,id);
      const sent=captures.at(-1);
      assert.equal(sent.url,endpoint);
      assert.equal(sent.authorization,key ? 'Bearer '+key : undefined);
      assert.equal(sent.body.response_format.type,'json_object');
      assert.ok(sent.body.messages[0].content.includes('不得虚构'));
    }
  } finally { globalThis.fetch=originalFetch;restoreEnv(); }
});

test('Claude Messages API accepts base64 PDF and returns JSON', async () => {
  const restoreEnv=setModelEnv(CONFIG);
  const originalFetch=globalThis.fetch;
  let payload;
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://api.anthropic.com/v1/messages');
    assert.equal(options.headers['x-api-key'],'mock-anthropic');
    payload=JSON.parse(options.body);
    return new Response(JSON.stringify({content:[{type:'text',text:'{"answer":"PDF 已读取"}'}]}),{status:200});
  };
  try{
    const parts=[{inlineData:{mimeType:'application/pdf',data:Buffer.from('%PDF-example').toString('base64')}},
      {text:'抽取内容，输出 JSON。'}];
    const result=await generateStructuredAI(request('anthropic:claude-test',{parts}));
    assert.deepEqual(JSON.parse(result.text),{answer:'PDF 已读取'});
    assert.equal(payload.messages[0].content[0].type,'document');
    assert.equal(payload.messages[0].content[0].source.media_type,'application/pdf');
  }finally{globalThis.fetch=originalFetch;restoreEnv();}
});

test('PDF is rejected for unsupported models before any network request', async()=>{
  const restoreEnv=setModelEnv(CONFIG);
  const originalFetch=globalThis.fetch;
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('network must not be used')};
  try{
    const parts=[{inlineData:{mimeType:'application/pdf',data:'YWJj'}},{text:'提取 JSON。'}];
    await assert.rejects(generateStructuredAI(request('deepseek:deepseek-flash',{parts})),/不支持直接解析 PDF/);
    assert.equal(calls,0);
  }finally{globalThis.fetch=originalFetch;restoreEnv();}
});

test('provider error messages do not echo remote prompt or private response body',async()=>{
  const restoreEnv=setModelEnv(CONFIG);
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response('private uploaded CV data secret-token',{status:401});
  try {
    await assert.rejects(generateStructuredAI(request('openai:gpt-test')),err=>
      err.message.includes('HTTP 401') && !err.message.includes('secret-token'));
  }finally{globalThis.fetch=originalFetch;restoreEnv();}
});
