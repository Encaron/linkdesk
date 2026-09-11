/**
 * useActionBits——右上动作列五枚小件的**求解**（版本下拉 / 安装下拉 / 版本动作钮 / 自动更新勾 /
 * 「已停在 vX」说明件）。E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 原样搬出
 * （每条判据表达式一字未改），零行为变更——门面因此只剩「调 hook + 组三件」。
 *
 * 分工：**本文件算判据，`actionBits.*` 只出画**（`null` = 该槽不出画）。五个判据全依赖
 * 「装到哪一步了」（busy/updating/installingHere/online）与「版本历史有没有」，故集中一处。
 */

import { autoToggleOf, installPickerOf, pinnedNoteOf, versionActButton, versionPickerOf, type T } from "./actionBits";
import type { useDetailActions } from "./useDetailActions";
import type { useDetailVersionAction } from "./useDetailVersionAction";
import type { useDetailVersions } from "./useDetailVersions";
import type { useInstallAction } from "./useInstallAction";

type Versions = ReturnType<typeof useDetailVersions>;
type Actions = ReturnType<typeof useDetailActions>;
type Install = ReturnType<typeof useInstallAction>;
type VersionAction = ReturnType<typeof useDetailVersionAction>;

export function useActionBits(o: {
  ver: Versions;
  act: Actions;
  inst: Install;
  vAct: VersionAction;
  /** #30.9b 离线态——动作钮置灰 + 「联网后重试」提示 */
  online: boolean;
  /** 挂起（缺依赖/未完成安装）——挂起态不画版本类小件（装态选择无效） */
  pending: boolean;
  installed: boolean;
  /** 目录里有这个条目（`!!entry`）——未装装版本下拉的出画前提之一 */
  hasEntry: boolean;
  t: T;
}) {
  const { ver, act, inst, vAct, online, pending, installed, hasEntry, t } = o;
  /* E6#33c/#30.9a M6：安装/更新进行中 → 版本下拉置灰（M6 锚——装态选择目标无效） */
  const pickerDisabled = act.busy || act.updating || inst.installingHere;

  /* 版本选择器（装/升/降目标）——versions.length>1 才有历史才显示，判据（含 E6#81 的住所闸）在 useDetailVersions */
  const versionPicker = versionPickerOf({
    show: ver.hasVersionHistory && ver.canSwitchVersion && !pending,
    value: ver.targetVersion,
    options: ver.pickerOptions,
    disabled: pickerDisabled,
    onPick: ver.setPickedVersion,
    t,
  });
  const installPicker = installPickerOf({
    show: ver.hasVersionHistory && !installed && hasEntry,
    value: ver.targetVersion,
    options: ver.pickerOptions,
    disabled: act.busy || inst.installingHere,
    onPick: ver.setPickedVersion,
    t,
  });
  /* 版本动作钮（升 = 直行；降 = requestDowngrade 先 F2 确认再放行 allowOlder——05 §二·十一） */
  const actButton =
    ver.actTarget && ver.actDir && ver.actDir !== "same"
      ? versionActButton({
          target: ver.actTarget,
          dir: ver.actDir,
          updating: act.updating,
          disabled: act.busy || act.updating || !online,
          online,
          onDowngrade: (v) => void vAct.requestDowngrade(v),
          onUpdate: (v) => void vAct.doVersionAction(v),
          t,
        })
      : null;
  /* #33d 自动更新勾选 + E6#83「已停在 vX」说明件（row2 两条会打架的意愿并排） */
  const autoUpdateToggle = autoToggleOf({
    show: installed && !pending,
    checked: act.autoOn,
    disabled: pickerDisabled,
    onChange: (on) => void act.handleAutoToggle(on),
    t,
  });
  const pinnedNote = pinnedNoteOf({ show: installed && !pending, version: act.pinnedVer, t });

  return { versionPicker, installPicker, actButton, autoUpdateToggle, pinnedNote };
}
