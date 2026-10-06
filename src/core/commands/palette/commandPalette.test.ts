/**
 * 归一化夹 01 案·D3 机械锁（三条路同源锁之二）——命令面板的 keybinding 必须接 formatKeyLabel 单权威。
 * 曾自带第三套 `.split("+").map(首字母大写).join("+")`：单键侥幸对、chord 必错成 `Ctrl+K ctrl+T`。
 * 锁「同源」而非字面值：DTO keybinding == formatKeyLabel(注册表原串)；负控 = 原串不得原样出现。
 * fixture 用虚构值（硬约束 21：demo-plugin / Demo Theme Pick）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { showSpy } = vi.hoisted(() => ({ showSpy: vi.fn() }));

vi.mock("../../services/ui/QuickPickService", () => ({
  QuickPickService: { show: showSpy, hide: vi.fn() },
}));

import { showCommandPalette } from "./commandPalette";
import { registerCommand, clearCommands, type Command } from "../../registry/commands/CommandRegistry";
import { findKeybindingForCommand } from "../../registry/commands/KeybindingRegistry";
import { formatKeyLabel } from "../../utils/formatKeyLabel";
import { ensureCoreKeybindings } from "../input-bindings/shellKeybindings";

/** 最近一次 QuickPickService.show 的 serialize（palette 传进池的 DTO 产线） */
function lastSerialize(): (cmd: Command) => { keybinding?: string } {
  const calls = showSpy.mock.calls;
  const opts = calls[calls.length - 1]![0] as unknown as {
    serialize: (cmd: Command) => { keybinding?: string };
  };
  return opts.serialize;
}

describe("命令面板 keybinding 同源锁（归一化夹 01 案·D3）", () => {
  beforeEach(() => {
    showSpy.mockClear();
    clearCommands();
    // 幂等——CORE_KEYBINDINGS：theme.pick = "ctrl+k ctrl+t"（chord 病灶：旧第三套写法必产出 Ctrl+K ctrl+T）
    ensureCoreKeybindings();
    registerCommand("demo-plugin", {
      id: "theme.pick",
      title: "Demo Theme Pick",
      category: "首选项",
      handler: async () => {},
    });
    registerCommand("demo-plugin", { id: "demo-plugin.noBinding", title: "Demo No Binding", handler: async () => {} });
    showCommandPalette();
  });

  it("chord：DTO keybinding == formatKeyLabel(原串)，逐字 Ctrl+K Ctrl+T；⛔ 原串不得原样出现", () => {
    const serialize = lastSerialize();
    const raw = findKeybindingForCommand("theme.pick")!.key; // "ctrl+k ctrl+t"
    const dto = serialize({
      id: "theme.pick",
      title: "Demo Theme Pick",
      category: "首选项",
    } as Command);
    expect(dto.keybinding).toBe(formatKeyLabel(raw));
    expect(dto.keybinding).toBe("Ctrl+K Ctrl+T"); // 可证伪的逐字读数——旧写法这里必红（Ctrl+K ctrl+T）
    expect(dto.keybinding).not.toBe(raw);
  });

  it("无绑定命令 → keybinding undefined（不长空键帽）", () => {
    const dto = lastSerialize()({ id: "demo-plugin.noBinding", title: "Demo No Binding" } as Command);
    expect(dto.keybinding).toBeUndefined();
  });
});
