# @linkdesk/marketplace-kit

LinkDesk 市场数据作者工具包——写、校验、初始化 `marketplace.json` / `authors/<id>.json`，并给付费插件签发许可密钥。运行在**作者机器 / CI**（devDependency），⛔ 不并入 `@linkdesk/contracts`（那是运行时面，会装进用户机器）。

正典：`docs/04-软件更新/已落地/Marketplace-Store/11-作者模板与marketplace-kit.md`（任务 K1–K5/K12）；分类封闭名单正典 = 同目录 `04-分类体系.md` §5.1。

## 安装

```bash
npm i -D @linkdesk/marketplace-kit
npx marketplace-kit --help
```

## 三种作者形态（先选形态，再动手）

| 形态 | 仓库内容 | 你要做什么 |
|---|---|---|
| **L0 单插件** | 只有 `plugin.json` | 什么都不用加——仓库地址粘进商店「添加源」即得 1 个插件 |
| **L1 多插件** | `plugin.json`×N ＋ 根 `marketplace.json` | `npx marketplace-kit init` 生成骨架 → 填 `plugins[]` |
| **L2 独立市场仓** | `marketplace.json` ＋ `authors/<authorId>.json` | `npx marketplace-kit init --author <GitHub用户名>` 生成骨架 |

⚠️ **L0 仓不要手写根 `marketplace.json`**——市场回落链看到它（哪怕空 `plugins[]`）就不再读 `plugin.json`，你的插件会从商店里消失。L0 仓要作者主页请用 `init --author`（只补 `authors/<id>.json`）。

## 命令

### validate

```bash
npx marketplace-kit validate ./marketplace.json   # 单文件
npx marketplace-kit validate ./                   # 整目录（含跨文件合集引用检查）
```

- 结构/未知字段/封闭集合 → **error**（退出码 1）。schema 与 `@linkdesk/plugin-sdk` 的 `marketplace.schema.json` 字节同源——kit 拒的 = 市场 parse 拒的。
- 语义问题 → **warning**（退出码 0），错误码与商店「声明提示」同一套：`unknown-category` / `unknown-subcategory` / `unknown-rail-category` / `missing-entry-field` / `duplicate-hero` / `missing-collection`。分类写了名单外的值时，报错信息**直接列出可用清单全表**（不用翻文档）。

### init

```bash
npx marketplace-kit init                          # L1 骨架（或 L0 时只给指引，不写文件）
npx marketplace-kit init --author your-name       # 补 authors/<id>.json（L2 独立市场仓）
```

`init` 不覆盖已有文件。生成物带 `$schema` 引用，VS Code 里即时补全与红波浪线。

### keygen / sign-license（付费插件作者）

```bash
npx marketplace-kit keygen --author your-name
# 私钥 → your-name.private.key（0600；⛔ 不进 git、不外传；丢了换钥 = 旧密钥全失效）
# 公钥（裸 32 字节 base64）→ 粘进 authors/<id>.json 的 publicKey 字段

npx marketplace-kit sign-license --key your-name.private.key --plugin demo-plugin \
  [--machine <买家machineFingerprint>] [--exp 2027-12-31 | 30d | 12w | 6m | 1y]
```

许可密钥格式 `v1.<payload>.<signature>`（Ed25519 离线验签），买家粘贴进商店「我有密钥」即完成验证。`--machine` 给了 = 一机一码（指纹在壳「本机信息」里）。退款/换钥由你的销售渠道负责，商店只展示。

## 目录约定

- `schemas/` —— `marketplace.schema.json`（与 `@linkdesk/plugin-sdk` **字节同源**，测试钉死）＋ `authors.schema.json`（从 SDK schema 的 `$defs` 机械派生，测试钉死）。
- `templates/` —— `init` 的三形态骨架。
- `examples/` —— `min.json`（最小）/ `full.json`（全量）/ `authors.json`（作者块），全部过 `validate`。

## 发布纪律（K7）

- 本包**独立版本**（不动根 package.json、不动壳版本）。
- **动了 `schemas/`、`templates/`、`examples/`、`src/` 任何作者面内容 = 必须发版**——`npm run check` 的 `check-npm-release` 黄灯会盯着（表面清单见 `scripts/check-npm-release.mjs` 的 `PACKAGES[]`）。
- 发版照 `docs/06-发布管理/作者轴npm发版.md` 五步：bump → publish（显式官方 registry）→ `npm run release:mark` → version ＋ `scripts/npm-release-state.json` 同笔提交。
