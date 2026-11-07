# 设置页入口列表加图标（两轴：插件组 marketIcon ＋ 本体组声明 icon）

> 立案：2026-11-07（用户点名）。**用户原话**：设置页左侧各设置页入口列表（「编辑器」「资源管理器」等）建议加图标——「这个图标就是插件市场展示的图标」，文字＋图标可快速定位；**同时着重考虑**：本体自注册的组（「通用」「主题」「AI接入」「默认打开方式」）没有现成图标，「如果要给他们做图标，那就意味着更新软件——对于没有图标的怎么显示，你有没有考虑」。
> 状态：📋 **立案（调查已完成 · 两轴任务已布置，待实施）**。归属：**04 待抉择池立整夹**（settings 仓 ＋ 壳仓交织，归属规则 2026-10-04）；分两波——第 1 波纯 settings 仓（插件轴快）；第 2 波壳声明（随 0.2.53 攒批）。

| 项 | 值 |
|:--|:--|
| 主战场 | settings 插件仓 `E:\linkdesk-plugins\official\settings`（左侧导航）＋ 壳仓 `src/App/startup.ts`（本体组声明） |
| 现成可吃 | 组数据自带 `pluginId`（settings 仓 `src/views/SettingsView/types.ts:12-14` `GroupInfo`）；manifest icon/marketIcon 经 `plugins.listAll()` 现成可达（零新 API）；壳共享件 `PluginIcon`（`@linkdesk/ui`，PluginCard 同款）负责路径解析/形态/默认兜底 |
| 本体组声明位 | 壳仓 `src/App/startup.ts:94-102`（核心配置分组注册——与插件同一套声明机制，加 icon 字段即同构） |

## 一、现状（2026-11-07 侦察）

- 左侧导航 = 设置插件的分组列表，数据源：本体声明组（`startup.ts:94` 起，「通用」「主题」「AI接入」「默认打开方式」…）∪ 插件贡献组（各插件 config 声明，`GroupInfo.pluginId` 指回来源插件）。
- 导航行目前纯文字——无图标位。
- 插件组 ⇒ 其来源插件**必已安装**（组由已装插件的声明长出来）⇒ `plugins.listAll()` 的 manifest 必含它 ⇒ icon/marketIcon 现成；marketIcon 由 publish 自动 URL 化（E6#106），已装态 icon 相对路径经 `linkdesk://` 可达——`PluginIcon` 共享件已封装这两条路径解析＋无图默认彩色块（PluginCard 同款兜底）。
- 本体组 ⇒ `startup.ts` 声明里**没有 icon 字段**——这就是用户指出的缺口。

## 二、两轴设计

### 轴 1（第 1 波 · settings 仓 · 插件轴快）：导航行加图标位

1. 组数据装配处补 icon 解析：`pluginId === 本体组` → 走轴 2 声明（0.2.53 前用临时 codicon 映射表，见下）；插件组 → `listAll()` manifest 取 `marketIcon ?? icon` → `PluginIcon` 渲染。
2. 导航行布局：图标 16px ＋ 文字（`PluginCard`/市场行同款尺寸语言）；无图插件走 `PluginIcon` 默认彩色块（**有图显图、无图显块，不空位**）。
3. 本体组临时 codicon 映射表（插件侧过渡，0.2.53 后由轴 2 声明接管并删表）：通用=`codicon-settings-gear`、主题=`codicon-paintcan`、AI接入=`codicon-hubot`、默认打开方式=`codicon-list-tree`（实装时按 codicon 实际库存微调）。
4. 用户问的「没有图标的怎么显示」答案：**三态**——插件组无图 → `PluginIcon` 默认彩色块；本体组 → 0.2.53 前临时 codicon、后由声明接管；都不留空位（空位 = 视觉节奏破碎，比「无图标」更难看）。

### 轴 2（第 2 波 · 壳仓 · 随 0.2.53 攒批）：本体组声明补 icon 字段

- `startup.ts` 本体组声明加 `icon`（codicon 名即可——壳组用线性 codicon 与插件彩色 marketIcon 形成「本体/插件」的天然区分，也免做图）。
- 宿主组 schema（作者面无关——本体组不进作者 schema；宿主 `ConfigProperty`/组声明类型同笔）＋ settings 插件改读声明 icon（删临时映射表）。
- 三方消费不变：齿轮「复制设置名称」等既有面零影响（icon 纯展示元数据）。

## 三、任务布置（新 AI 接手直接按此做）

| 波 | 仓 | 任务 |
|:--|:--|:--|
| 1 | settings 仓 | ① `loadSettingsData`/组装配处接 `plugins.listAll()` 建 pluginId→manifest 映射；② 导航行加 `PluginIcon`（16px）＋本体组临时 codicon 表；③ CSS：行高/对齐/选中态适配（照 `check-spacing-grid`）；④ dev:real 真机环迭代（**用户看屏裁决**）→ 三门 → 发版（PATCH）→ 目录收录（不随包） |
| 2 | 壳仓 | ① `startup.ts` 本体组声明补 icon（四组 codicon 定稿）；② 类型/schema 同笔；③ 随 0.2.53 攒批（@linkdesk/ui 无需动——PluginIcon 已有）；④ 出货后 settings 仓删临时映射表改读声明（又一刀插件版） |

## 四、验收判据

1. 插件组行显该插件市场图标（marketIcon 优先、icon 回退、无图默认块）——编辑器/资源管理器/串口监视器实测。
2. 本体组行显图标（轴 2 后）——四组逐一；轴 2 前显临时 codicon 不空位。
3. 亮/暗主题＋`--ui-scale` 拉一档不破格；选中态/搜索过滤态图标不抖动。
4. 零新 IPC/零新契约（listAll 现成）；`npm run check` 全绿两仓。
