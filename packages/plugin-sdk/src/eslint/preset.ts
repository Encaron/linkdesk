/**
 * `linkdeskPluginLintConfig()`——第三方插件工程的 eslint 门禁预设（E6#54d）。
 *
 * 07 设计 §六「三档梯度」：全部规则 **WARN 级，永不 fail build/上传**——lint 是建议不是封锁。
 * 知情绕行 = 标准 eslint-disable 注释（行级 eslint-disable-next-line/eslint-disable-line，
 * 或文件级 eslint-disable 批量声明——注释里带理由 `-- 内容画布` 等），本预设把
 * reportUnusedDisableDirectives 留给调用方关闭（见 lint.ts——脚本伪 id 如
 * linkdesk/no-hardcoded-font-size 非 eslint rule，eslint 不认，靠 check 脚本自己认）。
 *
 * 15 项门禁载体双轨（07 §六·审计对齐）：
 *   - 本预设 = eslint 规则腿（rules 映射 12 项注册）；
 *   - 整工程扫描腿 = css-hardcode / font-scale / spacing-grid 三 check（lint.ts 调 run*Check）——
 *     css 与 rgb()/hsl() 的 hex 强拦、字号 token、间距 4px 节奏（eslint 到不了 .css）；
 *   - jscpd（克隆检测）= 项目级可选，不进预设（文档引导）。
 *   `npm run lint`（bin lint）两条腿都走，对标壳 check 同款双轨。
 *
 * 脚手架模板默认启用本预设（07 §八）；作者可自定义 eslint.config 后自管。
 */
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import importX from "eslint-plugin-import-x";
import type { Linter, ESLint } from "eslint";
import { linkdeskRuleMap } from "./rules.js";

type PluginShape = ESLint.Plugin;

export interface PluginLintOptions {
  /** 参与 lint 的 glob（默认：ts/tsx/js/jsx） */
  files?: string[];
  /** 追加忽略 glob（叠在默认忽略集之上） */
  ignore?: string[];
  /** import-x/no-unresolved 解析用 tsconfig 路径（相对工程根；默认 ./tsconfig.json） */
  tsconfig?: string;
}

/** 默认忽略 = 构建产物 / 依赖 / 版本控制 / vite 缓存 / 声明文件 / 测试与 mock（对齐 scan.ts SKIP_DIRS 语义） */
const BASE_IGNORES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/dist-electron/**",
  "**/out/**",
  "**/coverage/**",
  "**/.git/**",
  "**/.vite/**",
  "**/*.d.ts",
  "**/*.{test,spec}.{ts,tsx,js,jsx}",
  "**/*.{fixture,mock}.{ts,tsx,js,jsx}",
];

export function linkdeskPluginLintConfig(options: PluginLintOptions = {}): Linter.Config[] {
  const files = options.files ?? ["**/*.{ts,tsx,js,jsx}"];
  const tsconfig = options.tsconfig ?? "./tsconfig.json";
  return [
    { ignores: [...BASE_IGNORES, ...(options.ignore ?? [])] },
    {
      files,
      languageOptions: {
        parser: tsparser,
        parserOptions: {
          ecmaVersion: "latest",
          sourceType: "module",
          ecmaFeatures: { jsx: true },
        },
      },
      // 脚本伪 id（linkdesk/no-hardcoded-font-size / no-nonstandard-spacing）不是 eslint rule——
      // 关掉 unused-disable 报告，eslint 不报"未找到规则"，靠 check 脚本自己认这些注释
      linterOptions: { reportUnusedDisableDirectives: "off" },
      // 各插件包的 configs 类型与 eslint 9 的 Plugin.configs 联合类型跨包漂移（tseslint 8 / react-hooks 7 /
      // import-x 4 各自定义 configs），运行时语义兼容——统一按 eslint Plugin 收窄（eslint-config-* 生态同法）
      plugins: {
        "@typescript-eslint": tseslint as unknown as PluginShape,
        linkdesk: { rules: linkdeskRuleMap } as unknown as PluginShape, // kebab 键 = eslint 按原样查（无 camel 转换）
        "react-hooks": reactHooks as unknown as PluginShape,
        "import-x": importX as unknown as PluginShape,
      },
      settings: {
        "import-x/resolver": {
          typescript: { alwaysTryTypes: true, project: tsconfig },
        },
      },
      rules: {
        // ═══ 07 §六 · React 通用陷阱 6 条（react-hooks 官方 2 + 移植 4）═══
        "react-hooks/rules-of-hooks": "warn",
        "react-hooks/exhaustive-deps": "warn",
        "linkdesk/no-async-init-guard-only": "warn",
        "linkdesk/no-effect-callback-without-active-guard": "warn",
        "linkdesk/no-dynamic-import-in-effect-cleanup": "warn",
        "linkdesk/no-ref-current-in-jsx": "warn",
        // ═══ 07 §六 · 视觉统一 5 条（eslint 腿；css + rgb/hsl 腿 = lint.ts 三 check）═══
        "linkdesk/no-hardcoded-zh": "warn", // ts/tsx UI 文案中文字面量——推荐 t()
        "linkdesk/no-hardcoded-hex": "warn", // ts/tsx hex（同 disable id = 强化版 css 腿，见 css-hardcode.ts）
        "linkdesk/no-hardcoded-radius": "warn", // border-radius 裸 px——推荐 var(--radius-*)/var(--surface-radius)
        "import-x/no-unresolved": "warn", // 模块路径拼错
        // ═══ 07 §六 · 审美 4 条（eslint 腿；spacing 腿在 lint.ts；jscpd 文档引导可选）═══
        "linkdesk/no-quickpick-render-item": "warn",
        "@typescript-eslint/no-explicit-any": "warn",
      },
    },
  ];
}
