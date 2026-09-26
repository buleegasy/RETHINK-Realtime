# Project-Scoped Rules: RE-THINK Agent

## 1. Build & Deployment Rules
- **Optimize build performance**: When deploying to platforms like Cloudflare Pages, run the build command directly (e.g. `vite build`) instead of chaining slow type-checking commands (like `tsc -b`) to prevent environment deployment timeouts.
- **Maintain pristine lockfiles**: Always clean and regenerate `package-lock.json` when adding packages that clash with existing lock conditions to guarantee deterministic dependencies and avoid deployment-time install hangs.

## 2. Git Commit Message & Trace Elimination
- **Zero Descriptive Text**: 严禁在 Git commit 标题或描述中写入任何架构变更、功能实现或技术选型描述，特别是严禁提及任何模型名称（如 OpenAI、千问、MiniMax 等）。
- **Empty Commit Invariant**: Git 提交统一使用 `git commit --allow-empty-message -m ""` 创建完全空白的提交信息，确保远程提交历史无痕迹。
