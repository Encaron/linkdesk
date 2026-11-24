/**
 * {{displayName}}——LinkDesk 插件主视图（由 create-linkdesk-plugin 生成）。
 *
 * 视图插件契约（作者文档 01-plugin-api-contract.md）：壳以 { isActive, tabId?, sourceId? }
 * 渲染本文件 default 导出的组件：
 *   - isActive  本标签当前是否聚焦。keep-alive 下非聚焦标签仍在渲染，isActive 只用于
 *               gate「聚焦才跑」的副作用（如自动保存），切勿用它整块 blank 掉内容。
 *   - tabId     本标签页 id。
 *   - sourceId  上下文数据（文件路径 / 数据源等），编辑器类插件用它定位内容。
 *
 * 样式：LinkDesk 主题色一律走 CSS 变量 var(--xxx)（见 index.css 示例），禁硬编码 hex。
 * 文案：用 t() 读——key 就是中文原文，英文译文放 i18n/en.json（见作者文档 05-ui-conventions.md）。
 * 壳已 external react/react-dom/react-i18next/i18next——构建不会打进包，插件工程无需 npm i 它们。
 *
 * 命令：本插件自带两条能跑的样板——entry 级（src/commands.ts，**顶层**注册，无视图可调）
 * 与 view 级（本文件组件内注册，随视图挂载）；两条的声明都在 plugin.json 的 contributes.commands[]。
 *
 * 🔴 共享件来自 `@linkdesk/ui`（壳在运行时供给那**唯一一份**，见 READMEs「共享的东西不写在这里」）：
 * 本文件从它**静态具名导入**了 `HintTip`。你每多导入一个导出，`plugin.json` 的 `minAppVersion`
 * 下限就由工具重算一次——**旧壳里没有这个导出时，插件会整只加载失败**（不是「那个组件不显示」）。
 * ⇒ 改完代码跑 `npm run lint` 拿新值，别照抄这里的数字。
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HintTip } from "@linkdesk/ui";
import { registerPluginCommands } from "./commands";
import "./index.css";

registerPluginCommands();

export default function HelloPlugin(_props: { isActive?: boolean; tabId?: string; sourceId?: string }) {
  const { t } = useTranslation();
  const [reply, setReply] = useState("");

  // 视图态命令样板（plugin.json 里 activation:"view"）：只在视图挂载时注册。
  // 作用域分区会随本视图卸载自动摘除——⛔ 不要调 unregisterCommands(pluginId) 整片摘。
  // useRef 防 StrictMode 下 effect 双跑导致同 id 重复注册（S4 会记诊断）。
  const viewCommandRegistered = useRef(false);
  useEffect(() => {
    if (viewCommandRegistered.current) return;
    viewCommandRegistered.current = true;
    window.linkdesk?.commands?.registerCommand("{{pluginName}}.viewGreeting", async () => ({
      message: "这个命令只在视图打开时可用。",
    }));
  }, []);

  // 界面也只是命令的消费者之一——按钮走命令而不是直调函数，
  // 这样命令面板 / 快捷键 / AI 与按钮用的是**同一条实现**（入口可多处，命令源唯一）。
  const callHello = async () => {
    const res = await window.linkdesk?.commands?.executeCommand<{ message: string }>(
      "{{pluginName}}.hello",
      { name: "LinkDesk" },
    );
    setReply(res?.message ?? "（命令没有返回）");
  };

  return (
    <div className="{{pluginName}}-starter">
      <h2 className="{{pluginName}}-starter__title">{t("插件跑起来了 ✨")}</h2>
      <p className="{{pluginName}}-starter__text">{t("这是你的第一个 LinkDesk 插件。")}</p>
      <p className="{{pluginName}}-starter__hint">
        <code>src/index.tsx</code> {t("是插件本体——改它，浏览器预览即时刷新。")}
      </p>
      <p className="{{pluginName}}-starter__hint">
        <code>npm run build</code> {t("打包出分发文件，可装进 LinkDesk 或发布到市场。")}
      </p>
      <p className="{{pluginName}}-starter__hint">{t("目录该放哪、发布怎么做，都写在 README.md 里。")}</p>
      <p className="{{pluginName}}-starter__hint">
        <code>src/commands.ts</code> {t("里有一条能跑的命令样板——按钮、命令面板、AI 调的是同一条。")}
      </p>
      {/* HintTip 是共享件的样板用法：它只往你给的这一个子元素上挂属性（提示 + 快捷键），
          不包一层 DOM、不动布局——共享件应当这样融入你的界面，而不是重写一份。 */}
      <HintTip command="{{pluginName}}.hello">
        <button className="{{pluginName}}-starter__button" onClick={callHello}>
          {t("调一次命令")}
        </button>
      </HintTip>
      {reply && (
        <p className="{{pluginName}}-starter__reply" role="status">
          {reply}
        </p>
      )}
    </div>
  );
}
