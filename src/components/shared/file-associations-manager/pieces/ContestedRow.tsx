/**
 * file-associations-manager/pieces/ContestedRow——「多候选类型」区的一行（一个**聚合格**）。
 *
 * 一行 = 「同一批候选 × 同一生效值」的若干类：行标签列前 3 类（超出「等 N 类」）、描述行说清
 * 「当前单击打开谁（＋词法口径）」与候选家数，控制区件序 = [「N 个候选」徽标][下拉][齿轮]——
 * **下拉整格生效**（一次改这一类）。同一签名下某类被单独设置 ⇒ 按生效值自然拆成独立格
 * （描述行会补一句「整组 M 类中 K 类单独设置」）；恢复自动后并回。
 *
 * 🔴 齿轮菜单项由消费方注入（`gearItems`）：命令 id 是插件/宿主自己的资产——共享件不认识任何
 * 命令 id。空/缺省 ⇒ **不出齿轮**（零覆盖 + 无动作可给时的表达只能是「不出这一项」——
 * 菜单项没有置灰态）。
 *
 * 骨架＝设置行同款（信息区 ＋ 控制区 ＋ hover 齿轮），但**类名自成一族**（`ldk-famgr-*`）：
 * ⛔ 共享件不得借宿主族段 `settings-*`（硬约束 23）——第三方渲染方那里没有那套骨架。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MenuItemDescriptor } from "@linkdesk/contracts";
import Badge from "../../badge/Badge";
import ContextMenu from "../../context-menu/ContextMenu";
import SelectBox from "../../select-box/SelectBox";
import { EXT_LABEL_MAX, extLabelHead } from "../deriveModel";
import type { ContestedRowModel } from "../types";
import "../file-associations-manager.css";

export interface ContestedRowProps {
  row: ContestedRowModel;
  /** 写入面：`pluginId: null` = 恢复自动；`exts` = 本格成员（整格生效） */
  onPick(exts: readonly string[], pluginId: string | null, label?: string): void;
  /** 行齿轮菜单项（命令 id 归消费方）；空/缺省 ⇒ 不出齿轮 */
  gearItems?: readonly MenuItemDescriptor[];
}

/** 菜单注册键（ContextMenu 的标识，非命令 id） */
const MENU_ID = "famgrContestedRowGear";

export default function ContestedRow({ row, onPick, gearItems = [] }: ContestedRowProps) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  // 候选显示名＝**插件声明的原文**（模型只给原文）⇒ 渲染前过 `t()`；「自动」那一项是本件拼的 i18n 标签。
  // 🔴 下拉项与 `onPick` 的 label **同一份**（消费方拿 label 拼回执文案），见 CardRow 同款注释。
  const options = [{ value: "", label: t("自动") }, ...row.handlers.map((h) => ({ ...h, label: t(h.label) }))];

  // 行标签：最多 3 类直列，超出走「等 N 类」（`.ts / .tsx / .js 等 6 类`）
  const label = extLabelHead(row.exts);
  const more = row.exts.length > EXT_LABEL_MAX ? t(" 等 {{count}} 类", { count: row.exts.length }) : "";
  const sourceWord =
    row.source === "user" ? t("（用户指定）") : row.source === "partial" ? t("（含用户指定）") : t("（自动）");
  // 「拆格提示」：本格是签名组的一部分时才说（单类被单独设置 ⇒ 按生效值分出新格）
  // 🔴 「整格」那支的前导空格**落在模板里、不在 `t()` 字面量里**（渲染逐字节不变：` · 下拉＝整格生效`）。
  //    原因＝`audit-i18n` 对源码字面量先 `.trim()` 再比词典键：字面量带前导空格 ⇒ 永远匹配不上
  //    那条键（带 `{{ }}` 的键会被 isSub 规则顺手兜住，「整格」这句没有插值，兜不住）⇒ 空格留在
  //    键里＝永红。翻译侧照**无空格**形态入库即可对上。
  const splitHint =
    row.exts.length < row.groupExtsCount
      ? t(" · 整组 {{total}} 类中 {{count}} 类单独设置", { total: row.groupExtsCount, count: row.exts.length })
      : ` ${t("· 下拉＝整格生效")}`;

  const openGear = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setAnchor({ x: rect.left, y: rect.bottom + 4 });
  };

  return (
    <div className="ldk-famgr-contested">
      <div className="ldk-famgr-info">
        <span className="ldk-famgr-label">
          {label}
          {more}
        </span>
        <span className="ldk-famgr-desc">
          {/* 显示名走 <b>：描述里生效者是加粗的（一眼看到「现在是谁」） */}
          {t("当前单击打开：")}
          <b>{t(row.effectiveName)}</b>
          {sourceWord}
          {t(" · 候选 {{count}} 个", { count: row.handlerCount })}
          {splitHint}
        </span>
      </div>
      <div className="ldk-famgr-control">
        <Badge>{t("{{count}} 个候选", { count: row.handlerCount })}</Badge>
        <SelectBox
          className="ldk-famgr-select"
          value={row.value}
          options={options}
          title={t("{{types}} 的默认打开方式", { types: label })}
          onChange={(v) => {
            const picked = options.find((o) => o.value === v);
            // 同 `CardRow`：「自动」项报 `undefined`（恢复自动只报 `null`）
            onPick(row.exts, v || null, v ? picked?.label : undefined);
          }}
        />
        {gearItems.length > 0 && (
          <button type="button" className="ldk-famgr-gear" aria-label={t("更多操作")} onClick={openGear}>
            <span className="codicon codicon-gear" aria-hidden="true" />
          </button>
        )}
      </div>
      {anchor && gearItems.length > 0 && (
        <ContextMenu
          menuId={MENU_ID}
          anchor={anchor}
          items={[...gearItems]}
          onClose={() => setAnchor(null)}
          variant="non-modal"
        />
      )}
    </div>
  );
}
