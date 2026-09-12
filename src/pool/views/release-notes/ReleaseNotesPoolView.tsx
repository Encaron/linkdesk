/**
 * ReleaseNotesPoolView——E6#57.13a。发行说明标签页（**壳直渲染视图**，非插件）。
 * 设计：`docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/05-发行说明.md` §2.3-§2.4。
 * 验收图：`06-主软件更新/mockups/03-发行说明标签页.html`——Frame 1（内容）/ Frame 2（空态）/ Frame 3（骨架）。
 *
 * ## 壳想、池画
 *
 * 本组件**只画**：数据、以及所有含数据的显示文本，都由壳取好、`t()` 完，挂在 `PoolTab.releaseNotes`
 * 上推下来（`PoolReleaseNotesData` 是三态判别联合——池连「加载中还是已就绪」都不自己判）。
 * 同款先例：`WelcomePoolView`（壳兜底视图）/ `PluginDetailPoolView`。
 *
 * 池**自己** `t()` 的只有**纯静态文案**（「版本历史」「重试」「知道了」…）——没有一个字依赖数据，
 * 所以按硬约束 2 归池侧自己的 i18n 上下文（池有独立的 i18n，`WelcomePoolView` 同款）。
 * 分界线一句话：**含数据的文本壳推，纯框架文字池写**。
 *
 * ## 🔴 三种交互为什么不走新 IPC
 *
 * 「换一版 / 重试 / 收起横幅」三件事都是「池知道用户点了什么、壳才知道该做什么」——
 * 恰好是**命令**这个词的定义。故一律走 `executePoolCommand`→`window.linkdesk.commands.executeCommand`
 * →主进程→壳 `CommandRegistry`（`core/commands/shell/releaseNotesCommands.ts` 注册了三条 `when:"false"`
 * 的命令）。零新通道、零新契约面。
 *
 * ## 外链必须 `target="_blank"`
 *
 * `electron/windows/external-links.ts` 的 `setWindowOpenHandler` 才是「打开浏览器」的唯一入口
 * （`shell.openExternal`）。裸 `<a href="https://…">` 会在池渲染进程里**导航离开整个软件**
 * （`crash-recovery.ts` 的 `will-navigate` 只拦 `linkdesk-retry://` 前缀）。——三处外链全带 `target="_blank"`。
 */

import { useTranslation } from "react-i18next";
import { CloudOff, Sparkles } from "lucide-react";
import MarkdownView from "../../../components/shared/markdown-view/MarkdownView";
import { executePoolCommand } from "../../commands/executePoolCommand";
import type {
  PoolReleaseNotesData,
  PoolReleaseNotesHistoryItem,
  PoolTab,
} from "../../../core/types/pool/poolLayout";
import "./ReleaseNotesPoolView.css";

interface ReleaseNotesPoolViewProps {
  tab: PoolTab;
  /**
   * 本视图**没有任何 effect**（数据是壳推的、不留订阅）⇒ 这个参数目前用不上。
   * 保留它是为了对齐兄弟壳视图的调用形状（`ShellViewRenderer` 统一传），
   * 命名 `_isActive` 表明「有意不用」——不是漏接硬约束 14 的活跃守卫（那条只针对有 effect 的组件）。
   */
  isActive: boolean;
}

/**
 * 壳还没推载荷时的兜底 = **`loading`**，不是 `empty`。
 *
 * 理由：还没推 = 壳正在准备（`openReleaseNotesTab` 先设态后开 tab，理论上到不了这里）；
 * 而画错方向的代价不对称——画成 `empty` 会让用户读到「无法连接 GitHub」，那是**撒谎**
 * （网络可能好得很），画成骨架只是多等一帧。
 */
const PENDING: PoolReleaseNotesData = { state: "loading" };

export default function ReleaseNotesPoolView({ tab, isActive: _isActive }: ReleaseNotesPoolViewProps) {
  const data: PoolReleaseNotesData = tab.releaseNotes ?? PENDING;

  // 三态直接分支——不做任何「合并/过渡」中间态（05 §2.4：态由拉取结果唯一决定，没有第四种）
  if (data.state === "loading") return <LoadingFrame />;
  if (data.state === "empty") return <EmptyFrame listUrl={data.listUrl} />;
  return <ContentFrame data={data} />;
}

/* ── Frame 3：加载中（骨架） ── */

/**
 * 骨架的形状**与 Frame 1 的真实布局一一对应**（头部一行 + 左窄栏三条 + 右主区两段），
 * 不是居中转圈——所以拉到内容时不会有位移跳动。
 *
 * `aria-busy` 给读屏一个「正在加载」的信号；骨架条自身 `aria-hidden`（它们没有语义内容）。
 * **不做 shimmer 动效**（mockup 03 的定案：拉取通常 <1s，动效只会闪一下；`prefers-reduced-motion` 下本来也要关）。
 */
function LoadingFrame() {
  const { t } = useTranslation();
  return (
    <div className="rn" aria-busy="true">
      <div className="rn-head">
        <div className="rn-skel rn-skel--head" aria-hidden="true">
          <div className="rn-skel-bar rn-skel-bar--h18 rn-w40" />
          <div className="rn-skel-bar rn-w70" />
        </div>
      </div>
      <div className="rn-body">
        <div className="rn-hist">
          <div className="rn-hist-head">{t("版本历史")}</div>
          <div className="rn-skel-list" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div className="rn-skel-item" key={i}>
                <div className="rn-skel-bar rn-w70" />
                <div className="rn-skel-bar rn-w40" />
              </div>
            ))}
          </div>
        </div>
        <div className="rn-content">
          <div className="rn-skel" aria-hidden="true">
            <div className="rn-skel-bar rn-skel-bar--h18 rn-w40" />
            <div className="rn-skel-bar rn-w90" />
            <div className="rn-skel-bar rn-w90" />
            <div className="rn-skel-bar rn-w70" />
            <div className="rn-skel-gap" />
            <div className="rn-skel-bar rn-skel-bar--h18 rn-w40" />
            <div className="rn-skel-bar rn-w90" />
            <div className="rn-skel-bar rn-w70" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Frame 2：断网空态（无缓存） ── */

/**
 * 空态只有**一句通用文案**——不分「网络断了」/「GitHub 限流」/「这版不存在」。
 *
 * 🔴 不是省事：`UpdateLegError.detail.code` 那三个码**跨不过 IPC**（`invoke-log.ts` 的 `loggedHandle`
 * 原样 rethrow，Electron 只序列化 `Error.message`）。要分原因得先让错误**结构化过 IPC**，
 * 那是主进程/契约侧的事。**在没有原因数据的前提下硬分，就是把猜测画成事实。**
 * 同理，mockup Frame 2 那个「离线」徽标也**不画**——限流时它也是那句「离线」，那是假话。
 */
function EmptyFrame({ listUrl }: { listUrl?: string }) {
  const { t } = useTranslation();
  return (
    <div className="rn">
      <div className="rn-head">
        <div className="rn-head-main">
          <div className="rn-ver-title">
            {t("发行说明")}
            <span className="rn-ver-sub">{t("无法连接 GitHub")}</span>
          </div>
        </div>
      </div>
      <div className="rn-body">
        <div className="rn-hist">
          <div className="rn-hist-head">{t("版本历史")}</div>
          <div className="rn-hist-note">
            <span>{t("无本地缓存")}</span>
            <span>{t("联网后自动拉取")}</span>
          </div>
        </div>
        <div className="rn-content rn-content--center">
          <div className="rn-empty">
            <div className="rn-empty-icon" aria-hidden="true">
              <CloudOff size={20} />
            </div>
            <div className="rn-empty-title">{t("无法加载发行说明")}</div>
            <p className="rn-empty-desc">
              {t("当前无法连接到 GitHub。请检查网络后重试，或在 GitHub 上查看全部版本。")}
            </p>
            <div className="rn-empty-actions">
              <button
                type="button"
                className="rn-btn rn-btn--primary"
                onClick={() => executePoolCommand("update.releaseNotesRetry")}
              >
                {t("重试")}
              </button>
              {/* 拿不到列表页 URL 就不画——**空链接比没有链接更糟**（同 `poolLayout.ts` 该字段的注释） */}
              {listUrl && (
                <a className="rn-link" href={listUrl} target="_blank" rel="noreferrer">
                  {t("在 GitHub 上查看 →")}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Frame 1：内容 ── */

function ContentFrame({ data }: { data: Extract<PoolReleaseNotesData, { state: "content" }> }) {
  const { t } = useTranslation();
  const { listUrl } = data;
  return (
    <div className="rn">
      <div className="rn-head">
        <div className="rn-head-main">
          <div className="rn-ver-title">
            {/* "v" 是**格式**不是文案（版本号本体由壳给，不含前缀）——所以不套 t() */}
            {`v${data.version}`}
            {/* `subtitle` = 「2026 年 8 月 30 日 · 稳定通道」，壳侧 `t()` 完（含日期，随语言变） */}
            <span className="rn-ver-sub">{data.subtitle}</span>
          </div>
          <div className="rn-meta">
            <span className="rn-chip">{data.channelLabel}</span>
          </div>
        </div>
        {listUrl && (
          <div className="rn-actions">
            <a className="rn-ghost-btn" href={listUrl} target="_blank" rel="noreferrer">
              {t("在 GitHub 查看全部 →")}
            </a>
          </div>
        )}
      </div>
      <div className="rn-body">
        <div className="rn-hist">
          <div className="rn-hist-head">{t("版本历史")}</div>
          {data.historical.map((h) => (
            <HistoryRow key={h.version} item={h} selected={h.version === data.version} />
          ))}
          {listUrl && (
            <a className="rn-all" href={listUrl} target="_blank" rel="noreferrer">
              {t("所有版本 → GitHub ↗")}
            </a>
          )}
        </div>
        <div className="rn-content">
          {data.banner !== undefined && <Banner text={data.banner} />}
          {/*
            body = GitHub Release 的 GFM 原文 → 走壳共享 MarkdownView（**md 渲染唯一组件**，
            05 §2.4 明文要求）——与插件详情页 README 同一条路：网络内容统一过 sanitize。
          */}
          <MarkdownView markdown={data.body} />
        </div>
      </div>
    </div>
  );
}

/**
 * 左窄栏的一版。**是 `<button>`**不是 `<div>`：整行可点、可 Tab、可 Enter。
 *
 * `aria-current` 只画在选中那一行——读屏要能听出「你现在看的就是这版」。
 * 焦点环不自己画：全局 `*:focus-visible`（`index.css:268`）已经给了可见环，这里**不能** `outline: none`
 * （那会把键盘用户的唯一方位感抹掉）。
 */
function HistoryRow({ item, selected }: { item: PoolReleaseNotesHistoryItem; selected: boolean }) {
  return (
    <button
      type="button"
      className={selected ? "rn-ver rn-ver--on" : "rn-ver"}
      aria-current={selected ? "true" : undefined}
      onClick={() => executePoolCommand("update.releaseNotesSelect", item.version)}
    >
      <span className="rn-ver-num">{`v${item.version}`}</span>
      {/* dateLabel 由壳切好（`MM-DD`，**不走 locale**——切语言不该改它） */}
      <span className="rn-ver-date">{item.dateLabel}</span>
    </button>
  );
}

/**
 * 首启自动弹的横幅。整句文案（含版本号）由壳给——见 `PoolReleaseNotesData.banner` 的注释。
 *
 * ⚠️ 句子只在「宣告的那一版正显示着」时才推下来（壳侧 `bannerVersion === data.version` 才算数）——
 * 用户点左窄栏翻到旧版时，横幅会自己消失。**那是壳的账，池不判**：池只认「给了就画」。
 */
function Banner({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <div className="rn-banner">
      <Sparkles size={14} className="rn-banner-icon" aria-hidden="true" />
      <span className="rn-banner-text">{text}</span>
      <button
        type="button"
        className="rn-banner-btn"
        onClick={() => executePoolCommand("update.releaseNotesDismissBanner")}
      >
        {t("知道了")}
      </button>
    </div>
  );
}
