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

// ═══════════════════════════════════════════════════════════
// 规则 5：禁止模块级函数注册 IPC 监听器（E3j #81 教训）
// ═══════════════════════════════════════════════════════════
//
// 检测：模块顶层函数中调用 .onData / .onStats / .onSystem / ipcRenderer.on，
// 且函数体引用了模块级 _ 开头的 let guard 变量。
//
// 不依赖函数名——任何模块顶层（非 hook、非嵌套）函数都拦。
// IPC 方法走 AST MemberExpression.property.name 精确匹配——注释/字符串不误报。
// guard 变量匹配放宽——任何 _ 开头的模块级 let 变量都算。
//
// 错误示例：
//   let _booted = false;
//   function initListeners() {   // ← 无 _ 前缀也拦
//     if (_booted) return;
//     _booted = true;
//     s.onData(callback);        // ← AST 精确命中
//   }
//
// 正确示例（方向 B）：
//   function initOnce() { ... listPorts(); }  // 无 IPC 监听器
//   useEffect(() => { _registerIPCListeners(); return _unregisterIPCListeners; }, []);

/** 从节点向上查找包含它的函数（跳过箭头/函数表达式，直到顶层函数声明） */
function findEnclosingFunction(node, stopAtType = "Program") {
  let cur = node;
  while (cur && cur.type !== stopAtType) {
    if (
      cur.type === "FunctionDeclaration" ||
      cur.type === "FunctionExpression" ||
      cur.type === "ArrowFunctionExpression"
    ) {
      return cur;
    }
    cur = cur.parent;
  }
  return null;
}

const noModuleLevelIpcListener = {
  meta: {
    type: "problem",
    docs: {
      description:
        "禁止模块级函数注册 IPC 监听器——必须走 React useEffect 生命周期（E3j #81）",
      recommended: true,
    },
    messages: {
      moduleIpc:
        "🔥 模块级函数 {{name}} 注册了 IPC 监听器（{{method}}）。" +
        " 模块级 = 导入执行一次 = 永不清理 → 壳 fallback 中成为僵尸回调。" +
        " 修复：拆为一次性数据拉取（模块级）+ useEffect 引用计数（_register/_unregister）。" +
        " 详见 memory [[serial-multi-tab-data-leak-fix]]。",
    },
  },

  create(context) {
    // 收集模块顶层所有 _ 开头的 let 变量
    const guardVars = new Set();

    return {
      // Step 1: 收集 guard 变量
      "Program > VariableDeclaration[kind='let'] > VariableDeclarator > Identifier[name=/^_/]"(
        node,
      ) {
        guardVars.add(node.name);
      },

      // Step 2: 检测 .onData / .onStats / .onSystem 调用
      "MemberExpression[property.name=/^on(Data|Stats|System)$/]"(
        node,
      ) {
        if (node.parent?.type !== "CallExpression") return;

        const func = findEnclosingFunction(node);
        if (!func) return;

        const funcName = (func.id && func.id.name) || "";
        if (funcName.startsWith("use")) return;

        // 检查是否在 Program 的直接子级（模块顶层，非嵌套在 useEffect/useCallback 内）
        if (func.parent?.type !== "Program" &&
            func.parent?.parent?.type !== "Program" &&
            func.parent?.parent?.parent?.type !== "Program") {
          return;
        }

        // 检查函数体是否引用了 guard 变量
        const funcText = context.getSourceCode().getText(func);
        let hasGuard = false;
        for (const v of guardVars) {
          if (funcText.includes(v)) { hasGuard = true; break; }
        }
        if (!hasGuard) return;

        context.report({
          node: func,
          messageId: "moduleIpc",
          data: { name: funcName || "(anonymous)", method: node.property.name },
        });
      },

      // Step 3: 检测 ipcRenderer.on( 调用
      "CallExpression > MemberExpression[object.name='ipcRenderer'][property.name='on']"(
        node,
      ) {
        const func = findEnclosingFunction(node);
        if (!func) return;

        const funcName = (func.id && func.id.name) || "";
        if (funcName.startsWith("use")) return;

        if (func.parent?.type !== "Program" &&
            func.parent?.parent?.type !== "Program" &&
            func.parent?.parent?.parent?.type !== "Program") {
          return;
        }

        const funcText = context.getSourceCode().getText(func);
        let hasGuard = false;
        for (const v of guardVars) {
          if (funcText.includes(v)) { hasGuard = true; break; }
        }
        if (!hasGuard) return;

        context.report({
          node: func,
          messageId: "moduleIpc",
          data: { name: funcName || "(anonymous)", method: "ipcRenderer.on" },
        });
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 规则 6：禁止 QuickPick renderItem——新代码必须走 slot props
// ═══════════════════════════════════════════════════════════
//
// E3.5 #CP17 QuickPick 布局归一化：renderItem 自由度过高导致视觉不统一。
// 新代码必须用 renderLabel/renderCategory/renderDetail/renderDetailRight。
// renderItem 仅保留向后兼容，已迁移的 5 个消费者全部切 slot。
//
// 错误示例：
//   <QuickPick renderItem={(item) => <span>...</span>} ... />
//
// 正确示例：
//   <QuickPick renderLabel={(item) => item.title} renderDetail={(item) => item.id} ... />

const noQuickpickRenderItem = {
  meta: {
    type: "problem",
    docs: {
      description: "QuickPick 禁止 renderItem——新代码必须用 structured slot props",
      recommended: true,
    },
    messages: {
      noRenderItem:
        "🔥 QuickPick renderItem 已废弃——E3.5 #CP17 布局归一化后禁止使用。" +
        " renderItem 自由度过高导致各面板视觉不统一。" +
        " 改用 slot props：renderLabel / renderCategory / renderDetail / renderDetailRight。" +
        " 详见 docs/02-Electron架构/E3.5-软件生态美化/命令面板美化/03-QuickPick布局归一化.md",
    },
  },

  create(context) {
    return {
      // 匹配 <QuickPick renderItem={...} ... />
      JSXElement(node) {
        const tagName = node.openingElement.name;
        if (tagName.type !== "Identifier" || tagName.name !== "QuickPick") return;

        for (const attr of node.openingElement.attributes) {
          if (attr.type === "JSXAttribute" && attr.name.type === "JSXIdentifier" && attr.name.name === "renderItem") {
            context.report({ node: attr, messageId: "noRenderItem" });
            return;
          }
        }
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 规则 7：React 组件内禁止裸调 getConfigurationValue——必须用 useConfigurationValue hook
// ═══════════════════════════════════════════════════════════
//
// excludeGitIgnore 漏订阅 bug 教训：getConfigurationValue + onDidChangeConfiguration 是
// 两个独立调用——人脑配对，漏了就是死配置（改设置不生效）。
// useConfigurationValue hook 内部已配对——用 hook 不可能漏。
//
// 错误示例（组件函数体内）：
//   function MyView() {
//     const val = getConfigurationValue<boolean>("my.config"); // ← 漏订阅
//     return <div>{val}</div>;
//   }
//
// 正确示例：
//   function MyView() {
//     const val = useConfigurationValue<boolean>("my.config"); // ← 自动订阅
//     return <div>{val}</div>;
//   }
//
// 非 React 代码（.ts 文件、async handler 内）不受限——直调 getConfigurationValue 合法。

const noRawConfigurationRead = {
  meta: {
    type: "problem",
    docs: {
      description: "React 组件内禁止裸调 getConfigurationValue——必须用 useConfigurationValue hook 防漏订阅",
      recommended: true,
    },
    messages: {
      noRawRead:
        "🔥 React 组件内禁止裸调 getConfigurationValue('{{key}}')。" +
        " 只读不订阅 = 改设置不生效（excludeGitIgnore 漏订阅教训）。" +
        " 修复：改用 useConfigurationValue<{{type}}>('{{key}}')——hook 内部已配 onDidChangeConfiguration。" +
        " 非组件代码（.ts / 模块级函数 / async handler 内）可忽略此规则。",
    },
  },

  create(context) {
    const filename = context.filename || context.getFilename?.() || "";

    /** 判断函数是否在 React 组件内——查找祖先函数有没有大写开头的（组件惯例） */
    function isInsideComponent(node) {
      let cur = node.parent;
      while (cur) {
        if (
          cur.type === "FunctionDeclaration" ||
          cur.type === "FunctionExpression" ||
          cur.type === "ArrowFunctionExpression"
        ) {
          const name = cur.id?.name || "";
          // 组件惯例：函数名大写开头（FoldersView/App/SettingsView）
          if (name && /^[A-Z]/.test(name)) return true;
        }
        cur = cur.parent;
      }
      return false;
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type !== "Identifier" ||
          node.callee.name !== "getConfigurationValue"
        )
          return;

        if (!filename.endsWith(".tsx")) return;

        const func = findEnclosingFunction(node);
        if (!func) return;

        // async 函数 → handler/syncRoots → 允许
        if (func.async) return;

        // use 开头 → 已在 hook 内 → 允许
        const funcName = (func.id && func.id.name) || "";
        if (funcName.startsWith("use")) return;

        // 不在 React 组件内 → 模块级函数 → 允许
        if (!isInsideComponent(node)) return;

        const keyArg = node.arguments[0];
        const key = keyArg && keyArg.type === "Literal" ? keyArg.value
          : context.getSourceCode().getText(keyArg || node);

        context.report({
          node,
          messageId: "noRawRead",
          data: { key, type: "T" },
        });
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 规则 8：禁止手写 replace(/\\/g, "/") —— 必须走 normalizePath
// ═══════════════════════════════════════════════════════════
//
// E4V#60 路径归一化。Windows \ vs / 正反斜杠不匹配是反复出现的 bug：
// WorkspaceService.addFolder/removeFolder → findIndex === → 找不到
// compileGlob dist/ 尾斜杠 → 不匹配
// 每次都是不同模块忘了归一化。现在 normalizePath 已提到 core——
// 手写 replace(/\\/g, "/") 等于绕过唯一正源。
//
// 错误示例：
//   const p = uri.replace(/\\/g, "/");          // ← 绕过 normalizePath
//   const match = raw.includes(p.replace(/\\/g, "/")); // ← 同上
//
// 正确示例：
//   import { normalizePath } from "@src/core/utils/path/pathUtils"; // 或 from "./path/pathUtils"
//   const p = normalizePath(uri);
//
// 例外：src/core/utils/path/pathUtils.ts 自身（唯一正源定义处）

const noRawPathReplace = {
  meta: {
    type: "problem",
    docs: {
      description: "禁止手写 replace(/\\\\/g, '/')——必须走 normalizePath（E4V#60 归一化）",
      recommended: true,
    },
    messages: {
      noRawReplace:
        "🔥 禁止手写 replace(/\\\\/g, '/')——必须走 normalizePath。" +
        " Windows \\ vs / 不匹配是反复出现的 bug（WorkspaceService/compileGlob/dist尾斜杠）。" +
        " 修复：import { normalizePath } from '@src/core/utils/path/pathUtils' 然后 normalizePath(uri)。" +
        " src/core/utils/path/pathUtils.ts 自身是唯一正源定义处——此规则不适用。",
    },
  },

  create(context) {
    const filename = (context.filename || context.getFilename?.() || "").replace(/\\/g, "/");

    // pathUtils.ts 自身是 normalizePath 正源定义处——放行
    if (filename.endsWith("/src/core/utils/path/pathUtils.ts")) return {};
    // electron/ main 进程独立构建——无法 import src/core/utils/path/pathUtils
    if (filename.includes("/electron/")) return {};

    return {
      Literal(node) {
        if (!node.regex) return;
        // 匹配 /\\/g 正则字面量
        const raw = node.raw || "";
        if (raw === "/\\\\/g" || raw === "/\\\\/gi") {
          // 检查是否用于 replace 调用
          const parent = node.parent;
          if (
            parent &&
            parent.type === "CallExpression" &&
            parent.callee.type === "MemberExpression" &&
            parent.callee.property.type === "Identifier" &&
            parent.callee.property.name === "replace"
          ) {
            // 检查 replace 的目标是否是字符串，替换值是否是 "/"
            const args = parent.arguments;
            if (args.length >= 2) {
              const replacement = args[1];
              if (
                replacement &&
                replacement.type === "Literal" &&
                (replacement.value === "/" || replacement.value === "\\")
              ) {
                context.report({
                  node: parent,
                  messageId: "noRawReplace",
                });
              }
            }
          }
        }
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 规则 9：useEffect 内禁止注册 IPC 监听器（E5#11l Bug 4 教训）
// ═══════════════════════════════════════════════════════════
//
// E5#11l 验证发现：useEffect(() => { pv.onReady(cb) }, []) 在 React mount
// 之后才注册 ipcRenderer.on——插件 WebView 的 notifyReady IPC 事件可能在此
// 之前到达，事件静默丢失，多 WebView 间歇性失效。
//
// 正确模式：preload 脚本模块顶层 ipcRenderer.on + 缓冲 + 回放。
// 详见 memory [[e5-multi-webview-6-bugs]] Bug 4。
//
// 错误示例：
//   useEffect(() => {
//     const pv = window.linkdesk.pluginViews;
//     pv.onReady((pluginId) => { ... });  // ← IPC 监听器在 mount 后才注册
//   }, []);
//
// 正确示例（preload-shell.ts 模块顶层）：
//   const _readyBuffer: string[] = [];
//   let _onReadyActive = false;
//   ipcRenderer.on('plugin-view:ready', (_e, pid) => {
//     if (!_onReadyActive) _readyBuffer.push(pid);
//   });
//   // contextBridge 暴露 onReady: (cb) => { 回放 + 注册 }

const noIpcListenerInEffect = {
  meta: {
    type: "problem",
    docs: {
      description:
        "useEffect 内禁止注册 IPC 监听器——事件可能在 mount 前到达（E5#11l Bug 4）",
      recommended: true,
    },
    messages: {
      noEffectIpc:
        "🔥 useEffect 内注册了 IPC 监听器（{{method}}），依赖数组为 []。" +
        " IPC 事件可能在 React mount 之前到达——事件静默丢失（E5#11l Bug 4 notifyReady 竞态）。" +
        " 修复：在 preload 脚本模块顶层用 ipcRenderer.on + 缓冲数组 + onReady 回调回放模式。" +
        " 详见 memory [[e5-multi-webview-6-bugs]] Bug 4 和 Bug 5 修法。",
    },
  },

  create(context) {
    // IPC 相关的方法名——onReady / onData / onStats / onSystem / ipcRenderer.on
    const IPC_METHODS = new Set(["onReady", "onData", "onStats", "onSystem"]);

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
        // 依赖数组非空 → 可能是有意的条件注册 → 放行（只拦截 [] 这种"只跑一次"的模式）
        if (
          !depsArg ||
          depsArg.type !== "ArrayExpression" ||
          depsArg.elements.length > 0
        )
          return;

        const body = args[0];
        if (
          !body ||
          (body.type !== "ArrowFunctionExpression" &&
            body.type !== "FunctionExpression")
        )
          return;

        const bodyText = context.getSourceCode().getText(body);

        // 检测 pv.onReady / xxx.onReady 调用
        for (const method of IPC_METHODS) {
          if (bodyText.includes(`.${method}(`)) {
            context.report({
              node,
              messageId: "noEffectIpc",
              data: { method: `.${method}` },
            });
            return;
          }
        }

        // 检测 ipcRenderer.on( 调用
        if (bodyText.includes("ipcRenderer.on(")) {
          context.report({
            node,
            messageId: "noEffectIpc",
            data: { method: "ipcRenderer.on" },
          });
        }
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 规则 10：插件 import 核心模块（多 WebView 火种——机械检查）
// ═══════════════════════════════════════════════════════════
//
// 多 WebView 下插件在独立 JS 堆——import 核心模块有副作用的调用静默失效。
// 此规则 warn 级——检测到后 AI 必须在 memory/plugin-import-exceptions.md 记录例外。
//
// 白名单（允许的 import，不触发 warn）：
//   - 纯类型/枚举: MenuRegistry 的 MenuId、plugin.json 的 tabBehavior/viewRole 类型
//   - 纯工具函数: RingBuffer/DataConverter/HexToBytes/DataDispatch/ProtocolParser/EncodingService/FileSearcher
//   - 已有 API 替代: 无（所有 Registry/Service 都应走 linkdesk.* API）

const PLUGIN_IMPORT_WHITELIST = new Set([
  // 纯类型 / 枚举
  "@src/core/registry/commands/MenuRegistry",  // MenuId 枚举
  // 纯工具函数（无模块级状态，无副作用）
  "@src/core/pipeline/DataConverter",
  "@src/core/pipeline/DataDispatch",
  "@src/core/pipeline/RingBuffer",
  "@src/core/pipeline/ProtocolParser",
  "@src/core/utils/CancellationToken",
  "@src/core/services/EncodingService",
  "@src/core/services/FileSearcher",
  // React hooks / context（纯渲染逻辑，无服务端状态）
  "@src/core/react/CoreEvents",
  "@src/core/react/useSendData",
  "@src/core/react/usePluginIpcEvent",
  "@src/core/hooks/useTabManager",
  "@src/core/hooks/useIpcEvent",
  // E5.8#20-c：测试专用运行时 import——FileTreeClipboard.test.ts 需真实 ContextKeyService 实例（唯一测试运行时例外，白名单收口）
  "@src/core/registry/commands/ContextKeyService",
]);

const noCoreImportInPlugin = {
  meta: {
    type: "problem",
    docs: {
      description:
        "插件禁止直接 import 核心模块——多 WebView 下静默失效。检查 memory/plugin-import-exceptions.md 记录例外。",
      recommended: true,
    },
    messages: {
      noCoreImport:
        "🔥 插件 import 了核心模块 \"{{source}}\"——多 WebView 下 {{reason}}。" +
        " 请确认 memory/plugin-import-exceptions.md 是否已记录此例外。" +
        " 若未记录：评估 → 记录原因+替代方案 → 或切到 linkdesk.* API。" +
        " 见 memory [[plugin-import-iron-law]]。",
    },
  },

  create(context) {
    const filename = context.filename || context.getFilename?.() || "";
    if (!filename.includes("plugins")) return {};

    // E5.8#20-d：测试豁免已取消（原 E5.7#80）——测试文件同样检查 @src/core import。
    // #20-c 迁移后插件零 @src/core 类型 import，唯一运行时例外 ContextKeyService 走白名单。
    // 判断模块类型的辅助函数
    function classify(source) {
      if (PLUGIN_IMPORT_WHITELIST.has(source)) return null; // 白名单——不报
      if (source.includes("/registry/") || source.includes("/services/"))
        return "有模块级状态（Registry/Service）→ 调用方的修改壳进程看不到";
      if (source.includes("@src/core"))
        return "插件和壳不在同一 JS 堆 → 副作用不共享";
      return null; // 非 @src/core —— 不报
    }

    return {
      ImportDeclaration(node) {
        // E5.8#20-d：类型 import 豁免已取消（原 E5.7#80）——类型擦除后虽零运行时耦合，
        // 但 #18 拍板"类型也禁"：插件类型消费唯一合法路径 = @linkdesk/contracts（契约产物）。
        const source = node.source.value;
        if (!source.startsWith("@src/core/")) return;
        const reason = classify(source);
        if (!reason) return;
        context.report({ node, messageId: "noCoreImport", data: { source, reason } });
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 规则 11：JSX 文本/属性中的硬编码中文必须走 t() 包裹
// ═══════════════════════════════════════════════════════════
//
// E5#36 已清理 42 处硬编码中文——但人是会忘的。此规则机械拦截。
// warn 级——不阻塞构建，但提醒开发者包 t()。
//
// 错误示例：
//   <span>你好</span>
//   <input placeholder="搜索..." />
//
// 正确示例：
//   <span>{t("你好")}</span>
//   <input placeholder={t("搜索...")} />

const CHINESE_RE = /[一-鿿]/;

function hasChinese(text) {
  return CHINESE_RE.test(text);
}

function isInsideTranslationCall(node) {
  let cur = node.parent;
  while (cur) {
    if (cur.type === "CallExpression") {
      const callee = cur.callee;
      if (callee.type === "Identifier" && (callee.name === "t" || callee.name === "i18n")) return true;
      if (callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" && callee.object.name === "i18n" &&
          callee.property.type === "Identifier" && callee.property.name === "t") return true;
    }
    if (cur.type === "JSXExpressionContainer" || cur.type === "JSXAttribute") break;
    cur = cur.parent;
  }
  return false;
}

// E5.8#6.6：字面量是否落在 JSX 表达式上下文——向上穿透三元/逻辑链。
// 盲区修复前 `placeholder={cond ? "选择目录…" : "选择文件…"}` 的 Literal 父级是
// ConditionalExpression 非 JSXExpressionContainer，规则漏报（FilePathInput 教训）。
// 只允许穿透 ConditionalExpression / LogicalExpression——遇到函数参数（CallExpression）
// 等非 JSX 容器立即 break，不扩大误报面。
function isInJsxContext(node) {
  let cur = node.parent;
  while (cur) {
    if (cur.type === "JSXExpressionContainer" || cur.type === "JSXAttribute") return true;
    if (cur.type === "ConditionalExpression" || cur.type === "LogicalExpression") {
      cur = cur.parent;
      continue;
    }
    break;
  }
  return false;
}

const noHardcodedChinese = {
  meta: {
    type: "suggestion",
    docs: {
      description: "JSX 中的中文字符必须走 t() 包裹——防 i18n 遗漏",
      recommended: true,
    },
    messages: {
      noChinese: "🔤 JSX 中的中文字符 \"{{text}}\" 未用 t() 包裹。" +
        " 修复：<span>{t(\"中文\")}</span> 或 placeholder={t(\"中文\")}。" +
        " 注释/console/测试文件可忽略。",
    },
  },

  create(context) {
    const filename = (context.filename || context.getFilename?.() || "");

    return {
      // JSX 标签间的文本：<span>你好</span>
      JSXText(node) {
        const text = node.value.trim();
        if (!text || !hasChinese(text)) return;
        context.report({
          node,
          messageId: "noChinese",
          data: { text: text.slice(0, 20) },
        });
      },

      // 字符串字面量：placeholder="搜索..." 或 const x = "你好"
      Literal(node) {
        if (typeof node.value !== "string" || !hasChinese(node.value)) return;

        // 跳过 t("...") / i18n.t("...") 内的字符串
        if (isInsideTranslationCall(node)) return;

        // 只报告 JSX 属性/表达式中的字符串（非 JSX 上下文走下一规则或忽略）。
        // E5.8#6.6：向上穿透三元/逻辑链（isInJsxContext），补 FilePathInput 盲区。
        if (isInJsxContext(node)) {
          context.report({
            node,
            messageId: "noChinese",
            data: { text: node.value.slice(0, 20) },
          });
        }
      },

      // 模板字符串：`你好 ${name}`
      TemplateLiteral(node) {
        if (node.quasis.length === 1 && hasChinese(node.quasis[0].value.raw)) {
          if (isInsideTranslationCall(node)) return;
          // E5.8#6.6：向上穿透三元/逻辑链（isInJsxContext），与 Literal 同判据
          if (isInJsxContext(node)) {
            context.report({
              node,
              messageId: "noChinese",
              data: { text: node.quasis[0].value.raw.slice(0, 20) },
            });
          }
        }
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 规则 11.5：E5.8#6.6 硬约束 1——颜色禁止硬编码 hex，走 CSS 变量 var(--xxx)
// ═══════════════════════════════════════════════════════════
//
// 拦截字符串字面量中的 `#hex`（3/4/6/8 位）。豁免策略：
//   1. var(--x, #hex) 回退值——本身就是合规形态（var() 主值 + hex 兜底）
//   2. 主题引擎默认色数据（ThemeEngine.ts / startup.ts `#0078d4`）——不是 UI 硬编码，
//      是主题未定义 token 时的兜底值；含 `#0078d4` 魔数本身来自主题契约（见文件注释）
//   3. 取色器（color-picker/）与预设色板（SettingRow presets / serial SESSION_COLORS）——
//      色板是"颜色即数据"（用户可选值），非样式硬编码
//   4. 测试文件 / Canvas 绘图（canvas 颜色必然硬编码，无 CSS 变量）
//
// 规则形态参照 no-hardcoded-chinese：只拦引号内字面量（注释/非字符串不拦），
// 豁免文件用 path 白名单（flat config 块级 options 传给自定义规则参数）。
const HEX_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;

// var(--x, #hex) 回退——整串里出现 var( 即视为回退形态（跳过 hex 单独匹配）
const CSS_VAR_FALLBACK_RE = /var\(/;

const noHardcodedHex = {
  meta: {
    type: "problem",
    docs: {
      description: "颜色禁止硬编码 hex——走 CSS 变量 var(--xxx)。硬约束 1（E5.8#6.6 机械哨兵）",
      recommended: true,
    },
    messages: {
      noHex:
        "🎨 颜色硬编码 hex \"{{text}}\" 未走 CSS 变量。硬约束 1：所有颜色走 var(--xxx)。" +
        " 若这是默认色数据/取色器色板/canvas 绘图，加 `// eslint-disable-next-line linkdesk/no-hardcoded-hex -- 理由` 并注明豁免类别。",
    },
  },

  create(context) {
    const filename = (context.filename || context.getFilename?.() || "").replace(/\\/g, "/");

    // 豁免文件类别（path 白名单——按审计账本五类证据）
    const isExemptFile =
      /\.(test|spec)\.(ts|tsx)$/.test(filename) ||
      /mock/i.test(filename) || // 测试 mock/桩数据文件（与 audit-i18n /mock/i 惯例一致——测试桩数据含主题色值等被测数据）
      /\/themes?\//.test(filename) || // 主题定义文件（主题即数据）
      /\/i18n\//.test(filename) || // i18n 资源（文案数据）
      /\/color-picker\//.test(filename) || // 取色器组件（色板数据）
      /canvas/i.test(filename); // Canvas 绘图（无 CSS 变量可用）

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (isExemptFile) return;
        if (!HEX_RE.test(node.value)) return;
        // var(--x, #hex) 回退值——合规形态
        if (CSS_VAR_FALLBACK_RE.test(node.value)) return;
        context.report({
          node,
          messageId: "noHex",
          data: { text: node.value.slice(0, 20) },
        });
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 规则 12：E5.7 Phase 10 已删概念字面量禁止复活（E5.7#45）
// ═══════════════════════════════════════════════════════════
//
// OverlayWindow / sidebarPoolView / pluginViews / instanceId 随 per-tab 多实例
// 与多Pool 模型消亡（E5.7#12/#19/#41-#44）。设计出处：
// docs/02-Electron架构/E5.7_极简Pool/清理/清理方案.md §5。
//
// ⚠️ 为什么不用 no-restricted-syntax 的第二个条目：flat config 同规则跨块合并时
// 高 severity 胜出且低 severity 的 options 被丢弃——实测会静默吞掉
// warn 级 v3-/pluginId 硬编码选择器（警告 859→537）。独立规则 = 独立 severity。
//
// 拦截字符串字面量（channel 名 / 日志标签 / 命名空间键）。注释不拦截（ESLint 语义）。

const noDeletedE57Concepts = {
  meta: {
    type: "problem",
    docs: {
      description: "E5.7 Phase 10 已删概念（OverlayWindow/sidebarPoolView/pluginViews/instanceId）字面量禁止复活",
      recommended: true,
    },
    messages: {
      deletedConcept:
        "🚫 E5.7 极简Pool 已删除此概念（{{value}}）——per-tab 多实例与多Pool 模型随 E5.7#12/#19/#41-#44 消亡。" +
        " 新代码不得出现这些字面量。详见 docs/02-Electron架构/E5.7_极简Pool/清理/清理方案.md §5。",
    },
  },

  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (/OverlayWindow|sidebarPoolView|pluginViews|instanceId/.test(node.value)) {
          context.report({
            node,
            messageId: "deletedConcept",
            data: { value: node.value },
          });
        }
      },
    };
  },
};

// ═══ E5.7#95：pluginId 硬编码比较——no-restricted-syntax 原 pluginId selector 收窄 + 补盲点 ═══
// 原 selector（no-restricted-syntax warn 级）：BinaryExpression > Literal[/^[a-z]/]——匹配任何
// 与小写字符串字面量的比较，误伤率极高（label === "typescript" 等合法 tag 判别，294 处）。
// #95 收窄到 pluginId 语境（左操作数名字含 plugin/pluginId）+ 补 switch/includes 两种同危害类盲点。
// 独立成局原因同 no-deleted-e5.7-concepts（#45 实测：flat config 同规则跨块合并高 severity 胜出、
// 低 severity options 被丢弃）——本规则 error 级 + v3- selector 保留 warn 级在 no-restricted-syntax，两防线共存。

const noPluginIdHardcode = {
  meta: {
    type: "problem",
    docs: {
      description: "E5.7#95 禁止 pluginId 语境下的硬编码比较（含 switch/includes 盲点 + 可选链形态）",
      recommended: true,
    },
    messages: {
      noPluginIdHardcode:
        "🚫 禁止 pluginId 硬编码比较。插件 ID 是动态的——新插件不应触发壳代码修改。请读 plugin.json 声明字段或 Registry 查询；" +
        "确为壳内部已知插件请用大写常量（如 FALLBACK_PLUGIN_ID）代替裸字符串。",
    },
  },

  create(context) {
    // 解开可选链包裹（data?.pluginId → ChainExpression.expression）
    const unwrap = (node) => (node?.type === "ChainExpression" ? node.expression : node);

    // 语境判定：名字含 plugin 的 Identifier / MemberExpression 属性（pluginId/activePlugin/pluginIds……）
    const pluginishName = (node) => {
      const u = unwrap(node);
      if (!u) return null;
      if (u.type === "Identifier") return u.name;
      if (u.type === "MemberExpression") return u.property?.name ?? null;
      return null;
    };

    const isLowerLiteral = (node) =>
      node?.type === "Literal" && typeof node.value === "string" && /^[a-z]/.test(node.value);

    return {
      // pluginId === "editor" / data?.pluginId !== "serial-monitor"
      BinaryExpression(node) {
        if (!/^[!=]==?$/.test(node.operator)) return;
        if (!isLowerLiteral(node.right)) return;
        if (!/plugin/i.test(pluginishName(node.left) ?? "")) return;
        context.report({ node, messageId: "noPluginIdHardcode" });
      },
      // 盲点 1：switch (pluginId) { case "literal" }——原 selector 拦不住
      // （node.cases 自带 case 列表，无需父节点查找——ESLint 9 sourceCode 无 getParent）
      SwitchStatement(node) {
        if (!/plugin/i.test(pluginishName(node.discriminant) ?? "")) return;
        for (const c of node.cases) {
          if (isLowerLiteral(c.test)) {
            context.report({ node: c.test ?? c, messageId: "noPluginIdHardcode" });
          }
        }
      },
      // 盲点 2：pluginIds.includes("literal")——同危害类归一化
      CallExpression(node) {
        if (node.callee?.type !== "MemberExpression") return;
        const callee = node.callee;
        if (!callee.property || callee.property.name !== "includes") return;
        if (!node.arguments.some(isLowerLiteral)) return;
        if (!/plugin/i.test(pluginishName(callee.object) ?? "")) return;
        context.report({ node, messageId: "noPluginIdHardcode" });
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 规则 13：插件禁止 import 另一个插件的源码——万物皆可插件机械门禁
// ═══════════════════════════════════════════════════════════
//
// 万物皆可插件（2026-09-08 用户拍板）：换/卸任一插件不得影响其他插件。
// 插件间任何 import（源码/产物/i18n/manifest）都是耦合——本规则机械拦截。
// 插件树无 alias（tsconfig 仅 @src/* + contracts），互引唯一现实路径 = 相对 import：
// 把相对 specifier 对当前文件目录解析（posix 归一折叠 ../），若落进
// /plugins/<其他id>/ 即 error；落在自身插件 / @src / 包名 / node_modules → 放行。
//
// 共享代码唯一合法通道 = @linkdesk/ui 分发件（E6#54c）；插件间数据/命令交流
// 走 window.linkdesk.*（configuration 键 / commands / events），不 import。
// （E6 第 1.3 轮独立构建后此类 import 物理不可达——本规则在 dev 同图期提前封死）
//
// 错误示例（settings import marketplace 源码）：
//   import { parseCatalog } from "../../marketplace/src/services/marketCatalog";
//
// 正确示例：
//   // 代码共享 → 收 @linkdesk/ui 分发；数据/命令 → window.linkdesk.*
//   import { urlSourceKey } from "@linkdesk/ui";

/** posix 归一（折叠 ./ ../）——自包含，不引 node:path 保持规则零依赖 */
function normalizePosix(p) {
  const out = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

/** 从路径取插件 id——/plugins/<id>/ 的 <id>；不在插件树返 null */
function pluginIdOf(p) {
  const marker = "/plugins/";
  const i = p.indexOf(marker);
  if (i === -1) return null;
  return p.slice(i + marker.length).split("/")[0] || null;
}

const noCrossPluginImport = {
  meta: {
    type: "problem",
    docs: {
      description:
        "插件禁止 import 另一个插件的源码——万物皆可插件（换/卸一插件不影响其他）",
      recommended: true,
    },
    messages: {
      crossPlugin:
        "🚫 插件 {{fromId}} import 了另一个插件 {{toId}} 的代码 \"{{source}}\"。万物皆可插件——插件间不得互相 import（换/卸任一插件不能影响其他）。" +
        " 共享代码只经 @linkdesk/ui 分发；插件间数据/命令走 window.linkdesk.*（configuration/commands/events）。",
    },
  },

  create(context) {
    const filename = (context.filename || context.getFilename?.() || "").replace(/\\/g, "/");
    const fromId = pluginIdOf(filename);
    if (!fromId) return {}; // 非插件文件（src/electron/eslint-local-rules 自身）

    const reportCross = (source, node) => {
      if (typeof source !== "string") return;
      if (!source.startsWith(".")) return; // bare = 包/@linkdesk/ui/别名——插件树无别名，非互引路径
      const dir = filename.slice(0, filename.lastIndexOf("/"));
      const resolved = normalizePosix(`${dir}/${source}`);
      const toId = pluginIdOf(resolved);
      if (toId && toId !== fromId) {
        context.report({ node, messageId: "crossPlugin", data: { fromId, toId, source } });
      }
    };

    return {
      ImportDeclaration(node) {
        reportCross(node.source.value, node);
      },
      ImportExpression(node) {
        if (node.source && node.source.type === "Literal") reportCross(node.source.value, node);
      },
      ExportNamedDeclaration(node) {
        if (node.source) reportCross(node.source.value, node);
      },
      ExportAllDeclaration(node) {
        if (node.source) reportCross(node.source.value, node);
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments[0] &&
          node.arguments[0].type === "Literal"
        ) {
          reportCross(node.arguments[0].value, node);
        }
      },
    };
  },
};

export default {
  "no-async-init-guard-only": noAsyncInitGuardOnly,
  "no-effect-callback-without-active-guard": noEffectCallbackWithoutActiveGuard,
  "no-dynamic-import-in-effect-cleanup": noDynamicImportInEffectCleanup,
  "no-ref-current-in-jsx": noRefCurrentInJsx,
  "no-module-level-ipc-listener": noModuleLevelIpcListener,
  "no-ipc-listener-in-effect": noIpcListenerInEffect,
  "no-quickpick-render-item": noQuickpickRenderItem,
  "no-raw-configuration-read": noRawConfigurationRead,
  "no-raw-path-replace": noRawPathReplace,
  "no-core-import-in-plugin": noCoreImportInPlugin,
  "no-hardcoded-chinese": noHardcodedChinese,
  "no-hardcoded-hex": noHardcodedHex,
  "no-deleted-e5.7-concepts": noDeletedE57Concepts,
  "no-plugin-id-hardcode": noPluginIdHardcode,
  "no-cross-plugin-import": noCrossPluginImport,
};
