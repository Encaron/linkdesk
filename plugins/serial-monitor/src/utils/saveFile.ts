/**
 * 保存文件能力——E6#87b 从 src/index.tsx 搬出（只搬不改）。
 *
 * E5.7#98：浏览器原生 File System Access API 最小面定型（TS DOM lib 未收录，实验性）——
 * 替代 (window as any).showSaveFilePicker。API 缺失时返回 undefined → 调用方抛错 → catch 走 Blob 兜底。
 */

export interface SaveFilePickerHandle {
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>;
}

export type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<SaveFilePickerHandle>;
};

export const saveFilePicker = (window as SaveFilePickerWindow).showSaveFilePicker?.bind(window);
