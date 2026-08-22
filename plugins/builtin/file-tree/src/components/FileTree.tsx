/**
 * FileTree——虚拟滚动文件树组件。
 * E4a #89：对标 VS Code AsyncDataTree + explorerViewer。
 */

import React, { useState, useRef, useCallback, useEffect, useMemo, useImperativeHandle, forwardRef } from "react";
import FileTreeNode from "./FileTreeNode";
import type { ExplorerItem } from "../services/FileTreeModel";
import type { FileTreeModel } from "../services/FileTreeModel";
import { TREE_ITEM_HEIGHT, OVERSCAN } from "../utils/layoutTokens";
import { useFileTreeKeyboard } from "../services/FileTreeKeyboard";
import type { FlatItem } from "../services/FileTreeKeyboard";
import { useFileTreeDnD } from "../services/FileTreeDnD";

import { fileTreeClipboard } from "../services/FileTreeClipboard";

const lk = window.linkdesk;

/** E4V#34b: explorer.compactFolders 配置缓存——flattenTree 在 useMemo 中同步读取 */
let _compactFolders = true;
const compactFoldersRef = { get current() { return _compactFolders; } };

/** 从 lk.configuration 加载 compactFolders 并订阅变更 */
async function loadCompactFolders(): Promise<void> {
  _compactFolders = await lk.configuration.get("explorer.compactFolders") ?? true;
}

/* ── 类型 ── */

/** 🔥 command handler 通过此接口查询 FileTree 实时状态——一个桥接点替代多个模块级变量 */
export interface FileTreeHandle {
  getSelection(): string[];
  getFocusedUri(): string | null;
  getModel(): FileTreeModel;
  rerender(): void;
  /** E4V#27: 对 focused item 启动行内重命名 */
  startRename(): void;
  /** E4V#30: 定位文件——展开目录链 + 选中 + 滚动到可见位置 */
  reveal(uri: string): Promise<void>;
}

interface FileTreeProps {
  model: FileTreeModel;
  onOpenFile: (item: ExplorerItem, mode: "preview" | "pin") => void;
  onContextMenu?: (item: ExplorerItem, event: React.MouseEvent) => void;
}

/* ── 工具 ── */

function flattenTree(model: FileTreeModel): FlatItem[] {
  const result: FlatItem[] = [];
  // E4V#34b: explorer.compactFolders 配置开关
  const compactFolders = compactFoldersRef.current;
  function walk(item: ExplorerItem, depth: number, guide: boolean) {
    if (item.isDirectory && compactFolders) {
      const compacted = model.compactController.getCompactedSegments(item);
      if (compacted) {
        const leaf = findLeaf(item);
        const currentLeaf = leaf ? (model.findClosest(leaf.uri) ?? leaf) : null;
        const twistieItem = (currentLeaf && !currentLeaf.isDirectory && currentLeaf.parent)
          ? currentLeaf.parent : currentLeaf;
        const shouldUnfold = twistieItem?.isDirectory === true
          && model.isExpanded(twistieItem.uri) && twistieItem.children !== null;
        if (!shouldUnfold) {
          result.push({ item: twistieItem ?? item, depth, compactedSegments: compacted, guide });
          return;
        }
      }
    }
    result.push({ item, depth, guide });
    if (model.isExpanded(item.uri) && item.children !== null) {
      const len = item.children.length;
      for (let i = 0; i < len; i++) walk(item.children[i], depth + 1, i < len - 1);
    }
  }
  const roots = model.roots;
  for (let i = 0; i < roots.length; i++) walk(roots[i], 1, i < roots.length - 1);
  return result;
}

function findLeaf(item: ExplorerItem): ExplorerItem | null {
  if (!item.isDirectory || item.children === null || item.children.length !== 1) return item;
  const child = item.children[0];
  if (!child.isDirectory) return child;
  return findLeaf(child);
}

/* ── E4V#35d 归一化：工作区激活——所有交互入口走此函数 ── */

/** 点击任意节点→激活所属工作区根。handleSelect / handleContextMenu / 键盘等入口统一调用。 */
async function activateWorkspaceForUri(model: FileTreeModel, uri: string): Promise<void> {
  const root = model.findClosestRoot(uri);
  if (root) {
    const active = await lk.workspace.getActive();
    if (root.uri !== active) {
      lk.workspace.setActive(root.uri);
    }
  }
}

/* ── 组件 ── */

const FileTree = forwardRef<FileTreeHandle, FileTreeProps>(function FileTree(
  { model, onOpenFile, onContextMenu }, ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRef = useRef(0);
  const [containerHeight, setContainerHeight] = useState(0);
  /** E4V#21: 多选——Set<string> 替代 selectedUri 单选 */
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [lastClickedUri, setLastClickedUri] = useState<string | null>(null);
  const [focusedUri, setFocusedUri] = useState<string | null>(null);

  /** E4V#22: ref 桥接——handleSelect 读最新 flatItems/lastClickedUri 做范围选中，回调保持 [] deps 稳定 */
  const flatItemsRef = useRef<FlatItem[]>([]);
  const lastClickedUriRef = useRef<string | null>(null);

  /** E4V#21: 键盘/单击→单选（清 Set + 加一项）——键盘回调签名不变 */
  const selectSingle = useCallback((uri: string) => {
    setSelection(new Set([uri]));
    setLastClickedUri(uri);
  }, []);
  // E4V#22: 同步 lastClickedUri ref——handleSelect 读最新值，保持 [] deps 稳定
  lastClickedUriRef.current = lastClickedUri;
  const [version, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);
  /** E4V#35e: 活跃工作区——根节点 accent 色加粗 */
  const [activeWorkspaceUri, setActiveWorkspaceUri] = useState<string>("");
  useEffect(() => { lk.workspace.getActive().then((v: string | undefined) => { if (v) setActiveWorkspaceUri(v); }); }, []);
  useEffect(() => {
    return lk.workspace.onDidChangeActiveWorkspace((uri: string | null) => { setActiveWorkspaceUri(uri ?? ""); rerender(); });
  }, [rerender]);

  // E4V#34b: 加载 explorer.compactFolders 配置并订阅变更
  useEffect(() => {
    loadCompactFolders().then(rerender);
    return lk.configuration.onChange("explorer.compactFolders", (v: boolean) => {
      _compactFolders = v ?? true;
      rerender();
    });
  }, [rerender]); // rerender 稳定（useCallback []）——零重跑，满足规则

  /** E4V#27: 行内重命名——F2 或右键重命名 */
  const [renamingUri, setRenamingUri] = useState<string | null>(null);
  /** E5: 点击目录行是否 toggle 展开/折叠——默认 false，仅 twistie 管展开折叠 */
  const [expandOnClick, setExpandOnClick] = useState(false);
  useEffect(() => {
    const cfg = window.linkdesk?.configuration;
    if (!cfg) return;
    cfg.get("explorer.expandOnClick").then((v: unknown) => setExpandOnClick(Boolean(v)));
    return cfg.onChange("explorer.expandOnClick", (v: unknown) => setExpandOnClick(Boolean(v)));
  }, []);
  const startRename = useCallback(() => {
    const target = selection.size > 0 ? [...selection][0] : focusedUri;
    if (!target) return;
    setRenamingUri(target);
    setFocusedUri(target);
    setSelection(new Set([target]));
    // 🔥 屏蔽全局快捷键——防止 KeybindingRegistry 抢 Enter/Escape
    lk.keybindings.setKeybindingCaptureActive(true);
    window.linkdesk?.contextKey?.set("inputFocus", true);
  }, [selection, focusedUri]);
  /** 🔥 rename 退出归一出口——finish/cancel/blur 三条路径走同一个 */
  const exitRename = useCallback(() => {
    lk.keybindings.setKeybindingCaptureActive(false);
    window.linkdesk?.contextKey?.set("inputFocus", false);
    // defer focus: 等 React 卸载 input 后再聚焦→不触发 input onBlur
    requestAnimationFrame(() => containerRef.current?.focus());
  }, []);

  const finishRename = useCallback(async (uri: string, newName: string) => {
    setRenamingUri(null);
    exitRename();
    if (!newName || newName === uri.split("/").pop()) return;
    const dir = uri.substring(0, uri.lastIndexOf("/"));
    const dest = dir + "/" + newName;
    // E5.8#25.2：原生原子重命名（替代 copy+remove 模拟——非原子 + 大文件全量复制慢）
    await lk.filesystem.rename(uri, dest);
    lk.events.emit("file:renamed", { oldPath: uri, newPath: dest });
    await model.refresh(dir);
    const parent = model.findClosest(dir);
    if (parent && model.isExpanded(parent.uri)) await model.getChildren(parent).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
  }, [model, exitRename]);
  const cancelRename = useCallback(() => {
    setRenamingUri(null);
    exitRename();
  }, [exitRename]);

  // 组件卸载时若仍在 rename→清理
  useEffect(() => () => { if (renamingUri !== null) exitRename(); }, [renamingUri, exitRename]);

  /* ── 🔥 归一化桥接：一个 ref 暴露全部实时状态——替代多个模块级变量 ── */
  const [revealTarget, setRevealTarget] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    getSelection: () => Array.from(selection),
    getFocusedUri: () => focusedUri,
    getModel: () => model,
    rerender: () => rerender(),
    startRename,
    reveal: async (uri: string) => {
      const item = await model.findAndExpandToBypassExclude(uri);
      if (!item) return;
      // 选中 + 聚焦目标
      setSelection(new Set([uri]));
      setFocusedUri(uri);
      setRevealTarget(uri);
      // rerender 后 scroll——useEffect 监测 revealTarget 变化后执行
      rerender();
    },
  }), [selection, focusedUri, model, rerender, startRename]);

  /* ── ResizeObserver ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => { setContainerHeight(entries[0].contentRect.height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── 模型变更 → 重渲染 ── */
  useEffect(() => {
    return model.onDidChange.event(() => { rerender(); });
  }, [model, rerender]);

  /* ── E4V#30: reveal 滚动——revealTarget 变更后等 React 渲染完再 scroll ── */
  useEffect(() => {
    if (!revealTarget) return;
    const timer = requestAnimationFrame(() => {
      const items = flatItemsRef.current;
      const idx = items.findIndex((f) => f.item.uri === revealTarget);
      if (idx === -1) { setRevealTarget(null); return; }
      const scrollEl = scrollElRef.current;
      if (!scrollEl) { setRevealTarget(null); return; }
      const itemTop = idx * TREE_ITEM_HEIGHT;
      const viewHalf = scrollEl.clientHeight / 2;
      // 居中显示——上限不超过 totalHeight（防空白）
      const target = Math.max(0, itemTop - viewHalf + TREE_ITEM_HEIGHT / 2);
      scrollEl.scrollTop = target;
      setRevealTarget(null);
    });
    return () => cancelAnimationFrame(timer);
  }, [revealTarget]);
  /** 🔥 剪切中 URI 集合——render body 直读，FoldersView.rerender 驱动刷新 */
  const cutUris = fileTreeClipboard.isCut ? new Set(fileTreeClipboard.uris) : new Set<string>();
  const flatItems = useMemo(() => { void (version); return flattenTree(model); }, [model, version]);
  flatItemsRef.current = flatItems; // E4V#22: handleSelect 通过 ref 读最新 flatItems
  const startIndex = Math.max(0, Math.floor(scrollTop / TREE_ITEM_HEIGHT) - OVERSCAN);
  const visibleCount = containerHeight > 0 ? Math.ceil(containerHeight / TREE_ITEM_HEIGHT) + 2 * OVERSCAN : 50;
  const endIndex = Math.min(flatItems.length, startIndex + visibleCount);
  const totalHeight = flatItems.length * TREE_ITEM_HEIGHT;
  const renderedItems = useMemo(() => flatItems.slice(startIndex, endIndex), [flatItems, startIndex, endIndex]);

  /* ── 滚动检测——.side-panel-content 是实际滚动容器 ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let scrollEl: HTMLElement | null = el.parentElement;
    while (scrollEl) {
      if (/(auto|scroll)/.test(window.getComputedStyle(scrollEl).overflowY)) break;
      scrollEl = scrollEl.parentElement;
    }
    if (!scrollEl) return;
    scrollElRef.current = scrollEl; // E4V#30: reveal 用它定位滚动
    scrollTopRef.current = scrollEl.scrollTop;
    setScrollTop(scrollEl.scrollTop);
    const handler = () => { scrollTopRef.current = scrollEl.scrollTop; setScrollTop(scrollEl.scrollTop); };
    scrollEl.addEventListener("scroll", handler, { passive: true });
    return () => {
      scrollEl!.removeEventListener("scroll", handler);
      scrollElRef.current = null;
    };
  }, []);

  /* ── twistie 展开/折叠 ── */
  const handleTwistie = useCallback(async (item: ExplorerItem) => {
    if (!item.isDirectory && item.children === null) return;
    if (model.isExpanded(item.uri)) {
      model.collapse(item.uri);
      model.compactController.collapseCompact(item.uri);
    } else {
      model.expand(item.uri);
      model.compactController.expandCompact(item.uri);
      try {
        await model.getChildren(item);
        // 🔥 递归展开单子目录链——一次点击展开整条 compact chain
        let next = item;
        while (next.children?.length === 1 && next.children[0].isDirectory) {
          const child = next.children[0];
          model.expand(child.uri);
          model.compactController.expandCompact(child.uri);
          await model.getChildren(child);
          next = child;
        }
      } catch (e) { console.error("[file-tree] expand failed:", item.name, e); }
    }
  }, [model]);

  /* ── 选中 / 打开 / 右键 ── */
  /**
   * E4V#21: Ctrl/Meta+Click → toggle 单项进/出选中集合。
   * E4V#22: Shift+Click → 从 lastClickedUri 到当前项范围选中。
   * 普通 Click → 单选。
   * 🛡️ [] deps + ref 桥接——回调稳定，React.memo(FileTreeNode) 不重渲染。
   */
  const handleSelect = useCallback((uri: string, event: React.MouseEvent) => {
    // E4V#22: Shift+Click 范围选中
    if (event.shiftKey && lastClickedUriRef.current) {
      const items = flatItemsRef.current;
      const lastIdx = items.findIndex(f => f.item.uri === lastClickedUriRef.current);
      const currIdx = items.findIndex(f => f.item.uri === uri);
      if (lastIdx !== -1 && currIdx !== -1) {
        const [start, end] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
        setSelection(new Set(items.slice(start, end + 1).map(f => f.item.uri)));
        setFocusedUri(uri);
        // 🔥 Shift+Click 不更新 lastClickedUri——对标 VS Code 行为
        return;
      }
      // lastClickedUri 不在 flatItems 中（已折叠/删除）→ 退化为单选
    }

    // E4V#21: Ctrl/Meta+Click → toggle
    if (event.ctrlKey || event.metaKey) {
      setSelection((prev) => {
        const next = new Set(prev);
        if (next.has(uri)) { next.delete(uri); } else { next.add(uri); }
        return next;
      });
    } else {
      setSelection(new Set([uri]));
    }
    setFocusedUri(uri);
    setLastClickedUri(uri);
    activateWorkspaceForUri(model, uri);
  }, [model]);
  const handleOpen = useCallback((item: ExplorerItem, mode: "preview" | "pin") => { onOpenFile(item, mode); }, [onOpenFile]);
  /** E4V#21: 右键菜单前——右键项不在选中集合则自动切为单选（对标 VS Code）。
   *  🛡️ ref 桥接——避免 selection 进 useCallback deps 导致所有 React.memo 节点重渲染 */
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const handleContextMenu = useCallback((item: ExplorerItem, event: React.MouseEvent) => {
    if (!selectionRef.current.has(item.uri)) {
      setSelection(new Set([item.uri]));
    }
    activateWorkspaceForUri(model, item.uri);
    onContextMenu?.(item, event);
  }, [onContextMenu, model]);

  /* ── 键盘 / 拖放 ── */
  const rawKeyDown = useFileTreeKeyboard(
    { model, flatItems, focusedUri },
    { setFocusedUri, setSelectedUri: selectSingle, rerender, onOpenFile, onTwistie: handleTwistie, getContainerEl: () => containerRef.current },
  );

  /** E4V#23: Ctrl+A 全选——拦截后走 ref 读最新 flatItems，其余键委托给键盘 hook */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "a") {
      e.preventDefault();
      const items = flatItemsRef.current;
      if (items.length > 0) {
        setSelection(new Set(items.map(f => f.item.uri)));
      }
      return;
    }
    rawKeyDown(e);
  }, [rawKeyDown]);
  // E4V#34h2: OS 拖入文件后自动打开——回调传 (filePath, name)，构造最小 item 适配 onOpenFile
  const onAutoOpenDroppedFile = useCallback((filePath: string, name: string) => {
    onOpenFile({ uri: filePath, name, isDirectory: false, isSymlink: false, children: null, parent: null } as ExplorerItem, "preview");
  }, [onOpenFile]);

  const { dndState, handleDragStart, handleDragOver, handleDragLeave, handleDrop } = useFileTreeDnD({
    flatItems, model, rerender, getContainerEl: () => containerRef.current, onAutoOpenDroppedFile,
  });

  /* ── context keys ── */
  useEffect(() => {
    window.linkdesk?.contextKey?.set("explorerResourceCut", false);
    window.linkdesk?.contextKey?.set("explorerClipboardEmpty", true);
    window.linkdesk?.contextKey?.set("explorerResourceMoveableToTrash", navigator.platform.includes("Win"));
  }, []);
  const handleFocus = useCallback(() => { window.linkdesk?.contextKey?.set("explorerFocus", true); }, []);
  const handleBlur = useCallback(() => { window.linkdesk?.contextKey?.set("explorerFocus", false); }, []);
  useEffect(() => {
    if (focusedUri) {
      const fi = flatItems.find((f) => f.item.uri === focusedUri);
      window.linkdesk?.contextKey?.set("explorerItemIsFile", fi?.item.isDirectory === false);
      window.linkdesk?.contextKey?.set("explorerResourceReadonly", fi?.item.isReadonly === true);
      window.linkdesk?.contextKey?.set("explorerViewletCompressedFocus", (fi?.compactedSegments?.length ?? 0) > 0);
    } else {
      window.linkdesk?.contextKey?.set("explorerItemIsFile", false);
      window.linkdesk?.contextKey?.set("explorerResourceReadonly", false);
      window.linkdesk?.contextKey?.set("explorerViewletCompressedFocus", false);
    }
    window.linkdesk?.contextKey?.set("viewHasSomeCollapsibleItem", model.getExpandedUris().length > 0);
  }, [focusedUri, flatItems, model]);

  /** 点文件树空白处→清空选中（对标 VS Code）。节点 onClick 已 stopPropagation 不冒泡到这里 */
  const handleClearSelection = useCallback(() => setSelection(new Set()), []);

  /* ── 渲染 ── */
  return (
    <div ref={containerRef} tabIndex={0} onKeyDown={handleKeyDown}
      onFocus={handleFocus} onBlur={handleBlur}
      onClick={handleClearSelection}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      className="file-tree-scroll">
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ height: startIndex * TREE_ITEM_HEIGHT }} />
        {renderedItems.map(({ item, depth, compactedSegments, guide, isDimmed }, i) => (
          <FileTreeNode key={item.uri} item={item} decoration={item.decoration} depth={depth} indent={0}
            expanded={item.isDirectory && model.isExpanded(item.uri)}
            isSelected={selection.has(item.uri)} isFocused={item.uri === focusedUri}
            isDragSource={dndState.sourceUri === item.uri}
            isDragHover={dndState.hoverIndex === startIndex + i}
            isCut={cutUris.has(item.uri)}
            isRenaming={item.uri === renamingUri}
            isActiveRoot={item.parent === null && item.uri === activeWorkspaceUri}
            onRenameConfirm={finishRename}
            onRenameCancel={cancelRename}
            compactedSegments={compactedSegments} guide={guide} isDimmed={isDimmed}
            onDragStart={handleDragStart} onSelect={handleSelect} onOpen={handleOpen}
            onTwistieClick={handleTwistie} onContextMenu={handleContextMenu}
            expandOnClick={expandOnClick} />
        ))}
      </div>
    </div>
  );
});

export default FileTree;
