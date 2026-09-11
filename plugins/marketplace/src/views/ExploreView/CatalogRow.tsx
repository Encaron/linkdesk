/**
 * CatalogRow——探索视图的一条目录行（图标 ｜ 名/版本 + 简述 + 作者/来源/体积 ｜ 行态动作槽）。
 * E6#86b（第 3.6.3 轮）feature-folder 拆分：自 `views/ExploreView.tsx` 的 `renderRow` 原样搬出，
 * 零行为变更（`renderRow(e, status)` → `<CatalogRow entry status … />`，key 由 map 移到元素上，等价）。
 *
 * 图标（E6#30e 第一站）：PluginIcon 显式 descriptor 入参（manifest={icon, iconSource}）——目录条目
 *   未安装、无 viewRegistry/元数据缓存条目，图标只由 catalog 声明字段裁决（硬约束 11）；iconSource
 *   "url" → resolvePluginIcon 返 src → 以 img 元素直接加载作者彩色图标。
 *   E6#69c/#69f：目录行 = 详情同裁决走共享 pickIdentityArt（marketIcon ?? icon ?? 默认彩色块）——
 *   目录条目本无 marketIcon 字段（架构三图模型：目录只存 icon；marketIcon 只在已装 plugin.json 内），
 *   pickIdentityArt 在 icon 有则显、无则落默认彩色块（顶替 📄/#66 640 场景默认）。
 *
 * 目录条目标题/作者/来源仓库名是作者数据——不走 t()（i18n 只翻壳文案）。
 */

import { useTranslation } from "react-i18next";
import { PluginIcon, pickIdentityArt } from "@linkdesk/ui";
import type { CatalogEntry } from "../../services/marketCatalog";
import CatalogRowAction from "./CatalogRowAction";
import { authorLabel, formatSize } from "./catalogRowText";
import type { RowStatus } from "./useCatalogStatus";

export default function CatalogRow({
  entry,
  status,
  online,
  onOpenDetail,
  onInstall,
}: {
  entry: CatalogEntry;
  status: RowStatus;
  online: boolean;
  onOpenDetail: (id: string, name: string) => void;
  onInstall: (entry: CatalogEntry) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="ms-extension-item catalog"
      onClick={() => onOpenDetail(entry.id, entry.name)}
      title={t("详情")}
    >
      <div className="ms-item-icon">
        {/* E6#30e：目录 icon descriptor——manifest 只供 icon/iconSource 裁决（未装无 registry 条目）；
         *  E6#69c/#69f：行 = 详情同裁决，走共享 pickIdentityArt = marketIcon ?? icon ?? 默认彩色块（顶替 📄/640 场景默认） */}
        <PluginIcon
          pluginId={entry.id}
          manifest={pickIdentityArt(entry)}
          alt={entry.name}
        />
      </div>
      <div className="ms-item-details">
        <div className="ms-item-header">
          <span className="ms-item-name" title={entry.name}>{entry.name}</span>
          <span className="ms-item-version">v{entry.version}</span>
        </div>
        {entry.description && <span className="ms-item-desc">{entry.description}</span>}
        <div className="ms-item-footer">
          {authorLabel(entry.author) && (
            <span className="ms-item-author">{authorLabel(entry.author)}</span>
          )}
          {entry.sourceName && (
            <span className="ms-item-tag" title={entry.sourceName}>{entry.sourceName}</span>
          )}
          {formatSize(entry.size) && <span className="ms-item-tag">{formatSize(entry.size)}</span>}
        </div>
      </div>
      <CatalogRowAction entry={entry} status={status} online={online} onInstall={onInstall} />
    </div>
  );
}
