/**
 * FileTreeNotify——file-tree 的**唯一失败出口**（E6#73m K2）。
 *
 * 病根（18 档 §三 K 第 2 行）：拖放 / 粘贴 / 删除整个目录都是**会失败的长任务写操作**，而
 * `lk.filesystem.copy` / `remove` 的调用点全程无 try/catch。React 的 `onDrop` / `onClick`
 * **不 await**（rejection 直接悬空），池渲染进程又**没有任何全局拒绝兜底**
 * （`src/pool/pool-main.tsx` 零注册，仓里 `unhandledrejection` 只命中壳且是 silent）。
 * ⇒ 源文件被占用 / 无权限 / 跨盘符时，用户看到的是「树没刷新，也没报错」——自然以为拖成功了。
 *
 * **为什么不做进度条**：一次拖放是一串**不可再分**的门面调用——`filesystem.copy` 整目录的内部
 * 是主进程的递归复制，插件拿不到文件计数。按「第 k / N 个源」画条，在「拖进去一个目录」这个
 * 最常见的场景下几乎恒为 0% 然后突然 100%——那不是进度，是动画。宁可不画，也不编。
 * （要真进度得先给 `filesystem.copy` 开一路逐文件回调，那是**新的壳能力**，不在本档范围内。）
 */

import i18n from "i18next"; // E6#73h（D3）先例：非组件模块走 i18next 默认实例

const lk = () => window.linkdesk;

/**
 * file-tree 自己的来源归属键（E6#73g S5）——面板按它把通知归成一组、共用那份常驻配额。
 * 与插件 id 同字面量（`plugins/file-tree/`），写散 = 同一次操作被劈成两组。
 */
const SOURCE = "file-tree";

/** 一项操作失败——`name` 是用户认得出的那个名字（文件/目录名），不是整串路径 */
export interface FailureItem {
  name: string;
  detail: string;
}

/** 统一取错误文案（Error/字符串/其他都兜住——IPC 那侧抛出来的未必是 Error 实例） */
export function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 从路径取显示名（末段；取不到就退回整串——宁可难看也别丢名字） */
export function nameOf(p: string): string {
  return p.split("/").pop() || p;
}

/**
 * 报一批操作的失败——**一次动作一条**，不按文件刷屏。
 * 单条失败给全细节（用户最需要的就是那句原因）；多条失败给条数 + 名字（原因通常是同一个）。
 * `op` 由调用方 `i18n.t()` 解析（「移动」/「复制」/「删除」/「刷新」）。
 */
export function notifyFailure(op: string, failures: FailureItem[]): void {
  if (failures.length === 0) return;
  const show = lk()?.notifications?.show;
  // 预览环境 / 壳进程无铃铛面——静默 no-op（同 marketplace 的 notifyError 门控），不影响调用方流程
  if (!show) return;
  const single = failures[0];
  const names = failures.slice(0, 3).map((f) => f.name).join(", ");
  const message = failures.length === 1
    ? i18n.t("{{op}}「{{name}}」失败：{{detail}}", { op, name: single.name, detail: single.detail })
    : i18n.t("{{op}} {{count}} 项失败：{{names}}", {
      op,
      count: failures.length,
      names: failures.length > 3 ? `${names} …` : names,
    });
  // 常驻（E6#73j 定案：失败是待办，8 秒自灭等于没报）——用户可以看完再关
  void show(message, { type: "error", source: SOURCE, persistent: true });
}
