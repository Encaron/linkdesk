/**
 * SearchView — 搜索框 + 安装按钮（独立 view，不折叠）。
 * E3.6 E36#7.3 修正：从 InstalledListView 提取——不再绑在"已安装"里。
 * E3.6 E36#7.3c：useDebouncedInput——本地 state 即时响应 + 模块级搜索防抖 150ms。
 * SidePanel 对 title 为空串的 view 不包 SidebarSection，直接渲染。
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { setMarketplaceSearch } from "../services/marketplaceShared";
import { OverlayPortal, useDebouncedInput } from "@linkdesk/ui"; // E6#15h：共享件全走 @linkdesk/ui 零件
// E6#30c：官方源常量 + URL 归一 + 源身份（owner/repo）——弹窗加源校验/去重用（官方恒内置不入册，见 marketCatalog 头注）。
// 官方/重复判别走 sourceKeyOfUrl：分支无关——仓库主页形态官方归一成 HEAD、官方常量是 main，精确串比较会漏判放行（E6#30c 实测 bug）。
import { OFFICIAL_SOURCE_URL, normalizeSourceUrl, sourceKeyOfUrl } from "../services/marketCatalog";
import { readConfiguredAuthorSources } from "../services/marketSources";
import "../styles/MarketplaceSidebar.css";

const lk = () => window.linkdesk;

// E5.7#81：安装阶段 → 按钮文案（stage 经 plugin:installProgress 从壳 loader 广播而来）
const STAGE_LABELS: Record<string, string> = {
  validating: "校验中...",
  copying: "复制中...",
  loading: "加载中...",
};

/**
 * 市场源弹窗（E6#30c ③——mockup「03-添加市场源」frame ③ 是设计唯一源）。
 * 市场页侧栏「市场源」按钮 = 快捷入口；数据真相源 = 设置页 marketplaceSources（同一数组——入口可多处，数据源唯一）。
 * 本弹窗只做：填作者仓库 URL → 校验（空/非 http/github 归一失败/官方重复/已在列表）→ 写回配置；
 * marketplaceShared 模块级 config watch 收到变更自动 forceRefreshCatalog（几秒内该源插件上架）。
 * 官方源 URL 恒内置不入册——本弹窗列表/去重都以「排除官方」为前提（mockup frame ①③ 语义）。
 */
function AddSourcePopup({
  anchor,
  triggerRef,
  onClose,
}: {
  /** 触发锚——fixed 定位在「市场源」按钮下缘（OverlayPortal 进 #overlay-root，外部点击/Escape 壳统一处理） */
  anchor: { top: number; left: number };
  triggerRef: React.RefObject<HTMLElement>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** 输入即清错——mockup 帧 ③ 就近校验语义（err 红字 + input.err 红描边） */
  const clearErr = useCallback(() => {
    if (err) setErr(null);
  }, [err]);

  /** 添加——校验 + 归一去重 + 写回配置（写同一 marketplaceSources；watch 自动刷新，无需本组件触发拉取） */
  const submit = useCallback(async () => {
    const raw = value.trim();
    if (!raw) {
      setErr(t("请输入仓库 URL。"));
      return;
    }
    const norm = normalizeSourceUrl(raw);
    if (!norm) {
      setErr(t("URL 格式不对——以 http(s):// 开头。"));
      return;
    }
    setBusy(true);
    try {
      const current = await readConfiguredAuthorSources(); // 排除官方后的现有作者源（原始形态）
      // 官方/重复按 owner/repo 身份判别（sourceKeyOfUrl）——仓库主页与 main/HEAD 直链同一身份视为重复
      const key = sourceKeyOfUrl(raw);
      if (!key) {
        // norm 已过 → key 必非 null——纯防御（解析域理论不可达）
        setErr(t("URL 格式不对——以 http(s):// 开头。"));
        return;
      }
      if (sourceKeyOfUrl(OFFICIAL_SOURCE_URL) === key) {
        setErr(t("这个源已经在列表里了。"));
        return;
      }
      for (const s of current) {
        if (sourceKeyOfUrl(s) === key) {
          setErr(t("这个源已经在列表里了。"));
          return;
        }
      }
      await lk()?.configuration?.set("marketplace.marketplaceSources", [...current, raw]);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [value, t, onClose]);

  return (
    <OverlayPortal onClose={onClose} triggerRef={triggerRef} trapFocus>
      <div className="ms-addsrc-pop" style={anchor} role="dialog" aria-label={t("添加市场源")}>
        <span className="ms-addsrc-pop-title">{t("添加市场源")}</span>
        <input
          className={`ms-addsrc-pop-input${err ? " err" : ""}`}
          type="url"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={t("https://github.com/用户名/仓库名")}
          onChange={(e) => {
            setValue(e.target.value);
            clearErr();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void submit();
          }}
        />
        <span className={err ? "ms-addsrc-pop-err" : "ms-addsrc-pop-hint"}>
          {err ??
            t("该仓库根目录需有 marketplace.json；添加后几秒内，该源的所有插件出现在商店。")}
        </span>
        <div className="ms-addsrc-pop-actions">
          <button className="ms-addsrc-pop-btn" onClick={onClose} disabled={busy}>
            {t("取消")}
          </button>
          <button
            className="ms-addsrc-pop-btn ms-addsrc-pop-btn--primary"
            onClick={() => void submit()}
            disabled={busy}
          >
            {t("添加")}
          </button>
        </div>
      </div>
    </OverlayPortal>
  );
}

export default function SearchView() {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const { value, onChange, onClear } = useDebouncedInput(setMarketplaceSearch);

  // E6#30c ③：市场源弹窗开关 + 锚点——mockup frame ③（「市场源」按钮并排安装钮，点弹浮层）
  const [srcOpen, setSrcOpen] = useState(false);
  const [srcAnchor, setSrcAnchor] = useState<{ top: number; left: number } | null>(null);
  const srcBtnRef = useRef<HTMLButtonElement>(null);

  // E5.7#81：订阅安装进度——壳 loader 事件经主进程广播到池（marketplaceShared 同款模式）
  useEffect(() => {
    const sub = lk()?.events?.on<{ stage?: string }>("plugin:installProgress", (p) => {
      setStage(p?.stage ?? null);
    });
    return () => sub?.();
  }, []);

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
        // E5.7#81：校验/版本冲突失败要可见——不再静默吞错
        const r = await lk().pluginManager.install(selected as string);
        if (r && !r.success) {
          await lk().dialog.alert(r.error || t("安装失败"));
        }
      }
    } catch (e) {
      await lk().dialog.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
      setStage(null);
    }
  }, [t]);

  const stageText = installing && stage ? STAGE_LABELS[stage] : null;

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
          {installing ? (stageText ? t(stageText) : t("安装中...")) : t("安装")}
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
