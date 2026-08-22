import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import importX from "eslint-plugin-import-x";
import linkdeskRules from "./eslint-local-rules.js";

export default [
  // E5.8#19：契约生成物（contracts/linkdesk.d.ts）不 lint——纯类型自动生成，机器输出
  { ignores: ["contracts/**"] },
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
      // E3i #68a 兑现（E5.7#101 2026-08-16）：v3 遗骨已清零——v3Api.ts 整删、
      // v3_ 存储 key 早已迁移（linted 代码 grep 零残留）——两 selector 升 error
      "no-restricted-syntax": [
        "error",
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
        // ═══ E5.5#10 → E5.7#95：pluginId 硬编码比较已收窄 + 补盲点后独立成局 ═══
        // 原宽 selector（任何与小写字符串字面量的比较，294 处误伤）已由
        // linkdesk/no-plugin-id-hardcode（error 级）取代——selector 收窄到 pluginId 语境
        // + 补 switch(pluginId)/arr.includes 盲点。详见 eslint-local-rules.js noPluginIdHardcode。
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

      // ═══ E5.8#6.6 硬约束 1：颜色禁止硬编码 hex——走 CSS 变量 var(--xxx) ═══
      // 豁免（规则内建 path 白名单）：主题定义/i18n/取色器/canvas/测试文件；
      // var(--x, #hex) 回退值合规；默认色数据 inline eslint-disable 带理由。
      "linkdesk/no-hardcoded-hex": "error",

      // ═══ E5.7#45：Phase 10 死代码防线——已删概念字面量禁止复活（error 级） ═══
      // OverlayWindow / sidebarPoolView / pluginViews / instanceId 随 per-tab 多实例
      // 与多Pool 模型消亡（E5.7#12/#19/#41-#44）——新代码出现即死代码回潮。
      // 设计出处：清理方案 §5。⚠️ 实现用独立本地规则而非 no-restricted-syntax 的第二个
      // 条目——flat config 同规则跨块合并时高 severity 胜出且低 severity 的 options 被丢弃，
      // 实测会静默吞掉上方 warn 级 v3-/pluginId 硬编码选择器（859→537 警告消失）。
      "linkdesk/no-deleted-e5.7-concepts": "error",

      // ═══ E5.7#95：pluginId 硬编码比较（error）——原 no-restricted-syntax pluginId selector
      // 收窄 + switch/includes 盲点后的独立规则（#45 实测：同规则跨块合并会吞低 severity options）═══
      "linkdesk/no-plugin-id-hardcode": "error",

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

  // ═══ E5.7#52：Registry 主进程化机械防线——electron/ 禁 import 壳侧注册表模块 ═══
  // 跨进程模块实例隔离：TS 模块每进程一份实例。主进程 import 壳侧 Registry =
  // 拿到主进程自己的空实例（壳写入的数据不可见，数据在壳进程的模块副本里）。
  // 静态声明三表（LangDef/Protocol/FileAssociation）唯一写入方 = electron/plugins/plugin-manifest-loader.ts
  // （启动扫盘 + plugins:rescanManifests 全清全重扫），唯一读取方 = electron/ipc/handlers/registry-handlers.ts
  // （IPC 直答）——两文件白名单放行（见下方例外块）。
  // 其余注册表（Command/Menu/Keybinding/Configuration 等）不迁——主进程经 IPC 收取，禁止直 import。
  // import type 不受限（纯类型，不携带模块级状态）。
  // 设计出处：docs/02-Electron架构/E5.7_极简Pool/Registry主进程化/Registry主进程化设计.md §5
  {
    files: ["electron/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/src/core/registry/*"],
              message:
                "🚫 E5.7#52：主进程禁止 import 壳侧注册表模块——跨进程模块实例隔离，主进程拿到的是自己的空实例。LangDef/Protocol/FileAssociation 唯一写入方 = electron/plugins/plugin-manifest-loader.ts，读取走 electron/ipc/handlers/registry-handlers.ts IPC；其余注册表经 IPC 收取，禁止主进程直 import。type-only import 用 `import type` 即可通过。",
              allowTypeImports: true,
            },
            {
              group: [
                "**/src/core/services/FileAssociationService*",
                "**/src/core/services/ViewContainerService*",
              ],
              message:
                "🚫 E5.7#52：主进程禁止 import 壳侧注册表服务——跨进程模块实例隔离，主进程拿到的是自己的空实例。FileAssociation 唯一写入方 = electron/plugins/plugin-manifest-loader.ts，读取走 electron/ipc/handlers/registry-handlers.ts IPC；ViewContainerService 经 IPC 收取，禁止主进程直 import。type-only import 用 `import type` 即可通过。",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },

  // ═══ E5.7#52 白名单：主进程注册表唯一写入方/读取方 ═══
  // plugin-manifest-loader = 启动扫盘 + plugins:rescanManifests 全清全重扫（唯一写入方）
  // registry-handlers = IPC 直答（唯一读取方）——两文件之外出现 import 即空实例 bug 回潮
  {
    files: ["electron/plugins/plugin-manifest-loader.ts", "electron/ipc/handlers/registry-handlers.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
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
              group: ["@src/core/services/ConfigurationService", "@src/core/utils/path/pathUtils"],
              message: "🚫 禁止 import ConfigurationService/pathUtils——请使用 linkdesk.configuration/linkdesk.path API。",
            },
          ],
        },
      ],
      // 🔥 E5#116: 插件 import @src/core/* → 多 WebView 火种机械检查。
      // E5.7#80 升级 error：测试文件豁免（vitest 单进程，多 WebView 理由不成立）
      // + 纯类型 import 豁免（类型擦除后零运行时耦合）——豁免后现存违规清零。
      // whitelist 在 eslint-local-rules.js PLUGIN_IMPORT_WHITELIST
      "linkdesk/no-core-import-in-plugin": "error",
      // E5#106 → E5.8#6.6 升级 error：JSX 中文必须走 t()（硬约束 2；覆盖 plugins/**）
      "linkdesk/no-hardcoded-chinese": "error",
    },
  },

  // ═══ E5.8#6.6：JSX 中文必须走 t()——扩覆盖壳+池（硬约束 2；原仅 plugins/**，src/** 裸奔）
  // 2026-08-19 实证修正：no-hardcoded-chinese 原只查 plugins/**，src/** 中文从未被查。
  // plugins 块 error（上方）+ src 块 error（此块）——#6.6 清零后升 error 收官。
  // 规则盲区已修（isInJsxContext 穿透三元/逻辑链——FilePathInput 教训）。
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "linkdesk/no-hardcoded-chinese": "error",
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
