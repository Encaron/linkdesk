/**
 * 外观 id 运行时归属仲裁（机制 B）单测——E6#111f／1.36。
 * 出处 = 1.36 §二.3 三条分支 ＋ 两条铁律；本文件是**纯函数**判据（不做 I/O），
 * 五处调用点（主题本 / 配方本 / flat 本 / 图标主题 / 共享图标）各自的接线单测在各自登记本的测试文件里。
 *
 * 🔴 本文件钉住的三条「最容易做错」：
 *   ① `occupied` 与 `prevOwner` 两参数的不同组合语义（`undefined` 的 prevOwner 有两种含义）；
 *   ② `appearanceIdGrants` **按 id 记证照**、**按空间取交集**——不是「被宽恕的仓名单」；
 *   ③ 永不 throw（拒 = 返 verdict，由调用方出声）。
 *
 * 测试夹具一律虚构值（硬约束 21）——除了**账里真实存在的**那几条保底 id（`dark` / `light` / `default` /
 *   `followTheme`）：它们是生成式账的内容，本文件必须拿真值测（账改了这里就该红）。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  judgeAppearanceId,
  logAppearanceIdRejection,
  hostReservedAppearanceIds,
  appearanceGrantHolders,
  NOOP_DISPOSE,
} from "./appearanceOwnership";

/**
 * 正控复用件：**证照持有者**（`theme-defaults`）在自己空间占兜底 `light` ⇒ 恒接受。
 * 两处判据都靠它当对照（「有证照就放行」），故抽成一件——别在两处各抄一遍。
 */
function expectGrantAccepted(space: "recipe" | "colorway"): void {
  expect(
    judgeAppearanceId({ space, id: "light", pluginId: "theme-defaults", prevOwner: undefined, occupied: false })
  ).toEqual({ accept: true });
}

describe("appearanceOwnership — 空位注册（没人占）", () => {
  it("插件占一个没人的 id → 接受（静默）", () => {
    expect(
      judgeAppearanceId({
        space: "recipe", id: "demo-plugin.demo-recipe", pluginId: "demo-plugin",
        prevOwner: undefined, occupied: false,
      })
    ).toEqual({ accept: true });
  });

  it("插件占**对应空间**的宿主兜底 id → 拒（判据②）", () => {
    const v = judgeAppearanceId({
      space: "recipe", id: "dark", pluginId: "demo-plugin",
      prevOwner: undefined, occupied: false,
    });
    expect(v.accept).toBe(false);
  });

  it("🔴 空间不串：配色栏的保底 id 拿到配方空间注册 → **不拒**（否则就是跨空间假红）", () => {
    // dark-fallback / light 是**配色**栏的兜底 id；拿它们当配方 id 注册不该被「顶替兜底」拦
    expect(
      judgeAppearanceId({
        space: "recipe", id: "dark-fallback", pluginId: "demo-plugin",
        prevOwner: undefined, occupied: false,
      })
    ).toEqual({ accept: true });
  });

  it("有证照者在**自己的空间**占兜底 id → 接受（`light` ⇒ theme-defaults，静默上位）", () => {
    expectGrantAccepted("recipe");
    expectGrantAccepted("colorway");
  });

  it("🔴 证照**按 id 记**：别的插件占同一个兜底 id ⇒ 拒（新插件永远不在表里）", () => {
    const v = judgeAppearanceId({
      space: "recipe", id: "light", pluginId: "some-new-plugin",
      prevOwner: undefined, occupied: false,
    });
    expect(v.accept).toBe(false);
  });

  it("宿主自己登记自己的兜底面（pluginId === undefined）→ 永不被拒", () => {
    for (const space of ["recipe", "colorway", "iconTheme"] as const) {
      const id = hostReservedAppearanceIds(space)[0];
      expect(
        judgeAppearanceId({ space, id, pluginId: undefined, prevOwner: undefined, occupied: false })
      ).toEqual({ accept: true });
    }
  });

  it("空保留面空间：共享图标没有宿主兜底 ⇒ 任一同 id 都只在③判（①的空位分支恒接受）", () => {
    expect(hostReservedAppearanceIds("sharedIcon")).toEqual([]);
    expect(
      judgeAppearanceId({
        space: "sharedIcon", id: "anything", pluginId: "demo-plugin",
        prevOwner: undefined, occupied: false,
      })
    ).toEqual({ accept: true });
  });
});

describe("appearanceOwnership — 已占用（occupied=true）", () => {
  it("同 pluginId 重注册 → 接受（装配路径多阶段；反向负控：不许拒）", () => {
    expect(
      judgeAppearanceId({
        space: "recipe", id: "demo-plugin.demo-recipe", pluginId: "demo-plugin",
        prevOwner: "demo-plugin", occupied: true,
      })
    ).toEqual({ accept: true });
  });

  it("🔴 同 pluginId 重注册**兜底 id** → 仍接受（装配多阶段，证照不必再看）", () => {
    // 例：theme-defaults 两阶段装配都声明 light——第二阶段不许因「占用者是宿主」被拒
    const v = judgeAppearanceId({
      space: "recipe", id: "light", pluginId: "theme-defaults",
      prevOwner: "theme-defaults", occupied: true,
    });
    expect(v).toEqual({ accept: true });
  });

  it("异插件同 id → 拒 ＋ 点名双方（判据③：先者保留）", () => {
    const v = judgeAppearanceId({
      space: "recipe", id: "demo-plugin.demo-recipe", pluginId: "other-plugin",
      prevOwner: "demo-plugin", occupied: true,
    });
    expect(v.accept).toBe(false);
    if (v.accept) throw new Error("unreachable");
    // 🔴 verdict 里**没有文案**（1.36 §三 坑 4）：只钉结构与当事双方；文案由出口测（本文件末）
    expect(v).toMatchObject({
      code: "taken",
      space: "recipe",
      id: "demo-plugin.demo-recipe",
      pluginId: "other-plugin",
      prevOwner: "demo-plugin",
    });
  });

  it("接管宿主兜底条目：有证照（light ⇐ theme-defaults）→ 接受", () => {
    expect(
      judgeAppearanceId({
        space: "recipe", id: "light", pluginId: "theme-defaults",
        prevOwner: undefined, occupied: true,
      })
    ).toEqual({ accept: true });
  });

  it("🔴 接管宿主兜底条目：无证照 → 拒（判据⑥：覆盖宿主要出声）", () => {
    const v = judgeAppearanceId({
      space: "recipe", id: "dark", pluginId: "demo-plugin",
      prevOwner: undefined, occupied: true,
    });
    expect(v.accept).toBe(false);
    if (v.accept) throw new Error("unreachable");
    expect(v).toMatchObject({ code: "host-reserved", space: "recipe", id: "dark", pluginId: "demo-plugin" });
    expect(v.prevOwner).toBeUndefined(); // 该分支不带占位者（拒因是「属于兜底面」，不是「被人占了」）
  });

  it("证照**按 id 记、不按空间记**——`light` 两栏都在 ⇒ 两空间都放行；`dark-fallback` 无证照 ⇒ 拒", () => {
    // ⚠️ 这里如实写着账的形状：`appearanceIdGrants` 是 `id → 持有者`，没有空间维度。
    //   今天 `light` 恰好在 recipe/colorway **两栏**都出现（保底配方 + 保底配色），证照也只有一条 ⇒ 两空间都放行。
    expectGrantAccepted("recipe");
    expectGrantAccepted("colorway");
    // 只在配色栏、且**没有**证照的保底 id ⇒ 拒（证照不是「主题仓通用豁免」）
    expect(
      judgeAppearanceId({
        space: "colorway", id: "dark-fallback", pluginId: "theme-defaults",
        prevOwner: undefined, occupied: false,
      }).accept
    ).toBe(false);
  });
});

describe("appearanceOwnership — flat 本面（键 = 显示名，reservedFace:false）", () => {
  it("显示名不是 id ⇒ **不判**「是不是宿主保留面」（空位注册恒接受）", () => {
    expect(
      judgeAppearanceId({
        space: "recipe", id: "Light", pluginId: "demo-plugin",
        prevOwner: undefined, occupied: false, reservedFace: false,
      })
    ).toEqual({ accept: true });
  });

  it("但⑥仍然生效：覆盖**无 pluginId 的旧条目**要出声（拒）", () => {
    const v = judgeAppearanceId({
      space: "recipe", id: "Dark", pluginId: "demo-plugin",
      prevOwner: undefined, occupied: true, reservedFace: false,
    });
    expect(v.accept).toBe(false);
  });

  it("🔴 reservedFace:false 时**证照也不生效**——它挂在②那条分支下（这是刻意：显示名没有证照概念）", () => {
    // 若哪天要让 flat 本也认证照，必须先在这里改判（本断言就是那道闸）
    const v = judgeAppearanceId({
      space: "recipe", id: "light", pluginId: "theme-defaults",
      prevOwner: undefined, occupied: true, reservedFace: false,
    });
    expect(v.accept).toBe(false);
  });

  it("同 pluginId 重注册（flat 本）→ 接受", () => {
    expect(
      judgeAppearanceId({
        space: "recipe", id: "Demo Dark", pluginId: "demo-plugin",
        prevOwner: "demo-plugin", occupied: true, reservedFace: false,
      })
    ).toEqual({ accept: true });
  });
});

describe("appearanceOwnership — 账的读法 ＋ 铁律", () => {
  it("hostReservedAppearanceIds——未列出的空间恒空（不许在别处再写一份字面量）", () => {
    expect(hostReservedAppearanceIds("recipe")).toEqual(["dark", "light"]);
    expect(hostReservedAppearanceIds("colorway")).toEqual(["dark-fallback", "light"]);
    expect(hostReservedAppearanceIds("iconTheme")).toEqual(["default"]);
    expect(hostReservedAppearanceIds("sentinel")).toEqual(["followTheme"]);
    expect(hostReservedAppearanceIds("sharedIcon")).toEqual([]);
  });

  it("appearanceGrantHolders——只有表里那一条证照；未列出的 id 恒空", () => {
    expect(appearanceGrantHolders("light")).toEqual(["theme-defaults"]);
    expect(appearanceGrantHolders("dark")).toEqual([]);
    expect(appearanceGrantHolders("dark-fallback")).toEqual([]);
    expect(appearanceGrantHolders("default")).toEqual([]);
  });

  it("🔴 永不 throw：任何输入都返回 verdict（拒 = 返对象，由调用方出声）", () => {
    const weird: Array<Parameters<typeof judgeAppearanceId>[0]> = [
      { space: "recipe", id: "", pluginId: "demo-plugin", prevOwner: undefined, occupied: true },
      { space: "sentinel", id: "followTheme", pluginId: "demo-plugin", prevOwner: undefined, occupied: false },
      { space: "iconTheme", id: "default", pluginId: "demo-plugin", prevOwner: "x", occupied: true },
    ];
    for (const o of weird) {
      expect(() => judgeAppearanceId(o)).not.toThrow();
      expect(typeof judgeAppearanceId(o).accept).toBe("boolean");
    }
  });

  it("NOOP_DISPOSE——被拒的注册返它（调用方契约：一切注册返 disposer，且它什么都不做）", () => {
    expect(() => NOOP_DISPOSE()).not.toThrow();
    expect(NOOP_DISPOSE()).toBeUndefined();
  });
});

/**
 * 🔴 出口文案（1.36 §三 坑 1：「报点文案属于判据的输出面」）——**判据绿 ≠ 作者看到的话是对的**。
 * 本组钉的是**作者真会读到的那几行**：点名双方 ／ 兜底面 ＋ 证照去向 ／ 配方成因句。
 */
describe("appearanceOwnership — 拒绝出口的文案", () => {
  afterEach(() => vi.restoreAllMocks());

  it("判③（跨插件同 id）：点名**双方** ＋ 给出只换第一段的改法", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logAppearanceIdRejection("[ThemeRegistry]", {
      accept: false, code: "taken", space: "recipe",
      id: "demo-plugin.mint-soda", pluginId: "other-plugin", prevOwner: "demo-plugin",
    });
    const line = String(err.mock.calls[0][0]);
    expect(line).toContain("[ThemeRegistry]");
    expect(line).toContain("demo-plugin");      // 先到者（被占用的那一方）
    expect(line).toContain("other-plugin");     // 后到者（被拒的那一方）
    expect(line).toContain("先者保留");
    expect(line).toContain("other-plugin.mint-soda"); // 只换第一段 ⇒ 带词干
    expect(line).toContain('空间 "recipe"');
  });

  it("判②（顶替宿主兜底）：说清「属于兜底面」＋ 指到 appearanceIdGrants 那条证照路", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logAppearanceIdRejection("[ThemeEngine]", {
      accept: false, code: "host-reserved", space: "colorway", id: "dark", pluginId: "demo-plugin",
    });
    const line = String(err.mock.calls[0][0]);
    expect(line).toContain("兜底面");
    expect(line).toContain("appearanceIdGrants");
    expect(line).toContain('空间 "colorway"'); // 空间码 = 作者在 SDK 腿里看到的词
    // 配方成因句**只在该传时传**：本条没传 ⇒ 不许冒出来
    expect(line).not.toContain("成因");
  });

  it("配色被拒 ⇒ 带上「是哪条配方」的成因句（否则作者只看到一个配色 id 会找不到北）", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logAppearanceIdRejection(
      "[ThemeRegistry]",
      { accept: false, code: "taken", space: "colorway", id: "mint-dew", pluginId: "demo-plugin", prevOwner: "other-plugin" },
      "demo-plugin.mint-soda"
    );
    const line = String(err.mock.calls[0][0]);
    expect(line).toContain('空间 "colorway"');
    expect(line).toContain('配方 "demo-plugin.mint-soda"');
    expect(line).toContain("整条配方不放行");
  });
});
