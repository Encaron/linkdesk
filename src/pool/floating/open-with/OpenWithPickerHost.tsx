/**
 * OpenWithPickerHost——池侧「打开方式」**哑渲染宿主**（共享件 `OpenWithPicker` 的唯一挂载点）。
 *
 * 为什么宿主在池、不在 App 根（案 01 C1.2 的「先探一步」结论——⛔ 不是偷懒，是架构事实）：
 *   壳文档（`index.html` → `src/main.tsx` → `App.tsx`）只渲染一个**空的** `ldk-app-shell` div，
 *   全部可见 UI 都在池文档（`pool.html` → `PoolZoneShell`，含 `#ld-float-layer` / `#ld-scrim-plane`
 *   / `#quick-pick-root`）。面板要看得见 ⇒ 必须挂在池里，`#open-with-root` 与 `#quick-pick-root` 同款。
 *   第二条（机械）理由：共享件目录 `src/components/shared/**` **必须零壳依赖**（门禁腿 R6：
 *   ⛔ `window.linkdesk`、⛔ `@/core`）——本宿主用 `window.linkdesk.events`，故⛔ 不能住共享目录。
 *
 * 数据流（聪慧→哑，照 QuickPick / Dialog 先例）：
 *   壳 `OpenWithService` 装配 DTO → `events.emit("openWith:show")` → 主进程广播 → 本宿主原样渲染
 *   → 用户动作原样回传 `events.emit("openWith:action")` → 壳侧执行（开标签 / 写覆盖表 / 去市场 / 关）。
 *   本文件**零数据知识**：⛔ 不 import `@src/core` 运行时模块、⛔ 不查 registry、⛔ 不取插件表。
 *
 * 单实例语义（案 01 §八 风险表）：**后到者替换**——新 DTO 直接覆盖旧 DTO，⛔ 不叠加、⛔ 不排队
 * （对应「面板被两处同时打开」的场景：编辑器入口与右键入口都以最后一次请求为准）。
 */
import { useEffect, useState } from "react";
import type { OpenWithHandler, OpenWithRequest } from "@linkdesk/contracts";
import OpenWithPicker from "../../../components/shared/open-with-picker/OpenWithPicker";
import type { OpenWithPickerProps } from "../../../components/shared/open-with-picker/types";

/** 壳→池 DTO——与 `src/core/services/ui/OpenWithService.ts` 的 `OpenWithPanelDTO` 同形。
 *  ⛔ 不跨文档 import 那个类型（池不拉 `@/core` 运行时图）；此处按 wire 契约手抄形状，改名同笔改两边。 */
interface OpenWithPanelDTO {
  open: boolean;
  request?: OpenWithRequest;
  handlers?: OpenWithHandler[];
}

/** 池→壳动作回执——与 `OpenWithService` 的 `OpenWithAction` 同形（同上，wire 契约） */
type OpenWithAction =
  | { type: "openOnce"; pluginId: string }
  | { type: "setDefault"; pluginId: string | null }
  | { type: "searchMarket" }
  | { type: "close" };

export default function OpenWithPickerHost() {
  const [dto, setDto] = useState<OpenWithPanelDTO | null>(null);

  // E5.8#133.3 同款：订阅即回放（preload 侧缓存最近载荷）——池晚挂载也不丢首帧请求
  useEffect(() => {
    const events = window.linkdesk?.events;
    if (!events?.on) return;
    return events.on<OpenWithPanelDTO>("openWith:show", (payload) => {
      setDto(payload ?? null);
    });
  }, []);

  if (!dto?.open || !dto.request) return null;

  const send = (action: OpenWithAction): void => {
    try {
      window.linkdesk?.events?.emit("openWith:action", action);
    } catch {
      /* 池未就绪/纯前端预览——静默（与其它池 emit 同律） */
    }
  };

  const props: OpenWithPickerProps = {
    request: dto.request,
    handlers: dto.handlers ?? [],
    onOpenOnce: (pluginId) => send({ type: "openOnce", pluginId }),
    onSetDefault: (pluginId) => send({ type: "setDefault", pluginId }),
    onSearchMarket: () => send({ type: "searchMarket" }),
    onClose: () => send({ type: "close" }),
  };
  return <OpenWithPicker {...props} />;
}
