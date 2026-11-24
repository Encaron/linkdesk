/**
 * 「记住本次选择」复选框 —— 安装确认卡与批量更新汇总卡共用（2026-11-24 去重）。
 *
 * 🔴 **必须持本地状态**（2026-11-24 实机：「以后此来源的更新不再询问」点不动）。
 * 原先按"哑件不持状态"写：`checked` 直接取 props —— 而 props 来自壳的确认计划（未信任 ⇒ 恒 false），
 * 用户点一下 → onChange 触发 → 壳去写信任（异步）→ 组件按旧 props 重渲染 ⇒ **立刻弹回未勾**，
 * 看起来就是"点了没反应"。复选框是**用户输入控件**：视觉必须立刻跟随手指，
 * 真正的持久化仍由 `onRememberChange` 交给壳（⛔ 不在这里写配置）。
 *
 * 同步规则：props 的 checked 变了（例如壳重算计划后真的变成已信任）⇒ 以 props 为准覆盖本地。
 */

import { useEffect, useState } from "react";

export function RememberCheck({
  remember,
  onRememberChange,
}: {
  remember: { checked: boolean; label: string };
  onRememberChange?: (checked: boolean) => void;
}) {
  const [checked, setChecked] = useState(remember.checked);
  useEffect(() => {
    setChecked(remember.checked);
  }, [remember.checked]);

  return (
    <label className="ldk-pic-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          setChecked(e.target.checked);
          onRememberChange?.(e.target.checked);
        }}
      />
      <span>{remember.label}</span>
    </label>
  );
}
