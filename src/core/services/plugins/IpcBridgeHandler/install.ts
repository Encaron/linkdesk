/**
 * IpcBridgeHandler 安装确认域——`plugins` 命名空间新增的七个方法 + 执行端口接线。
 *
 * 两个职责（同一份文件、同一件事的两半）：
 *   ① `handleInstallMethod`——池（市场/AI）→ 壳的请求面：requestInstall / requestUpdateBatch /
 *      policy / trust 七方法委派到 `install/` 门面。⛔ 这里不做判定——判定在 policy.ts，令牌在 token.ts。
 *   ② `wireInstallExecutor`——壳内执行端口：把 loader 注册的 `PluginManagementAPI` 包成
 *      `InstallExecutor`，**第一行核销令牌**（D2：没有确认就没有执行）。
 *
 * 🔴 为什么执行端口在这层而不在 `install/`：`install/` 是纯逻辑域（零 loader 依赖，可单测）；
 *    「怎么调 loader」是接线知识，归桥（同 `setPluginAPI` 的 E5#43 接口反转先例——桥不知道加载器的实现）。
 *
 * 🔴 HTTPS-only（spec §七）：远程来源只接受 `https://`；`http://` 直接拒（磁盘路径不走这条）。
 *    这是**壳边界**的一道，主进程下载腿另有残留收紧（同一判据两处，方向都是拒）。
 */

import i18n from "../../../../i18n";
import type { PluginInstallRequest, PluginUpdatePolicy } from "../../../api/linkdesk-api/types";
import {
  bindingOfRequest,
  consumeToken,
  getUpdatePolicy,
  isRemoteSource,
  commitInstall,
  discardInstall,
  listSourceTrust,
  prepareInstall,
  prepareUpdateBatch,
  previewUpdatePlan,
  requestInstall,
  requestUpdateBatch,
  setInstallExecutor,
  setUpdatePolicy,
  trustSource,
  untrustSource,
} from "../install";
import type { PluginManagementAPI } from "./pluginManager";
import { getPluginAPI } from "./pluginManager";

/**
 * 执行端口惰性接线——每次请求前对齐到**当前**注册的 loader API（幂等、零缓存泄漏）；
 * loader 未注册（启动早期）⇒ 不接线，请求会在 `requireExecutor` 处如实报错，⛔ 不静默装。
 */
function ensureExecutor(): void {
  const api = getPluginAPI();
  if (api) wireInstallExecutor(api);
}

/** 远程来源非 HTTPS ⇒ 拒（spec §七；本地路径不在这里管） */
function insecureSource(url: string): boolean {
  return isRemoteSource(url) && !/^https:\/\//i.test(url.trim());
}

/**
 * 安装/更新共用的第一道闸（2026-11-24 线 1 收口 duplication）：票校 ＋ HTTPS 校。
 * 返回**拒绝回执**或 null（= 放行）。⛔ 两处各写一遍会让「一道闸」变成两处可漂移的副本。
 */
function rejectUnsafeRequest(
  req: PluginInstallRequest,
  token: string,
): { success: false; error: string } | null {
  const verdict = consumeToken(token, bindingOfRequest(req));
  // 无票/错票/过期票一律拒——对外只认 no-token 一个词（spec §3.2）
  if (verdict !== "ok") return { success: false, error: "no-token" };
  if (insecureSource(req.downloadUrl)) {
    return { success: false, error: i18n.t("仅支持 HTTPS 来源的安装包") };
  }
  return null;
}

/** 执行端口接线——由 `registerIpcBridgeHandler` 在 loader 注册 API 之后调用（幂等） */
export function wireInstallExecutor(api: PluginManagementAPI): void {
  setInstallExecutor({
    async install(req: PluginInstallRequest, token: string) {
      const rejected = rejectUnsafeRequest(req, token);
      if (rejected) return rejected;
      // 🔴 已装还按"安装"走会在解压段撞「目标已存在 ⇒ 请走更新」（用户确认了却装不上）。
      //    ⇒ 已装就改走更新链（同一条流水线，语义正确）。
      const installed = await this.installedVersion?.(req.pluginId);
      if (installed) {
        const upd = await api.updatePlugin(req.pluginId, { url: req.downloadUrl, allowOlder: req.allowOlder });
        return { success: upd.success, error: upd.error, cancelled: upd.cancelled, version: upd.version, needRestart: upd.needRestart };
      }
      const res = await api.installWithProgress(req.downloadUrl, {
        pluginId: req.pluginId,
        displayName: req.display.name,
        ledgerSource: "marketplace",
        catalogUrl: req.catalogUrl,
        // P1（spec §七）：确认时的 sha256 一路带到主进程——下载落盘后、解压前校验，不符即删包拒装
        sha256: req.sha256,
      });
      // installPlugin/installWithProgress 的回执是窄投影（success/error）——版本与重启提示由 job 表/loader 报
      return { success: res.success, error: res.error };
    },
    async update(req: PluginInstallRequest, token: string) {
      const rejected = rejectUnsafeRequest(req, token);
      if (rejected) return rejected;
      const res = await api.updatePlugin(req.pluginId, { url: req.downloadUrl, allowOlder: req.allowOlder });
      return {
        success: res.success,
        error: res.error,
        cancelled: res.cancelled,
        version: res.version,
        needRestart: res.needRestart,
      };
    },
    async installedVersion(pluginId: string) {
      // 🔴 账本是「装了谁」的唯一真相源（installed-plugins.json）：清单投影只含已加载+挂起，
      //    **禁用插件不在里面** ⇒ 拿清单判"是否已装"会把禁用插件当首装（实机同类 bug 的源头）。
      try {
        const { getInstalled } = await import("../../PluginInstallService");
        const entry = (await getInstalled())[pluginId];
        if (entry && !entry.removed) return entry.version;
      } catch {
        /* 账本读失败 → 回落到清单 */
      }
      const row = api.getListPluginManifests().find((p) => p.pluginId === pluginId);
      return row?.manifest?.version ?? null;
    },
  });
}

/**
 * D8 渲染槽解析——扫已装 manifest 的 `contributes.renderers`（`installConfirm` / `updateBatch`），
 * 命中即返回 { pluginId, viewId }；多个插件同时声明时取**列表顺序第一个**（确定性，⛔ 不自创优先级）。
 * 未声明/视图缺失 ⇒ 宿主默认卡（默认卡永远在，⛔ 不许因第三方坏声明而装不了插件）。
 */
export function rendererContribution(kind: "install" | "batch"): { pluginId: string; viewId: string } | null {
  const api = getPluginAPI();
  if (!api) return null;
  for (const row of api.getListPluginManifests()) {
    const contributes = row.manifest.contributes as { renderers?: Record<string, unknown> } | undefined;
    const viewId = kind === "install" ? contributes?.renderers?.installConfirm : contributes?.renderers?.updateBatch;
    if (typeof viewId === "string" && viewId) return { pluginId: row.pluginId, viewId };
  }
  return null;
}

/** 池 → 壳：安装确认七方法 */
export async function handleInstallMethod(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    case "requestInstall":
      ensureExecutor();
      return requestInstall(args[0] as PluginInstallRequest);
    case "requestUpdateBatch":
      ensureExecutor();
      return requestUpdateBatch(argList(args[0]));
    case "prepareInstall":
      ensureExecutor();
      return prepareInstall(args[0] as PluginInstallRequest);
    case "prepareUpdateBatch":
      ensureExecutor();
      return prepareUpdateBatch(argList(args[0]));
    case "commitInstall": {
      ensureExecutor();
      const opts = (args[1] ?? {}) as { confirmed?: boolean };
      return commitInstall(args[0] as string, opts);
    }
    case "discardInstall":
      return discardInstall(args[0] as string);
    case "previewUpdatePlan": {
      ensureExecutor();
      const opts = (args[1] ?? {}) as { forceAsk?: boolean };
      return previewUpdatePlan(argList(args[0]), opts);
    }
    case "getUpdatePolicy":
      return getUpdatePolicy();
    case "setUpdatePolicy":
      return setUpdatePolicy((args[0] ?? {}) as Partial<PluginUpdatePolicy>);
    case "listSourceTrust":
      return listSourceTrust();
    case "trustSource":
      return trustSource(args[0] as { sourceId: string; url: string; repo?: string; publisher?: string });
    case "untrustSource":
      return untrustSource(args[0] as string);
    default:
      throw new Error(`未知的安装确认方法: ${method}`);
  }
}

/** 入参防御——非数组按空批处理（⛔ 不把脏载荷当 1 条装出去） */
function argList(v: unknown): PluginInstallRequest[] {
  return Array.isArray(v) ? (v as PluginInstallRequest[]) : [];
}
