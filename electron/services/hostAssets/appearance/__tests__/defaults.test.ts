/**
 * hostAssets/appearance/defaults —— 起始目录 / 过滤器 / 扩展名白名单的唯一源。
 *
 * 判据（语义归属律）：换掉设置插件后，选图起始目录必须还在——它由本文件决定，不来自插件。
 */

import path from "node:path";
import { describe, expect, it } from "vitest";

import { APPEARANCE_EXTENSIONS, getAppearanceDefaults } from "../defaults";

const USER_DATA = path.join("C:", "Users", "you", "AppData", "Roaming", "linkdesk");

describe("hostAssets/appearance/defaults", () => {
  it("起始目录 = <userData>/appearance", () => {
    expect(getAppearanceDefaults(USER_DATA).dir).toBe(path.join(USER_DATA, "appearance"));
  });

  it("扩展名白名单 = png/jpg/jpeg/webp，且与选择框过滤器同源", () => {
    const d = getAppearanceDefaults(USER_DATA);
    expect([...APPEARANCE_EXTENSIONS]).toEqual(["png", "jpg", "jpeg", "webp"]);
    expect(d.extensions).toEqual([...APPEARANCE_EXTENSIONS]);
    expect(d.filters).toEqual([{ name: "图片", extensions: [...APPEARANCE_EXTENSIONS] }]);
  });

  it("D5-a：两个背景 target 同域同目录（target 只决定落点键，不改目录）", () => {
    // target 不参与默认值计算 ⇒ 重复调用恒等；两个背景在 schema 里共用 assetDomain + 不同 pickTarget
    expect(getAppearanceDefaults(USER_DATA)).toEqual(getAppearanceDefaults(USER_DATA));
  });
});
