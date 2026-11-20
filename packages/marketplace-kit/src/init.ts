/**
 * init——三种作者形态骨架生成（正典 11 §三/§九·9.1；详案 R4-4.3）。
 *
 * 形态判定与产物（裁决记录）：
 *   L0 单插件仓（根有 plugin.json、无 marketplace.json）→ **零配置**：什么都不生成——
 *      ⛔ 此形态绝不能写根 marketplace.json：一旦有了（哪怕空 plugins[]），市场 K5 回落链会改读
 *      marketplace.json（0 条）而**丢弃** plugin.json 合成的那 1 条 = 插件从商店里消失。
 *      --author 时补 authors/<id>.json（市场作者域按源根读取，L0 也吃）。
 *   L1 多插件仓 → 根 marketplace.json（空 plugins[]，空集合法）＋ marketplace.config.json
 *      （publish v2 侧声明：作者身份/店名/合集/首页板块——读取方 = SDK publish（棒 12 R4-4.5），
 *      本模板按 11 §九·9.1 的四类键落骨架）。
 *   L2 独立市场仓（--author）→ marketplace.json ＋ authors/<authorId>.json（身份/主页声明就在
 *      作者块里，市场直接读；无 npm 发布流 ⇒ 不写 config.json）。
 *
 * 判据（K 验收原话）：三形态产物**零改动可被市场读取**（空集合法）——init.test.ts 用同一套
 *   schema/validate 自证；$schema 引用指 unpkg（VS Code 补全与红波浪线，11 §八）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** src/ 与 dist/ 都在包根下一层 → ../templates 两种落点通用 */
const TEMPLATES_DIR = join(HERE, "..", "templates");

export type InitForm = "L0" | "L1" | "L2";

export interface InitOptions {
  dir: string;
  /** --author <id>：GitHub 用户名（身份正典推荐值）；缺省占位 your-github-username */
  author?: string;
}

export interface InitResult {
  form: InitForm;
  /** 实际写盘的文件（相对 dir）——L0 无产物 */
  written: string[];
  guidance: string[];
}

const AUTHOR_PLACEHOLDER = "your-github-username";

function render(template: string, authorId: string): string {
  return template.split("__AUTHOR_ID__").join(authorId);
}

function writeNew(dir: string, rel: string, content: string): string {
  const abs = join(dir, rel);
  if (existsSync(abs)) throw new Error(`${rel} 已存在——init 不覆盖已有文件（先删或手改）`);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
  return rel;
}

export function initMarketplace(opts: InitOptions): InitResult {
  const dir = opts.dir;
  const authorId = opts.author?.trim() || AUTHOR_PLACEHOLDER;

  if (existsSync(join(dir, "marketplace.json")))
    throw new Error("marketplace.json 已存在——init 不覆盖已有文件（先删或手改）");

  const l0 = existsSync(join(dir, "plugin.json"));

  // L0：零配置形态——⛔ 不写 marketplace.json（会截断 K5 回落链，见文件头）
  if (l0 && !opts.author) {
    return {
      form: "L0",
      written: [],
      guidance: [
        "L0 单插件仓：什么都不用加——把仓库地址（或 raw marketplace.json 直链的仓库主页形态）粘进商店「添加源」即得 1 个插件（市场读根 plugin.json 合成目录）。",
        "若想要作者主页/合集，用 `marketplace-kit init --author <你的GitHub用户名>` 补作者块（authors/<id>.json）。",
        "若仓库要放多个插件，用 `marketplace-kit init` 生成 L1 骨架（根 marketplace.json ＋ marketplace.config.json）。",
      ],
    };
  }

  const written: string[] = [];
  const guidance: string[] = [];

  // L0 + 作者块：不写 marketplace.json（⛔ 空集会顶掉 plugin.json 合成的那 1 条），只补 authors/<id>.json
  if (l0 && opts.author) {
    const authorsTpl = render(readFileSync(join(TEMPLATES_DIR, "authors.json"), "utf8"), authorId);
    const rel = writeNew(dir, join("authors", `${authorId}.json`), authorsTpl);
    written.push(rel);
    return {
      form: "L0",
      written,
      guidance: [
        "已补 authors/<id>.json（作者块）——同 authorId 跨仓声明即自动聚合；正文 sourceUrl 填你各仓的 marketplace.json 直链。",
        "本仓仍是 L0：市场继续读根 plugin.json 合成那 1 条，⛔ 不要手写根 marketplace.json（空集会顶掉它）。",
      ],
    };
  }

  const marketplaceTpl = render(readFileSync(join(TEMPLATES_DIR, "marketplace.json"), "utf8"), authorId);
  written.push(writeNew(dir, "marketplace.json", marketplaceTpl));

  if (opts.author) {
    // L2 独立市场仓：marketplace.json ＋ authors/<id>.json（身份/主页在作者块，市场直接读）
    const authorsTpl = render(readFileSync(join(TEMPLATES_DIR, "authors.json"), "utf8"), authorId);
    written.push(writeNew(dir, join("authors", `${authorId}.json`), authorsTpl));
    guidance.push(
      "L2 独立市场仓骨架：marketplace.json（plugins[] 填条目或留空）＋ authors/<id>.json（作者身份/仓库/主页板块）。",
      "作者块 homepage.sections 可声明大屏/合集/网格/榜单四类板块（schema 有 $schema 补全）；「按分类浏览」渲染器硬保留，不用声明。",
      "发布：npm 包走 `linkdesk-plugin-sdk publish`（棒 12 publish v2 起读 marketplace.config.json）；纯目录仓直接 git 托管本目录即可。",
    );
    return { form: "L2", written, guidance };
  }

  // L1 多插件仓：marketplace.json ＋ marketplace.config.json（publish v2 的读取对象）
  const configTpl = render(readFileSync(join(TEMPLATES_DIR, "marketplace.config.json"), "utf8"), authorId);
  written.push(writeNew(dir, "marketplace.config.json", configTpl));
  guidance.push(
    "L1 多插件仓骨架：根 marketplace.json（plugins[] 空集合法——publish 会按条目 upsert；手填也可）＋ marketplace.config.json（发布侧声明，SDK publish 读取）。",
    "每个插件仍需自己的 plugin.json；本仓作为源被添加时，市场读根 marketplace.json（⛔ 多插件仓没有根级 plugin.json 合成兜底）。",
  );
  return { form: "L1", written, guidance };
}
