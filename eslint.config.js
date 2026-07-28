import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import linkdeskRules from "./eslint-local-rules.js";

export default [
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "plugins/**/*.ts", "plugins/**/*.tsx", "electron/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "linkdesk": { rules: linkdeskRules },
      "react-hooks": reactHooks,
    },
    rules: {
      // ═══ React Hooks 官方规则 ═══
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // ═══ 提交前自检 4：禁止插件 ID 硬编码 ═══
      // ⚠️ E3i #68a：暂用 warn——#69 清理完 v3 遗骨后改 error
      "no-restricted-syntax": [
        "warn",
        // v3- 遗骨禁止新增（字符串字面量）
        {
          selector: "Literal[value=/^v3[-_]/]",
          message: "🚫 禁止新增 v3- 前缀标识符。请改用 linkdesk- 或 CUSTOM_EVENTS 常量。",
        },
        // v3 前缀变量名禁止新增（如 v3Api / V3Config / __v3Hook）
        {
          selector: "Identifier[name=/^(__)?[vV]3[A-Z_]/]",
          message: "🚫 禁止新增 v3 前缀标识符。请改用 linkdesk 或描述性名称。",
        },
      ],

      // ═══ Phase 3→4 硬约束：标签页系统不持有 CardRegistry ═══
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/CardRegistry*", "**/cardRegistry*", "**/card-registry*"],
              message:
                "🚫 硬约束：标签页系统不持有/访问/导入 CardRegistry。唯一接触点 = Tab.workspaceName: string。",
            },
          ],
        },
      ],

      // ═══ #59c 硬约束 13：async init 竞态 ═══
      "linkdesk/no-async-init-guard-only": "error",

      // ═══ #59c 硬约束 14：effect 回调缺活跃守卫 ═══
      "linkdesk/no-effect-callback-without-active-guard": "warn",

      // ═══ #58e 硬约束 17：JSX 中禁止 ref.current 直接渲染 ═══
      "linkdesk/no-ref-current-in-jsx": "error",

      // ═══ #36k2 硬约束：useEffect/useCallback cleanup 禁止动态 import() ═══
      "linkdesk/no-dynamic-import-in-effect-cleanup": "error",

      // ═══ 防止副作用写在 setState 内部（B25 教训） ═══
      // 此规则在 TypeScript 层面无法精确检测，由 code review 辅助。
      // 原则：setState((prev) => { ... return newState }) 内不放 appendLine/emit/invoke。

      // ═══ 建议规则 ═══
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
