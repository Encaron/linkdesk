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
 * 自动注销：继承 RegistryBase——插件卸载时 tracker 逆序回滚每个 per-entry disposer
 *（E5.8#10：register 逐条 track，卸载无需 lifecycle.ts 手动清理）。
 */

import { RegistryBase } from "../../registry/RegistryBase";
import type { LanguageContribution } from "../../api/types";

interface RegisteredLanguage extends LanguageContribution {
  pluginId: string;
}

class LanguageRegistryImpl extends RegistryBase {
  private languages = new Map<string, RegisteredLanguage>();
  private pluginLanguageIds = new Map<string, string[]>();

  constructor() {
    super();
  }

  /** 注册插件贡献的语言包。同名 ID 后注册者覆盖（warn）。
   *  E5.8#10：per-entry track——返 disposer（仅当仍是当前占位者才删，防覆盖误删）。
   *
   *  🔴 **E6#111f／1.36：本册刻意不加归属仲裁**（不是漏了——是判据表里"恒空转 ⚪不判"那一行的落地）。
   *  理由：键 = **语言码**（`zh` / `en` / `ja`），属 §〇c 三类**永久豁免**的全局概念名（语言码 / 文件关联
   *  扩展名 / 语言定义扩展名）——语言码天然是共享概念，插件包"提供 zh 的翻译"是正常行为，
   *  判它"不带归属"或"跨插件同 id"都是**假红**（宽容度模型：假红会让真红失效）。
   *  ⇒ 保留既有 last-wins ＋ warn；语言包 id 不参与外观 id 的四栏账。
   *  出处：1.36 §二.2 判据⑤ ＋ §〇c.2。 */
  register(contribution: LanguageContribution, pluginId: string): () => void {
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
    return this.track(pluginId, () => {
      if (this.languages.get(lang.id) === lang) {
        this.languages.delete(lang.id);
      }
      const owned = this.pluginLanguageIds.get(pluginId);
      if (owned) {
        const kept = owned.filter((id) => id !== lang.id);
        if (kept.length !== owned.length) {
          if (kept.length === 0) this.pluginLanguageIds.delete(pluginId);
          else this.pluginLanguageIds.set(pluginId, kept);
        }
      }
    });
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

}

export const LanguageRegistry = new LanguageRegistryImpl();
