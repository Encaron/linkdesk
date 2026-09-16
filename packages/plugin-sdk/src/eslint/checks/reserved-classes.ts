/**
 * check-css-namespace 腿·**宿主关键帧名判据**（E6#109e；E6#109h-b① 起为双判据之一）。
 *
 * 🔴 判据（与壳仓 `scripts/check-css-namespace.mjs` 同源，见 11-样式命名空间审计.md）：
 *   插件视图的一张样式表里**同时装着宿主 CSS + 共享组件 CSS + 所有已加载插件的 CSS**（实机读数：
 *   池文档 8 张样式表）⇒ `@keyframes` 名是**全局标识符**（第二个命名空间）：一方「定义」、
 *   他方「定义」，两边互相覆盖——**不报错、只是动画长得不对**（先加载者/后定义者胜）。
 *
 *   本腿只管「**裸定义**」（`@keyframes` 名本身，与它被谁引用无关）。
 *
 * 保留名清单 = 包内 `schemas/reserved-class-names.json`（**单一真相源**，壳仓门禁读同一份）。
 *
 * ── 🔴 判据①「裸定义宿主保留类名」已**退役**（E6#109p-b · 轮次 1.28 · 2026-09-16）──
 *   退役依据（1.27 全量门禁体检实测，见 27 号档 §十二.2(a)）：
 *     ① **输入结构性为空**：判据① 的输入是清单的 **`classes` 段**，而该段**已随 E6#109l-b（1.21b）
 *        整块删除**（现只剩 `$comment` / `version` / `keyframes`）⇒ `classMap` **恒空** ⇒ 判据想报也报不出来。
 *        实验实证：往夹具插件写 `.badge { }`（当年 `classes` 里的头号名字）⇒ **只有前缀腿报点**，本腿一声不响。
 *     ② **同一轴上已被完全覆盖**：`plugin-prefix.ts` 判据① 要求「裸定义类名必须以 `<pluginId>-` 开头」
 *        ⇒ 插件**不可能**再裸定义 `.badge`（它必须以 `<pluginId>-` 开头），本腿在「裸定义」这一轴上无独有贡献。
 *     ③ **`classes` 段不会再回来**：E6#109l／1.21b 之后「自己定义的类名一律 `ldk-` 开头」是**结构性判定**
 *        （宿主与共享组件两侧都不查任何登记表）⇒ 登记表**只剩 `keyframes` 段**，这是终态。
 *   ⇒ 判据① 的**代码路径连同 `ReservedNames.classes` 字段一并删除**（留一个恒空字段当装饰 = 死代码）。
 *      ⛔ **别把它加回来**：要新增「不许裸定义某个类名」的判据，请改 `plugin-prefix.ts`（结构性、零清单）。
 *
 * ── 🔴 判据② 为什么**必须留**（这条别被上面的退役误伤）──
 *   `plugin-prefix.ts` 拿不到 `pluginId` 时**fail-closed**（报一条身份错误）——此时**本腿是唯一**
 *   还能逐点报出「你占了一个宿主关键帧名」的腿（1.27 实验 (d) 实证：删掉 `plugin.json` 的 `pluginId` 后，
 *   输出里出现了本腿的 `与宿主关键帧同名（宿主拖放区入场动画）`）。⇒ 本腿不是冗余：**它是 fail-closed 分支下的独报腿。**
 *
 * ⚠️ **清单本身不许删**——它仍是作者面 §12 那张关键帧表、`check-reserved-names-doc-sync` 对账门禁
 *    （双向钉住）与 `scripts/check-css-namespace.mjs` 判据⑧/反向核对的真相源。
 *
 * 知情绕行 = 标准 disable 注释（`CHECK_IDS.cssNamespace`），与另三条腿同一套机制。
 * ⚠️ 已知口径（详案 15 §二·选项 (A) 的代价，写进作者面是 1.14⑧ 的活）：**同一个 id 同时盖住
 *    「关键帧」与「前缀」两条判据**——既有 disable 注释会一起绕行（作者面已声明 disable = 知情绕行）。
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectCssUnits, type CheckViolation } from "./scan.js";
import { keyframeDefinitions } from "./css-selectors.js";
import { isDisabled, CHECK_IDS } from "./disable.js";

/**
 * 包内保留名清单定位（dist/eslint/checks/x.js → ../../../schemas = 包根/schemas；src 直跑同样命中）。
 * 🔴 写法必须是「路径式」（resolve + fileURLToPath）——`new URL(<字面量>, import.meta.url)` 是
 * Vite 的资产 URL 惯用式，本模块一旦被 Vite 处理会被改写成构建期资产引用（validate.ts 同款坑，E6#91e）。
 */
const RESERVED_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../schemas/reserved-class-names.json");

interface ReservedEntry {
  name: string;
  why: string;
}

/** 保留名表——**只剩关键帧**（`classes` 段与判据① 已随 E6#109p-b 退役，见文件头） */
export interface ReservedNames {
  keyframes: ReservedEntry[];
}

/**
 * 读保留名清单（**只剩 `keyframes` 段**）；文件缺失 ⇒ 空表（本腿静默，validate 侧另有存在性门禁）。
 * ⚠️ 清单里若还留着历史的 `classes` 键，**一律忽略**——判据① 已退役，没有任何「裸定义保留类名」的报点路径。
 */
export function loadReservedNames(file: string = RESERVED_FILE): ReservedNames {
  if (!existsSync(file)) return { keyframes: [] };
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    keyframes?: ReservedEntry[];
  };
  return { keyframes: raw.keyframes ?? [] };
}

export function runReservedClassCheck(root: string, reserved: ReservedNames = loadReservedNames()): CheckViolation[] {
  const violations: CheckViolation[] = [];
  if (!reserved.keyframes.length) return violations;

  const kfMap = new Map(reserved.keyframes.map((k) => [k.name, k]));

  for (const unit of collectCssUnits(root, [CHECK_IDS.cssNamespace])) {
    const push = (line: number, message: string): void => {
      if (isDisabled(unit.disabled, line, CHECK_IDS.cssNamespace)) return;
      violations.push({ file: unit.rel, line, message });
    };

    // 关键帧名撞宿主（@keyframes 同样是全局的）——本腿唯一的判据（判据① 已退役）
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
