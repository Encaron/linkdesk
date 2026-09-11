/**
 * AddSourcePopup——市场源弹窗（E6#86b 第 3.6.3 轮 feature-folder 拆分：自 `views/SearchView.tsx` 原样搬出，
 * 零行为变更；原为该文件内的私有组件，非 contributes.views 面）。
 *
 * 市场源弹窗（E6#30c ③——mockup「03-添加市场源」frame ③ 是设计唯一源）。
 * 市场页侧栏「市场源」按钮 = 快捷入口；数据真相源 = 设置页 marketplaceSources（同一数组——入口可多处，数据源唯一）。
 * 本弹窗只做：填作者仓库 URL → 校验（空/非 http/github 归一失败/官方重复/已在列表）→ 写回配置；
 * marketplaceShared 模块级 config watch 收到变更自动 forceRefreshCatalog（几秒内该源插件上架）。
 * 官方源 URL 恒内置不入册——本弹窗列表/去重都以「排除官方」为前提（mockup frame ①③ 语义）。
 */

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { OverlayPortal } from "@linkdesk/ui";
import { readConfiguredAuthorSources } from "../../services/marketSources";
import { decideAddSource } from "../../services/marketSourceAdd"; // E6#30c：加源决策抽纯（官方恒不入册判重见该模块头注）

const lk = () => window.linkdesk;

export default function AddSourcePopup({
  anchor,
  triggerRef,
  onClose,
}: {
  /** 触发锚——fixed 定位在「市场源」按钮下缘（OverlayPortal 进 #overlay-root，外部点击/Escape 壳统一处理） */
  anchor: { top: number; left: number };
  triggerRef: React.RefObject<HTMLElement>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** 输入即清错——mockup 帧 ③ 就近校验语义（err 红字 + input.err 红描边） */
  const clearErr = useCallback(() => {
    if (err) setErr(null);
  }, [err]);

  /** 添加——读现作者源 → 纯决策（decideAddSource，官方恒不入册/同身份判重）→ 仅 ok 落盘。
   *  写同一 marketplaceSources；watch 自动刷新，无需本组件触发拉取。settings 缺席亦照常——本弹窗即
   *  marketplace 自有写门（读/决策全走自身代码 + 通用 configuration API，替换冒烟见 marketSourceAdd.ts 头注）。 */
  const submit = useCallback(async () => {
    const decision = decideAddSource(value, await readConfiguredAuthorSources());
    if (!decision.ok) {
      setErr(
        decision.reason === "empty"
          ? t("请输入仓库 URL。")
          : decision.reason === "bad-url"
            ? t("URL 格式不对——以 http(s):// 开头。")
            : t("这个源已经在列表里了。"), // official / duplicate——官方任何形态拒加（官方恒不入册）
      );
      return;
    }
    setBusy(true);
    try {
      await lk()?.configuration?.set("marketplace.marketplaceSources", decision.next);
      onClose();
    } catch (e) {
      // E6#73h（D5）：加结论句——原文单独出现时用户不知道"哪一步失败了"（IP 层原文连中文都没有）
      setErr(t("保存市场源失败：{{detail}}", { detail: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }, [value, t, onClose]);

  return (
    <OverlayPortal onClose={onClose} triggerRef={triggerRef} trapFocus>
      <div className="ms-addsrc-pop" style={anchor} role="dialog" aria-label={t("添加市场源")}>
        <span className="ms-addsrc-pop-title">{t("添加市场源")}</span>
        <input
          className={`ms-addsrc-pop-input${err ? " err" : ""}`}
          type="url"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={t("https://github.com/用户名/仓库名")}
          onChange={(e) => {
            setValue(e.target.value);
            clearErr();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void submit();
          }}
        />
        <span className={err ? "ms-addsrc-pop-err" : "ms-addsrc-pop-hint"}>
          {err ??
            t("该仓库根目录需有 marketplace.json；添加后几秒内，该源的所有插件出现在商店。")}
        </span>
        <div className="ms-addsrc-pop-actions">
          <button className="ms-addsrc-pop-btn" onClick={onClose} disabled={busy}>
            {t("取消")}
          </button>
          <button
            className="ms-addsrc-pop-btn ms-addsrc-pop-btn--primary"
            onClick={() => void submit()}
            disabled={busy}
          >
            {t("添加")}
          </button>
        </div>
      </div>
    </OverlayPortal>
  );
}
