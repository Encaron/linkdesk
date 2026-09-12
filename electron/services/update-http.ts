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
/** 限流那条**不导出**：它只在下面 `classifyHttpFailure` 里用——导出会过不了 knip 门禁（无外部消费方），
 *  而门禁这个红是有用的：它逼着「用不用得上」当场有个答案，而不是留一堆谁也不读的公共常量。 */
const RATE_LIMITED_MESSAGE = '更新服务暂时限流——稍后会自动重试，无需处理';
export const NOT_FOUND_MESSAGE = '更新源不存在或尚未配置——请检查发布配置';
export const INVALID_RESPONSE_MESSAGE = '更新源返回的数据无法识别——更新源地址可能配置有误';

/**
 * 非 2xx 的归因——403/429 = 限流（GitHub 用 403 表达限流，`x-ratelimit-remaining: 0` 是佐证）；
 * 404 = 源不存在。
 *
 * 🔴 其余非 2xx（5xx / 其它 4xx）在固定错误码全集（07 §三）里**没有对应档**——见清单该格的红字登记。
 * 归 `network` 是**就近**而非**准确**：文案已措辞覆盖「服务无响应」这一子情形。**不许**改归
 * `not-found` / `asset-missing`——那两个把矛头指向发布侧，而服务端 5xx 时发布侧什么都没做错。
 */
export function classifyHttpFailure(status: number): { code: UpdateError['code']; message: string } {
  if (status === 403 || status === 429) return { code: 'rate-limited', message: RATE_LIMITED_MESSAGE };
  if (status === 404) return { code: 'not-found', message: NOT_FOUND_MESSAGE };
  return { code: 'network', message: NETWORK_MESSAGE };
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
