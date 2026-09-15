/**
 * check-css-namespace 腿·**宿主保留名判据**（E6#109e；E6#109h-b① 起为双判据之一）——插件 CSS
 * **不得裸定义宿主保留名**。
 *
 * 🔴 判据（与壳仓 `scripts/check-css-namespace.mjs` 同源，见 11-样式命名空间审计.md）：
 *   插件视图的一张样式表里**同时装着宿主 CSS + 共享组件 CSS + 所有已加载插件的 CSS**（实机读数：
 *   池文档 8 张样式表）⇒ 裸类名（`.badge` / `.toggle` / `.input` …）是**全局标识符**：一方「定义」、
 *   他方「渲染」，两边样式就落到同一个元素上——**不报错、只是长得不对**（真案：主题卡片徽标文字
 *   被自己的背景吞掉，看着是「一块纯色」）。
 *
 *   本腿只管「**裸定义**」（选择器主体就是这个类名本身、无祖先，如 `.badge { }`）——占名行为。
 *   **scoped 调优**（`.control-bar .combobox { }`）是合法消费，不在本腿管辖。
 *
 * 保留名清单 = 包内 `schemas/reserved-class-names.json`（**单一真相源**，壳仓门禁读同一份）；
 * 清单里没有的名字随便用——但请给自有元素带插件前缀（作者面纪律见 05-插件UI写法规约 §12）。
 *
 * ── 🔴 E6#109h-b① 起本判据的**位置变了**（用户拍板 Q1=(A)，详案 15 §二）──
 * 命名空间判据从「不许裸定义**保留名**」（黑名单，要查表）升级为「裸定义必须以 **`<pluginId>-`**
 * 开头」（`plugin-prefix.ts`，**不需要任何清单**）。在「裸定义」这一轴上，**前缀判据完全覆盖本判据**
 * （插件不可能再裸定义 `.badge`——它必须以 `<pluginId>-` 开头），故：
 *   ① **不重复报同一处**：`lint.ts` 里两条判据的报点按 `文件:行` 去重（前缀优先，见该文件）；
 *   ② 清单的角色变成**报点措辞的补充**——前缀腿命中一个同时是保留名的名字时，消息里补一句
 *      「且这是宿主保留名（`reserved-class-names.json`，<why>）」；
 *   ③ 本判据仍**独立保留**：拿不到前缀（`plugin.json` 缺失/损坏 ⇒ 前缀腿 fail-closed）时它是唯一
 *      能逐点报出「你占了一个宿主名字」的腿。⚠️ **清单本身不许删**——它仍是作者面 §12 表、
 *      `check-reserved-names-doc-sync` 对账门禁与 scoped 调优纪律的真相源。
 *
 * 知情绕行 = 标准 disable 注释（`CHECK_IDS.cssNamespace`），与另三条腿同一套机制。
 * ⚠️ 已知口径（详案 15 §二·选项 (A) 的代价，写进作者面是 1.14⑧ 的活）：**同一个 id 同时盖住
 *    「保留名」与「前缀」两条判据**——既有 disable 注释会一起绕行（作者面已声明 disable = 知情绕行）。
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectCssUnits, type CheckViolation } from "./scan.js";
import { bareClassDefinitions, keyframeDefinitions } from "./css-selectors.js";
import { isDisabled, CHECK_IDS } from "./disable.js";

/**
 * 包内保留名清单定位（dist/eslint/checks/x.js → ../../../schemas = 包根/schemas；src 直跑同样命中）。
 * 🔴 写法必须是「路径式」（resolve + fileURLToPath）——`new URL(<字面量>, import.meta.url)` 是
 * Vite 的资产 URL 惯用式，本模块一旦被 Vite 处理会被改写成构建期资产引用（validate.ts 同款坑，E6#91e）。
 */
const RESERVED_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../schemas/reserved-class-names.json");

interface ReservedEntry {
  name: string;
  owner?: string;
  why: string;
}

export interface ReservedNames {
  classes: ReservedEntry[];
  keyframes: ReservedEntry[];
}

/** 读保留名清单（classes 两组合并 + keyframes）；文件缺失 ⇒ 空表（本腿静默，validate 侧另有存在性门禁） */
export function loadReservedNames(file: string = RESERVED_FILE): ReservedNames {
  if (!existsSync(file)) return { classes: [], keyframes: [] };
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    classes?: { shared?: ReservedEntry[]; host?: ReservedEntry[] };
    keyframes?: ReservedEntry[];
  };
  return {
    classes: [...(raw.classes?.shared ?? []), ...(raw.classes?.host ?? [])],
    keyframes: raw.keyframes ?? [],
  };
}

export function runReservedClassCheck(root: string, reserved: ReservedNames = loadReservedNames()): CheckViolation[] {
  const violations: CheckViolation[] = [];
  if (!reserved.classes.length && !reserved.keyframes.length) return violations;

  const classMap = new Map(reserved.classes.map((c) => [c.name, c]));
  const kfMap = new Map(reserved.keyframes.map((k) => [k.name, k]));

  for (const unit of collectCssUnits(root, [CHECK_IDS.cssNamespace])) {
    const push = (line: number, message: string): void => {
      if (isDisabled(unit.disabled, line, CHECK_IDS.cssNamespace)) return;
      violations.push({ file: unit.rel, line, message });
    };

    // ① 裸定义宿主保留类名
    for (const def of bareClassDefinitions(unit.cleaned)) {
      const entry = classMap.get(def.name);
      if (!entry) continue;
      push(
        def.line,
        `${def.selector}  ← 裸定义宿主保留名 .${entry.name}（${entry.why}）——插件视图里宿主、共享组件与` +
          `所有插件同表，这个名字会命中别的元素。给自有元素改用插件前缀类名（如 .<你的插件>-…）；` +
          `要那个样子就直接用对应组件（@linkdesk/ui）`
      );
    }

    // ② 关键帧名撞宿主（@keyframes 同样是全局的）
    for (const kf of keyframeDefinitions(unit.cleaned)) {
      const entry = kfMap.get(kf.name);
      if (!entry) continue;
      push(
        kf.line,
        `@keyframes ${kf.name}  ← 与宿主关键帧同名（${entry.why}）——先加载者/后定义者互相覆盖。` +
          `改用插件前缀名（如 <你的插件>-${kf.name}）`
      );
    }
  }

  return violations;
}
