/**
 * IpcBridgeHandler UI 浮层域——自 IpcBridgeHandler.ts 拆出（E5.8#0d.10-10e）。
 * dialog:confirm/alert channel + menu:registerItems/getItems/contextKey:set channel
 * + toast 四方法（showNotification/updateNotification/finishNotification/cancelNotification）
 * + 设置导航/外观 六方法（consumeSettingsGroup/consumeScrollToSetting/getAvailableThemes/
 * getCurrentTheme/getAvailableLanguages/getCurrentLanguage）+ 二订阅（_settingsGroupUnsub/_scrollToUnsub 属主）verbatim。
 * 依赖方向：ui → DialogService/toast/MenuRegistry/ContextKeyService/CommandRegistry/KeybindingRegistry/
 * ConfigurationRegistry/ThemeEngine/LanguageRegistry/i18n + linkdesk-api（LinkDeskAPI 订阅类型）；被聚合器委派。
 */

import { confirm, alert, confirmContent } from "../../ui/DialogService"; // E5#67 + E6#71c 富内容确认
import { pushToast, dismissToast, updateToast, TOAST_TTL_ERROR, type ToastSeverity } from "../../ui/toast";
import { registerMenuItems, getMenuItems, MENU_SLOTS, type ManifestMenuItem } from "../../../registry/commands/MenuRegistry"; // E5#69
import { ContextKeyService } from "../../../registry/commands/ContextKeyService"; // E5#70
import { getCommands, executeCommand } from "../../../registry/commands/CommandRegistry";
import { findKeybindingForCommand } from "../../../registry/commands/KeybindingRegistry";
import { resolvePanelChecked } from "../../../commands/shell/panelCommands"; // E5.8#37.7：面板位置/对齐当前项 √ 解析
import { ViewContainerService } from "../../../services/layout/ViewContainerService"; // E5.8#37.7.1：面板视图显隐清单数据源（壳布局真相，Path B 池只读）
import { getFloatingPanelViewId } from "../../../../pluginLoader/contributions/viewRegistry"; // E5.8#39.5 子项 C：标签页右键「在悬浮面板中打开」声明读取（tabIdentity 同源 core→pluginLoader）
import { getCallbacks } from "../../../commands/infra/CoreCallbacks"; // E5.8#44：tab 所在窗口判定——「并回主窗口」可见性（detached 才注入）
import { onRequestSettingsGroup, onRequestScrollToSetting, onRequestOpenKeybindings, consumeSettingsGroup, consumeScrollToSetting, consumeOpenKeybindings } from "../../../registry/ConfigurationRegistry";
import { getAvailableThemes, getCurrentTheme } from "../../ui/ThemeEngine";
import { LanguageRegistry } from "../../../registry/languages/LanguageRegistry";
import i18n from "../../../../i18n";
import type { LinkDeskAPI, MenuItemDescriptor, PluginToastAction } from "../../../api/linkdesk-api";
import type { DialogContentOpenOptions } from "../../../types/ipc/dialogs"; // E6#71c 富内容确认打开参数

let _settingsGroupUnsub: (() => void) | null = null;
let _scrollToUnsub: (() => void) | null = null;
let _openKeybindingsUnsub: (() => void) | null = null; // E5.8#41.14：打开快捷键子栏契约通道订阅

// ── 壳→设置页导航订阅──

export function subscribeUi(linkdesk: LinkDeskAPI): void {
  // E5.5#7：壳→设置页导航——齿轮"设置"跳转到指定分组
  // M1 双通道 B 的 IPC 版：壳 onRequestSettingsGroup Emitter → broadcast → 插件 WebView events.on
  _settingsGroupUnsub = onRequestSettingsGroup.event((pluginId) => {
    try { linkdesk.events?.emit("settings:requestGroup", { pluginId }); } catch { /* 静默 */ }
  });
  // E3f #53e：壳→设置页滚动到指定配置项
  _scrollToUnsub = onRequestScrollToSetting.event((key) => {
    try { linkdesk.events?.emit("settings:scrollTo", { key }); } catch { /* 静默 */ }
  });
  // E5.8#41.14 🔴 修复：壳→设置页切快捷键 tab——契约通道替代错配 window 事件死路由
  // （dispatch 是 kebab linkdesk:open-keybindings-settings，监听方却在等 camel——永不命中）
  _openKeybindingsUnsub = onRequestOpenKeybindings.event((payload) => {
    try { linkdesk.events?.emit("settings:requestOpenKeybindings", payload); } catch { /* 静默 */ }
  });
}

export function unsubscribeUi(): void {
  _settingsGroupUnsub?.();
  _settingsGroupUnsub = null;
  _scrollToUnsub?.();
  _scrollToUnsub = null;
  _openKeybindingsUnsub?.();
  _openKeybindingsUnsub = null;
}

/** dialog:* channel 处理器——插件调壳的 ConfirmDialog（E6#71c 富内容确认同域委派） */
export async function handleDialogChannel(channel: string, args: unknown[]): Promise<unknown> {
  switch (channel) {
    // ── E5#67：弹窗归一化——插件调壳的 ConfirmDialog ──
    case "dialog:confirm": {
      const [message] = args as [string];
      return confirm({ title: "", message });
    }
    // ── E6#71c：富内容确认——插件自绘确认内容（content 视图 + 不透明 payload）。
    //    壳 DialogService.confirmContent → bridges 解析 content 视图 renderPath → 推池 DialogHost；
    //    视图寻址失败壳回落纯文字 message 确认（弹窗仍出，不静默死）。 ──
    case "dialog:confirmContent": {
      const [opts] = args as [DialogContentOpenOptions];
      if (!opts || !opts.pluginId || !opts.viewId) {
        throw new Error("dialog:confirmContent 参数缺失（需 pluginId + viewId）");
      }
      return confirmContent({
        title: opts.title ?? "",
        message: opts.message ?? "",
        content: { pluginId: opts.pluginId, viewId: opts.viewId, payload: opts.payload },
      });
    }
    case "dialog:alert": {
      const [message] = args as [string];
      await alert({ title: "", message });
      break;
    }
    default:
      throw new Error(`未知的 bridge channel: ${channel}`);
  }
}

/** menu:* / contextKey:* 三 channel 处理器——插件声明式读写菜单 + SET 上下文 */
export async function handleSettingsChannel(channel: string, args: unknown[]): Promise<unknown> {
  switch (channel) {
    // ── E5#69：菜单——插件声明式读写 ──
    case "menu:registerItems": {
      const [menuId, pluginId, items] = args as [string, string, ManifestMenuItem[]];
      registerMenuItems(menuId, pluginId, items);
      break;
    }
    case "menu:getItems": {
      // E5.5#7-p3：壳侧一站式过滤——when 匹配 + 命令标题 + 快捷键解析。
      // ContextMenu/MenuRenderer 不再 import @src/core——零依赖纯渲染。
      // E5.7#14：显示文本铁律——标签/标题/子项标签壳侧 t() 解析后推送，
      // 池哑渲染原文、不初始化 i18n（浮层归一化设计.md §4.4）。
      const [menuId, context] = args as [string, Record<string, unknown> | undefined];
      const raw = getMenuItems(menuId) as ManifestMenuItem[];
      const allCmds = getCommands();
      // E5.8#37.7：面板标签栏右键 checked 标记（当前项 √，单选）——壳侧对 panelViewContext 子项
      // 逐项解析（位置命令 = 当前 edge 命中 / 对齐命令 = 当前 align 命中）。真相源 = LayoutEngine dock。
      const isPanelViewContext = menuId === MENU_SLOTS.PanelViewContext;
      // 显式 MenuItemDescriptor[]——map 推断类型不含 checked/commandArgs（#37.7.1 动态视图项要写）
      const items: MenuItemDescriptor[] = raw
        .filter((item): item is Exclude<ManifestMenuItem, string> => {
          if (typeof item === "string") return false; // 分隔符/字符串引用——壳侧不返回
          const cmd = allCmds.find(c => c.id === item.command);
          const whenExpr = item.when ?? cmd?.when;
          return ContextKeyService.matches(whenExpr, context as Record<string, unknown> | undefined);
        })
        .map((item) => {
          const cmd = allCmds.find(c => c.id === item.command);
          const kb = findKeybindingForCommand(item.command);
          return {
            ...item,
            label: item.label ? i18n.t(item.label) : item.label,
            title: cmd?.title ? i18n.t(cmd.title) : cmd?.title,
            shortcut: kb?.key,
            // 子项：字符串 = 命令引用原样透传；对象 = 翻译 label（+ #37.7 checked 解析透传）。
            // （用 instanceof 而非 typeof——ESLint no-restricted-syntax 对"小写字面量比较"
            //  一律报 pluginId 硬编码误报，typeof x === "string" 是已知误报模式）
            children: item.children?.map((c) => {
              if (!(c instanceof Object)) return c;
              const resolved = { ...c, label: c.label ? i18n.t(c.label) : c.label } as MenuItemDescriptor;
              if (isPanelViewContext) resolved.checked = resolvePanelChecked(c.command);
              return resolved;
            }),
          };
        });

      // E5.8#37.7.1：面板标签栏右键「视图清单」——壳侧 getItems 动态注入当前面板容器全部视图为
      // 顶层菜单项（与位置/对齐同级，非子菜单）。数据源 = ViewContainerService 壳布局真相
      // （Path B 池只读——池不传视图清单，插件声明视图即自动进清单，零第二声明面）。
      //   勾选态 = visible（谁显示在标签栏谁打勾，复用 #37.7 checked 基建）；
      //   点击 = 显隐（workbench.action.togglePanelViewVisibility——commandArgs 携带
      //   containerId+viewId，ContextMenu context 共享故 per-item 身份走命令载荷）；
      //   空容器（无贡献视图）跳过——无面板视图时不推视图项。
      if (isPanelViewContext) {
        for (const container of ViewContainerService.getViewContainers("panel")) {
          for (const v of ViewContainerService.getViews(container.id)) {
            items.push({
              command: "workbench.action.togglePanelViewVisibility",
              label: i18n.t(v.title),
              group: "panelViews",
              checked: ViewContainerService.isVisible(container.id, v.id),
              commandArgs: [container.id, v.id],
            });
          }
        }
      }

      // E5.8#39.5 子项 C：标签页右键「在悬浮面板中打开」——壳侧 getItems 动态注入（I8-3 声明即出现）。
      // 声明条件 = 右键标签页的插件声明 contributes.floatingPanel.viewId（viewRegistry 读取，getTabBehavior
      // 同源模式；pluginId 由池 GroupTabBar 随 context 透传）。未声明 → 不注入（第三方插件零壳改动）。
      // 点击 = 薄命令 workbench.action.revealFloatingPanel emit panel:reveal-floating → App useFloatingPanelReveal
      // 复用 #39.5 子项 B wire（resolve→toggle→push，零新编排）；commandArgs=[viewId] per-item 身份走命令载荷
      // （context 整菜单共享，同 #37.7.1）。
      if (menuId === MENU_SLOTS.TabContext) {
        const tabCtx = (context ?? {}) as { pluginId?: unknown; tabId?: unknown };
        if (typeof tabCtx.pluginId === "string") {
          const fpViewId = getFloatingPanelViewId(tabCtx.pluginId);
          if (fpViewId) {
            // E5.8#41.16：commandArgs 携带 pluginId（右键的标签页就是目标插件）——revealFloatingPanel
            // 载荷复合寻址，双插件同名 viewId 并存不歧义（#41.8 §4.2「调用方必须携带 pluginId」）
            items.push({
              command: "workbench.action.revealFloatingPanel",
              label: i18n.t("在悬浮面板中打开"),
              commandArgs: [fpViewId, tabCtx.pluginId],
            });
          }
        }
        // E5.8#44：「并回主窗口」动态注入——tab 所在窗口 detached 才出现（壳侧 findTabWindow 搜注册表）。
        // 命令 core.mergeBackToMain 无 menuId 不常驻所有 tab 右键（#39.5 同款动态注入）。
        if (typeof tabCtx.tabId === "string") {
          const win = getCallbacks()?.findTabWindow(tabCtx.tabId);
          if (win?.mode === "detached") {
            items.push({
              command: "core.mergeBackToMain",
              label: i18n.t("并回主窗口"),
              group: "window",
            });
          }
        }
      }
      return items;
    }
    // ── E5#70：ContextKey——插件 SET 状态 ──
    case "contextKey:set": {
      const [key, value] = args as [string, unknown];
      ContextKeyService.setValue(key, value);
      break;
    }
    default:
      throw new Error(`未知的 bridge channel: ${channel}`);
  }
}

/** 设置导航/外观 六方法处理器 */
export async function handleSettingsMethod(method: string, args: unknown[]): Promise<unknown> {
  void args; // 六方法均无参
  switch (method) {
    // ── E5.5#7：壳→设置页导航——M1 双通道（齿轮"设置"跳转到指定分组/配置项）──
    case "consumeSettingsGroup":
      return consumeSettingsGroup();
    case "consumeScrollToSetting":
      return consumeScrollToSetting();
    // E5.8#41.14 🔴 修复：打开快捷键子栏——契约双通道消费（替代错配 window 事件死路由）
    case "consumeOpenKeybindings":
      return consumeOpenKeybindings();
    case "getAvailableThemes":
      return getAvailableThemes();
    case "getCurrentTheme":
      return getCurrentTheme()?.name ?? null;
    case "getAvailableLanguages":
      return LanguageRegistry.getAll();
    case "getCurrentLanguage":
      return i18n.language;
    default:
      throw new Error(`未知的 plugins 方法: ${method}`);
  }
}

/** toast 四方法处理器——插件通知跨进程触发壳侧 toast */
export async function handleUiMethod(method: string, args: unknown[]): Promise<unknown> {
  switch (method) {
    // E3j #76：插件通知——跨进程触发壳侧 toast
    // E6#13.5c：options.actions（插件序列化 {command,args}，无闭包）→ 壳 toast action closure
    // （点击 executeCommand 真执行）。建 toast 时包好 onClick——与壳内 pushToast（闭包 onClick）
    // 同形态，serializeToasts/runToastAction/ToastHost 零改动；无 command 的 action 仅关闭（点击后 dismiss）。
    case "showNotification": {
      const [message, options] = args as
        | [string, { type?: string; progress?: boolean; actions?: PluginToastAction[] } | undefined];
      const severity: ToastSeverity =
        options?.type === "error" ? "error" :
        options?.type === "warning" ? "warning" : "info";
      const actions = options?.actions?.map((a) => ({
        label: a.label,
        isPrimary: a.isPrimary,
        onClick: () => {
          // executeCommand(id, _token?, ...args)——token 槽位显式 undefined 占位（E5.7#63.8 全仓惯例），
          // a.args 从第三位起才进 handler ...args；漏占位会让 args[0] 落进 token 被剥（实机/单测双证）。
          if (a.command) void executeCommand(a.command, undefined, ...(a.args ?? []));
        },
      }));
      // E6#13.5d：插件 error 类 toast 对齐 TOAST_TTL_ERROR（8000，mockup 帧 3——诊断需要时间读）；
      // info/warning 沿用默认 6000；progress 进度条不自动消失。
      const ttl = options?.progress ? 0 : severity === "error" ? TOAST_TTL_ERROR : undefined;
      const id = pushToast({ message, severity, actions, ttl });
      return options?.progress ? id : undefined;
    }
    case "updateNotification": {
      const [handleId, message] = args as [string, string];
      updateToast(handleId, message);
      break;
    }
    case "finishNotification": {
      const [handleId, message] = args as [string, string | undefined];
      dismissToast(handleId);
      if (message) pushToast({ message, severity: "info" });
      break;
    }
    case "cancelNotification": {
      const [handleId] = args as [string];
      dismissToast(handleId);
      break;
    }
    default:
      throw new Error(`未知的 plugins 方法: ${method}`);
  }
}
