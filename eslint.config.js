import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import importX from "eslint-plugin-import-x";
import linkdeskRules from "./eslint-local-rules.js";

export default [
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "plugins/**/*.ts", "plugins/**/*.tsx", "electron/**/*.ts", "shared/**/*.ts"],
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
      "import-x": importX,
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
    },
    rules: {
      // ═══ React Hooks 官方规则 ═══
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // ═══ 提交前自检 4：禁止插件 ID 硬编码 ═══
      // ⚠️ E3i #68a：暂用 warn——#69 清理完 v3 遗骨后改 error
      // 🔴 TODO E5 收尾：v3 遗留清理后改 error。当前 warn——存量 v3_ key 还存在
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
        // ═══ E5.5#10：插件独立铁律——禁止 pluginId 硬编码比较 ═══
        // if (t.pluginId === "editor") / if (pluginId === "serial-monitor") 等
        // 🔥 插件 ID 是动态的——新插件 ID 不应触发壳代码修改。应读 plugin.json 声明字段。
        {
          selector: "BinaryExpression[operator=/^[!=]==?$/] > Literal[value=/^[a-z]/]",
          message: "🚫 疑似 pluginId 硬编码比较。禁止 if (xxx.pluginId === \"字面量\")——请改为读 plugin.json 声明字段或 Registry 查询。如确为壳内部常量，请用大写常量（如 FALLBACK_PLUGIN_ID）代替裸字符串。",
        },
      ],

      // ═══ Phase 3→4 硬约束：标签页系统不持有 CardRegistry ═══
      // lifecycle.ts 是插件卸载清理——不是标签页系统，是合法的。
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

      // ═══ E3j #81 硬约束：禁止模块级 _initialized guard + IPC 监听器 ═══
      "linkdesk/no-module-level-ipc-listener": "error",

      // ═══ E5#11l Bug 4 硬约束：useEffect 内禁止 IPC 监听器（[ ] deps）═══
      "linkdesk/no-ipc-listener-in-effect": "error",
      "linkdesk/no-raw-configuration-read": "error",
      "linkdesk/no-raw-path-replace": "error",

      // ═══ E3.5 #CP17 硬约束：QuickPick 禁止 renderItem——新代码走 slot props ═══
      "linkdesk/no-quickpick-render-item": "error",

      // ═══ E5.7#45：Phase 10 死代码防线——已删概念字面量禁止复活（error 级） ═══
      // OverlayWindow / sidebarPoolView / pluginViews / instanceId 随 per-tab 多实例
      // 与多Pool 模型消亡（E5.7#12/#19/#41-#44）——新代码出现即死代码回潮。
      // 设计出处：清理方案 §5。⚠️ 实现用独立本地规则而非 no-restricted-syntax 的第二个
      // 条目——flat config 同规则跨块合并时高 severity 胜出且低 severity 的 options 被丢弃，
      // 实测会静默吞掉上方 warn 级 v3-/pluginId 硬编码选择器（859→537 警告消失）。
      "linkdesk/no-deleted-e5.7-concepts": "error",

      // ═══ 防止副作用写在 setState 内部（B25 教训） ═══
      // 此规则在 TypeScript 层面无法精确检测，由 code review 辅助。
      // 原则：setState((prev) => { ... return newState }) 内不放 appendLine/emit/invoke。

      // ═══ 导入机械防线——与 tsc 互补 ═══
      // 模块路径拼错（tsc 也会抓，但 ESLint 更快；双保险）
      "import-x/no-unresolved": "error",

      // ═══ 建议规则 ═══
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // ═══ CardRegistry 硬约束例外 ═══
  // lifecycle.ts = 插件卸载清理——不是标签页系统
  // RegistryLifecycle.test.ts = 测试插件卸载清理路径
  {
    files: ["src/pluginLoader/lifecycle.ts", "src/core/__tests__/RegistryLifecycle.test.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },

  // ═══ E5#85：插件禁止 import @src/core——走 linkdesk.* API 合同 ═══
  // 白名单（42 处保留）：Emitter/CoreEvents（事件工具类）、type imports（类型定义）、
  //   ViewContainerService/useConfiguration/SidebarTabSync/EncodingService（壳内组件/React hooks）、
  //   RingBuffer/DataConverter/FileSearcher（纯数据结构/壳级服务）、
  //   KeybindingRegistry/ProtocolRegistry/LangDefRegistry（声明式注册，暂未 linkdesk API 化）
  {
    files: ["plugins/**/*.ts", "plugins/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@src/core/services/ConfigurationService", "@src/core/services/pathUtils"],
              message: "🚫 禁止 import ConfigurationService/pathUtils——请使用 linkdesk.configuration/linkdesk.path API。",
            },
          ],
        },
      ],
      // 🔥 E5#116: 插件 import @src/core/* → warn——多 WebView 火种机械检查
      // whitelist 在 eslint-local-rules.js PLUGIN_IMPORT_WHITELIST
      "linkdesk/no-core-import-in-plugin": "warn",
      // E5#106: JSX 中文必须走 t() 包裹——warn 级，不阻塞构建
      "linkdesk/no-hardcoded-chinese": "warn",
    },
  },

  // ═══ E5.6#11.5n：Path B——池核心隔离 ═══
  // 池是独立 JS 堆——禁止 import @src/core/*（import type 除外）。
  // 所有核心服务走 window.linkdesk.* → IPC → 壳唯一真相源。
  // 详见 docs/02-Electron架构/E5.6_Pool模型重构/SidebarPool/E5.6-11.5-池核心隔离-PathB.md
  {
    files: ["src/pool/**/*.ts", "src/pool/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@src/core",
              message: "🚫 Path B：池禁止 import @src/core。请使用 window.linkdesk.* API 或内联工具类。type-only import 用 `import type { X } from \"@src/core/...\"` 即可通过。详见 docs/02-Electron架构/E5.6_Pool模型重构/SidebarPool/E5.6-11.5-池核心隔离-PathB.md",
              allowTypeImports: true,
            },
          ],
          patterns: [
            {
              group: ["@src/core/**"],
              message: "🚫 Path B：池禁止 import @src/core/*。请使用 window.linkdesk.* API 或内联工具类。type-only import 用 `import type { X } from \"@src/core/...\"` 即可通过。详见 docs/02-Electron架构/E5.6_Pool模型重构/SidebarPool/E5.6-11.5-池核心隔离-PathB.md",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
];
