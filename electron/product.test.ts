/**
 * product.ts 产品身份真相源单测——E6#57.1（06-主软件更新/02-产品身份与版本.md §2.2/§2.3）。
 *
 * mock electron（app.getAppPath/getVersion——bundled-install.test.ts 同款 vi.hoisted 模式）；
 * appRoot 指向真实临时目录，可控写/不写 electron/product.json 两种形态。逐断言：
 *   1. 有 product.json → loadProduct 读 nameLong/commit/date/quality/updateUrl；version 恒被
 *      app.getVersion() 覆盖（02 §2.3 单一真相源——忽略 product.json 自证值）
 *   2. 无 product.json / 字段空 → 兜底默认 + commit/date 降级 '—'（07 §四.1，永不抛）
 *   3. productRuntime 读 process.versions + os 拼接；os 为 `${platform} ${release}` 形
 *   4. productInfo() 组合 { product, runtime }（关于页 8 字段唯一来源，07 §三）
 * fixture 无真实插件名/文案（硬约束 21——本测试不涉插件，仅产品身份）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const electronMock = vi.hoisted(() => {
  const state: { appRoot: string; version: string } = { appRoot: "", version: "0.1.4" };
  const app = {
    isPackaged: false,
    getAppPath: () => state.appRoot,
    getVersion: () => state.version,
  };
  return { app, state };
});
vi.mock("electron", () => electronMock);

import { loadProduct, productRuntime, productInfo, __resetProductCache } from "./product.js";
import type { Product, ProductRuntime } from "./product.js";

const electron = electronMock;

/** 造临时 app 根；写不写 electron/product.json 由 opts 控制 */
async function makeAppRoot(withJson?: Record<string, unknown>): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "product-test-"));
  if (withJson) {
    const dir = path.join(root, "electron");
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, "product.json"), JSON.stringify(withJson));
  }
  return { root, cleanup: () => fs.promises.rm(root, { recursive: true, force: true }) };
}

/** 产品身份字段辅助：product.json 存在时对比真实读取值 */
const FULL_JSON = {
  nameLong: "LinkDesk",
  nameShort: "LinkDesk",
  version: "9.9.9", // 自证占位——必须被 app.getVersion() 覆盖（02 §2.3）
  commit: "abc1234",
  date: "2026-09-08T00:00:00.000Z",
  quality: "preview",
  updateUrl: "https://example.invalid/releases/latest",
};

describe("product identity (E6#57.1)", () => {
  afterEach(() => __resetProductCache());

  it("loadProduct 读 product.json 字段 + version 恒取 app.getVersion()（单一真相源覆盖自证值）", async () => {
    const { root, cleanup } = await makeAppRoot(FULL_JSON);
    try {
      electron.state.appRoot = root;
      electron.state.version = "0.1.4";
      const p: Product = loadProduct();
      expect(p.nameLong).toBe("LinkDesk");
      expect(p.nameShort).toBe("LinkDesk");
      expect(p.commit).toBe("abc1234");
      expect(p.date).toBe("2026-09-08T00:00:00.000Z");
      expect(p.quality).toBe("preview");
      expect(p.updateUrl).toBe("https://example.invalid/releases/latest");
      // 🔥 版本唯一运行时来源 = app.getVersion()——product.json 的 9.9.9 自证值被忽略
      expect(p.version).toBe("0.1.4");
    } finally {
      electron.state.appRoot = "";
      await cleanup();
    }
  });

  it("loadProduct 缺 product.json → 兜底默认 + commit/date 降级 '—'（永不抛）", async () => {
    const { root, cleanup } = await makeAppRoot();
    try {
      electron.state.appRoot = root;
      electron.state.version = "0.1.4";
      const p = loadProduct();
      expect(p.nameLong).toBe("LinkDesk");
      expect(p.version).toBe("0.1.4");
      expect(p.commit).toBe("—");
      expect(p.date).toBe("—");
      expect(p.quality).toBe("stable");
    } finally {
      electron.state.appRoot = "";
      await cleanup();
    }
  });

  it("loadProduct commit/date 空字段 → '—' 降级（dev 占位不崩）", async () => {
    const { root, cleanup } = await makeAppRoot({
      nameLong: "LinkDesk",
      nameShort: "LinkDesk",
      version: "0.1.0",
      commit: "",
      date: "",
      quality: "stable",
      updateUrl: "",
    });
    try {
      electron.state.appRoot = root;
      const p = loadProduct();
      expect(p.commit).toBe("—");
      expect(p.date).toBe("—");
      expect(p.updateUrl).toBe("");
    } finally {
      electron.state.appRoot = "";
      await cleanup();
    }
  });

  it("loadProduct 缓存单例——二次调用不重读文件（改文件不影响已缓存值）", async () => {
    const { root, cleanup } = await makeAppRoot(FULL_JSON);
    try {
      electron.state.appRoot = root;
      const first = loadProduct();
      // 改盘上文件，缓存命中 → 值不变
      await fs.promises.writeFile(
        path.join(root, "electron", "product.json"),
        JSON.stringify({ ...FULL_JSON, commit: "changed" }),
      );
      expect(loadProduct().commit).toBe(first.commit);
      // 清缓存 → 重读到新值
      __resetProductCache();
      expect(loadProduct().commit).toBe("changed");
    } finally {
      electron.state.appRoot = "";
      await cleanup();
    }
  });

  it("productRuntime 读 process.versions + os 拼接（os 为 `${platform} ${release}` 形）", () => {
    const rt: ProductRuntime = productRuntime();
    expect(rt.os).toBe(`${process.platform} ${os.release()}`);
    // node/v8 恒有（vitest 跑在 node）；electron/chromium 缺（非 electron 运行时）→ '—' 降级
    expect(rt.node).toBeTruthy();
    expect(rt.v8).toBeTruthy();
    if (process.versions.electron === undefined) expect(rt.electron).toBe("—");
    if (process.versions.chrome === undefined) expect(rt.chromium).toBe("—");
  });

  it("productInfo 组合 { product, runtime }（关于页 8 字段唯一来源）", async () => {
    const { root, cleanup } = await makeAppRoot(FULL_JSON);
    try {
      electron.state.appRoot = root;
      electron.state.version = "0.1.4";
      const info = productInfo();
      expect(info.product.version).toBe("0.1.4");
      expect(info.product.commit).toBe("abc1234");
      expect(info.runtime.os.length).toBeGreaterThan(0);
      expect(typeof info.product.nameLong).toBe("string");
    } finally {
      electron.state.appRoot = "";
      await cleanup();
    }
  });
});
