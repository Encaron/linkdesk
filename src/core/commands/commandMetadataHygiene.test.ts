/**
 * 命令 / 菜单元数据卫生锁——归一化夹 02 批 T9。
 * 判据出处：docs/04-软件更新/待抉择池/归一化文案与称呼批.md §四 N1/N2/N4。
 *
 * 为什么要有这批锁：本轮的四处缺陷**都不是「写错一个字」**，而是**同一件事两种表达**——
 *   ① 分类有两个表达面：`category` 字段 vs 手写进 title 的「主题：」前缀；
 *   ② 同族两词：「开发者」vs「开发人员」、「偏好设置」vs「首选项」；
 *   ③ 状态借了字段：`category`（归属格）被塞「已隐藏」/「当前」/「切换 DevTools」；
 *   ④ 菜单 label 覆写与命令 title 逐字相同（覆写=冗余，读者以为两处不同）。
 * 这四类**靠人眼横排列比才看得出**（用户原话「太细小了一般不细读根本发现不了」），
 * 故落成机械判据：n=1 的规矩最容易被下一次改动悄悄破坏，这里把它钉住。
 *
 * ⚠️ 本文件的两条自守纪律（改它之前先读）：
 *   1. 每条锁都配**负控**（喂人造违规样本，必须判红）——不会红的锁等于没锁。
 *   2. 词表类锁（L2 分类词表）是**实测读数**的产物，不是偏好：新增分类词时应当**先想清楚它归哪个既有词**，
 *      确实要新增就把它加进白名单——那一下是刻意动作，而不是随手写个新词。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { clearRegistrationLayers } from "../registry/registrationTracker";
import { clearCommands, getCommands } from "../registry/commands/CommandRegistry";
import { clearMenus, getMenuItems, MENU_SLOTS } from "../registry/commands/MenuRegistry";
import { ensureCoreCommands } from "./shell/coreCommands";
import { registerShellMenus } from "./input-bindings/shellMenus";

// ── L1：分类不许手写进 title（正典 = category 字段独担分类） ──

/**
 * **中文** title 开头 ≤8 字内出现全角/半角冒号 = 手写分类前缀（「主题：选择主题…」「外观：复位外观覆盖…」）。
 *
 * 判据边界（有实测依据，别随手放宽/收紧）：
 *   - **只锁中文**——英文 title 里的「Category: Action」形（VS Code 的 palette 惯例）不是缺陷；
 *   - **只锁会渲染的命令**（见 isUserVisible）——`when: "false"` 的命令任何界面都不渲染，
 *     其 title 是**调试标签**不是 UI 文字（出处 aboutCommands.ts:84-86 那段 🔴 注释）。
 *     今日全壳唯一命中 `hasCategoryPrefix` 的就是 `app.aboutCopy → "About: Copy"`，它正属这两类豁免。
 */
export function hasCategoryPrefix(title: string): boolean {
  return /^[\u4e00-\u9fa5]{1,8}[：:]/.test(title);
}

/** 命令面板/菜单真会渲染的命令——`when: "false"` 永久隐藏（各文件头有 🔴 说明，不是漏配）。 */
function isUserVisible(cmd: { when?: string }): boolean {
  return cmd.when !== "false";
}

// ── L2：category 词表（实测读数——新增即刻意动作，见文件头纪律 2） ──

/** 全壳 category 正典词表。出处：`grep -rho 'category: "…"' src` 实测（归一化夹 02 批 N1 读数）。 */
export const CATEGORY_VOCAB: readonly string[] = [
  "首选项",
  "视图",
  "标签页",
  "帮助",
  "文件",
  "编辑器",
  "开发人员",
];

/** 分类词的**旧词/错词**——出现即判红（同族两词收口，档 §四 N3）。 */
export const CATEGORY_BANNED: readonly string[] = ["开发者", "偏好设置", "主题", "外观", "混搭"];

// ── L4：菜单 label 覆写与命令 title 逐字相同 = 冗余 ──

export function isRedundantOverride(itemLabel: string | undefined, cmdTitle: string | undefined): boolean {
  return Boolean(itemLabel) && Boolean(cmdTitle) && itemLabel === cmdTitle;
}

// ── L5：状态词不许借 category 格（正典：状态走 detail/checked） ──

export const STATE_WORDS: readonly string[] = ["当前", "已隐藏", "已激活"];

function registerAll(): void {
  ensureCoreCommands();
  registerShellMenus();
}

describe("命令/菜单元数据卫生锁（归一化夹 02 批 T9）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    registerAll();
  });

  describe("L1 分类走字段：命令 title 不得手写「分类：」前缀", () => {
    it("正控——会渲染的命令 title 无一命中中文分类前缀", () => {
      const bad = getCommands()
        .filter(isUserVisible)
        .filter((c) => hasCategoryPrefix(c.title))
        .map((c) => `${c.id} → ${c.title}`);
      expect(bad).toEqual([]);
    });

    it("负控——人造中文前缀样本必须判红（锁本身会红）；两类豁免不误伤", () => {
      expect(hasCategoryPrefix("主题：选择主题…")).toBe(true);
      expect(hasCategoryPrefix("外观：复位外观覆盖…")).toBe(true);
      expect(hasCategoryPrefix("混搭：复位为整体配方…")).toBe(true);
      // 豁免①：英文「Category: Action」形 = VS Code palette 惯例（正典，不是缺陷）
      expect(hasCategoryPrefix("About: Copy")).toBe(false);
      // 豁免②：when:"false" 不渲染（title 是调试标签）——判据只喂 isUserVisible 的命令
      expect(isUserVisible({ when: "false" })).toBe(false);
      expect(isUserVisible({ when: "sidebarPosition == 'left'" })).toBe(true);
      expect(isUserVisible({})).toBe(true);
      // 反例：真正的产品 title 不该误伤
      expect(hasCategoryPrefix("关于 LinkDesk")).toBe(false);
      expect(hasCategoryPrefix("选择主题")).toBe(false);
    });
  });

  describe("L2 category 词表：分类词只有正典那几个", () => {
    it("正控——所有 category 都住词表，且不含旧词", () => {
      const cats = getCommands().map((c) => c.category).filter((c): c is string => Boolean(c));
      const outside = [...new Set(cats)].filter((c) => !CATEGORY_VOCAB.includes(c));
      expect(outside).toEqual([]);
      const banned = cats.filter((c) => CATEGORY_BANNED.includes(c));
      expect(banned).toEqual([]);
    });

    it("负控——旧词/新造词必须判红", () => {
      expect(CATEGORY_VOCAB.includes("开发者")).toBe(false);
      expect(CATEGORY_BANNED.includes("开发者")).toBe(true);
      expect(CATEGORY_VOCAB.includes("首选项")).toBe(true);
    });
  });

  describe("L4 菜单 label 覆写：不得与命令 title 逐字相同", () => {
    it("正控——全壳菜单槽里没有冗余覆写", () => {
      const cmds = getCommands();
      const bad: string[] = [];
      for (const slot of Object.values(MENU_SLOTS)) {
        if (typeof slot !== "string") continue;
        const walk = (items: unknown[], where: string): void => {
          for (const raw of items) {
            if (typeof raw !== "object" || raw === null) continue;
            const item = raw as { command?: string; label?: string; children?: unknown[] };
            if (item.command) {
              const title = cmds.find((c) => c.id === item.command)?.title;
              if (isRedundantOverride(item.label, title)) bad.push(`${where}｜${item.command} → label/title 同为「${item.label}」`);
            }
            if (Array.isArray(item.children)) walk(item.children, where);
          }
        };
        walk(getMenuItems(slot) as unknown[], slot);
      }
      expect(bad).toEqual([]);
    });

    it("负控——覆写与 title 同文的样本必须判红；措辞不同的覆写不误伤", () => {
      expect(isRedundantOverride("切换开发人员工具", "切换开发人员工具")).toBe(true);
      // 正用：菜单换措辞/换视角（「快捷键列表」vs 命令「打开键盘快捷方式」）——必须放行
      expect(isRedundantOverride("快捷键列表", "打开键盘快捷方式")).toBe(false);
      // 菜单自报 title 缺失时不判（无从比较）
      expect(isRedundantOverride("切换到右侧", undefined)).toBe(false);
    });
  });

  describe("L5 字段挪用：状态词不许写进 category（归属格）", () => {
    /** 扫壳源码里 QuickPick 生产方的 serialize——`category:` 与状态词同现即判红。 */
    function findStateInCategory(): string[] {
      const hits: string[] = [];
      const files: string[] = [];
      const walk = (dir: string): void => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) {
            if (["dev", "__tests__", "node_modules"].includes(e.name)) continue;
            walk(p);
          } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
        }
      };
      walk("src");
      for (const f of files) {
        readFileSync(f, "utf8").split("\n").forEach((line, i) => {
          if (!/category\s*:/.test(line)) return;
          const word = STATE_WORDS.find((w) => line.includes(`"${w}"`));
          if (word) hits.push(`${f}:${i + 1} 把状态词「${word}」写进了 category`);
        });
      }
      return hits;
    }

    it("正控——没有任何生产方把状态词塞进 category", () => {
      expect(findStateInCategory()).toEqual([]);
    });

    it("负控——旧写法（隐藏项 category: t(\"已隐藏\")）形态必须被判据认出", () => {
      const oldLine = '      category: it.visible ? `${it.pluginId} · X` : i18n.t("已隐藏"),';
      const looksLikeViolation = /category\s*:/.test(oldLine) && STATE_WORDS.some((w) => oldLine.includes(`"${w}"`));
      expect(looksLikeViolation).toBe(true);
      const goodLine = '      detail: it.visible ? undefined : i18n.t("已隐藏"),';
      expect(/category\s*:/.test(goodLine)).toBe(false);
    });
  });
});
