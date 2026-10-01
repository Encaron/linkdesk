/**
 * EmptyStage——W7b（欢迎页重设计 T12）零标签空场层。
 *
 * 语义：主区**没有任何标签页**时铺在主区里的品牌空场背景。**不是标签页**——不在标签栏、无 ×、
 * 不参与 keep-alive 面板体系（TabContentLayer 只认 tab）。
 *
 * 两个渲染点复用同一组件（设计 §三 W7）：
 *   ① MainZone `groups.length === 0` 分支——T11 拆「main 恒非空」后近乎不可达的兜底，
 *      原为「没有打开的标签页」一行可见文案（下沉为屏读文案，见文件尾）；
 *   ② GroupPane 零 tabs 分支——**主窗常态**：关掉最后一个标签页即此态（T11 起 main 可空）。
 *
 * 单色：logo 与字标同用一枚 `--text-muted`，只靠透明度分层。logo `.14` 是装饰件（§六#1 豁免），
 * 字标 46px 属大字、满不透明度 ⇒ 两主题 ≥3:1（暗 #8A8A8A/#1E1E1E ≈4.0:1；亮 #767676/#FFF ≈4.5:1）。
 *
 * 字标字体 = 派生 token `--font-mark`：`app.fontFamily` 显式设置 = 其值；未设（空/`__none__` 哨兵）
 * = 衬线栈（`src/index.css` :root 默认；种子写入见 ThemeEngine/seeds.ts getAppearanceOverrides）。
 */

import { useTranslation } from "react-i18next";
import "./EmptyStage.css";

export default function EmptyStage() {
  const { t } = useTranslation();
  return (
    <div className="ldk-empty-stage">
      {/* 正典实心 logo（build/icon.svg：实心六边形＋三孔）。三孔走 fill-rule:evenodd **真镂空**——
          mockup 用 `fill="var(--bg-window)"` 把窗底当纸画孔，放到玻璃分区面上会显出三个假圆点。 */}
      <svg className="ldk-empty-stage-mark" viewBox="0 0 100 114" aria-hidden="true">
        <path
          fillRule="evenodd"
          fill="var(--text-muted)"
          d="M50 4L96 30L96 84L50 110L4 84L4 30Z M42 36a8 8 0 1 0 16 0a8 8 0 1 0-16 0Z M24 72a8 8 0 1 0 16 0a8 8 0 1 0-16 0Z M60 72a8 8 0 1 0 16 0a8 8 0 1 0-16 0Z"
        />
      </svg>
      <div className="ldk-empty-stage-wordmark">
        Link<em>Desk</em>
      </div>
      {/* 屏读定位：空场整体是装饰件，但「这里没有标签页」不能被读屏吞掉 */}
      <span className="ldk-empty-stage-sr">{t("没有打开的标签页")}</span>
    </div>
  );
}
