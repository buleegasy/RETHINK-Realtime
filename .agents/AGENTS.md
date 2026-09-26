# Project-Scoped Rules: RE-THINK Agent

## 1. Build & Deployment Rules
- **Optimize build performance**: When deploying to platforms like Cloudflare Pages, run the build command directly (e.g. `vite build`) instead of chaining slow type-checking commands (like `tsc -b`) to prevent environment deployment timeouts.
- **Maintain pristine lockfiles**: Always clean and regenerate `package-lock.json` when adding packages that clash with existing lock conditions to guarantee deterministic dependencies and avoid deployment-time install hangs.

## 2. Code Cleanliness & Zero Comments
- **Strictly No Comments**: 严禁在全项目任何代码与配置文件中添加或保留任何形式的注释（包括但不限于 `//`、`/* ... */`、JSDoc `/** ... */`、HTML 注释 `<!-- ... -->`、TOML/YAML `#` 等）。
- **Preserve Clean Code**: 新增、修改或重构代码时，必须移除所有解释性、注释性与占位代码片段，仅保留纯净、可执行的业务代码。

## 3. Git Commit Message & Trace Elimination
- **Zero Descriptive Text**: 严禁在 Git commit 标题或描述中写入任何架构变更、功能实现或技术选型描述，特别是严禁提及任何模型名称（如 OpenAI、千问、MiniMax 等）。
- **Empty Commit Invariant**: Git 提交统一使用 `git commit --allow-empty-message -m ""` 创建完全空白的提交信息，确保远程提交历史无痕迹。
