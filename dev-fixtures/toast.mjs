/**
 * LinkDesk 提示条（toast）演示/验收小工具——E6 QA 工具（第 1.2.6 轮 #13.5 起）。
 *
 * 经 CDP（9222）往运行中的软件池页弹提示条——给实机验收/手工把玩用：
 * 插件 notifications.show 的全部能力（类型/按钮/主按钮）一条命令可视验证。
 *
 * 用法（软件要开着；在项目根或任意目录跑下面任一条）：
 *   node dev-fixtures/toast.mjs "消息"                       # 普通蓝色提示
 *   node dev-fixtures/toast.mjs "消息" error                 # 红色出错（停 8s）
 *   node dev-fixtures/toast.mjs "消息" warning               # 黄色警告（停 6s）
 *   node dev-fixtures/toast.mjs "怎么办？" error "重试" "查看详情"   # 带按钮（点击 = 关提示条）
 *   node dev-fixtures/toast.mjs "需要你决定" info "!好的" "算了"     # 按钮前加 ! = 主按钮（accent 醒目）
 * 注：按钮背后的 command 真执行属市场轮消费（#13.5f）——本工具按钮仅可视演示。
 * 依赖：Node ≥18（global fetch/WebSocket）。
 */
const [, , ...argv] = process.argv;
let msg = argv[0] ?? "（没写消息）";
let type = "info";
const buttons = [];
for (const a of argv.slice(1)) {
  if (a === "info" || a === "warning" || a === "error") { type = a; continue; }
  buttons.push(a);
}
const actions = buttons.map((b) => ({ label: b.replace(/^!/, ""), isPrimary: b.startsWith("!") }));

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const t = targets.find((x) => x.title === "LinkDesk Pool");
if (!t) { console.error("没找到正在运行的 LinkDesk（软件没开？或启动后还没就绪）。"); process.exit(2); }
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws error")); });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const expr = `(async () => { await window.linkdesk.notifications.show(${JSON.stringify(msg)}, { type: ${JSON.stringify(type)}, actions: ${JSON.stringify(actions)} }); return "弹好了"; })()`;
const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
if (r.result?.exceptionDetails) { console.error("弹出失败：" + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); process.exit(3); }
console.log("✓ " + JSON.stringify(r.result?.result?.value));
process.exit(0);
