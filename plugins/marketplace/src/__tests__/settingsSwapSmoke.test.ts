/**
 * 替换冒烟——marketplace 不依赖 settings 插件（万物皆可插件判据，2026-09-08 用户拍板）。
 *
 * 判据（plugin-independence-iron-law §插件互不依赖）：换 / 卸 settings 插件，marketplace 必须照常。
 * settings 对 marketplace 只 = 同一 marketplaceSources 键的「另一扇编辑门」；本测试树中 settings 彻底缺席——
 * 不 import 任何 settings 代码，只剩「磁盘上已存的数组值」一个影子（含历史脏残留形态）。
 * 本冒烟 = marketplace 自足域全链：读作者源（readConfiguredAuthorSources）→ 加源决策（decideAddSource，
 *   SearchView 弹窗同一纯函数）→ 落盘语义（仅 ok 才 set，镜像 SearchView）→ 重读（getSourceUrls）。
 * 证明 marketplace 凭自身代码 + 通用 window.linkdesk.configuration 即完整维持该键：官方源任何形态
 * （OFFICIAL_SOURCE_URL = 被测产品常量 main 直链；仓库主页/HEAD 为同身份形态）都拒加、永不落盘；
 * 换 settings 后官方目录照常由 getSourceUrls 前置注入。
 * fixture 全虚构（硬约束 21）：owner-two/owner-three 作者源仓库。
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { decideAddSource } from "../services/marketSourceAdd";
import { readConfiguredAuthorSources, getSourceUrls } from "../services/marketSources";
import { OFFICIAL_SOURCE_URL } from "../services/marketCatalog";

// 官方源形态——OFFICIAL_SOURCE_URL = main 直链（被测产品常量）；仓库主页/HEAD 直链为同身份其他形态
const OFFICIAL_REPO_PAGE = "https://github.com/encaron/linkdesk-marketplace";
const OFFICIAL_HEAD = "https://raw.githubusercontent.com/encaron/linkdesk-marketplace/HEAD/marketplace.json";
// 虚构作者源（硬约束 21）
const AUTHOR_A_MAIN = "https://raw.githubusercontent.com/owner-two/catalog-repo-b/main/marketplace.json";
const AUTHOR_A_REPO_PAGE = "https://github.com/owner-two/catalog-repo-b";
const AUTHOR_B_REPO_PAGE = "https://github.com/owner-three/catalog-repo-c";
const AUTHOR_A_RAW_HEAD = "https://raw.githubusercontent.com/owner-two/catalog-repo-b/HEAD/marketplace.json";

/** 配置面替身——get 读可变 stored（模拟持久化），set 写回；set.mock 可断言落盘次数 */
function makeConfig(initial: string[] | undefined) {
  let stored = initial;
  const get = vi.fn(async () => stored);
  const set = vi.fn(async (_key: string, v: unknown) => {
    stored = v as string[];
  });
  Object.defineProperty(window, "linkdesk", {
    value: { configuration: { get, set } },
    configurable: true,
  });
  return { get, set, stored: () => stored };
}

afterEach(() => {
  Reflect.deleteProperty(window, "linkdesk");
});

describe("替换冒烟——settings 缺席，marketplace 自足维持源键（E6#30c 万物皆可插件）", () => {
  it("冷盘：官方仅作 default 影子未落盘——marketplace 读=空、加源只存作者、官方任何形态拒加", async () => {
    const cfg = makeConfig(undefined); // 无 override——settings 未写过该键

    expect(await readConfiguredAuthorSources()).toEqual([]);

    // marketplace 自家弹窗加作者 A（仓库主页形态）→ ok，存原始形态
    const decision = decideAddSource(AUTHOR_A_REPO_PAGE, await readConfiguredAuthorSources());
    expect(decision).toEqual({ ok: true, next: [AUTHOR_A_REPO_PAGE] });
    if (decision.ok) await cfg.set("marketplace.marketplaceSources", decision.next); // SearchView 落盘点（仅 ok 才 set）
    expect(cfg.set).toHaveBeenCalledTimes(1);
    expect(cfg.stored()).toEqual([AUTHOR_A_REPO_PAGE]); // 纯作者源，无官方

    // 官方 main 直链形态 → 拒加（official），不落盘
    expect(decideAddSource(OFFICIAL_SOURCE_URL, await readConfiguredAuthorSources())).toEqual({
      ok: false,
      reason: "official",
    });
    expect(cfg.set).toHaveBeenCalledTimes(1);

    // 重读：官方源由 marketplace 自身注入且排首——不依赖任何已存值
    expect(await getSourceUrls()).toEqual([OFFICIAL_SOURCE_URL, AUTHOR_A_RAW_HEAD]);
  });

  it("热盘脏残留：settings/老代码曾写脏（官方主页+HEAD、作者多形态）——marketplace 自滤自愈", async () => {
    const cfg = makeConfig([OFFICIAL_REPO_PAGE, OFFICIAL_HEAD, AUTHOR_A_MAIN, AUTHOR_A_REPO_PAGE]);

    // 读边界自滤：官方两种形态不入作者列表；作者同身份保留首个原始形态
    expect(await readConfiguredAuthorSources()).toEqual([AUTHOR_A_MAIN]);

    // marketplace 加源门加官方仓库主页 → 拒加（身份判同官方），set 不被调用
    expect(decideAddSource(OFFICIAL_REPO_PAGE, await readConfiguredAuthorSources())).toEqual({
      ok: false,
      reason: "official",
    });
    expect(cfg.set).not.toHaveBeenCalled();

    // 加作者 A 另一形态（同身份已有）→ duplicate 拒
    expect(decideAddSource(AUTHOR_A_REPO_PAGE, await readConfiguredAuthorSources())).toEqual({
      ok: false,
      reason: "duplicate",
    });
    expect(cfg.set).not.toHaveBeenCalled();

    // 加真新作者 B → ok，追加到现有作者后
    const current = await readConfiguredAuthorSources();
    const addB = decideAddSource(AUTHOR_B_REPO_PAGE, current);
    expect(addB).toEqual({ ok: true, next: [AUTHOR_A_MAIN, AUTHOR_B_REPO_PAGE] });
    if (addB.ok) await cfg.set("marketplace.marketplaceSources", addB.next);

    // 落盘 = 纯作者源（官方主页/HEAD 残留被读边界滤掉，永不写回）
    expect(cfg.stored()).toEqual([AUTHOR_A_MAIN, AUTHOR_B_REPO_PAGE]);
    expect(cfg.set).toHaveBeenCalledTimes(1);

    // 重读拉取集：官方 main 恒首 + 两作者（B 主页归一 HEAD），官方无重复形态、无残留
    expect(await getSourceUrls()).toEqual([
      OFFICIAL_SOURCE_URL,
      AUTHOR_A_MAIN,
      "https://raw.githubusercontent.com/owner-three/catalog-repo-c/HEAD/marketplace.json",
    ]);
  });

  it("弹窗输入前置校验（纯决策）——空 / 非 http 拒；正常作者源通过", () => {
    expect(decideAddSource("   ", [])).toEqual({ ok: false, reason: "empty" });
    expect(decideAddSource("not-a-url", [])).toEqual({ ok: false, reason: "bad-url" });
    expect(decideAddSource("ftp://nope", [])).toEqual({ ok: false, reason: "bad-url" });
    expect(decideAddSource(AUTHOR_B_REPO_PAGE, []).ok).toBe(true);
  });
});
