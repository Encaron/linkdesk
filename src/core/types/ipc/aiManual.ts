/**
 * AI 操作手册 wire 契约——`app:getAiManual` 的返回体（AI 友好化 M3 · `AI#16`）。
 *
 * ## 为什么类型住在这里
 *
 * 同 `product.ts` / `update.ts` 的既有理由（那两个文件头注写着同一句话）：
 * **跨堆协议类型归口本目录，`electron/` 与 `src/` 双端 import 同一份**——字段改名 tsc 双端报错，
 * 不再各写一份。消费链 = 主进程 `ai-manual.ts`（产出）→ `preload-shell`（转发）→
 * 壳 `useAiManual`（组装 DTO）→ 池视图（只画）。
 *
 * ⚠️ **本类型不进插件契约**：手册是**壳内视图的取数**（壳内私有扩展第三例，前两例 =
 * `app.getProductInfo` / `update.getReleaseNotes*`）⇒ 池 preload 不注入、`contracts/linkdesk.d.ts`
 * 不动、命名空间矩阵读数不变。理由见 `preload-shell.ts` 的 `buildShellApp()` 头注。
 *
 * 🔴 **`version` 字段是「内容是当前版本」这条判据的对账面**：它取自主进程 `app.getVersion()`
 * （运行时值，装的哪版就是哪版），视图头部显示它——旧安装包里躺着一份旧手册，当场露馅。
 * ⛔ 不要改成「手册里写的版本」：那正好把要验的东西变成假设。
 */

/** 一章 = 一个 `.md` 文件。`id` 用文件名（池侧切章只认它，不做正则解析） */
export interface AiManualChapter {
  /** 文件名去掉 `.md`（如 `03-按任务操作`）——稳定标识，⛔ 不用标题当 id（标题会改） */
  id: string;
  /** 章节标题：取正文首个 `# ` 一级标题；没有则回落文件名 */
  title: string;
  /** 章的 markdown 原文（GFM，交给池侧唯一 md 渲染件 `MarkdownView`） */
  markdown: string;
}

/**
 * 全量返回体。
 *
 * ⚠️ **没有 `error` 态**：读不到手册**不是异常**，是「这一版没带手册」——用 `chapters: []`
 * 表达（同 `PoolAboutData` 无 `error` 态的理由：本机 fs 读，失败只可能是「文件不在」，
 * 而「文件不在」有确定含义）。壳侧据此画空态并指路安装目录，⛔ 不抛、不留白屏。
 */
export interface AiManualPayload {
  /** 当前软件版本（`app.getVersion()`）——「手册属于这一版」的唯一凭据 */
  version: string;
  /** 章节清单，**按文件名升序**（文件名前缀 `00-`/`01-`… 即阅读顺序，不另设排序字段） */
  chapters: AiManualChapter[];
  /** 本次读取的手册根绝对路径——空态时给用户一句话指路（dev 与安装版路径不同，故由主进程给） */
  dir: string;
}
