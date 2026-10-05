/**
 * E1/E2 第二竞争者提示（D7「第二只装上/挂牌不静默漂移」）——壳侧装配与文案组装。
 *
 * 链路：插件激活注册关联（主进程 FileAssociationService 检测第二竞争者）→ registry-handlers
 * 广播 `fileAssociation:secondContender` → 壳 preload 中继 → 本模块组装文案 → pushToast（唯一通知面）。
 *
 * 🔴 为什么订阅在 initAll **之后**装配（startup.ts 调用点）：启动批次里已并存的多家声明同样会触发
 * 检测——订阅晚于插件加载 ⇒ 启动期事件天然落在订阅前被丢弃，「启动不打扰、装机才提醒」。
 * 会话内一次的去重账在检测端（`(ext, pluginId)` 集合，FileAssociationService）。
 *
 * 当前默认名的解析走 IPC `listHandlersFor`（主进程有声明数据；壳内 FileAssociationService 副本
 * 运行期无注册——注册只发生在主进程 loader）。文案 key = 中文原文（壳侧串走 lang-defaults 外仓链）。
 */

import i18n from "../../../i18n";
import { getShellExposed } from "../../api/linkdesk-api/surfaces";
import { pushToast } from "../ui/toast";
import type { SecondContenderEvent } from "./FileAssociationService";

let _wired = false;

/** startup 在 initAll（插件加载完）之后调用一次；StrictMode/HMR 重挂由模块级守卫拦 */
export function initSecondContenderHint(): void {
  if (_wired) return;
  const lk = getShellExposed();
  // onSecondContender 是壳内私有扩展、不在契约 ShellExposed 的 Pick 里（同 onOpenPath）——局部形状断言取
  const fa = lk?.fileAssociation as
    | { onSecondContender?: (cb: (event: SecondContenderEvent) => void) => () => void }
    | undefined;
  const onSecondContender = fa?.onSecondContender;
  if (!onSecondContender) return; // 非壳环境（预览页/单测）——不挂
  _wired = true;
  onSecondContender((event) => {
    void announce(event);
  });
}

async function announce(event: { ext: string; pluginId: string; displayName: string }): Promise<void> {
  const lk = getShellExposed();
  // 当前默认名——解析归主进程（覆盖表感知），此处只取名：isCurrent 行即解析胜者
  let currentName = "";
  try {
    const handlers = await lk?.fileAssociation?.listHandlersFor(event.ext);
    currentName = handlers?.find((h) => h.isCurrent)?.displayName ?? "";
  } catch {
    currentName = ""; // 取名失败不拦提示——文案回退到不带当前名的短句
  }
  pushToast({
    message: currentName
      ? i18n.t(
          "检测到另一款可打开 .{{ext}} 文件的插件（{{name}}），当前默认仍为 {{current}}；可右键该类文件并选择「打开方式」更改",
          { ext: event.ext, name: event.displayName, current: currentName }
        )
      : i18n.t("检测到另一款可打开 .{{ext}} 文件的插件（{{name}}）；可右键该类文件并选择「打开方式」更改", {
          ext: event.ext,
          name: event.displayName,
        }),
    severity: "info",
  });
}
