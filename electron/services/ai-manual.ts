/**
 * AI 操作手册读取服务——M3 `AI#16`（AI友好化-全自动操作/03-任务档案/M3-手册.md）。
 *
 * **单一权威**：手册根在哪、有哪些章、每章正文是什么，全项目只有本文件回答。
 * 消费链：本文件 → `manual-handlers.ts`（`app:getAiManual` 直答）→ `preload-shell` 的
 * `buildShellApp()` → 壳 `useAiManual` → `pushLayout` 挂到标签页 → 池 `AiManualPoolView` 只画。
 *
 * ## 根解析为什么是「两套目录」而不是 `getAssetPath()`
 *
 * 手册是**主进程的磁盘文件**，渲染期的资产路径（`getAssetPath()` 那套 CDN/协议路径）是**另一根轴**
 * ——它面向的是渲染进程里能 fetch 的 URL。用资产路径读不到仓库外的 `resources/` 目录，
 * 所以这里按 `env-service.ts` 的既有判据自己解析（同 `appPluginsDir()` 的 `app.isPackaged` 二择）：
 *   - 打包：`<process.resourcesPath>/ai-manual/`（electron-builder.yml `extraResources` 搬入，
 *     `docs/07-AI操作手册/*.md` ⇒ `resources/ai-manual/*.md`）
 *   - 开发：`<repo>/docs/07-AI操作手册/`（唯一真相源就是源码树里这一份，不另存副本）
 *
 * ⚠️ **dev 与 prod 的文件名不同轴是隐患，已在门禁里盯住**：打包件里没有 `docs/` 层级，
 * 章节名靠 `00-`/`01-` 前缀保持阅读顺序（两处同名，`extraResources` 只换父目录）。
 *
 * ## 永不抛
 *
 * 手册缺席（老版本安装包 / 精简打包 / 目录被删）**不是错误**，是 `chapters: []` 一态——
 * 壳侧据此画空态并给出**手册目录绝对路径**让用户自查（同 `PoolAboutData` 无 error 态的理由：
 * 「没带手册」与「读手册失败」对用户是同一件事：这里没有内容可看）。
 */

import { app } from 'electron';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AiManualChapter, AiManualPayload } from '../../src/core/types/ipc/aiManual';

/** 打包件内的手册目录名（electron-builder.yml extraResources 的 `to:` 字段，两处必须同名）。
 *  ⚠️ 模块内私有：壳内无第二消费方（preload / 主进程都不认这个名字，只有本文件的 `manualDir()`
 *  拿它拼路径）。它对外的对偶是 yml 的 `to:`——那是**跨文件**约定，不需要导出；
 *  导出只会让 knip 报「导出未用」（而这一条它报得对）。 */
const AI_MANUAL_DIR_NAME = 'ai-manual';

/** 源码树内的手册目录（dev 读这里；打包时 extraResources 从这里搬） */
const DEV_MANUAL_REL = join('docs', '07-AI操作手册');

/**
 * 手册根目录绝对路径。
 * dev 分支的 `docs/07-AI操作手册` 与 `electron-builder.yml` 的 `from:` 是**同一份**——
 * 改目录名 = 改三处（本文件 `DEV_MANUAL_REL` ＋ yml `from` ＋ yml `to`），门禁挡不住改名，
 * 只能靠保持一致（`ai-manual.test.ts` 断言 dev 根 = 任务档案里写的那条路径）。
 */
export function manualDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, AI_MANUAL_DIR_NAME)
    : join(app.getAppPath(), DEV_MANUAL_REL);
}

/**
 * 从正文首个一级标题取章名——`# XXX`（`#` 后可多空格）。
 * 取不到（正文没写标题）回落**文件名去 `.md`**（`id` 同款），绝不返回空串
 * （标签页导航上出现一行空白 = 用户看不出这章是什么）。
 *
 * 只认**行首**的 `#`：手册正文里有大量 `##`/`###` 与代码块内的 `#`（注释、命令行），
 * 不加锚定会把某条注释当成章名。
 */
export function parseChapterTitle(markdown: string, fallback: string): string {
  const m = /^#[ \t]+(\S.*)$/m.exec(markdown);
  const title = m?.[1]?.trim();
  return title && title.length > 0 ? title : fallback;
}

/**
 * 章节清单——按**文件名升序**（手册靠 `00-`/`01-` 前缀表达阅读顺序，升序即书序）。
 * 目录不存在 / 读不动 → `[]`（永不抛）。
 *
 * 只收 `.md`：手册目录里可能有图片子目录或草稿，非 md 不进正文清单。
 */
export function listManualChapters(): AiManualChapter[] {
  const dir = manualDir();
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return []; // ENOENT = 这个构建没带手册 = 正常态，不是错误
  }

  const chapters: AiManualChapter[] = [];
  for (const name of names.filter((n) => n.toLowerCase().endsWith('.md')).sort()) {
    const id = name.replace(/\.md$/i, '');
    try {
      const markdown = readFileSync(join(dir, name), 'utf-8');
      chapters.push({ id, title: parseChapterTitle(markdown, id), markdown });
    } catch {
      // 单章读失败不拖垮整本——跳过它，其余章照常可读（手册可用性优先于完整性）
    }
  }
  return chapters;
}

/**
 * 完整的 `app:getAiManual` 回包。**每次调用重读盘**（不缓存）：
 * 手册是几十 KB 的只读文本，一次标签页打开读一次，读盘成本远小于「缓存与文件不同步」的排查成本
 * （dev 改文档后要立刻看到效果——缓存会让「我改了怎么没变」变成一次假 bug 调查）。
 *
 * `version` = `app.getVersion()`——**「手册属于这一版」的唯一凭据**，⛔ 不从手册正文里抠版本号
 * （正文里的版本号是给人读的叙述，会滞后；`app.getVersion()` 是 02 §2.3 的单一真相源）。
 * 壳侧把它显式画在标题旁，用户/维护者据此对账「我看到的这版手册是不是装的这版软件」。
 */
export function aiManualPayload(): AiManualPayload {
  return {
    version: app.getVersion(),
    chapters: listManualChapters(),
    dir: manualDir(),
  };
}
