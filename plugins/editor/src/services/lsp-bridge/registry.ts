/**
 * lsp-bridge 注册表——🔴 五份模块级容器的**单一属主**（E6#87c 拆出来）。
 *
 * 拆前这五份 `Map`/`Set` 与新逻辑同住 `lsp-bridge.ts`；一旦把 `startLspClient` / `takeBlockedNotice`
 * 分去别的文件，容器若跟着散开就会出现**第二份 `_clients`**——两边各记各的，表现为
 * 「LSP 客户端重复起 / 状态不刷新」（04 §三 点名的重灾区）。
 * 故本文件是唯一声明处，其余模块一律经下面这组 accessor 读写。
 */
import type { MonacoLanguageClient } from "monaco-languageclient";

/**
 * 语言服务器这一刻处在哪一档。`undefined` = 这个语言压根没配 LSP（TS/JS 走 worker，正常）。
 *
 * 病根：启动要 1~15 秒（取决于服务器本身，15s 只是防挂护栏上限，不是每次都等 15 秒），
 * 而这期间**界面上没有任何一处说得出「正在起来」**——用户按 F12 得到的是一片安静，
 * 只会得出「跳转坏了」的结论，甚至会去重启软件。
 */
export type LspState = "starting" | "ready" | "failed";

/** 语言 ID → MonacoLanguageClient 注册表——goToDefinitionAt 查表分派 */
const _clients = new Map<string, MonacoLanguageClient>();

/** 同语言的启动中 promise——**两个编辑器不得各起一个进程**。
 *  老判据只挡 `_clients`（要 start 成功才有值），快速连开两个 .py = 两次 spawn。 */
const _pending = new Map<string, Promise<MonacoLanguageClient>>();

/** 语言 ID → 当前档位 */
const _states = new Map<string, LspState>();
/** 档位订阅者（EditorView 在 mount/unmount 里配对挂/摘） */
const _stateSubs = new Set<(languageId: string, state: LspState) => void>();
/** 「启动中点了跳转」的一次性发言权——每轮启动只出声一次，F12 连按不刷屏 */
const _blockedNoticed = new Set<string>();

export function getLspClient(languageId: string): MonacoLanguageClient | undefined {
  return _clients.get(languageId);
}

export function setLspClient(languageId: string, client: MonacoLanguageClient): void {
  _clients.set(languageId, client);
}

export function getPendingStart(languageId: string): Promise<MonacoLanguageClient> | undefined {
  return _pending.get(languageId);
}

export function setPendingStart(languageId: string, p: Promise<MonacoLanguageClient>): void {
  _pending.set(languageId, p);
}

export function clearPendingStart(languageId: string): void {
  _pending.delete(languageId);
}

export function getLspState(languageId: string): LspState | undefined {
  return _states.get(languageId);
}

export function setLspState(languageId: string, state: LspState): void {
  _states.set(languageId, state);
  for (const cb of _stateSubs) cb(languageId, state);
}

/** 订阅状态变化——返回退订函数（EditorView 在 mount/unmount 里配对调用） */
export function onLspStateChange(cb: (languageId: string, state: LspState) => void): () => void {
  _stateSubs.add(cb);
  return () => { _stateSubs.delete(cb); };
}

/** 取一次性发言权——true = 本轮还没出过声（该说）。`takeBlockedNotice` 的判据底料。 */
export function claimBlockedNotice(languageId: string): boolean {
  if (_blockedNoticed.has(languageId)) return false;
  _blockedNoticed.add(languageId);
  return true;
}

/** 新一轮启动——「启动中」的提示权重新发放 */
export function resetBlockedNotice(languageId: string): void {
  _blockedNoticed.delete(languageId);
}
