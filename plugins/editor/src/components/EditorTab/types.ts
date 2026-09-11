/**
 * EditorTab 的形状声明（E6#87c 拆自 EditorTab.tsx）。
 */
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { EditorModel } from "../../services/EditorModel";
import type { EditorStatus } from "../EditorStatusBar";

export interface EditorTabProps {
  /** 文件绝对路径——来自 createTab 的 sourceId */
  filePath: string;
  /** 标签页是否活跃 */
  isActive: boolean;
  /** E5.7 fix（2026-08-16）：池标签页 ID——tab:focusRequested 点击聚焦订阅的匹配键 */
  tabId?: string;
}

/** 状态栏补丁——接受部分字段或「拿旧值算新值」的函数形式（后者用于「新值缺失则保留旧值」） */
export type PatchStatus = (
  patch: Partial<EditorStatus> | ((prev: EditorStatus) => Partial<EditorStatus>),
) => void;

/**
 * 一个编辑器标签页的内容状态——拆出的各个管线 hook 共读共写这一份。
 * 属主单一是关键：`dirtyRef` / `baseLabelRef` / `initialFilePathRef` 若各 hook 各持一份，
 * 会出现「标签的 ● 前缀与实际脏状态脱节」。
 */
export interface EditorTabState {
  model: EditorModel | null;
  setModel: Dispatch<SetStateAction<EditorModel | null>>;
  value: string;
  setValue: Dispatch<SetStateAction<string>>;
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  /** 当前运行路径——由 file:renamed 迁移；渲染/保存/监听/热备份都以它为准 */
  currentPath: string;
  setCurrentPath: Dispatch<SetStateAction<string>>;
  dirtyRef: MutableRefObject<boolean>;
  baseLabelRef: MutableRefObject<string>;
  initialFilePathRef: MutableRefObject<string>;
}
