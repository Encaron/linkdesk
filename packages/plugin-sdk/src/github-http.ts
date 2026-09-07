/**
 * 极简 GitHub REST 客户端（E6#26b 自动发布链路底座）——`api.github.com` + `uploads.github.com`。
 *
 * 用 `node:https` 而非全局 fetch：SDK tsconfig `types: []` + `lib: ["ES2022"]` 无 dom/undici 类型，
 * 全局 fetch 不可类型化——与 dev-real.ts 对 CDP 的处理同一取舍（dev-real.ts:99 注记）。Node >= 20
 * 运行时无额外依赖。发布只走 REST：Repo 信息 / Releases（建 + 传 asset）/ Contents（读改 marketplace.json）。
 *
 * 失败语义：网络/超时 → throw；HTTP 非 2xx → 不抛，返回 { status, ok:false } 由调用方给中文诊断
 * （401 token / 404 不存在 / 422 已存在等各自语义不同）。
 */
import { request as httpsRequest } from "node:https";
import type { IncomingMessage } from "node:http";

const GITHUB_API_HOST = "api.github.com";
const GITHUB_UPLOAD_HOST = "uploads.github.com";
const USER_AGENT = "linkdesk-plugin-sdk";
const REQUEST_TIMEOUT_MS = 30_000;

export interface GhHttpOptions {
  /** classic PAT（repo scope）或 fine-grained token——调用方从 env/配置档/token 链路取 */
  token: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** 目标主机：api = api.github.com（REST 面）；uploads = uploads.github.com（asset 上传面） */
  api: "api" | "uploads";
  /** 路径，以 / 开头，如 "/repos/encaron/demo/releases" */
  path: string;
  /** 追加到 path 的原始 query 串（含 ? 或纯参数字符串，按原样拼） */
  query?: string;
  /** 附加 header（Content-Type 等）；Authorization/User-Agent/Accept 由本模块统一注入 */
  headers?: Record<string, string>;
  /** 请求体：string = 自动置 Content-Type application/json；Buffer = 调用方自给 Content-Type */
  body?: string | Buffer;
}

export interface GhHttpResult {
  status: number;
  ok: boolean;
  text: string;
  /** JSON.parse 成功则为解析值；非 JSON / 空体为 null */
  json: unknown;
}

function collectBody(res: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    res.on("data", (c: Buffer) => chunks.push(c));
    res.on("error", reject);
    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

/**
 * 单次 GitHub REST 请求。2xx 不抛（返回 ok:true）；网络/超时抛错。
 * 4xx/5xx 返回 ok:false + text/json 供调用方诊断（GitHub 错误体含 message 字段）。
 */
export async function ghHttp(opts: GhHttpOptions): Promise<GhHttpResult> {
  const host = opts.api === "uploads" ? GITHUB_UPLOAD_HOST : GITHUB_API_HOST;
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${opts.token}`,
    ...opts.headers,
  };
  if (typeof opts.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (Buffer.isBuffer(opts.body) && !headers["Content-Length"]) {
    headers["Content-Length"] = String(opts.body.length);
  }
  const query = opts.query ? (opts.query.startsWith("?") ? opts.query : `?${opts.query}`) : "";

  return new Promise<GhHttpResult>((resolve, reject) => {
    const req = httpsRequest(
      {
        host,
        path: `${opts.path}${query}`,
        method: opts.method ?? "GET",
        headers,
      },
      (res) => {
        void (async () => {
          try {
            const text = await collectBody(res);
            let json: unknown = null;
            if (text.length > 0) {
              try {
                json = JSON.parse(text) as unknown;
              } catch {
                json = null; // 非 JSON（罕见），保持 text 可取
              }
            }
            resolve({ status: res.statusCode ?? 0, ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300, text, json });
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        })();
      },
    );
    req.on("error", (e) => reject(new Error(`GitHub 网络请求失败（${host}）：${e.message}`)));
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error(`GitHub 请求超时（${REQUEST_TIMEOUT_MS}ms）`)));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

/** 读错误体中文诊断——GitHub 标准错误体 { message, documentation_url, ... } */
export function ghErrorDetail(res: GhHttpResult): string {
  if (res.json && typeof res.json === "object") {
    const msg = (res.json as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return res.text.slice(0, 300);
}
