/**
 * 许可权益存储——R4-1.3（I21·正典 09 §三·补3）：壳侧权益的**唯一 owner**。
 * 09 v1.1 拍板「权益记录住壳（裁决层）」：市场被整体替换，权益与安装门仍在——存储在主进程
 * （比渲染进程更深一层：池插件零触达），文件 {userData}/licenses.json。
 *
 * 形状：`Record<pluginId, LicenseEntitlement>`（pluginId 为键 = 天然去重，重复验签 = 刷新记录）。
 * 单 owner 纪律（设计决策#20 同款）：全仓只有本文件读写该文件字面量；写走读-改-写 Promise 链
 * （E6#73q 同款序列化——verify 并发不互截）。卸载对称性：不随插件卸载清除（权益是用户资产，
 * 重装免重验——09「已购未安装」分区的数据前提）；用户主动清除走 licenses.remove。
 *
 * ⚠️ 落点：{userData}/licenses.json（用户机落点规范 §A#1 userData 根覆盖——同 os-associations
 * 先例「住 userData 根不新增落点」）。
 */

import * as fs from "fs/promises";
import * as path from "path";
import { app } from "electron";
import type { LicenseEntitlement } from "../../src/core/api/linkdesk-api/types";

const LICENSES_FILE = "licenses.json";

/** 纯函数（可单测）：插件卸载不删权益、remove 精确删一条——.Record 语义单点 */
export function withoutEntry(record: Record<string, LicenseEntitlement>, pluginId: string): Record<string, LicenseEntitlement> {
  const next = { ...record };
  delete next[pluginId];
  return next;
}

class LicenseStoreService {
  private _writeChain: Promise<unknown> = Promise.resolve();

  private file(): string {
    return path.join(app.getPath("userData"), LICENSES_FILE);
  }

  private serialized<T>(op: () => Promise<T>): Promise<T> {
    const run = this._writeChain.then(op, op);
    this._writeChain = run.catch(() => { /* 单次失败不阻塞后续写 */ });
    return run;
  }

  private async readAll(): Promise<Record<string, LicenseEntitlement>> {
    try {
      const raw = await fs.readFile(this.file(), "utf8");
      const data = JSON.parse(raw) as unknown;
      return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, LicenseEntitlement>) : {};
    } catch {
      return {}; // ENOENT = 从未验过签 = 正常态
    }
  }

  private async writeAll(record: Record<string, LicenseEntitlement>): Promise<void> {
    await fs.writeFile(this.file(), JSON.stringify(record, null, 2), "utf8");
  }

  /** 全量权益（licenses.list / 安装门查询的数据源） */
  async list(): Promise<LicenseEntitlement[]> {
    return Object.values(await this.readAll());
  }

  /** 入库/刷新（verify 通过时调）——pluginId 键去重，重复验签刷新 verifiedAt */
  async put(entitlement: LicenseEntitlement): Promise<void> {
    await this.serialized(async () => {
      const record = await this.readAll();
      record[entitlement.pluginId] = entitlement;
      await this.writeAll(record);
    });
  }

  /** 移除某插件权益（licenses.remove） */
  async remove(pluginId: string): Promise<void> {
    await this.serialized(async () => {
      const record = await this.readAll();
      await this.writeAll(withoutEntry(record, pluginId));
    });
  }
}

export const licenseStore = new LicenseStoreService();
