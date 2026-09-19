/**
 * @vitest-environment node
 *
 * dev 宿主保真对账（E6#134 · 2026-09-20）——「预览 = 真机」两件的结构性防漂移。
 *
 * 病根（第三方作者实测）：① dev 宿主 `:root` 兜底 token 只有 6 个，`--bg-card`/`--text-*` 不在
 * ⇒ 作者在真机能用的 `var(--bg-card)` 预览解析为空、面板全透明，被迫造中间兜底层（真机死代码）；
 * ② 挂载点 `#ld-root` 高度 auto ⇒ 插件 `height:100%` 塌陷，被迫写 ResizeObserver 自愈（又是死代码）。
 *
 * 防漂移机制 = **生成式对账**（本文件）：
 *   · 兜底集的 token 名集合必须**等于**壳 `src/index.css` 顶层 `:root` 块的集合（= 真机里插件
 *     可消费的 token 全集，`@linkdesk/ui` dist css 的 token 同源于此）。壳加减 token ⇒ 当场红，
 *     dev 宿主必须跟改——⛔ 不引入构建期依赖（对账只发生在测试期，dev-server 运行时不读 ui/壳）。
 *   · `#ld-root` 的定高链（html/body 100% → body flex column → #ld-root flex 吃满）必须在场——
 *     将来谁动宿主布局把定高弄丢，这条先红。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { devHostDir } from "./dev-server.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEV_HOST_HTML = join(devHostDir(), "index.html");
/** 壳仓 token 真源（monorepo 固定结构：src/ 上溯三级 = 仓根）——⛔ 不锚 dist 构建产物 */
const SHELL_INDEX_CSS = join(HERE, "../../../src/index.css");

/** 提取一段样式文本里顶层 `:root` 块内的自定义属性名集合 */
function rootTokenNames(styleText: string): Set<string> {
  const start = styleText.indexOf(":root");
  expect(start).toBeGreaterThanOrEqual(0);
  const open = styleText.indexOf("{", start);
  let depth = 1;
  let i = open + 1;
  while (depth > 0 && i < styleText.length) {
    if (styleText[i] === "{") depth++;
    if (styleText[i] === "}") depth--;
    i++;
  }
  return new Set([...styleText.slice(open + 1, i - 1).matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
}

describe("dev 宿主 :root 兜底集 ↔ 壳 :root 真源（E6#134 生成式对账）", () => {
  const devTokens = rootTokenNames(readFileSync(DEV_HOST_HTML, "utf8"));
  const shellTokens = rootTokenNames(readFileSync(SHELL_INDEX_CSS, "utf8"));

  it("兜底集 === 真源全集（壳有它没有 ⇒ 预览缺真机 token；它有壳没有 ⇒ 手抄自造名）", () => {
    expect(shellTokens.size).toBeGreaterThan(50); // 真源在位（读错路径先红，不让对账假绿）
    const missingInDev = [...shellTokens].filter((n) => !devTokens.has(n));
    const extraInDev = [...devTokens].filter((n) => !shellTokens.has(n));
    expect(missingInDev).toEqual([]);
    expect(extraInDev).toEqual([]);
  });

  it("作者实测点名过的两个 token 必须在场（--bg-card / --text-primary）——本格的导火索", () => {
    expect(devTokens.has("bg-card")).toBe(true);
    expect(devTokens.has("text-primary")).toBe(true);
  });

  it("宿主页面自身消费的 var(--xxx) ⊆ 兜底集（页面自己不许用不存在的 token）", () => {
    const html = readFileSync(DEV_HOST_HTML, "utf8");
    // 先剥块注释——注释里的示例（如「让插件 var(--xxx) 不至全黑」）不是消费
    const code = html.replace(/\/\*[\s\S]*?\*\//g, "");
    const consumed = [...code.matchAll(/var\(--([a-z0-9-]+)[),]/g)].map((m) => m[1]);
    const dangling = consumed.filter((n) => !devTokens.has(n));
    expect(dangling).toEqual([]);
  });
});

describe("dev 宿主 #ld-root 定高链（E6#134 防漂移）", () => {
  const html = readFileSync(DEV_HOST_HTML, "utf8");

  it("html/body 满高 + body 纵向 flex + #ld-root 吃满剩余（flex:1 且 min-height:0）", () => {
    expect(html).toMatch(/html,\s*body\s*\{[^}]*height:\s*100%/);
    expect(html).toMatch(/body\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/);
    expect(html).toMatch(/#ld-root\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0/);
  });
});
