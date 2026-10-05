/**
 * OpenWithPicker——「打开方式…」选择器面板（**共享件**，`@linkdesk/ui` 单实例供给）。
 *
 * 户口 = 共享件（案 10/01 §三「转正」）。权威蓝图 = 案档 `10-纠正案-共享件转正与归一/`
 * `01-住错层纠正-选择器转正与壳级打开面.md`（契约/落点）＋ `03-面板口径-居中与遮罩.md`（居中/遮罩）
 * ＋ 本纠正案 `08-设计图-打开方式面板-收归壳后.html`（容器规则）。像素权威 = `mockups/05`
 * （行布局 / 双动作按钮 / 当前默认徽标 / 空态——⛔ 只迁移不重画，案 00 §五 铁律 5 / D12）。
 *
 * 本件**纯 props in / events out**（照 `PluginCard` 模式）：零 `@/core` import、零 `window.linkdesk`、
 * ⛔ 不查 registry / ⛔ 不取插件表 / ⛔ 不解析 uri——数据由壳命令 `SHELL_COMMANDS.openWith` 组装后喂入。
 * 消费方 = 池侧 Host（`src/pool/floating/open-with/OpenWithPickerHost.tsx`，壳文档无可见 DOM ⇒ 面板必须在池里渲染）
 * ＋ 将来的设置页内嵌（喂 props 即可，不用再搬一次）。
 *
 * 🔴 **一律居中 + 遮罩**（案 03 §3.0′——2026-10-05 用户改判，锚定态废止）：
 *   面板恒为居中模态——`inset:0; margin:auto` 定位，遮罩 = 壳既有模态遮罩（`--scrim-dialog` 经
 *   `#ld-scrim-plane`，⛔ 不另写 rgba、⛔ 不加磨砂）。理由（用户口径）：视觉聚焦 / 形态统一 /
 *   不与周围元素打架 / 不显凌乱。`request.anchor` **被忽略**（契约字段保留以兼容已发布面，
 *   见 `OpenWithRequest.anchor` 的 `@deprecated`）——形态只此一种，⛔ 不再按入口分叉。
 */
import { useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import Badge from "../badge/Badge";
import { PluginIcon } from "../plugin-icon/PluginIcon";
import OverlayPortal, { getScrimTarget } from "../overlay-portal/OverlayPortal";
import type { OpenWithPickerProps } from "./types";
import "./open-with-picker.css";

/* ── 层级（包内携带——`@linkdesk/ui` 包不能 import 壳 `src/constants.ts`）──
 * 面板自身 = 4000（与壳 `Z_INDEX.quickPick` 同值；两道「命令式弹层」互不叠加，共用一层无碍），
 * 遮罩 = 面板 - 1。两边互指注释（见 `src/constants.ts` Z_INDEX 表）——单层数值漂移风险可控，
 * 与 `ContextMenu.tsx` 的 `CONTEXT_MENU_Z_INDEX` 同款先例。
 * 🔴 必须 > 遮罩：OverlayPortal 包装盒的 z 就是面板层，小于遮罩层则面板被自己的遮罩盖住 =「点一下自己退」。 */
const OPEN_WITH_Z_INDEX = 4000;

function OpenWithPicker({
  request,
  handlers,
  onOpenOnce,
  onSetDefault,
  onSearchMarket,
  onClose,
}: OpenWithPickerProps) {
  const { t } = useTranslation();

  /** 当前默认行——仅当**显式**覆盖时可见（`isDefault && !isAuto`，两个字段都由壳侧装配产出） */
  const hasExplicitDefault = handlers.some((h) => h.isDefault && !h.isAuto);
  const currentName = handlers.find((h) => h.isDefault)?.title ?? "—";

  /** 头部副标题：类型名只准出现在**非命名位**（C1.8）——取当前默认行的声明名，退第一行 */
  const headType = (handlers.find((h) => h.isDefault) ?? handlers[0])?.typeLabel;

  /** 类型名后缀（无类型名 ⇒ 空串；⛔ 不占命名位） */
  const typeSuffix = headType ? ` · ${headType}` : "";

  /** 文件行文案：`name（.ext）`；只有类型（设置页入口）⇒ 只剩 `.ext` */
  const extLabel = request.ext ? `.${request.ext}` : "";
  const fileLabel =
    request.name && extLabel ? `${request.name}（${extLabel}）` : request.name || extLabel;

  /** 「打开（仅此一次）」要有文件可开——按类型入口（设置页）没 uri，⛔ 不留死钮（E17/E39 同律） */
  const canOpenHere = !!request.uri;

  const setDefault = useCallback((pluginId: string | null) => onSetDefault(pluginId), [onSetDefault]);

  return (
    <>
      {/* 模态遮罩——portal 进 `#ld-scrim-plane`（浮层权威遮罩平面，QuickPick/Dialog 同款）。
          一律着色（`--scrim-dialog`）：面板居中后由它提供视觉聚焦，并承担「点外面关掉」。 */}
      {createPortal(
        <div
          className="ldk-openwith-scrim"
          style={{ zIndex: OPEN_WITH_Z_INDEX - 1 }}
          onClick={onClose}
          aria-hidden="true"
        />,
        getScrimTarget(),
      )}

      <OverlayPortal
        onClose={onClose}
        trapFocus
        zIndex={String(OPEN_WITH_Z_INDEX)}
        rootId="open-with-root"
      >
        <div className="ldk-openwith" role="dialog" aria-modal={true} aria-label={t("打开方式")}>
          <div className="ldk-openwith-head">
            <div>
              <div className="ldk-openwith-title">
                {t("打开方式")}
                {typeSuffix}
              </div>
              <div className="ldk-openwith-file">{fileLabel}</div>
            </div>
            <button
              type="button"
              className="ldk-openwith-x"
              onClick={onClose}
              aria-label={t("关闭")}
            >
              ✕
            </button>
          </div>

          {hasExplicitDefault && (
            <div className="ldk-openwith-cur">
              <span className="ldk-openwith-curtext">
                {t("当前默认：{{name}}（来自你的设置）", { name: currentName })}
              </span>
              <button type="button" className="ldk-openwith-auto" onClick={() => setDefault(null)}>
                {t("恢复自动")}
              </button>
            </div>
          )}

          <div className="ldk-openwith-list">
            {handlers.length === 0 ? (
              <div className="ldk-openwith-empty">
                {t("没有任何已装插件声明 .{{ext}}", { ext: request.ext })}
                <div>
                  <button type="button" className="ldk-openwith-market" onClick={onSearchMarket}>
                    {t("在市场搜索阅读器")}
                  </button>
                </div>
              </div>
            ) : (
              handlers.map((h) => (
                <div className="ldk-openwith-row" key={h.pluginId}>
                  <PluginIcon
                    pluginId={h.pluginId}
                    manifest={h.manifest}
                    className="ldk-openwith-ic"
                  />
                  <div className="ldk-openwith-names">
                    {/* 主行 = `title`（**处理器/插件名**，壳侧取 manifest.name）；⛔ 不是类型名（C1.8） */}
                    <div className="ldk-openwith-nm">
                      {h.title}
                      {h.isDefault && (
                        <Badge title={h.isAuto ? undefined : t("用户指定")}>
                          {h.isAuto ? t("自动默认") : t("默认")}
                        </Badge>
                      )}
                    </div>
                    <div className="ldk-openwith-pid">{h.pluginId}</div>
                  </div>
                  <div className="ldk-openwith-acts">
                    {canOpenHere && (
                      <button
                        type="button"
                        className="ldk-openwith-act"
                        onClick={() => onOpenOnce(h.pluginId)}
                      >
                        {t("打开（仅此一次）")}
                      </button>
                    )}
                    <button
                      type="button"
                      className={`ldk-openwith-act${
                        h.isDefault && !h.isAuto ? " ldk-openwith-def" : ""
                      }`}
                      onClick={() => setDefault(h.pluginId)}
                    >
                      {t("设为默认")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </OverlayPortal>
    </>
  );
}

export default OpenWithPicker;
