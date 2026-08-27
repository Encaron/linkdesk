# 外观 factoryRole 拍板记录（E5.8#48）

> 2026-08-27 用户拍板。对应清单任务：E5.8#48（Phase 10.5）。本文档 = 摸底清单 + 拍板记录。
> 拍板结论：**外观保留壳持、主题插件化**（对标 VS Code workbench）——#48 收口、#49 撤销、#50 移 E6。

---

## 一句话

**「外观该不该成为第三个可替换 factoryRole」——拍板：不。** 壳持有外观界面与接线（workbench 模型），主题做插件业务（已是现状）。#48 摸底收口，#49 随之撤销，#50 装配清单展望移 E6。

---

## 摸底清单（2026-08-27 整理，数据源 = 清单 #48 条目 + 代码实锤）

### ① 壳内现有外观业务（全部实锤）

| 类别 | 现状 | 落点 |
|:--|:--|:--|
| 配置 | `app.theme` / `app.themeColor` / `app.accentSource` / `app.accentColor` / `app.surfaceRadius` / `app.glassBlur` / `app.glassOpacity` / `app.glassTint` / `app.glassSaturate` / `app.backgroundImage` / `app.backgroundOpacity` / `app.backgroundMask` 注册 + onApply 接线 | `src/App/config/appearance.ts`（#50.10 玻璃态四配置同一接线模式） |
| onApply 产品规则 | 「换主题联动强调色」「切语言跨进程广播资源包」= 产品规则非机制 | `App.tsx:130-212` |
| 壳组件 | ThemeBrowser / LanguagePicker / ColorPicker | `src/components/` 壳共享组件 |
| 壳命令 | `selectTheme` / `selectLanguage`（settingsCommands.ts）+ `color-picker.pick`（App.tsx:220-232） | 壳命令面 |
| 空态兜底 | `registerFallbackThemes` 机制已存在 | `App.tsx:127` |
| 角色插槽 | factorySlots 现只有 settings / marketplace 两角色（FactoryRole 自由字符串——加角色零成本） | — |

### ② 外推后空态行为（本任务原需评估的第三项）

`registerFallbackThemes` 覆盖度已实锤可用（卸载主题插件 → 空态主题兜底，机制存在且 Phase 10 已验证）。外推与否不改变兜底机制本身。

### ③ 玻璃态消费方（2026-08-17 晚补充，已纳入）

`app.backgroundImage` / `app.glassOpacity` / `app.glassBlur` / `app.glassTint`（#50.10）与 theme/language/accent 同一 onApply 接线模式——玻璃态配置是**外观配置体系的自然延伸**，不是独立业务，外推它们 = 拆分壳最复杂子系统。

---

## 拍板（2026-08-27 用户）

**外观 = 保留壳持（VS Code workbench 同款），主题做插件业务。**

三条理由（用户确认）：

1. **哲学已站队**：2026-08-23 用户拍板「壳机制先行、玻璃主题业务做插件」——外观机制留壳、主题插件化，方向早已隐含。本拍板只是把隐性方向显性化。
2. **外推代价已远超立案时**：#48 立案于 2026-08-17（当时外观 = 5 配置 + 3 组件）；经 Phase 10 + 11.5-11.17，外观现为「完整外观配方 + 域贡献者 + 混搭 + 设置层 scale + 玻璃机制 + 浮层权威 + 圆角标尺」——壳内最复杂子系统。外推 = 高风险搬迁，回报（第三方可替换外观 UI）无现实消费方。
3. **VS Code 先例 = 用户自己的参照**：workbench 留外观 UI、主题插件化。LinkDesk 现状即此路，已走通（4 个真实主题插件 theme-songti/theme-terminal/theme-pill/theme-panorama = 证据）。

---

## 连带决策

- **E5.8#49 外观外推执行 → 撤销**（2026-08-27 用户拍板）。纯依赖 #48 的执行任务；#48 拍壳持 → #49 无执行对象。**若未来方向反转（出现真实第三方外观 UI 需求），#48 拍板可复议、#49 可复活**——本记录即复议依据。
- **E5.8#50 装配清单 profile 设计 → 移 E6**（2026-08-27 用户确认「#50 肯定是要做的」）。E5.8 Phase 10.5 收束，#50 挂 E6 插件生态排期。见下方链接。

---

## 参照与决策轨迹

- **参照**：VS Code workbench（外观界面留壳 + 主题插件化）；LinkDesk factoryRole 先例（settings / marketplace 两角色——FactoryRole 自由字符串，加角色零成本）。
- **轨迹**：2026-08-17 立案 #48（dsh 收敛深潜第二落点）→ 2026-08-23 用户「壳机制先行、玻璃主题业务做插件」拍板（方向隐含）→ Phase 10 + 11.5-11.17 壳内加固外观系统 → 2026-08-27 用户问 Phase 10.5 去留 → AI 评估报告（#48=决策门非玻璃任务）→ **用户拍板「拍壳持收口」** → 本文档落盘 + #49 撤销 + #50 移 E6。
- **相关**：[00-dsh借鉴档案.md](../00-dsh借鉴档案.md)（#47-#50 立项依据）· [02-外观玻璃态设计.md](02-外观玻璃态设计.md)（玻璃态机制，已归 Phase 10 阶段 1）· [E6 执行清单](../../E6_插件生态与发布/E6-执行清单.md)（#50 新家）

---

> **← 上一层：** `./README.md`（Phase 10.5 开工说明）
