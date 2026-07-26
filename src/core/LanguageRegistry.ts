/**
 * 语言登记本——所有可用语言包的唯一真相源。
 *
 * 两层退路（对标 VS Code）：
 *   第 1 层：插件 contributes.languages 注册到本登记本 + i18next.addResourceBundle
 *   第 2 层：t(key) → key 不在翻译表 → 返回 key 本身（key = 中文原文）
 *
 * LanguageRegistry 只管登记和查询。加载 JSON、注册到 i18next 是 loader.ts 的事。
 * 架构：圆形大厅的"语言本"——插件往本子上登记自己提供的语言，谁都可以翻。
 *
 * 自动注销：继承 RegistryBase——插件卸载时 unregisterAll 自动被调用，
 * 无需 lifecycle.ts 手动添加清理逻辑。
 */

import { RegistryBase } from "./RegistryBase";
import type { LanguageContribution } from "./types";

interface RegisteredLanguage extends LanguageContribution {
  pluginId: string;
}

class LanguageRegistryImpl extends RegistryBase {
  private languages = new Map<string, RegisteredLanguage>();
  private pluginLanguageIds = new Map<string, string[]>();

  constructor() {
    super();
  }

  /** 注册插件贡献的语言包。同名 ID 后注册者覆盖（warn）。 */
  register(contribution: LanguageContribution, pluginId: string): void {
    const lang: RegisteredLanguage = { ...contribution, pluginId };
    if (this.languages.has(lang.id)) {
      console.warn(
        `[LanguageRegistry] 语言 "${lang.id}" 重复注册——后注册者 "${pluginId}" 覆盖`
      );
    }
    this.languages.set(lang.id, lang);
    const ids = this.pluginLanguageIds.get(pluginId) ?? [];
    ids.push(lang.id);
    this.pluginLanguageIds.set(pluginId, ids);
    this.markPlugin(pluginId);
  }

  /** 按语言代码查找 */
  get(langCode: string): RegisteredLanguage | undefined {
    return this.languages.get(langCode);
  }

  /** 所有已注册语言 */
  getAll(): RegisteredLanguage[] {
    return Array.from(this.languages.values());
  }

  /** 是否有此语言 */
  has(langCode: string): boolean {
    return this.languages.has(langCode);
  }

  /** 插件卸载时自动清理——由 RegistryBase 调用 */
  protected unregisterAll(pluginId: string): void {
    const ids = this.pluginLanguageIds.get(pluginId);
    if (ids) {
      for (const id of ids) this.languages.delete(id);
      this.pluginLanguageIds.delete(pluginId);
    }
  }
}

export const LanguageRegistry = new LanguageRegistryImpl();
