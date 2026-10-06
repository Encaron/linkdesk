/**
 * WelcomePoolView——E5.6#16.7k-1；**W3b（T6）最近区健壮化**。
 *
 * Pool 侧欢迎页。对标壳 WelcomeView.tsx，用 window.linkdesk.* IPC 替代 @src/core import。
 *
 * 🔴 欢迎页是标签页保底——所有插件都崩了它也必须能显示。
 *    因此不走 PluginComponent 管线，壳直接渲染。
 *    数据全部通过 window.linkdesk.* IPC，不 import @src/core。
 *
 * ── W3b 改了什么（01-设计 §三 W3 ＋ §七细节）──
 * ① 失效校验：文件夹逐条走 `filesystem.exists`，**不直接删**——灰显＋「已删除」角标（保留「它曾在这」的反馈）；
 * ② 最近视图：与**已装插件**集合比对 ⇒ 灰显＋「已卸载」角标；
 * ③ 点击失效项 = 一条面板通知（进铃铛，缺省即弹）＋ 从最近剔除；条目级「×」= 静默剔除（行消失即反馈，别聒噪）；
 * ④ 三条伴生缺陷同笔收口：去重口径（`recentList.sameRecentView`）／写放大（合并成一次落盘）／
 *    `isActive` 接上（切回欢迎页重跑加载 effect）；
 * ⑤ §七细节：两列表统一**显 5**（存 10）、内层小标题改「最近文件夹」（治与视图大区撞名）、
 *    清空即整块隐藏、长路径 ellipsis、加载 >100ms 出骨架、读失败出「最近列表不可用」灰字。
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, Folder, BookOpen, BookMarked, Keyboard, X } from "lucide-react";
import { executePoolCommand } from "../../commands/executePoolCommand";
import { PluginIcon } from "../../../components/shared/plugin-icon/PluginIcon";
import { HINT_ATTR, HINT_DELAY_ATTR } from "../../../components/shared/hint-tip/hintAttrs";
import type { CreatableViewMeta } from "../../../core/types/pool/poolLayout";
import {
  RECENT_DISPLAY_CAP,
  RECENT_FOLDERS_KEY,
  RECENT_VIEWS_KEY,
  STATE_OWNER,
  WELCOME_SOURCE,
  dropRecentFolder,
  dropRecentView,
  mergeRecentFolders,
  mergeRecentViews,
  type RecentEntry,
  type RecentFolder,
} from "./recentList";
import "./WelcomePoolView.css";

/** 骨架延迟：这段时间内到达就不占位（§七#7）——数据住本机 pluginState，正常必中，不必拿骨架闪用户一下 */
const SKELETON_DELAY_MS = 100;

/**
 * 正典实心 logo 几何（W6/T13）——六边形外轮廓 + 三个 evenodd 真孔。
 * `fillRule="evenodd"` 的孔是**透明**的（不是拿背景色画圆），所以水印叠在任何主题背景上都成立；
 * 顶栏小标（App 标题栏）与空场层 EmptyStage 是同一枚几何，此处 hero 标与水印共用一条 path。
 */
const MARK_PATH =
  "M50 4L96 30L96 84L50 110L4 84L4 30Z M42 36a8 8 0 1 0 16 0a8 8 0 1 0-16 0Z M24 72a8 8 0 1 0 16 0a8 8 0 1 0-16 0Z M60 72a8 8 0 1 0 16 0a8 8 0 1 0-16 0Z";

interface WelcomePoolViewProps {
  isActive: boolean;
  creatableViews?: CreatableViewMeta[];
}

export default function WelcomePoolView({ isActive, creatableViews }: WelcomePoolViewProps) {
  const { t } = useTranslation();
  const api = window.linkdesk;

  const [recentFolders, setRecentFolders] = useState<RecentFolder[]>([]);
  const [recentViews, setRecentViews] = useState<RecentEntry[]>([]);
  /** 已判定不存在的文件夹路径（灰显＋点击剔除用；**不直接删**——删了就没人知道它曾在这） */
  const [missingFolders, setMissingFolders] = useState<ReadonlySet<string>>(() => new Set());
  /** 已装插件 id 集；`null` = **读不到**（未知）——未知不判「已卸载」，宁可少报不可错报 */
  const [installed, setInstalled] = useState<ReadonlySet<string> | null>(null);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const [foldersError, setFoldersError] = useState(false);
  const [viewsError, setViewsError] = useState(false);

  // ── 加载数据（`isActive` 变 true 重跑——切回欢迎页刷新失效态与列表）──
  useEffect(() => {
    if (!api) return;
    let alive = true;
    (async () => {
      let folders: RecentFolder[] = [];
      let views: RecentEntry[] = [];
      let folderReadFailed = false;
      let viewReadFailed = false;
      try {
        const raw = await api.pluginState?.get(STATE_OWNER, RECENT_FOLDERS_KEY);
        folders = Array.isArray(raw) ? (raw as RecentFolder[]) : [];
      } catch { folderReadFailed = true; }
      try {
        const raw = await api.pluginState?.get(STATE_OWNER, RECENT_VIEWS_KEY);
        views = Array.isArray(raw) ? (raw as RecentEntry[]) : [];
      } catch { viewReadFailed = true; }
      if (!alive) return;
      setRecentFolders(folders);
      setRecentViews(views);
      setFoldersError(folderReadFailed);
      setViewsError(viewReadFailed);
      setReady(true);

      // 「已卸载」的判据 = **盘上还有没有这个插件**，不是 `creatableViews`：
      //   视图准入声明（`appearsIn.standaloneOpenable`）只管「开始」卡与创建菜单，**不影响最近**
      //   ⇒ 拿 creatableViews 判存在，会把「装了但没声明」的插件全标成「已卸载」。
      //   也不是只查 `list()`——**禁用插件不在 list() 里**（query-projections 明写"禁用/未安装插件
      //   不进本函数"），只查它会把「已禁用」误报成「已卸载」。两边取并集才算"盘上还有"。
      try {
        const [entries, disabled] = await Promise.all([
          api.pluginManager?.list(), api.pluginManager?.getDisabled(),
        ]);
        if (alive) {
          setInstalled(new Set([
            ...(entries ?? []).map((p) => p.pluginId),
            ...(disabled ?? []).map((p) => p.pluginId),
          ]));
        }
      } catch { /* 读不到装了什么 ⇒ 保持 null（未知）——未知不判「已卸载」，宁可少报不可错报 */ }

      // 失效批校验：单条查不动 **不等于** 文件不在（可能是通道/权限问题）——那种不算失效。
      const missing = new Set<string>();
      for (const f of folders) {
        try {
          if (await api.filesystem?.exists?.(f.path) === false) missing.add(f.path);
        } catch { /* 同上：查不了 ≠ 不在 */ }
      }
      if (alive) setMissingFolders(missing);
    })();
    return () => { alive = false; };
  }, [api, isActive]);

  // 首帧数据 >SKELETON_DELAY_MS 未到才出骨架（`ready` 一旦为真就不再回退——切回标签页不闪骨架）
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setSlow(true), SKELETON_DELAY_MS);
    return () => clearTimeout(id);
  }, [ready]);

  // ── 订阅文件夹变更（W3b：内存里算好**最终数组**再落一次盘——原实现循环内逐条 set = N 次写放大）──
  useEffect(() => {
    if (!api?.workspace?.onDidChangeFolders) return;
    const unsub = api.workspace.onDidChangeFolders(async () => {
      try {
        const opened = await api.workspace.getFolders();
        if (!opened?.length) return;
        const stored = (await api.pluginState?.get(STATE_OWNER, RECENT_FOLDERS_KEY)) ?? [];
        const arr: RecentFolder[] = Array.isArray(stored) ? stored : [];
        const next = mergeRecentFolders(arr, opened.map((f) => ({ path: f.uri, name: f.name })));
        setRecentFolders(next);
        setFoldersError(false);
        await api.pluginState?.set(STATE_OWNER, RECENT_FOLDERS_KEY, next);
      } catch {
        // 最小反馈：变更后重读失败 ⇒ 列表不可信，如实说（原先是 `catch { /* 静默 */ }`）
        setFoldersError(true);
      }
    });
    return () => { unsub?.(); };
  }, [api]);

  // ── Actions ──
  const handleOpenFolder = () => {
    api?.workspace?.openFolder();
  };

  /** 落盘「最近文件夹」——界面先更新（本地存储写失败不该让用户看见一次"点了没反应"） */
  const persistFolders = async (next: RecentFolder[]) => {
    setRecentFolders(next);
    try {
      await api?.pluginState?.set(STATE_OWNER, RECENT_FOLDERS_KEY, next);
    } catch { /* 写失败：界面已是新值，下次加载回旧值——不额外出声（不是用户动作的失败面） */ }
  };

  const persistViews = async (next: RecentEntry[]) => {
    setRecentViews(next);
    try {
      await api?.pluginState?.set(STATE_OWNER, RECENT_VIEWS_KEY, next);
    } catch { /* 同上 */ }
  };

  const forgetFolder = (path: string) => {
    setMissingFolders((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
    void persistFolders(dropRecentFolder(recentFolders, path));
  };

  const handleRecentFolderClick = (folder: RecentFolder) => {
    if (missingFolders.has(folder.path)) {
      // 无效项点下去必须**有回应**：如实告诉用户它不在了，再把这条失效记录剔掉
      void api?.notifications?.show(t("此文件夹已不存在，已从最近移除"), {
        type: "warning", source: WELCOME_SOURCE,
      });
      forgetFolder(folder.path);
      return;
    }
    api?.workspace?.addFolder(folder.path);
  };

  /** 条目级「×」——**不发通知**：行消失本身就是反馈（设计：与"失效自动剔除"并存，两种来源两种语气） */
  const handleRemoveFolder = (folder: RecentFolder) => forgetFolder(folder.path);

  const handleShortcutClick = (pluginId: string, displayName: string) => {
    api?.pool?.tabAction({ action: "createTab", pluginId });
    void recordRecentView(pluginId, displayName);
  };

  const recordRecentView = async (pluginId: string, label: string, workspaceName?: string) => {
    try {
      const stored = (await api?.pluginState?.get(STATE_OWNER, RECENT_VIEWS_KEY)) ?? [];
      const arr: RecentEntry[] = Array.isArray(stored) ? stored : [];
      const next = mergeRecentViews(arr, {
        pluginId,
        label: label || pluginId,
        ...(workspaceName ? { workspaceName } : {}),
      });
      setRecentViews(next);
      await api?.pluginState?.set(STATE_OWNER, RECENT_VIEWS_KEY, next);
    } catch {
      setViewsError(true);
    }
  };

  /** 「已卸载」判定——`installed === null`（读不到装了什么）时一律为 false（未知 ≠ 已卸载） */
  const isUninstalled = (entry: RecentEntry): boolean =>
    installed !== null && !installed.has(entry.pluginId);

  const handleRecentClick = (entry: RecentEntry) => {
    if (isUninstalled(entry)) {
      void api?.notifications?.show(t("此视图的插件已卸载，已从最近移除"), {
        type: "warning", source: WELCOME_SOURCE,
      });
      void persistViews(dropRecentView(recentViews, entry));
      return;
    }
    api?.pool?.tabAction({
      action: "createTab",
      pluginId: entry.pluginId,
      workspaceName: entry.workspaceName,
    });
  };

  /**
   * W4：文档还没写——点「使用文档」给一句指路（AI 手册随包发货、离线可读）。
   * 不用 `window.open` 假装能开：仓库里没有可打开的文档页，撒谎比什么都不做更糟。
   */
  const showDocsHint = () => {
    void api?.notifications?.show(t("用户文档整理中——先看「帮助 → AI 操作手册」（随包发货、离线可读）"), {
      type: "info", source: WELCOME_SOURCE,
    });
  };

  return (
    <div className="ldk-welcome-page">
      <div className="ldk-welcome-logo-bg" aria-hidden="true">
        <svg viewBox="0 0 100 114">
          <path fillRule="evenodd" fill="var(--text-muted)" d={MARK_PATH} />
        </svg>
      </div>

      <div className="ldk-welcome-scroll">
        <header className="ldk-welcome-hero">
          <svg className="ldk-welcome-hero-mark" viewBox="0 0 100 114" aria-hidden="true">
            <path fillRule="evenodd" fill="var(--accent)" d={MARK_PATH} />
          </svg>
          <div className="ldk-welcome-hero-text">
            <h1 className="ldk-welcome-title">LinkDesk</h1>
            <p className="ldk-welcome-subtitle">{t("一个容器，装下你所有的工作方式")}</p>
          </div>
        </header>

        <section className="ldk-welcome-section">
          <h2 className="ldk-welcome-section-title">{t("文件夹")}</h2>
          <button className="ldk-welcome-open-folder" onClick={handleOpenFolder}>
            <FolderOpen size={20} className="ldk-welcome-open-folder-icon" aria-hidden="true" />
            <span className="ldk-welcome-open-folder-label">{t("打开文件夹")}</span>
          </button>
          {foldersError ? (
            <p className="ldk-welcome-recent-unavailable">{t("最近列表不可用")}</p>
          ) : !ready ? (
            slow && (
              <div className="ldk-welcome-recent-list" aria-hidden="true">
                <div className="ldk-welcome-recent-skeleton" />
              </div>
            )
          ) : (
            recentFolders.length > 0 && (
              <div className="ldk-welcome-recent-list">
                <h3 className="ldk-welcome-recent-subtitle">{t("最近文件夹")}</h3>
                {recentFolders.slice(0, RECENT_DISPLAY_CAP).map((f) => {
                  const missing = missingFolders.has(f.path);
                  return (
                    <button
                      key={f.path}
                      className={`ldk-welcome-recent-item${missing ? " ldk-welcome-recent-item--missing" : ""}`}
                      onClick={() => handleRecentFolderClick(f)}
                      {...{ [HINT_ATTR]: f.path, [HINT_DELAY_ATTR]: "0" }}
                    >
                      <Folder size={16} className="ldk-welcome-recent-icon" />
                      <span className="ldk-welcome-recent-label">{f.name}</span>
                      {missing && <span className="ldk-welcome-recent-badge">{t("已删除")}</span>}
                      <span className="ldk-welcome-recent-workspace">{f.path}</span>
                      <RemoveButton label={f.name} onRemove={() => handleRemoveFolder(f)} />
                    </button>
                  );
                })}
              </div>
            )
          )}
        </section>

        <section className="ldk-welcome-section">
          <h2 className="ldk-welcome-section-title">{t("开始")}</h2>
          {(creatableViews && creatableViews.length > 0) ? (
            <div className="ldk-welcome-card-grid">
              {creatableViews.map((v) => (
                <button
                  key={v.pluginId}
                  className="ldk-welcome-card"
                  onClick={() => handleShortcutClick(v.pluginId, v.label)}
                >
                  <PluginIcon
                    pluginId={v.pluginId}
                    manifest={v.icon ? { icon: v.icon, iconSource: v.iconSource } : undefined}
                    className="ldk-welcome-card-icon"
                  />
                  <span className="ldk-welcome-card-label">{t(v.label)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="ldk-welcome-empty">{t("暂无视图")}</p>
          )}
        </section>

        {/* §七#3 拍板：× 删光/失效剔光 ⇒ 整块隐藏（克制口径，不留灰字）。
            ⚠️ 读失败（viewsError）是**例外**——那是"不知道"不是"没有"，必须说出来。 */}
        {(recentViews.length > 0 || viewsError) && (
          <section className="ldk-welcome-section">
            <h2 className="ldk-welcome-section-title">{t("最近")}</h2>
            {viewsError ? (
              <p className="ldk-welcome-recent-unavailable">{t("最近列表不可用")}</p>
            ) : (
              <div className="ldk-welcome-recent-list">
                {recentViews.slice(0, RECENT_DISPLAY_CAP).map((entry) => {
                  // W1：最近行图标与开始卡同源——当前 creatableViews 里有该插件才携带预解析身份图
                  const meta = creatableViews?.find((c) => c.pluginId === entry.pluginId);
                  const uninstalled = isUninstalled(entry);
                  const label = t(entry.label);
                  return (
                    <button
                      key={`${entry.pluginId}-${entry.workspaceName ?? ""}`}
                      className={`ldk-welcome-recent-item${uninstalled ? " ldk-welcome-recent-item--missing" : ""}`}
                      onClick={() => handleRecentClick(entry)}
                    >
                      <PluginIcon
                        pluginId={entry.pluginId}
                        manifest={meta?.icon ? { icon: meta.icon, iconSource: meta.iconSource } : undefined}
                        className="ldk-welcome-recent-icon"
                      />
                      <span className="ldk-welcome-recent-label">{label}</span>
                      {uninstalled && <span className="ldk-welcome-recent-badge">{t("已卸载")}</span>}
                      {entry.workspaceName && (
                        <span className="ldk-welcome-recent-workspace">{entry.workspaceName}</span>
                      )}
                      <RemoveButton
                        label={label}
                        onRemove={() => { void persistViews(dropRecentView(recentViews, entry)); }}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="ldk-welcome-section">
          <h2 className="ldk-welcome-section-title">{t("帮助")}</h2>
          <div className="ldk-welcome-help-links">
            {/* W4：死 <span> 全改真 <button>——键鼠同权（Tab 能到、Enter/Space 能按，浏览器原生行为，不再手搓）。
                aria-label 显式重申词条原文：lucide SVG 不参与可访问名，图标纯装饰。
                W6（T13）：版式按冻结预览图改行列表（名称走 --accent，与「最近」行同一套行外观）——
                右侧 kbd 提示**不做**：那需要新词条（本批零新增中文串），且会让 label-in-name 断言失真。 */}
            <button
              type="button"
              className="ldk-welcome-help-item"
              aria-label={t("使用文档")}
              onClick={showDocsHint}
            >
              <BookOpen size={14} aria-hidden="true" />
              <span className="ldk-welcome-row-name">{t("使用文档")}</span>
            </button>
            <button
              type="button"
              className="ldk-welcome-help-item"
              aria-label={t("键盘快捷键")}
              onClick={() => executePoolCommand("workbench.action.openKeybindingsSettings")}
            >
              <Keyboard size={14} aria-hidden="true" />
              <span className="ldk-welcome-row-name">{t("键盘快捷键")}</span>
            </button>
            <button
              type="button"
              className="ldk-welcome-help-item"
              aria-label={t("AI 操作手册")}
              onClick={() => executePoolCommand("app.openAiManual")}
            >
              <BookMarked size={14} aria-hidden="true" />
              <span className="ldk-welcome-row-name">{t("AI 操作手册")}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * 条目级「×」（最近文件夹 / 最近视图同款）。
 *
 * 🔴 行本身就是 `<button>`，HTML **禁嵌套交互元素** ⇒ × 只能是 `span role="button"`
 *    （§七#5：mockup 只加了 tabindex，真实实现**必须自己补 Enter/Space**，否则键盘用户按下去什么都没发生）。
 * 🔴 `stopPropagation` 两道都补：点在 × 上不是"打开这一条"（误触会把失效文件夹又点一遍）。
 * 🔴 aria-label 带条目名（"从最近移除 演示文件夹"）——屏幕上只看得见一个 ✕，读屏要听得出移的是谁。
 */
function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { t } = useTranslation();
  const hint = t("从最近移除 {{name}}", { name: label });
  return (
    <span
      className="ldk-welcome-recent-remove"
      role="button"
      tabIndex={0}
      aria-label={hint}
      {...{ [HINT_ATTR]: hint }}
      onClick={(e) => { e.stopPropagation(); onRemove(); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }
      }}
    >
      <X size={12} />
    </span>
  );
}
