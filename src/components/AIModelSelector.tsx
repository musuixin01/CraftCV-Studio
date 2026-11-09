import React, { useEffect, useState } from 'react';
import { Bot, ChevronDown, Info, RefreshCw } from 'lucide-react';
import { saveSelectedAIModelId, selectedAIModelId } from '../utils/aiModelClient';

type ModelSummary = {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
  local: boolean;
  supportsImage: boolean;
  supportsPdf: boolean;
};
type ProviderSummary = {
  provider: string;
  label: string;
  modelsEnv: string;
  keyEnv: string | null;
};
type ModelCatalog = {
  models: ModelSummary[];
  defaultId: string | null;
  supportedProviders: ProviderSummary[];
};

export const AIModelSelector: React.FC = () => {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [selected, setSelected] = useState(selectedAIModelId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [details, setDetails] = useState(false);

  const refresh = () => {
    setLoading(true);
    setError('');
    fetch('/api/ai/models', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('模型列表读取失败');
        return res.json() as Promise<ModelCatalog>;
      })
      .then((data) => {
        setCatalog(data);
        const saved = selectedAIModelId();
        const next = data.models.some((model) => model.id === saved) ? saved
          : (data.defaultId ?? '');
        saveSelectedAIModelId(next);
        setSelected(next);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '模型列表暂不可用'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  // Reuse the existing model guidance instead of introducing another settings page.
  useEffect(() => {
    const showModelHelp = () => {
      setDetails(true);
      refresh();
    };
    window.addEventListener('craftcv-open-ai-model-settings', showModelHelp);
    return () => window.removeEventListener('craftcv-open-ai-model-settings', showModelHelp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedModel = catalog?.models.find((item) => item.id === selected);
  const providers = [...new Set(catalog?.models.map((item) => item.provider) ?? [])];

  return (
    <div className="relative flex items-center gap-1.5 shrink-0">
      <Bot className="w-4 h-4 text-[#0071e3] hidden sm:block" aria-hidden="true" />
      <label className="sr-only" htmlFor="craftcv-ai-model">当前 AI 模型</label>
      <div className="relative">
        <select
          id="craftcv-ai-model"
          aria-label="当前 AI 模型"
          value={selected}
          disabled={loading || !catalog?.models.length}
          onChange={(event) => {
            setSelected(event.target.value);
            saveSelectedAIModelId(event.target.value);
          }}
          title={selectedModel
            ? [selectedModel.providerLabel, selectedModel.name,
               selectedModel.local ? '在本机处理' : 'AI 请求将发送给该云服务商',
               selectedModel.supportsPdf ? '支持直接 PDF 解析' : '此模型不支持直接 PDF 解析'].join(' · ')
            : '请先在服务端配置 AI 模型'}
          className="appearance-none os26-input text-[11px] font-medium text-slate-800 bg-white/75 border border-slate-200 rounded-xl pl-2.5 pr-6 py-1.5 w-[145px] sm:w-[172px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          {!catalog?.models.length && <option value="">{loading ? '加载 AI 模型…' : 'AI 模型未配置'}</option>}
          {providers.map((provider) => (
            <optgroup key={provider} label={catalog?.models.find((m) => m.provider === provider)?.providerLabel ?? provider}>
              {catalog?.models.filter((m) => m.provider === provider).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.providerLabel} · {model.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
      </div>
      <button
        type="button"
        aria-label="AI 模型配置说明"
        aria-expanded={details}
        onClick={() => setDetails((v) => !v)}
        className="os26-press w-6 h-6 rounded-lg text-slate-500 hover:bg-white/80 flex items-center justify-center"
        title="查看模型、文件支持与隐私说明"
      ><Info className="w-3.5 h-3.5" /></button>
      {details && (
        <div className="os26-floating-dock absolute right-0 top-full mt-2 w-[min(360px,90vw)] rounded-xl p-4 z-50 text-left shadow-xl space-y-2.5 text-xs text-slate-700" style={{ backgroundColor: '#fff' }} role="region" aria-label="AI 模型设置">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-slate-900">AI 模型与数据权限</strong>
            <button type="button" onClick={refresh} disabled={loading}
              className="flex items-center gap-1 text-blue-700 hover:underline disabled:opacity-50">
              <RefreshCw className="w-3 h-3" /> 刷新
            </button>
          </div>
          <p>已配置 {catalog?.models.length ?? 0} 个模型。模型切换会用于简历解析、项目提炼、单项优化和 JD 匹配。</p>
          <p>云端模型在发起 AI 请求时会收到此次操作所需的简历或项目资料；Ollama 在本机运行，但本地模型也可能需要联网下载。请避免上传未获授权的敏感资料。</p>
          {selectedModel && (
            <p className="text-slate-600">
              当前：{selectedModel.providerLabel} / {selectedModel.name}。
              图片：{selectedModel.supportsImage ? '接口支持，仍取决于具体模型' : '未声明支持'}；
              PDF：{selectedModel.supportsPdf ? '接口支持' : '不支持直接解析'}。
            </p>
          )}
          {error && <p className="text-red-700">{error}</p>}
          <div className="border-t border-slate-200 pt-2">
            <strong className="text-slate-900">配置方式</strong>
            <p className="mt-1">在本机工程的 .env 中配置服务商密钥和模型列表，重新启动服务后点击「刷新」。密钥不会返回浏览器或保存进简历。</p>
            <p className="mt-1 text-[11px] text-slate-500 break-words">
              支持 {catalog?.supportedProviders.map((p) => p.label).join('、') || 'Gemini、OpenAI、DeepSeek、Claude、通义千问、豆包、Grok、Ollama'}。
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
