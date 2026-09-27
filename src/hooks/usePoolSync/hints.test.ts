/**
 * buildCommandHints 单测——04「悬停提示系统」件 1（命令表：`data-hint-command` 的自动补文案与快捷键）。
 *
 * 这张表的两条承诺各有一条失效方向，都静默：
 *   ① **与菜单同源**（快捷键取第一个匹配的绑定——与 `titlebar.resolveItemNode` 同一口径）
 *      ⇒ 若哪天两处口径分叉，用户会在同一命令上看到菜单一个键、提示一个键；
 *   ② **发全量命令**（含没有快捷键的）⇒ 少发则 `data-hint-command` 写了也**不出条**（最难查的一类）。
 * 用例逐条钉住，另加「空 title 不进表」（防一条没有字的提示）。
 */
import { describe, expect, it, beforeEach } from "vitest";
import type { TFunction } from "i18next";
import { clearRegistrationLayers } from "../../core/registry/registrationTracker";
import { registerCommand, clearCommands } from "../../core/registry/commands/CommandRegistry";
import { registerKeybinding, removeKeybindingForCommand } from "../../core/registry/commands/KeybindingRegistry";
import { buildCommandHints } from "./hints";

/** 身份 t——壳 i18n key = 中文原文（纯函数测试不需要真字典） */
const t = ((key: string) => key) as unknown as TFunction;
const PLUGIN = "hint-demo";
/** 注册一条命令——`handler` 是 `Command` 的必填项（本件只读 title，给个空实现） */
const cmd = (id: string, title: string) => registerCommand(PLUGIN, { id, title, handler: async () => {} });

beforeEach(() => {
  clearRegistrationLayers();
  clearCommands();
});

describe("buildCommandHints 命令表序列化", () => {
  it("命令 title 过 t() —— 池哑渲染（显示文本铁律）", () => {
    cmd("demo.a", "演示命令 A");
    expect(buildCommandHints(t)).toEqual({ "demo.a": { title: "演示命令 A" } });
  });

  it("有绑定的命令 ⇒ keybinding 为**已格式化**串（池不 import core，格式化在壳侧做完）", () => {
    cmd("demo.b", "演示命令 B");
    registerKeybinding({ command: "demo.b", key: "ctrl+k ctrl+t", source: "builtin" });
    expect(buildCommandHints(t)["demo.b"]).toEqual({ title: "演示命令 B", keybinding: "Ctrl+K Ctrl+T" });
  });

  it("同命令多绑定 ⇒ 取**第一个**（与菜单 resolveItemNode 的 find 同口径——两把尺子必然漂移）", () => {
    cmd("demo.c", "演示命令 C");
    registerKeybinding({ command: "demo.c", key: "ctrl+1", source: "builtin" });
    registerKeybinding({ command: "demo.c", key: "ctrl+2", source: "user", when: "focusedView == terminal" });
    expect(buildCommandHints(t)["demo.c"].keybinding).toBe("Ctrl+1");
  });

  it("**没有快捷键的命令照样进表**（只带 title）——否则 data-hint-command 写了不出条", () => {
    cmd("demo.noKb", "无键命令");
    expect(buildCommandHints(t)["demo.noKb"]).toEqual({ title: "无键命令" });
  });

  it("title 为空 ⇒ 不进表（防「一条没有字的提示」——渲染器侧还会再拦一道）", () => {
    cmd("demo.empty", "");
    expect(buildCommandHints(t)["demo.empty"]).toBeUndefined();
  });

  it("t() 返回空（缺翻译）⇒ 不进表（同上，宁可不出条也不出空条）", () => {
    cmd("demo.untranslated", "some.missing.key");
    const emptyT = (() => "") as unknown as TFunction;
    expect(buildCommandHints(emptyT)["demo.untranslated"]).toBeUndefined();
  });

  it("绑定存在但命令不在注册表 ⇒ 不进表（命令表以命令为骨——孤儿绑定不是提示点）", () => {
    registerKeybinding({ command: "ghost.command", key: "ctrl+g", source: "builtin" });
    expect(buildCommandHints(t)["ghost.command"]).toBeUndefined();
  });

  it("空键串的绑定 ⇒ 不写 keybinding（不出空键帽）", () => {
    cmd("demo.blank", "空键命令");
    registerKeybinding({ command: "demo.blank", key: "", source: "builtin" });
    expect(buildCommandHints(t)["demo.blank"]).toEqual({ title: "空键命令" });
  });

  it("现场算、不缓存：先建表再加命令 ⇒ 下次调用即有（插件装卸/激活后新命令立即可用）", () => {
    expect(buildCommandHints(t)["demo.late"]).toBeUndefined();
    cmd("demo.late", "后到的命令");
    expect(buildCommandHints(t)["demo.late"]).toEqual({ title: "后到的命令" });
  });

  it("清理：绑定移除后重算不再带 keybinding（表是快照，不是历史）", () => {
    cmd("demo.d", "演示命令 D");
    registerKeybinding({ command: "demo.d", key: "ctrl+d", source: "builtin" });
    expect(buildCommandHints(t)["demo.d"].keybinding).toBe("Ctrl+D");
    removeKeybindingForCommand("demo.d");
    expect(buildCommandHints(t)["demo.d"]).toEqual({ title: "演示命令 D" });
  });
});
