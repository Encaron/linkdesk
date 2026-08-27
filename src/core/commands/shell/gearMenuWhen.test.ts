/**
 * gear 菜单 when 门控回归测试——E5.8#153-fix。
 *
 * 用户实机 bug：每个齿轮都见「打开存储位置」「跟随主题」——根因 = ensureCoreCommands 漏传 when
 * （菜单项/命令注册都不带 when → 壳侧 getItems 过滤 whenExpr=undefined → matches 恒真裸奔）。
 * 本测试镜像修复后的注册模式（registerCommand + registerMenuItems 都带 when），
 * 经 handleSettingsChannel("menu:getItems") 端到端验证 when 门控 + overrides 生效。
 * fixture 卫生：命令 id 虚构（demo.*）；配置键用真实壳键（断言真实门控语义，同 ContextKeyService #153 测试先例）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { clearRegistrationLayers } from "../../registry/registrationTracker";
import { registerCommand, clearCommands } from "../../registry/commands/CommandRegistry";
import { registerMenuItems, clearMenus, MENU_SLOTS } from "../../registry/commands/MenuRegistry";
import { ContextKeyService } from "../../registry/commands/ContextKeyService";
import { handleSettingsChannel } from "../../services/plugins/IpcBridgeHandler/ui";
import type { MenuItemDescriptor } from "../../api/linkdesk-api";

const GEAR = MENU_SLOTS.SettingItemGear;
const OPEN_WHEN = "settingKey == 'app.backgroundImage' || settingKey == 'app.zoneBackgroundImage'";
const FOLLOW_WHEN = "settingModified && settingFollowTheme";

function registerGearItem(cmdId: string, when?: string): void {
  registerCommand("demo-plugin", {
    id: cmdId,
    title: "Demo",
    handler: async () => {},
    when,
  });
  registerMenuItems(GEAR, "demo-plugin", [{ command: cmdId, group: "navigation", when }]);
}

async function gearItems(context: Record<string, unknown>): Promise<MenuItemDescriptor[]> {
  return await handleSettingsChannel("menu:getItems", [GEAR, context]) as MenuItemDescriptor[];
}

describe("gear 菜单 when 门控（E5.8#153-fix 回归）", () => {
  beforeEach(() => {
    clearRegistrationLayers();
    clearCommands();
    clearMenus();
    ContextKeyService.clear();
  });

  it("打开存储位置——背景图两行 context 现 / 他行隐（overrides 权威）", async () => {
    registerGearItem("demo.action.openStorage", OPEN_WHEN);
    for (const key of ["app.backgroundImage", "app.zoneBackgroundImage"]) {
      const items = await gearItems({ settingKey: key });
      expect(items.find((i) => i.command === "demo.action.openStorage")).toBeTruthy();
    }
    for (const key of ["app.fontFamily", "app.surfaceRadius", "editor.fontSize"]) {
      const items = await gearItems({ settingKey: key });
      expect(items.find((i) => i.command === "demo.action.openStorage")).toBeFalsy();
    }
  });

  it("打开存储位置——全局 settingKey 污染不影响 context 门控（overrides 优先全局）", async () => {
    registerGearItem("demo.action.openStorage", OPEN_WHEN);
    ContextKeyService.setValue("settingKey", "app.backgroundImage"); // 全局被上一行污染
    const items = await gearItems({ settingKey: "app.fontFamily" });
    expect(items.find((i) => i.command === "demo.action.openStorage")).toBeFalsy();
  });

  it("跟随主题——resetsToTheme 键 + 已修改才现（settingModified && settingFollowTheme 全局门控）", async () => {
    registerGearItem("demo.action.followTheme", FOLLOW_WHEN);
    // 未修改 → 不现
    ContextKeyService.setValue("settingModified", false);
    ContextKeyService.setValue("settingFollowTheme", true);
    let items = await gearItems({ settingKey: "app.fontFamily" });
    expect(items.find((i) => i.command === "demo.action.followTheme")).toBeFalsy();
    // 非 resetsToTheme 键 → 不现
    ContextKeyService.setValue("settingModified", true);
    ContextKeyService.setValue("settingFollowTheme", false);
    items = await gearItems({ settingKey: "app.fontFamily" });
    expect(items.find((i) => i.command === "demo.action.followTheme")).toBeFalsy();
    // resetsToTheme 键 + 已修改 → 现
    ContextKeyService.setValue("settingModified", true);
    ContextKeyService.setValue("settingFollowTheme", true);
    items = await gearItems({ settingKey: "app.fontFamily" });
    expect(items.find((i) => i.command === "demo.action.followTheme")).toBeTruthy();
  });

  it("无 when 菜单项恒现（复制设置 ID 语义——非门控项不受影响）", async () => {
    registerGearItem("demo.action.copySettingId");
    const items = await gearItems({ settingKey: "app.fontFamily" });
    expect(items.find((i) => i.command === "demo.action.copySettingId")).toBeTruthy();
  });
});
