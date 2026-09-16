/**
 * 外观族 id 的**运行时归属仲裁**（E6#111f／1.36 · 机制 B）。
 *
 * 一句话：注册一处外观 id（配方 / 配色 / 图标主题 / 共享图标）时，**谁有资格占这个名字**由本模块裁决——
 *
 * | 情形 | 裁决 |
 * |:--|:--|
 * | 名字**没人占**，且不是宿主兜底 id（或声明者在证照内） | ✅ 接受（静默） |
 * | 声明者占了宿主兜底 id 且**无证照** | 🔴 拒 ＋ `console.error`（顶替宿主兜底） |
 * | 宿主兜底条目被**有证照**的插件接替（今天唯一一例：`theme-defaults` 接 `light`） | ✅ 接受（**静默**——这是设计里的交接，不是顶替） |
 * | 同 id 已被**异插件**占用 | 🔴 **先者保留 ＋ 拒后者** ＋ `console.error` 点名双方 |
 * | **同 pluginId** 重注册（装配路径多阶段） | ✅ 接受（**不出声、不拒**——反向负控，防改坏装配） |
 *
 * 出处与判据（唯一真源，本文不重述）：`docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/非样式命名空间归一化/06-任务-外观族id归属落地.md` §二.3。
 *
 * 🔴 **两条铁律**（1.36 §二.3 写死，别在本模块里破）：
 *   ① **永不 throw**——`throw` 会让**整个插件装载失败**（不是"这个名字没生效"）；拒 = 不写入 ＋ 返 no-op disposer。
 *   ② **不碰主题机制**——本模块只做「要不要登记」的裁决，不碰 `commitTokens` / `theme:changed` / 池写入。
 *
 * 🔴 **为什么"两个名字空间不许合栏"**：配方 id（`app.theme` 取值）与配色变体 id（`app.themeColor` 取值）是
 *   **两个空间**——`mint-soda` 同时是两者。合栏 ⇒ 官方 `theme-defaults` 的配色 id `dark` 撞进配方栏 ⇒ 假红
 *   （它是宿主亮兜底的**官方实现者**）。账的 `appearanceRecipeIds` / `appearanceColorwayIds` 两栏 ＋ 本模块的
 *   `space` 参数就是这条的落地形状。
 *
 * 底座：`RegistryBase.track(pluginId, disposer)` ＋ 各登记本已带 `pluginId`（宿主兜底 = `undefined`）
 *   ⇒ 「是不是宿主」运行时**直接可读**，不需要另建身份表（1.35 §15.4 裁决）。
 */
import {
  HOST_RESERVED_APPEARANCE_GRANTS,
  HOST_RESERVED_APPEARANCE_IDS,
} from "../host-reserved.generated";

/**
 * 外观 id 的**空间**——判据按空间比，永不跨空间。
 * · `recipe`     配方 id（`app.theme` 取值空间；`contributes.themes[].id` 与配方本同空间）
 * · `colorway`   配色变体 id（`app.themeColor` / colors 域来源取值空间）
 * · `iconTheme`  图标主题 id（`app.iconTheme` 取值空间）
 * · `sharedIcon` 共享图标 id（`contributes.icons` 的键）——🔴 宿主**没有**兜底共享图标 ⇒ 保留面恒空，
 *                本空间只有「跨插件同 id」那一条判据
 * · `sentinel`   外观哨兵值（`followTheme`——**不是 id**，只防插件拿它当自己的 id 用）
 */
export type AppearanceSpace = "recipe" | "colorway" | "iconTheme" | "sharedIcon" | "sentinel";

/** 一次注册的裁决结果——`accept:false` 时调用方**不许写入登记本**，并返 no-op disposer。
 *  🔴 拒因是**结构化的**（`code` ＋ 当事双方），**文案不在 verdict 里**——见 `logAppearanceIdRejection` 的头注。 */
export type AppearanceVerdict =
  | { accept: true }
  | {
      accept: false;
      code: "host-reserved" | "taken";
      space: AppearanceSpace;
      id: string;
      pluginId: string;
      /** 仅 `taken` 有：该 id 当前占位者（先到者） */
      prevOwner?: string;
    };

/** no-op disposer——被拒的注册也要返一个（调用方契约：一切注册返 disposer） */
export const NOOP_DISPOSE = (): void => {};

/** 账里该空间的宿主兜底 id（未列出的空间 = 恒空；⛔ 别在别处再写一份字面量） */
export function hostReservedAppearanceIds(space: AppearanceSpace): readonly string[] {
  return HOST_RESERVED_APPEARANCE_IDS[space] ?? [];
}

/** 该 id 的**证照**持有者（账 `appearanceIdGrants`）——🔴 **按 id 记**，不是「哪些仓被宽恕」 */
export function appearanceGrantHolders(id: string): readonly string[] {
  return HOST_RESERVED_APPEARANCE_GRANTS[id] ?? [];
}

/**
 * 🔴 **拒绝出口**（五个仲裁点共用同一个出口——各自写一份文案，在作者眼里就会变成好几条规矩）。
 *
 * ⚠️ **「出口」而非「返回文案」是刻意的**（[06 §三 坑 4](06-任务-外观族id归属落地.md) 明文）：
 *   `audit-i18n.mjs --strict` 的非 UI 排除是**逐行**的——只认 `console.*` 调用行与其续行。
 *   ⇒ **诊断文案必须待在 `console.error(` 调用之内**；写成「返回值里的 message」会被当 UI 文字判缺翻译、
 *   `npm run check` 在 i18n 处断（1.34 实测被拦一次；本格若改形状也会重蹈）。与
 *   `logHostReservedRejection()`（`ConfigurationRegistry.ts`）同形，**故也不需要任何豁免表**。
 *
 * 空间不写中文别名：直接用**账/腿的 `space` 码**（作者在 SDK 腿里看到的就是这几个字，
 *   与 `.id` 并读时比别名更少歧义）。
 *
 * 🔴 **建议名必须真算出来**（`pluginId ＋ 词干`），与 SDK 腿 `appearance-ownership.ts` 的 `suggested` **同形**
 *   ——作者在腿里收到的建议与运行时日志里的建议必须是同一个名字，否则等于两条规矩（1.32 栽过「建议值算错」）。
 *
 * @param tag 各登记本的日志前缀（`"[ThemeRegistry]"` 等——照各本既有前缀，别改；**必须 ASCII**）
 * @param recipeId 仅配色空间用：本条被拒是**哪条配方**登记被拒的成因（配方本里配色随配方进来，
 *                 一条配色不合格 ⇒ 拒整条配方）——给作者指路，不然只看到一个配色 id 会一头雾水
 */
export function logAppearanceIdRejection(
  tag: string,
  v: Extract<AppearanceVerdict, { accept: false }>,
  recipeId?: string
): void {
  const dot = v.id.indexOf(".");
  const suggested = `${v.pluginId}.${dot > 0 ? v.id.slice(dot + 1) : v.id}`;
  if (v.code === "taken") {
    console.error(
      `${tag} ❌ 拒绝注册：外观 id "${v.id}"（空间 "${v.space}"）已被插件 "${v.prevOwner}" 占用——` +
        `拒绝插件 "${v.pluginId}" 的注册（先者保留，跨插件同 id 不许）。` +
        `改法：改用 "${suggested}"（只换第一段、词干零变化）。` +
        (recipeId === undefined ? "" : `（成因：配方 "${recipeId}" 的配色之一被拒 ⇒ 整条配方不放行）`)
    );
    return;
  }
  console.error(
    `${tag} ❌ 拒绝注册：外观 id "${v.id}"（空间 "${v.space}"）属于宿主的兜底面（插件不得占用）。` +
      `改法：改用 "${suggested}"（只换第一段、词干零变化）；若这确实是宿主兜底的官方实现者，` +
      `需在账的 appearanceIdGrants 里为该 id 记一条证照（一次公共面决策）。` +
      (recipeId === undefined ? "" : `（成因：配方 "${recipeId}" 的配色之一被拒 ⇒ 整条配方不放行）`)
  );
}

/**
 * 裁决一次外观 id 注册（纯函数——**不做 I/O、不 console**，调用方按 verdict 走上面的出口）。
 *
 * @param o.space        空间（判据按空间比）
 * @param o.id           本次要登记的 id（`sharedIcon` 空间 = 图标 id）
 * @param o.pluginId     本次登记者；`undefined` = 宿主兜底自己（壳内置，永不被拒）
 * @param o.prevOwner    该 id **当前占位者**的 pluginId；`o.occupied=true` 且它为 `undefined` = 当前占位者是宿主兜底
 * @param o.occupied     该 id 当前**是否已被占用**——🔴 必须由调用方给（本模块不读任何登记本）：
 *                       `undefined` 的 prevOwner 有两种含义（没人占 / 宿主占），只有调用方分得清
 * @param o.reservedFace 是否按账的兜底栏判「这个 id 是不是宿主保留面」（缺省 `true`）。
 *                       🔴 **flat 登记本（键 = 显示名）传 `false`**：显示名不是 id（§二.2 ⑧ 不判），
 *                       那里只适用 ⑥ 的「覆盖宿主兜底要出声」。这是**唯一**该传 false 的地方。
 */
export function judgeAppearanceId(o: {
  space: AppearanceSpace;
  id: string;
  pluginId: string | undefined;
  prevOwner: string | undefined;
  occupied: boolean;
  reservedFace?: boolean;
}): AppearanceVerdict {
  const { space, id, pluginId, prevOwner, occupied } = o;
  const reservedFace = o.reservedFace !== false;

  // 宿主自己登记自己的兜底面——永不被拒（兜底链断了比什么假阳都坏）
  if (pluginId === undefined) return { accept: true };

  if (occupied) {
    // 🔴 铁律：同 pluginId 重注册 ⇒ 不变（装配路径多阶段；拒了会把装配改坏）
    if (prevOwner === pluginId) return { accept: true };
    // 前者是宿主兜底：后者要么有证照（接替，静默），要么判顶替（拒 ＋ 出声）
    if (prevOwner === undefined) {
      if (reservedFace && appearanceGrantHolders(id).includes(pluginId)) return { accept: true };
      return { accept: false, code: "host-reserved", space, id, pluginId };
    }
    // 两方都是插件且不同 ⇒ 先者保留，拒后者（点名双方）
    return { accept: false, code: "taken", space, id, pluginId, prevOwner };
  }

  // 空位：只判「这个 id 是不是宿主兜底」——无证照者不得占用
  if (
    reservedFace &&
    hostReservedAppearanceIds(space).includes(id) &&
    !appearanceGrantHolders(id).includes(pluginId)
  ) {
    return { accept: false, code: "host-reserved", space, id, pluginId };
  }
  return { accept: true };
}
