/**
 * 许可权益存储单测——R4-1.3（I21）：{userData}/licenses.json 唯一 owner 的读写轮转。
 * mock electron（app.getPath 指真实临时目录）——照 filesystem-guard.test.ts 集成式单测先例。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const electronMock = vi.hoisted(() => {
  let userData = "";
  return { app: { getPath: vi.fn(() => userData), setUserData: (p: string) => { userData = p; } } };
});
vi.mock("electron", () => electronMock);

import { licenseStore, withoutEntry } from "./license-store-service.js";
import type { LicenseEntitlement } from "../../src/core/api/linkdesk-api/types";

const ENT: LicenseEntitlement = { pluginId: "paid-plugin", verifiedAt: "2026-11-20T00:00:00Z" };
const ENT2: LicenseEntitlement = { pluginId: "other-plugin", exp: 4070880000, machineBound: true, verifiedAt: "2026-11-20T01:00:00Z" };

let tmp = "";

describe("licenseStore（{userData}/licenses.json 唯一 owner）", () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "linkdesk-licenses-test-"));
    electronMock.app.setUserData(tmp);
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("put → list 轮转 + 落盘文件名 = licenses.json", async () => {
    await licenseStore.put(ENT);
    await licenseStore.put(ENT2);
    expect(await licenseStore.list()).toEqual([ENT, ENT2]);
    expect(fs.readdirSync(tmp)).toEqual(["licenses.json"]);
  });

  it("重复验签同一插件 = pluginId 键去重刷新（幂等）", async () => {
    await licenseStore.put(ENT);
    const refreshed: LicenseEntitlement = { ...ENT, verifiedAt: "2026-11-21T00:00:00Z" };
    await licenseStore.put(refreshed);
    expect(await licenseStore.list()).toEqual([refreshed]);
  });

  it("remove 精确删一条（withoutEntry 不 mutate 入参）", async () => {
    await licenseStore.put(ENT);
    await licenseStore.put(ENT2);
    await licenseStore.remove("paid-plugin");
    expect(await licenseStore.list()).toEqual([ENT2]);
    const record = { a: ENT, b: ENT2 };
    expect(Object.keys(withoutEntry(record, "a"))).toEqual(["b"]);
    expect(Object.keys(record)).toEqual(["a", "b"]); // 入参不被 mutate
  });

  it("文件不存在/坏 JSON ＝ 空表（ENOENT = 从未验过签的正常态）", async () => {
    expect(await licenseStore.list()).toEqual([]);
    fs.writeFileSync(path.join(tmp, "licenses.json"), "not json", "utf8");
    expect(await licenseStore.list()).toEqual([]);
  });
});
