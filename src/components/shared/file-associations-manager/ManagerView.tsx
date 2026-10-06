/**
 * file-associations-manager/ManagerView——「默认打开方式」管理器的**默认皮组装视图**（共享层）。
 *
 * 输入 = 共享聚合出的 `ManagerModel`（⛔ 本件**不自己推导**六态/聚格/失效判定——那是
 * `deriveModel.ts` 一处实现的事），输出 = 两区：
 *
 * | 区 | 装什么 |
 * |:--|:--|
 * | 「多候选类型」 | `ContestedRow`（一个聚合格一行，下拉整格生效） |
 * | 「按插件浏览」 | 共享件 `PluginCard`（卡壳）＋ 共享件 `CardRow`（卡体行） |
 *
 * ## 两处「不做什么」
 *
 * - 🔴 **不认识任何命令 id**：行齿轮与卡齿轮的菜单项全部由消费方经 `*GearItems` 工厂注入
 *   （命令 id 是插件/宿主自己的资产）。不传 ⇒ 不出齿轮。
 * - ⛔ **不自造长尾列表**：只出「需要你选择的」与「按插件浏览」两区，上百个扩展名靠搜索
 *   （复用宿主既有搜索框）＋展开摊开，永不平铺全量。
 *
 * ## 降级承诺（第三方渲染方两路任选）
 *
 * ① 整套用它（默认皮，即官方设置插件现状）；② 只拿共享聚合的模型自己画（数据面全是既有契约面，
 * 自己也能拉）——两路都零重推导。
 *
 * 底部 OS 登记块**不在这里**：C3c 形态改判把它改成设置页的**通用布尔行**（`prop.group` 子节），
 * 与「跟随插件登记」开关同处一子节——它不再是管理器的私有折叠块。
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MenuItemDescriptor } from "@linkdesk/contracts";
import PluginCard from "../plugin-card/PluginCard";
import CardRow from "./pieces/CardRow";
import ContestedRow from "./pieces/ContestedRow";
import type { CardModel, ContestedRowModel, ExtRowModel, ManagerModel } from "./types";
import "./file-associations-manager.css";

export interface ManagerViewProps {
  /** 共享聚合出的模型（`buildManagerModel`） */
  model: ManagerModel;
  /** 宿主搜索框的词（**复用既有检索**，⛔ 不另造第二把）；缺省 = 不过滤 */
  search?: string;
  loading?: boolean;
  /** 数据是否就绪——未就绪且加载中/出错 ⇒ 只出一行说明（页面本就残缺） */
  ready?: boolean;
  error?: string | null;
  /** 写入面（消费方提供）：`pluginId: null` = 恢复自动；`exts` = 受影响的类型 */
  onPick(exts: readonly string[], pluginId: string | null, label?: string): void;
  /** 竞争行齿轮菜单项（命令 id 归消费方）；缺省或回空数组 ⇒ 该行不出齿轮 */
  contestedGearItems?(row: ContestedRowModel): readonly MenuItemDescriptor[];
  /** 卡头齿轮菜单项 */
  cardGearItems?(card: CardModel): readonly MenuItemDescriptor[];
  /** 卡体行齿轮菜单项（C4：卡体行也有行尾齿轮） */
  cardRowGearItems?(row: ExtRowModel): readonly MenuItemDescriptor[];
}

export default function ManagerView({
  model,
  search = "",
  loading = false,
  ready = true,
  error = null,
  onPick,
  contestedGearItems,
  cardGearItems,
  cardRowGearItems,
}: ManagerViewProps) {
  const { t } = useTranslation();
  const q = search.trim();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // 搜索联动：命中（本卡在当前搜索结果里）⇒ 自动展开。清空搜索**不收回**（展开态是受控的、
  // 策略归本视图——用户自己收；出处＝母案 卡交互 C6＝E38）。
  const matchedIds = model.cards.map((c) => c.pluginId).join("|");
  useEffect(() => {
    if (!q) return;
    setExpanded((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const c of model.cards) {
        if (!next[c.pluginId]) {
          next[c.pluginId] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [q, matchedIds, model.cards]);

  const toggleCard = useCallback((pluginId: string, next: boolean) => {
    setExpanded((prev) => ({ ...prev, [pluginId]: next }));
  }, []);

  if (error && !ready) {
    return (
      <div className="ldk-famgr">
        <div className="ldk-famgr-empty">{t("加载默认打开方式失败：{{msg}}", { msg: error })}</div>
      </div>
    );
  }
  if (loading && !ready) {
    return (
      <div className="ldk-famgr">
        <div className="ldk-famgr-empty">{t("加载中…")}</div>
      </div>
    );
  }

  // 搜索无匹配 —— 独立一句（第三处空态）：两区都空且是搜索造成的，说「没有匹配」而不是分别对
  // 用户说「没有竞争类型」「没有声明插件」（那两句在搜索态下是误导：明明有，只是没匹配上）
  if (q && model.contested.length === 0 && model.cards.length === 0) {
    return (
      <div className="ldk-famgr">
        <div className="ldk-famgr-empty">{t("没有匹配的类型或插件")}</div>
      </div>
    );
  }

  return (
    <div className="ldk-famgr">
      <div className="ldk-famgr-subsection">
        <h3 className="ldk-famgr-subsection-title">{t("多候选类型")}</h3>
        {model.contested.length === 0 ? (
          <div className="ldk-famgr-empty">{t("（当前没有多候选的类型）")}</div>
        ) : (
          model.contested.map((row) => (
            <ContestedRow
              key={row.exts.join("|")}
              row={row}
              onPick={onPick}
              {...(contestedGearItems ? { gearItems: contestedGearItems(row) } : {})}
            />
          ))
        )}
      </div>

      <div className="ldk-famgr-subsection">
        <h3 className="ldk-famgr-subsection-title">{t("按插件浏览")}</h3>
        {model.cards.length === 0 ? (
          <div className="ldk-famgr-empty">{t("（没有声明了文件类型的插件）")}</div>
        ) : (
          model.cards.map((card) => (
            <AssocCard
              key={card.pluginId}
              card={card}
              expanded={!!expanded[card.pluginId]}
              onToggle={toggleCard}
              onPick={onPick}
              {...(cardGearItems ? { gearItems: cardGearItems(card) } : {})}
              {...(cardRowGearItems ? { rowGearItems: cardRowGearItems } : {})}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ── 「按插件浏览」一张卡：卡壳走共享件 `PluginCard`，卡体行清单在此组装 ── */

function AssocCard({
  card,
  expanded,
  onToggle,
  onPick,
  gearItems,
  rowGearItems,
}: {
  card: CardModel;
  expanded: boolean;
  onToggle(pluginId: string, next: boolean): void;
  onPick(exts: readonly string[], pluginId: string | null, label?: string): void;
  gearItems?: readonly MenuItemDescriptor[];
  rowGearItems?(row: ExtRowModel): readonly MenuItemDescriptor[];
}) {
  const { t } = useTranslation();

  return (
    <PluginCard
      pluginId={card.pluginId}
      {...(card.manifest ? { manifest: card.manifest } : {})}
      title={t(card.name)}
      {...(card.version ? { version: card.version } : {})}
      summary={
        // 三数、「数字加粗」（那是扫一眼就够的信息，别让它在小字里淹掉）；⛔ 不受卡内过滤影响
        <>
          {t("声明")} <b>{card.declaredCount}</b> · {t("竞争")} <b>{card.contestedCount}</b> ·{" "}
          {t("默认持有")} <b>{card.holdCount}</b>
        </>
      }
      expanded={expanded}
      onToggle={(next) => onToggle(card.pluginId, next)}
      {...(gearItems ? { gearItems: [...gearItems] } : {})}
    >
      {card.rows.length === 0 ? (
        // 过滤 0 命中：一行 muted 文案（⛔ 不带清空入口——清空靠删字或 Esc）
        <div className="ldk-famgr-empty">{t("没有匹配的类型")}</div>
      ) : (
        card.rows.map((row) => (
          <CardRow
            key={row.ext}
            row={row}
            onPick={onPick}
            {...(rowGearItems ? { gearItems: rowGearItems(row) } : {})}
          />
        ))
      )}
    </PluginCard>
  );
}
