/**
 * license-handlers——R4-1.3（I21/#24 壳侧·正典 09 §三·补3）：licenses.* 三方法 main 直答。
 * env-handlers 先例：主进程真能力段（node:crypto 验签 ＋ 权益文件 owner），不进 PROXY_CHANNELS。
 * 池插件 → plugins:call → 壳 IpcBridgeHandler/licenses 域 → 壳 preload → 本组通道（1 跳到裁决层）。
 *
 * 购买流（09）：用户粘贴 → 本层验签（离线）→ valid ⇒ 权益即刻入库（单文件 owner = license-store）→
 * 安装门（壳 install-ops 的 checkInstallLicenseGate）读同一存储放行。
 *
 * 铁律 19/20：_registered once-guard（壳崩重建复用——IPC 通道只注册一次）；日志走 loggedHandle。
 */

import { ipcMain } from "electron";
import { IPC } from "../channels.js";
import { loggedHandle } from "../invoke-log.js";
import { verifyLicenseKey } from "../../services/license-verify-service.js";
import { licenseStore } from "../../services/license-store-service.js";
import { machineFingerprint } from "../../services/machine-fingerprint.js";

let _registered = false;

export function registerLicenseHandlers(): void {
  if (_registered) return;
  _registered = true;

  // ── licenses:verify(key, publicKey) → LicenseVerifyResult ──
  // 验签（离线）→ 通过即入库（裁决+记账一步：不存在「验过但没记上」的窗口）。machine 比对用本机指纹。
  loggedHandle(IPC.licenses.verify, async (_event, key: unknown, publicKey: unknown) => {
    if (typeof key !== "string" || typeof publicKey !== "string") {
      return { valid: false, failureReason: "bad-key-format" as const };
    }
    const fingerprint = await machineFingerprint();
    const result = verifyLicenseKey(key, publicKey, fingerprint);
    if (result.valid) {
      await licenseStore.put({
        pluginId: result.pluginId!,
        exp: result.exp,
        machineBound: result.machineBound === true,
        verifiedAt: new Date().toISOString(),
      });
    }
    return result;
  });

  // ── licenses:list() → LicenseEntitlement[] ──
  loggedHandle(IPC.licenses.list, async () => licenseStore.list());

  // ── licenses:remove(pluginId) → void ──
  loggedHandle(IPC.licenses.remove, async (_event, pluginId: unknown) => {
    if (typeof pluginId !== "string" || !pluginId) return;
    await licenseStore.remove(pluginId);
  });
}
