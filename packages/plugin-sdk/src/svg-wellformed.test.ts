/**
 * `svg-wellformed` 判据单测——**作者侧与壳侧共用的那一条腿**，随壳仓 `npm run check` 的 vitest 跑。
 *
 * 覆盖取向（与 `scripts/check-svg-wellformed.mjs --self-test` 互补，不是复刻）：
 * 那边验**壳侧调用点 + 走查/豁免/行号**；这边验**判据本体**（尤其负控用真 bug 的原文形态）
 * 与 **subpath 导出面**（按包名 `@linkdesk/plugin-sdk/svg-wellformed` 引——exports map 一旦写错，
 * 插件仓 CI 会整片红，本测是那个面在仓内的唯一证人）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import { checkSvgWellformed, formatSvgViolation, svgViolationHint, xmlWellformedError } from "@linkdesk/plugin-sdk/svg-wellformed";

const SVG_NS = "http://www.w3.org/2000/svg";
const doc = (body: string) => `<svg xmlns="${SVG_NS}" width="48" height="48">${body}</svg>`;

describe("xmlWellformedError（负控：真 bug 的原文形态必须被抓）", () => {
  it("注释里的 CSS 变量字面量（连续两个连字符）——2026-09 第三方作者插件破图案的原形", () => {
    const err = xmlWellformedError(doc("<!-- 独立文档 ⇒ 不能用 var(--xxx)，颜色必须自含 --><rect/>"));
    expect(err?.message).toMatch(/comment/i);
  });

  it("`&nbsp;` 这类 XML 未定义实体——python 封面 cover.svg 的原形", () => {
    const err = xmlWellformedError(doc("<text>PYTHON&nbsp;LSP</text>"));
    expect(err?.message).toMatch(/entity/i);
  });

  it("标签不匹配 / 文本里的裸 `<` / 空文件——都在域内", () => {
    expect(xmlWellformedError(`<svg xmlns="${SVG_NS}"><rect/></svg2>`)).not.toBeNull();
    expect(xmlWellformedError(doc("<text>a < b</text>"))).not.toBeNull();
    expect(xmlWellformedError("")).not.toBeNull();
  });

  it("行号定位到出错那一行（不是恒 1）", () => {
    const err = xmlWellformedError(
      [doc(""), "  <!-- 占位图——请替换 -->".trim(), "  <!-- 不能用 var(--xxx) -->", "</svg>"].join("\n"),
    );
    expect(err?.line).toBe(3);
  });

  it("非字符串入参 ⇒ null——⛔ 不编造、也不抛", () => {
    expect(xmlWellformedError(undefined as unknown as string)).toBeNull();
    expect(xmlWellformedError(null as unknown as string)).toBeNull();
  });

  it("位置与措辞来自解析器本人，且 saxes 的 `行:列:` 前缀已剥掉——别把内部编码漏进 CI 日志", () => {
    const err = xmlWellformedError("not xml at all");
    expect(err?.line).toBe(1);
    expect(err?.column).toBe(14);
    expect(err?.message).not.toMatch(/^\d+:\d+:/);
  });
});

describe("xmlWellformedError（正控：别误报）", () => {
  it("正文里的连续连字符合法——判据是解析器，不是 grep `--`", () => {
    expect(xmlWellformedError(doc("<text>a--b</text>"))).toBeNull();
  });

  it("注释里的 em dash（U+2014）合法——与 ASCII 双连字符只差一个码位", () => {
    expect(xmlWellformedError(doc("<!-- 占位图——请替换 --><rect/>"))).toBeNull();
  });

  it("CDATA 里的 `<` `&`、预定义实体、数字引用、BOM、CRLF 都合法", () => {
    expect(xmlWellformedError(doc("<text><![CDATA[a < b & c -- d]]></text>"))).toBeNull();
    expect(xmlWellformedError(doc("<text>a &amp; b &#160; c</text>"))).toBeNull();
    expect(xmlWellformedError("\uFEFF" + doc("<rect/>"))).toBeNull();
    expect(xmlWellformedError(doc("<rect/>").replace(/></g, ">\r\n<"))).toBeNull();
  });
});

describe("checkSvgWellformed（走查 / 豁免 / 根元素判据）", () => {
  const tmp = mkdtempSync(join(tmpdir(), "linkdesk-svg-wellformed-test-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  const put = (rel: string, content: string) => {
    const abs = join(tmp, rel.split("/").join("\\"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  };
  put("ok/a.svg", doc("<rect/>"));
  put("bad/b.svg", doc("<!-- -- -->"));
  put("deep/x/y/c.svg", doc("<text>&nbsp;</text>"));
  put("named/bad.fixture.svg", doc("<!-- -- -->"));
  put("skipped/node_modules/d.svg", doc("<!-- -- -->"));
  put("html/e.svg", "<html><body>x</body></html>");

  it("走的深度、豁免、跳过目录、根元素判据各自到位", () => {
    const r = checkSvgWellformed(tmp);
    expect(r.scanned).toBe(4); // ok/a、bad/b、deep/x/y/c、html/e（fixture 与 node_modules 不在域内）
    expect(r.violations.map((v) => v.file)).toEqual(["bad/b.svg", "deep/x/y/c.svg", "html/e.svg"]);
  });

  it("根元素不是 svg 归 root 一类——与 xml 那类可分辨（修法不同）", () => {
    const root = checkSvgWellformed(tmp).violations.find((v) => v.file === "html/e.svg");
    expect(root?.kind).toBe("root");
    expect(svgViolationHint(root!)).toMatch(/根元素/);
  });

  it("格式器给「文件:行:列」（两轴打印同款）", () => {
    expect(formatSvgViolation({ file: "a.svg", line: 3, column: 7, message: "x", kind: "xml" })).toBe("a.svg:3:7  x");
  });

  it("根不存在 ⇒ 零违规、不抛", () => {
    expect(checkSvgWellformed(join(tmp, "no-such-root"))).toEqual({ scanned: 0, violations: [] });
  });
});
