/**
 * plugin-file-service `locateDir` 行为测试——E6#78。
 *
 * 与 `resolvePath` 的分工是本测试的判据：resolvePath 未命中会**回退首根拼一个未必存在的路径**
 * （入口解析语义，调用方拿去拼 URL 由加载器兜）；locateDir 回答的是「这插件在不在盘上」，
 * 不在就 null——市场详情页拿它决定「大小」行值画不画链接，画错 = 给用户一个点下去必然报错的入口。
 */
import { describe, it, expect, vi } from "vitest";
import * as path from "path";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => path.join("C:", "repo"),
    getPath: () => path.join("C:", "userdata"),
  },
}));

/** 存在的目录集合——existsSync 只对集合内的路径为真（不起真实盘）。
 *  半替身：保留原模块再换 existsSync（整模块替换砸掉 CJS interop——同文件其他 `fs` 具名导入会炸）；
 *  状态经 vi.hoisted 建（vi.mock 工厂被提升到 import 之前，普通顶层 const 工厂跑时还在 TDZ）。
 *  返回值必须带 `default`——Node 内建模块的 interop 缺口就在这一处。 */
const h = vi.hoisted(() => ({ existing: new Set<string>() }));
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  const patched = { ...actual, existsSync: (p: string) => h.existing.has(p) };
  return { ...patched, default: patched };
});

import { pluginFileService } from "./plugin-file-service";

const APP_ROOT = path.join("C:", "repo", "plugins");
const USER_ROOT = path.join("C:", "userdata", "plugins");
const toSlash = (p: string) => p.replace(/\\/g, "/");

describe("pluginFileService.locateDir（E6#78）", () => {
  it("盘上找不到 → null（resolvePath 会给一个不存在的路径，本方法不给）", () => {
    h.existing.clear();
    expect(pluginFileService.locateDir("ghost-plugin")).toBeNull();
    // 对照：resolvePath 同输入仍返回路径（入口解析语义——不存在的路径由加载器兜）
    expect(pluginFileService.resolvePath("ghost-plugin")).toContain("ghost-plugin");
  });

  it("app 根命中 → 该根下绝对路径（正斜杠）", () => {
    h.existing.clear();
    h.existing.add(path.join(APP_ROOT, "demo-plugin"));
    expect(pluginFileService.locateDir("demo-plugin")).toBe(toSlash(path.join(APP_ROOT, "demo-plugin")));
  });

  it("两根同名 → app 根遮蔽 userData 根（先命中先赢，非拼接、非后根覆盖）", () => {
    h.existing.clear();
    h.existing.add(path.join(APP_ROOT, "demo-plugin"));
    h.existing.add(path.join(USER_ROOT, "demo-plugin"));
    expect(pluginFileService.locateDir("demo-plugin")).toBe(toSlash(path.join(APP_ROOT, "demo-plugin")));
  });

  it("只有 userData 根命中 → 该根下绝对路径（用户安装家）", () => {
    h.existing.clear();
    h.existing.add(path.join(USER_ROOT, "demo-plugin"));
    expect(pluginFileService.locateDir("demo-plugin")).toBe(toSlash(path.join(USER_ROOT, "demo-plugin")));
  });

  it("空 id → null（不把首根拼成目录）", () => {
    h.existing.clear();
    expect(pluginFileService.locateDir("")).toBeNull();
  });
});
