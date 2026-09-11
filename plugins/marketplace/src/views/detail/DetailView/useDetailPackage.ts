/**
 * useDetailPackage——详情视图的「包内文件」层：README / CHANGELOG 读包 + 远端 README 兜底 + 截图画廊。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 原样搬出，零行为变更。
 *
 * README 三源回落（30.6b）：已装读包 `README.md` → 缺失/未装走 `readmeUrl` 远端 → 再空降级 description。
 * 远端新包未下载 ⇒ 读不到包内文件，故 changelog 的「远端最新」块以目录 `versions[].changelog` 为准。
 */

import { useEffect, useState } from "react";
import { readInstalledPackageFile } from "../../../services/packageFiles";
import type { DetailIdentity } from "./useDetailIdentity";

export function useDetailPackage(id: DetailIdentity) {
  const { pluginId, installed, entry } = id;

  /* ── 已装读包 + 未装远端 README（30.6b）——pkgReadme/pkgChangelog 只对已装读；remote 兜底 ── */
  const [pkgReadme, setPkgReadme] = useState<string | null | undefined>(undefined); // undefined=读取中
  const [pkgChangelog, setPkgChangelog] = useState<string | null | undefined>(undefined);
  const [remoteReadme, setRemoteReadme] = useState<string | null | undefined>(null); // undefined=读取中 / null=无需/不可得

  useEffect(() => {
    let alive = true;
    setPkgReadme(undefined);
    setPkgChangelog(undefined);
    const id = pluginId ?? "";
    if (!id || !installed) {
      return () => {
        alive = false;
      };
    }
    void readInstalledPackageFile(id, "README.md").then((s) => {
      if (alive) setPkgReadme(s);
    });
    void readInstalledPackageFile(id, "CHANGELOG.md").then((s) => {
      if (alive) setPkgChangelog(s);
    });
    return () => {
      alive = false;
    };
  }, [pluginId, installed]);

  /* 远端 README——未装 fetch readmeUrl；已装包内 README 缺失时兜底（文件头 30.6b 三源回落） */
  const remoteReadmeUrl = entry?.readmeUrl ?? null;
  useEffect(() => {
    let alive = true;
    const id = pluginId ?? "";
    const wantRemote = !!id && !!remoteReadmeUrl && (!installed || pkgReadme === null);
    if (!wantRemote) return;
    setRemoteReadme(undefined);
    void fetch(remoteReadmeUrl as string)
      .then(async (r) => (r.ok ? r.text() : null))
      .catch(() => null)
      .then((s) => {
        if (alive) setRemoteReadme(typeof s === "string" && s.trim() ? s : null);
      });
    return () => {
      alive = false;
    };
  }, [pluginId, installed, pkgReadme, remoteReadmeUrl]);

  /* ── 30.6 展示派生 ── */
  const shots = (entry?.screenshots ?? []).filter((s) => typeof s === "string" && s);
  /* E6#70a（15 档案）：已装读包 README 的相对媒体引用解析到「被查看插件包内」→ 注入
   *  linkdesk://{pluginId}/ 基址（linkdesk:// 与读包 resolvePath 同根，README 引用的随包资产即此可达）。
   *  远端 readmeUrl 来源（未装态/包内无 README 兜底）无本地副本 → 不传 assetBase（相对图诚实不显，
   *  纯 https 远程照显——档案 §五.2 定案）。 */
  const localAssetBase = pluginId ? `linkdesk://${pluginId}/` : undefined;
  const readme: { mode: "loading" | "content" | "none"; content?: string; assetBase?: string } = (() => {
    if (installed) {
      if (pkgReadme === undefined) return { mode: "loading" };
      if (pkgReadme && pkgReadme.trim()) return { mode: "content", content: pkgReadme, assetBase: localAssetBase };
      // 包内无 README → 远端 readmeUrl 兜底（未装态一样）
      if (remoteReadmeUrl) {
        if (remoteReadme === undefined) return { mode: "loading" };
        if (remoteReadme) return { mode: "content", content: remoteReadme };
      }
      return { mode: "none" };
    }
    if (remoteReadmeUrl) {
      if (remoteReadme === undefined) return { mode: "loading" };
      if (remoteReadme) return { mode: "content", content: remoteReadme };
    }
    return { mode: "none" };
  })();

  return { pkgChangelog, shots, readme };
}
