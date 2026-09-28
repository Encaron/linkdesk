/**
 * ai-manual 服务测试——M3 `AI#16`。
 *
 * 三条不变量（本格判据的机械半边，实机那半在开发态 CDP 与打包态目录检查里）：
 *   ① **根解析**：dev 读源码树、打包读 `resources/ai-manual`（两套目录，`app.isPackaged` 二择）；
 *   ② **章清单**：只收 `.md`、按文件名升序（`00-`/`01-` 前缀即阅读顺序）、标题取正文首个 `# `，
 *      解析不到回落文件名（永不返回空串）；
 *   ③ **永不抛**：目录不存在（老安装包 / 精简打包）⇒ `chapters: []`，不是异常；
 *      单章读失败只跳过它，其余章照常可读。
 *
 * 走 mock 不起真实盘：`electron` + `node:fs` 半替身（同 `env-service.test.ts` 的取舍——
 * 整模块替换会砸掉 CJS interop）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  isPackaged: false,
  version: "9.9.9",
}));

vi.mock("electron", () => ({
  app: {
    getAppPath: () => "E:\\repo",
    getVersion: () => h.version,
    get isPackaged() {
      return h.isPackaged;
    },
  },
}));

// `resourcesPath` 是 process 上的只读属性 ⇒ 测试里就地覆盖（服务每次调用现读，不缓存）
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const patched = {
    ...actual,
    readdirSync: (...args: unknown[]) => h.readdirSync(...args),
    readFileSync: (...args: unknown[]) => h.readFileSync(...args),
  };
  return { ...patched, default: patched };
});

import { aiManualPayload, listManualChapters, manualDir, parseChapterTitle } from "./ai-manual";

/** 一个"手册目录"的假盘：文件名 → 正文 */
function fakeDisk(files: Record<string, string>): void {
  h.readdirSync.mockReturnValue(Object.keys(files));
  h.readFileSync.mockImplementation((p: unknown) => {
    const name = String(p).split(/[\\/]/).pop() ?? "";
    if (!(name in files)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    return files[name];
  });
}

beforeEach(() => {
  h.readdirSync.mockReset();
  h.readFileSync.mockReset();
  h.isPackaged = false;
  h.version = "9.9.9";
});

describe("manualDir——两套目录（app.isPackaged 二择）", () => {
  it("dev：源码树 docs/07-AI操作手册（与 electron-builder.yml 的 from 同一份）", () => {
    h.isPackaged = false;
    expect(manualDir()).toBe("E:\\repo\\docs\\07-AI操作手册");
  });

  it("打包：resources/ai-manual（electron-builder.yml extraResources 的 to 同名）", () => {
    h.isPackaged = true;
    const original = process.resourcesPath;
    Object.defineProperty(process, "resourcesPath", { value: "C:\\app\\resources", configurable: true });
    try {
      expect(manualDir()).toBe("C:\\app\\resources\\ai-manual");
    } finally {
      Object.defineProperty(process, "resourcesPath", { value: original, configurable: true });
    }
  });
});

describe("parseChapterTitle——首个一级标题，取不到回落文件名", () => {
  it("行首 `# 标题` 即章名", () => {
    expect(parseChapterTitle("# 如何接入\n\n正文", "07-如何接入")).toBe("如何接入");
  });

  it("`#` 后多空格也认，并去掉行尾空白", () => {
    expect(parseChapterTitle("#    路径总览   \n", "x")).toBe("路径总览");
  });

  it("只认**行首** `#`——代码块/引用里的 `#` 不算章名（锚定是多行模式）", () => {
    // 首个行首 `#` 在第三行；第二行那个缩进的 `# 安装` 必须**不**被当成标题
    const md = "> 提示\n  # 安装\n# 真章名\n";
    expect(parseChapterTitle(md, "fallback")).toBe("真章名");
  });

  it("正文没有标题 / 标题为空 ⇒ 回落文件名（永不返回空串）", () => {
    expect(parseChapterTitle("正文没有标题\n", "03-按任务操作")).toBe("03-按任务操作");
    expect(parseChapterTitle("#\n", "04-手势")).toBe("04-手势");
  });
});

describe("listManualChapters——只收 .md、文件名升序、单章失败不拖垮整本", () => {
  it("按文件名升序（00-/01- 前缀即阅读顺序），非 md 不入清单", () => {
    fakeDisk({
      "02-命令与API索引.md": "# 命令与API索引\nB",
      "00-README.md": "# AI 操作手册（LinkDesk）\nA",
      "01-操作路径总览.md": "# 操作路径总览\nC",
      "images": "", // 目录/非 md —— readdirSync 会列出它，但不该进清单
      "notes.txt": "x",
    });
    const chapters = listManualChapters();
    expect(chapters.map((c) => c.id)).toEqual([
      "00-README",
      "01-操作路径总览",
      "02-命令与API索引",
    ]);
    expect(chapters[0].title).toBe("AI 操作手册（LinkDesk）");
    expect(chapters[0].markdown).toContain("# AI 操作手册（LinkDesk）");
  });

  it("目录不存在（ENOENT）⇒ 空清单，不抛", () => {
    h.readdirSync.mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    expect(listManualChapters()).toEqual([]);
  });

  it("单章读失败只跳过它，其余章照常返回", () => {
    fakeDisk({ "00-a.md": "# A\n", "01-b.md": "# B\n" });
    h.readFileSync.mockImplementation((p: unknown) => {
      if (String(p).endsWith("00-a.md")) throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      return "# B\n";
    });
    const chapters = listManualChapters();
    expect(chapters.map((c) => c.id)).toEqual(["01-b"]);
  });
});

describe("aiManualPayload——版本号是「手册属于这一版」的唯一凭据", () => {
  it("version 取 app.getVersion()（不从手册正文抠），dir 为手册根，chapters 全量", () => {
    h.version = "0.2.21";
    fakeDisk({ "00-README.md": "# AI 操作手册（LinkDesk）\n正文" });
    const payload = aiManualPayload();
    expect(payload.version).toBe("0.2.21");
    expect(payload.dir).toBe("E:\\repo\\docs\\07-AI操作手册");
    expect(payload.chapters).toHaveLength(1);
  });

  it("零章是合法回包（这个构建没带手册）——不是错误、不抛", () => {
    h.readdirSync.mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    const payload = aiManualPayload();
    expect(payload.chapters).toEqual([]);
    expect(payload.dir).toBe("E:\\repo\\docs\\07-AI操作手册");
  });
});
