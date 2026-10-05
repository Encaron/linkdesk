/**
 * PluginCard——「按插件浏览」插件卡（共享件；`@linkdesk/ui` 单实例供给，硬约束 16）。
 *
 * 权威蓝图＝案档 [03 组件规格](../../../../docs/04-软件更新/已落地/文件打开方式与贡献点/03-组件规格-按插件浏览-插件卡.md)
 * （契约/落点/发版链）＋ mockups/09（像素）。本件**只做「卡」**：
 * ⛔ 行清单（扩展名行的状态枚举与动作）不进共享包——那是「文件关联」专属词汇，由设置插件本地组装（03 §1）。
 *
 * 纯 props in / events out（照 SettingRow 模式）：**零数据知识**——
 * 喂卡的调用方用两条已立案的面自己派生（`plugins.listAll()` ＋ `fileAssociation` 读写面，03 §6），
 * 本件不 import 任何壳 core、不查 registry（E6#54b 解耦口径）。
 *
 * 嵌套按钮禁令的正解（03 §3）：卡头是 `div`，内含①铺满整头的真 `<button>`（展开/收起）
 * ②绝对定位叠在其上的齿轮**兄弟**节点（真 `<button>`，z 高一层）——⛔ 不是 button 套 button；
 * 齿轮点击天然不冒泡到展开钮（两者非父子）。
 */
import { useCallback, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { MenuItemDescriptor } from "@linkdesk/contracts";
import { PluginIcon } from "../plugin-icon/PluginIcon";
import type { ManifestIconShape } from "../plugin-icon/iconUtils";
import Badge from "../badge/Badge";
import ContextMenu from "../context-menu/ContextMenu";
import { HINT_ATTR, HINT_DELAY_ATTR } from "../hint-tip/hintAttrs";
import "./plugin-card.css";

/** 齿轮菜单槽标识——菜单项由调用方经 `gearItems` 注入（`ContextMenu` 的 items 注入面），此 id 只作渲染器标识 */
const PLUGIN_CARD_GEAR_MENU = "pluginCardGear";

interface PluginCardProps {
  /** 插件身份＋副文本第二行（title 过长 / 重名时 id 是唯一稳定识别物）。 */
  pluginId: string;
  /** 透传 `PluginIcon`——图标唯一裁决源；缺省 ⇒ `PluginIcon` 自兜底（E6#54b 纯 props）。 */
  manifest?: ManifestIconShape;
  /** 显示名。**调用方 `t()` 后传入**（共享件零中文，SourceBadge 先例）。 */
  title: string;
  /** 版本号——副文本显示为「id · v1.2.0」；缺省只显 id。 */
  version?: string;
  /** 常驻摘要（折叠/展开都在），如「声明 45 类 · 竞争 12 类」——管理器组装。 */
  summary?: ReactNode;
  /** 展开态（**受控**：开合策略＝管理器策略——搜索命中自动展开、批量开合都要求外部持有）。 */
  expanded: boolean;
  onToggle(next: boolean): void;
  /** 卡头齿轮菜单项（形状＝共享 `ContextMenu` 既有契约）；缺省或空数组 ⇒ ⛔ 不渲染齿轮。 */
  gearItems?: MenuItemDescriptor[];
  /** 插件停用：卡体降不透明度＋「已停用」徽标。行与动作的惰性由管理器组装的 children 承担（03 §1）。 */
  disabled?: boolean;
  /** 展开体（行清单）——管理器自组。 */
  children: ReactNode;
}

function PluginCard({
  pluginId,
  manifest,
  title,
  version,
  summary,
  expanded,
  onToggle,
  gearItems,
  disabled,
  children,
}: PluginCardProps) {
  const { t } = useTranslation();
  const bodyId = useId();
  const gearRef = useRef<HTMLButtonElement>(null);
  const [gearAnchor, setGearAnchor] = useState<{ x: number; y: number } | null>(null);

  // 副文本「id · v1.2.0」——超长省略，全文走 data-hint（揭示类 ⇒ 延时归零，badge 同款）；
  // ⛔ 不出原生 title=（check-native-title 腿 1 判新增即红）。
  const subText = version ? `${pluginId} · v${version}` : pluginId;

  const handleToggle = useCallback(() => {
    onToggle(!expanded);
  }, [onToggle, expanded]);

  // 齿轮锚 = 齿轮矩形下方 +4px（与 SettingRow 行齿轮同款，03 §3）
  const handleGearClick = useCallback(() => {
    const rect = gearRef.current?.getBoundingClientRect();
    if (rect) setGearAnchor({ x: rect.left, y: rect.bottom + 4 });
  }, []);

  const handleGearClose = useCallback(() => setGearAnchor(null), []);

  const showGear = !!gearItems && gearItems.length > 0;
  // 悬停提示属性一律经 `hintAttrs` 单一真相源拼（⛔ 不在 JSX 里写 "data-hint" 字面量）：
  // 副文本＝揭示类（看全被省略的整串）⇒ 延时归零；齿轮＝说明类（默认延时）。
  const subHint = { [HINT_ATTR]: subText, [HINT_DELAY_ATTR]: "0" };
  const gearHint = { [HINT_ATTR]: t("更多操作") };

  return (
    <div
      className={`ldk-plugin-card${expanded ? " ldk-plugin-card--expanded" : ""}${
        disabled ? " ldk-plugin-card--disabled" : ""
      }`}
    >
      <div className="ldk-plugin-card-head">
        <button
          type="button"
          className="ldk-plugin-card-toggle"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={handleToggle}
        >
          <span className="ldk-plugin-card-icon">
            <PluginIcon
              pluginId={pluginId}
              manifest={manifest}
              className="ldk-plugin-card-icon-glyph"
            />
          </span>
          <span className="ldk-plugin-card-ident">
            <span className="ldk-plugin-card-titleline">
              <span className="ldk-plugin-card-title">{title}</span>
              {/* 停用徽标复用共享 Badge；文案走 t()（SelectBox 的 t("无匹配项") 先例），英译腿随 lang-defaults 外仓 */}
              {disabled && <Badge>{t("已停用")}</Badge>}
            </span>
            <span className="ldk-plugin-card-sub" {...subHint}>
              {subText}
            </span>
          </span>
          {summary != null && <span className="ldk-plugin-card-summary">{summary}</span>}
          <span
            className={`codicon codicon-chevron-right ldk-plugin-card-chevron${
              expanded ? " ldk-plugin-card-chevron--open" : ""
            }`}
            aria-hidden="true"
          />
        </button>
        {showGear && (
          <button
            ref={gearRef}
            type="button"
            className="ldk-plugin-card-gear"
            {...gearHint}
            aria-label={t("更多操作")}
            onClick={handleGearClick}
          >
            <span className="codicon codicon-gear ldk-plugin-card-gear-icon" aria-hidden="true" />
          </button>
        )}
      </div>
      {expanded && (
        <div className="ldk-plugin-card-body" id={bodyId}>
          {children}
        </div>
      )}
      {/* 齿轮菜单：非模态锚定变体（E5.8#92——不吞首击）；锚与开合照 SettingRow 行齿轮 */}
      {showGear && gearAnchor && (
        <ContextMenu
          menuId={PLUGIN_CARD_GEAR_MENU}
          anchor={gearAnchor}
          context={{ pluginId }}
          items={gearItems}
          onClose={handleGearClose}
          variant="non-modal"
        />
      )}
    </div>
  );
}

export default PluginCard;
