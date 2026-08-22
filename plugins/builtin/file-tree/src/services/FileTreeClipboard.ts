/**
 * FileTreeClipboard——文件树剪贴板服务。
 * E4V#14：对标 VS Code ICopyCutService。
 *
 * 存储剪切/复制的文件 URI 列表 + 操作类型。
 * 剪切是一次性的——paste 后自动清空；复制可多次 paste。
 */



export class FileTreeClipboard {
  private _uris: string[] = [];
  private _isCut = false;

  /* ── 写入 ── */

  /** 剪切——paste 后自动清空 */
  cut(uris: string[]): void {
    this._uris = [...uris];
    this._isCut = true;
    this._syncKeys();
  }

  /** 复制——可多次 paste */
  copy(uris: string[]): void {
    this._uris = [...uris];
    this._isCut = false;
    this._syncKeys();
  }

  /* ── 读取 ── */

  /** 获取剪贴板内容并处理剪切一次性语义——cut 后自动清空 */
  pull(): { uris: string[]; isCut: boolean } {
    const result = { uris: [...this._uris], isCut: this._isCut };
    if (this._isCut) this.clear();
    return result;
  }

  get uris(): string[] { return [...this._uris]; }
  get isEmpty(): boolean { return this._uris.length === 0; }
  get isCut(): boolean { return this._isCut; }

  /* ── 清理 ── */

  clear(): void {
    this._uris = [];
    this._isCut = false;
    this._syncKeys();
  }

  /* ── 私有 ── */

  private _syncKeys(): void {
    window.linkdesk?.contextKey?.set("explorerResourceCut", this._isCut && !this.isEmpty);
    window.linkdesk?.contextKey?.set("explorerClipboardEmpty", this.isEmpty);
  }
}

/** E4V#14: 文件树剪贴板——全局单例（对标 VS Code CutItemsManager） */
export const fileTreeClipboard = new FileTreeClipboard();
