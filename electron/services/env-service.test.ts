/**
 * env-service `pluginDataDirIfAny` 行为测试——E6#78。
 *
 * 该方法是市场详情页「数据位置」行的**判据**：非空才画那一行（同 VS Code「缓存」行 `if (!cacheSize) return`）。
 * 三态必须真：目录不存在（从没落盘）/ 存在但空 / 有内容。`readdirSync` 走 mock——不起真实盘。
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "C:\\fake\\userdata"), isPackaged: false, getAppPath: () => "C:\\repo" },
}));

/** 半替身：保留原模块再换 readdirSync（整模块替换砸掉 CJS interop——同文件其他 `fs` 具名导入会炸）；
 *  替身经 vi.hoisted 建（vi.mock 工厂被提升到 import 之前，普通顶层 const 工厂跑时还在 TDZ）；
 *  返回值必须带 `default`——Node 内建模块的 interop 缺口就在这一处。 */
const h = vi.hoisted(() => ({ readdirSync: vi.fn() }));
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  const patched = { ...actual, readdirSync: (...args: unknown[]) => h.readdirSync(...args) };
  return { ...patched, default: patched };
});

import { envService } from "./env-service";

const DATA_DIR = "C:\\fake\\userdata\\linkdesk\\plugins\\demo-plugin\\data";

describe("envService.pluginDataDirIfAny（E6#78）", () => {
  it("目录不存在（ENOENT）→ null（插件从没落盘 = 正常态，不画空行）", () => {
    h.readdirSync.mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    expect(envService.pluginDataDirIfAny("demo-plugin")).toBeNull();
  });

  it("目录存在但空 → null（点开是空文件夹 = 不给这个入口）", () => {
    h.readdirSync.mockReturnValue([]);
    expect(envService.pluginDataDirIfAny("demo-plugin")).toBeNull();
  });

  it("目录有内容 → 正斜杠绝对路径（与 resolvePath 同规，反斜杠在 URL 里不兼容）", () => {
    h.readdirSync.mockReturnValue(["cache"]);
    expect(envService.pluginDataDirIfAny("demo-plugin")).toBe(
      "C:/fake/userdata/linkdesk/plugins/demo-plugin/data",
    );
    // 探的是该插件自己的目录，不是别人的
    expect(h.readdirSync).toHaveBeenCalledWith(DATA_DIR);
  });
});
