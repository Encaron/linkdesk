# E4f — Monaco 编辑器

> 2026-07-25。**4 任务，~200 行。** 对标 VS Code 文本编辑器——语法高亮 + IntelliSense + 编码检测 + JSON schema + 多标签页。
> **性质：** 纯插件——`import * as monaco from 'monaco-editor'` → React 组件。壳不知道 Monaco 的存在。

---

## 一、定位

Monaco 是重型库（~5MB），E3a 多 WebView 保证它跑在独立进程中——崩了不影响壳和其他插件。

```
plugins/factory/editor/
├── plugin.json              → contributes.editors + keybindings
├── resources/icon.svg
└── src/
    ├── index.tsx            → 导出
    ├── EditorView.tsx       → 🔥 Monaco React 包装
    ├── EncodingService.ts   → 🔥 文件编码检测/切换
    └── MonacoSchemaConfig.ts → JSON schema 自动补全配置
```

---

## 二、消费的架构能力

| 设施 | 用法 | 来源 |
|---|---|---|
| `FileService.readFile(path)` | 读文件内容 → Monaco setValue() | E2c #13 |
| `FileService.writeFile(path, text)` | Ctrl+S 保存 | E2c #13 |
| `FileAssociationService.registerFileAssociation()` | 注册 .json/.md/.txt/.ts/.tsx → 编辑器 | E2c #13a |
| E3a 多 WebView | Monaco 独立进程（重型库） | E3 |
| `DialogService.confirm()` | "文件已修改，是否保存？" | E2c #15 |
| `getAssetPath()` | Monaco worker 路径（打包后 file:// 协议） | E1 步 7 |
| E3b 主题引擎 | `theme:changed` IPC → Monaco 切换 vs/vs-dark | E3 |

---

## 三、任务清单

### #94 Monaco React 包装（~90 行）

```tsx
// EditorView.tsx
// 🔥 对标 VS Code 的文本编辑器
const EditorView: React.FC<{ filePath: string; tabId: string }> = ({ filePath, tabId }) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  const [encoding, setEncoding] = useState('utf8');

  useEffect(() => {
    (async () => {
      // 1. 读文件（二进制→检测编码→解码）
      const buffer = await FileService.readBinaryFile(filePath);
      const detectedEncoding = EncodingService.detect(buffer);
      setEncoding(detectedEncoding);
      const content = EncodingService.decode(buffer, detectedEncoding);

      // 2. 根据扩展名选语言
      const language = getLanguageId(filePath);
      // .json → json, .ts → typescript, .tsx → typescriptreact, .md → markdown

      // 3. 创建（或复用）Monaco 编辑器
      if (editorRef.current) {
        editorRef.current.setValue(content);
        monaco.editor.setModelLanguage(editorRef.current.getModel()!, language);
      } else {
        editorRef.current = monaco.editor.create(containerRef.current!, {
          value: content,
          language,
          theme: getMonacoTheme(),       // 从 E3b 主题引擎——vs / vs-dark
          automaticLayout: true,
          wordWrap: 'on',
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          renderWhitespace: 'selection',
          tabSize: 2,
          // 🔥 从 FileService 读取 settings.json → monaco.editor.updateOptions()
        });
      }

      // 4. 监听修改
      const disposable = editorRef.current.onDidChangeModelContent(() => {
        setDirty(true);
        // 更新标签页标题显示 ●（dirty 标记）
        executeCommand('workbench.action.updateTabLabel', { tabId, dirty: true });
      });

      // 5. Ctrl+S 保存
      editorRef.current.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => save()
      );

      // 6. 预览→pin：用户编辑内容后自动 pin
      if (editorRef.current) {
        editorRef.current.onDidChangeModelContent(() => {
          // 通知壳：当前 tab 从 preview → pin
          // 对标 VS Code editorGroupModel preview→pin
        });
      }

      return () => disposable.dispose();
    })();
  }, [filePath]);

  async function save() {
    if (!editorRef.current) return;
    const content = editorRef.current.getValue();
    const encoded = EncodingService.encode(content, encoding);
    // 🔥 写二进制以保留编码
    await FileService.writeFile(filePath, content); // writeFile 内部处理编码
    setDirty(false);
    executeCommand('workbench.action.updateTabLabel', { tabId, dirty: false });
  }

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};
```

### #95 编码检测/切换（~60 行）

```typescript
// EncodingService.ts
// 🔥 对标 VS Code 的编码检测——IconvLite + BOM 检测

class EncodingService {
  private static BOM_MAP: Record<string, string> = {
    '\uFEFF': 'utf8bom',
    '\uFFFE': 'utf16le',
    '\uFEFF\u0000': 'utf16be',
  };

  /** 检测文件编码 */
  static detect(buffer: Uint8Array): string {
    // 1. BOM 检测
    const head = new TextDecoder('utf8').decode(buffer.slice(0, 4));
    for (const [bom, enc] of Object.entries(this.BOM_MAP)) {
      if (head.startsWith(bom)) return enc;
    }

    // 2. UTF-8 有效性检测
    if (isValidUtf8(buffer)) return 'utf8';

    // 3. GBK 特征检测（中文字节范围 0x81-0xFE）
    if (hasGbkPattern(buffer)) return 'gbk';

    // 4. 默认 UTF-8
    return 'utf8';
  }

  /** 解码 */
  static decode(buffer: Uint8Array, encoding: string): string {
    // iconv-lite: Buffer.from(buffer).toString(encoding)
    // 或 TextDecoder（仅支持 UTF-8/16）
    return new TextDecoder(encoding === 'gbk' ? 'gbk' : 'utf-8').decode(buffer);
  }

  /** 编码 */
  static encode(text: string, encoding: string): Uint8Array {
    return new TextEncoder().encode(text); // 简化版——需要 iconv-lite 支持 GBK 编码
  }

  /** 状态栏显示：当前编码 + 点击切换菜单 */
  static registerStatusBarItem(): void {
    // 注册到 EditorView 的状态栏区域：
    // "UTF-8" 标签 → 点击 → 弹出编码选择菜单 → 重新读文件+重新渲染
  }
}
```

### #96 JSON schema 自动补全（~30 行）

```typescript
// MonacoSchemaConfig.ts
// 对标 VS Code 的 JSON schema 支持
// 编辑 settings.json / keybindings.json 时自动补全 + 悬停提示

export async function configureJsonSchema(editor: monaco.editor.IStandaloneCodeEditor): Promise<void> {
  // 读取 plugin.schema.json（canonical 位置：public/schemas/——E2c #19j-icon 已迁）
  const schemaUrl = getAssetPath('schemas/plugin.schema.json');
  const response = await fetch(schemaUrl);
  const schema = await response.json();

  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,          // settings.json 支持注释
    schemas: [{
      uri: 'linkdesk://schemas/plugin-schema.json',
      fileMatch: ['settings.json', 'keybindings.json'],
      schema,
    }],
    enableSchemaRequest: false,
  });

  // 悬停提示——中文 description 正确显示
  // 自动补全——enum 值列出可用选项
  // 错误标记——类型不匹配 / 缺少必填字段
}
```

### #97 多标签页 + dirty + Ctrl+Shift+T（~20 行）

```typescript
// editor multi-tab support (壳级功能，编辑器消费)
// 1. 多标签页——每个打开的文件是一个标签页
//    走壳的 tabActions.createTab("monaco-editor", { filePath })
//    tabBehavior.singleton = false（允许多个编辑器标签页同时存在）

// 2. dirty 管理——标签页标题显示 ●
//    对标 VS Code editorGroupModel dirty state
//    编辑器修改后 → setDirty(true) → 标签页标题显示 "settings.json ●"
//    关闭标签页时检测 dirty → "是否保存对 settings.json 的更改？"
//    → 保存 / 不保存 / 取消
//    这是壳级行为——由 tabBehavior.invokeBeforeClose 触发

// 3. Ctrl+Shift+T Reopen Closed Tab
//    对标 VS Code workbench.action.reopenClosedEditor
//    壳级功能——useTabManager reducer:
//    case 'closeTab': closedTabStack.push(action.tab);
//    case 'reopenClosedTab': const last = closedTabStack.pop();
//    编辑器本身不实现——它只是被"重新创建"
```

---

## 四、汇总

| # | 任务 | 标杆 | 行数 |
|:--:|------|:--:|:--:|
| #94 | Monaco React 包装——创建/复用编辑器 + Ctrl+S + preview→pin + dirty | VS Code editor | ~90 |
| #95 | EncodingService——编码检测(BOM/UTF-8/GBK) + 状态栏切换 | VS Code encoding | ~60 |
| #96 | JSON schema 自动补全——settings.json / keybindings.json | VS Code JSON language | ~30 |
| #97 | 多标签页 + dirty 标记 + Ctrl+Shift+T 恢复关闭 | VS Code editorGroupModel | ~20 |
| **合计** | | | **~200 行** |

---

## 五、依赖

- **E3a**：独立 WebContentsView——Monaco 是重型库（~5MB），必须独立进程
- **E2c FileService**：读文件内容 → Monaco 渲染，Ctrl+S → 保存
- **E2c FileAssociationService**：注册扩展名映射，文件树双击 → 找到编辑器
- **E3b 主题引擎**：`theme:changed` IPC → Monaco 切换主题（`vs` / `vs-dark`）
- **E1 步 7 getAssetPath()**：Monaco worker 路径（打包后 `file://` 协议不能手写路径）

---

> **← 上一文档：** `05-E4e-工作区与持久化.md`
> **索引：** `00-README.md`
> **进度：** `07-执行清单.md`（唯一真相源）
> **🏁 E 编号到此为止。** E4f 是最后一个有编号的子任务。
