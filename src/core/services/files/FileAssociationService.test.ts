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
