/**
 * 壳首选项命令——设置/主题/语言/快捷键。
 * E5#44-3：从 coreCommands.ts 提取。
 */

import { registerCommand, type Command } from "../../registry/commands/CommandRegistry";
import { registerMenuItems, MENU_SLOTS } from "../../registry/commands/MenuRegistry";
import { factorySlots } from "../../services/bootstrap/FactorySlots";
import { setConfigurationValue, resetConfigurationValueBatch, inspectConfiguration } from "../../services/configuration/ConfigurationService"; // E5.8#50.24：复位命令单一写入点；inspectConfiguration = AI#66 写入回执（写前/写后都在这一条链上读）
import { getMergedSchema, type ConfigurationProperty } from "../../registry/ConfigurationRegistry"; // AI#66：写入前按声明面校验（键是否声明／类型／枚举／上下界）
import { MIX_SOURCE_KEYS } from "../../services/ui/ThemeEngine"; // E5.8#90：混搭来源 key 全集——theme.resetMix 批复位用（单一来源）
import { getCallbacks } from "../infra/CoreCallbacks";
// E5.5#7-p15：CUSTOM_EVENTS.SHOW_THEME_BROWSER / SHOW_LANGUAGE_PICKER 不再使用——走 QuickPickService
import { openKeybindingsSettings } from "../../registry/commands/KeybindingRegistry";
import { requestSettingsGroup, requestScrollToSetting } from "../../registry/ConfigurationRegistry";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import { shellEvents } from "../../react/events/ShellEvents";
import { getFloatingPanelViewId, getTabCreatableViews } from "../../../pluginLoader/contributions/viewRegistry";
import { resolveFloatingPanelOpenForm } from "../../services/ui/floatingPanelForm";

/* ── M2 生长格 `AI#66`：**通用配置写**（`workbench.action.setConfiguration`，读侧 = `AI#62` 的 `getConfiguration`）──
 *
 * 🔴 为什么要有它：`AI#62` 把配置**读**面补齐后，写面只剩「专用命令」——`resetSetting`（回默认，
 *    带确认框）/ `followTheme`（删用户覆盖）/ 设置页 UI。门外 AI 要「把外观模式改成自定义」只能
 *    直接改 `{userData}/settings.json` 文件（实测 80ms 生效，但改了什么得自己猜形状、写坏了没有守卫）。
 *    本命令 = 与读面**对称**的一条正门：按声明面校验后写 user scope，并回执写入前后值。
 *
 * 🔴 拒写面（两道，都是「门外 AI 不该自己开自己的门」这一类）：
 *    ① `ai.` 前缀（AI 接入族：门锁 `ai.mcp.enabled`/`ai.cli.enabled`、万能钥匙 `ai.debug.remoteDebugging`、
 *       账本开关 `ai.auditLog.enabled`）——让被管的那个改门锁/钥匙/账本，这道门就是装饰；
 *    ② 声明面标了 `renderHint: readonly|action` 的键——它们是显示槽（状态行/按钮），不是设置值。
 *
 * ⚠️ **不进 `askFirst` 名单**（`electron/services/aiBridge/sensitive.ts` 的入选判据）：改设置可撤销、
 *    改动前有 `getConfiguration` 可读回原值 ⇒ 照「门要稀」的既有裁决不算敏感动作。拒写面才是这里的门。
 */
const WRITE_BLOCKED_PREFIXES = ["ai."];
const WRITE_BLOCKED_HINTS = ["readonly", "action"];

/** 拒写回执——**载荷里出声**（与读面 `badArg` 同形：⛔ 不抛异常，免得 AI 写错键名给用户弹红 toast）。 */
function writeRefusal(
  key: string | null,
  reason: string,
  error: string,
): { key: string | null; applied: false; reason: string; error: string } {
  return { key, applied: false, reason, error };
}

/**
 * 取 `{ key, value }`——兼容两种调用形：单具名对象 `{"key":"…","value":…}`（声明面的那一种）
 * 与逐位 `("…", 值)`。两形等价，照读面 `pickStringArg` 的先例。
 * @returns 取不齐（缺 key / 缺 value）⇒ `null`（调用点转成载荷里的报错）
 */
function pickWriteArgs(args: unknown[]): { key: string; value: unknown } | null {
  const first = args[0];
  if (first !== null && typeof first === "object" && !Array.isArray(first)) {
    const o = first as Record<string, unknown>;
    if (typeof o.key === "string" && o.key.trim() && "value" in o) return { key: o.key.trim(), value: o.value };
    return null;
  }
  if (typeof first === "string" && first.trim() && args.length >= 2) return { key: first.trim(), value: args[1] };
  return null;
}

/** 值形状的短描述（报错里回显用——`JSON.stringify(undefined)` 是 `undefined` 而不是字符串，单独兜） */
function describeValue(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** 写入回读的**对账判据**：原始值 `Object.is`，数组/对象按 JSON 形状比（设置值都是可 JSON 化的声明数据） */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * 写入前的声明面校验——**照 `ConfigurationProperty` 判，⛔ 不新造第二套规则**。
 *
 * 🔴 为什么必须自己先判一遍：`setConfigurationValue` 对 enum 违规是**静默 return**（warn + 不写），
 *    照它写就会得到「回执说成功、盘上没动」——正是本系列反复消灭的那种形状。
 *    （类型/上下界它**根本不判**：写个字符串进 `number` 键会落进 settings.json，设置页滑杆读出 NaN。）
 */
function checkValueShape(
  key: string,
  prop: ConfigurationProperty,
  value: unknown,
): { reason: string; error: string } | null {
  const t = prop.type;
  const typeOk =
    t === "array"
      ? Array.isArray(value)
      : t === "object"
        ? value !== null && typeof value === "object" && !Array.isArray(value)
        : t === "number"
          ? typeof value === "number" && Number.isFinite(value)
          : typeof value === t;
  if (!typeOk) {
    return {
      reason: "bad-type",
      error: `配置键 "${key}" 声明类型是 ${t}，收到 ${describeValue(value)}（${Array.isArray(value) ? "array" : value === null ? "null" : typeof value}）——值要按声明类型给，逐键类型看 workbench.action.listConfigurations`,
    };
  }
  if (prop.enum && !prop.enum.includes(value as string)) {
    return {
      reason: "enum",
      error: `配置键 "${key}" 只接受枚举内的值，收到 ${describeValue(value)}——允许值：${prop.enum.join(" / ")}（写入前先读一遍：枚举会随活动主题等状态变）`,
    };
  }
  if (t === "number") {
    const n = value as number;
    if (prop.minimum !== undefined && n < prop.minimum) {
      return { reason: "below-minimum", error: `配置键 "${key}" 的最小值是 ${prop.minimum}，收到 ${n}` };
    }
    if (prop.maximum !== undefined && n > prop.maximum) {
      return { reason: "above-maximum", error: `配置键 "${key}" 的最大值是 ${prop.maximum}，收到 ${n}` };
    }
  }
  return null;
}

export function registerSettingsCommands(): void {
  // 🔴 显式标注 `Command[]`（不是可省的类型注解）：不标则数组字面量里的 `type: "object"`
  // 会放宽成 `string`，`registerCommand` 当场编译红（M1 `AI#7` 的 params 是四值联合）。
  const commands: Command[] = [
    {
      id: "core.openSettings",
      title: "设置",
      category: "视图",
      description: "打开设置页（已有设置标签页/悬浮面板则聚焦它，不重复开）",
      params: [{ name: "ctx", type: "object", required: false, description: "{ pluginId: string; scrollTo: string }——pluginId 定位到该插件的设置分组，scrollTo 滚动到指定设置项" }],
      handler: async (...args: unknown[]) => {
        const ctx = args[0] as { pluginId?: string; scrollTo?: string } | undefined;
        if (ctx?.pluginId) requestSettingsGroup(ctx.pluginId);
        if (ctx?.scrollTo) requestScrollToSetting(ctx.scrollTo);
        // E5.8#41.12 🪡 概念生效接缝：一对多后走 getActive（读持久化激活套；无记录/已卸载回退默认=内置）
        const settingsPluginId = factorySlots.getActive("settings");
        if (!settingsPluginId) return;
        // E5.8#38（I8-3/IX-1 单一实例）：设置已是标签页 → 聚焦该标签页，不弹第二面板
        if (getCallbacks()?.focusTabByPluginId(settingsPluginId)) return;
        // E5.8#38（I8-1/I8-2）：声明制 revealFloating——面板身份开关键（无面板→开/同视图→关/他面板→替换）
        // 走 #39.5 子项 B wire（壳侧 useFloatingPanelReveal 编排），声明未解析 → no-op 不崩
        const fpViewId = getFloatingPanelViewId(settingsPluginId);
        // 🪡 首开形态（声明制通用接缝，2026-09 用户拍板）：插件声明 defaultForm / formKey（键交用户），
        // 壳决定开成标签页还是悬浮面板——壳侧零插件 id 硬编码，将来任何声明者自动生效。
        // ⚠️ 只作用于「此刻没有设置标签页」这一支：上面聚焦支已 return，开成之后的面板↔标签页互转
        // （面板右上角「在主窗口中打开」/ 标签页右键「在悬浮面板中打开」）仍各走原路，不归这里管。
        const form = resolveFloatingPanelOpenForm(settingsPluginId);
        // 声明 tab 且该插件**真能**开成标签页（appearsIn.tabBar + entry，同 open-in 按钮门控）→ 开标签页。
        // 声明 tab 却无标签页形态 = 作者声明矛盾 ⇒ 落回面板（有面板就开），不静默无动作。
        if (form === "tab" && getTabCreatableViews().some((v) => v.pluginId === settingsPluginId)) {
          getCallbacks()?.openTab(settingsPluginId);
          return;
        }
        // E5.8#41.16 🔴 复合寻址：双设置套并存时裸 viewId="settings" 会被 getViewByViewId 判歧义 fail-loud →
        // 静默 no-op（Ctrl+,/齿轮失效）。壳侧路径已知激活套 pluginId → 载荷携带，resolve 走复合键精确命中（#41.8 §4.2）。
        if (fpViewId) shellEvents.emit("panel:reveal-floating", { viewId: fpViewId, pluginId: settingsPluginId });
      },
    },
    {
      // E5.8#50.24：升级两段式（配方→配色）——命令 id 归一化为 theme.* 族（09 §1 命令清单）
      id: "theme.pick",
      title: "主题：选择主题…",
      description: "打开主题选择器切换当前主题",
      params: [{ name: "ctx", type: "object", required: false, description: "{ pluginId: string }——只列该插件提供的主题，省略 = 列全部主题" }],
      handler: async (...args: unknown[]) => {
        const ctx = args[0] as { pluginId?: string } | undefined;
        // E5.5#7-p15：直调 QuickPickService——不再 dispatch SHOW_THEME_BROWSER
        const { showThemePicker } = await import("../../../components/shared/theme-browser/ThemeBrowser");
        showThemePicker(ctx?.pluginId);
      },
    },
    {
      // E5.8#50.24：复位外观——app.appearanceMode→followTheme（onApply 级联清 9 覆盖 + 6 域来源 + 强调色回配方，08 §7.3.5 单一写入点）
      id: "theme.resetAppearance",
      title: "外观：复位外观覆盖…",
      description: "把外观模式复位为跟随主题，并清掉全部外观覆盖",
      handler: async () => {
        await setConfigurationValue("app.appearanceMode", "followTheme", "user");
      },
    },
    {
      // E5.8#90：复位混搭——批复位 3 来源键回跟随主题（保持自定义模式；域来源 onApply 重合并回主题基线，startup.ts 单一写入点；E5.8#132 surface 域删来源 4→3）
      id: "theme.resetMix",
      title: "混搭：复位为整体配方…",
      description: "把混搭（分区外观）的各来源复位为跟随主题，保持自定义模式",
      handler: async () => {
        await resetConfigurationValueBatch(MIX_SOURCE_KEYS, "user");
      },
    },
    {
      id: "workbench.action.selectLanguage",
      title: "选择语言",
      category: "首选项",
      description: "打开语言选择器切换界面语言",
      handler: async () => {
        // E5.5#7-p15：直调 QuickPickService——不再 dispatch SHOW_LANGUAGE_PICKER
        const { showLanguagePicker } = await import("../../../components/shared/language-picker/LanguagePicker");
        showLanguagePicker();
      },
    },
    {
      id: "workbench.action.openKeybindingsSettings",
      title: "打开键盘快捷方式",
      category: "首选项",
      description: "打开键盘快捷方式设置页",
      handler: async () => { await openKeybindingsSettings(); },
    },

    /* ── M2 生长格 `AI#66`：通用配置写（读侧 = `readCommands` 的 `workbench.action.getConfiguration`）── */

    {
      id: "workbench.action.setConfiguration",
      title: "写入配置项",
      category: "首选项",
      // ⚠️ `description` **单行写**（同 readCommands：多行拼接的续行不匹配审计的 `description:` 前缀豁免）
      description: "写一个配置键的用户值（user scope）——先按声明面校验（键是否声明／类型／枚举／上下界／是否显示槽／是否 ai.* 禁写），写完当场回读，回执带写入前后值。⛔ 它不替你想「该写什么值」：键名与默认值看 workbench.action.listConfigurations，改完照 workbench.action.getConfiguration 复读",
      params: [
        {
          name: "ctx",
          type: "object",
          required: true,
          description: '{ key: string; value: unknown }——value 按该键声明类型给（字符串/数字/布尔/数组/对象直接给，⛔ 不必包成对象）；也可逐位写成 ("键名", 值)',
        },
      ],
      handler: async (...args: unknown[]) => {
        const picked = pickWriteArgs(args);
        if (!picked) {
          return writeRefusal(
            null,
            "bad-args",
            `参数要 { key: string, value: unknown }（或逐位 ("键名", 值)）——收到 ${describeValue(args[0])}；键名清单看 workbench.action.listConfigurations`,
          );
        }
        const { key, value } = picked;

        // ── 声明面三道门（顺序即优先级：没声明 → 禁写面 → 显示槽；⛔ 越靠前的错越该先说） ──
        const prop = getMergedSchema()[key];
        if (!prop) {
          return writeRefusal(
            key,
            "undeclared",
            `配置键 "${key}" 未声明——未声明的键写进 settings.json 设置页不认（也不会生效），键名清单看 workbench.action.listConfigurations`,
          );
        }
        const blockedPrefix = WRITE_BLOCKED_PREFIXES.find((p) => key.startsWith(p));
        if (blockedPrefix) {
          return writeRefusal(
            key,
            "blocked",
            `配置键 "${key}" 落在拒写面 "${blockedPrefix}"（AI 接入族：门锁／调试端口／账本开关）——被管的那个不许改自己的门，这些键只由用户在设置页里点`,
          );
        }
        if (prop.renderHint && WRITE_BLOCKED_HINTS.includes(prop.renderHint)) {
          return writeRefusal(
            key,
            "display-only",
            `配置键 "${key}" 的 renderHint 是 "${prop.renderHint}"——这是显示槽（状态行／按钮），不是可写的设置值`,
          );
        }
        const shape = checkValueShape(key, prop, value);
        if (shape) return writeRefusal(key, shape.reason, shape.error);

        // ── 写：写入前的用户层值先留底（回执要能回答「原来是啥」——改动可撤销的前提是知道改回什么） ──
        const previousUserValue = inspectConfiguration(key).userValue;
        let persisted = true;
        try {
          await setConfigurationValue(key, value, "user");
        } catch (e) {
          // 内存层已写、**落盘那一步失败**（测试环境无持久化即走这条）——回执必须说出来（下次启动会丢），
          // ⛔ 不能因为「内存里已经有了」就报成功。照读面先例：异常不外抛（外抛会被壳弹用户红 toast）。
          persisted = false;
          const msg = e instanceof Error ? e.message : String(e);
          const now = inspectConfiguration(key);
          return {
            key,
            applied: sameValue(now.userValue, value),
            persisted,
            reason: "persist-failed",
            error: `配置键 "${key}" 的值已进内存但**落盘失败**（${msg}）——本次会话生效、重启会丢`,
            previousUserValue: previousUserValue ?? null,
            userValue: now.userValue ?? null,
            effectiveValue: now.effectiveValue ?? null,
          };
        }

        // ── 回读对账：⛔ 不信「调用没抛」＝「值写进去了」——`setConfigurationValue` 对枚举违规是**静默
        //    return**（warn + 不写），照它报成功就是「回执说成功、盘上没动」。所以判据取回读结果本身。 ──
        const after = inspectConfiguration(key);
        const applied = sameValue(after.userValue, value);
        return {
          key,
          applied,
          persisted,
          ...(applied
            ? {}
            : {
                reason: "not-applied",
                error: `配置键 "${key}" 写后回读是 ${describeValue(after.userValue)}，与写入值 ${describeValue(value)} 不一致——没生效，⛔ 别当写好了`,
              }),
          previousUserValue: previousUserValue ?? null,
          userValue: after.userValue ?? null,
          effectiveValue: after.effectiveValue ?? null,
        };
      },
    },
  ];

  for (const c of commands) {
    registerCommand(APP_PLUGIN_ID, c);
  }

  // 齿轮菜单——设置/主题/语言/快捷键 四个入口（E5.8#50.24：theme.pick 归一化命令 id）
  registerMenuItems(MENU_SLOTS.ExtensionGear, APP_PLUGIN_ID, [
    { command: "core.openSettings", group: "navigation" },
    { command: "theme.pick", group: "navigation" },
    { command: "workbench.action.selectLanguage", group: "navigation" },
    { command: "workbench.action.openKeybindingsSettings", group: "navigation" },
    // E6#57.10：新 group ⇒ 与上面四个 navigation 之间自动出一条分隔线（ContextMenu 相邻不同
    // group 出线）。即设计 03 §三「入口可多处，命令源唯一」的第二处入口——命令 id 与帮助菜单同一条。
    // 对齐 mockups/01 Frame 2：设置/主题/语言/快捷键 ── 检查更新… / 关于 LinkDesk。
    { command: "update.checkForUpdates", group: "update" },
    // ── E6#57.14g：关于入口——**末项**，与「检查更新…」**同组 `update`**（判据②，与帮助菜单同款取舍：
    // 同组不画线）。命令 id 与帮助菜单是**同一条**（`app.about`）——「入口可多处，命令源唯一」。
    { command: "app.about", group: "update" },
  ]);
}
