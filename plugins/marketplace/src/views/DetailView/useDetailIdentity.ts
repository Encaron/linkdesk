/**
 * useDetailIdentity——详情视图的身份层：列表两源合并 + 目录条目 + 磁盘位置 + 展示名。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 原样搬出，零行为变更。
 *
 * 数据源（30.11c）：list()（已装实时状态）→ catalog（marketEntry，未装可显示）+ list() 实时合并。
 *   已装判定 = list()(启用) ∪ getDisabled()(禁用) 两源合并——list() EXCLUDES 禁用插件（实机探针实证），
 *   禁用已装必须经 disabledRaw 才可见，否则禁用瞬间塌成「未安装」。展示数据：启用 = list() 全 manifest
 *   （contributes/requires 随载荷带——实机 30.5e 实证；getDisabled 补 core 旗标透传）；
 *   禁用 = getDisabled 子集（name/description/version/core）。未装 = catalog 目录数据。
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PluginDiskLocation, PluginFolderKind } from "@linkdesk/contracts";
import type { CatalogEntry } from "../../services/marketCatalog";
import { notifyError, useMarketplaceCatalog, useMarketplacePlugins } from "../../services/marketplaceShared";
import type { DetailInfo } from "./types";

const lk = () => window.linkdesk;

export function useDetailIdentity(pluginId?: string) {
  const { t } = useTranslation();
  const { all, disabledRaw, loading: pluginsLoading, refresh: refreshPlugins } = useMarketplacePlugins();
  const catalog = useMarketplaceCatalog();

  /* ── 已装判定 = list()(启用) ∪ disabledRaw(禁用)（30.11c 实时合并本意；实机回归实证见文件头） ── */
  const enabledEntry = all.find((p) => p.pluginId === pluginId) ?? null;
  const disabledHit = disabledRaw.find((p) => p.pluginId === pluginId) ?? null;
  const disabled = !!disabledHit;
  const installed = !!enabledEntry || !!disabledHit;
  /* 30.5e：挂起·缺依赖——pendingReason 有值 = 已装但依赖未就绪 */
  const pending = !!enabledEntry?.pendingReason;

  /* ── E6#78：已装插件的磁盘位置（「大小」行值变链接 → 开安装目录；「数据位置」行 → 开插件数据目录）──
   *  路径由**主进程**解析（池内零安装路径知识，这里只吃结果）；未装 / 盘上找不到 → null → 值退纯文本，
   *  不画一个点下去必然报错的假链接。dataDir 只在插件真有数据时非 null（判据在主进程，同 VS Code 详情页
   *  「缓存」行「空则整行不显」）。 */
  const [diskLoc, setDiskLoc] = useState<PluginDiskLocation | null>(null);
  useEffect(() => {
    let alive = true;
    setDiskLoc(null);
    const id = pluginId ?? "";
    const read = lk()?.shell?.pluginLocation;
    if (!id || !installed || !read) {
      return () => {
        alive = false;
      };
    }
    void read(id)
      .then((r) => {
        if (alive) setDiskLoc(r ?? null);
      })
      .catch(() => {
        if (alive) setDiskLoc(null); // 读失败 = 不给入口（诚实，不塞一个点了必错的链接）
      });
    return () => {
      alive = false;
    };
  }, [pluginId, installed]);

  /* E6#78：打开插件目录——install / data 两落点同一条链路（主进程解析路径 + shell.openPath 开目录内容）。
   *  失败 fail-loud 发通知：目录被删/权限不足时用户看得见，不静默吞。 */
  const openPluginDir = useCallback(
    (kind: PluginFolderKind) => {
      const id = pluginId ?? "";
      const open = lk()?.shell?.openPluginFolder;
      if (!id || !open) return;
      void open(id, kind).catch((e: unknown) => {
        notifyError(`${t("打开插件目录失败")}：${e instanceof Error ? e.message : String(e)}`);
      });
    },
    [pluginId, t],
  );

  const info: DetailInfo | null = enabledEntry
    ? {
        manifest: {
          name: enabledEntry.manifest.name,
          version: enabledEntry.manifest.version,
          author: enabledEntry.manifest.author,
          description: enabledEntry.manifest.description,
          core: enabledEntry.manifest.core,
          // E6#65c：图标回退链第二环——已装 manifest.icon/iconSource 透传（list() 子集已带，E6#65a）
          icon: enabledEntry.manifest.icon,
          iconSource: enabledEntry.manifest.iconSource,
          // E6#69b：marketIcon = Type-2 身份图（原 #67「封面 art」语义随 #69 改向）——list() 投影带
          // marketIcon/marketIconSource（E6#65a 后），详情展示位 pickIdentityArt 的 marketIcon 优先环读这里
          // （icon-bar 四插件 serial 等的 Type-2 图即此路显形）
          marketIcon: enabledEntry.manifest.marketIcon,
          marketIconSource: enabledEntry.manifest.marketIconSource,
        },
        pendingReason: enabledEntry.pendingReason,
      }
    : disabledHit
      ? {
          manifest: {
            name: disabledHit.name,
            version: disabledHit.version,
            description: disabledHit.description,
            core: disabledHit.core,
          },
        }
      : null;
  const entry: CatalogEntry | undefined = catalog.entries.find((e) => e.id === pluginId);

  /* 当前插件显示名——启/禁/卸三处失败 toast 共用（enabledEntry/disabledHit 是列表元素稳定引用，
   *  非每渲染新建对象，可入 deps）。E6#73h（D5）：三处原始报错一律加**结论句**前缀——
   *  此前 `notifyError(e.message)` 把桥/引擎原文直接当整句甩出去，用户看到的是
   *  「Error invoking remote method 'plugin:enable'」这类没人话的东西，做的事、成没成、都不在句子里。 */
  const displayName = enabledEntry?.manifest.name ?? disabledHit?.name ?? pluginId ?? "";

  return {
    pluginId,
    t,
    all,
    disabledRaw,
    pluginsLoading,
    refreshPlugins,
    catalog,
    enabledEntry,
    disabledHit,
    disabled,
    installed,
    pending,
    info,
    entry,
    displayName,
    diskLoc,
    openPluginDir,
  };
}

/** 身份层返回形状——下游 hook 共用（`ReturnType` 取型，不手抄一份会漂移的接口） */
export type DetailIdentity = ReturnType<typeof useDetailIdentity>;
