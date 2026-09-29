/**
 * AiManualPoolView——M3 `AI#16`。AI 操作手册标签页（**壳直渲染视图**，非插件）。
 * 任务档案：`docs/04-软件更新/已落地/AI友好化-全自动操作/03-任务档案/M3-手册.md`（`AI#16`）。
 * 设计前置：同档「设计前置（8 维度，2026-09-28 本格实施前写）」——本文件的形态由那八条定死。
 *
 * ## 壳想、池画（第三个实例）
 *
 * 本组件**只画**：章节清单与正文都由主进程读盘（`electron/services/ai-manual.ts`）→ 壳 `useAiManual`
 * 挂到 `PoolTab.aiManual` 推下来。池连「加载中还是已就绪」都不自己判（`PoolAiManualData` 三态判别联合）。
 * 同款先例：`ReleaseNotesPoolView`（`#57.13`）/ `AboutView`（`#57.14`）。
 *
 * 池**自己** `t()` 的只有**纯框架文字**（「章节」「随本版本发货 · 内容是当前版本」、空态那三句）——
 * 分界线一句话：**含数据的文本壳推，纯框架文字池写**。手册正文与章标题属**数据**（随包发货的中文原文），
 * ⛔ 不进 `t()`——切语言不该改手册内容。
 *
 * ## 🔴 章切换用**本组件的 `useState`**，不走命令（与发行说明的「换一版」不同，理由在此）
 *
 * 发行说明的版本切换走 `update.releaseNotesSelect` 命令，是因为**换版要重新取数**（壳得去拉那一版），
 * 池根本没这个本事。本视图不取数——**全量章节在打开时一次就到手了**（几十 KB 只读文本），
 * 切换只是「换一个数组下标」。为它单开一条命令会带来：壳侧多一份「当前选中章」状态、
 * 多一条推流路径、多一处跨 IPC 往返，全是**为一个视图内部的下标**买的单。
 *
 * ⚠️ 那「AI 能不能操作这个切换」呢——能，而且比点按钮更直接：手册**本身就是文件**，
 * 它随包落在 `resources/ai-manual/`（本视图空态里印的就是那个目录）。AI 读文档不需要先打开标签页，
 * 更不需要模拟点击导航——这正是「手册必须是文件而不是编译进代码的字符串」的理由。
 *
 * `useState` 是纯视图态（无 effect、无订阅），所以本视图**不需要** `isActive` 参与任何守卫
 * （硬约束 14 只针对带 effect 的组件；`ReleaseNotesPoolView`/`AboutView` 的 `_isActive` 注释同款）。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen } from "lucide-react";
import MarkdownView from "../../../components/shared/markdown-view/MarkdownView";
import type { PoolAiManualData, PoolTab } from "../../../core/types/pool/poolLayout";
import "./AiManualPoolView.css";

interface AiManualPoolViewProps {
  tab: PoolTab;
  /** 本视图**没有任何 effect** ⇒ 用不上（命名 `_isActive` 表明「有意不用」，同兄弟壳视图）。 */
  isActive: boolean;
}

/**
 * 壳还没推载荷时的兜底 = **`loading`**，不是 `empty`。
 *
 * 理由（同 `ReleaseNotesPoolView.PENDING` / `AboutView.PENDING`）：还没推 = 壳正在准备
 * （`openAiManualTab` 先取数后开 tab，理论上到不了这里）；画错方向的代价不对称——
 * 画成 `empty` 会让用户读到「这个构建没带手册」，那是**撒谎**（手册好端端在包里），
 * 画成骨架只是多等一帧。
 */
const PENDING: PoolAiManualData = { state: "loading" };

export default function AiManualPoolView({ tab, isActive: _isActive }: AiManualPoolViewProps) {
  const data: PoolAiManualData = tab.aiManual ?? PENDING;
  /** 当前章的 id；`null` = 还没选过 ⇒ 落第一章（手册的 `00-` 就是阅读起点）。 */
  const [activeId, setActiveId] = useState<string | null>(null);

  if (data.state === "loading") return <LoadingFrame />;
  if (data.state === "empty") return <EmptyFrame dir={data.dir} />;
  return <ContentFrame data={data} activeId={activeId} onSelect={setActiveId} />;
}

/* ── 加载中（一帧的过渡：形状照正文画 ⇒ 不跳位，零动效） ── */

function LoadingFrame() {
  const { t } = useTranslation();
  return (
    <div className="ldk-manual" aria-busy="true">
      <div className="ldk-manual-head">
        <div className="ldk-manual-skel ldk-manual-skel--head" aria-hidden="true">
          <div className="ldk-manual-skel-bar ldk-manual-w40" />
          <div className="ldk-manual-skel-bar ldk-manual-w70" />
        </div>
      </div>
      <div className="ldk-manual-body">
        <div className="ldk-manual-nav">
          <div className="ldk-manual-nav-head">{t("章节")}</div>
          <div className="ldk-manual-skel-list" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div className="ldk-manual-skel-bar ldk-manual-w90" key={i} />
            ))}
          </div>
        </div>
        <div className="ldk-manual-content">
          <div className="ldk-manual-skel" aria-hidden="true">
            <div className="ldk-manual-skel-bar ldk-manual-skel-bar--h18 ldk-manual-w40" />
            <div className="ldk-manual-skel-bar ldk-manual-w90" />
            <div className="ldk-manual-skel-bar ldk-manual-w90" />
            <div className="ldk-manual-skel-bar ldk-manual-w70" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 空态：这个构建没带手册 ── */

/**
 * `empty` 覆盖两种来源（「没随包发货」与「非壳环境取不到」）——对读者是同一件事：这里没有内容。
 * 所以文案**不分原因**（在没有原因数据的前提下硬分就是把猜测画成事实，
 * `ReleaseNotesPoolView.EmptyFrame` 的 🔴 段同款纪律），只把**手册应当所在的目录**如实印出来。
 *
 * `dir` 为空串 = 连路径都不知道（非壳环境）⇒ 那一行不画（不是画一个空路径）。
 */
function EmptyFrame({ dir }: { dir: string }) {
  const { t } = useTranslation();
  return (
    <div className="ldk-manual">
      <div className="ldk-manual-head">
        <div className="ldk-manual-head-main">
          <div className="ldk-manual-title">{t("AI 操作手册")}</div>
        </div>
      </div>
      <div className="ldk-manual-body ldk-manual-body--center">
        <div className="ldk-manual-empty">
          <div className="ldk-manual-empty-icon" aria-hidden="true">
            <BookOpen size={20} />
          </div>
          <div className="ldk-manual-empty-title">{t("没有可读的手册内容")}</div>
          <p className="ldk-manual-empty-desc">{t("本构建未随包发货手册，或手册目录不存在。")}</p>
          {dir !== "" && (
            <p className="ldk-manual-empty-path">
              {t("手册目录：")}
              {/* 路径是**值**不是文案（原样透传，含分隔符与盘符），所以不套 t() */}
              <code>{dir}</code>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 正文：左窄栏章节导航 + 右主区 markdown ── */

function ContentFrame({
  data,
  activeId,
  onSelect,
}: {
  data: Extract<PoolAiManualData, { state: "content" }>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  // 选中章不在清单里（载荷换了 / 还没选过）→ 落第一章。**这是纯展示兜底**，
  // 不是「态判定」（态仍然只由壳给的那个 `state` 决定）——⛔ 别把这段挪成第二处态裁决。
  const current = data.chapters.find((c) => c.id === activeId) ?? data.chapters[0];

  return (
    <div className="ldk-manual">
      <div className="ldk-manual-head">
        <div className="ldk-manual-head-main">
          <div className="ldk-manual-title">{t("AI 操作手册")}</div>
          {/* 「v」是格式不是文案；版本号本体来自主进程 app.getVersion()（不是手册正文里的版本号） */}
          <div className="ldk-manual-sub">{t("随本版本发货 · 内容是当前版本 v{{version}}", { version: data.version })}</div>
        </div>
      </div>

      <div className="ldk-manual-body">
        <nav className="ldk-manual-nav" aria-label={t("章节")}>
          <div className="ldk-manual-nav-head">{t("章节")}</div>
          {data.chapters.map((c) => (
            <button
              type="button"
              key={c.id}
              className={c.id === current.id ? "ldk-manual-ch ldk-manual-ch--on" : "ldk-manual-ch"}
              aria-current={c.id === current.id ? "true" : undefined}
              onClick={() => onSelect(c.id)}
            >
              {/* 章标题 = 手册数据（正文首个 `# `，解析不到时主进程回落文件名）——不套 t() */}
              <span className="ldk-manual-ch-label">{c.title}</span>
            </button>
          ))}
        </nav>
        {/*
          `key={current.id}`：换章时让本容器**整个重挂** ⇒ 滚动位置回到章首。
          没有它，读完第 5 章再切到第 1 章会停在半空（同一容器、同一 scrollTop）。
        */}
        <div className="ldk-manual-content" key={current.id}>
          {/* 正文 = 随包 GFM 原文 → **唯一 md 渲染件**（`MarkdownView` 自走 sanitize），池不自己解析 */}
          <MarkdownView markdown={current.markdown} />
        </div>
      </div>
    </div>
  );
}
