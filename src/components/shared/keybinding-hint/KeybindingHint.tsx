/**
 * KeybindingHint——**快捷键键帽**渲染件（04「悬停提示系统」件 1；用户 2026-09-27 拍板 ③
 * 「统一到键帽，并顺带归一右键菜单」）。
 *
 * ── 为什么要有这个件（归一化缺口，设计详案 §一·1.5）──
 * 拍板前全软件有**两种**快捷键长相：
 *   ① 右键菜单 = 等宽纯文本（`ContextMenu.css:92`：`--font-mono` + `opacity:.6`）
 *   ② 命令面板 = 键帽 `<kbd>`（`QuickPickHost.css:238`：`--kbd-bg`/`--kbd-border`）
 * 提示条本该是**第三种**——拍板决定消灭它：**统一到 ② 键帽**，并把 ① 一起改过来。
 * ⇒ 本件是「键帽」这一个长相的落点；菜单与提示条都消费它（⛔ 不再各写一份 CSS）。
 *
 * ── 输入契约（池层纪律）──
 * 只吃**壳已格式化**的串（`"Ctrl+K Ctrl+T"`：空格分隔 chord、chord 内 `+` 连接——见
 * `src/core/utils/formatKeyLabel.ts`）。本件**不做格式化**、不 import `src/core/*`
 * （池是哑渲染器——`PoolZoneShell.tsx` 头注释「不 import 任何 @src/core/* 运行时模块」）。
 *
 * ── 保底 ──
 * 空串 / 纯空白 ⇒ 返回 `null`（⛔ 不出空键帽壳——照 HintCard 保底④「不出空壳」）。
 */
import "./KeybindingHint.css";

// 内部共享件（⛔ 不在 `@linkdesk/ui` barrel——插件不直接画快捷键）——Props 类型本模块自用，
// 不导出（knip 判「导出未用」；真要给作者用，先走 barrel ＋ 门禁同笔）。
interface KeybindingHintProps {
  /** 壳已格式化的快捷键串（`"Ctrl+K Ctrl+T"`）；chord 间空格，chord 内 `+` */
  label: string;
  /** 附加类名（调用方只做布局定位用——⛔ 不要在调用方重定义键帽外观） */
  className?: string;
}

function KeybindingHint({ label, className }: KeybindingHintProps) {
  if (!label.trim()) return null; // 保底：空串不出空壳
  const chords = label.split(" ").filter(Boolean);
  return (
    <span className={className ? `ldk-keybinding-hint ${className}` : "ldk-keybinding-hint"}>
      {chords.map((chord, ci) => (
        // chord 之间用间距分开（如 "Ctrl+K Ctrl+T" 是两段按下）——⛔ 不画 `+`，那是 chord 内的事
        <span className={ci > 0 ? "ldk-keybinding-hint-chord ldk-keybinding-hint-chord--spaced" : "ldk-keybinding-hint-chord"} key={`${chord}-${ci}`}>
          {chord.split("+").filter(Boolean).map((key, ki) => (
            <span key={`${key}-${ki}`}>
              {ki > 0 && <span className="ldk-keybinding-hint-sep">+</span>}
              <kbd>{key}</kbd>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

export default KeybindingHint;
