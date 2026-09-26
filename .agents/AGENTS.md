# Project-Scoped Rules: RE-THINK Agent

## 1. Build & Deployment Rules
- **Optimize build performance**: When deploying to platforms like Cloudflare Pages, run the build command directly (e.g. `vite build`) instead of chaining slow type-checking commands (like `tsc -b`) to prevent environment deployment timeouts.
- **Maintain pristine lockfiles**: Always clean and regenerate `package-lock.json` when adding packages that clash with existing lock conditions to guarantee deterministic dependencies and avoid deployment-time install hangs.

## 2. Code Cleanliness & Zero Comments
- **Strictly No Comments**: 严禁在项目中编写任何形式的代码注释（包括单行注释 `//`、多行注释 `/* ... */`、JSDoc `/** ... */`、HTML 注释 `<!-- ... -->` 等）。
- **Preserve Clean Source**: 在编写新代码、重构逻辑或修改现有文件时，若遇到现有注释应一并清理，输出的代码必须保持极致精简，不留任何解释性或标记性文字痕迹。
