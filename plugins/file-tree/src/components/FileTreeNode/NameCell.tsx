/**
 * NameCell——文件名 / 行内重命名单元格（E6#87a 从 FileTreeNode.tsx 拆出）。
 */
import React from "react";
import { InlineInput } from "@linkdesk/ui"; // E6#15h：useClickPreview 收 @linkdesk/ui 零件（08-共享hook归位.md）
import type { ExplorerItem } from "../../services/FileTreeModel";

interface NameCellProps {
  item: ExplorerItem;
  isRenaming?: boolean;
  compactedSegments?: string[];
  onRenameConfirm?: (uri: string, newName: string) => void;
  onRenameCancel?: () => void;
}

/** E5#19a: 行内重命名——InlineInput 归一化；非重命名态走紧凑文件夹的分段渲染 */
export function NameCell({ item, isRenaming, compactedSegments, onRenameConfirm, onRenameCancel }: NameCellProps) {
  if (isRenaming) {
    return (
      <span
        style={{ marginLeft: "var(--tree-icon-gap)", flex: 1, maxWidth: 200 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <InlineInput
          size="compact"
          selectMode={item.isDirectory ? "all" : "nameOnly"}
          value={item.name}
          onConfirm={(newName) => onRenameConfirm?.(item.uri, newName)}
          onCancel={() => onRenameCancel?.()}
          autoFocus
        />
      </span>
    );
  }
  return (
    <span className="file-tree-name">
      {compactedSegments
        ? compactedSegments.map((seg, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="file-tree-compact-sep"> / </span>}
              {seg}
            </React.Fragment>
          ))
        : item.name}
    </span>
  );
}
