/**
 * E6#111m／1.41：非样式命名空间归一的**改名映射数据**——「改名 ＋ 迁移」里的**唯一一份旧名清单**。
 *
 * 🔴 **一物两用，禁止第二份**：
 *   ① **运行时迁移**（`schemaMigrations` 的版本 7 那一步）读它把用户已存的旧名搬成新名；
 *   ② **清账轮执行器**（`scratch/rename-nonnaming.mjs`，1.42–1.48 用）读它去改官方仓的源码/manifest。
 *   两份分开写就是本轴花一整轮修掉的病根（手抄第二份清单必漂移）⇒ 执行器**没有**自己的表，
 *   它把本文件的 `RENAME_ROUNDS` 求值后当输入（[1.41] 作业包 §执行器）。
 *
 * ⚠️ **不是登记表 / 不是白名单 / 不是基线**（本轴禁区 4）：它只服务**迁移与改名**，
 *   **不许进任何门禁判定路径**——机械核 = `grep -n "renameMigrations" scripts/check-*.mjs` 应命中 0。
 *   判据见本格 §三「⑦ 映射表不是登记表」。
 *
 * 🔴 **顺手改名的面 —— 执行器必须先过一遍（承 CSS 系列 `css-rename-round-toolkit` 第 3 条）**：
 *   CSS 那边的六类面（定义点 / 渲染点 / scoped 选择器与注释 / 别仓消费点 / 只在渲染点存在的名 /
 *   表达式派生状态类）在本轴**对应的是**：声明面（`plugin.json`）· 运行时注册面（`registerCommand` /
 *   `contextKey.set`）· **消费面（别的仓与壳读同一名字）** · **`when` 子句与 `command` 字段** ·
 *   i18n 字典键（🔴 **本轴唯一保留的黄灯，永不在射程内**）。
 *
 * ── 数据来源（逐条给出处，不是推测） ──
 *   · `settings` = [03-任务-设置键归属评估 §10.2](../../../../docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/非样式命名空间归一化/03-任务-设置键归属评估.md)
 *     的 **19 键改名映射表**（1.33 产出）。形状 = 「只换第一段，词干零变化」。
 *   · `themeId` = 1.35 §十三 的 **9 配方 id**；`colorwayId` = 同处 **16 配色 id**。
 *     ⚠️ 配色那 **16 条本格不收进 `RENAME_ROUNDS`**：1.36 已把它们落成 `ThemeEngine/constants.ts` 的
 *     `COLORWAY_ID_MIGRATIONS` ＋ 读时归一，是**已经生效的机制**，重复登记 = 第二份清单。
 *   · `flag` = [07-任务-上下文旗子归属评估 §14.3](../../../../docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/非样式命名空间归一化/07-任务-上下文旗子归属评估.md)
 *     （1.37 产出）：`file-tree` 11 个（含**借来的 `inputFocus` 还回**）· `marketplace` 6 个 ·
 *     `serial-monitor` 2 个（**含死旗子 `serialSessionFocus` 的去留裁决，归 1.44**）。
 *     🔴 `settings` 的 4 个（`settingKey`/`settingFollowTheme`/`settingResetsToDefault`/`settingModified`）
 *     **不改名**——1.37 裁决走「宿主公开约定面」登记 ⇒ **本表不列它们**（列了就是逼 1.46 改它们）。
 */

/**
 * 一轮次（一仓）的改名集合。
 * `plugin` = 官方仓目录名（容器 `E:/linkdesk-plugins/official/<plugin>/`）。
 */
export interface RenameRound {
  /** 轮次号——与交接段队列表一致（1.42–1.48） */
  round: string;
  /** 官方仓目录名 */
  plugin: string;
  /** 命令 id：旧 → 新（只换第一段，词干零变化） */
  command: Record<string, string>;
  /** 设置键：旧 → 新 */
  setting: Record<string, string>;
  /** 上下文旗子：旧 → 新 */
  flag: Record<string, string>;
  /** 外观 id：旧 → 新（配方与配色分开——同一个键在两个空间各映各的，见 `ThemeEngine/constants.ts` 的两张表） */
  appearance: { recipe: Record<string, string>; colorway: Record<string, string> };
}

/**
 * 全部改名轮次。
 * ⚠️ **1.42 只装了 `settings` 那 19 条**（本格唯一走完整实证链的那一格）；
 *   命令 id / 旗子 / 主题 id 三栏**按轮次登记、随各格开工补齐**——本格不越界替 1.42–1.47 定案它们的逐条映射
 *   （那是各格任务书的正文，见 [12–18 档]）。🔴 **补的方式是往这里加数据，不是另建一张表。**
 */
export const RENAME_ROUNDS: RenameRound[] = [
  {
    // 1.42 清账 · file-tree（18 个设置键 ＋ 23 个命令 id ＋ 11 个旗子）＋ 1.43 清账 · editor（1 个设置键）
    // ——设置键 = 1.33 §10.2 的 19 行映射表；命令 id = 1.31 §二 的实况清单（声明 ∪ 运行时）；
    //   旗子 = 1.37 §14.3 的 11 行。三张表**逐行照搬**，形状 = pluginId + "." + 旧名去掉第一段。
    // 🔴 **同一条数据两轮共读**：本轮的 `command`/`flag` 两栏**只服务 1.42**（1.43 的 editor 仓
    //   两个空间都是空的——`files.autoSave` 是设置键）。1.43 开工时**往 1.43 自己的轮次加**，
    //   别把它的名字混进这一轮（混进来 = 1.42 的执行器会去 editor 仓找 file-tree 的名字）。
    round: "1.42+1.43",
    plugin: "file-tree",
    command: {
      // ── 声明面 contributes.commands[].id（21，`plugin.json`）──
      "explorer.newFile": "file-tree.newFile",
      "explorer.newFolder": "file-tree.newFolder",
      "explorer.openFile": "file-tree.openFile",
      "explorer.openToSide": "file-tree.openToSide",
      "explorer.openWith": "file-tree.openWith",
      "explorer.openFocused": "file-tree.openFocused",
      "explorer.openInTerminal": "file-tree.openInTerminal",
      "explorer.revealInOS": "file-tree.revealInOS",
      "explorer.copyPath": "file-tree.copyPath",
      "explorer.copyRelativePath": "file-tree.copyRelativePath",
      "explorer.cut": "file-tree.cut",
      "explorer.copy": "file-tree.copy",
      "explorer.paste": "file-tree.paste",
      "explorer.rename": "file-tree.rename",
      "explorer.delete": "file-tree.delete",
      "explorer.findInFolder": "file-tree.findInFolder",
      "explorer.refresh": "file-tree.refresh",
      "explorer.collapseAll": "file-tree.collapseAll",
      "explorer.openFolder": "file-tree.openFolder",
      "explorer.search": "file-tree.search",
      // ── 只在运行时注册（`registerCommand`，未进声明面）──
      "explorer.removeFolder": "file-tree.removeFolder",
      "explorer.closeAllEditors": "file-tree.closeAllEditors",
      // 🔴 还回借来的 `editor.*` 命名空间（本轴活体 1：由 file-tree 注册、却借 editor 前缀）
      "editor.selectForCompare": "file-tree.selectForCompare",
      "editor.compareWithSelected": "file-tree.compareWithSelected",
    },
    setting: {
      "explorer.sortOrder": "file-tree.sortOrder",
      "explorer.compactFolders": "file-tree.compactFolders",
      "explorer.expandSingleFolderWorkspaces": "file-tree.expandSingleFolderWorkspaces",
      "explorer.decorations.colors": "file-tree.decorations.colors",
      "explorer.decorations.badges": "file-tree.decorations.badges",
      "explorer.expandOnClick": "file-tree.expandOnClick",
      "explorer.autoReveal": "file-tree.autoReveal",
      "explorer.autoOpenDroppedFile": "file-tree.autoOpenDroppedFile",
      "explorer.incrementalNaming": "file-tree.incrementalNaming",
      "explorer.enableDragAndDrop": "file-tree.enableDragAndDrop",
      "explorer.confirmDelete": "file-tree.confirmDelete",
      "explorer.confirmDragAndDrop": "file-tree.confirmDragAndDrop",
      "explorer.excludeGitIgnore": "file-tree.excludeGitIgnore",
      "files.exclude": "file-tree.exclude",
      "explorer.fileNesting.enabled": "file-tree.fileNesting.enabled",
      "explorer.fileNesting.expand": "file-tree.fileNesting.expand",
      "terminal.external.windowsExec": "file-tree.external.windowsExec",
      "terminal.external.customCommand": "file-tree.external.customCommand",
      // ⚠️ 这一条属 editor（1.43）——表按「旧名 → 新名」建，与申报仓无关（同一段数据两轮共读）
      "files.autoSave": "editor.autoSave",
    },
    flag: {
      // ── 1.37 §14.3 的 11 行 —— `explorer*` 9 ＋ `viewHasSomeCollapsibleItem` ＋ 借来的 `inputFocus` ──
      explorerItemIsFile: "file-tree.itemIsFile",
      explorerItemIsDir: "file-tree.itemIsDir",
      explorerItemIsRoot: "file-tree.itemIsRoot",
      explorerResourceReadonly: "file-tree.resourceReadonly",
      explorerResourceCut: "file-tree.resourceCut",
      explorerClipboardEmpty: "file-tree.clipboardEmpty",
      explorerResourceMoveableToTrash: "file-tree.resourceMoveableToTrash",
      explorerFocus: "file-tree.focus",
      explorerViewletCompressedFocus: "file-tree.viewletCompressedFocus",
      viewHasSomeCollapsibleItem: "file-tree.viewHasSomeCollapsibleItem",
      // 🔴 还回借来的共享组件旗子（本轴活体 2）——**写点与读点（`plugin.json:150`）必须同笔**，
      //    漏读点 = 重命名时快捷键**静默失效**（不报错）。宿主侧一行不动（1.37 §14.3 裁决）。
      inputFocus: "file-tree.inputFocus",
    },
    appearance: { recipe: {}, colorway: {} },
  },
];

/** 摊平后的「旧名 → 新名」四张表——**空间之间不许合并**（同名不同空间会映错，见 constants.ts 两张表那条注释） */
export interface RenameMaps {
  command: Record<string, string>;
  setting: Record<string, string>;
  flag: Record<string, string>;
  recipe: Record<string, string>;
  colorway: Record<string, string>;
}

/** 摊平（后出现的轮次覆盖同键——同键两轮是数据错误，`selfCheckRenameMaps` 会报） */
export function flattenRenameRounds(rounds: readonly RenameRound[] = RENAME_ROUNDS): RenameMaps {
  const out: RenameMaps = { command: {}, setting: {}, flag: {}, recipe: {}, colorway: {} };
  for (const r of rounds) {
    Object.assign(out.command, r.command);
    Object.assign(out.setting, r.setting);
    Object.assign(out.flag, r.flag);
    Object.assign(out.recipe, r.appearance.recipe);
    Object.assign(out.colorway, r.appearance.colorway);
  }
  return out;
}

/**
 * 改名映射数据的自检——**数据自己的负控**（UI 变体：把任一条改坏 ⇒ 本函数抛）。
 * 它不进 `npm run check` 链（数据不是门禁输入，见文件头），跑法 = 单测调用它 ＋ 执行器开工时调一次。
 *
 * 判据四条：
 *   ① 新旧同名 ⇒ 那是空操作，必是笔误；
 *   ② 同一个旧名出现两次 ⇒ 摊平时会被静默覆盖（后出现者胜）⇒ 必红；
 *   ③ 新名相撞（两条旧名映到同一个新名）⇒ 改名轮会制造出重名；
 *   ④ 新名落进**别的**旧名值域 ⇒ 一轮改完与下一轮输入混在一起（顺序耦合）。
 */
export function selfCheckRenameMaps(rounds: readonly RenameRound[] = RENAME_ROUNDS): void {
  const maps = flattenRenameRounds(rounds);
  const spaces: Array<[string, Record<string, string>]> = [
    ["command", maps.command],
    ["setting", maps.setting],
    ["flag", maps.flag],
    ["recipe", maps.recipe],
    ["colorway", maps.colorway],
  ];
  for (const [space, table] of spaces) {
    const seenTargets = new Map<string, string>();
    for (const [oldName, newName] of Object.entries(table)) {
      if (oldName === newName) {
        throw new Error(`[renameMigrations] ${space}：旧名与新名相同（${oldName}）——空操作必是笔误`);
      }
      const prev = seenTargets.get(newName);
      if (prev !== undefined) {
        throw new Error(`[renameMigrations] ${space}：新名 ${newName} 被 ${prev} 与 ${oldName} 同时映到——改名轮会造出重名`);
      }
      seenTargets.set(newName, oldName);
    }
  }
  // ④ 跨轮顺序耦合：某轮的「新名」若正好是同一空间里另一条的「旧名」，摊平后谁先谁后都会吃掉一条
  for (const [space, table] of spaces) {
    for (const newName of Object.values(table)) {
      if (newName in table && table[newName] !== newName) {
        throw new Error(`[renameMigrations] ${space}：新名 ${newName} 同时是另一条的旧名——轮次顺序耦合`);
      }
    }
  }
}

/**
 * 从设置键「新名」反推「旧名」——**给用户自定义快捷键迁移用**。
 *
 * 为什么需要：`file-tree` 的 `plugin.json` 有一批 `when: "settingKey == '...'"` 形态的键位，
 * 而 `settingKey` 的**取值**就是设置键名 ⇒ 设置键改名后，用户 `keybindings.json` 里那份
 * `when` 子句里的旧键名会**静默失效**（与命令 id 失效同一种病，且同样没有任何报错）。
 *
 * ⚠️ **这不是「再写一份旧名表」**：同一条数据 `RENAME_ROUNDS[].setting` 的**派生视图**。
 *   「旧名 = 第一段 + 新名去掉第一段」是 1.33 §10.1 亲自定的形状 ⇒ 反推靠**形状**，
 *   靠的是「新名的第一段认得出是被换掉的那一段」。
 *
 * 🔴 **兜底方向 = 少映，不是猜**：反推结果必须**确实出现在本表某个旧名值里**才登记；
 *   认不出第一段（将来出现别的形状的改名）⇒ **整条跳过**，正向迁移照旧生效。
 *   猜错的后果是把一条**没被改名的**键当成旧名去改写用户的 `when` ⇒ 静默改坏，
 *   比「少迁一次」重得多（迁移漏一次下轮还会再来，改坏当场生效）。
 */
export function settingNewToOld(): Record<string, string> {
  const maps = flattenRenameRounds();
  const knownOld = new Set(Object.keys(maps.setting));
  const out: Record<string, string> = {};
  for (const [oldName, newName] of Object.entries(maps.setting)) {
    const dot = newName.indexOf(".");
    if (dot <= 0) continue; // 无段名 ⇒ 形状对不上，跳过
    const tail = newName.slice(dot); // 含前导点，例如 ".confirmDelete"
    const oldFirst = oldName.slice(0, oldName.indexOf("."));
    const derived = `${oldFirst}${tail}`;
    if (!knownOld.has(derived)) continue; // 🔴 兜底：推出来的旧名不认识 ⇒ 不登记
    out[newName] = derived;
  }
  return out;
}
