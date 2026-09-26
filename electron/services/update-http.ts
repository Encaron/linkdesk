/**
 * 更新机制的共用出网面——E6#57.8e 从 `update-source.ts` **原样抽出**（纯搬运，零行为变化）。
 *
 * 抽出的唯一理由：**检查腿与发行说明取数腿打的是同一个 API 主机，失败归因也必须是同一套话**。
 * 两条腿各写一份 `fetchWithTimeout` / 状态码归因 / 文案 = 01 §2.3 说的「两台各写一份字符串」——
 * 两处一旦漂了，必然是「一边报得准、另一边静默或错向归因」，而且没人会同时看两处。
 * 检查腿的既有单测就是这次搬运的判据（判据是行为级的，所以搬运后必须全绿）。
 *
 * 🔴 **出网唯一出口仍是 `main-fetch.ts`**（E6#76：全局 fetch（undici）不读 Windows 系统代理 ⇒
 * 用户开代理时「检查看得见、下载必失败」）。本模块只负责「加超时 + 加 Accept」，**不另开出口**。
 */

import { mainFetch } from './main-fetch.js';
import type { UpdateError } from '../../src/core/types/ipc/update';

/**
 * 元数据腿超时预算——两条腿都是一发小请求（本机实测 GitHub API < 1s），15s 远超正常值，
 * 只兜「连上了但半死不活」这一种。**总时长**而非空闲超时：这里没有流，「多久没动静」无从谈起
 * （对比 plugin-download 的下包腿——那里刻意用空闲超时，见其头注）。
 */
export const META_TIMEOUT_MS = 15_000;

/** 六类失败文案——**互不相同**，且各自指向真正的责任方（用户网络 / 稍后重试 / 发布配置 / 发布命名）。
 *  ⚠️ 这里只放**由 HTTP 往返产生**的四条；`asset-missing` / `version-unparsable` 是检查腿读懂了
 *  响应之后的语义判定，留在 `update-source.ts` 里（共用的东西只有一份消费者 = 误导）。 */
export const NETWORK_MESSAGE =
  '网络不可用或更新服务无响应——请检查网络（使用代理时确认系统代理已生效），稍后会自动重试';
/** 限流两条**不导出**：只在下面 `classifyHttpFailure` 里用——导出会过不了 knip 门禁（无外部消费方），
 *  而门禁这个红是有用的：它逼着「用不用得上」当场有个答案，而不是留一堆谁也不读的公共常量。
 *
 *  🔴 04「更新检查遇匿名限流」把旧文案（「……无需处理」）改成了**可核对的事实**：
 *  ① 「无需处理」删掉——共享出口 IP（代理节点）被限流时用户**可以**处理（换节点 / 加 DIRECT 规则）；
 *  ② 读得到 `x-ratelimit-reset` 时给出**确定的本地恢复时刻**（GitHub 匿名册按小时重置），
 *     读不到才退回「稍后」的含糊形。两形都承诺「自动重试」——该承诺由壳侧调度器的
 *     检查腿有限自动重试兑现（#57.9g，2026-09-27 落地）。 */
const RATE_LIMITED_MESSAGE = '更新服务暂时限流——稍后会自动重试';
const RATE_LIMITED_MESSAGE_WITH_RESET = '更新源额度已用尽——将于 {{time}} 自动恢复，届时会自动重试';
export const NOT_FOUND_MESSAGE = '更新源不存在或尚未配置——请检查发布配置';
export const INVALID_RESPONSE_MESSAGE = '更新源返回的数据无法识别——更新源地址可能配置有误';

/** 从 `Response` 上摘下的两枚限流头——两条腿的调用点都经 `rateLimitHeadersOf` 取，不各写一份 `headers.get` */
export interface RateLimitHeaders {
  /** `x-ratelimit-remaining`——`"0"` 才是额度用尽；缺失/不可读 = null（按「非限流」处置） */
  remaining: string | null;
  /** `x-ratelimit-reset`——Unix 秒；服务端给的确定恢复时刻 */
  reset: string | null;
}

/** 两条腿共用的摘头口——判据就一句「同一主机同一套归因」，摘头也必须是同一份实现 */
export function rateLimitHeadersOf(resp: Response): RateLimitHeaders {
  return {
    remaining: resp.headers.get('x-ratelimit-remaining'),
    reset: resp.headers.get('x-ratelimit-reset'),
  };
}

/**
 * 非 2xx 的归因——**读头，不只看状态码**（04「更新检查遇匿名限流」改）：
 * - 403 + `x-ratelimit-remaining: "0"` = 匿名额度用尽（GitHub 用 403 表达限流）⇒ `rate-limited`；
 * - 403 但额度**没用完**（头缺失 / 非 0）= 受限 IP / 滥用检测形态——「稍后重试」不会好 ⇒ 归 `network`；
 * - 429 本义就是「请求过多」⇒ 恒 `rate-limited`（不看头——secondary 限流不一定带 `remaining: 0`）；
 * - 404 = 源不存在。
 *
 * `rateLimit` 不传 = 调用方拿不到头（测试直呼 / 非 HTTP 场景）——403 按「非限流」处置，
 * 与「头缺失」同一方向：**宁可少说限流，不可把一切 403 都说成限流**（旧实现正是这么错的）。
 *
 * 🔴 其余非 2xx（5xx / 其它 4xx）在固定错误码全集（07 §三）里**没有对应档**——见清单该格的红字登记。
 * 归 `network` 是**就近**而非**准确**：文案已措辞覆盖「服务无响应」这一子情形。**不许**改归
 * `not-found` / `asset-missing`——那两个把矛头指向发布侧，而服务端 5xx 时发布侧什么都没做错。
 */
export function classifyHttpFailure(
  status: number,
  rateLimit?: RateLimitHeaders,
): { code: UpdateError['code']; message: string; params?: Record<string, string> } {
  if (status === 404) return { code: 'not-found', message: NOT_FOUND_MESSAGE };
  if (status === 429) return rateLimitedResult(rateLimit?.reset ?? null);
  if (status === 403) {
    if (rateLimit?.remaining === '0') return rateLimitedResult(rateLimit.reset);
    return { code: 'network', message: NETWORK_MESSAGE };
  }
  return { code: 'network', message: NETWORK_MESSAGE };
}

/** 限流结果构造口——读得到 `reset` 就把**确定的本地恢复时刻**写进文案（词条 `{{time}}` 占位） */
function rateLimitedResult(reset: string | null): {
  code: UpdateError['code'];
  message: string;
  params?: Record<string, string>;
} {
  const time = formatResetTime(reset);
  if (time === undefined) return { code: 'rate-limited', message: RATE_LIMITED_MESSAGE };
  return { code: 'rate-limited', message: RATE_LIMITED_MESSAGE_WITH_RESET, params: { time } };
}

/** `x-ratelimit-reset`（Unix 秒）→ 本地 `HH:mm`；头缺失 / 非数字 / 越界日期 ⇒ undefined（退回含糊形） */
function formatResetTime(reset: string | null): string | undefined {
  if (reset === null) return undefined;
  const epochMs = Number.parseInt(reset, 10) * 1000;
  if (!Number.isFinite(epochMs) || epochMs <= 0) return undefined;
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return undefined;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 出网——**唯一出口**是 `main-fetch.ts`（E6#76）；`redirect: 'follow'` 与下包腿同语义。 */
export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await mainFetch(url, {
      redirect: 'follow',
      signal: ac.signal,
      // GitHub REST 要求声明 Accept；**不手写 User-Agent**——Chromium 网络栈自带合法的那个，
      // 而 UA 在 Chromium 里属受限头，手写反而可能被忽略或报错。
      headers: { Accept: 'application/vnd.github+json' },
    });
  } finally {
    clearTimeout(timer);
  }
}
