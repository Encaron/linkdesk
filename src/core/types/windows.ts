/**
 * 跨模块共享窗口类型——E5.8#45。core/types = 跨模块共享 type（壳目录规范：只放类型）。
 *
 * WindowMode 同时被壳策略层（src/App/windows.ts WINDOW_MODE_STRATEGIES 键 + WindowShellState.mode）
 * 与 core 回调契约（CoreCallbacks.findTabWindow）引用——core 不 import App，故类型下沉此处，
 * App 侧 import + re-export（消费方仍 `./windows` 引入，零改动）。
 *
 * 语义（#43/#45）：
 *   main     主窗——全 zone；面板常驻；关窗=应用退出
 *   detached 脱出窗——tab 随窗；关窗=壳移除窗口状态（tab 随窗关闭，非回归）
 *   drift    漂移面板窗（#45）——面板专用窗（恒空 groups，主区空占位 I9-13）；
 *            关窗=关闭面板（I9-13 拍板 A）
 */
export type WindowMode = "main" | "detached" | "drift";
