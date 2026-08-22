/**
 * E4V#40k EditorBreadcrumb——编辑器面包屑。
 *
 * 对标 VS Code 面包屑导航。相对路径显示：单根→相对路径、多根→根名/路径。
 * 渲染在 EditorTab 内部、EditorView 上方。
 */
import React, { useState, useEffect } from "react";

const lk = window.linkdesk;

interface EditorBreadcrumbProps {
  filePath: string;
}

/** 计算相对于工作区根的显示路径 */
async function getDisplayPath(filePath: string): Promise<string> {
  const normalized = lk.path.normalize(filePath);
  const folders = await lk.workspace.getFolders();

  // 找到包含此文件的工作区根（f 由 getFolders() 返回类型上下文推断）
  const root = folders.find(
    (f) => normalized === f.uri || normalized.startsWith(f.uri + "/"),
  );

  if (!root) {
    // 无匹配工作区——显示完整路径的最后 3 段
    const parts = normalized.split("/").filter(Boolean);
    return parts.slice(-3).join(" / ");
  }

  const relative = normalized.slice(root.uri.length).replace(/^\//, "");

  if (folders.length <= 1) {
    // 单根——只显示相对路径
    return relative || root.name;
  }

  // 多根——根名 / 相对路径
  return relative ? `${root.name} / ${relative}` : root.name;
}

const EditorBreadcrumb: React.FC<EditorBreadcrumbProps> = ({ filePath }) => {
  const [displayPath, setDisplayPath] = useState<string>("");

  useEffect(() => {
    getDisplayPath(filePath).then(setDisplayPath);
  }, [filePath]);

  const segments = displayPath.split(" / ").filter(Boolean);

  return (
    <div className="editor-breadcrumb">
      {segments.map((seg, i) => (
        <span key={i} className="editor-breadcrumb-part">
          {i > 0 && (
            <span className="editor-breadcrumb-sep">&gt;</span>
          )}
          <span className="editor-breadcrumb-segment">{seg}</span>
        </span>
      ))}
    </div>
  );
};

export default EditorBreadcrumb;
