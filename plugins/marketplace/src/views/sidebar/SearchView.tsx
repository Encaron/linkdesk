/**
 * SearchView — 搜索框 + 安装按钮（独立 view，不折叠）。
 * E3.6 E36#7.3 修正：从 InstalledListView 提取——不再绑在"已安装"里。
 * E3.6 E36#7.3c：useDebouncedInput——本地 state 即时响应 + 模块级搜索防抖 150ms。
 * SidePanel 对 title 为空串的 view 不包 SidebarSection，直接渲染。
 *
 * E6#86b（第 3.6.3 轮）feature-folder 化：**本文件是门面**——原 203 行里的私有弹窗组件
 * `AddSourcePopup` 搬进同名夹 `SearchView/`（非 contributes.views 面，私有件）。**零行为变更、零消费方改动**
 * （SDK bundle key = basename，不随目录移动而变）。
 * E6#86e（第 3.6.6 轮）views 分组：本文件随「侧栏容器」整体移入 `views/sidebar/`（视图源码路径由
 * `views/SearchView.tsx` 变为 `views/sidebar/SearchView.tsx`；SDK bundle 名 `views/SearchView.bundle.js`
 * 不变——surface key = render basename，故已装插件的引用零影响）。
 * 拆法逐段对照见 docs/02-Electron架构/E6_插件生态与发布/文件整理层/03-市场插件整理.md §二。
 */

import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { setMarketplaceSearch, notifyError } from "../../services/marketplaceShared";
import { useDebouncedInput } from "@linkdesk/ui"; // E6#15h：共享件全走 @linkdesk/ui 零件
import AddSourcePopup from "./SearchView/AddSourcePopup";
/* E6#86d：侧栏样式已按实测分节拆为 3 件（原 MarketplaceSidebar.css 680 行）——**本处按原文档顺序
 *  全量 import**：5 个侧栏 surface 共用同一套样式，且各 surface 吃样式的类分散在自身 JSX 与其子件
 *  （如 ExtensionItem）里，逐件 import 要算传递闭包、收益为零。判据见 styles/detail/detail-shell.css 头注。 */
import "../../styles/sidebar/sidebar-shell.css";
import "../../styles/sidebar/sidebar-list.css";
import "../../styles/sidebar/sidebar-explore.css";

const lk = () => window.linkdesk;

export default function SearchView() {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState(false);
  const { value, onChange, onClear } = useDebouncedInput(setMarketplaceSearch);

  // E6#30c ③：市场源弹窗开关 + 锚点——mockup frame ③（「市场源」按钮并排安装钮，点弹浮层）
  const [srcOpen, setSrcOpen] = useState(false);
  const [srcAnchor, setSrcAnchor] = useState<{ top: number; left: number } | null>(null);
  const srcBtnRef = useRef<HTMLButtonElement>(null);

  /** 开/关弹窗——按按钮几何定锚。320px 弹窗左缘 = clamp(按钮右缘 − 320, 8, …)（窄侧栏右侧即窗左缘，
   *  减 320 常负 → 弹窗从左缘 8px 向右展开入主区，同 mockup frame ③ popC）；上缘 = 按钮下缘 + 4。 */
  const handleSrcToggle = useCallback(
    (e: React.MouseEvent) => {
      if (srcOpen) {
        setSrcOpen(false);
        return;
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setSrcAnchor({ top: rect.bottom + 4, left: Math.max(8, rect.right - 320) });
      setSrcOpen(true);
    },
    [srcOpen],
  );

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    try {
      const selected = await lk().dialog.open({ directory: true, title: t("选择插件目录") }); // E5.8#37.9：原生对话框标题壳侧 t() 解析后走 IPC
      if (selected) {
        // E5.7#81：校验/版本冲突失败要可见——不再静默吞错；#64 A1：阻塞式弹窗 → 事件型 error toast
        const r = await lk().pluginManager.install(selected as string);
        if (r && !r.success) {
          notifyError(r.error || t("安装失败"));
        }
      }
    } catch (e) {
      // E6#73h（D5）：同上——「安装失败」+ 原文，别再让用户对着裸报错猜发生了什么
      notifyError(t("安装失败：{{detail}}", { detail: e instanceof Error ? e.message : String(e) }));
    } finally {
      setInstalling(false);
    }
  }, [t]);

  return (
    <div className="ms-header">
      <div className="ms-header-actions">
        <button
          className="ms-install-btn"
          onClick={handleInstall}
          disabled={installing}
          title={t("从本地安装插件")}
        >
          <span className="codicon codicon-add" />
          {/* E6#73c 第 2 步：这里**只说实话**——目录源安装在请求侧不带身份（选目录前不知道 pluginId），
           *  认领不到自己的 job，从前那句「校验中/复制中」是读**无主**的 plugin:installProgress 广播来的，
           *  N=1 时侥幸正确、并发放开后会显示别的安装的阶段词（撒谎）⇒ 只留本地布尔驱动的「安装中...」。
           *  真正的阶段进度归通知面板的 job 行（壳侧 job 表按 jobId 归因，不会串台）。 */}
          {installing ? t("安装中...") : t("安装")}
        </button>
        <button
          ref={srcBtnRef}
          className="ms-addsrc-trigger"
          title={t("添加一个作者仓库为市场源")}
          aria-haspopup="dialog"
          aria-expanded={srcOpen}
          onClick={handleSrcToggle}
        >
          <span className="codicon codicon-plus" aria-hidden="true" />
          {t("市场源")}
        </button>
      </div>
      {srcOpen && srcAnchor && (
        <AddSourcePopup anchor={srcAnchor} triggerRef={srcBtnRef} onClose={() => setSrcOpen(false)} />
      )}
      <div className="ms-search-container">
        <input
          className="ms-search-box"
          type="text"
          placeholder={t("搜索插件...")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button className="ms-search-clear" onClick={onClear}>
            <span className="codicon codicon-close" />
          </button>
        )}
      </div>
    </div>
  );
}
