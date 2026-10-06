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
 *
 * ## C5 卡内工具条（本件＝**组装方**，策略住这里）
 *
 * | 事 | 归谁 |
 * |:--|:--|
 * | 槽壳 `.ldk-plugin-card-toolbar`（卡头与卡体之间一行） | 共享件 `PluginCard`（**零业务语义**，E20） |
 * | 过滤框 / 排序件 | **既有**共享件 `InlineInput`（`size="normal"`）／`SelectBox`——⛔ 不再造控件 |
 * | 行序与过滤的**口径** | 聚合层纯函数 `orderRows` ／ `filterRows`（一处实现，E7） |
 * | 阈值（声明 ≥`FILTER_MIN` 类才摆）／折叠复位／防抖毫秒 | **本件**（组装方策略，⛔ 不进 `PluginCard`） |
 *
 * 🔴 三处「视图本地、不持久化」（E10）：过滤词与行序都只活在本视图 state 里，⛔ 不写覆盖表、
 * ⛔ 不进配置面——它们是「这一次怎么看」，不是「你要什么」。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MenuItemDescriptor } from "@linkdesk/contracts";
import PluginCard from "../plugin-card/PluginCard";
import SelectBox from "../select-box/SelectBox";
import { InlineInput } from "../inline-input/InlineInput";
import { useDebouncedInput } from "../hooks/useDebouncedInput";
import CardRow from "./pieces/CardRow";
import ContestedRow from "./pieces/ContestedRow";
import { filterRows, hitKindOf, orderRows } from "./deriveModel";
import type { CardModel, ContestedRowModel, ExtRowModel, ManagerModel, RowSortMode } from "./types";
import "./file-associations-manager.css";

/**
 * 工具条阈值（E1）——声明**少于 8 类**的卡不摆工具条（3 类的卡摆过滤框＝纯噪音）。
 *
 * 🔴 这是**组装方策略常量**：⛔ 不进 `PluginCard`（它不认识过滤/排序/阈值，E20）、
 * ⛔ 也不做成 prop 或配置项（E10：视图本地＝不持久化、不入配置面）。
 */
const FILTER_MIN = 8;

/** 过滤防抖（E11）——窗口内切卡/折叠，过期值不得写回（hook 卸载即清定时器） */
const FILTER_DEBOUNCE_MS = 150;

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
  // C5 卡内工具条的两件**视图本地态**（E10：⛔ 不持久化）——键＝pluginId；
  // `rowFilter` 存的是**已生效**（防抖后）的词（即时值住 CardToolbar 里的 hook，见下）
  const [rowFilter, setRowFilter] = useState<Record<string, string>>({});
  const [rowSort, setRowSort] = useState<Record<string, RowSortMode>>({});

  const setCardFilter = useCallback((pluginId: string, next: string) => {
    setRowFilter((prev) => (prev[pluginId] === next ? prev : { ...prev, [pluginId]: next }));
  }, []);

  const setCardSort = useCallback((pluginId: string, next: RowSortMode) => {
    setRowSort((prev) => (prev[pluginId] === next ? prev : { ...prev, [pluginId]: next }));
  }, []);

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

  // 折叠＝卡内视图态**整条复位**（E9）：过滤清空（再展开为全量）＋ 行序回落默认「按字母序」。
  // 🔴 图上的折叠处理只清过滤词；E9 的口径多一条「排序回落默认」——按 E9 办（更严，且不违反图）。
  const toggleCard = useCallback((pluginId: string, next: boolean) => {
    setExpanded((prev) => ({ ...prev, [pluginId]: next }));
    if (next) return;
    setRowFilter((prev) => (prev[pluginId] ? { ...prev, [pluginId]: "" } : prev));
    setRowSort((prev) => {
      const mode = prev[pluginId];
      // 只在确实不是默认值时写回——省掉没必要的 state 换壳（键本身留懒：从没排过序就不落这个键）
      return mode && mode !== "alpha" ? { ...prev, [pluginId]: "alpha" } : prev;
    });
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
              filter={rowFilter[card.pluginId] ?? ""}
              sortMode={rowSort[card.pluginId] ?? "alpha"}
              onCardFilter={setCardFilter}
              onCardSort={setCardSort}
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
  filter,
  sortMode,
  onCardFilter,
  onCardSort,
  gearItems,
  rowGearItems,
}: {
  card: CardModel;
  expanded: boolean;
  onToggle(pluginId: string, next: boolean): void;
  onPick(exts: readonly string[], pluginId: string | null, label?: string): void;
  /** 本卡**已生效**的过滤词（防抖后；'' ＝ 不过滤） */
  filter: string;
  /** 本卡行序（视图本地） */
  sortMode: RowSortMode;
  onCardFilter(pluginId: string, next: string): void;
  onCardSort(pluginId: string, next: RowSortMode): void;
  gearItems?: readonly MenuItemDescriptor[];
  rowGearItems?(row: ExtRowModel): readonly MenuItemDescriptor[];
}) {
  const { t } = useTranslation();

  // 行序 → 过滤（顺序有要求：先排序再分档——分档只在**命中理由**上分层，不改排序语义，E7）。
  // 声明序是「按默认排序」的唯一真源：`declared` 原样透传模型序（聚合层 ⛔ 不重排）。
  const rows = filterRows(orderRows(card.rows, sortMode), filter);
  const hitQuery = filter.trim();

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
      {...(expanded && card.rows.length >= FILTER_MIN
        ? {
            toolbar: (
              <CardToolbar
                pluginId={card.pluginId}
                total={card.rows.length}
                hitCount={rows.length}
                filter={hitQuery}
                sortMode={sortMode}
                onCardFilter={onCardFilter}
                onCardSort={onCardSort}
              />
            ),
          }
        : {})}
    >
      {rows.length === 0 ? (
        // 过滤 0 命中：一行 muted 文案（⛔ 不带清空入口——清空靠删字或 Esc）
        <div className="ldk-famgr-empty">{t("没有匹配的类型")}</div>
      ) : (
        rows.map((row) => (
          <CardRow
            key={row.ext}
            row={row}
            onPick={onPick}
            {...(rowGearItems ? { gearItems: rowGearItems(row) } : {})}
            // 仅显示名命中 ⇒ 标出理由「类型名 X」（分档后这批沉底；理由不可见时单字母查询＝乱排）
            nameOnlyHit={!!hitQuery && hitKindOf(row.ext, row.typeLabel, hitQuery) === "name"}
          />
        ))
      )}
    </PluginCard>
  );
}

/* ── 一张卡的卡内工具条（C5）：图标 ＋ 过滤框 ＋ 命中数 ＋ 排序 —— 装进 `PluginCard` 的槽 ──
 * 两件控件都是**既有**共享件；本件只管排布与「谁触发什么」。
 * 🔴 住成独立子件的原因：防抖 hook（`useDebouncedInput`）**不能**在卡片循环里调用——
 * 每张卡各持一份即时值，卸载（折叠）即随 hook 一并清掉定时器（E11）。 */

function CardToolbar({
  pluginId,
  total,
  hitCount,
  filter,
  sortMode,
  onCardFilter,
  onCardSort,
}: {
  pluginId: string;
  /** 本卡声明总数（＝模型行数；⛔ 不受过滤影响） */
  total: number;
  /** 命中行数（＝ `filterRows` 出来的条数） */
  hitCount: number;
  /** 已生效的过滤词（非空才报命中数，E2） */
  filter: string;
  sortMode: RowSortMode;
  onCardFilter(pluginId: string, next: string): void;
  onCardSort(pluginId: string, next: RowSortMode): void;
}) {
  const { t } = useTranslation();
  const apply = useCallback((next: string) => onCardFilter(pluginId, next), [onCardFilter, pluginId]);
  const { value, onChange, onClear } = useDebouncedInput(apply, FILTER_DEBOUNCE_MS);

  const sortOptions = useMemo(
    () => [
      { value: "alpha", label: t("按字母序") },
      { value: "declared", label: t("按默认排序") },
    ],
    [t],
  );

  return (
    <>
      <span className="ldk-famgr-filter">
        <span className="codicon codicon-search ldk-famgr-filter-icon" aria-hidden="true" />
        <InlineInput
          size="normal"
          value={value}
          onChange={onChange}
          onConfirm={() => {}}
          onCancel={onClear}
          // 搜索框**受控**：Esc → `onClear` 把词清了，输入框必须跟着真清空（缺省一次性种子不跟随）
          syncValue
          ariaLabel={t("过滤文件类型（先扩展名、后类型名；仅类型名命中的行有标注）")}
          placeholder={t("过滤 {{count}} 类…", { count: total })}
        />
      </span>
      {/* 命中数：⛔ 不过滤不报数（E2）——`filter` 是防抖后的词，与行清单同源，数字与行数永远一致 */}
      {filter && (
        <span className="ldk-famgr-hit">
          {t("命中 {{done}} / {{total}}", { done: hitCount, total })}
        </span>
      )}
      <SelectBox
        value={sortMode}
        options={sortOptions}
        title={t("行序：按字母序 ／ 按默认排序（插件声明原始次序）")}
        onChange={(next) => onCardSort(pluginId, next === "declared" ? "declared" : "alpha")}
      />
    </>
  );
}
