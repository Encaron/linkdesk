/**
 * 唯一配置入口。
 * GUI 操作、文件监听、未来 WebSocket——三条路全走它。
 * 遵守 V3 设计方案 §1.5 的硬约束：没有"人用的 API"和"AI 用的 API"两套东西。
 *
 * Phase 1：从 prefs.json 读写全局配置。
 * Step 7 接入文件监听后，外部修改 prefs.json 可自动同步。
 */

export interface Prefs {
  window: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  theme: "Dark" | "Light";
  lastPort: string;
  preferences: {
    timestampFormat: string;
    showEcho: boolean;
    showLineNumbers: boolean;
    separateSystemLog: boolean;
    lineEnding: string;
    autoRepeat: boolean;
    repeatInterval: number;
    autoClear: boolean;
    receiveMode: "text" | "hex";
    receiveCoding: string;
    sendMode: "text" | "hex";
    sendCoding: string;
  };
  quickSends: Record<string, string>;
}

export interface Workspace {
  name: string;
  cards: unknown[]; // Phase 2 后细化为 Card[]
}

const DEFAULT_PREFS: Prefs = {
  window: { left: 100, top: 50, width: 960, height: 640 },
  theme: "Dark",
  lastPort: "COM3",
  preferences: {
    timestampFormat: "HH:mm:ss:fff",
    showEcho: true,
    showLineNumbers: true,
    separateSystemLog: true,
    lineEnding: "\r\n",
    autoRepeat: false,
    repeatInterval: 1000,
    autoClear: false,
    receiveMode: "text",
    receiveCoding: "UTF-8",
    sendMode: "text",
    sendCoding: "UTF-8",
  },
  quickSends: { AT: "AT\r\n" },
};

const PREFS_KEY = "v3_prefs";

class PreferenceService {
  /** 加载全局配置 */
  static loadPrefs(): Prefs {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
      }
    } catch {
      // 解析失败则用默认
    }
    return { ...DEFAULT_PREFS };
  }

  /** 保存全局配置 */
  static savePrefs(prefs: Prefs): void {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs, null, 2));
  }

  /** 加载工作区（Phase 2 实现——从文件系统读 workspace.json） */
  static loadWorkspace(_name: string): Workspace | null {
    // Phase 2: Tauri fs API 读 workspace_{name}.json
    return null;
  }

  /** 保存工作区 */
  static saveWorkspace(_name: string, _ws: Workspace): void {
    // Phase 2: Tauri fs API 写 workspace_{name}.json
  }

  /** 列出所有工作区 */
  static listWorkspaces(): string[] {
    // Phase 2: Tauri fs API 扫描 workspaces/ 目录
    return [];
  }
}

export default PreferenceService;
