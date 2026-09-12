/**
 * AboutView——E6#57.14a。关于标签页（**壳直渲染视图**，非插件）。
 * 设计：`docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/06-关于标签页.md` §4.2-§4.3。
 * 验收图：`06-主软件更新/mockups/02-更新通知与关于.html` **Frame 6**。
 *
 * ## 壳想、池画
 *
 * 本组件**只画**：数据（品牌名 + 字段表）与**所有含数据的文本**（含字段名）都由壳取好、`t()` 完，
 * 挂在 `PoolTab.about` 上推下来。池**自己** `t()` 的只有**纯框架文字**——两个按钮
 * （「检查更新…」「复制」），它们不含任何字段值、不随数据变。
 * 分界线一句话：**含数据的文本壳推，纯框架文字池写**（`ReleaseNotesPoolView` 同款）。
 *
 * ## 🔴 两个按钮都走命令，且都不是新通道
 *
 * - **「复制」→ `app.aboutCopy`**（壳侧 `aboutCommands.ts` 注册）：剪贴板的写入口
 *   （`ClipboardService`）在 core，池**够不着** ⇒ 命令是唯一可行的路，不是「更优雅」。
 * - **「检查更新…」→ `update.checkForUpdates`**（**既有命令，不复用不新建**）：关于页是它的
 *   第四个入口（前三个 = 帮助菜单 / 齿轮菜单 / TitleBar 按钮）——「入口可多处，命令源唯一」
 *   （E6#57.10）。结果落**通知面**（有更新 / 最新 / 失败+`[重试]` 三条分支），
 *   本视图**不画结果**（通知面唯一，另开第二个面就是两份真相源）。
 *
 * ⚠️ **第二个实参必须由 `executePoolCommand` 补 `undefined`**（token 占位槽）——本视图两个调用
 * 都是零入参，靠 `executePoolCommand` 内部恒补，见该文件头注的 🔴 段。
 */

import { useTranslation } from "react-i18next";
import { executePoolCommand } from "../../commands/executePoolCommand";
import type { PoolAboutData, PoolTab } from "../../../core/types/pool/poolLayout";
import "./AboutView.css";

interface AboutViewProps {
  tab: PoolTab;
  /**
   * 本视图**没有任何 effect**（数据是壳推的、不留订阅，按钮是命令）⇒ 这个参数目前用不上。
   * 保留它是为了对齐兄弟壳视图的调用形状（`ShellViewRenderer` 统一传），
   * 命名 `_isActive` 表明「有意不用」——不是漏接硬约束 14 的活跃守卫（那条只针对有 effect 的组件）。
   */
  isActive: boolean;
}

/**
 * 壳还没推载荷时的兜底 = **`loading`**，不是画一屏 `—`。
 *
 * 理由同 `ReleaseNotesPoolView.PENDING`：还没推 = 壳正在准备（`openAboutTab` 先设态后开 tab，
 * 理论上到不了这里）。画成 `content` + 全 `—` 会让用户读到「这台机器读不出身份」——那是**撒谎**
 * （数据只是还没到），骨架只是多等一帧。
 */
const PENDING: PoolAboutData = { state: "loading" };

export default function AboutView({ tab, isActive: _isActive }: AboutViewProps) {
  const data: PoolAboutData = tab.about ?? PENDING;

  if (data.state === "loading") return <LoadingFrame />;
  return <ContentFrame data={data} />;
}

/* ── Frame 6：内容 ── */

function ContentFrame({ data }: { data: Extract<PoolAboutData, { state: "content" }> }) {
  const { t } = useTranslation();
  return (
    <div className="about">
      <div className="about-inner">
        {/*
          品牌标 = **壳解析好的真资产 URL**（`assets/logo.svg`，与标题栏同一份）——不是手画的方块。
          见 `PoolAboutData.logoUrl` 的 🔴 段：mockup 那个圆角方块是示意，真资产才是唯一真值。
          `alt=""` 而非 `alt="LinkDesk"`：正下方 `.about-name` 已经把名字说了一遍，
          读屏再念一次是重复。
        */}
        <img className="about-logo" src={data.logoUrl} alt="" aria-hidden="true" />
        <div className="about-name">{data.name}</div>
        <div className="about-fields">
          {/* 顺序、条数、名字全由壳定——池只 `map`，加字段本文件一个字都不用改 */}
          {data.fields.map((f) => (
            <div className="about-row" key={f.label}>
              <span className="k">{f.label}</span>
              <span className="v">{f.value}</span>
            </div>
          ))}
        </div>
        <div className="about-actions">
          {/* 「检查更新…」= 既有命令的第四个入口（见文件头） */}
          <button
            type="button"
            className="about-btn"
            onClick={() => executePoolCommand("update.checkForUpdates")}
          >
            {t("检查更新…")}
          </button>
          {/* 「复制」= 主按钮（Frame 6 的 `.about-btn.primary` 在右侧） */}
          <button
            type="button"
            className="about-btn about-btn--primary"
            onClick={() => executePoolCommand("app.aboutCopy")}
          >
            {t("复制")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 加载骨架（一帧的过渡，形状与 Frame 6 一一对应 ⇒ 不跳位） ── */

/**
 * 形状照正文画（标 56×56 + 名字条 + 八行 key/value 条 + 两个按钮位），不是居中转圈——
 * 所以真数据落地时不会有位移跳动（`ReleaseNotesPoolView.LoadingFrame` 同款取舍）。
 *
 * `aria-busy` 给读屏一个「正在加载」的信号；骨架条自身 `aria-hidden`（它们没有语义内容）。
 * **不做 shimmer 动效**——同 `ReleaseNotesPoolView` 的定案（本机 IPC 通常不足一帧，
 * 动效只会闪一下；`prefers-reduced-motion` 下本来也要关）。
 */
function LoadingFrame() {
  return (
    <div className="about" aria-busy="true">
      <div className="about-skel" aria-hidden="true">
        <div className="about-skel-logo" />
        <div className="about-skel-bar about-skel-bar--name" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div className="about-row" key={i}>
            <div className="about-skel-bar about-skel-bar--k" />
            <div className="about-skel-bar about-skel-bar--v" />
          </div>
        ))}
      </div>
    </div>
  );
}
