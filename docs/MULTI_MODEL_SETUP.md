# CraftCV-Studio 多模型配置与安全规范

状态：多模型网关和可视化选择器已实现；本机未配置真实云端 API Key，因此尚未完成真实服务商调用与计费验证。

## 1. 支持的服务商

| 服务商 | 接口 | 模型变量 | 密钥变量 | 当前支持 |
| --- | --- | --- | --- | --- |
| Gemini | Google GenAI SDK | GEMINI_MODELS | GEMINI_API_KEY | 文本、图片、PDF |
| OpenAI | Chat Completions | OPENAI_MODELS | OPENAI_API_KEY | 文本；模型支持时可用图片 |
| DeepSeek | OpenAI 兼容 | DEEPSEEK_MODELS | DEEPSEEK_API_KEY | 文本 |
| Claude | Anthropic Messages | ANTHROPIC_MODELS | ANTHROPIC_API_KEY | 文本、图片、PDF |
| 通义千问 | 阿里云百炼兼容 | QWEN_MODELS | DASHSCOPE_API_KEY | 文本；视觉模型可用图片 |
| 豆包 | 火山方舟兼容 | DOUBAO_MODELS | ARK_API_KEY | 文本；视觉模型可用图片 |
| Grok | xAI 兼容 | GROK_MODELS | XAI_API_KEY | 文本；视觉模型可用图片 |
| Ollama | 本地 OpenAI 兼容 | OLLAMA_MODELS | 无 | 文本；视觉模型可用图片 |

注意：模型可在菜单中出现不代表该模型实际在线、有调用权限或支持全部模态。PDF 直读只在本版本的 Gemini / Claude 接口实现。

## 2. 配置方法

在现有工程根目录创建或编辑本机 .env，参考 .env.example，只为已开通的服务商写对应的 API Key 和模型名称。多个模型用半角逗号分隔。以下仅为格式示例，模型 ID 须以各服务商当时的控制台为准：

    GEMINI_API_KEY="实际密钥"
    GEMINI_MODELS="可用 Gemini 模型名称"
    DEEPSEEK_API_KEY="实际密钥"
    DEEPSEEK_MODELS="可用 DeepSeek 模型名称"

Ollama 需自行安装、下载模型并启动本机服务，然后设置 OLLAMA_MODELS。修改服务端 .env 后重新启动 npm run dev，在 Windows 上打开 http://127.0.0.1:3000 ，使用顶部「AI 模型」选择器切换。

**切换模型本身不会向模型发送请求，也不会计费。** 只有实际点击 AI 优化、GitHub 提炼、岗位分析、导入解析等功能才会发送相应资料。未配置模型时，手动编辑与 PDF 导出仍可使用。

## 3. 实际集成与安全边界

- 统一服务端 src/server/aiModelGateway.ts 负责八类服务商的凭证、接口和响应归一化。
- GET /api/ai/models 返回已配置模型的非敏感元数据，不返回任何密钥。
- 现有五个 AI 接口共用统一模型选择，并继续经过 RGS v1.1 结构/事实校验与用户确认。
- 浏览器只保存所选模型的 ID，不保存凭证、服务商 URL 或完整简历副本。
- 请求端点在后端固定，拒绝浏览器自选 URL 和未经配置的模型；Ollama 地址固定为本机 127.0.0.1:11434。
- 兼容 API 请求设置 120 秒超时；服务商错误响应不直接回显提供商返回的正文。
- 用户选择的模型失败时明确报错，不会未经同意切换服务商把简历发给另一个模型。
- 云端模型会收到当前操作所需的个人简历、JD、源码片段、图片或证书；本系统并非自动脱敏或完全离线服务。
- 不要将未授权的简历资料、凭证或私有项目上传外部 AI。没有鉴权和限流前不能公开暴露本地开发 API。

## 4. 目前的限制

- 仅完成模拟网络级路由和安全测试，真实供应商账号、模型可用性、费用、配额尚未逐一验证。
- OpenAI 兼容路径使用 JSON object 响应模式；实际模型输出依然要经过各端点的 RGS 数据校验。
- PDF 原生解析只允许 Gemini 和 Claude。其余模型如需要导入 PDF，可改用支持的模型或粘贴提取后的文本。图片支持受具体模型能力限制。
- 没有实现自动选模型、多模型同时交叉审核、模型调用费用统计、DOCX 输出等新功能；后续研发可在统一网关上扩展。

## 5. 官方接口参考

- https://ai.google.dev/gemini-api/docs
- https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- https://api-docs.deepseek.com/
- https://platform.claude.com/docs/en/api/messages
- https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx
- https://help.aliyun.com/zh/model-studio/
- https://www.volcengine.com/docs/82379/
- https://docs.x.ai/
