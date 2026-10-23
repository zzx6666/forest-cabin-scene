# Repository Guidelines

## 项目结构与模块组织

本项目是基于 Vite 与 Three.js 的程序化 3D 场景，无外部模型、贴图、音频或后端服务。

- `index.html`、`src/styles.css`：页面结构、交互界面与视觉样式。
- `src/main.js`：应用入口、渲染循环、镜头、交互、画质和生命周期编排。
- `src/cabin.js`、`forest.js`、`field.js`、`interior.js`、`seasonal.js`：木屋、林地、农田、室内与四季内容。
- `src/atmosphere.js`、`textures.js`、`utils.js`：氛围、程序化纹理和公共工具。
- `src/performance.js`、`scene-optimization.js`：画质档位、帧调度、资源释放与静态合批。
- `src/audio.js`、`audio-synthesis.js`、`audio-worker.js`：环境声状态机、PCM 合成与 Worker 入口。
- `tests/*.test.js`：Node 自动化测试；`preview*.png` 为预览素材。

新增场景元素应放入对应模块，复用 `utils.js` 和现有资源所有权约定，避免继续膨胀 `main.js`。

## 构建、测试与开发命令

使用 Node 22，版本见 `.nvmrc`。

```powershell
npm ci          # 按锁文件安装依赖
npm run dev     # 启动本地开发服务器
npm test        # 运行 tests/ 下全部 Node 测试
npm run build   # 生成 dist/ 生产构建
npm run preview # 预览生产构建
```

提交前至少执行 `npm test` 和 `npm run build`，并检查控制台错误。可用 `?quality=high|balanced|mobile|low` 固定画质，用 `?debug=1` 查看运行时快照。

## 编码风格与命名规范

- JavaScript 使用 ES Modules、两空格缩进和分号；函数与变量用 `camelCase`，构造函数用 `PascalCase`。
- 尺寸、颜色、动画速度和季节差异集中定义，避免散落的魔法数字。
- 代码注释、文档和提交信息使用中文；标识符、文件名、命令和 API 名称保持原文。
- 保持程序化资源策略；新增外部资源前说明体积、授权、缓存和加载失败处理。

## 测试指南

测试框架为 `node:test`，文件名使用 `*.test.js`，测试描述使用中文。当前无覆盖率门槛。测试应覆盖纯逻辑、资源所有权、调度和状态机；视觉、WebGL 错误、移动端布局、真实手机帧率及后台恢复仍需人工验收。渲染改动应检查四季切换、暂停恢复、室内外切换、自由镜头和画质切换。

## 提交与拉取请求

提交信息使用简短中文祈使句，例如“修复秋季落叶穿模”“完善音频后台挂起”。每次提交只包含一个主题，并排除 `dist/`、`node_modules/`、日志和凭证。

PR 应说明目的、影响模块和验证步骤；视觉变化附前后截图。存在 Issue 时关联。部署使用 Cloudflare Pages，生产分支为 `main`，构建命令为 `npm run build`，输出目录为 `dist/`。当前构建不需要环境变量，不要提交密钥。