/**
 * ContextKeyService 单元测试——when clause 解析器 + 求值器。
 * Phase 5d：验证表达式引擎在所有边界条件下行为正确。
 *
 * 对标 VS Code：src/vs/platform/contextkey/test/common/contextkey.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ContextKeyService } from "./ContextKeyService";

describe("ContextKeyService — when clause parser & evaluator", () => {
  beforeEach(() => {
    ContextKeyService.clear();
    ContextKeyService.initCoreKeys();
  });

  /* ── 空表达式 / 无条件 ── */

  it("空字符串 → 始终满足（无条件 = 始终显示）", () => {
    expect(ContextKeyService.matches("")).toBe(true);
    expect(ContextKeyService.matches(undefined)).toBe(true);
  });

  /* ── 裸 key（truthy check） ── */

  it("裸 key — true → 满足", () => {
    ContextKeyService.setValue("sourceOpen", true);
    expect(ContextKeyService.matches("sourceOpen")).toBe(true);
  });

  it("裸 key — false → 不满足", () => {
    ContextKeyService.setValue("sourceOpen", false);
    expect(ContextKeyService.matches("sourceOpen")).toBe(false);
  });

  it("裸 key — 未设置 → 不满足（undefined → falsy）", () => {
    expect(ContextKeyService.matches("unknownKey")).toBe(false);
  });

  /* ── NOT (!) ── */

  it("!true → false", () => {
    ContextKeyService.setValue("sourceOpen", true);
    expect(ContextKeyService.matches("!sourceOpen")).toBe(false);
  });

  it("!false → true", () => {
    ContextKeyService.setValue("sourceOpen", false);
    expect(ContextKeyService.matches("!sourceOpen")).toBe(true);
  });

  it("!未设置 → true", () => {
    expect(ContextKeyService.matches("!unknownKey")).toBe(true);
  });

  /* ── AND (&&) ── */

  it("true && true → true", () => {
    ContextKeyService.setValue("sourceOpen", true);
    ContextKeyService.setValue("activeEditor", "terminal");
    expect(ContextKeyService.matches("sourceOpen && activeEditor == 'terminal'")).toBe(true);
  });

  it("true && false → false", () => {
    ContextKeyService.setValue("sourceOpen", true);
    ContextKeyService.setValue("activeEditor", "settings");
    expect(ContextKeyService.matches("sourceOpen && activeEditor == 'terminal'")).toBe(false);
  });

  /* ── OR (||) ── */

  it("false || true → true", () => {
    ContextKeyService.setValue("sourceOpen", false);
    ContextKeyService.setValue("activeEditor", "terminal");
    expect(ContextKeyService.matches("sourceOpen || activeEditor == 'terminal'")).toBe(true);
  });

  it("false || false → false", () => {
    ContextKeyService.setValue("sourceOpen", false);
    ContextKeyService.setValue("activeEditor", null);
    expect(ContextKeyService.matches("sourceOpen || activeEditor == 'terminal'")).toBe(false);
  });

  /* ── 等式 (==) ── */

  it("== 匹配 → true", () => {
    ContextKeyService.setValue("activeEditor", "terminal");
    expect(ContextKeyService.matches("activeEditor == 'terminal'")).toBe(true);
  });

  it("== 不匹配 → false", () => {
    ContextKeyService.setValue("activeEditor", "settings");
    expect(ContextKeyService.matches("activeEditor == 'terminal'")).toBe(false);
  });

  /* ── 不等式 (!=) ── */

  it("!= 不相等 → true", () => {
    ContextKeyService.setValue("activeEditor", "terminal");
    expect(ContextKeyService.matches("activeEditor != 'settings'")).toBe(true);
  });

  it("!= 相等 → false", () => {
    ContextKeyService.setValue("activeEditor", "terminal");
    expect(ContextKeyService.matches("activeEditor != 'terminal'")).toBe(false);
  });

  /* ── 数字比较 ── */

  it("数字 key == 数字字面量", () => {
    ContextKeyService.setValue("editorCount", 3);
    expect(ContextKeyService.matches("editorCount == 3")).toBe(true);
    expect(ContextKeyService.matches("editorCount == 5")).toBe(false);
  });

  it("editorCount != 0 → true（有标签页打开时）", () => {
    ContextKeyService.setValue("editorCount", 3);
    expect(ContextKeyService.matches("editorCount != 0")).toBe(true);
  });

  /* ── 括号分组 ── */

  it("(true || false) && true → true", () => {
    ContextKeyService.setValue("sourceOpen", true);
    ContextKeyService.setValue("activeEditor", "terminal");
    expect(ContextKeyService.matches("(sourceOpen || activeEditor == 'settings') && activeEditor == 'terminal'")).toBe(true);
  });

  it("运算符优先级：AND 优先于 OR", () => {
    // false || false && true → false || false → false（AND 优先）
    ContextKeyService.setValue("sourceOpen", false);
    ContextKeyService.setValue("activeEditor", "terminal");
    ContextKeyService.setValue("editorCount", 2);
    // sourceOpen || activeEditor == 'settings' && editorCount > 0
    // = false || false && true = false
    expect(ContextKeyService.matches("sourceOpen || activeEditor == 'settings' && editorCount != 0")).toBe(false);
  });

  /* ── 复杂组合 ── */

  it("activeEditor == 'terminal' && sourceOpen — 终端聚焦且数据源打开", () => {
    // 模拟：终端聚焦 + 数据源关闭 → "暂停"不可见
    ContextKeyService.setValue("activeEditor", "terminal");
    ContextKeyService.setValue("sourceOpen", false);
    expect(ContextKeyService.matches("activeEditor == 'terminal' && sourceOpen")).toBe(false);

    // 模拟：终端聚焦 + 数据源打开 → "暂停"可见
    ContextKeyService.setValue("sourceOpen", true);
    expect(ContextKeyService.matches("activeEditor == 'terminal' && sourceOpen")).toBe(true);
  });

  it("activeEditor == 'terminal' — 非终端标签页时终端命令不可见", () => {
    // 设置页聚焦
    ContextKeyService.setValue("activeEditor", "settings");
    expect(ContextKeyService.matches("activeEditor == 'terminal'")).toBe(false);

    // 终端聚焦
    ContextKeyService.setValue("activeEditor", "terminal");
    expect(ContextKeyService.matches("activeEditor == 'terminal'")).toBe(true);
  });

  /* ── true / false 字面量 ── */

  it("true 字面量 → 始终满足", () => {
    expect(ContextKeyService.matches("true")).toBe(true);
  });

  it("false 字面量 → 始终不满足", () => {
    expect(ContextKeyService.matches("false")).toBe(false);
  });

  /* ── 解析错误 → 安全 fallback = false ── */

  it("非法表达式 → false（不崩，不显示）", () => {
    expect(ContextKeyService.matches("activeEditor ==")).toBe(false); // 缺右值
    expect(ContextKeyService.matches("activeEditor 'terminal'")).toBe(false); // 缺操作符
  });

  // =~ (regex) reserved for Phase 6 — tokenizer does not yet support /.../ literal syntax
  // 设计文档 §6.1："langId =~ /^markdown/" — Phase 6 langId context key 消费

  /* ── in (集合成员) ── */

  it("in 集合包含 → true", () => {
    ContextKeyService.setValue("activeEditor", "terminal");
    expect(ContextKeyService.matches("activeEditor in ['terminal', 'settings']")).toBe(true);
  });

  it("in 集合不包含 → false", () => {
    ContextKeyService.setValue("activeEditor", "welcome");
    expect(ContextKeyService.matches("activeEditor in ['terminal', 'settings']")).toBe(false);
  });

  /* ── E5.8#153：背景图两行齿轮「打开存储位置」when 门控——只现两行，他行不现 ── */

  it("#153 门控——背景图两行 true / 他行 false", () => {
    const WHEN = "settingKey == 'app.backgroundImage' || settingKey == 'app.zoneBackgroundImage'";
    ContextKeyService.setValue("settingKey", "app.backgroundImage");
    expect(ContextKeyService.matches(WHEN)).toBe(true);
    ContextKeyService.setValue("settingKey", "app.zoneBackgroundImage");
    expect(ContextKeyService.matches(WHEN)).toBe(true);
    ContextKeyService.setValue("settingKey", "app.fontFamily");
    expect(ContextKeyService.matches(WHEN)).toBe(false);
    ContextKeyService.setValue("settingKey", "");
    expect(ContextKeyService.matches(WHEN)).toBe(false);
  });

  /* ── E5.8#153-fix：overrides（ContextMenu context prop）优先于全局 state ── */

  it("#153-fix eq——overrides 优先于全局（gear context.settingKey 权威）", () => {
    // 全局被污染成他行值，overrides 仍胜出（竞态广播不再影响门控）
    ContextKeyService.setValue("settingKey", "app.fontFamily");
    const WHEN = "settingKey == 'app.backgroundImage'";
    expect(ContextKeyService.matches(WHEN, { settingKey: "app.backgroundImage" })).toBe(true);
    expect(ContextKeyService.matches(WHEN, { settingKey: "app.zoneBackgroundImage" })).toBe(false);
  });

  it("#153-fix eq——无 overrides 时回落全局", () => {
    ContextKeyService.setValue("settingKey", "app.zoneBackgroundImage");
    expect(ContextKeyService.matches("settingKey == 'app.zoneBackgroundImage'")).toBe(true);
    expect(ContextKeyService.matches("settingKey == 'app.backgroundImage'")).toBe(false);
  });

  it("#153-fix neq——overrides 优先于全局", () => {
    ContextKeyService.setValue("settingKey", "app.backgroundImage");
    // overrides 说当前行是 app.fontFamily → != 'app.backgroundImage' 真（全局是背景图，旧行为假）
    expect(ContextKeyService.matches("settingKey != 'app.backgroundImage'", { settingKey: "app.fontFamily" })).toBe(true);
    expect(ContextKeyService.matches("settingKey != 'app.backgroundImage'", { settingKey: "app.backgroundImage" })).toBe(false);
  });

  it("#153-fix in——overrides 优先于全局", () => {
    ContextKeyService.setValue("activeEditor", "terminal");
    expect(ContextKeyService.matches("activeEditor in ['terminal', 'settings']", { activeEditor: "settings" })).toBe(true);
    expect(ContextKeyService.matches("activeEditor in ['terminal', 'settings']", { activeEditor: "welcome" })).toBe(false);
  });
});

describe("ContextKeyService — setValue / getValue / onDidChangeContext", () => {
  beforeEach(() => {
    ContextKeyService.clear();
  });

  it("setValue → getValue 往返", () => {
    ContextKeyService.setValue("sourceOpen", true);
    expect(ContextKeyService.getValue("sourceOpen")).toBe(true);
  });

  it("setValue 相同值不触发通知", () => {
    ContextKeyService.setValue("sourceOpen", true);
    let fired = false;
    ContextKeyService.onDidChangeContext(() => { fired = true; });
    ContextKeyService.setValue("sourceOpen", true); // 相同值
    expect(fired).toBe(false);
  });

  it("setValue 不同值触发通知", () => {
    ContextKeyService.setValue("sourceOpen", false);
    let changedKey = "";
    ContextKeyService.onDidChangeContext((key) => { changedKey = key; });
    ContextKeyService.setValue("sourceOpen", true);
    expect(changedKey).toBe("sourceOpen");
  });

  it("onDidChangeContext 返回 unsubscribe 函数", () => {
    let count = 0;
    const unsub = ContextKeyService.onDidChangeContext(() => { count++; });
    ContextKeyService.setValue("test", 1);
    expect(count).toBe(1);
    unsub();
    ContextKeyService.setValue("test", 2);
    expect(count).toBe(1); // 取消订阅后不再递增
  });

  it("initCoreKeys 初始化 3 个核心 key（sourceOpen/sourceName 已随 E5.8#47 外推）", () => {
    ContextKeyService.initCoreKeys();
    expect(ContextKeyService.getValue("activeEditor")).toBeNull();
    expect(ContextKeyService.getValue("editorHasSelection")).toBe(false);
    expect(ContextKeyService.getValue("editorCount")).toBe(0);
  });
});
