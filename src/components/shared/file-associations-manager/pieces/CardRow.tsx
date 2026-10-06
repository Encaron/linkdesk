/**
 * file-associations-manager/pieces/CardRow——「按插件浏览」卡体内的一行（一类扩展名）。
 *
 * 三段式（设计图 `.crow`）：`.ext` ＋ 状态徽标 ＋ 行尾下拉；C4 定案再补**行尾 hover 齿轮**
 * （与竞争行、设置行同款机制：24px／行尾／hover 现／同锚点／非模态菜单——⛔ 不做第二套手绘齿轮）。
 *
 * ## 两处纪律
 *
 * - 六态文案由**本件**给（i18n 归呈现件，模型只给枚举），且字面量必须留在 `t()` 调用点——
 *   词典门禁按 `t()` 的中文字面量收词，挪进常量表就收不到，英文界面会漏出中文。
 * - 🔴 **齿轮菜单项由消费方注入**（`gearItems`）：命令 id 是插件/宿主自己的资产，共享件不认识
 *   任何命令 id、也不认识「打开方式」是哪条命令。空/缺省 ⇒ **不出齿轮**（零覆盖 + 无命令 = 无动作可给）。
 *
 * ## 行内两处可选件（都由组装方决定）
 *
 * - `nameOnlyHit`（C5）：本行是**仅靠显示名**被过滤命中的 ⇒ 标出理由「类型名 X」——
 *   理由不可见时，单字母查询在用户眼里就是乱排。
 * - `row.dangling`（失效覆盖）：键还在、指向的插件已不在册 ⇒ 追加一枚红胶囊（惰性：重装即复活）。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MenuItemDescriptor } from "@linkdesk/contracts";
import ContextMenu from "../../context-menu/ContextMenu";
import HintTip from "../../hint-tip/HintTip";
import SelectBox from "../../select-box/SelectBox";
import type { ExtRowModel } from "../types";
import "../file-associations-manager.css";

export interface CardRowProps {
  row: ExtRowModel;
  /** 写入面：`pluginId: null` = 恢复自动 */
  onPick(exts: readonly string[], pluginId: string | null, label?: string): void;
  /** 行齿轮菜单项（命令 id 归消费方）；空/缺省 ⇒ 不出齿轮 */
  gearItems?: readonly MenuItemDescriptor[];
  /** C5：本行仅以**显示名**命中 ⇒ 行内标出理由（依赖 `row.typeLabel`） */
  nameOnlyHit?: boolean;
}

/** 菜单注册键（ContextMenu 的标识，非命令 id） */
const MENU_ID = "famgrCardRowGear";

export default function CardRow({ row, onPick, gearItems = [], nameOnlyHit = false }: CardRowProps) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  // 六态文案（模型只给枚举，文案住呈现件）
  const pill = (() => {
    switch (row.state) {
      case "lock":
        return {
          tone: "user",
          label: t("当前默认（用户锁定）"),
          hint: t("显式锁定：其他插件后续声明此类亦不漂移"),
        };
      case "override":
        return { tone: "user", label: t("当前默认（用户指定）") };
      case "auto":
        return { tone: "auto", label: t("默认（自动）") };
      case "lost":
        return { tone: "cand", label: t("候选 · 默认：{{name}}", { name: row.currentName ?? "—" }) };
      case "sole":
        return { tone: "auto", label: t("唯一处理者（自动）") };
      case "orphan":
        return {
          tone: "cand",
          label: t("无人处理 · 角色兜底（{{name}}）", { name: row.currentName ?? "—" }),
        };
    }
  })();

  const extText = <span className="ldk-famgr-ext">.{row.ext}</span>;

  const openGear = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setAnchor({ x: rect.left, y: rect.bottom + 4 });
  };

  return (
    <div className="ldk-famgr-row">
      {/* 声明原文 ≠ 归一键时才挂提示（「声明串 MX → 归一存储键 mx」）——同值时不挂，免得噪声 */}
      {row.rawDeclaration ? (
        <HintTip label={t("声明串 {{raw}} → 归一存储键 .{{ext}}", { raw: row.rawDeclaration, ext: row.ext })}>
          {extText}
        </HintTip>
      ) : (
        extText
      )}
      <span
        className={`ldk-famgr-pill ldk-famgr-pill--${pill.tone}`}
        {...("hint" in pill && pill.hint ? { "data-hint": pill.hint } : {})}
      >
        {pill.label}
      </span>
      {row.dangling && <span className="ldk-famgr-pill ldk-famgr-pill--dang">{t("失效覆盖")}</span>}
      {nameOnlyHit && row.typeLabel && (
        <span className="ldk-famgr-why">
          {t("类型名")} <b>{row.typeLabel}</b>
        </span>
      )}
      <SelectBox
        className="ldk-famgr-select"
        value={row.value}
        options={[{ value: "", label: t("自动") }, ...row.options]}
        title={t(".{{ext}} 的默认打开方式", { ext: row.ext })}
        onChange={(v) => {
          const picked = row.options.find((o) => o.value === v);
          onPick([row.ext], v || null, picked?.label);
        }}
      />
      {gearItems.length > 0 && (
        <button
          type="button"
          className="ldk-famgr-gear"
          aria-label={t(".{{ext}} 的更多操作", { ext: row.ext })}
          onClick={openGear}
        >
          <span className="codicon codicon-gear" aria-hidden="true" />
        </button>
      )}
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
