/**
 * check 腿·`@linkdesk/ui` 样式 import 判红（E6#123）单测。
 *
 * 失效方向同 keyframe-refs：太松（放过一条 css import）⇒ 组件样式静默烤回插件 bundle，
 * 「壳改样式全生态跟随」破产且无人察觉；太紧（把 `@linkdesk/ui` 本体 import 判红）⇒ 假红——
 * 那是 L9 之后**唯一合法**的消费形态（组件由壳 vendor 供给，作者照常 `import { SelectBox } from "@linkdesk/ui"`）。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUiCssImportCheck } from "./ui-css-import.js";

function withPlugin(files: Record<string, string>, fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "ui-css-import-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("runUiCssImportCheck", () => {
  it("正控：side-effect import 判红，报点行号正确", () => {
    withPlugin({ "src/index.tsx": 'import { SelectBox } from "@linkdesk/ui";\nimport "@linkdesk/ui/index.css";\n' }, (root) => {
      const v = runUiCssImportCheck(root);
      expect(v).toHaveLength(1);
      expect(v[0].file).toBe("src/index.tsx");
      expect(v[0].line).toBe(2);
      expect(v[0].message).toContain("壳池");
    });
  });

  it("正控：dist 形态 / 具名 import / 动态 import / css @import 全红", () => {
    withPlugin(
      {
        "src/a.ts": 'import x from "@linkdesk/ui/dist/index.css";\n',
        "src/b.ts": 'const m = await import("@linkdesk/ui/index.css");\n',
        "src/styles/main.css": '@import "@linkdesk/ui/index.css";\n',
      },
      (root) => {
        const v = runUiCssImportCheck(root);
        expect(v).toHaveLength(3);
        expect(v.map((x) => x.file).sort()).toEqual(["src/a.ts", "src/b.ts", "src/styles/main.css"]);
      },
    );
  });

  it("负控：@linkdesk/ui 本体 import（L9 后唯一合法形态）不红", () => {
    withPlugin(
      {
        "src/index.tsx": 'import { SelectBox, inferSliderStep } from "@linkdesk/ui";\nimport type { ContextMenuProps } from "@linkdesk/ui";\n',
      },
      (root) => {
        expect(runUiCssImportCheck(root)).toHaveLength(0);
      },
    );
  });

  it("负控：注释里的提及不算", () => {
    withPlugin(
      {
        "src/a.ts": '// import "@linkdesk/ui/index.css"; —— 已按 L9 删除\n',
        "src/b.css": '/* @import "@linkdesk/ui/index.css"; 旧写法存档 */\n.badge { color: red; }\n',
      },
      (root) => {
        expect(runUiCssImportCheck(root)).toHaveLength(0);
      },
    );
  });

  it("负控：测试夹具里的字符串不算（与其余 check 同口径）", () => {
    withPlugin({ "src/lint.test.ts": 'const s = "import \\"@linkdesk/ui/index.css\\";";\n' }, (root) => {
      expect(runUiCssImportCheck(root)).toHaveLength(0);
    });
  });
});
