/**
 * 编辑器标签页的内容状态容器（E6#87c 拆自 EditorTab.tsx）——各管线 hook 共读共写这一份。
 */
import { useRef, useState } from "react";
import type { EditorModel } from "../../services/EditorModel";
import type { EditorTabState } from "./types";

const lk = window.linkdesk;

export function useEditorTabState(filePath: string): EditorTabState {
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

  return {
    model, setModel,
    value, setValue,
    loading, setLoading,
    error, setError,
    currentPath, setCurrentPath,
    dirtyRef, baseLabelRef, initialFilePathRef,
  };
}
