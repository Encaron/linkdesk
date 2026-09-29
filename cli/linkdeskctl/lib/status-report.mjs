/**
 * M4 `AI#59`：`status` / `ping` 的**报告面**（纯函数，无 IO、不连网）——与 `linkdeskctl.mjs` 拆开，
 * 是为了能把它钉在测试里（此前 CLI 一行测试都没有，这两处缺陷就是这么活下来的）。
 *
 * ── 立案（2026-09-29 会话 15 真机边界扫描，0.2.23 出厂版实测）──
 *
 * 病根一处：`status` 的探活把「谁在服务 / 为什么没成」两件事都压平了。
 *
 *   ① **真实故障码被吞**：探活 `catch {}` 丢掉异常 ⇒ `renderStatus` 拿 `classify({error: null})`
 *      重造结论，而那个输入的产物**恒为 `CONNECT_FAILED`**。实测同一份情形（记录在、端口在听、
 *      凭据不对）：`ping` 报 `EAUTH`（对），`status` 报「这次探活没连上：CONNECT_FAILED」
 *      ＋ 下一步「稍等重试」（错）——AI 会照这个假修法一直等，而真修法是换凭据/查协议。
 *   ② **跳过认人**：`status` 的探活走 `op:"ping"`，而 `callBridge` 对 `ping` **有意不做认人**
 *      （ping 的职责就是「问谁在」）⇒ 记录 pid 与应答 pid 错配时 `status` 照样报「在服务」。
 *      实测：记录 pid=76092（活）、端口上真答的是 80164（另一实例）⇒ `status` 说「在服务」，
 *      而同一条记录下 `tabs` 报 `STALE_IDENTITY`。⇒ M5 教训「**存在 ≠ 是它**」在 AI 到手后的
 *      **第一条命令**上失守（`status` 是分诊入口，松在这里等于把教训丢了）。
 *
 * ── 修法（只改报告，不改探测手段、不改退出码语义）──
 *   · 探活异常**原样带进来**：连不上类（REFUSED/CONNECT_FAILED/TIMEOUT）仍按 `RECORD_OK` 报
 *     「记录面正常、这次没连上」（离线分诊语义保住）；**其余码一律如实报自己的码**。
 *   · 探活拿到应答 ⇒ 先认人：`live.pid` 与记录 pid 不一致 ⇒ `STALE_IDENTITY`，⛔ 不报在服务。
 *   · `ping --json` 的 `servedBy`：认人通过 ⇒ 就是它；**跳过认人时**（ping 自己）取**真应答者**
 *     `result.pid`，⛔ 别拿记录 pid 兜底（那会让「谁在服务」这个字段谎报成记录里那个）。
 *   · `status` 退出码不变（分诊成功 = 0，契约见 `--help`）：判据是 `state.code`，不是退出码。
 */

import { BridgeError, classify, fmtEndpoint } from "./bridge-client.mjs";

/** 「连不上」类故障码——它们不推翻分诊结论（记录面可能是好的，只是这次没连上）。
 *  ⚠️ `EAUTH` / `EPROTO` / `STALE_IDENTITY` / `NO_ENDPOINT` **不在此列**：那些是
 *  「连上了、对面明确说了不行」，是**诊断答案**，报成「稍等重试」等于撒谎。 */
const UNREACHABLE_CODES = new Set(["REFUSED", "CONNECT_FAILED", "TIMEOUT"]);

/**
 * `status` 的人读 ＋ 机读报告（纯函数）。
 * @param {{record: object|null, recordPath: string|null, searched: string[]}} found 读记录的结果
 * @param {object|null} live 探活应答（`ping` 的 result：`pid`/`endpoint`/`transport`/`uptimeMs`/`shellWindows`…）
 * @param {Error|null} probeError 探活的**原始异常**（⛔ 不许吞——见头注①）
 */
export function renderStatus(found, live, probeError = null) {
  const { record, recordPath, searched } = found;

  if (!record) {
    const err = classify({ record: null, error: null, attempted: { searched, timeoutMs: 0 } });
    return {
      state: { code: err.code, message: err.message, hint: err.hint },
      text: `状态      ${err.message}\n下一步    ${err.hint ?? "—"}`,
    };
  }

  const head = `记录      ${recordPath}\n身份      ${record.appName} ${record.appVersion} · pid ${record.pid} · 起于 ${record.startedAt}`;

  if (live) {
    const answeredPid = typeof live.pid === "number" ? live.pid : record.pid;
    if (answeredPid !== record.pid) {
      const hint =
        "记录没被重写（上个实例崩了？）或多实例并发。要操作谁就指对 `--user-data-dir`；重启软件可重写记录。";
      return {
        state: {
          code: "STALE_IDENTITY",
          message: `有人应答，但**不是记录里那个进程**：应答 pid=${answeredPid}，记录 pid=${record.pid}`,
          hint,
        },
        text: [
          head,
          `状态      有人应答，但不是记录里那个进程：应答 pid=${answeredPid} · 记录 pid=${record.pid}`,
          `下一步    ${hint}`,
        ].join("\n"),
      };
    }
    return {
      state: { code: "SERVING", message: `在服务（${fmtEndpoint(live.endpoint)}）`, hint: null },
      text: [
        head,
        `状态      在服务  ${live.transport} ${fmtEndpoint(live.endpoint)}`,
        `已跑      ${Math.round(live.uptimeMs / 1000)}s · 壳窗 ${live.shellWindows}` +
          (live.servedShellWindow ? `（操作目标 = ${live.servedShellWindow}）` : ""),
      ].join("\n"),
    };
  }

  // 探活没成。⚠️ 这里**必须**用原始异常：重造（`classify({error:null})`）的产物恒为 CONNECT_FAILED。
  const err =
    probeError instanceof BridgeError
      ? probeError
      : classify({ record, error: probeError ?? null, attempted: { searched, timeoutMs: 0 } });

  if (UNREACHABLE_CODES.has(err.code)) {
    const hint = err.hint ?? "稍等重试";
    return {
      state: {
        code: "RECORD_OK",
        message: `记录说在 ${fmtEndpoint(record.endpoint)} 监听（这次探活没连上：${err.code}）`,
        hint,
      },
      text: [
        head,
        `状态      记录说在 ${fmtEndpoint(record.endpoint)} 监听（这次探活没连上：${err.code}）`,
        `下一步    ${hint}`,
      ].join("\n"),
    };
  }

  return {
    state: { code: err.code, message: err.message, hint: err.hint },
    text: [head, `状态      ${err.message}`, `下一步    ${err.hint ?? "—"}`].join("\n"),
  };
}

/**
 * `--json` 信封里的 `servedBy`（「谁在服务」）——纯函数，钉住「不许谎报」。
 *   · 认人通过（`servedBy` 有值）⇒ 就是它；
 *   · `ping` 自己跳过认人（探的就是「谁在」）⇒ 取**真应答者** `result.pid`；
 *   · 真应答者也没有（理论上不该发生）⇒ 退回记录 pid。
 */
export function resolvedServedBy(servedBy, result, record) {
  if (typeof servedBy === "number") return servedBy;
  if (result && typeof result.pid === "number") return result.pid;
  return record && typeof record.pid === "number" ? record.pid : null;
}
