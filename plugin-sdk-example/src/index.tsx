/**
 * @linkdesk/plugin-sdk 消费形态验收示例——视图插件最小形态。
 *
 * 作者视角的三件事（README 三段对应）：
 *   1. tsconfig `types: ["@linkdesk/plugin-sdk"]` → `window.linkdesk.*` 有类型（.ts/.tsx 直接用，
 *      类型真相源 = @linkdesk/contracts 转发，无手写 global.d.ts、零 @src/core）。
 *   2. plugin.json（name 显示名 + version + entry + contributes.i18n，可注释/尾逗号）。
 *   3. `npm run build`（= 包自带 bin linkdesk-plugin-sdk build）→ 项目根产出
 *      `plugin-sdk-example.linkdesk-plugin`（zip：plugin.json + icon + i18n + index.bundle.js + README）。
 *
 * 产物契约（壳 E6#7 加载）：index.bundle.js `export default` 一个 React 组件，壳以 `{ isActive }` 渲染。
 */

export default function PluginSdkExample({ isActive }: { isActive: boolean }) {
  // 视图插件契约只有 { isActive: boolean }——之外全是标准 React 自由发挥
  if (!isActive) return null;

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h2>Plugin SDK Example</h2>
      <p>来自 plugin-sdk-example——用 @linkdesk/plugin-sdk 构建的视图插件。</p>
      <button
        onClick={() => {
          // window.linkdesk.tabs.create——契约有完整参数/返回类型
          void window.linkdesk.tabs.create("plugin-sdk-example.child");
        }}
      >
        开一个子标签页
      </button>
    </div>
  );
}
