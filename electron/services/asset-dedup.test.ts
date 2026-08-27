/**
 * asset-dedup 内容去重单测——E5.8#152。
 *
 * 纯模块零 Electron 依赖——真实 fs + os.tmpdir 集成（对齐 filesystem-guard 集成式单测先例）。
 * importAsset 模拟 handler 组合（resolveAssetDestination + exists 判定 + 才 copy）：
 *   同图重选 → 返回已有文件名 + 目录文件数不变（零拷贝）
 *   同内容不同名 → 复用已有（内容去重跨名）
 *   同名不同图 → 仍 -N 命名
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { hashBuffer, resolveAssetDestination } from "./asset-dedup";

// 注入 fs 封装——只暴露 AssetDedupFs 子集（生产传 fileService，这里测真实文件行为）
const mkFs = (dir: string) => ({
  readBinaryFile: async (p: string) => fs.promises.readFile(p),
  listDir: async (d: string) => {
    const names = await fs.promises.readdir(d);
    return names.map((name) => {
      const full = path.join(d, name);
      const st = fs.statSync(full);
      return { name, path: full, isDirectory: st.isDirectory(), isFile: st.isFile() };
    });
  },
  join: (...parts: string[]) => path.join(...parts),
  exists: (p: string) => fs.existsSync(p),
});

/** 模拟 handler 组合：resolveAssetDestination 定名 → 名字不存在才 copy（内容命中则零拷贝） */
async function importAsset(dir: string, sourcePath: string): Promise<string> {
  const destName = await resolveAssetDestination(dir, sourcePath, mkFs(dir));
  const dest = path.join(dir, destName);
  if (!fs.existsSync(dest)) {
    await fs.promises.copyFile(sourcePath, dest);
  }
  return destName;
}

let dir: string;
let sourceDir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ldk-ast-dedup-"));
  sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "ldk-ast-src-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(sourceDir, { recursive: true, force: true });
});

describe("hashBuffer", () => {
  it("同内容恒同哈希 / 不同内容恒异哈希", () => {
    const a = Buffer.from("same bytes");
    expect(hashBuffer(a)).toBe(hashBuffer(Buffer.from("same bytes")));
    expect(hashBuffer(a)).not.toBe(hashBuffer(Buffer.from("other bytes")));
  });

  it("是 SHA-256（64 hex）", () => {
    expect(hashBuffer(Buffer.alloc(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("resolveAssetDestination——E5.8#152 内容去重", () => {
  it("同图重选 → 返回已有文件名且目录文件数不变（零拷贝）", async () => {
    const src = path.join(sourceDir, "pic.png");
    await fs.promises.writeFile(src, Buffer.from("image-content"));

    const first = await importAsset(dir, src);
    const second = await importAsset(dir, src);
    const count = (await fs.promises.readdir(dir)).length;

    expect(first).toBe("pic.png");
    expect(second).toBe("pic.png"); // 同内容命中 → 复用已有名
    expect(count).toBe(1);          // 不新增副本
  });

  it("同内容不同名 → 复用已有（内容去重跨名）", async () => {
    const srcA = path.join(sourceDir, "aaa.png");
    const srcB = path.join(sourceDir, "bbb.png");
    await fs.promises.writeFile(srcA, Buffer.from("same-content"));
    await fs.promises.writeFile(srcB, Buffer.from("same-content"));

    const first = await importAsset(dir, srcA);
    const second = await importAsset(dir, srcB);
    const count = (await fs.promises.readdir(dir)).length;

    expect(first).toBe("aaa.png");
    expect(second).toBe("aaa.png"); // 内容相同 → 指回首个已入库名
    expect(count).toBe(1);
  });

  it("同名不同图 → 仍 -N 命名", async () => {
    const srcA = path.join(sourceDir, "same.png");
    const srcB = path.join(sourceDir, "sub", "same.png"); // 同名不同路径——内容异
    await fs.promises.mkdir(path.join(sourceDir, "sub"));
    await fs.promises.writeFile(srcA, Buffer.from("content-a"));
    await fs.promises.writeFile(srcB, Buffer.from("content-b"));

    const first = await importAsset(dir, srcA);
    const second = await importAsset(dir, srcB);
    const count = (await fs.promises.readdir(dir)).length;

    expect(first).toBe("same.png");
    expect(second).toBe("same-1.png"); // 不同内容 → 新名
    expect(count).toBe(2);
  });

  it("第三次导入任一同图 → 仍不新增（命中 canonical）", async () => {
    const src = path.join(sourceDir, "pic.png");
    await fs.promises.writeFile(src, Buffer.from("stable-content"));

    await importAsset(dir, src);
    await importAsset(dir, src);
    await importAsset(dir, src);
    expect((await fs.promises.readdir(dir)).length).toBe(1);
  });

  it("忽略目录条目（只比对文件）", async () => {
    const src = path.join(sourceDir, "pic.png");
    await fs.promises.writeFile(src, Buffer.from("content"));
    await fs.promises.mkdir(path.join(dir, "subdir")); // 目录不参与哈希比对

    const destName = await importAsset(dir, src);
    expect(destName).toBe("pic.png");
  });
});
