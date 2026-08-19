/**
 * E4V#40f EditorTab——文件打开/保存接线。
 *
 * 这是"编辑器标签页"的 React 组件——index.tsx 中收到 sourceId（filePath）后渲染它。
 *
 * 职责：
 *   - mount 时 EditorModel.load(filePath) → 得到 model
 *   - 渲染 EditorView——传入 value/language/filePath/isActive
 *   - onChange → model.setValue → 检测脏状态 → 更新标签栏标题（● 前缀）
 *   - Ctrl+S → onSave → model.save() → markSaved → 清除 ●
 *   - 保存失败 toast 报错（只读/权限不足/磁盘满）
 *   - E4V#40j——渲染 EditorStatusBar（行:列/编码/语言/缩进/EOL）
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { EditorModel } from "../services/EditorModel";
import EditorView from "../views/EditorView";
import type { EditorViewHandle } from "../views/EditorView";
import EditorStatusBar from "./EditorStatusBar";
import type { EditorStatus } from "./EditorStatusBar";
import EditorBreadcrumb from "./EditorBreadcrumb";
import { trackDirtyFile, clearDirtyFile, loadBackup, scheduleClearOnUnmount, cancelPendingClear } from "../services/hot-exit";

const lk = window.linkdesk;

/**
 * E4V#40q——从 ConfigurationService 读取编辑器配置，构建 Monaco IEditorOptions。
 * 配置键（editor.fontSize 等）→ Monaco 选项（fontSize 等）。
 * 嵌套键（editor.minimap.enabled）→ 嵌套对象（minimap: { enabled }）。
 */
async function buildMonacoOptions(): Promise<Record<string, unknown>> {
  const [
    fontSize, fontFamily, fontWeight, lineHeight, tabSize, insertSpaces, detectIndentation,
    wordWrap, lineNumbers, minimapEnabled, renderWhitespace, cursorStyle, cursorBlinking,
    mouseWheelZoom, smoothScrolling, autoClosingBrackets, bracketPairColorization,
    guidesIndentation, linkedEditing, occurrencesHighlight, selectionHighlight,
    parameterHintsEnabled, quickSuggestions, showWords, showSnippets,
  ] = await Promise.all([
    lk.configuration.get("editor.fontSize"),
    lk.configuration.get("editor.fontFamily"),
    lk.configuration.get("editor.fontWeight"),
    lk.configuration.get("editor.lineHeight"),
    lk.configuration.get("editor.tabSize"),
    lk.configuration.get("editor.insertSpaces"),
    lk.configuration.get("editor.detectIndentation"),
    lk.configuration.get("editor.wordWrap"),
    lk.configuration.get("editor.lineNumbers"),
    lk.configuration.get("editor.minimap.enabled"),
    lk.configuration.get("editor.renderWhitespace"),
    lk.configuration.get("editor.cursorStyle"),
    lk.configuration.get("editor.cursorBlinking"),
    lk.configuration.get("editor.mouseWheelZoom"),
    lk.configuration.get("editor.smoothScrolling"),
    lk.configuration.get("editor.autoClosingBrackets"),
    lk.configuration.get("editor.bracketPairColorization"),
    lk.configuration.get("editor.guides.indentation"),
    lk.configuration.get("editor.linkedEditing"),
    lk.configuration.get("editor.occurrencesHighlight"),
    lk.configuration.get("editor.selectionHighlight"),
    lk.configuration.get("editor.parameterHints.enabled"),
    lk.configuration.get("editor.quickSuggestions"),
    lk.configuration.get("editor.suggest.showWords"),
    lk.configuration.get("editor.suggest.showSnippets"),
  ]);
  return {
    theme: document.documentElement.getAttribute("data-theme") === "dark" ? "vs-dark" : "vs",
    fontSize, fontFamily, fontWeight, lineHeight, tabSize, insertSpaces, detectIndentation,
    wordWrap, lineNumbers, minimap: { enabled: minimapEnabled }, renderWhitespace, cursorStyle, cursorBlinking,
    mouseWheelZoom, smoothScrolling, autoClosingBrackets, bracketPairColorization,
    guides: { indentation: guidesIndentation }, linkedEditing, occurrencesHighlight, selectionHighlight,
    parameterHints: { enabled: parameterHintsEnabled }, quickSuggestions,
    suggest: { showWords, showSnippets },
  };
}

export interface EditorTabProps {
  /** 文件绝对路径——来自 createTab 的 sourceId */
  filePath: string;
  /** 标签页是否活跃 */
  isActive: boolean;
  /** E5.7 fix（2026-08-16）：池标签页 ID——tab:focusRequested 点击聚焦订阅的匹配键 */
  tabId?: string;
}

const EditorTab: React.FC<EditorTabProps> = ({ filePath, isActive, tabId }) => {
  const { t } = useTranslation();
  const tabs = window.linkdesk?.tabs;
  const [model, setModel] = useState<EditorModel | null>(null);
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  // E5#52：baseLabel 只算一次——脏/净切换只加减 ●，不重新取 baseName
  const baseLabelRef = useRef(lk.path.normalize(filePath).split("/").pop() || filePath);
  // E5.8#25.3：初始路径冻结——load 只跑一次。改名后 filePath prop 变（壳 sourceId 迁移），
  // 冻结避免重载丢 dirty/undo（新路径文件是 rename 结果，model 内容即真相，无需重读磁盘）。
  const initialFilePathRef = useRef(filePath);
  // E5.8#25.3：当前运行路径——由 file:renamed 事件迁移（对标串口会话改名即时联动）。
  // 渲染/保存/监听/热备份都以它为运行路径；filePath prop 仅作初始值 + 订阅匹配键。
  const [currentPath, setCurrentPath] = useState(filePath);
  // E4V#40o——自动保存计时器
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // E4V#40o——onFocusChange 需要前一帧 isActive 判断切换方向
  const prevActiveRef = useRef(isActive);
  // E4V#40q——EditorView ref → 运行时 updateOptions
  const editorViewRef = useRef<EditorViewHandle>(null);
  // E4V#40q——编辑器选项状态（异步加载配置）
  const [editorOptions, setEditorOptions] = useState<Record<string, unknown>>();

  // E4V#40q——加载编辑器配置 + 初始 apply（修复异步加载后 editor 未更新）
  useEffect(() => {
    buildMonacoOptions().then((opts) => {
      setEditorOptions(opts);
      // 🔴 初始 load 完成——主动推给已创建的 editor 实例
      // editor 创建时 options={undefined}，之后 useState 更新不触发 editor 重建
      editorViewRef.current?.updateOptions(opts);
    });
  }, []);

  // E4V#40j——编辑器状态栏数据
  const [editorStatus, setEditorStatus] = useState<EditorStatus>({
    lineNumber: 1,
    column: 1,
    encoding: "",
    language: "",
    tabSize: 2,
    insertSpaces: true,
    eol: "LF",
  });

  const handleCursorChange = useCallback((lineNumber: number, column: number) => {
    setEditorStatus((prev) => ({ ...prev, lineNumber, column }));
  }, []);

  const handleEditorMount = useCallback(
    (opts: { tabSize: number; insertSpaces: boolean; eol: string }) => {
      setEditorStatus((prev) => ({
        ...prev,
        tabSize: opts.tabSize,
        insertSpaces: opts.insertSpaces,
        eol: opts.eol as "LF" | "CRLF",
      }));
    },
    [],
  );

  // E5.8#0d.9——缓冲区转"干净"的公共清理：保存成功 / 外部重载两条路径共用（归一化，防两处漂移）
  const markClean = useCallback(() => {
    dirtyRef.current = false;
    clearDirtyFile(currentPath);
    tabs?.updateLabelBySourceId?.(currentPath, baseLabelRef.current);
  }, [currentPath, tabs]);

  // 保存——放前面，autoSave 逻辑引用它
  const handleSave = useCallback(async () => {
    if (!model) return;
    try {
      await model.save();
      model.markSaved();
      markClean();
    } catch (err) {
      console.error(`[EditorTab] 保存失败: ${currentPath}`, err);
      setError(`${t("保存失败：")} ${(err as Error).message}`);
    }
  }, [model, currentPath, t, markClean]);

  // 加载文件
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // E5.7#38——取消未决 unmount 清理（跨组移动/StrictMode 的 remount 路径）
    cancelPendingClear(initialFilePathRef.current);

    (async () => {
      // E5.7#38——Hot Exit：崩溃重建/跨组移动后优先恢复备份内容（只读——重复读安全）
      const backupContent = await loadBackup(initialFilePathRef.current);
      if (cancelled) return;

      if (backupContent !== null) {
        // 从磁盘正常加载（取编码/语言），但内容用备份
        try {
          const m = await EditorModel.load(initialFilePathRef.current);
          if (cancelled) return;
          m.setValue(backupContent);
          setModel(m);
          setValue(backupContent);
          setEditorStatus((prev) => ({
            ...prev,
            encoding: m.encoding,
            language: m.language,
          }));
          // 标记为脏——备份内容未保存
          dirtyRef.current = true;
          tabs?.updateLabelBySourceId?.(initialFilePathRef.current, `● ${baseLabelRef.current}`);
          trackDirtyFile(initialFilePathRef.current, backupContent);
          setLoading(false);
        } catch {
          if (cancelled) return;
          // 从磁盘加载失败→只用备份内容
          const fallback = EditorModel.fromContent(initialFilePathRef.current, backupContent);
          setModel(fallback);
          setValue(backupContent);
          setEditorStatus((prev) => ({
            ...prev,
            encoding: fallback.encoding,
            language: fallback.language,
          }));
          dirtyRef.current = true;
          tabs?.updateLabelBySourceId?.(initialFilePathRef.current, `● ${baseLabelRef.current}`);
          trackDirtyFile(initialFilePathRef.current, backupContent);
          setLoading(false);
        }
      } else {
        try {
          const m = await EditorModel.load(initialFilePathRef.current);
          if (cancelled) return;
          setModel(m);
          setValue(m.getValue());
          setEditorStatus((prev) => ({
            ...prev,
            encoding: m.encoding,
            language: m.language,
          }));
          setLoading(false);
        } catch (err) {
          if (cancelled) return;
          console.error(`[EditorTab] 加载失败: ${initialFilePathRef.current}`, err);
          setError(`${t("无法打开文件")}: ${(err as Error).message}`);
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
    // E5.7#99：per-tab 一次性加载管线（初始路径冻结）；E5.8#25.3：改名后 prop 变化——ref 冻结避免重载丢 dirty/undo
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 路径入 deps 会改名时重载文件 → 新建 model 丢 undo/光标
  }, []);

  // E5.7#38——标签关闭 = unmount：脏文件延迟清备份（关闭即弃语义）；跨组移动/StrictMode 的
  // remount 在 mount 侧 cancelPendingClear 取消。池崩 = 进程死亡，此清理不执行 → 备份存活。
  useEffect(() => {
    return () => {
      if (model?.isDirty()) scheduleClearOnUnmount(currentPath);
    };
  }, [model, currentPath]);

  // ── E5.8#25.3：文件重命名/移动联动——路径迁移（内容保留，dirty ● 保留）──
  // 对标串口会话改名即时联动。事件源 = 文件树 emit file:renamed（池 broadcast 直达本 WCV，
  // 与壳 #25.1 桥同源；editor 是池插件，事件同进程直收，零 IPC 中转）。迁移四件事：
  //   EditorModel 路径（内容不动→dirty 保留）/ baseLabel / hot-exit 备份 key / 壳标签 ●。
  // 幂等（同路径 no-op）——壳 sourceId 迁移与池事件可能先后抵达同一目标路径。
  const applyRename = useCallback((newPath: string) => {
    const normalized = lk.path.normalize(newPath);
    if (normalized === currentPath) return;
    model?.setFilePath(normalized);
    baseLabelRef.current = normalized.split("/").pop() || normalized;
    if (model?.isDirty()) {
      // 热备份 key 迁移——删旧 key，重挂新 key（内容不丢；改名后保存即写新路径）
      const content = model.getValue();
      clearDirtyFile(currentPath);
      trackDirtyFile(normalized, content);
    }
    // 壳标签栏——新 sourceId 已由壳 TabManager 迁移（但其 label 不带 ●），此处重挂保留脏前缀
    const label = dirtyRef.current ? `● ${baseLabelRef.current}` : baseLabelRef.current;
    tabs?.updateLabelBySourceId?.(normalized, label);
    // 状态栏语言随新扩展名刷新（.txt→.ts 显示即切换）
    setEditorStatus((prev) => ({ ...prev, language: model?.language ?? prev.language }));
    setCurrentPath(normalized);
  }, [model, currentPath, tabs]);

  // 池事件主路径——改名即时到达（文件树与编辑器同 WCV，事件同进程广播）
  useEffect(() => {
    return lk.events.on<{ oldPath: string; newPath: string }>("file:renamed", (e) => {
      const oldPath = e?.oldPath;
      const newPath = e?.newPath;
      if (typeof oldPath !== "string" || typeof newPath !== "string") return;
      if (lk.path.normalize(oldPath) !== lk.path.normalize(currentPath)) return;
      applyRename(newPath);
    });
  }, [currentPath, applyRename]);

  // E5.8#0d.9——外部文件变更自动重载（对标 VS Code "file changed on disk"）。
  // 监听父目录（Windows 原子替换/重命名下文件级监听不可靠）→ 200ms 防抖（避开写入中间态半读）
  // → reloadFromDisk 内容比较三态：无差异=no-op（自己 Ctrl+S 经此自然过滤）/
  //   干净=自动重载 / 脏=弹 confirm 由用户决定（取消保留未保存改动）。
  // 删除事件跳过——保存会重建文件。
  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    const applyReload = async () => {
      if (cancelled) return;
      const fresh = await model.reloadFromDisk();
      if (cancelled || fresh === null) return; // 无差异（含自己保存）或读失败——不动
      if (model.isDirty()) {
        const ok = await lk.dialog.confirm(
          t("文件已在外部被修改，重新加载将丢失未保存的更改。重新加载？"),
        );
        if (cancelled || !ok) return; // 取消 → 保留未保存改动
      }
      // 应用重载——顺序：EditorModel 先于 Monaco（Monaco onChange 回链时内容已同步 → 不误标脏）
      model.setValue(fresh);
      model.markSaved();
      markClean();
      setValue(fresh);
      editorViewRef.current?.setValue(fresh);
    };

    lk.filesystem
      .watch(lk.path.dirname(currentPath), (e) => {
        if (cancelled || e.type === "deleted") return;
        if (lk.path.normalize(e.path) !== lk.path.normalize(currentPath)) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(applyReload, 200);
      })
      .then((unsub) => {
        if (cancelled) { unsub(); return; }
        unsubscribe = unsub;
      })
      .catch((err) => console.warn(`[EditorTab] 监听目录失败: ${lk.path.dirname(currentPath)}`, err));

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe?.();
    };
    // E5.8#0d.9：per-file watcher——model 就绪后挂；t 入 deps 保证 confirm 文案语言新鲜（语言切换重挂 watcher 无害）；
    // E5.8#25.3：currentPath 入 deps——改名后重挂新目录监听（旧目录 watcher 随清理摘除）
  }, [currentPath, model, t, markClean]);

  // E4V#40o——onFocusChange 自动保存：切走标签页时自动保存
  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = isActive;
    lk.configuration.get("files.autoSave").then((autoSave) => {
      if ((autoSave ?? "off") === "onFocusChange" && wasActive && !isActive && model && model.isDirty()) {
        handleSave();
      }
    });
  }, [isActive, model, handleSave]);

  // E5.7 fix（2026-08-16）：tab:focusRequested——点击标签页时该编辑器获焦（VS Code 语义）。
  // 点已激活标签不翻转 isActive → EditorView 激活 focus effect 不触发 → 分屏下焦点留在
  // 另一组编辑器，Ctrl+S（Monaco 局部键位）打到错实例——保存错文件。事件源 =
  // GroupTabBar onClick（池内事件，直达本 WCV）。点未激活标签时事件早到（display:none
  // 中 focus 无害 no-op），随后 isActive 翻转的 effect 兜底。
  useEffect(() => {
    if (!tabId) return;
    return lk.events.on<{ tabId: string }>("tab:focusRequested", ({ tabId: id }) => {
      if (id !== tabId) return;
      editorViewRef.current?.focus();
    });
  }, [tabId]);

  // 内容变更
  const handleChange = useCallback(async (newValue: string | undefined) => {
    const v = newValue ?? "";
    setValue(v);
    model?.setValue(v);
    const isDirty = model?.isDirty() ?? false;
    if (dirtyRef.current !== isDirty) {
      dirtyRef.current = isDirty;
      // E5#52：只加减 ●，不重取 baseName——保留标签页去歧义后缀
      const label = isDirty ? `● ${baseLabelRef.current}` : baseLabelRef.current;
      tabs?.updateLabelBySourceId?.(currentPath, label);
    }
    // E4V#40n——Hot Exit：每次内容变更都更新备份，不在上面的状态守卫里（否则只保存第一次按键的内容）
    if (isDirty) {
      trackDirtyFile(currentPath, v);
    }
    // E4V#40o——afterDelay 自动保存：每次变更重置 1s 计时器
    const autoSave = await lk.configuration.get("files.autoSave") ?? "off";
    if (autoSave === "afterDelay") {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        handleSave();
      }, 1000);
    }
  }, [model, currentPath, tabs, handleSave]);

  // E4V#40o——卸载时清理自动保存计时器
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // E4V#40q——订阅配置变更 → 运行时 updateOptions，无需重建 editor
  useEffect(() => {
    const unsubscribe = lk.configuration.onChange("", async () => {
      const opts = await buildMonacoOptions();
      editorViewRef.current?.updateOptions(opts);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return <div className="editor-loading">{t("加载中…")}</div>;
  }

  if (error) {
    return <div className="editor-error">{error}</div>;
  }

  if (!model) {
    return <div className="editor-empty">{t("无法打开文件")}</div>;
  }

  // E4V#40q——编辑器选项（异步加载自 lk.configuration）

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <EditorBreadcrumb filePath={model.filePath} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <EditorView
          ref={editorViewRef}
          value={value}
          language={model.language}
          filePath={model.filePath}
          isActive={isActive}
          onChange={handleChange}
          onSave={handleSave}
          onCursorChange={handleCursorChange}
          onEditorMount={handleEditorMount}
          options={editorOptions}
        />
      </div>
      <EditorStatusBar {...editorStatus} />
    </div>
  );
};

export default EditorTab;
