/**
 * LinkDesk 自定义 ESLint 规则——#59c 教训。
 *
 * 两条规则覆盖两个 runtime bug 模式，静态分析防重演：
 *   1. no-async-init-guard-only — async 函数设 _initialized=true 后不返 Promise
 *   2. no-effect-callback-without-active-guard — useEffect 依赖回调 prop 但缺活跃守卫
 *
 * 使用：eslint.config.js 中 import 并注册到 plugins。
 */

// ═══════════════════════════════════════════════════════════
// 规则 1：async 初始化函数的 _initialized guard 必须配 _loadingPromise
// ═══════════════════════════════════════════════════════════
//
// 错误示例：
//   export async function initXxx(): Promise<void> {
//     if (_initialized) return;          // ← guard 正确，但不安全
//     _initialized = true;               // ← 在 await 前面设 true
//     await doAsyncWork();               // ← 还没完成但 _initialized 已 true
//   }
//
// 正确示例：
//   let _loadingPromise: Promise<void> | null = null;
//   export async function initXxx(): Promise<void> {
//     if (_initialized) return _loadingPromise ?? Promise.resolve();
//     _initialized = true;
//     return (_loadingPromise = (async () => { ... })());
//   }

const noAsyncInitGuardOnly = {
  meta: {
    type: "problem",
    docs: {
      description: "async init 函数 _initialized guard 必须配 _loadingPromise 防 StrictMode 竞态",
      recommended: true,
    },
    messages: {
      noLoadingPromise:
        "🔥 async init 函数 {{name}} 在 await 前设 _initialized=true，未返回 _loadingPromise。" +
        " StrictMode 双重 effect 第二次调用会跳过加载但后面的 applyConfiguration 等操作可能尚未就绪。" +
        " 修复：if (_initialized) return _loadingPromise ?? Promise.resolve(); return (_loadingPromise = (async () => { ... })());",
    },
  },

  create(context) {
    // 跟踪 async 函数内的 _initialized 赋值
    let initializedSet = false;
    let hasAwaitAfter = false;
    let hasLoadingPromise = false;
    let functionName = "";

    return {
      // 进入 async 函数声明/表达式
      ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression)[async=true]"(node) {
        initializedSet = false;
        hasAwaitAfter = false;
        hasLoadingPromise = false;
        functionName = (node.id && node.id.name) || "";
      },

      // 检测 _initialized = true
      "AssignmentExpression[left.type='Identifier'][left.name='_initialized']"(node) {
        if (node.right.value === true) {
          initializedSet = true;
        }
      },

      // 检测 _loadingPromise 引用
      "Identifier[name='_loadingPromise']"() {
        hasLoadingPromise = true;
      },

      // 检测 await（在 _initialized 赋值之后）
      "AwaitExpression"() {
        if (initializedSet) {
          hasAwaitAfter = true;
        }
      },

      // 离开函数时检查
      ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression)[async=true]:exit"(node) {
        if (initializedSet && hasAwaitAfter && !hasLoadingPromise) {
          context.report({
            node,
            messageId: "noLoadingPromise",
            data: { name: functionName || "(anonymous)" },
          });
        }
        initializedSet = false;
        hasAwaitAfter = false;
        hasLoadingPromise = false;
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 规则 2：useEffect 依赖回调 prop 但缺活跃守卫
// ═══════════════════════════════════════════════════════════
//
// 错误示例：
//   useEffect(() => {
//     if (onHighlight && items.length > 0) {
//       onHighlight(items[0]);  // ← 组件 return null 时 effect 照跑
//     }
//   }, [selected, items, onHighlight]);  // ← onHighlight 是 prop 回调
//
// 正确示例：
//   useEffect(() => {
//     if (!open) return;                       // ← 活跃守卫
//     if (onHighlight && items.length > 0) {
//       onHighlight(items[0]);
//     }
//   }, [open, selected, items, onHighlight]);  // ← open 在依赖里

const noEffectCallbackWithoutActiveGuard = {
  meta: {
    type: "problem",
    docs: {
      description: "useEffect 依赖回调 prop 必须有 if (!open)/if (!isActive) 活跃守卫",
      recommended: true,
    },
    messages: {
      missingGuard:
        "🔥 useEffect 依赖了回调 prop (onChange/onHighlight/onSelect/onApply)，但没有 if (!open) 或 if (!isActive) 活跃守卫。" +
        " 组件 return null 时 React effect 照跑——回调可能意外触发全局副作用。" +
        " QuickPick/ThemeBrowser/LanguagePicker 等面板组件必加。修复：加 if (!open) return + open 纳入依赖。",
    },
  },

  create(context) {
    const CALLBACK_PROP_PATTERN = /^on(Change|Highlight|Select|Apply|Close|Toggle|Submit)$/;

    return {
      CallExpression(node) {
        // 只检查 useEffect
        if (
          node.callee.type !== "Identifier" ||
          node.callee.name !== "useEffect"
        )
          return;

        const args = node.arguments;
        if (args.length < 2) return;
        const depsArg = args[1];
        if (!depsArg || depsArg.type !== "ArrayExpression") return;

        const body = args[0];
        if (!body || (body.type !== "ArrowFunctionExpression" && body.type !== "FunctionExpression"))
          return;

        // 检查依赖数组是否包含回调 prop 名
        const callbackDeps = depsArg.elements.filter((el) => {
          if (!el || el.type !== "Identifier") return false;
          return CALLBACK_PROP_PATTERN.test(el.name);
        });

        if (callbackDeps.length === 0) return;

        // 检查 body 是否有活跃守卫
        const bodyText = context.getSourceCode().getText(body);
        const hasActiveGuard =
          /\bif\s*\(\s*!\s*(?:open|isActive|active|visible|enabled)\s*\)/.test(bodyText);

        if (hasActiveGuard) return;

        // 报告
        context.report({
          node,
          messageId: "missingGuard",
        });
      },
    };
  },
};

export default {
  "no-async-init-guard-only": noAsyncInitGuardOnly,
  "no-effect-callback-without-active-guard": noEffectCallbackWithoutActiveGuard,
};
