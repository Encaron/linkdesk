/**
 * 资产入库内容去重——E5.8#152：importImage 按「目标名存在性」去重导致同图重选 N 次 = N 份副本。
 * 核心判据改为「内容已入库」：源内容哈希（SHA-256）→ 扫目标目录同内容 → 返回已有文件零拷贝。
 *
 * 通用规则（本 bug 的类定义）：未来任何资产导入（图标/字体/素材）复用本模块 =
 * 「资产入库内容去重」统一语义。纯 Node 模块零 Electron 依赖——可直测。
 */

import { createHash } from 'crypto';
import * as path from 'path';
import type { FileEntry } from '../../src/core/types/fileEntry'; // src/ 与 electron/ 共用同一 DTO（E5#23）

/** 依赖注入的文件服务子集——生产传 fileService（electron/services），单测传真实 fs 封装 */
export interface AssetDedupFs {
  readBinaryFile(p: string): Promise<Buffer>;
  listDir(d: string): Promise<FileEntry[]>;
  join(...parts: string[]): string;
  /** 同步存在性——对齐 fileService.exists（existsSync，非 Promise） */
  exists(p: string): boolean;
}

/** 内容哈希（SHA-256 hex）——内容去重的判据 */
export function hashBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * 解析资产导入目标——内容去重优先，命名去重兜底。
 *
 * 返回「目标文件名」：
 * - 源内容已在 dir 中存在 → 返回已有文件名（调用方按 exists 判定零拷贝复用）
 * - 否则 → 返回新文件名（同名不同图保留 `stem-N.ext` 命名）
 */
export async function resolveAssetDestination(
  dir: string,
  sourcePath: string,
  fs: AssetDedupFs,
): Promise<string> {
  const sourceHash = hashBuffer(await fs.readBinaryFile(sourcePath));

  // 目录一次性读——逐文件哈希比对（E5.8#152：判「内容已入库」而非「目标名存在」）
  const entries = await fs.listDir(dir);
  for (const e of entries) {
    if (!e.isFile) continue;
    try {
      const existingHash = hashBuffer(await fs.readBinaryFile(fs.join(dir, e.name)));
      if (existingHash === sourceHash) return e.name;
    } catch {
      // 文件被删/占用——跳过不阻塞
    }
  }

  // 无同内容 → 复制新名（同名不同图保留 -N 命名）
  const base = path.basename(sourcePath);
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  let dest = base;
  for (let i = 1; fs.exists(fs.join(dir, dest)); i++) {
    dest = `${stem}-${i}${ext}`;
  }
  return dest;
}
