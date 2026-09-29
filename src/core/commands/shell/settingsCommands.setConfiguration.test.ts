/**
 * settingsCommands 通用配置写测试——M2 生长格 `AI#66`（`workbench.action.setConfiguration`）。
 * 与 `settingsCommands.test.ts`（`core.openSettings` 首开形态）**分文件**：本组要一个「落盘成功」的
 * 干净环境，那边不碰配置写入；挤在一个文件里就得给无关用例也换上这套 mock。
 *
 * 覆盖（判据全在**回执形状**上——门外 AI 读的就是它）：
 *   - 成功：`applied:true` ＋ `previousUserValue`／`userValue`／`effectiveValue`（「改回什么」的答案）
 *   - 两种调用形等价（逐位 `("键", 值)` ＝ 单具名 `{key,value}`）＋ 键名首尾空白剪
 *   - **三道拒写门**：未声明 `undeclared`／`ai.*` 前缀 `blocked`／显示槽 `display-only`
 *   - **值形状**：类型 `bad-type`／枚举 `enum`／上下界 `below-minimum`·`above-maximum`
 *   - 坏参 `bad-args`：⛔ 一律**载荷里的报错**，⛔ 不抛异常（抛会被壳侧 `reportError` 弹用户红 toast）
 *   - 🔴 负控：被拒的键**真的没落进用户层**（不是只把回执改了个字样）
 *   - 零 `shellEvents.emit`（只挂门牌，不引新通道）
 *
 * ⚠️ **落盘桩成成功**：`vi.mock` 只换 `StorageService.write`（真落盘链的判据有它自己的用例——
 *    `ConfigurationService/__fixtures__/v7renameFixture.ts` 走真 `StorageService`，那里明写
 *    「不要把 write 桩成 no-op」）。本组关心**校验层与回执**，不关心盘上顺序，故不冲突。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../services/configuration/StorageService", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../services/configuration/StorageService")>();
  return { ...mod, write: vi.fn(async () => {}) };
});

import { clearRegistrationLayers } from "../../registry/registrationTracker";
import { executeCommandStrict, clearCommands } from "../../registry/commands/CommandRegistry";
import {
  registerConfiguration,
  clearConfigurationRegistrations,
  type ConfigurationContribution,
} from "../../registry/ConfigurationRegistry";
import { clearConfigurationCache, inspectConfiguration } from "../../services/configuration/ConfigurationService";
import { shellEvents } from "../../react/events/ShellEvents";
import { registerSettingsCommands } from "./settingsCommands";

const SET_CMD = "workbench.action.setConfiguration";
const CFG_PLUGIN = "set-test";
/** AI 接入族 = 宿主身份（`host-reserved.generated.ts` 的 `HOST_PSEUDO_PLUGIN_IDS`）——`ai.*` 归它 */
const AI_PLUGIN = "ai-bridge";

/**
 * 夹具键——每种「该被拦的形状」一个键：枚举／上下界／显示槽两态／数组对象。键取**非宿主前缀**
 * （`settest.*` 不撞保留面），`ai.*` 那条单独用宿主身份注册（见 `AI_CFG`）。
 */
const CFG: ConfigurationContribution = {
  title: "配置写测试组",
  properties: {
    "settest.mode": { type: "string", default: "auto", enum: ["auto", "custom"], description: "模式" },
    "settest.ratio": { type: "number", default: 0.5, minimum: 0, maximum: 1, description: "比例" },
    "settest.glass": { type: "boolean", default: false, description: "玻璃" },
    "settest.layers": { type: "array", default: [], description: "层" },
    "settest.statusText": { type: "string", default: "", description: "状态行", renderHint: "readonly" },
    "settest.applyBtn": { type: "string", default: "", description: "按钮", renderHint: "action" },
  },
};

const AI_CFG: ConfigurationContribution = {
  title: "AI 接入",
  properties: { "ai.mcp.enabled": { type: "boolean", default: false, description: "MCP 门锁" } },
};

type Reply = Record<string, unknown>;

/** 写一条并取回执——`executeCommandStrict` 的实参就是 `handler(...args)` 的实参 */
async function write(...args: unknown[]): Promise<Reply> {
  return (await executeCommandStrict(SET_CMD, undefined, ...args)) as Reply;
}

beforeEach(() => {
  clearRegistrationLayers();
  clearCommands();
  clearConfigurationRegistrations();
  clearConfigurationCache();
  registerConfiguration(CFG_PLUGIN, JSON.parse(JSON.stringify(CFG)) as ConfigurationContribution);
  registerConfiguration(AI_PLUGIN, JSON.parse(JSON.stringify(AI_CFG)) as ConfigurationContribution);
  registerSettingsCommands();
});

afterEach(() => {
  clearConfigurationCache();
});

describe("AI#66 setConfiguration——写成功与回执", () => {
  it("写已声明键：applied:true ＋ 三层值 ＋ 报错字段一个不带（⛔ 不填 undefined 占位）", async () => {
    const r = await write({ key: "settest.mode", value: "custom" });
    expect(r).toEqual({
      key: "settest.mode",
      applied: true,
      persisted: true,
      previousUserValue: null, // 没设过 ⇒ null（⛔ 不是 undefined：门外要能稳定读出「改回什么」）
      userValue: "custom",
      effectiveValue: "custom", // 用户层胜过 schema 默认 "auto"
    });
  });

  it("第二次写：previousUserValue = 上一次的值（撤销靠它，⛔ 不靠调用方自己记）", async () => {
    await write({ key: "settest.mode", value: "custom" });
    const r = await write({ key: "settest.mode", value: "auto" });
    expect(r).toMatchObject({ applied: true, previousUserValue: "custom", userValue: "auto", effectiveValue: "auto" });
  });

  it("两种调用形等价（逐位 ＝ 单具名）＋ 键名首尾空白剪（AI 拼串常见）", async () => {
    const positional = await write("settest.glass", true);
    const named = await write({ key: "  settest.glass  ", value: false });
    expect(positional).toMatchObject({ key: "settest.glass", applied: true, userValue: true });
    expect(named).toMatchObject({ key: "settest.glass", applied: true, userValue: false, previousUserValue: true });
    expect(Object.keys(named)).toEqual(Object.keys(positional)); // 形状同构：两形只差值
  });

  it("数组/对象照声明类型整包给（⛔ 不必包成对象——四值联合里 object 就是它的值）", async () => {
    const r = await write({ key: "settest.layers", value: [1, 2, 3] });
    expect(r).toMatchObject({ applied: true, userValue: [1, 2, 3] });
  });
});

describe("AI#66 setConfiguration——三道拒写门", () => {
  it("未声明键 ⇒ undeclared（⛔ 不写进 settings.json：未声明的键设置页不认）", async () => {
    const r = await write({ key: "settest.nope", value: 1 });
    expect(r).toMatchObject({ key: "settest.nope", applied: false, reason: "undeclared" });
    expect(String(r.error)).toContain("settest.nope");
    expect(inspectConfiguration("settest.nope").userValue).toBeUndefined(); // 负控：真没写
  });

  it("🔴 ai.* 前缀 ⇒ blocked：被管的那个不许改自己的门（门锁／调试端口／账本）", async () => {
    const r = await write({ key: "ai.mcp.enabled", value: true });
    expect(r).toMatchObject({ key: "ai.mcp.enabled", applied: false, reason: "blocked" });
    expect(String(r.error)).toContain("ai.");
    // 🔴 负控：这一道门真的拦住了写（不是只把回执改了个字样）
    expect(inspectConfiguration("ai.mcp.enabled").userValue).toBeUndefined();
  });

  it("显示槽（renderHint readonly／action）⇒ display-only（状态行与按钮不是设置值）", async () => {
    for (const key of ["settest.statusText", "settest.applyBtn"]) {
      const r = await write({ key, value: "x" });
      expect(r).toMatchObject({ key, applied: false, reason: "display-only" });
      expect(inspectConfiguration(key).userValue).toBeUndefined();
    }
  });
});

describe("AI#66 setConfiguration——值形状按声明面判", () => {
  it("类型不符 ⇒ bad-type（🔴 setConfigurationValue 自己**根本不判类型**，不判就会把字符串写进 number 键）", async () => {
    const cases: Array<[string, unknown, string]> = [
      ["settest.ratio", "0.5", "number"],
      ["settest.ratio", Number.NaN, "number"],
      ["settest.glass", "true", "boolean"],
      ["settest.layers", "x", "array"],
      ["settest.layers", { a: 1 }, "array"],
      ["settest.mode", 1, "string"],
    ];
    for (const [key, value, wantType] of cases) {
      const r = await write({ key, value });
      expect(r).toMatchObject({ key, applied: false, reason: "bad-type" });
      expect(String(r.error)).toContain(wantType);
      expect(inspectConfiguration(key).userValue).toBeUndefined();
    }
  });

  it("枚举外 ⇒ enum（🔴 这一条是本命令存在的理由：setConfigurationValue 对枚举违规是**静默 return**——照它报就会「回执说成功、盘上没动」）", async () => {
    const r = await write({ key: "settest.mode", value: "nope" });
    expect(r).toMatchObject({ key: "settest.mode", applied: false, reason: "enum" });
    expect(String(r.error)).toContain("auto"); // 报错里给出允许值，AI 一次就能改对
    expect(inspectConfiguration("settest.mode").userValue).toBeUndefined();
  });

  it("越过上下界 ⇒ below-minimum／above-maximum（⛔ 不静默落到盘上让滑杆读出越界值）", async () => {
    const high = await write({ key: "settest.ratio", value: 2 });
    expect(high).toMatchObject({ applied: false, reason: "above-maximum" });
    const low = await write({ key: "settest.ratio", value: -1, });
    expect(low).toMatchObject({ applied: false, reason: "below-minimum" });
    expect(inspectConfiguration("settest.ratio").userValue).toBeUndefined();
  });
});

describe("AI#66 setConfiguration——坏参出声（载荷里，不抛）", () => {
  it("取不齐 {key,value} ⇒ bad-args；变体覆盖：空串／单值／缺 value／错类型首参", async () => {
    const bads: unknown[] = [undefined, "", "   ", 42, null, { key: "settest.mode" }, { value: 1 }, []];
    for (const bad of bads) {
      const r = await write(bad);
      expect(r).toMatchObject({ key: null, applied: false, reason: "bad-args" });
      expect(String(r.error)).toContain("key");
    }
  });

  it("🔴 全程零抛出（抛异常会被壳侧 reportError 弹用户红 toast——写错键名的 AI 与点命令面板的用户都不该吃这个）", async () => {
    for (const args of [[{ key: "no.such", value: 1 }], [undefined], [{ key: "ai.mcp.enabled", value: true }]]) {
      await expect(executeCommandStrict(SET_CMD, undefined, ...args)).resolves.toBeDefined();
    }
  });

  it("零 shellEvents.emit（写命令只挂门牌：生效靠 ConfigurationService 的既有变更链）", async () => {
    const emitSpy = vi.spyOn(shellEvents, "emit");
    await write({ key: "settest.glass", value: true });
    await write({ key: "settest.nope", value: 1 });
    expect(emitSpy).not.toHaveBeenCalled();
    emitSpy.mockRestore();
  });
});
