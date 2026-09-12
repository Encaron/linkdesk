/**
 * 「更新」配置组声明单测——E6#57.9a（`src/App/config/update.ts`）。
 *
 * 这两个键**没有第二处声明**：设置页的「更新」组、后台调度器读的档位、首启发行说明开关，
 * 全都落在这份声明上。键名/默认值/枚举值写错的后果都是**静默**的——
 * `app.update.mode` 拼错 ⇒ `getConfigurationValue` 恒 `undefined` ⇒ 调度器永不自动检查（不报错）；
 * `enum` 少写 `"manual"` ⇒ 用户选了 manual 也存不进 schema。
 * 所以这里把「键名 + 类型 + 默认值 + 枚举」逐条钉死。
 *
 * ⚠️ 本测试**不覆盖**「startup.ts 是否真的调了 `registerUpdateConfiguration`」——那一步是接线，
 * 判据在 #57.9e 实机验证（设置页能看见「更新」组 + 改档立即生效）；纯单测里 import startup.ts
 * 会把整条启动链路拉进来（需要 window/CSS），得不偿失。
 *
 * ⚠️ 数组顺序是**用户可见顺序**（enum 下标与 enumDescriptions 一一对应）——改动即 UI 改动。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getPluginConfiguration, getDefaults, clearConfigurationRegistrations } from "../../core/registry/ConfigurationRegistry";
import { registerUpdateConfiguration } from "./update";

/** t() 桩——测试不验翻译，只验「文案走了 t()」（硬约束 2 的落点在实现，不在本测试） */
const t = (key: string) => key;

beforeEach(() => {
  clearConfigurationRegistrations();
  registerUpdateConfiguration(t);
});

describe("「更新」配置组（pluginId \"update\"）", () => {
  it("声明两个键，且恰好两个（多出来的键要有人消费）", () => {
    const contrib = getPluginConfiguration("update");

    expect(contrib?.title).toBe("更新");
    expect(Object.keys(contrib?.properties ?? {})).toEqual(["app.update.mode", "app.update.showReleaseNotes"]);
  });

  it("app.update.mode：string + 默认 auto + 枚举 [auto, manual]（顺序 = 用户可见顺序）", () => {
    const prop = getPluginConfiguration("update")?.properties["app.update.mode"];

    expect(prop?.type).toBe("string");
    expect(prop?.default).toBe("auto");
    expect(prop?.enum).toEqual(["auto", "manual"]);
    // 枚举逐项必须有说明文案（设置页下拉的副标题）——少一条就有一条选项是哑的
    expect(prop?.enumDescriptions).toHaveLength(2);
    // 组内二级标题（E5.8#78）：两个键分属不同组，不共用一个「检查更新」
    expect(prop?.group).toBe("检查更新");
  });

  it("app.update.showReleaseNotes：boolean + 默认 true", () => {
    const prop = getPluginConfiguration("update")?.properties["app.update.showReleaseNotes"];

    expect(prop?.type).toBe("boolean");
    expect(prop?.default).toBe(true);
    expect(prop?.group).toBe("发行说明");
  });

  it("默认值能被 `getDefaults()` 收走（值真值表：auto / true，不是 undefined）", () => {
    const defaults = getDefaults();

    expect(defaults["app.update.mode"]).toBe("auto");
    expect(defaults["app.update.showReleaseNotes"]).toBe(true);
  });

  it("不声明 onApply——两键都是被读取的存量值，不是动作", () => {
    const props = getPluginConfiguration("update")?.properties ?? {};

    for (const prop of Object.values(props)) expect(prop.onApply).toBeUndefined();
  });
});
