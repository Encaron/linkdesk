/**
 * @linkdesk/plugin-sdk 门禁自定义规则（E6#54d）——从壳 eslint-local-rules.js 移植的作者面向子集。
 *
 * 🔴 双源注记（与壳 eslint-local-rules.js 同 id / 同语义，防作者文档与壳文档二义）：
 *   壳规则管壳代码（src/ + 仓库内 plugins/），本文件规则管第三方插件工程（仓库外）——两个
 *   工程物理隔离，发布态 plugin-sdk 不能 import 仓库源码，故是"移植副本"而非"共享单源"。
 *   与壳语义同名的规则沿用 `linkdesk/` 命名空间 + 同名（no-hardcoded-hex / no-async-init-guard-only /
 *   no-effect-callback-without-active-guard / no-dynamic-import-in-effect-cleanup / no-ref-current-in-jsx /
 *   no-quickpick-render-item）——disable 注释格式两套配置一致；zh 规则例外：SDK 用设计文档 07 §六
 *   id `linkdesk/no-hardcoded-zh`（壳遗留名 no-hardcoded-chinese，第三方作者不写壳代码故不冲突），
 *   no-hardcoded-radius 为 SDK 新写（壳无对应）。改消息文本 / 规则 id 时同步核对壳 eslint-local-rules.js。
 *
 * 三档梯度定位（07 设计 §六）：这些规则全部 WARN 级（永不 fail build/上传），报错自解释
 * （错在哪 + 换成什么 + 为什么），知情绕行 = 标准 eslint-disable 注释（非发明新语法）。
 *
 * 规则命名空间 = `linkdesk`（与壳一致），由 src/eslint/preset.ts 注册进 flat config。
 */
import type { Rule } from "eslint";

// ═══════════════════════════════════════════════════════════
// 1. async 初始化函数 _initialized guard 必须配 _loadingPromise
//    （壳 #59c 教训：StrictMode 双重 effect 竞态）
// ═══════════════════════════════════════════════════════════
export const noAsyncInitGuardOnly: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "async 初始化函数只设 _initialized guard 不够——必须配 _loadingPromise 防 StrictMode 双重 effect 竞态（第二次调用须返回进行中的 Promise）",
      recommended: true,
    },
    messages: {
      noLoadingPromise:
        "async init 函数 {{name}} 在 await 前设 _initialized=true，未返回 _loadingPromise。" +
        " StrictMode 双重 effect 第二次调用会跳过加载，但后续初始化操作可能尚未就绪（隐形竞态）。" +
        " 修复：if (_initialized) return _loadingPromise ?? Promise.resolve(); return (_loadingPromise = (async () => { ... })());",
    },
  },
  create(context) {
    let initializedSet = false;
    let hasAwaitAfter = false;
    let hasLoadingPromise = false;
    let functionName = "";

    return {
      ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression)[async=true]"(node: any) {
        initializedSet = false;
        hasAwaitAfter = false;
        hasLoadingPromise = false;
        functionName = (node.id && node.id.name) || "";
      },
      "AssignmentExpression[left.type='Identifier'][left.name='_initialized']"(node: any) {
        if (node.right && node.right.value === true) {
          initializedSet = true;
        }
      },
      "Identifier[name='_loadingPromise']"() {
        hasLoadingPromise = true;
      },
      AwaitExpression() {
        if (initializedSet) {
          hasAwaitAfter = true;
        }
      },
      ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression)[async=true]:exit"(node: any) {
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
// 2. useEffect 依赖回调 prop 但缺活跃守卫（壳 #59c 教训）
//    组件 return null 不代表 effect 不跑——React effect 只看挂载不看 DOM。
// ═══════════════════════════════════════════════════════════
export const noEffectCallbackWithoutActiveGuard: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "useEffect 依赖回调 prop（onChange/onHighlight/onSelect/onApply）但缺 if (!open)/if (!isActive) 活跃守卫——组件 return null 时 effect 照跑",
      recommended: true,
    },
    messages: {
      missingGuard:
        "useEffect 依赖了回调 prop (onChange/onHighlight/onSelect/onApply)，但没有 if (!open) 或 if (!isActive) 活跃守卫。" +
        " 组件 return null 时 React effect 照跑——回调可能意外触发全局副作用。" +
        " 修复：effect 顶部加 if (!open) return; 并把 open/isActive 纳入依赖数组。",
    },
  },
  create(context) {
    const CALLBACK_PROP_PATTERN = /^on(Change|Highlight|Select|Apply|Close|Toggle|Submit)$/;

    return {
      CallExpression(node: any) {
        if (node.callee?.type !== "Identifier" || node.callee.name !== "useEffect") return;
        const args = node.arguments;
        if (args.length < 2) return;
        const depsArg = args[1];
        if (!depsArg || depsArg.type !== "ArrayExpression") return;
        const body = args[0];
        if (!body || (body.type !== "ArrowFunctionExpression" && body.type !== "FunctionExpression")) return;

        const callbackDeps = depsArg.elements.filter((el: any) => {
          if (!el || el.type !== "Identifier") return false;
          return CALLBACK_PROP_PATTERN.test(el.name);
        });
        if (callbackDeps.length === 0) return;

        const bodyText = context.getSourceCode().getText(body);
        const hasActiveGuard = /\bif\s*\(\s*!\s*(?:open|isActive|active|visible|enabled)\s*\)/.test(bodyText);
        if (hasActiveGuard) return;

        context.report({ node, messageId: "missingGuard" });
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 3. useEffect/useCallback cleanup 禁止动态 import()（壳 #36k2 教训）
//    import() 异步在 StrictMode 重挂载后 resolve → 误删新注册数据
// ═══════════════════════════════════════════════════════════
const AST_CHILD_KEYS = new Set([
  "body", "expression", "argument", "callee", "alternate", "consequent",
  "test", "init", "left", "right", "object", "property", "elements",
  "declarations", "params", "id", "handler", "finalizer",
]);

function hasDynamicImport(node: any, context: Rule.RuleContext, depth = 0): boolean {
  if (!node || depth > 20) return false;
  if (node.type === "CallExpression" && node.callee?.type === "Import") {
    context.report({ node, messageId: "dynamicImport" });
    return true;
  }
  for (const key of AST_CHILD_KEYS) {
    const child = node[key];
    if (!child) continue;
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === "string" && hasDynamicImport(item, context, depth + 1)) return true;
      }
    } else if (typeof child.type === "string" && hasDynamicImport(child, context, depth + 1)) {
      return true;
    }
  }
  return false;
}

export const noDynamicImportInEffectCleanup: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "useEffect/useCallback cleanup 禁止动态 import()——异步执行在 StrictMode 重挂载后误删新数据",
      recommended: true,
    },
    messages: {
      dynamicImport:
        "useEffect/useCallback cleanup 中禁止动态 import()。" +
        " import() 异步执行——React StrictMode 会先 unmount（触发此 cleanup）再 mount（重新注册），" +
        " 异步 import 在 mount 之后才 resolve → 把新注册的数据也删了。" +
        " 修复：改成文件顶部静态 import。",
    },
  },
  create(context) {
    return {
      CallExpression(node: any) {
        if (node.callee?.type !== "Identifier") return;
        if (node.callee.name !== "useEffect" && node.callee.name !== "useCallback") return;
        const args = node.arguments;
        if (args.length === 0) return;
        const body = args[0];
        if (!body || (body.type !== "ArrowFunctionExpression" && body.type !== "FunctionExpression")) return;

        const bodyNode = body.body;
        if (!bodyNode) return;
        if (bodyNode.type === "CallExpression") {
          if (bodyNode.callee?.type === "Import") context.report({ node: bodyNode, messageId: "dynamicImport" });
          return;
        }
        if (bodyNode.type !== "BlockStatement") return;
        for (const stmt of bodyNode.body) {
          if (stmt.type !== "ReturnStatement" || !stmt.argument) continue;
          hasDynamicImport(stmt.argument, context);
        }
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 4. JSX 中禁止 ref.current 参与渲染（壳 #58e 教训）
//    ref 更新不触发重渲染 → UI 与实际状态脱节。渲染决策走 useState。
// ═══════════════════════════════════════════════════════════
export const noRefCurrentInJsx: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "JSX 中禁止 ref.current 直接参与渲染——ref 更新不触发 React 重渲染",
      recommended: true,
    },
    messages: {
      noRefCurrent:
        "JSX 中禁止 {{name}}.current——ref 更新不触发 React 重渲染。" +
        " 异步拿到数据 → ref 更新 → 组件不知道 → 下次任何事件触发重渲染时突然切状态 → UI 跳变/空白。" +
        " 修复：改用 useState。ref 仅用于 DOM 引用/前值对比/generation counter。",
    },
  },
  create(context) {
    return {
      "JSXExpressionContainer > MemberExpression[property.name='current']"(node: any) {
        const objectName = node.object?.type === "Identifier" ? node.object.name : "?";
        context.report({ node, messageId: "noRefCurrent", data: { name: objectName } });
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 5. JSX/UI 中文字面量必须走 t()（壳 no-hardcoded-chinese 同逻辑；门禁名 = no-hardcoded-zh）
//    UI 文案硬编码中文 → i18n 遗漏。注释/console/测试文件不拦。
// ═══════════════════════════════════════════════════════════
const CHINESE_RE = /[㐀-鿿]/;
function hasChinese(text: string): boolean {
  return CHINESE_RE.test(text);
}
function isInsideTranslationCall(node: any): boolean {
  let cur = node.parent;
  while (cur) {
    if (cur.type === "CallExpression") {
      const callee = cur.callee;
      if (callee.type === "Identifier" && (callee.name === "t" || callee.name === "i18n")) return true;
      if (
        callee.type === "MemberExpression" &&
        callee.object?.type === "Identifier" &&
        callee.object.name === "i18n" &&
        callee.property?.type === "Identifier" &&
        callee.property.name === "t"
      )
        return true;
    }
    if (cur.type === "JSXExpressionContainer" || cur.type === "JSXAttribute") break;
    cur = cur.parent;
  }
  return false;
}
/** 字面量是否落在 JSX 表达式上下文——向上穿透三元/逻辑链（盲区：placeholder={cond ? "中文" : "…"}） */
function isInJsxContext(node: any): boolean {
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

export const noHardcodedZh: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "JSX/UI 中的中文字面量必须走 t() 包裹——防 i18n 遗漏（UI 文字全走 t() 硬约束）",
      recommended: true,
    },
    messages: {
      noZh:
        "UI 文案中文字面量 \"{{text}}\" 未用 t() 包裹。" +
        " 修复：<span>{t(\"中文\")}</span> 或 placeholder={t(\"中文\")}，文案进 i18n 资源。" +
        " 注释/console/测试文件可忽略。",
    },
  },
  create(context) {
    return {
      JSXText(node: any) {
        const text = node.value.trim();
        if (!text || !hasChinese(text)) return;
        context.report({ node, messageId: "noZh", data: { text: text.slice(0, 20) } });
      },
      Literal(node: any) {
        if (typeof node.value !== "string" || !hasChinese(node.value)) return;
        if (isInsideTranslationCall(node)) return;
        if (isInJsxContext(node)) {
          context.report({ node, messageId: "noZh", data: { text: node.value.slice(0, 20) } });
        }
      },
      TemplateLiteral(node: any) {
        if (node.quasis.length === 1 && hasChinese(node.quasis[0].value.raw)) {
          if (isInsideTranslationCall(node)) return;
          if (isInJsxContext(node)) {
            context.report({ node, messageId: "noZh", data: { text: node.quasis[0].value.raw.slice(0, 20) } });
          }
        }
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 6. 颜色禁止硬编码 hex——走 CSS 变量 var(--xxx)（壳 no-hardcoded-hex 同逻辑）
//    var(--x, #hex) 回退值合规；取色器色板/canvas/测试/i18n 数据豁免；
//    内容画布（游戏/数据可视化主区）走文件级 /* eslint-disable linkdesk/no-hardcoded-hex -- 内容画布 */
//    ——标准注释即批量知情绕行（07 §七·2）。
// ═══════════════════════════════════════════════════════════
const HEX_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const CSS_VAR_FALLBACK_RE = /var\(/;

export const noHardcodedHex: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "颜色禁止硬编码 hex——走 CSS 变量 var(--xxx)（var(--*)/t() 零警告，主题/玻璃自动跟随）",
      recommended: true,
    },
    messages: {
      noHex:
        "颜色硬编码 hex \"{{text}}\" 未走 CSS 变量。" +
        " 修复：color/background 用 var(--text-*/--bg-*/--accent-*/--surface-*) → 自动跟随主题+玻璃。" +
        " 若是默认色数据/取色器色板/canvas 绘图，加 `// eslint-disable-next-line linkdesk/no-hardcoded-hex -- 理由` 并注明豁免类别。" +
        " 内容画布（游戏/数据可视化主区）用文件级 `/* eslint-disable linkdesk/no-hardcoded-hex -- 内容画布 */`。",
    },
  },
  create(context) {
    const filename = (context.getFilename?.() ?? "").replace(/\\/g, "/");
    const isExemptFile =
      /\.(test|spec)\.(ts|tsx)$/.test(filename) ||
      /mock/i.test(filename) ||
      /\/themes?\//.test(filename) ||
      /\/i18n\//.test(filename) ||
      /\/color-picker\//.test(filename) ||
      /canvas/i.test(filename);

    return {
      Literal(node: any) {
        if (typeof node.value !== "string") return;
        if (isExemptFile) return;
        if (!HEX_RE.test(node.value)) return;
        if (CSS_VAR_FALLBACK_RE.test(node.value)) return;
        context.report({ node, messageId: "noHex", data: { text: node.value.slice(0, 20) } });
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 7. 禁止裸 px 圆角（新写）——border-radius 走 var(--radius-*) / var(--surface-radius)
//    React style={{ borderRadius: 8 }}（数字=px）或 borderRadius: "8px" → 用 var() 字符串。
//    内容画布豁免同上（文件级 disable）。CSS 文件里的 border-radius 由 token 契约文档引导
//    （eslint 不扫 .css——契约域，07 §六「不设门禁的域」同精神）。
// ═══════════════════════════════════════════════════════════
const PX_STRING_RE = /^(\d+(?:\.\d+)?)px$/;

export const noHardcodedRadius: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "禁止裸 px 圆角——border-radius 走 var(--radius-*) / var(--surface-radius) 跟随圆角滑杆",
      recommended: true,
    },
    messages: {
      noRadius:
        "borderRadius 硬编码 {{value}} 未走 CSS 变量。" +
        " 修复：border-radius: var(--radius-md) 或 var(--surface-radius) → 自动跟随全局圆角滑杆。" +
        " 内容画布（游戏/数据可视化）用文件级 `/* eslint-disable linkdesk/no-hardcoded-radius -- 内容画布 */`。",
    },
  },
  create(context) {
    const filename = (context.getFilename?.() ?? "").replace(/\\/g, "/");
    const isExemptFile =
      /\.(test|spec)\.(ts|tsx)$/.test(filename) || /canvas/i.test(filename);

    return {
      JSXAttribute(node: any) {
        if (isExemptFile) return;
        // 只查 style={{ ... }} 的 JSX 表达式对象
        if (node.name?.type !== "JSXIdentifier" || node.name.name !== "style") return;
        const val = node.value;
        if (!val || val.type !== "JSXExpressionContainer" || !val.expression) return;
        const expr = val.expression;
        if (expr.type !== "ObjectExpression") return;
        for (const prop of expr.properties) {
          if (prop.type !== "Property") continue;
          const key = prop.key;
          if (!key || (key.type !== "Identifier" && key.type !== "Literal")) continue;
          const keyName = key.type === "Identifier" ? key.name : String(key.value);
          if (keyName !== "borderRadius") continue;
          const v = prop.value;
          if (v && v.type === "Literal") {
            if (typeof v.value === "number" || (typeof v.value === "string" && PX_STRING_RE.test(v.value))) {
              context.report({ node: v, messageId: "noRadius", data: { value: String(v.value) } });
            }
          }
        }
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 8. QuickPick 禁止 renderItem（壳同规则）——@linkdesk/ui 控件用 slot props 保视觉统一
// ═══════════════════════════════════════════════════════════
export const noQuickpickRenderItem: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "QuickPick 禁止 renderItem——用 structured slot props 保面板视觉统一",
      recommended: true,
    },
    messages: {
      noRenderItem:
        "QuickPick renderItem 已废弃——自由度过高导致面板视觉不统一。" +
        " 改用 slot props：renderLabel / renderCategory / renderDetail / renderDetailRight。",
    },
  },
  create(context) {
    return {
      JSXElement(node: any) {
        const tagName = node.openingElement?.name;
        if (!tagName || tagName.type !== "Identifier" || tagName.name !== "QuickPick") return;
        for (const attr of node.openingElement.attributes || []) {
          if (attr.type === "JSXAttribute" && attr.name?.type === "JSXIdentifier" && attr.name.name === "renderItem") {
            context.report({ node: attr, messageId: "noRenderItem" });
            return;
          }
        }
      },
    };
  },
};

// ═══════════════════════════════════════════════════════════
// 注册映射——kebab 键 = 配置规则 id 的 ruleName 部分。
// eslint 按原样名查 plugin.rules（config.js parseRuleId 后直查，无 camel 转换），
// 故键必须与 preset 里 `linkdesk/<rule>` 的破折号名一致（壳 export default 同款）。
// ═══════════════════════════════════════════════════════════
export const linkdeskRuleMap: Record<string, Rule.RuleModule> = {
  "no-async-init-guard-only": noAsyncInitGuardOnly,
  "no-effect-callback-without-active-guard": noEffectCallbackWithoutActiveGuard,
  "no-dynamic-import-in-effect-cleanup": noDynamicImportInEffectCleanup,
  "no-ref-current-in-jsx": noRefCurrentInJsx,
  "no-hardcoded-zh": noHardcodedZh,
  "no-hardcoded-hex": noHardcodedHex,
  "no-hardcoded-radius": noHardcodedRadius,
  "no-quickpick-render-item": noQuickpickRenderItem,
};
