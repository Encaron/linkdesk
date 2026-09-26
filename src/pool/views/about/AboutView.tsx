/**
 * AboutView——E6#57.14a；04「关于 LinkDesk 标签页重设计」（2026-09-26 拍板）四区重排。
 * 设计：`docs/04-软件更新/待抉择池/关于LinkDesk标签页重设计/01-设计.md`（§四 信息架构 / §五 8 维度）。
 * 参考图：同夹 `mockups/01-关于标签页-重设计.html`（4 帧）。
 *
 * ## 壳想、池画
 *
 * 本组件**只画**：HERO（名 + 版本药丸 + 定位句）、卡片×3（本版本 / 运行环境 / 作者）、页脚——
 * 数据与**所有含数据的文本**由壳取好、`t()` 完，挂在 `PoolTab.about` 推下来。
 * 池**自己** `t()` 的只有**纯框架文字**——三个命令按钮与页脚链接的标签。
 *
 * ## 🔴 动作全是既有命令，本项零新建（「入口可多处，命令源唯一」E6#57.10）
 *
 * 复制 → `app.aboutCopy`；检查更新… → `update.checkForUpdates`（第四入口，结果落通知面）；
 * 发行说明 → `update.openReleaseNotes`（兄弟标签页入口）；MIT 全文 → `app.viewLicense`；
 * 「查看源码」/ 邮箱 / GitHub → 纯链接（`mailto:`/`https` 都由 E6#70c 全局外链路由转系统处理）。
 *
 * ## 可划选（4.3）
 *
 * 内容层 `user-select: text`（CSS），按钮/链接保持 `user-select: none`——照 E6#72b 通知面先例，
 * **不动** `index.css:207` 的全局规则。
 *
 * ⚠️ **第二个实参必须由 `executePoolCommand` 补 `undefined`**（token 占位槽）——本视图各调用
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

/* ── Frame：内容（04「关于页重设计」四区：HERO / 动作行 / 卡片×3 / 页脚） ── */

function ContentFrame({ data }: { data: Extract<PoolAboutData, { state: "content" }> }) {
  const { t } = useTranslation();
  return (
    <div className="ldk-about">
      <div className="ldk-about-inner">
        {/* ── ① HERO（居中）：logo 96 / 名 + 版本药丸 / 定位句 ── */}
        <div className="ldk-about-hero">
          {/*
            品牌标 = **壳解析好的真资产 URL**（`assets/logo.svg`，与标题栏同一份）——不是手画的方块。
            `alt=""`：正下方名字已经把品牌说了一遍，读屏再念一次是重复。
          */}
          <img className="ldk-about-logo" src={data.logoUrl} alt="" aria-hidden="true" />
          <div className="ldk-about-hero-name-row">
            <span className="ldk-about-name">{data.name}</span>
            {/* "v" 是格式不是文案（版本号本体由壳给）；这一页被打开的原因（核对版本）放名字旁一眼可见 */}
            <span className="ldk-about-ver">{`v${data.version}`}</span>
          </div>
          <div className="ldk-about-tagline">{data.tagline}</div>
        </div>

        {/* ── ② 动作行（居中）：三条既有命令，本项零新建（「入口可多处，命令源唯一」） ── */}
        <div className="ldk-about-actions">
          <button
            type="button"
            className="ldk-about-btn ldk-about-btn--primary"
            onClick={() => executePoolCommand("app.aboutCopy")}
          >
            {t("复制")}
          </button>
          {/* 「检查更新…」= 既有命令的第四个入口——结果落通知面，本视图不画结果 */}
          <button
            type="button"
            className="ldk-about-btn"
            onClick={() => executePoolCommand("update.checkForUpdates")}
          >
            {t("检查更新…")}
          </button>
          {/* 「发行说明」= 既有命令（兄弟标签页入口），照 `.ldk-rn-btn` 同款形态 */}
          <button
            type="button"
            className="ldk-about-btn"
            onClick={() => executePoolCommand("update.openReleaseNotes")}
          >
            {t("发行说明")}
          </button>
        </div>

        {/* ── ③ 卡片×3（版心内齐宽、卡内左对齐；作者卡缺席时壳少推一张，池不判） ── */}
        {data.cards.map((card) => (
          <section className="ldk-about-card" key={card.title}>
            <div className="ldk-about-card-title">{card.title}</div>
            <div className="ldk-about-card-rows">
              {card.rows.map((row, i) => (
                <div className="ldk-about-row" key={`${row.label}-${i}`}>
                  <span className="k">{row.label}</span>
                  {row.href !== undefined ? (
                    <a
                      className={`ldk-about-link${row.secondary ? " ldk-about-link--secondary" : ""}`}
                      href={row.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.value}
                    </a>
                  ) : (
                    <span className="v">{row.value}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* ── ④ 页脚（居中 muted）：版权行 + 两条外链（隐私政策/帮助不收——拍板⑦） ── */}
        <div className="ldk-about-foot">
          {data.footerCopyright !== undefined && <div className="ldk-about-foot-copy">{data.footerCopyright}</div>}
          <div className="ldk-about-foot-links">
            {/* 「MIT 全文」= 既有命令 app.viewLicense（E6#57.10e）；「查看源码」= updateUrl 推出的仓库主页 */}
            <button type="button" className="ldk-about-foot-link" onClick={() => executePoolCommand("app.viewLicense")}>
              {t("MIT 全文")}
            </button>
            {data.repoUrl !== undefined && (
              <a className="ldk-about-foot-link" href={data.repoUrl} target="_blank" rel="noreferrer">
                {t("在 GitHub 查看源码")}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 加载骨架（一帧的过渡，形状与四区正文一一对应 ⇒ 不跳位） ── */

/**
 * 形状照正文画（HERO 居中：logo 96 + 名字条 + 定位句条，卡×3 各带标题条与两行 kv），
 * 不是居中转圈——真数据落地时无位移跳动（`ReleaseNotesPoolView.LoadingFrame` 同款取舍）。
 *
 * `aria-busy` 给读屏「正在加载」信号；骨架条自身无语义（aria-hidden 段内）。
 * **不做 shimmer**——同兄弟视图定案（本机 IPC 通常不足一帧）。
 */
function LoadingFrame() {
  return (
    <div className="ldk-about" aria-busy="true">
      {/* 🔴 骨架类名沿用 E6#57.14 的旧族（skel-logo / skel-bar--name…）——它们在宿主类名账里，
          改名 = 从快照拿走面（check-api-surface-additive 判红）。重排版式、不换名字。 */}
      <div className="ldk-about-inner" aria-hidden="true">
        <div className="ldk-about-hero">
          <div className="ldk-about-skel ldk-about-skel-logo" />
          <div className="ldk-about-skel-bar ldk-about-skel-bar--name" />
          <div className="ldk-about-skel-bar ldk-about-skel-bar--tagline" />
        </div>
        {[0, 1, 2].map((i) => (
          <section className="ldk-about-card" key={i}>
            <div className="ldk-about-skel-bar ldk-about-skel-bar--title" />
            {[0, 1].map((j) => (
              <div className="ldk-about-row" key={j}>
                <div className="ldk-about-skel-bar ldk-about-skel-bar--k" />
                <div className="ldk-about-skel-bar ldk-about-skel-bar--v" />
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
