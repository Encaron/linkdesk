/**
 * FileAssociationService 单测——T7「DEFAULT_TAB_TYPE 去硬编码（角色挂牌）」。
 *
 * 钉住的是「写反了也照样能跑」的判据：
 * ① E3 双挂牌不静默漂移——激活序优先，第二家装上**不夺位**（与 E1 同规，零特殊逻辑）；
 * ② 激活序按**插件**记不按条目记——否则声明 45 条的老插件会凭条目数挤掉后来者；
 * ③ 挂牌者退出（卸载/禁用 ⇒ 注册被逆序回滚）⇒ 回声明序下一家（E6 的解析序核心）；
 * ④ E22 全无挂牌者 ⇒ `FALLBACK_PLUGIN_ID`（"welcome"）提示页语义——**不塞一个不存在的插件**；
 * ⑤ E23 孤儿 role（条目无扩展名）被忽略，不进挂牌索引（运行时侧；schema 层已拦）；
 * ⑥ 零回归：`role` 只是新增可选字段，getPluginFor/getPluginsFor 取值口径不变。
 *
 * fixture 全虚构（硬约束 21）：插件 id 用 `demo-*`、扩展名用 `zzz/qqq` 等虚构段。
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerFileAssociation,
  getPluginFor,
  getPluginsFor,
  getRoleHolders,
  resolveFallbackTabType,
  resolveOpenTarget,
  listHandlersFor,
  onSecondContender,
  normalizeAssociationOverrideKey,
  WORKBENCH_FILE_ASSOCIATIONS_KEY,
  clearFileAssociations,
  TEXT_FALLBACK_ROLE,
} from "./FileAssociationService";
import { rollback } from "../../registry/registrationTracker";
import { FALLBACK_PLUGIN_ID } from "../../utils/plugin/fallbackPluginId";

/** 玩家 A（官方壳随包那种）/ 玩家 B（第三方那种）——**都不叫 "editor"**，剧本自证壳不再写死该 id */
const HOLDER_A = "demo-editor-a";
const HOLDER_B = "demo-editor-b";

/** 挂一个挂牌插件：n 条扩展名，全部带 role */
function registerHolder(pluginId: string, exts: string[]): void {
  for (const ext of exts) {
    registerFileAssociation({ extension: ext, pluginId, displayName: ext.toUpperCase(), role: TEXT_FALLBACK_ROLE });
  }
}

beforeEach(() => {
  clearFileAssociations();
});

describe("resolveFallbackTabType（T7 角色挂牌兜底）", () => {
  it("① E3：两家挂牌 ⇒ 激活序在先者胜；第二家装上**不漂移**，两家在选择器并列", () => {
    registerHolder(HOLDER_A, ["zzz"]);
    expect(resolveFallbackTabType()).toBe(HOLDER_A);

    // 第二家挂牌者进场——只是进候选，当前默认不动（D7「牌=提名不是夺权」）
    registerHolder(HOLDER_B, ["qqq"]);
    expect(resolveFallbackTabType()).toBe(HOLDER_A);
    expect(getRoleHolders()).toEqual([HOLDER_A, HOLDER_B]);

    // 同一扩展名两家并列 = 选择器两家可挑（E3 的「选择器并列」）
    registerFileAssociation({ extension: "both", pluginId: HOLDER_A });
    registerFileAssociation({ extension: "both", pluginId: HOLDER_B });
    expect(getPluginsFor("both").map((a) => a.pluginId)).toEqual([HOLDER_A, HOLDER_B]);
    expect(getPluginFor("both")).toBe(HOLDER_A);
  });

  it("② 激活序按插件记：先挂牌者声明 45 条，后挂牌者 1 条 ⇒ 仍是先者优先", () => {
    registerHolder(
      HOLDER_A,
      Array.from({ length: 45 }, (_, i) => `e${i}`),
    );
    registerHolder(HOLDER_B, ["only"]);
    expect(resolveFallbackTabType()).toBe(HOLDER_A);
  });

  it("③ 先挂牌者被卸载 ⇒ 回声明序下一家（不落 welcome）", () => {
    registerHolder(HOLDER_A, ["zzz"]);
    registerHolder(HOLDER_B, ["qqq"]);
    rollback(HOLDER_A); // 卸载/禁用 ⇒ registrationTracker 逆序回滚其全部登记
    expect(getRoleHolders()).toEqual([HOLDER_B]);
    expect(resolveFallbackTabType()).toBe(HOLDER_B);
  });

  it("④ E22：所有挂牌者都不在 ⇒ welcome 提示页语义（不塞不存在的插件）", () => {
    registerHolder(HOLDER_A, ["zzz"]);
    rollback(HOLDER_A);
    expect(getRoleHolders()).toEqual([]);
    expect(resolveFallbackTabType()).toBe(FALLBACK_PLUGIN_ID);
  });

  it("⑤ E23：孤儿 role（条目无扩展名）被忽略，不产生挂牌者", () => {
    registerFileAssociation({ extension: "  ", pluginId: HOLDER_A, role: TEXT_FALLBACK_ROLE });
    expect(getRoleHolders()).toEqual([]);
    expect(resolveFallbackTabType()).toBe(FALLBACK_PLUGIN_ID);
  });

  it("⑥ 非挂牌条目不影响兜底；role 随条目原样列出（零回归）", () => {
    registerFileAssociation({ extension: "zzz", pluginId: HOLDER_B }); // 无 role = 普通声明
    expect(resolveFallbackTabType()).toBe(FALLBACK_PLUGIN_ID);
    expect(getPluginFor("zzz")).toBe(HOLDER_B);

    registerHolder(HOLDER_A, ["qqq"]);
    expect(resolveFallbackTabType()).toBe(HOLDER_A);
    // 挂牌条目本身照旧进「打开方式」表，role 字段随行透出
    expect(getPluginsFor("qqq")[0]).toMatchObject({ pluginId: HOLDER_A, role: "text-fallback" });
  });

  it("⑦ 归一化不回归：`.ZZZ` 与 `zzz` 同键，挂牌与声明同吃一张表", () => {
    registerFileAssociation({ extension: ".ZZZ", pluginId: HOLDER_A, role: TEXT_FALLBACK_ROLE });
    expect(getPluginFor("zzz")).toBe(HOLDER_A);
    expect(getRoleHolders()).toEqual([HOLDER_A]);
  });
});

describe("resolveOpenTarget（T2 解析纯函数 · 一处真相源）", () => {
  /** 两家声明 .zzz：A 先激活（=激活序优先），B 后来 */
  function twoContenders(): void {
    registerFileAssociation({ extension: "zzz", pluginId: HOLDER_A, displayName: "阅读器 A" });
    registerFileAssociation({ extension: "zzz", pluginId: HOLDER_B, displayName: "阅读器 B" });
    registerHolder(HOLDER_A, ["qqq"]); // 角色兜底由 A 承担
  }

  it("① 无覆盖 ⇒ 声明表激活序优先（E1：第二只装上不漂移）", () => {
    twoContenders();
    expect(resolveOpenTarget(".zzz")).toBe(HOLDER_A);
    expect(resolveOpenTarget("zzz")).toBe(HOLDER_A);
  });

  it("② 覆盖表命中且指向者在册 ⇒ 用户说了算（E2）", () => {
    twoContenders();
    expect(resolveOpenTarget("zzz", { ".zzz": HOLDER_B })).toBe(HOLDER_B);
  });

  it("③ E6/E7：覆盖指向已卸载/未声明者 ⇒ 视同未覆盖回声明序（键惰性语义由调用方持有）", () => {
    twoContenders();
    expect(resolveOpenTarget("zzz", { ".zzz": "demo-gone" })).toBe(HOLDER_A);
  });

  it("④ E25：覆盖键归一后精确匹配——`.ZZZ`/`zzz` 同键，不符者不生效", () => {
    twoContenders();
    expect(resolveOpenTarget("zzz", { ".ZZZ": HOLDER_B })).toBe(HOLDER_B);
    expect(resolveOpenTarget(".ZZZ", { zzz: HOLDER_B })).toBe(HOLDER_B);
  });

  it("⑤ 无声明者 ⇒ 角色兜底（T7 同档）；连挂牌者都没有 ⇒ welcome（E22）", () => {
    registerHolder(HOLDER_A, ["qqq"]);
    expect(resolveOpenTarget("pdf")).toBe(HOLDER_A); // 二进制类无声明者 → 挂牌者（editor 语义）
    expect(resolveOpenTarget("pdf", { ".pdf": HOLDER_B })).toBe(HOLDER_A); // 指向者未声明 ⇒ 覆盖失效
    expect(resolveOpenTarget("pdf", { ".pdf": FALLBACK_PLUGIN_ID })).toBe(HOLDER_A);
    rollback(HOLDER_A);
    expect(resolveOpenTarget("pdf")).toBe(FALLBACK_PLUGIN_ID);
  });

  it("⑥ 空扩展名（无扩展名文件/点开头文件，E8/E33）⇒ 不查声明表、直落角色兜底", () => {
    registerHolder(HOLDER_A, ["qqq"]);
    expect(resolveOpenTarget("")).toBe(HOLDER_A);
    expect(resolveOpenTarget("", { "": HOLDER_B })).toBe(HOLDER_A);
  });
});

describe("listHandlersFor（T2 只读面 · 选择器数据源）", () => {
  it("① 列全部声明者＋当前默认标记随覆盖表走；displayName 缺省回退 pluginId", () => {
    registerFileAssociation({ extension: "zzz", pluginId: HOLDER_A, displayName: "阅读器 A" });
    registerFileAssociation({ extension: "zzz", pluginId: HOLDER_B }); // 无 displayName
    expect(listHandlersFor(".zzz")).toEqual([
      { pluginId: HOLDER_A, displayName: "阅读器 A", isCurrent: true },
      { pluginId: HOLDER_B, displayName: HOLDER_B, isCurrent: false },
    ]);
    expect(listHandlersFor("zzz", { ".zzz": HOLDER_B })).toEqual([
      { pluginId: HOLDER_A, displayName: "阅读器 A", isCurrent: false },
      { pluginId: HOLDER_B, displayName: HOLDER_B, isCurrent: true },
    ]);
  });

  it("② 无声明者 ⇒ 空数组（选择器不可达：右键项 when 收敛，E13）", () => {
    expect(listHandlersFor("nobody")).toEqual([]);
    expect(listHandlersFor("")).toEqual([]);
  });
});

describe("第二竞争者事件（E1/E2 · D7 会话内一次）", () => {
  it("① 首个声明者不触发；第二家触发一次；同家再注册/重放不再触发", () => {
    const seen: string[] = [];
    onSecondContender((e) => seen.push(`${e.ext}:${e.pluginId}`));
    registerFileAssociation({ extension: "zzz", pluginId: HOLDER_A, displayName: "阅读器 A" });
    expect(seen).toEqual([]);
    registerFileAssociation({ extension: "zzz", pluginId: HOLDER_B, displayName: "阅读器 B" });
    expect(seen).toEqual([`zzz:${HOLDER_B}`]);
    registerFileAssociation({ extension: "zzz", pluginId: HOLDER_B }); // 同插件重复注册被忽略
    expect(seen).toEqual([`zzz:${HOLDER_B}`]);
  });

  it("② 退订后不再收；第三家（新 pluginId）仍会触发", () => {
    const seen: string[] = [];
    const unsub = onSecondContender((e) => seen.push(e.pluginId));
    registerFileAssociation({ extension: "zzz", pluginId: HOLDER_A });
    registerFileAssociation({ extension: "zzz", pluginId: HOLDER_B });
    unsub();
    const HOLDER_C = "demo-reader-c";
    registerFileAssociation({ extension: "zzz", pluginId: HOLDER_C });
    expect(seen).toEqual([HOLDER_B]);
  });
});

describe("覆盖表键形（D1）", () => {
  it("存储键 = 带点小写；键名常量归主进程/壳写读两侧共用", () => {
    expect(WORKBENCH_FILE_ASSOCIATIONS_KEY).toBe("workbench.fileAssociations");
    expect(normalizeAssociationOverrideKey(".PDF")).toBe(".pdf");
    expect(normalizeAssociationOverrideKey("zzz")).toBe(".zzz");
    expect(normalizeAssociationOverrideKey("  ")).toBe("");
  });

  it("onSecondContender 返回退订函数（幂等，二次调用不抛）", () => {
    const unsub = onSecondContender(() => {});
    expect(typeof unsub).toBe("function");
    expect(() => {
      unsub();
      unsub();
    }).not.toThrow();
  });
});
