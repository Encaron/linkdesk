/**
 * 「清空」语义单测（2026-10-05）——`clearKeybindingForCommand` 与 `resetKeybindingToDefault` 的分界。
 *
 * 立这一条是因为两者**必须不同**、而名字很像：
 *   · reset  = 只删 user 覆盖 ⇒ 作者（builtin/plugin）声明的键**顶回来**（＝回退）；
 *   · clear  = 删现存全部 ＋ 把命令记进抑制名册 ⇒ 作者默认被压掉、**重启后仍无键**（＝清空）。
 * 覆盖三件容易回归的事：① 抑制要能顶住「作者重新注册」（重启后插件/builtin 会再声明一次）；
 * ② 两种解除路径（用户重新绑定 / 恢复为默认）都要真的解除；③ 用户文件 `{command, key:""}` 往返稳定。
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  clearBindings,
  clearUserKeybindings,
  registerKeybinding,
  clearKeybindingForCommand,
  resetKeybindingToDefault,
  isCommandUnbound,
  getUnboundCommands,
  buildUserKeybindingsFile,
  applyUserKeybindingsFile,
  keybindingResolver,
  findKeybindingForCommand,
  type UserKeybindingEntry,
} from "./registry";

beforeEach(() => {
  clearBindings();
  clearUserKeybindings();
});

describe("clearKeybindingForCommand —— 清空（抑制作者默认）", () => {
  it("删掉现存绑定，并把命令记进抑制名册", () => {
    registerKeybinding({ command: "demo.save", key: "ctrl+1", source: "builtin" });
    expect(findKeybindingForCommand("demo.save")).toBeDefined();

    clearKeybindingForCommand("demo.save");

    expect(findKeybindingForCommand("demo.save")).toBeUndefined();
    expect(isCommandUnbound("demo.save")).toBe(true);
    expect(keybindingResolver.resolve("ctrl+1")).toBeUndefined(); // 主进程查表也拿不到 ⇒ 键不再被拦截
  });

  it("抑制顶得住「作者重新注册」——重启后 builtin/plugin 再声明也不落地", () => {
    clearKeybindingForCommand("demo.save");

    registerKeybinding({ command: "demo.save", key: "ctrl+1", source: "builtin" });
    registerKeybinding({ command: "demo.save", key: "ctrl+2", source: "plugin", pluginId: "demo" });

    expect(findKeybindingForCommand("demo.save")).toBeUndefined();
    expect(getUnboundCommands()).toEqual(["demo.save"]);
  });

  it("不受影响的命令照常注册（抑制只认名册里那一条）", () => {
    clearKeybindingForCommand("demo.save");
    registerKeybinding({ command: "demo.open", key: "ctrl+1", source: "builtin" });
    expect(findKeybindingForCommand("demo.open")).toBeDefined();
  });

  it("用户重新绑定 = 解除抑制（用户当下的意愿优先于之前的清空）", () => {
    registerKeybinding({ command: "demo.save", key: "ctrl+1", source: "builtin" });
    clearKeybindingForCommand("demo.save");

    registerKeybinding({ command: "demo.save", key: "ctrl+shift+1", source: "user" });

    expect(isCommandUnbound("demo.save")).toBe(false);
    expect(findKeybindingForCommand("demo.save")?.key).toBe("ctrl+shift+1");
    // 解除后作者默认也能重新落地（不再被压）
    registerKeybinding({ command: "demo.save", key: "ctrl+1", source: "builtin" });
    expect(findKeybindingForCommand("demo.save")?.source).toBe("user"); // user 仍优先
  });
});

describe("resetKeybindingToDefault —— 恢复为默认（回退，不是清空）", () => {
  it("只删 user 覆盖：作者默认顶回来", () => {
    registerKeybinding({ command: "demo.save", key: "ctrl+1", source: "builtin" });
    registerKeybinding({ command: "demo.save", key: "ctrl+shift+1", source: "user" });
    expect(findKeybindingForCommand("demo.save")?.source).toBe("user");

    resetKeybindingToDefault("demo.save");

    expect(findKeybindingForCommand("demo.save")?.key).toBe("ctrl+1"); // ← 与 clear 的分界就在这一行
    expect(findKeybindingForCommand("demo.save")?.source).toBe("builtin");
  });

  it("清空之后「恢复为默认」能解除抑制——作者默认回来", () => {
    registerKeybinding({ command: "demo.save", key: "ctrl+1", source: "builtin" });
    clearKeybindingForCommand("demo.save");
    expect(findKeybindingForCommand("demo.save")).toBeUndefined();

    resetKeybindingToDefault("demo.save"); // 此刻无 user 绑定可删，但抑制被摘掉
    expect(isCommandUnbound("demo.save")).toBe(false);

    registerKeybinding({ command: "demo.save", key: "ctrl+1", source: "builtin" }); // 作者重注册
    expect(findKeybindingForCommand("demo.save")?.key).toBe("ctrl+1");
  });
});

describe("用户文件形状 —— { command, key: \"\" } 清空标记", () => {
  it("写出：user 绑定在前、清空标记在后（同命令时后写者生效，往返稳定）", () => {
    registerKeybinding({ command: "demo.a", key: "alt+z", source: "user" });
    registerKeybinding({ command: "demo.b", key: "ctrl+9", source: "builtin" });
    clearKeybindingForCommand("demo.b");

    expect(buildUserKeybindingsFile()).toEqual([
      { command: "demo.a", key: "alt+z" },
      { command: "demo.b", key: "" },
    ]);
  });

  it("读入：空 key = 清空，非空 key = 用户绑定，往返等价", () => {
    registerKeybinding({ command: "demo.a", key: "alt+z", source: "user" });
    registerKeybinding({ command: "demo.b", key: "ctrl+9", source: "builtin" });
    clearKeybindingForCommand("demo.b");
    const file = buildUserKeybindingsFile();

    clearBindings();
    clearUserKeybindings();
    registerKeybinding({ command: "demo.b", key: "ctrl+9", source: "builtin" }); // 模拟重启后的作者注册
    applyUserKeybindingsFile(file);

    expect(findKeybindingForCommand("demo.a")?.key).toBe("alt+z");
    expect(findKeybindingForCommand("demo.b")).toBeUndefined(); // 被文件里的标记压掉
    expect(isCommandUnbound("demo.b")).toBe(true);
  });

  it("坏条目（缺 key / 缺 command）跳过——⛔ 不当成清空，别替用户表达他没做过的决定", () => {
    applyUserKeybindingsFile([
      { command: "demo.a" } as unknown as UserKeybindingEntry,
      { key: "ctrl+1" } as unknown as UserKeybindingEntry,
      {} as unknown as UserKeybindingEntry,
    ]);

    expect(getUnboundCommands()).toEqual([]);
    expect(findKeybindingForCommand("demo.a")).toBeUndefined();
  });

  it("重载用户态会连抑制名册一起清（否则文件删掉后命令永远无键）", () => {
    clearKeybindingForCommand("demo.save");
    expect(isCommandUnbound("demo.save")).toBe(true);

    clearUserKeybindings(); // 文件被删除 / 重载前调用

    expect(isCommandUnbound("demo.save")).toBe(false);
    registerKeybinding({ command: "demo.save", key: "ctrl+1", source: "builtin" });
    expect(findKeybindingForCommand("demo.save")?.key).toBe("ctrl+1");
  });
});
