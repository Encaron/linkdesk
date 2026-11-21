/**
 * readme-media README 媒体引用收集单测（I11/#16 · R4-5.8）。
 *
 * 判据 = 「多格式视频装完可播」：`<video><source src=a.webm><source src=b.mp4>` 的每个
 * `<source>` 都是独立片源引用，漏收 = 装完只有 poster 没有片源（详情页播放器黑屏）。
 * 被测件 = build 通道的同源实现（readme-media.ts——vite-config 拆出的纯 fs 域，
 * 测试导入同一份函数——⛔ 测试另抄一份正则；pack 通道是整树打包、不归本档管）。
 * fixture 全虚构（硬约束 21）：媒体路径用明显虚构值。
 */

import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { copyReadmeReferencedAssets, readmeMediaRefs } from "./readme-media.js";

const roots: string[] = [];
function makeRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "ldk-media-refs-"));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(abs.slice(0, abs.lastIndexOf(abs.includes("\\") ? "\\" : "/")), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return root;
}
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

describe("readmeMediaRefs（I11/#16 · R4-5.8）", () => {
  it("多格式 <video><source>：两个片源＋poster 全入集（漏收 = 播放器黑屏）", () => {
    const md =
      '<video poster="media/cover.jpg" controls>\n' +
      '  <source src="media/clip.webm" type="video/webm">\n' +
      '  <source src="media/clip.mp4" type="video/mp4">\n' +
      "</video>";
    expect(readmeMediaRefs(md)).toEqual(["media/cover.jpg", "media/clip.webm", "media/clip.mp4"]);
  });

  it("绝对 scheme 的 <source> 不入集；markdown img 既有语义不变", () => {
    const md =
      '<video><source src="https://cdn.example.invalid/clip.mp4"></video>\n' +
      "![封面](media/cover.jpg)";
    expect(readmeMediaRefs(md)).toEqual(["media/cover.jpg"]);
  });
});

describe("copyReadmeReferencedAssets（I11/#16 · R4-5.8）", () => {
  const README = '<video poster="media/cover.jpg" controls>\n  <source src="media/clip.webm">\n  <source src="media/clip.mp4">\n</video>';

  it("片源实体随 README 落 pkgDir（装完可播）", () => {
    const root = makeRoot({
      "README.md": README,
      "media/cover.jpg": "jpg",
      "media/clip.webm": "webm",
      "media/clip.mp4": "mp4",
    });
    const pkgDir = join(root, "__pkg__");
    mkdirSync(pkgDir, { recursive: true });
    copyReadmeReferencedAssets(root, pkgDir, README);
    expect(existsSync(join(pkgDir, "media", "cover.jpg"))).toBe(true);
    expect(existsSync(join(pkgDir, "media", "clip.webm"))).toBe(true);
    expect(existsSync(join(pkgDir, "media", "clip.mp4"))).toBe(true);
  });

  it("引用文件不存在 ⇒ 跳过（作者错不红——既有守卫语义不变）", () => {
    const root = makeRoot({
      "README.md": '<video><source src="media/missing.webm"></video>',
    });
    const pkgDir = join(root, "__pkg__");
    mkdirSync(pkgDir, { recursive: true });
    copyReadmeReferencedAssets(root, pkgDir, '<video><source src="media/missing.webm"></video>');
    expect(existsSync(join(pkgDir, "media", "missing.webm"))).toBe(false);
  });
});
