/**
 * OpenWithPicker——「打开方式…」选择器面板（**共享件**，`@linkdesk/ui` 单实例供给）。
 *
 * 户口 = 共享件（案 10/01 §三「转正」）。权威蓝图 = 案档 `10-纠正案-共享件转正与归一/`
 * `01-住错层纠正-选择器转正与壳级打开面.md`（契约/落点）＋ `03-面板口径-居中与遮罩.md`（居中/遮罩/锚定）
 * ＋ 本纠正案 `08-设计图-打开方式面板-收归壳后.html`（两态容器规则）。像素权威 = `mockups/05`
 * （行布局 / 双动作按钮 / 当前默认徽标 / 空态——⛔ 只迁移不重画，案 00 §五 铁律 5 / D12）。
 *
 * 本件**纯 props in / events out**（照 `PluginCard` 模式）：零 `@/core` import、零 `window.linkdesk`、
 * ⛔ 不查 registry / ⛔ 不取插件表 / ⛔ 不解析 uri——数据由壳命令 `SHELL_COMMANDS.openWith` 组装后喂入。
 * 消费方 = 池侧 Host（`src/pool/floating/open-with/OpenWithPickerHost.tsx`，壳文档无可见 DOM ⇒ 面板必须在池里渲染）
 * ＋ 将来的设置页内嵌（喂 props 即可，不用再搬一次）。
 *
 * 🔴 两态（案 03 §二/§三.0）：
 *   · 有 `request.anchor`（文件树右键）⇒ **锚定**：就近弹出、`top ≥ 30`（硬约束 18 拖拽区）、
 *     **无遮罩**（透明点击层——「点外面关掉」但不压暗，否则连续右键会闪）；
 *   · 无锚点（编辑器 / 设置页入口）⇒ **居中** + 遮罩 = 壳既有模态遮罩（`--scrim-dialog` 经
 *     `#ld-scrim-plane`，⛔ 不另写 rgba、⛔ 不加磨砂）。
 */
import { useCallback, useMemo } from "react";
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

/* ── 锚定钳制常量（照旧实现，⛔ 数值只搬不改）── */
const PANEL_W = 432; // 与 CSS `.ldk-openwith { width }` 同值
const ANCHOR_GUTTER = 28; // 右侧留白（旧式 460 = 432 + 28 的等价写法）
const TOP_SAFE = 30; // 硬约束 18：标题栏拖拽区，锚定态 top 不得侵入
const MIN_BELOW = 320; // 锚点下方至少留出的面板可视高（超出则上钳）

function OpenWithPicker({
  request,
  handlers,
  onOpenOnce,
  onSetDefault,
  onSearchMarket,
  onClose,
}: OpenWithPickerProps) {
  const { t } = useTranslation();
  const anchored = !!request.anchor;

  /** 锚定态定位——就近弹出 + 视口边缘钳制（居中态无内联定位，由 CSS `--centered` 承担） */
  const pos = useMemo(() => {
    const a = request.anchor;
    if (!a) return undefined;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(a.x, vw - PANEL_W - ANCHOR_GUTTER));
    const top = Math.max(TOP_SAFE, Math.min(a.y, vh - MIN_BELOW));
    return { left, top };
  }, [request.anchor]);

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
      {/* 遮罩/点击层——两类都 portal 进 `#ld-scrim-plane`（浮层权威遮罩平面，QuickPick/Dialog 同款）。
          居中态着色（`--scrim-dialog`）；锚定态透明（只吞第一击 ⇒ 点外面关，且不闪）。 */}
      {createPortal(
        <div
          className={`ldk-openwith-scrim${anchored ? " ldk-openwith-scrim--clear" : ""}`}
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
        <div
          className={`ldk-openwith${anchored ? "" : " ldk-openwith--centered"}`}
          style={pos}
          role="dialog"
          aria-modal={anchored ? undefined : true}
          aria-label={t("打开方式")}
        >
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
