/**
 * E4V#40c EditorModel——文件内容唯一真相源。
 *
 * 每个打开的文件一个 EditorModel 实例。EditorTab（E4V#40f）消费。
 *
 * 职责：
 *   - load()：readBinaryFile → EncodingService.detect → decode
 *   - save()：encode → writeFile
 *   - isDirty()：_value !== _savedValue
 *   - onDidChangeContent / onDidSave：Emitter 通知 UI
 *
 * 设计原则：归一化——编辑器内所有对文件内容的读写走这一个对象。
 * 不散落在 EditorView/EditorTab/快捷键 handler 各写各的。
 */
import { Emitter } from "@src/core/CoreEvents";
import { readBinaryFile, writeFile } from "@src/core/FileService";
import { EncodingService } from "@src/core/encoding/EncodingService";
import { normalizePath } from "@src/core/pathUtils";
import { getLanguageFromPath } from "./language-map";

export class EditorModel {
  readonly filePath: string;
  readonly language: string;
  readonly encoding: string;

  /** 当前内存中的值 */
  private _value: string;
  /** 上次保存时的值——脏状态比较基准 */
  private _savedValue: string;

  /** 内容变更——EditorView onChange → setValue → fire */
  readonly onDidChangeContent = new Emitter<string>();
  /** 保存成功——EditorTab save → markSaved → fire */
  readonly onDidSave = new Emitter<void>();

  private constructor(filePath: string, content: string, encoding: string) {
    this.filePath = filePath;
    this._value = content;
    this._savedValue = content;
    this.encoding = encoding;
    this.language = getLanguageFromPath(filePath);
  }

  /** Monaco model URI——file:/// 协议，跨文件 TS 解析用 */
  get uri(): string {
    const n = normalizePath(this.filePath);
    return n.startsWith("/") ? `file://${n}` : `file:///${n}`;
  }

  getValue(): string {
    return this._value;
  }

  setValue(v: string): void {
    this._value = v;
    this.onDidChangeContent.fire(v);
  }

  /** 是否有未保存的更改 */
  isDirty(): boolean {
    return this._value !== this._savedValue;
  }

  /** 标记为已保存（_savedValue 同步到 _value） */
  markSaved(): void {
    this._savedValue = this._value;
    this.onDidSave.fire();
  }

  /** 从内存内容创建（不解码）——E4V#40n Hot Exit 恢复用 */
  static fromContent(filePath: string, content: string): EditorModel {
    return new EditorModel(normalizePath(filePath), content, "utf-8");
  }

  /** 从磁盘加载文件 */
  static async load(filePath: string): Promise<EditorModel> {
    const normalized = normalizePath(filePath);
    const buffer = await readBinaryFile(normalized);
    const encoding = EncodingService.detect(buffer);
    const content = EncodingService.decode(buffer, encoding);
    return new EditorModel(normalized, content, encoding);
  }

  /** 保存到磁盘 */
  async save(): Promise<void> {
    // TODO E4V#40w：EncodingService.encode 当前只支持 UTF-8，GBK 等编码以后支持
    // 对于非 UTF-8 编码，writeFile 写 string 可能导致编码丢失。
    // 临时方案：非 UTF-8 编码时 console.warn 提示，仍写 string。
    if (this.encoding !== "utf-8" && this.encoding !== "utf8") {
      console.warn(
        `[EditorModel] save: encoding "${this.encoding}" may lose fidelity (E4V#40w pending)`,
      );
    }
    await writeFile(this.filePath, this._value);
  }
}
