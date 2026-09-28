/**
 * status-demo——M4 `AI#38.12` 验收夹具（第三方插件视角，零 import、零壳内坐标）。
 *
 * 两个命令：
 *   · `status-demo.probe`（只读数据源）→ 返回一句带时间戳的字符串；设置页的只读状态行
 *     （`renderHint:"readonly"` ＋ `statusCommand`）每 3 秒调一次 ⇒ 屏幕上的时间戳会自己往前走。
 *   · `status-demo.poke`（动作）→ 写一行时间戳进自己的配置键 ⇒ 证明按钮真的执行了命令。
 */
const lk = typeof window !== "undefined" ? window.linkdesk : undefined;

lk?.commands?.registerCommand?.(
  "status-demo.probe",
  () => `夹具活读数 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`,
  {
    title: "夹具探针",
    category: "状态行夹具",
    pluginId: "status-demo",
    description: "返回一句带时间戳的活读数（证明只读行每次重新取值，不走配置存储）",
  },
);

lk?.commands?.registerCommand?.(
  "status-demo.poke",
  async () => {
    const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    await lk?.configuration?.set?.("status-demo.plain", `被戳过 · ${stamp}`);
    return stamp;
  },
  {
    title: "戳一下夹具",
    category: "状态行夹具",
    pluginId: "status-demo",
    description: "把当前时间写进 status-demo.plain（按钮可点性的机械证据）",
  },
);
