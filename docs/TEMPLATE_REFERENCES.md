# CraftCV 模板参考与使用说明

这份记录区分**原生实现的参考风格**与上游开源模板的源文件。当前版本不直接引入第三方 LaTeX 类、Typst 模板、CSS、字体文件或模板图像。

| 来源 | 上游项目 | 项目公布的许可证 | CraftCV 当前实现 |
| --- | --- | --- | --- |
| CraftCV | 本项目原有模板 | 以本仓库权利为准 | 保留现有 4 款 |
| Reactive Resume | https://github.com/reactive-resume/reactive-resume | MIT | Meowth、Onyx、Bronzor 的原生 React 参考风格 |
| RenderCV | https://github.com/rendercv/rendercv | MIT | Engineering Resumes、Engineering Classic、Harvard 的原生 React 参考风格 |
| Awesome-CV | https://github.com/posquit0/Awesome-CV | LPPL-1.3c | 只借鉴醒目姓名与栏目层次，不复制 .cls / .tex 原始实现 |
| ResumeSample | https://github.com/geekcompany/ResumeSample | 仓库未提供可确认的根目录 LICENSE | 中文技术简历排版与写作思想，不复制原始示例文本 |

## 设计与功能边界

- CraftCV 的模板切换仅调整简历的模板标识、主题色，**不重写**个人信息、教育、项目、职业经历或模块顺序。
- 参考风格和第三方项目**没有官方关联**，不是像素级复刻，也不声称支持完全相同的导出、编辑器和字体功能。
- 12 个模板共享 CraftCV 编辑器、A4 预览和现有两种 PDF 导出方式。
- 单栏版式通常有利于 ATS 顺序阅读，但不同招聘系统的具体解析结果仍需用户在投递前检查；没有“100% ATS 兼容”的保证。
- 内容较多的简历可能自然跨到第二页；应在预览中查看超页提示，视实际信息量选择精简或保留多页。
- 将来如果直接引入第三方原代码或模板素材，必须另行审查许可证、版权声明、字体许可及商用再分发条件。

## 当前模板映射

- reactive-meowth — Meowth 风格：暖棕章节分隔线、右侧可选照片
- reactive-onyx — Onyx 风格：深色标题与竖线
- reactive-bronzor — Bronzor 风格：标签栏对齐的单栏信息流
- render-engineering — Engineering Resumes 风格：居中姓名、紧凑工程经历
- render-engineering-classic — Engineering Classic 风格：深蓝标题及细线
- render-harvard — Harvard 风格：正式居中标题与衬线字体
- awesome-inspired — Awesome 风格：彩色姓名和大幅留白层次
- resumesample-engineer — 中文工程校招：中文技术岗位紧凑单栏

最新可用模板目录以 src/data/templateCatalog.ts 为准。
