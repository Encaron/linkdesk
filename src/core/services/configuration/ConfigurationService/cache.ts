/**
 * 配置服务——三层缓存属主（E5.8#0.4a 拆 ConfigurationService/ feature-folder）。
 * 单域属主（0d.10-8 KeybindingRegistry 同型——「模块级 mutable 状态各归单域属主 + 跨域读走
 * 公开 accessor + 依赖单向无环」）：_userSettings/_workspaceSettings/_workspaceRoot 归本文件，
 * siblings 读写全走 accessor，杜绝跨文件裸引用。
 *
 * 外部消费方仍走 ../ConfigurationService 聚合器（公开读 getter 经聚合器 re-export 门户）；
 * 内部 accessor（getUserCache 等 live ref）仅供 siblings 消费，不对外。
 *
 * 分层依赖（单向无环）：cache（叶子，零内部依赖）← value-access / settings-io / 聚合器。
 */

/* ── 三层缓存 ── */

let _userSettings: Record<string, unknown> = {};
let _workspaceSettings: Record<string, unknown> = {};
let _workspaceRoot: string | null = null;

/* ── 内部 accessor（live ref——settings-io 写路径直接增删改真对象） ── */

/** User scope live ref——写路径读改同一对象；_persistUser 落盘读的是去抖 fire 时刻的 live 引用 */
export function getUserCache(): Record<string, unknown> { return _userSettings; }

/** Workspace scope live ref */
export function getWorkspaceCache(): Record<string, unknown> { return _workspaceSettings; }

/** 整体替换 User scope（init 读盘落缓存） */
export function replaceUserCache(v: Record<string, unknown>): void { _userSettings = v; }

/** 整体替换 Workspace scope（setWorkspaceRoot 读盘/清空） */
export function replaceWorkspaceCache(v: Record<string, unknown>): void { _workspaceSettings = v; }

/** 写 workspace root（setWorkspaceRoot 专用） */
export function setCacheRoot(v: string | null): void { _workspaceRoot = v; }

/** 清空三层缓存——clearConfigurationCache（测试复位）的缓存侧；persist/init/去抖 侧在 settings-io.ts */
export function resetCacheForTest(): void {
  _userSettings = {};
  _workspaceSettings = {};
  _workspaceRoot = null;
}

/* ── 公开读（JSON 编辑器/消费方——getUserSettings/getWorkspaceSettings 拷贝语义防外部改缓存） ── */

/** 获取当前 workspace 根路径 */
export function getWorkspaceRoot(): string | null {
  return _workspaceRoot;
}

/** 获取 User scope 的完整配置对象——对标 VS Code "Open Settings (JSON)" */
export function getUserSettings(): Record<string, unknown> {
  return { ..._userSettings };
}

/** 获取 Workspace scope 的完整配置对象 */
export function getWorkspaceSettings(): Record<string, unknown> {
  return { ..._workspaceSettings };
}
