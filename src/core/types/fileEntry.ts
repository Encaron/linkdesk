/**
 * FileEntry —— 文件系统 DTO 唯一定义（E5#23）。
 * src/ 和 electron/ 两端 import 同一来源——改一处 → tsc 两端同时检查。
 * E5.7#45.5：shared/types.ts 迁入 src/core/types/（壳目录规范 §1：types/ 放跨模块共享纯类型）。
 */

/** 文件/目录条目——前后端共用 */
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;          // 字节
  modifiedAt?: number;    // Unix 时间戳 ms
  /** E4V#10: 文件是否只读（不可写） */
  isReadonly?: boolean;
}
