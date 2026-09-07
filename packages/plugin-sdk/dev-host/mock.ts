/**
 * dev 宿主 mock 注入锚点（E6#23.5c 位置定案）。`injectDevMockApi()` 签名与调用点不变。
 *
 * 注入体（E6#27 落地替换，2026-09-07）：
 *   - 方法树 = 自动生成 [linkdesk-mock.generated.ts](./linkdesk-mock.generated.ts)——与 linkdesk.d.ts
 *     同一标注源 `src/core/api/linkdesk-api.ts`（杜绝 mock/preload 双份漂移）。每个方法 = 类型驱动
 *     中性默认 + 调用即打 `[linkdesk-mock] <path>` 日志（mock vs 真 IPC 可感知，不静默假成功）。
 *   - #27b 兜底层 = 递归 Proxy：树内路径（契约里真实方法/命名空间）返回真子树/方法；**树外路径**
 *     （契约里不存在的方法名，如拼写错）**调用时抛错**「不在 linkdesk API 契约」而非静默 undefined /
 *     `undefined is not a function`——单源同构下，mock 缺 = 生产也缺，早抛早纠正。
 *
 * 真数据/真行为（串口/文件系统/IPC）不属于浏览器 mock——走真实 preload（装进 LinkDesk）或
 * `linkdesk-plugin-sdk dev --real` 真机环（E6#28.5）。
 */
import { linkdeskMock } from "./linkdesk-mock.generated.js";

/** 常见 introspection 键——不当作 linkdesk API 路径，返回 undefined（防 console/JSON/运行时探测误触 throw-stub） */
const SKIP_INTRINSIC = new Set([
  "then",
  "toJSON",
  "toString",
  "valueOf",
  "constructor",
  "__proto__",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
]);

/** 树外路径 call-stub——访问不抛（feature-detect 可安全探测），调用才抛（#27b）。
 *  自身是 Proxy：继续取属性返回更深 stub（`linkdesk.foo.bar()` 整链报完整 dotted path，
 *  而非裸 TypeError「not a function」）；symbol/intrinsic 键返回 undefined 防运行时探测误触。 */
function missingApiStub(dotted: string): () => never {
  const stub = () => {
    throw new Error(
      `[dev] window.linkdesk.${dotted} 不是 linkdesk API 方法——dev mock 与 src/core/api/linkdesk-api.ts` +
        ` 同源自动生成（方法集与生产一致），契约里没有它 = 生产环境调用同样报错。请核对方法名/拼写。` +
        `确需真实 IPC 行为 → linkdesk-plugin-sdk dev --real（E6#28.5 真机环）。`,
    );
  };
  return new Proxy(stub, {
    get(_t, prop) {
      if (typeof prop === "symbol" || SKIP_INTRINSIC.has(String(prop))) return undefined;
      return missingApiStub(`${dotted}.${String(prop)}`);
    },
  });
}

/** 递归 Proxy：树内路径返回真子树（命名空间再包一层 / 方法叶子直返），树外路径调用抛错 */
function wrapNode(node: Record<string, unknown>, path: string[]): Record<string, unknown> {
  return new Proxy(node, {
    get(t, prop) {
      if (typeof prop === "symbol") return undefined;
      const key = String(prop);
      if (SKIP_INTRINSIC.has(key)) return undefined;
      if (key in t) {
        const v = t[key];
        if (typeof v === "function") return v; // 方法叶子（自打 [linkdesk-mock] 调用日志）
        if (v !== null && typeof v === "object") return wrapNode(v as Record<string, unknown>, [...path, key]);
        return v;
      }
      return missingApiStub([...path, key].join("."));
    },
  });
}

export function injectDevMockApi(): void {
  if (typeof window === "undefined") return;
  if ((window as unknown as Record<string, unknown>).linkdesk) return;

  (window as unknown as Record<string, unknown>).linkdesk = wrapNode(linkdeskMock, []);
}
