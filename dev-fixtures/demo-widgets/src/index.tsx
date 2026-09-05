/**
 * demo-widgets——E6#54e 第三方独立构建 UI 演示 fixture（虚构插件，非真实运行时插件）。
 *
 * 验证目标（07 §九）：第三方作者不用 @src、`npm i @linkdesk/ui` 写出与内置同款控件
 * （Toggle 开关 / Combobox 下拉 / NumberInput / Button / ContextMenu 右键），
 * 独立构建（linkdesk-plugin-sdk build）为 .linkdesk-plugin 装进 LinkDesk 后视觉与内置一致；
 * 切玻璃主题 → var(--*) 自动跟随（@linkdesk/ui 控件层零思考跟随 = 玻璃达标下限）。
 *
 * 本源码自身就是 §11 token 契约的正例：颜色全 var(--*)、字号走 --font-size-* token、
 * 间距为 4px 节奏倍数、UI 文案无中文字面量——`linkdesk-plugin-sdk lint` 应零偏离
 * （门禁 15 项全 WARN：做对 = 零警告，做错 = 显红可知情绕行）。
 */
import { useEffect, useState } from "react";
import {
  Button,
  Combobox,
  ContextMenu,
  FormRow,
  NumberInput,
  Toggle,
} from "@linkdesk/ui";

const BAUD_OPTIONS = ["9600", "115200", "230400", "921600"];

/* 模块级注册（守卫幂等，对齐内置插件 pattern）——命令走 window.linkdesk.commands（零 @src/core）。
 * handler 不声明 _token：两半程 infra 剥 token 后原样转发，handler 直接收 args。 */
let _registered = false;
function ensureCommands(): void {
  if (_registered) return;
  _registered = true;
  const lk = window.linkdesk;
  const reg = lk?.commands?.registerCommand;
  if (!reg) return; // 双进程执行守卫（壳/池 preload 均含 commands 命名空间）

  reg("demo-widgets.hello", async (...args: unknown[]) => {
    const ctx = args[0] as { demoName?: string } | undefined;
    void lk?.notifications?.show?.(`Hello, ${ctx?.demoName ?? "world"}!`, { type: "info" });
  });
  reg("demo-widgets.bump", async () => {
    void lk?.notifications?.show?.("demo-widgets.bump executed", { type: "info" });
  });

  // 右键菜单项——自定义 open-string MenuId（非壳内置槽位，插件零壳改动）
  lk?.menu?.registerItems?.("demo-widgets.view", "demo-widgets", [
    { command: "demo-widgets.hello", group: "navigation" },
    { command: "demo-widgets.bump", group: "navigation" },
  ]);
}
ensureCommands();

export default function DemoWidgets({ isActive }: { isActive: boolean }) {
  const [autoConnect, setAutoConnect] = useState(true);
  const [baud, setBaud] = useState("115200");
  const [retries, setRetries] = useState(3);
  const [ctxAnchor, setCtxAnchor] = useState<{ x: number; y: number } | null>(null);

  // 🔴 isActive = 单聚焦（E5.8#30.15）≠「是否可见」——分屏下非聚焦 pane 仍显示。
  // 视图必须始终渲染内容（可见性由壳 display 控制，keep-alive 保状态）；isActive 只 gate 焦点敏感副作用。
  // 正例用法 ↓：右键菜单是 transient 浮层，失焦即关（防止菜单悬在另一 pane 上）。
  useEffect(() => {
    if (!isActive) setCtxAnchor(null);
  }, [isActive]);

  return (
    <div
      style={{
        padding: 24,
        fontFamily: "var(--font-ui)",
        fontSize: "var(--font-size-md)",
        color: "var(--text-primary)",
        background: "var(--bg-window)",
        height: "100%",
      }}
    >
      <h2 style={{ margin: 0, marginBottom: 16, fontSize: "var(--font-size-xl)", color: "var(--text-primary)" }}>
        Demo Widgets
      </h2>
      <p style={{ margin: 0, marginBottom: 24, color: "var(--text-secondary)" }}>
        Third-party plugin built from @linkdesk/ui — Toggle / Combobox / NumberInput / Button / ContextMenu.
      </p>

      <section
        style={{
          background: "var(--bg-card)",
          borderRadius: "var(--surface-radius)",
          padding: 16,
          maxWidth: 440,
          display: "grid",
          gap: 16,
        }}
      >
        <FormRow label="Auto connect">
          <Toggle checked={autoConnect} onChange={setAutoConnect} />
        </FormRow>
        <FormRow label="Baud rate">
          <Combobox value={baud} options={BAUD_OPTIONS} onChange={setBaud} />
        </FormRow>
        <FormRow label="Retries">
          <NumberInput value={retries} onChange={setRetries} min={0} max={10} />
        </FormRow>
        <Button
          onClick={() => {
            void window.linkdesk?.notifications?.show?.("Demo Widgets primary action", { type: "info" });
          }}
        >
          Primary action
        </Button>
      </section>

      <div
        onContextMenu={(e) => {
          e.preventDefault();
          setCtxAnchor({ x: e.clientX, y: e.clientY });
        }}
        style={{
          marginTop: 24,
          padding: 12,
          border: "1px dashed var(--border)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-muted)",
          maxWidth: 440,
          userSelect: "none",
        }}
      >
        Right-click this area for the demo context menu.
      </div>

      {ctxAnchor && (
        <ContextMenu
          menuId="demo-widgets.view"
          anchor={ctxAnchor}
          context={{ demoName: baud }}
          onClose={() => setCtxAnchor(null)}
        />
      )}
    </div>
  );
}
