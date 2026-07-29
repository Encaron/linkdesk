# E4f — Monaco 编辑器

> 2026-07-25。**4 任务，~200 行。** 对标 VS Code 文本编辑器——语法高亮 + IntelliSense + 编码检测 + JSON schema + 多标签页。
> **性质：** 纯插件——`import * as monaco from 'monaco-editor'` → React 组件。壳不知道 Monaco 的存在。
> 🆕 **2026-07-30 更新：** Monaco 集成模式已在 `plugins/user/serial-monitor/src/index.tsx` 中验证（`@monaco-editor/react` + Vite Workers + 自定义语言 + 自定义主题 + keep-alive）。本文档描述如何将已验证模式提取为独立编辑器插件——不是从零集成。

---

## 一、定位

Monaco 是重型库（~5MB），E3a 多 WebView 保证它跑在独立进程中——崩了不影响壳和其他插件。

```
plugins/builtin/editor/
├── plugin.json              → contributes.editors + keybindings + files.encoding/files.autoSave 配置
├── resources/icon.svg
└── src/
    ├── index.tsx            → 导出
    ├── EditorView.tsx       → 🔥 Monaco React 包装
    ├── language-map.ts      → 🔥 扩展名→Monaco language ID 映射表（数据驱动）
    └── MonacoSchemaConfig.ts → JSON schema 自动补全配置

src/core/encoding/
└── EncodingService.ts       → 🔥 编码检测/解码——file-tree（搜索）和 editor 共享
                               （参考已有 DataConverter.ts）
```

---

## 二、消费的架构能力

| 设施 | 用法 | 来源 |
|---|---|---|
| `FileService.readFile(path)` | 读文件内容 → Monaco setValue() | E2c #13 |
| `FileService.writeFile(path, text)` | Ctrl+S 保存 | E2c #13 |
| `FileService.readBinaryFile(path)` | 🔥 读二进制 → EncodingService.detect() → decode | E2c #13 |
| `FileAssociationService.registerFileAssociation()` | 注册 .json/.md/.txt/.ts/.tsx → 编辑器 | E2c #13a |
| E3a 多 WebView | Monaco 独立进程（重型库） | E3 |
| `DialogService.confirm()` | "文件已修改，是否保存？" | E2c #15 |
| `getAssetPath()` | Monaco worker 路径（打包后 file:// 协议） | E1 步 7 |
| E3b 主题引擎 | `theme:changed` IPC → Monaco 切换 vs/vs-dark | E3 |
| `FileDecorationRegistry` | 🔥 v2——标签页标题显示 M/A/D 装饰标记 | E3f #59b |
| `EncodingService` | 🔥 编码检测——在核心 `src/core/encoding/` | E4f #119 |
| `setDirty(tabId, bool)` | 🔥 壳已提供——编辑器调用，不新建命令 | useTabManager |

---

## 三、任务清单

### #118 Monaco React 包装（~90 行）

> 🔥🔥🔥 **Monaco worker 路径——Electron 下的已知坑。** Monaco 的 TS/JS/HTML/CSS/JSON 语言服务各需一个 Web Worker（`ts.worker.js`、`html.worker.js` 等）。在 `http://` dev 模式下 Vite 自动处理，但打包后 `file://` 协议 + 多 WebView 环境下 worker 加载会失败。
>
> **方案（v1）：**
> ```typescript
> // EditorView.tsx 中，Monaco 创建前配置 worker 路径：
> import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
> import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
> import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
>
> // 使用 Vite 的 ?worker 后缀让 Vite 处理 worker 打包
> (self as any).MonacoEnvironment = {
>   getWorker(_: string, label: string) {
>     if (label === 'json') return new jsonWorker();
>     if (label === 'typescript' || label === 'javascript') return new tsWorker();
>     return new editorWorker();
>   },
> };
> ```
>
> **为什么用 Vite `?worker` 后缀：** Vite 的 `?worker` import 会生成正确的 Worker URL——在 dev 模式下走 `http://`，在打包后走 `file://` 兼容路径。不需要手写 worker 路径拼接。`E1 步 7` 的 `getAssetPath()` 不适用于 Worker（Worker 需要同源 URL，`file://` 下的绝对路径不能跨目录创建 Worker）。

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

      // 2. 根据扩展名选语言——🔥 数据驱动，不硬编码 switch-case
      const language = LANGUAGE_MAP[getExtension(filePath)] ?? 'plaintext';
      // LANGUAGE_MAP 定义在 language-map.ts（独立文件——换映射不改 EditorView 源码）

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

### #119 编码检测/切换（~70 行）

> 🔥🔥🔥 **EncodingService 不在 editor 插件里——它在 `src/core/encoding/` 中。**
> 原因：文件搜索（E4d #109）也需要编码检测。EncodingService 在 editor 插件里 → file-tree 要么 import editor（破坏圆形大厅），要么复制代码（归一化灾难）。
>
> **位置：`src/core/encoding/EncodingService.ts`**——已有 `DataConverter.ts`（GBK/UTF-8 底层转换），EncodingService 在此基础上加检测层。

```typescript
// src/core/encoding/EncodingService.ts
// 🔥 对标 VS Code——IconvLite + BOM 检测
// 🔥 在核心——file-tree（搜索）和 editor 都 import 同一份

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

  // 🔥 状态栏编码切换：由 editor 插件注册 StatusBarItem——不在 EncodingService 中。
  // EncodingService 是纯逻辑，不涉 UI。
}

// editor 插件消费（EditorView.tsx）：
import { EncodingService } from '@src/core/encoding/EncodingService';
// file-tree 搜索消费（FileSearcher.ts）：
import { EncodingService } from '@src/core/encoding/EncodingService';
// 🔥 同一个 import，同一份代码——不重复定义。
```

**🔥 配置项：** `files.encoding` 在 editor 插件的 `plugin.json` 中声明——编码切换 UI 在 editor 里。搜索通过 `ConfigurationService.get("files.encoding")` 读默认编码。

**🔥 核心准入检查：** EncodingService 放在核心是否满足三条规则？
1. 多提供方？不——只有一个提供方（EncodingService 自己）
2. **多消费方？是**——file-tree 搜索 + editor EditorView（≥2）
3. 桌子不知道内容？是——EncodingService 不知道谁在调用它

满足第 2-3 条 → 准入。但不是注册中心模式（不满足"多提供方"）→ 用简单的静态 class，不用 Registry 模式。

### #120 JSON schema 自动补全（~30 行）

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

### #121 多标签页 + dirty + Ctrl+Shift+T（~20 行）

```typescript
// editor multi-tab support (壳级功能，编辑器消费)
// 1. 多标签页——每个打开的文件是一个标签页
//    走壳的 tabActions.createTab("monaco-editor", { filePath })
//    tabBehavior.singleton = false（允许多个编辑器标签页同时存在）

// 2. dirty 管理——🔥 壳已提供 setDirty(tabId, bool)——编辑器只调用，不发明新机制
//    对标 VS Code editorGroupModel dirty state
//    编辑器修改后 → useTabManager().setDirty(tabId, true)
//      → TabBar 自动在标签页标题显示 ●（已在 TabBar.tsx:333 实现）
//    编辑器保存后 → useTabManager().setDirty(tabId, false)
//      → TabBar 自动移除 ●
//    关闭标签页时 → useTabManager 内部检查 tab.dirty → 触发 DialogService.confirm
//      → 已在 useTabManager.ts:312 实现（reduceCloseTab 返回 { closed: false, reason: "dirty" }）
//
//    🔥 不创建 executeCommand('workbench.action.updateTabLabel')——壳已有 updateTabLabelBySourceId() API。
//    编辑器用 useTabManager hook 的 setDirty 即可——不发明新命令、不新建通信路径。

// 3. Ctrl+Shift+T Reopen Closed Tab
//    对标 VS Code workbench.action.reopenClosedEditor
// 🔥 前置依赖：useTabManager 目前无 closedTabStack。
//    E4 施工前需加 ~10 行到 useTabManager.ts：
//      const _closedTabStack: Tab[] = [];
//      case 'closeTab': _closedTabStack.push(tab);  // 关闭时压栈
//      case 'reopenClosedTab': const last = _closedTabStack.pop();  // Ctrl+Shift+T 弹栈
//    编辑器本身不实现——它只是被"重新创建"
```

**🔥 配置项（editor 插件的 plugin.json）：**
```json
// editor 插件负责声明 files.encoding 和 files.autoSave——与 E4e #115 协调
{
  "configuration": {
    "title": "文本编辑器",
    "properties": {
      "files.encoding": {
        "type": "string", "default": "utf8",
        "enum": ["utf8", "utf8bom", "utf16le", "utf16be", "gbk", "shiftjis"],
        "description": "默认文件编码"
      },
      "files.autoSave": {
        "type": "string", "enum": ["off", "afterDelay", "onFocusChange", "onWindowChange"],
        "default": "off", "description": "自动保存"
      },
      "files.autoSaveDelay": {
        "type": "number", "default": 1000, "description": "自动保存延迟（毫秒）"
      }
    }
  }
}
```

---

## 四、汇总

| # | 任务 | 标杆 | 行数 |
|:--:|------|:--:|:--:|
| #118 | Monaco React 包装——创建/复用编辑器 + Ctrl+S + **language-map 数据驱动** | VS Code editor | ~90 |
| #119 | EncodingService——**在核心 `src/core/encoding/`**，file-tree+editor 共享 | VS Code encoding | ~70 |
| #120 | JSON schema 自动补全——settings.json / keybindings.json | VS Code JSON language | ~30 |
| #121 | 多标签页 + **setDirty(tabId)** 现有 API + files.encoding/files.autoSave 配置 | VS Code editorGroupModel | ~25 |
| **合计** | | | **~215 行** |

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
