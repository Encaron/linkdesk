/**
 * shared/types.ts —— 前后端共享类型。
 * E5#23: FileEntry 唯一定义——src/ 和 electron/ 两端 import 同一来源。
 * 改一处 → tsc 两端同时检查。
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
