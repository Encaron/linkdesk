/**
 * 文件图标默认映射表——数据驱动，声明式。
 * E4a #93：加新图标只改此文件不改解析器。对标 VS Code seti/vscode-icons 图标主题。
 *
 * E6#69g（14 档案批次三·归一化铁律）：自 plugins/file-tree/src/utils/icon-mappings.ts 上移共享——
 * 文件图标默认数据单一副本：壳 windowLayout（文件标签图标）+ file-tree（树行/搜索行）同消费。
 * 图标主题插件经 IconRegistry 贡献的 IconThemeMappings 整体替换本默认表（theme 在 → theme 优先）。
 */

/** 文件名精确匹配（优先级最高） */
export const FILE_ICON_MAP: Record<string, string> = {
  "package.json": "codicon-package",
  "tsconfig.json": "codicon-settings-gear",
  ".gitignore": "codicon-git-ignore",
  "README.md": "codicon-book",
  "LICENSE": "codicon-law",
  ".env": "codicon-symbol-key",
  "docker-compose.yml": "codicon-server-environment",
};

/** 扩展名匹配 */
export const EXT_ICON_MAP: Record<string, string> = {
  ".tsx": "codicon-react",
  ".ts": "codicon-symbol-namespace",
  ".json": "codicon-json",
  ".md": "codicon-markdown",
  ".css": "codicon-symbol-color",
  ".html": "codicon-code",
  ".js": "codicon-symbol-file",
  ".jsx": "codicon-react",
  ".svg": "codicon-symbol-snippet",
  ".png": "codicon-file-media",
  ".jpg": "codicon-file-media",
  ".gif": "codicon-file-media",
  ".ico": "codicon-file-media",
  ".txt": "codicon-note",
  ".xml": "codicon-code",
  ".yml": "codicon-settings",
  ".yaml": "codicon-settings",
  ".toml": "codicon-settings",
  ".lock": "codicon-lock",
  ".gitattributes": "codicon-git-ignore",
  ".gitmodules": "codicon-git-ignore",
};

/** 文件夹名特殊匹配 */
export const FOLDER_ICON_MAP: Record<string, string> = {
  ".git": "codicon-git-branch",
  "node_modules": "codicon-archive",
  "src": "codicon-folder-src",
  "components": "codicon-folder-library",
  "hooks": "codicon-folder-library",
  "utils": "codicon-folder-library",
};

/** 默认图标（未命中任意映射/主题）——与 VS Code 默认文件图标同位 */
export const DEFAULT_FILE_ICON = "codicon-file";
export const DEFAULT_FOLDER_ICON = "codicon-folder";
export const DEFAULT_FOLDER_OPEN_ICON = "codicon-folder-opened";
export const DEFAULT_ROOT_ICON = "codicon-root-folder";
