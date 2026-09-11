/**
 * actionBits——详情页右上动作列里的五个「小件」构造器（版本下拉 / 安装下拉 / 版本动作钮 / 自动更新勾 /
 * 「已停在 vX」说明件）。E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 原样搬出，零行为变更。
 *
 * 为什么是「构造器」不是「组件」：它们是**同一行的片段**（`null` 表示该槽不出画），调用点需要把结果与
 * 别的槽拼在一处；写成组件会多一层 Fragment 且拿不到「空则整行不渲染」的祖父判断。判据（show 布尔）
 * 全部由调用方算好传入——本文件零业务判断，只有版式。
 */

import type { ReactNode } from "react";
import { Button, SelectBox } from "@linkdesk/ui";

/** i18n 取值签名（同 `installJobs.installJobLabel` 的写法——不引 i18next 类型，结构即契约） */
export type T = (key: string, opts?: Record<string, unknown>) => string;

type Options = Array<{ value: string; label: string }>;

/** 版本选择器（装/升/降目标）——versions.length>1 才有历史才显示：installed 态在动作区首槽（05 §四）。
 *  E6#81：`show` 内含 `canSwitchVersion`（住所可写）——不可切换版本的插件不画下拉（见 useDetailVersions）。 */
export function versionPickerOf(o: {
  show: boolean;
  value?: string;
  options: Options;
  disabled: boolean;
  onPick: (v: string) => void;
  t: T;
}): ReactNode {
  if (!o.show) return null;
  return (
    <SelectBox
      value={o.value ?? ""}
      options={o.options}
      onChange={(v) => o.onPick(v)}
      disabled={o.disabled}
      title={o.t("选择版本")}
      className="mpd-version-select"
    />
  );
}

/** 未装版本下拉（versions>1 选装哪个版本——05 §四场景①，选中即目标，默认最新/升级提示则 target） */
export function installPickerOf(o: {
  show: boolean;
  value?: string;
  options: Options;
  disabled: boolean;
  onPick: (v: string) => void;
  t: T;
}): ReactNode {
  if (!o.show) return null;
  return (
    <SelectBox
      value={o.value ?? ""}
      options={o.options}
      onChange={(v) => o.onPick(v)}
      disabled={o.disabled}
      title={o.t("选择版本")}
      className="mpd-version-select"
    />
  );
}

/** 版本动作钮（升 = 直行；降 = 先 F2 确认再放行 allowOlder——05 §二·十一）。
 *  `dir` 已由调用方收敛到 up/down（"same" 时不画）——本件零方向判定。 */
export function versionActButton(o: {
  target: string;
  dir: "up" | "down";
  updating: boolean;
  disabled: boolean;
  online: boolean;
  onDowngrade: (v: string) => void;
  onUpdate: (v: string) => void;
  t: T;
}): ReactNode {
  const down = o.dir === "down";
  return (
    <Button
      onClick={() => {
        if (down) o.onDowngrade(o.target);
        else o.onUpdate(o.target);
      }}
      disabled={o.disabled}
      title={!o.online ? o.t("联网后重试") : undefined}
    >
      <span className={"codicon " + (down ? "codicon-arrow-down" : "codicon-arrow-up")} />
      {o.updating
        ? o.t("更新中...")
        : down
          ? o.t("降级到 {{version}}", { version: `v${o.target}` })
          : o.t("更新到 {{version}}", { version: `v${o.target}` })}
    </Button>
  );
}

/** #33d 自动更新勾选（mockup 帧 5/6/7 .auto-upd——版本偏好副控制，置主动作钮之后尾位）。
 *  G2（05 §五）：autoUpdate 是**已装条目属性**——只在已装且非挂起渲染；控制 disabled while 动作进行
 *  （pickerDisabled = busy/updating/installingHere 同栅——替换期间不可改偏好，mockup 帧 2 auto-disabled）。 */
export function autoToggleOf(o: {
  show: boolean;
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
  t: T;
}): ReactNode {
  if (!o.show) return null;
  return (
    <label
      className={"mpd-auto-upd" + (o.disabled ? " disabled" : "")}
      title={o.t("勾选后自动更新——有新版本就自动装上，装完发通知告诉你")}
    >
      <input
        type="checkbox"
        checked={o.checked}
        disabled={o.disabled}
        onChange={(e) => o.onChange(e.target.checked)}
      />
      {o.t("自动更新")}
    </label>
  );
}

/** 🔴 E6#83：「已停在 vX」说明件——`pinnedVersion` 的**唯一可见面**（此前零显示）。
 *  同 row2 与自动更新勾并排：那两条正是会打架的两条意愿，摆在一起用户一眼能看出彼此关系；勾上开关即清钉、
 *  这枚件随之消失（可见的因果反馈）。
 *  设计（硬约束 16 已走 design skill）：**非按钮状态件**——纯说明、不可点，解钉的两条正路是勾开关或在下拉里
 *  选最新版，不给一个按不动的按钮（同 `.mpd-blocked-chip` 判据）。视觉复用 `.mpd-auto-upd` 同族 token。 */
export function pinnedNoteOf(o: { show: boolean; version?: string; t: T }): ReactNode {
  if (!o.show || o.version === undefined) return null;
  return (
    <span
      className="mpd-pinned-note"
      title={o.t("你从版本下拉里挑了 {{version}}，自动更新会跳过它——勾上「自动更新」或在下拉里选最新版即可解除", {
        version: `v${o.version}`,
      })}
    >
      <span className="codicon codicon-pin" />
      {o.t("已停在 {{version}}", { version: `v${o.version}` })}
    </span>
  );
}
