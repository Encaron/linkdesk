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

// ═══════════════════════════════════════════════════════════
// 规则 3：useEffect cleanup 禁止动态 import()
// ═══════════════════════════════════════════════════════════
//
// #36k2 教训：cleanup 中的 import() 异步执行，
// StrictMode 下在重挂载后 resolve → 误删新注册的数据。
//
// 错误示例：
//   useEffect(() => {
//     registerCommands();
//     return () => {
//       import("./registry").then(m => m.unregister()); // ← 异步！在重挂载后执行
//     };
//   }, []);
//
// 正确示例：
//   import { unregister } from "./registry"; // ← 顶部静态 import
//   useEffect(() => {
//     registerCommands();
//     return () => { unregister(); }; // ← 同步执行
//   }, []);

const noDynamicImportInEffectCleanup = {
  meta: {
    type: "problem",
    docs: {
      description: "useEffect cleanup 禁止动态 import()——异步执行在 StrictMode 重挂载后误删新数据",
      recommended: true,
    },
    messages: {
      dynamicImport:
        "🔥 useEffect cleanup 中禁止动态 import()。" +
        " import() 异步执行——React StrictMode 会先 unmount（触发此 cleanup）再 mount（重新注册），" +
        " 异步 import 在 mount 之后才 resolve → 把新注册的数据也删了（#36k2 教训）。" +
        " 修复：改成文件顶部静态 import。",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        // 只检查 useEffect / useCallback
        if (
          node.callee.type !== "Identifier" ||
          (node.callee.name !== "useEffect" && node.callee.name !== "useCallback")
        )
          return;

        const args = node.arguments;
        if (args.length === 0) return;
        const body = args[0];
        if (!body || (body.type !== "ArrowFunctionExpression" && body.type !== "FunctionExpression"))
          return;

        // 检查函数体中的 return 语句
        const bodyNode = body.body;
        if (!bodyNode) return;

        // 箭头函数直接返回 → 检查表达式
        if (bodyNode.type === "CallExpression" && bodyNode.callee?.type === "Import") {
          context.report({ node: bodyNode, messageId: "dynamicImport" });
          return;
        }

        // 函数体 → 遍历所有 return 语句
        if (bodyNode.type !== "BlockStatement") return;
        for (const stmt of bodyNode.body) {
          if (stmt.type !== "ReturnStatement" || !stmt.argument) continue;
          checkForDynamicImport(stmt.argument, context);
        }
      },
    };
  },
};

/** AST 属性名——只遍历这些语法子节点，跳过 parent/scope 等元数据属性 */
const AST_CHILD_KEYS = new Set([
  "body", "expression", "argument", "callee", "alternate", "consequent",
  "test", "init", "left", "right", "object", "property", "elements",
  "declarations", "params", "id", "handler", "finalizer",
]);

/** 递归检查子树中的动态 import() 调用（跳过 parent 等循环引用属性） */
function checkForDynamicImport(node, context, depth = 0) {
  if (!node || depth > 20) return; // 深度限制防意外
  if (node.type === "CallExpression" && node.callee?.type === "Import") {
    context.report({ node, messageId: "dynamicImport" });
    return;
  }
  for (const key of AST_CHILD_KEYS) {
    const child = node[key];
    if (!child) continue;
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === "string") checkForDynamicImport(item, context, depth + 1);
      }
    } else if (typeof child.type === "string") {
      checkForDynamicImport(child, context, depth + 1);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// 规则 4：JSX 中禁止 ref.current 直接用于渲染
// ═══════════════════════════════════════════════════════════
//
// #58e 教训：异步更新 ref.current 不触发重渲染 → UI 与实际状态脱节。
// 渲染决策走 useState，ref 仅用于 DOM 引用/前值对比/generation counter。
//
// 错误示例：
//   const idsRef = useRef(new Set());           // ← 用 ref 存渲染状态
//   return <div>{idsRef.current.size} 项</div>; // ← ref 更新不重渲染
//
// 正确示例：
//   const [ids, setIds] = useState(new Set());  // ← state 驱动渲染
//   return <div>{ids.size} 项</div>;

const noRefCurrentInJsx = {
  meta: {
    type: "problem",
    docs: {
      description: "JSX 中禁止 ref.current 直接用于渲染——ref 更新不触发重渲染",
      recommended: true,
    },
    messages: {
      noRefCurrent:
        "🔥 JSX 中禁止 {{name}}.current——ref 更新不触发 React 重渲染。" +
        " 异步拿到数据 → ref 更新 → 组件不知道 → 下次任何事件触发重渲染时突然切状态 → UI 跳变/空白（#58e 教训）。" +
        " 修复：改用 useState。ref 仅用于 DOM 引用/前值对比/generation counter。",
    },
  },

  create(context) {
    return {
      // 捕获 JSX 表达式容器中的 .current 访问
      "JSXExpressionContainer > MemberExpression[property.name='current']"(node) {
        const objectName = node.object.type === "Identifier" ? node.object.name : "?";
        context.report({
          node,
          messageId: "noRefCurrent",
          data: { name: objectName },
        });
      },
    };
  },
};

export default {
  "no-async-init-guard-only": noAsyncInitGuardOnly,
  "no-effect-callback-without-active-guard": noEffectCallbackWithoutActiveGuard,
  "no-dynamic-import-in-effect-cleanup": noDynamicImportInEffectCleanup,
  "no-ref-current-in-jsx": noRefCurrentInJsx,
};
