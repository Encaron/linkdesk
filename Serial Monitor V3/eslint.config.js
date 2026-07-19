import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
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

      // ═══ 防止副作用写在 setState 内部（B25 教训） ═══
      // 此规则在 TypeScript 层面无法精确检测，由 code review 辅助。
      // 原则：setState((prev) => { ... return newState }) 内不放 appendLine/emit/invoke。

      // ═══ 建议规则（warning 而非 error） ═══
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
