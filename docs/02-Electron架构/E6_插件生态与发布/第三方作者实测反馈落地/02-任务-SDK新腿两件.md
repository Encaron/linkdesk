# 02 · 会话三（AI-B）：SDK 新腿两件 —— `E6#136`–`#137`

> **开工闸门**：🔴 **等会话一（AI-A）把 SDK 0.1.43 发完再开工**（两腿基于 0.1.43 发 0.1.44——SDK 版本串行，防并发发版撞号）。开工前去 `交接.md` 顶部确认会话一已收尾。
> **本会话动谁**：`packages/plugin-sdk`（两腿）＋ 官方插件仓 **至多两个**（`serial-monitor`、`settings`，见 §二）＋ 维护者面文档（判据段落）。**⛔ 不碰** `geme-tihu-bicycle`（第三方仓，见 §二禁区）、**不碰** 壳 `src/`/`electron/`、**不碰** `packages/create-linkdesk-plugin` 与 `packages/plugin-docs`（除非 #136 判据文档必须进作者面树——见 §一联动，先在交接段声明再动）。
> **两腿共同的纪律**：① 新腿 `--self-test` **同批接进壳仓 `npm run check`**（memory `gate-selftest-must-be-wired`——不接线的自测自己就是假门禁）；② **18 仓存量先普查后判红**——⛔ 不许「上腿即全红」；③ 口径锚词照 `E6#112 锚⑨` / `E6#119 锚⑩` 先例；④ **判据不许为凑绿放宽**（memory `gate-idle-vs-zero-violation`）——存量走逐处裁决或带理由的豁免注释，不改判据。

---

## §一 `E6#136` TSX 悬空类名腿（窄口子）

### 前因

第三方作者在 CSS 头注释里写了 `--text-*/--accent`——其中 `*/` 把块注释**提前闭合**，后面的注释文字变成垃圾语法，把紧随其后的 `.geme-tihu-bicycle-root` 规则**整条吞掉**。PostCSS/Vite 解析全程零警告；TSX 里引用该类名的规则照旧在跑，样式就是不生效——靠逐条浏览器截图比对才发现。

**为什么现有三条腿都没接住**（这正是缝隙所在，[dangling-names.ts 头注](../../../../packages/plugin-sdk/src/eslint/checks/dangling-names.ts)写得很清楚）：

| 现有腿 | 管什么 | 为什么没接住 |
|:--|:--|:--|
| `dangling-names`（E6#119，0.1.40+） | 源码喊的 **`ldk-*` 名** ＋ 关键帧悬空 | 头注明写「**非 `ldk-` 的未定义名不计悬空**（自有命名空间 / DOM 钩子 / 第三方内联）——假红比漏报更坏」⇒ 自有前缀类名**有意宽松掉** |
| `keyframe-refs`（E6#112） | `animation:` 引用的关键帧名 | 只管关键帧，不管类名 |
| 壳侧 `audit:plugin-dead-css`（E6#113） | 定义了、源码没人用的自写类（**死类**） | 反方向；「用了没定义」不在射程 |

规则被注释吞掉 = 「TSX 引用了、CSS 里没了」——恰好落在三条腿的口径缝隙中央。本格把这条缝补上。

### 修哪里

- 新腿文件：`packages/plugin-sdk/src/eslint/checks/` 新增 `dangling-own-classes.ts` ＋ `dangling-own-classes.test.ts`（照 `dangling-names.ts`/`keyframe-refs.ts` 的文件形态与导出惯例）。
- preset 注册：SDK eslint preset（`scan.ts` / index 导出处，照 E6#112/E6#119 两腿当年的接线点）。
- 判据正文：维护者面 [11-样式命名空间审计.md](../01-插件独立构建/11-样式命名空间审计.md) 判据表加一行 ＋ [05-插件UI写法规约](../../../03-插件制造/05-插件UI写法规约.md) 对应节提一句（⚠️ 动这两份后跑 `sync:plugin-agents --check` 自证）。
- 口径锚：本腿与既有锚词块（`dangling-names.ts` 的「口径锚词」节）各断言一遍——**锚⑩ 模式**：改一边不改另一边必红。

### 怎么修（判据写死，不许走样）

1. **射程**：扫描插件仓 `src/**/*.{ts,tsx}`（`scan.ts` 的 SKIP_DIRS 已排 node_modules/dist，测试/mock 文件照既有各腿口径跳过——`isTestOrMockRel`）里 `className` 的**字符串字面量**；抽出其中以**本插件 pluginId 前缀**（`<pluginId>-`）开头的类名。
2. **判定**：每个被引用的自有前缀类名，必须能在本仓自有 CSS（`src/**/*.css` 全量定义集）里找到定义；找不到 ⇒ 红，报错文案给出「常见根因」指路（类名拼错 / 样式文件漏 import / **CSS 块注释被 `*/` 提前闭合吞掉规则**——把本次事故写进文案，作者一读就懂）。
3. **跳过并计数（假红比漏报更坏，口径与 dangling-names 逐字同源）**：动态拼接（模板字符串插值、`clsx(...)`/字符串相加、`className={变量}`）一律**跳过并计数**——静态读不出运行时拼出来的名字，拦就是假红。
4. **只查自有前缀**：非本插件前缀的类名（`ldk-*` 借用归 `plugin-prefix` 腿、宿主保留名归 `reserved-classes` 腿、DOM 全局名/第三方内联）**一律不进本腿射程**——本腿是既有口径的**补缝**，不是第二把全能尺子。
5. **自测**：`--self-test` 覆盖至少五例——正常引用过 / 注释吞规则形态（本格的根因案）/ 动态拼接跳过 / `ldk-*` 名不归本腿 / 无 CSS 纯数据仓跳过。接进壳仓 check。

### 18 仓存量普查（判红前必做）

- 用新腿对 18 仓全跑一遍（`npm run lint` 逐仓或 SDK `lintFiles` 批量）。**预期接近零**（四轴收口时类名轴 18/18 零不合规），动态拼接会被跳过。
- 若有命中：**逐处裁决**（照 #113 死类清账的纪律：三条证据在案、⛔ 不许批量删/批量改）——是拼错就修仓，是有意形态就在那仓加 disable 注释写理由。
- 普查读数（几仓几处、裁决结果）写进清单格回写段。

### 验收

- `--self-test` 五例全绿 ＋ 接进壳仓 check；18 仓普查读数在案（红 0 或逐处裁决完）。
- 根因案回归：把那次「注释吞规则」的最小复现（注释里含 `--text-*/`）塞进测试仓跑一遍，本腿红且文案指对根因。

### 版本与连带

- SDK **0.1.43 → 0.1.44**（与 #137 同批）；CHANGELOG 同笔。
- 判据文档两份若动 → `sync:plugin-agents --check`；**不动 `docs/03-plugin-authoring/**`（作者面英文树）**——若判据必须让作者面知晓，并进会话二的 #138 在交接段声明（默认不动：规约本身早已在作者面 05 号，本格只是加机械面）。

---

## §二 `E6#137` window keydown 全局监听腿（含官方 2 仓逐处裁决）

### 前因

作者面文档 [05-ui-conventions.md §4.2](../../../03-plugin-authoring/05-ui-conventions.md) 早已定案键盘两轨制：声明式 keybindings（非文本键）＋ **pool 侧自处理**（容器 `onKeyDown` + `tabIndex`，DOM focus 天然分区）；§速查表（777 行）明写 **document/window keydown is forbidden**，反模式段落还留着历史案（serial F2 劫持 file tree F2）。E6#73n 甚至专门撤过「键盘导航现成」的不成立承诺。**但规约只是文档——SDK 没有任何腿拦它**（checks 全表无 keyboard 相关）。文档禁令没有机械面 = 空转判据。

第三方作者实测即写了 `window.addEventListener("keydown")` + `isActive` 手动 gate——不知道规约存在。核对会话随即对 18 仓摸底，**官方仓自己命中 3 处**：

| 仓 | 位置 | 形态 |
|:--|:--|:--|
| `geme-tihu-bicycle`（**第三方**） | `src/index.tsx:272–273` | 游戏 keydown/keyup（作者不知道有规约） |
| `serial-monitor`（官方） | `src/components/SearchBar.tsx:35`、`:53` | 两处 window keydown（搜索场景） |
| `settings`（官方） | `src/views/keybinding-settings/useKeybindingEditor.ts:96` | **capture=true** 抓按键（快捷键**录制器**——输入被吞前抓原始键的形态） |

⇒ 这条腿不是对第三方作者的苛求，是工程自己的欠账。**但录制器形态（settings）可能是有正当性的豁免**——所以本格判据里必须留豁免出口，且官方仓整改走**逐处裁决**，⛔ 不许批量改。

### 修哪里

- 新腿：`packages/plugin-sdk/src/eslint/checks/no-global-key-listener.ts` ＋ `.test.ts`（照 `no-module-level-ipc-listener` 在壳仓的形态、SDK 侧照 `ui-css-import.ts` 等单规则腿的文件惯例）。
- preset 注册（同 §一接线点）。
- 判据正文：[05-插件UI写法规约](../../../03-插件制造/05-插件UI写法规约.md) 键盘节加一句「有腿了」；作者面不动（规约早已在 05-ui-conventions §4）。
- 官方仓整改：`serial-monitor`、`settings` 两仓（改动才 bump）。

### 怎么修（判据写死）

1. **规则**：插件仓 `src/**` 里 `window.addEventListener("keydown"|"keyup")` / `document.addEventListener("keydown"|"keyup")`（含 `'` 单引号字面量）⇒ 红。报错文案**教正解**（插件自由制造——不是只堵）：「focus 分区正解 = 容器 `onKeyDown` + `tabIndex={0}`（见作者面 05-ui-conventions §4.2）；确需全局抓键的正当形态走 `eslint-disable` + 行尾理由」。
2. **豁免出口**：`eslint-disable linkdesk/no-global-key-listener` 行注释 ＋ 理由——照「内容画布」现行豁免模式。**判据本身无白名单**（无硬编码名单制豁免）——settings 录制器若裁决为正当，走 disable 注释写理由，不动判据。
3. **官方 2 仓逐处裁决**（每处三条证据在案，⛔ 不许批量改）：
   - `serial-monitor` SearchBar 两处：先读代码确认场景——若按键消费时焦点必在搜索框内 ⇒ 迁移到容器 `onKeyDown`（真迁移，PATCH bump 1.0.21 ＋ CHANGELOG ＋ 重发 ＋ 官方目录收录）；若确属「焦点在任何地方都要响应」的正当形态 ⇒ disable ＋ 理由，不 bump。
   - `settings` 录制器一处：录制器要在输入被吞前抓原始键，`container onKeyDown` 可能不够——大概率正当豁免（capture=true ＋ 理由注释）。**裁决结论与证据写进清单格回写段**。
4. **geme-tihu-bicycle（⛔ 禁区）**：第三方仓**本工程不代改**。腿落地后它 CI 会红——在清单格回写段与 `交接.md` 各留一行「待转达作者」：正解已在报错文案里，等他下版自修。**不许**替他发版、不许收录他的仓。
5. **自测**：`--self-test` 覆盖——window/document 两形态红、单双引号、`addEventListener("keydown", fn, true)`（带 capture 参数）也红、disable 注释放行、正当容器 onKeyDown 不红。接进壳仓 check。
6. **判红顺序（⛔ 不许上腿即全红）**：SDK 腿落地 ＋ 2 官方仓裁决**同会话内完成**——保证 0.1.44 发布时 18 仓 CI 全绿（geme-tihu-bicycle 除外，它不在官方 CI 面内）。

### 验收

- `--self-test` 全绿接 check；SDK 0.1.44 发出后 18 官方仓 CI 逐仓 `success`（照 L7 封层的 `ls-remote`＋CI 验法）；裁决读数在案。
- settings 若属种子且 bump ⇒ `npm run sync:bundled` 追新（⚠️ 种子指纹门禁 `check-bundled-freshness` 会查）。

### 版本与连带

- SDK **0.1.44**（与 #136 同批）；`serial-monitor` 按裁决结果 PATCH（1.0.20 → 1.0.21 或不动）；`settings` 同理（现值+1 或不动）。发版/推送要用户点头（老规矩）。
- **官方目录收录**：凡 bump 重发的仓，照「两步走」把目录条目更新（memory `plugin-source-external-repos`：publish 只写自己仓，**官方目录收录才默认可见**）。

---

## §三 本会话收尾清单

1. `npm run check` 全绿（两腿 `--self-test` 已接线）。
2. SDK bump 0.1.44 ＋ CHANGELOG ＋ lock ＋ `npm publish`（🔴 用户点头）＋ 现场证（memory `sdk-published-not-equal-enforced`）。
3. 官方仓裁决与发版读数逐格回写 E6 清单；`交接.md` 顶部追加接力段（含「geme-tihu-bicycle 待转达作者」一行）。
4. 两腿判据在维护者面文档的段落落笔 ＋ `sync:plugin-agents --check` 自证。
5. **本层收口报告**：会话三是本层最后一棒——回写段里出本批简短收口（九格读数汇总 ＋ 残余边界 ＋ 待拍板三格现状），格式照 L8 第 7 格的收口惯例。
