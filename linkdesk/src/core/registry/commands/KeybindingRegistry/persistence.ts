/**
 * KeybindingRegistry 持久化域——自 KeybindingRegistry.ts 拆出（E5.8#0d.10-8c）。
 * User keybindings.json 读写/watch/初始化/打开设置：_keybindingsPath/_keybindingsWatcherUnsub 属主。
 * 依赖方向：persistence → registry（clearUserKeybindings/registerKeybinding/getKeybindings）+ FileService + pathUtils + CoreEvents；无反向。
 */

import { readFile, writeFile, exists, watch, appDataDir, joinPath } from "../../../services/files/FileService";
import { normalizePath } from "../../../utils/path/pathUtils";
import { CoreEvents, CUSTOM_EVENTS } from "../../../react/events/CoreEvents";
import { clearUserKeybindings, registerKeybinding, getKeybindings } from "./registry";

const KEYBINDINGS_FILENAME = "keybindings.json";

/** 快捷键文件完整路径——appDataDir + keybindings.json */
let _keybindingsPath: string | null = null;

async function getKeybindingsPath(): Promise<string | null> {
  if (_keybindingsPath) return _keybindingsPath;
  const dir = await appDataDir();
  if (!dir) return null;
  _keybindingsPath = await joinPath(dir, KEYBINDINGS_FILENAME);
  return _keybindingsPath;
}

/**
 * 加载用户自定义快捷键——对标 VS Code keybindings.json。
 * 启动时调用一次；runtime 文件变动时 watch 自动重载。
 *
 * 不存在文件 → 用出厂默认（静默跳过）。
 * JSON 格式：`[{ "command": "...", "key": "...", "when?": "..." }]`
 */
async function loadUserKeybindings(): Promise<void> {
  const filePath = await getKeybindingsPath();
  if (!filePath) return;

  const fileExists = await exists(filePath);
  if (!fileExists) return;

  try {
    const raw = await readFile(filePath);
    const userBindings = JSON.parse(raw) as Array<{ command: string; key: string; when?: string }>;

    // 清除旧用户绑定 → 重新注册（用户覆盖出厂优先级由 registerKeybinding 保证）
    clearUserKeybindings();
    for (const kb of userBindings) {
      registerKeybinding({ command: kb.command, key: kb.key, when: kb.when, source: "user" });
    }
  } catch (e) {
    console.warn("[KeybindingRegistry] 读取 keybindings.json 失败:", e);
  }
}

/**
 * 保存用户快捷键到 keybindings.json——"Open Keybindings Settings" 命令调用。
 * 返回文件路径（null = Electron 环境不可用）。
 */
export async function saveUserKeybindings(): Promise<string | null> {
  const filePath = await getKeybindingsPath();
  if (!filePath) return null;

  const userBindings = getKeybindings()
    .filter((b) => b.source === "user")
    .map((b) => {
      const entry: { command: string; key: string; when?: string } = { command: b.command, key: b.key };
      if (b.when) entry.when = b.when;
      return entry;
    });

  await writeFile(filePath, JSON.stringify(userBindings, null, 2));
  return filePath;
}

let _keybindingsWatcherUnsub: (() => void) | null = null;

/**
 * 监听 keybindings.json 文件变化——对标 VS Code 热更新。
 * 文件变动 → 300ms 防抖 → 重新加载 → fire onDidChangeKeybindings。
 * 文件被删除 → 清除用户绑定 → 回退出厂默认。
 */
async function watchUserKeybindings(): Promise<void> {
  if (_keybindingsWatcherUnsub) return; // 已监听

  const dir = await appDataDir();
  if (!dir) return;

  const filePath = await getKeybindingsPath();
  if (!filePath) return;

  let debounce: ReturnType<typeof setTimeout> | null = null;
  _keybindingsWatcherUnsub = await watch(dir, (event) => {
    // 只关心 keybindings.json
    const name = normalizePath(event.path).split("/").pop();
    if (name !== KEYBINDINGS_FILENAME) return;

    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const stillExists = await exists(filePath);
      if (!stillExists) {
        clearUserKeybindings();
        CoreEvents.onDidChangeKeybindings.fire();
        return;
      }
      await loadUserKeybindings();
      CoreEvents.onDidChangeKeybindings.fire();
    }, 300);
  });
}

/* ── 公开入口——App.tsx 启动时调用 ── */

/**
 * 初始化用户快捷键——加载 keybindings.json + 启动文件监听。
 * 对标 VS Code：keybindings.json 读写 + watch 热更新。
 * 在 mountGlobalKeybindings() 之后调用。
 */
export async function initUserKeybindings(): Promise<void> {
  await loadUserKeybindings();
  await watchUserKeybindings();
}

/**
 * 打开快捷键设置——通知 SettingsView 切换到快捷键 tab。
 * E3f #59：opts.query 非空时搜索框预填该命令名。
 * "workbench.action.openKeybindingsSettings" 命令的 handler。
 */
export async function openKeybindingsSettings(opts?: { query?: string }): Promise<void> {
  // 确保 keybindings.json 存在
  const filePath = await saveUserKeybindings();
  if (!filePath) {
    const dir = await appDataDir();
    if (dir) {
      const p = await joinPath(dir, KEYBINDINGS_FILENAME);
      await writeFile(p, "[]\n");
    }
  }
  // E3f #59-A：先打开设置标签页，等 mount 后再切换快捷键 tab
  window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.OPEN_SETTINGS));
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.OPEN_KEYBINDINGS_SETTINGS, {
      detail: { query: opts?.query },
    }));
  }, 100);
}

/** 清空持久化态（测试/clearKeybindings 用）——dispatch 组合清理调用 */
export function clearPersistence(): void {
  _keybindingsPath = null;
  if (_keybindingsWatcherUnsub) {
    _keybindingsWatcherUnsub();
    _keybindingsWatcherUnsub = null;
  }
}
