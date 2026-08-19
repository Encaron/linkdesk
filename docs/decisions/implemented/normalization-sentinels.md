# 归一化全景审计 + 双机械哨兵（E5.8#6.6）

- **日期**：2026-08-19
- **状态**：implemented（E5.8#6.6 收官 commit ff3698c9）
- **背景**：AI 友好第 3 层表格的「唯一方式」无实证任务——jscpd/knip 抓不到硬编码 hex / 裸字符串。审计发现两处基线不可信：① `no-hardcoded-chinese` 规则作用域只有 `plugins/**`，`src/**` 中文从未被查；② hex 基线 294 处是「排除 themes 后仍含数据类」的毛计数。E5.7#45.5 教训：清完不防 = 又长回来。
- **决策**：
  1. **五类唯一方式 grep 实证**（颜色 var()/文字 t()/插件能力 plugin.json/跨插件通信 Registry/资产路径 getAssetPath）——当场修复或带理由豁免（不设基线放过）；豁免必须入账本（`归一化全景审计/审计账本.md`）。数据类豁免总纲：主题定义/i18n/取色器/Canvas/测试/dev preview +「颜色即数据」（色板/默认值）与「OS 层不可达」（主进程窗口背景）。
  2. **新增 `linkdesk/no-hardcoded-hex` ESLint 规则**（error 级）：拦字符串字面量 `#hex`。豁免 = path 白名单（themes/i18n/color-picker/canvas/test）+ `var(--x, #hex)` 回退串（合规形态）+ inline eslint-disable 带理由（账本凭据）。
  3. **`no-hardcoded-chinese` warn→error**（src+plugins 双块）：先扩覆盖 src/**（基线修正落实）再升级；规则盲区修复——`isInJsxContext()` 向上穿透 Conditional/LogicalExpression 链（`placeholder={cond ? "a" : "b"}` 不再漏报）。
  4. ⚠️ 教训：**flat config 同规则跨块合并会吞低 severity options**——#6.6 曾把 plugins/** 块的 chinese 规则移走替换成 src/** 块，导致 plugins 中文裸奔（check 捕获回归，恢复双块同 error）。
- **影响**：新代码颜色硬编码 hex / JSX 中文裸字符串 = ESLint error 拦截。豁免必须走账本白名单或 inline disable 带理由——「无理由豁免」将被哨兵挡回。审计账本 = 哨兵豁免白名单的凭据源。
- **Superseded by**：（无）
