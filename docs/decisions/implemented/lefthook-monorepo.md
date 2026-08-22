# lefthook 接入的 monorepo 方案（LEFTHOOK_CONFIG 注入 + job root: linkdesk）

- **日期**：2026-08-19
- **状态**：implemented（E5.8#3 收官 commit b075ad6b）
- **背景**：仓库布局是 monorepo——git root = `E:/linkdesk`（仓库根），`package.json`/`eslint.config.js` 在 `linkdesk/` 子目录。lefthook 2.x 有三个硬行为与这种布局冲突：
  1. `lefthook install` 从 git root 找 `lefthook.yml`——不带配置时会在 git root 生成一份**全注释默认模板**（无任何阶段 → 只装 prepare-commit-msg 一个 hook，jobs 静默不跑）；
  2. git 触发 hook 时 lefthook 进程 cwd = git root，且**不携带** install 时的 env；
  3. job 命令**强制在 git root 跑**——`npx eslint` 找不到 `linkdesk/eslint.config.js`、`npm` 找不到 `package.json`。
- **决策**：
  1. 真实配置放 `linkdesk/lefthook.yml`（跟 package.json 同目录）——install 与 hook 触发都靠 `LEFTHOOK_CONFIG=linkdesk/lefthook.yml`（相对 git root 解析）；
  2. `scripts/install-lefthook.mjs`（postinstall 自动装）把 `export LEFTHOOK_CONFIG` **注入 lefthook 生成的 hook 脚本**（幂等补丁）——解决 git 触发时 env 缺失；
  3. lefthook.yml 所有 job 加 `root: linkdesk`——job 在 linkdesk/ 跑，`{staged_files}` 相对 root 展开（实测 eslint 正确收到 `src/...`）。
- **影响**：E5.8#3 之后的开发者改 lefthook 配置 = 改 `linkdesk/lefthook.yml`；`lefthook install`/hook 触发均无需手动传 env（脚本处理）。**未来若改 hook 结构**：必须保持 install 带 LEFTHOOK_CONFIG + hook 脚本注入 + job root 三件套，缺一即静默空跑。
- **Superseded by**：（无）
