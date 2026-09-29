/**
 * 壳读数命令——M2 `AI#62`：命令面**补读数**（配置 / 布局 / 容器与视图）。
 *
 * 🔴 为什么单独一个文件：这一族同属「AI 读数」一个概念（对外部 AI 与插件是**读**不是动作），
 *    与 `panelCommands`（写几何）/`settingsCommands`（写设置）/`tabCommands`（写标签）同族——
 *    ⛔ 不散进那三个写面文件，否则下次找「怎么读」会去翻三个「怎么写」。
 *
 * 🔴 为什么需要这批命令：写侧一直在（`AI#21` 补了尺寸写、设置写走 `setConfigurationValue`），
 *    **读侧几乎没有**——几何读数只有 `workbench.action.getFloatingPanelBounds` 一条，设置类**一条都没有**
 *    ⇒ 外部 AI 只能去翻 `settings.json` 文件（改完无路回读，还得自己猜文件面形状）。
 *    本文件把「屏幕上的事实」按**单一权威**直读出来：
 *      配置 ＝ `ConfigurationService`（五层合并）｜几何 ＝ `layoutEngine`｜容器与视图 ＝ `ViewContainerService`
 *      ｜显隐（侧栏/面板是否可见 ＋ 面板激活视图）＝ 壳 React state（经 `layoutSnapshot` 读面槽——core 不能 import hooks）。
 *
 * ⚠️ 分屏比例**不在这里重复报**：它长在壳的标签树上，`tabs` 操作（`AI#3`）里每个分组的 `root.sizes`
 *    就是它，多造一份 = 第二把尺。
 */

import { registerCommand, type Command } from "../../registry/commands/CommandRegistry";
import { layoutEngine, narrowSidebarEdge, narrowPanelEdge } from "../../services/layout/LayoutEngine";
import { ViewContainerService } from "../../services/layout/ViewContainerService";
import { getMergedSchema, getConfigurationContributions } from "../../registry/ConfigurationRegistry";
import { inspectConfiguration, hasConfigurationValue } from "../../services/configuration/ConfigurationService";
import { layoutSnapshot } from "../../services/plugins/readSnapshots";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";

/**
 * 取「一个字符串实参」——兼容两种调用形：逐位平铺（`["app.theme"]`）与单具名对象（`{"key":"app.theme"}`）。
 *
 * 🔴 为什么单具名对象要这里自己认：`AI#52` 的具名展开**只在声明了 ≥2 个 `params` 时**开
 *    （arity=1 时「一个对象」可能就是它的合法实参，壳不替调用方猜）⇒ 本命令 arity=1，展开不生效，
 *    外部 AI 照 `params[].name` 写下的 `{"key":"…"}` 会**整包**落进 `args[0]`。这里认下来，两形等价。
 *
 * ⚠️ **写面共用**（`AI#68`）：`settingsCommands` 的 `clearConfiguration` 也收同一个形状的键名参数
 *    ⇒ 从读面导出、写面引用（同一件「两形等价」的归一只写一遍，⛔ 别各抄一份迟早分叉）。
 *
 * @returns 合法 ⇒ 去掉首尾空白的键名；不合法 ⇒ `null`（调用方转成**载荷里的报错**，见 `badArg`）
 */
export function pickStringArg(args: unknown[], name: string): string | null {
  const raw = args[0];
  const value =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)[name]
      : raw;
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

/**
 * 坏参的回执形状——**载荷里的报错**，⛔ 不抛异常。
 *
 * 🔴 为什么不像其它命令那样"坏值就静默 no-op"：读命令的 no-op（`undefined`）正是本格要消灭的
 *    「答不上却看着像答了」（外部 AI 撞到 `null` 以为 `exec` 丢返回值）。所以坏参必须**出声**——
 *    但出在**载荷里**（AI 读的那一层），⛔ 不是抛异常：壳侧 `runCommand` 的 catch 会
 *    `reportError(...)` 弹一个**用户可见的红色 toast**，而这条错误用户当场什么也做不了
 *    （AI 参数写错 / 从命令面板点了一下），弹面板只会糊脸（18 档 §五 G 分级同款取舍）。
 */
function badArg(name: string): { key: null; declared: false; error: string } {
  return {
    key: null,
    declared: false,
    error: `参数 ${name} 必填（非空字符串）——两种写法等价：逐位 ["值"]，或具名 {"${name}":"值"}`,
  };
}

/** 各层无值 ⇒ `null`（⛔ 不是省略字段）：让「这一层没设过」与「这一层设成了 null」在形状上稳定可读。 */
function orNull<T>(v: T | undefined): T | null {
  return v === undefined ? null : v;
}

export function registerReadCommands(): void {
  // 🔴 显式标注 `Command[]`：不标则数组字面量里 `type: "string"` 会放宽成 `string`，`registerCommand` 编译红
  // （同 `settingsCommands`/`tabCommands` 的先例）。
  const commands: Command[] = [
    /* ── ① 配置读 ── */

    {
      id: "workbench.action.getConfiguration",
      title: "读取配置项",
      category: "首选项",
      // ⚠️ `description` **单行写**：多行拼接的续行不匹配审计的 `description:` 前缀豁免（本格实测踩过）
      description: "读一个配置键的值与来源分层（schema 默认／用户／工作区／生效值 ＋ declared 判定）——⛔ 不用去翻 settings.json；键名清单看 workbench.action.listConfigurations",
      params: [
        {
          name: "key",
          type: "string",
          required: true,
          description: "配置键，如 app.theme（键名清单：workbench.action.listConfigurations）",
        },
      ],
      handler: async (...args: unknown[]) => {
        const key = pickStringArg(args, "key");
        if (key === null) return badArg("key");
        // `declared` = 「注册表里有这个键吗」——读不存在的键**如实报**（⛔ 不静默给 undefined/默认值：
        // 键名写错与「键存在但各层都没设」是两件事，AI 必须分得开）。
        const declared = key in getMergedSchema();
        const insp = inspectConfiguration(key);
        return {
          key,
          declared,
          defaultValue: orNull(insp.defaultValue),
          userValue: orNull(insp.userValue),
          workspaceValue: orNull(insp.workspaceValue),
          effectiveValue: orNull(insp.effectiveValue),
        };
      },
    },

    {
      id: "workbench.action.listConfigurations",
      title: "列出全部配置项",
      category: "首选项",
      description: "列出全部已注册配置键（按插件分组：类型／默认／枚举／说明 ＋ 该键**有没有被用户改过**：userValue／overridden）——不知道键名时先读这个，再去 workbench.action.getConfiguration 取分层值；只要「哪些键被改过、值各是什么」这一问，用 workbench.action.listOverrides",
      handler: async () => {
        // 🔴 遍历「贡献」而不是「合并 schema」：贡献里的键**只含被接受的**（异插件同键被拒的那份不进
        //    `properties`，见 `ConfigurationRegistry.registerConfiguration` 的 accepted 汇集）
        //    ⇒ 本清单的键集与 `getConfiguration` 的 `declared` 判定**天然一致**（有单测守这条不变量）。
        const groups = [...getConfigurationContributions()].map(([pluginId, contrib]) => ({
          pluginId,
          title: contrib.title,
          keys: Object.entries(contrib.properties).map(([key, prop]) => ({
            key,
            type: prop.type,
            default: orNull(prop.default),
            // enum/enumDescriptions 只在真声明时出现（⛔ 不填 `[]` 占位——空数组会被读成「允许值一个都没有」）
            ...(prop.enum ? { enum: prop.enum, ...(prop.enumDescriptions ? { enumDescriptions: prop.enumDescriptions } : {}) } : {}),
            description: prop.description,
            // 🔴 覆盖面**就地**报在这张表上（生长格 `AI#70` 的 fail-safe 那一半）：⚠️ 曾实测踩过——
            //    消费者拿这张表「挑一个没覆盖的键去验清覆盖门」，表里没有覆盖信息 ⇒ 只能自己推断 ⇒
            //    推断恒真 ⇒ 挑中真有覆盖的键、把真覆盖删了。补在**消费者已经在看的地方**，
            //    此后任何枚举本命令的调用方**不再有机会**误判（代价 = 表略胖，⛔ 不是缺陷）。
            userValue: orNull(inspectConfiguration(key).userValue),
            overridden: hasConfigurationValue(key),
          })),
        }));
        return {
          count: groups.reduce((n, g) => n + g.keys.length, 0),
          groups,
        };
      },
    },

    {
      id: "workbench.action.listOverrides",
      title: "列出被改过的配置项",
      category: "首选项",
      description: "只列**有用户覆盖（user scope）或工作区覆盖**的配置键及其值——无覆盖的键不进结果，空表 = 谁都没被改过。问「哪些键被改过／我上一笔动了什么」用这一条，⛔ 不必逐键 getConfiguration、也不必拉全量 listConfigurations",
      handler: async () => {
        // 🔴 键集与 `listConfigurations` **同源**（都走 `getConfigurationContributions`）——本命令只做
        //    「按覆盖与否过滤」这一件事，⛔ 不另造一份键清单（两份清单迟早分叉 = 第二把尺）。
        // 🔴 覆盖判定与取值同样只认 `ConfigurationService`（`hasConfigurationValue` / `inspectConfiguration`）：
        //    ⛔ 不在这里读 settings.json、不自己合并分层——单一权威在服务里，本命令只是它的一个出口。
        const overrides: Array<{
          key: string;
          pluginId: string;
          userValue: unknown;
          workspaceValue: unknown;
          effectiveValue: unknown;
        }> = [];
        for (const [pluginId, contrib] of getConfigurationContributions()) {
          for (const key of Object.keys(contrib.properties)) {
            if (!hasConfigurationValue(key)) continue;
            const insp = inspectConfiguration(key);
            overrides.push({
              key,
              pluginId,
              userValue: orNull(insp.userValue),
              workspaceValue: orNull(insp.workspaceValue),
              effectiveValue: orNull(insp.effectiveValue),
            });
          }
        }
        return { count: overrides.length, overrides };
      },
    },

    /* ── ② 布局读 ── */

    {
      id: "workbench.action.getLayout",
      title: "读取布局",
      category: "视图",
      description: "读当前布局：窗口容器尺寸 ＋ 侧栏（显隐／宽／贴边／边界）＋ 面板（显隐／激活视图／高宽／贴边／对齐／边界）。⛔ 分屏比例不在此重复报——tabs 操作里每个分组的 root.sizes 就是它",
      handler: async () => {
        // 显隐那一半的唯一真相源在壳 React state（经槽注册）——未注册时 `read()` **大声抛**
        // （`readSnapshots` 头注：⛔ 不返回空世界假装答了）。
        const vis = layoutSnapshot.read();
        const sb = layoutEngine.getZone("sidebar");
        const pn = layoutEngine.getZone("panel");
        return {
          container: layoutEngine.getContainerSize(),
          sidebar: {
            visible: vis.sidebarVisible,
            view: vis.sidebarView,
            edge: narrowSidebarEdge(sb?.dock?.edge),
            width: orNull(sb?.dock?.width),
            // 折叠 = 宽塌到 collapsedWidth（壳内一致判据见 App/sidebarHost.ts）——本命令如实报宽 ＋ 把
            // 这个常数一并给出，⛔ 不另造第四个魔数判据去派生一个 collapsed 布尔。
            collapsedWidth: orNull(sb?.dock?.collapsedWidth),
            minWidth: orNull(sb?.dock?.minWidth),
            maxWidth: orNull(sb?.dock?.maxWidth),
            bounds: layoutEngine.getBounds("sidebar") ?? null,
          },
          panel: {
            visible: vis.panelVisible,
            activeViewId: vis.panelActiveViewId,
            edge: narrowPanelEdge(pn?.dock?.edge),
            align: pn?.dock?.align ?? "center",
            height: orNull(pn?.dock?.height),
            width: orNull(pn?.dock?.width),
            minHeight: orNull(pn?.dock?.minHeight),
            maxHeight: orNull(pn?.dock?.maxHeight),
            bounds: layoutEngine.getBounds("panel") ?? null,
          },
        };
      },
    },

    /* ── ③ 容器与视图读 ── */

    {
      id: "workbench.action.listViews",
      title: "列出容器与视图",
      category: "视图",
      description: "列出全部容器与其中的视图（各自归属哪个插件、可见／折叠态）。这是注册面（有哪些）；「此刻屏幕上开着哪些」看 workbench.action.getLayout",
      handler: async () => {
        const containers = ViewContainerService.getViewContainers();
        return {
          count: containers.length,
          containers: containers.map((container) => ({
            id: container.id,
            title: container.title,
            location: container.location ?? "sidebar",
            views: ViewContainerService.listViewOwners(container.id).map(({ pluginId, viewId, descriptor }) => ({
              id: viewId,
              pluginId: pluginId || null,
              title: descriptor.title,
              // 可见性 = 容器模型的答案（对标 VS Code ViewContainerModel.isVisible）；折叠 = 用户持久化的
              // 折叠态（复合键）。归属缺失（pluginId 空）时折叠态**问不出来** ⇒ 报 null，⛔ 不报 false 假装问过。
              visible: ViewContainerService.isVisible(container.id, viewId),
              collapsed: pluginId ? ViewContainerService.isCollapsed(pluginId, viewId) : null,
              ...(descriptor.hideByDefault ? { hideByDefault: true } : {}),
            })),
          })),
        };
      },
    },
  ];

  for (const c of commands) {
    registerCommand(APP_PLUGIN_ID, c);
  }
}
