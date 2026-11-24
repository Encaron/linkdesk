/**
 * 「插件安装」壳命令面（2026-11-24 · D9′ 零插件路径）。
 *
 * 为什么要有它：**一个市场插件都没装时，用户/AI 仍要能"加源 → 看目录 → 装插件"**。
 * 这条成立才证明"市场只是 UI"。三条命令全是**结构化**的（硬约束 26：可读 / 可操作 / 可查）。
 *
 * 确认形态（D10′ 铁律）：
 *   · `plugins.listCatalog`      只读，无需确认；
 *   · `plugins.addSource`        只登记来源（写配置），无需确认；
 *   · `plugins.installFromCatalog` **走确认**：默认弹壳默认卡；非交互（AI/脚本）必须显式 `yes:true`。
 * 🔴 GUI 卡与 `yes:true` 是同一件事的两种形态，都进同一个 `requestInstall` 事务；
 *    `yes` 只跳过**确认**，⛔ 不跳过任何安全校验（HTTPS-only / sha256 / minApp / 来源变更）。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import i18n from "../../../i18n";
import { getConfigurationValue } from "../../services/configuration/ConfigurationService";
import { setConfigurationValue } from "../../services/configuration/ConfigurationService/settings-io";
import { createLogChannel, getLogChannel } from "../../services/ui/LogChannel";
import { POLICY_KEYS, commitInstall, prepareInstall, requestInstall } from "../../services/plugins/install";
import { getShellExposed } from "../../api/linkdesk-api/surfaces";
import type { PluginInstallRequest } from "../../api/linkdesk-api/types";

const PID = "app";

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts);

/** 同意凭据落点——「谁在什么时候同意装了什么」，可事后查 */
function consentLog(): { appendLine: (msg: string, sev?: "info" | "warn" | "error") => void } {
  const id = "plugin-install";
  const ch = getLogChannel(id) ?? createLogChannel(PID, t("插件安装"), id);
  return ch as unknown as { appendLine: (msg: string, sev?: "info" | "warn" | "error") => void };
}

/** 目录条目最小投影（命令返回面——⛔ 不把整张 catalog 原样吐给 AI） */
export interface CatalogListingEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  minAppVersion?: string;
  size?: number;
  sha256?: string;
  downloadUrl?: string;
}

/** 目录源 → 稳定 id（host + 路径前两段；⛔ 整条 URL 太长，做不可改的键） */
export function sourceIdOfCatalog(catalogUrl: string): string {
  try {
    const u = new URL(catalogUrl);
    const tail = u.pathname.split("/").filter(Boolean).slice(0, 2).join("/");
    return tail ? `${u.host}/${tail}` : u.host;
  } catch {
    return catalogUrl;
  }
}

/** 从目录原文挑条目——纯函数（可单测，无网依赖） */
export function selectCatalogEntries(raw: string, query?: string): CatalogListingEntry[] {
  let parsed: { plugins?: Array<Record<string, unknown>> };
  try {
    parsed = JSON.parse(raw) as { plugins?: Array<Record<string, unknown>> };
  } catch {
    return [];
  }
  const list = Array.isArray(parsed?.plugins) ? parsed.plugins : [];
  const q = query?.trim().toLowerCase();
  const out: CatalogListingEntry[] = [];
  for (const p of list) {
    const id = typeof p.id === "string" ? p.id : "";
    if (!id) continue;
    const name = typeof p.name === "string" ? p.name : id;
    const desc = typeof p.description === "string" ? p.description : undefined;
    if (q && !id.toLowerCase().includes(q) && !name.toLowerCase().includes(q) && !(desc ?? "").toLowerCase().includes(q)) {
      continue;
    }
    const latest =
      Array.isArray(p.versions) && p.versions.length > 0 ? (p.versions[0] as Record<string, unknown>) : undefined;
    out.push({
      id,
      name,
      version: String(latest?.version ?? p.version ?? ""),
      description: desc,
      minAppVersion: typeof p.minAppVersion === "string" ? p.minAppVersion : undefined,
      size: typeof p.size === "number" ? p.size : undefined,
      sha256: typeof latest?.sha256 === "string" ? latest.sha256 : undefined,
      downloadUrl:
        typeof latest?.downloadUrl === "string"
          ? latest.downloadUrl
          : typeof p.downloadUrl === "string"
            ? p.downloadUrl
            : undefined,
    });
  }
  return out;
}

/** 拉目录原文——主进程唯一网络出口（那边也再判一次 HTTPS） */
async function readCatalogRaw(catalogUrl: string): Promise<string> {
  const api = getShellExposed()?.plugins;
  if (!api?.packageReadCatalog) throw new Error(t("当前壳不支持读取市场目录（需更新 LinkDesk）"));
  return api.packageReadCatalog(catalogUrl);
}

export function registerPluginInstallCommands(): void {
  registerCommand(PID, {
    id: "plugins.listCatalog",
    title: t("列出市场目录"),
    description: t("只读：拉取一个市场目录源并列出插件（可按关键词过滤）。不安装、不改任何状态。"),
    params: [
      { name: "catalogUrl", type: "string", required: true, description: t("目录源地址（marketplace.json 的 HTTPS 直链）") },
      { name: "query", type: "string", required: false, description: t("按 id / 名称 / 描述过滤") },
    ],
    handler: async (args) => {
      const a = (args ?? {}) as { catalogUrl?: string; query?: string };
      if (!a.catalogUrl) throw new Error(t("缺少 catalogUrl"));
      return selectCatalogEntries(await readCatalogRaw(a.catalogUrl), a.query);
    },
  });

  registerCommand(PID, {
    id: "plugins.installFromCatalog",
    title: t("从市场目录安装插件"),
    description: t(
      "从某个市场目录源安装/更新一个插件。默认弹壳确认卡；非交互调用（AI/脚本）必须显式传 yes:true，否则拒绝执行。",
    ),
    params: [
      { name: "catalogUrl", type: "string", required: true, description: t("目录源地址（marketplace.json 的 HTTPS 直链）") },
      { name: "pluginId", type: "string", required: true, description: t("要装的插件 id（目录条目 id）") },
      {
        name: "yes",
        type: "boolean",
        required: false,
        description: t("显式同意：跳过确认卡（只跳确认，不跳 HTTPS/哈希/minApp 校验）；仅本次生效"),
      },
    ],
    handler: async (args) => {
      const a = (args ?? {}) as { catalogUrl?: string; pluginId?: string; yes?: boolean };
      if (!a.catalogUrl || !a.pluginId) throw new Error(t("缺少 catalogUrl 或 pluginId"));
      const entry = selectCatalogEntries(await readCatalogRaw(a.catalogUrl)).find((e) => e.id === a.pluginId);
      if (!entry) throw new Error(t("目录里没有这个插件：{{id}}", { id: a.pluginId }));
      if (!entry.downloadUrl) throw new Error(t("目录条目缺下载地址"));

      const req: PluginInstallRequest = {
        mode: "install",
        pluginId: entry.id,
        version: entry.version,
        downloadUrl: entry.downloadUrl,
        sha256: entry.sha256,
        source: { id: sourceIdOfCatalog(a.catalogUrl), url: a.catalogUrl },
        display: { name: entry.name, description: entry.description, size: entry.size },
      };

      if (a.yes === true) {
        consentLog().appendLine(
          `consent yes: plugin=${req.pluginId} version=${req.version} sha256=${req.sha256 ?? "(none)"} source=${req.source.url}`,
        );
        const prepared = await prepareInstall(req);
        if (prepared.plan.totals.total === 0) {
          return { confirmed: false, reason: prepared.plan.rejected[0]?.reason ?? "rejected" };
        }
        const r = await commitInstall(prepared.planId);
        return { confirmed: r.confirmed, reason: r.reason };
      }

      const r = await requestInstall(req);
      if (!r.confirmed) {
        throw new Error(
          r.reason === "user-cancelled"
            ? t("用户取消了安装")
            : t("未获确认，未执行。非交互调用请显式传 yes:true（仅本次生效）。"),
        );
      }
      return { confirmed: true };
    },
  });

  registerCommand(PID, {
    id: "plugins.addSource",
    title: t("添加市场源"),
    description: t("把一个市场目录源登记进设置（不安装任何东西）。登记后各市场与浏览面可读到它。"),
    params: [{ name: "catalogUrl", type: "string", required: true, description: t("目录源地址（marketplace.json 的 HTTPS 直链）") }],
    handler: async (args) => {
      const url = ((args ?? {}) as { catalogUrl?: string }).catalogUrl?.trim();
      if (!url) throw new Error(t("缺少 catalogUrl"));
      if (!/^https:\/\//i.test(url)) throw new Error(t("仅支持 HTTPS 目录源"));
      const id = sourceIdOfCatalog(url);
      const current = getConfigurationValue<string[]>(POLICY_KEYS.sources) ?? [];
      if (!current.includes(id)) {
        await setConfigurationValue(POLICY_KEYS.sources, [...current, id]);
      }
      return { sourceId: id, sources: getConfigurationValue<string[]>(POLICY_KEYS.sources) ?? [] };
    },
  });
}
