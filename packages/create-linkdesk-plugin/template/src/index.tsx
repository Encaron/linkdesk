/**
 * {{displayName}}——LinkDesk 插件主视图（由 create-linkdesk-plugin 生成）。
 *
 * 视图插件契约（E5.8，见 docs/03-插件制造/01-API契约.md）：壳以 { isActive, tabId?, sourceId? }
 * 渲染本文件 default 导出的组件：
 *   - isActive  本标签当前是否聚焦。keep-alive 下非聚焦标签仍在渲染，isActive 只用于
 *               gate「聚焦才跑」的副作用（如自动保存），切勿用它整块 blank 掉内容。
 *   - tabId     本标签页 id。
 *   - sourceId  上下文数据（文件路径 / 数据源等），编辑器类插件用它定位内容。
 *
 * 样式：LinkDesk 主题色一律走 CSS 变量 var(--xxx)（见 index.css 示例），禁硬编码 hex。
 * UI 文案规范化后用 t()（react-i18next，壳提供）读 i18n/en.json——见 05-UI写法规约.md。
 * 壳已 external react/react-dom/react-i18next/i18next——构建不会打进包，插件工程无需 npm i 它们。
 */

import "./index.css";

export default function HelloPlugin(_props: { isActive?: boolean; tabId?: string; sourceId?: string }) {
  return (
    <div className="starter">
      <h2 className="starter__title">{{displayName}} 跑起来了 ✨</h2>
      <p className="starter__text">这是你的第一个 LinkDesk 插件。</p>
      <p className="starter__hint">
        编辑 <code>src/index.tsx</code> 即可看到变化；<code>npm run build</code> 打包出{" "}
        <code>.linkdesk-plugin</code> 分发文件。
      </p>
    </div>
  );
}
