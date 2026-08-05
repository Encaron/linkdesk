/**
 * ClipboardProviderRegistry —— 剪贴板 Provider 桌子。
 * E5#15：对标 VS Code IClipboardService。
 *
 * 核心快捷键（Ctrl+C/V/X/A/Delete/F2）只在壳注册一次。
 * 插件注册 Provider 声明"我在焦点时接管剪贴板"。
 * 壳的 handler 根据焦点上下文分发到匹配的 Provider。
 *
 * 同 when 重复注册 → console.warn + 覆盖——不静默，让开发者立即看到冲突。
 */

import { RegistryBase } from "./registry/RegistryBase";

export interface ClipboardProvider {
  pluginId: string;
  /** 焦点上下文——when 条件匹配时才调此 provider。如 "explorerFocus" / "editorFocus" */
  when: string;
  onCopy?(): void;
  onCut?(): void;
  onPaste?(): void;
  onDelete?(): void;
  onSelectAll?(): void;
}

class ClipboardProviderRegistryImpl extends RegistryBase {
  private _providers: ClipboardProvider[] = [];

  constructor() {
    super();
  }

  /** 注册剪贴板 Provider。同 when 重复注册 → console.warn + 覆盖。 */
  register(pluginId: string, provider: Omit<ClipboardProvider, "pluginId">): void {
    const existing = this._providers.find((p) => p.when === provider.when);
    if (existing) {
      console.warn(
        `[ClipboardProvider] ⚠️ "${provider.when}" 已有注册者，被覆盖。` +
        `旧: ${existing.pluginId} → 新: ${pluginId}`
      );
      this._providers = this._providers.filter((p) => p.when !== provider.when);
    }
    this._providers.push({ pluginId, ...provider });
    this.markPlugin(pluginId);
  }

  /** 根据焦点上下文找到合适的 Provider */
  resolve(when: string): ClipboardProvider | undefined {
    return this._providers.find((p) => p.when === when);
  }

  /** 卸载插件时清理——由 RegistryBase 自动调用 */
  protected unregisterAll(pluginId: string): void {
    this._providers = this._providers.filter((p) => p.pluginId !== pluginId);
  }

  /** 获取全部注册的 Provider（调试用） */
  getAll(): readonly ClipboardProvider[] {
    return this._providers;
  }
}

export const clipboardProviders = new ClipboardProviderRegistryImpl();
