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
// E5.6#11.5i：Emitter → 内联 MiniEmitter，EncodingService → lk.encoding.*（async IPC）
import { MiniEmitter } from "../utils/MiniEmitter";
import { getLanguageFromPath } from "./language-map";

const lk = window.linkdesk;

export class EditorModel {
  readonly filePath: string;
  readonly language: string;
  readonly encoding: string;

  /** 当前内存中的值 */
  private _value: string;
  /** 上次保存时的值——脏状态比较基准 */
  private _savedValue: string;

  /** 内容变更——EditorView onChange → setValue → fire */
  readonly onDidChangeContent = new MiniEmitter<string>();
  /** 保存成功——EditorTab save → markSaved → fire */
  readonly onDidSave = new MiniEmitter<void>();

  private constructor(filePath: string, content: string, encoding: string) {
    this.filePath = filePath;
    this._value = content;
    this._savedValue = content;
    this.encoding = encoding;
    this.language = getLanguageFromPath(filePath);
  }

  /** Monaco model URI——file:/// 协议，跨文件 TS 解析用 */
  get uri(): string {
    const n = lk.path.normalize(this.filePath);
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
    return new EditorModel(lk.path.normalize(filePath), content, "utf-8");
  }

  /** 从磁盘加载文件 */
  static async load(filePath: string): Promise<EditorModel> {
    const normalized = lk.path.normalize(filePath);
    const buffer = await lk.filesystem.readBinaryFile(normalized);
    const encoding = await lk.encoding.detect(buffer);
    const content = await lk.encoding.decode(buffer, encoding);
    return new EditorModel(normalized, content, encoding);
  }

  /** 保存到磁盘——UTF-8 走文本写入，GBK/UTF-16 走二进制写入保持编码 */
  async save(): Promise<void> {
    if (this.encoding === "utf-8" || this.encoding === "utf8") {
      await lk.filesystem.writeTextFile(this.filePath, this._value);
    } else {
      // E4V#40w——iconv-lite 编码 → 二进制写入，保持原编码
      const data = await lk.encoding.encode(this._value, this.encoding);
      await lk.filesystem.writeBinaryFile(this.filePath, data);
    }
  }
}
