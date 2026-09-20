/**
 * 知情绕行注释解析器（E6#54d）——供 SDK 三个 check 脚本（css-hardcode / font-scale / spacing-grid）
 * 识别标准 eslint-disable 注释：命中豁免的违规行**整体静默**（对齐 eslint 原生 suppress 语义——
 * disable 声明后不亮灯，内容画布文件级一次声明即整体安静；disable 注释本身即市场偏离收集器的
 * 机器可读标记，check 不需 echo）。未豁免的违规 = 未处理偏离，正常上报。
 *
 * 与壳 no-hardcoded-hex 现有格式一致（非发明新语法，07 设计 §六·知情绕行）：
 *   - 行级：`// eslint-disable-next-line <id> -- 理由`（其下一行豁免）
 *           `// eslint-disable-line <id> -- 理由`（本行豁免，行内尾注释）
 *   - 文件级：`/* eslint-disable <id> -- 理由`（块注释收尾 + 理由）——内容画布视图级豁免，
 *             从该行到文件尾；`eslint-enable <id>` 可提前结束（缺省无 ids = 结束全部）
 *
 * eslint 本体不认这些伪规则 id（linkdesk/no-hardcoded-hex 等是 check 脚本 id，非 eslint rule），
 * 因此 SDK lint 跑 eslint 时关掉 reportUnusedDisableDirectives——脚本自己认这些注释。
 */
export const CHECK_IDS = {
  cssHardcode: "linkdesk/no-hardcoded-hex",
  fontScale: "linkdesk/no-hardcoded-font-size",
  spacingGrid: "linkdesk/no-nonstandard-spacing",
  cssNamespace: "linkdesk/no-reserved-class-name",
  /** E6#111b（1.32）：命令 id / 协议 id 必须带本仓 `<pluginId>.` 前缀，且不得占用宿主保留面 */
  commandOwnership: "linkdesk/no-unowned-command-id",
  /** E6#111d（1.34）：配置键必须带本仓 `<pluginId>.` 前缀（🟡 黄），且不得占用宿主保留键（🔴 红） */
  configOwnership: "linkdesk/no-unowned-config-key",
  /** E6#111f（1.36）：外观族 id（配方 / 配色 / 图标主题 / 共享图标）必须带本仓 `<pluginId>.` 前缀
   *  （🟡 黄——★回退条件 ＋ 轴上排序纪律，见 `appearance-ownership.ts` 文件头），
   *  且不得占用宿主兜底外观 id（🔴 红：配方 / 配色 / 图标主题三栏**按空间**比，有证照者除外）。
   *  ⚠️ 图标主题 id **不判前缀**（1.36 §二.2 ⑦：本轮不改名——改名 = 设置页可见文字变化）⇒ 这个 id 只覆盖判据②。 */
  appearanceOwnership: "linkdesk/no-unowned-appearance-id",
  /** E6#111h（1.38）：插件设的 context 旗子必须带本仓 `<pluginId>.` 前缀（🟡 黄），
   *  且不得占用**宿主专用**旗子（🔴 红：`contextKeysHostOnly`）。
   *  ⚠️ 宿主**公开约定面**（`contextKeysPublic`，今天 = `settings` 齿轮菜单的 4 个 `setting*`）
   *  **不判**（第三方设它合法：登记 ＋ 运行时报点）——见 `context-ownership.ts` 文件头。 */
  contextOwnership: "linkdesk/no-unowned-context-key",
  /** E6#123（L9 集中供给）：组件样式由壳池 vendor 统一供给——插件源码 import @linkdesk/ui 的 css 判红。
   *  ⚠️ 本 id 在 CHECK_IDS 里**仅作文档**：`checks/ui-css-import.ts` 刻意不接 disable 机制
   *  （「知情地把样式烤死」是语义错误不是合法偏离），eslint-disable 注释对它无效。 */
  uiCssImport: "linkdesk/no-ui-css-import",
  /** E6#137（2026-09-20）：window/document 全局 keydown/keyup 监听判红——正解 = 容器 onKeyDown +
   *  tabIndex（focus 分区）；确需全局抓键的正当形态（快捷键录制器）走 disable ＋ 理由（判据无白名单）。 */
  noGlobalKeyListener: "linkdesk/no-global-key-listener",
} as const;

interface RawComment {
  /** 注释内容（已剥 //、/* 和 *​/ 定界符），1-based 起始行 */
  text: string;
  startLine: number;
}

/** 单遍注释 tokenizer：产出全部 // 行注释与 /* 块注释（块注释可跨行）。 */
function tokenizeComments(source: string): RawComment[] {
  const out: RawComment[] = [];
  let i = 0;
  let line = 1;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    if (ch === "\n") {
      line++;
      i++;
      continue;
    }
    if (ch !== "/" || i + 1 >= n) {
      i++;
      continue;
    }
    const next = source[i + 1];
    if (next === "/") {
      // 行注释到行尾
      let j = i + 2;
      while (j < n && source[j] !== "\n") j++;
      out.push({ text: source.slice(i + 2, j), startLine: line });
      i = j;
      continue;
    }
    if (next === "*") {
      // 块注释到 *​/
      let j = i + 2;
      while (j < n && !(source[j] === "*" && source[j + 1] === "/")) {
        j++;
      }
      const end = j + 2 <= n ? j + 2 : j;
      out.push({ text: source.slice(i + 2, j), startLine: line });
      // 行计数**只此一处**（E6#137 修复：原实现 l 变量与 for 循环对块内换行**双重计数**，
      // 跨行块注释之后的所有 directive 行号整体偏大 ⇒ disable-next-line/line 全部错位失效——
      // settings 录制器豁免首次真实踩中）。闭合符 `*/` 本身无换行，计入区间无副作用。
      for (let k = i; k < end; k++) if (source[k] === "\n") line++;
      i = end;
      continue;
    }
    i++;
  }
  return out;
}

interface Directive {
  line: number; // 1-based
  kind: "next-line" | "line" | "disable" | "enable";
  ids: string[]; // 空数组 = 该注释未点名 id（bare disable → 全部；bare enable → 全部）
  reason?: string;
}

const REASON_SEP = /\s+--\s+/;

function parseComment(comment: RawComment): Directive | null {
  // 取首个非空行（块注释常以 " * " 前缀逐行；正文里先搜 eslint-disable 词）
  const m = comment.text.match(/\beslint-(disable-next-line|disable-line|disable|enable)\b/);
  if (!m) return null;
  const full = m[0];
  const kind: Directive["kind"] =
    full === "eslint-disable-next-line"
      ? "next-line"
      : full === "eslint-disable-line"
        ? "line"
        : full === "eslint-disable"
          ? "disable"
          : "enable";
  // ids = 关键字之后、可选 " -- reason" 之前的逗号/空白分隔 token
  const after = comment.text.slice(m.index! + full.length);
  const [idPart, reason] = after.split(REASON_SEP, 2);
  const ids = (idPart ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return { line: comment.startLine, kind, ids, reason: reason?.trim() };
}

export interface DisableIndex {
  /** 1-based 行 → 该行豁免的 id 集合（行级 next-line/line + 文件级 disable 区间） */
  active: Map<number, Set<string>>;
}

/** 建豁免索引。wantedIds = 本 check 认的 id（如 ["linkdesk/no-hardcoded-hex"]）。 */
export function buildDisableIndex(source: string, wantedIds: string[]): DisableIndex {
  const active = new Map<number, Set<string>>();
  const wanted = new Set(wantedIds);
  const mark = (l: number, id: string): void => {
    let s = active.get(l);
    if (!s) {
      s = new Set();
      active.set(l, s);
    }
    s.add(id);
  };

  const comments = tokenizeComments(source);
  const directives = comments.map(parseComment).filter((d): d is Directive => d !== null);

  // 1) 文件级 disable…enable 区间（每 id 单独算）
  const opens = new Map<string, number>(); // id -> start line
  // bare disable（ids 空）视为作用于全部 wanted
  const resolve = (ids: string[]): string[] => (ids.length === 0 ? [...wanted] : ids.filter((x) => wanted.has(x)));
  const totalLines = source.split("\n").length;
  const applyRange = (id: string, from: number, toExclusive: number): void => {
    for (let l = from; l < toExclusive; l++) mark(l, id);
  };

  for (const d of directives) {
    if (d.kind === "disable") {
      for (const id of resolve(d.ids)) {
        if (!opens.has(id)) opens.set(id, d.line);
      }
    } else if (d.kind === "enable") {
      for (const id of resolve(d.ids)) {
        const from = opens.get(id);
        if (from !== undefined) {
          applyRange(id, from, d.line); // 到 enable 所在行为止（不含）
          opens.delete(id);
        }
      }
    }
  }
  for (const [id, from] of opens) applyRange(id, from, totalLines + 1);

  // 2) 行级 next-line / line
  for (const d of directives) {
    if (d.kind === "next-line") {
      for (const id of resolve(d.ids)) mark(d.line + 1, id);
    } else if (d.kind === "line") {
      for (const id of resolve(d.ids)) mark(d.line, id);
    }
  }

  return { active };
}

/** 某文件某行（1-based）是否对该 check 知情豁免 */
export function isDisabled(index: DisableIndex, line: number, id: string): boolean {
  const s = index.active.get(line);
  return !!s && s.has(id);
}
