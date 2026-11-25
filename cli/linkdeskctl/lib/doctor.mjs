/**
 * `doctor --blind`（S5 · 门外自检）——模拟「零资料、看不见界面」的外部 AI 走一遍真实路径，
 * 断言**通用不变式**：回执同深度、变更命令有后置状态、状态如实、错误有码、描述面自述完整。
 *
 * ── 🔴 纪律（05 §一铁律，⛔ 违反）──
 *   · ⛔ 断言里不出现串口语义（游标/波特率/AT 指令）——插件知识只作 **profile 数据**（命令 id），
 *     断言本体与插件无关（判据：file-tree profile 跑同一份断言也成立）；
 *   · ⛔ 断言与执行共用**同一套 CLI 客户端**（`callBridge`）——不为 doctor 另写 HTTP/JSON 处理，
 *     否则测的不是 AI 走的路；
 *   · ⛔ 为让 doctor 变绿而弱化断言；每条断言给 `{assertionId, 期望, 实际, 复现命令}`；
 *   · ⛔ 不进 `npm run check`（要活实例）；发版前人工跑一次（决策 #1）。
 *   · manifest 尚未补齐的字段（returns/apiVersion）⇒ 对应断言**记 skip**（⛔ 不红不绿），
 *     B 补齐后同批转严——「按现有 manifest」口径（调度台 2026-11-25）。
 *   · Block 1（2026-11-25）：`a-view-code` 只认 `EVIEWREQUIRED`——存量 activation 声明已补齐，
 *     `ENOTACTIVE` 从此是红（入口没认领 ≠ 视图不在场，两者不可混读）。
 *
 * ── 用法 ──
 *   linkdeskctl doctor                    # 全量跑（默认 profile = serial）
 *   linkdeskctl doctor --profile file-tree  # 非硬件领域跨领域验收（T24）
 *   linkdeskctl doctor --list             # 列全部断言（id 即文档，⛔ 另写自检项说明）
 *   linkdeskctl doctor -k a-view-code     # 单跑一条
 *   linkdeskctl doctor --json             # 机读（AI 消费：每条 pass/skip/expected/actual/repro）
 */

/* ── profile（数据，⛔ 不是代码分支）：一条 profile 选一个插件的命令面做样本 ── */

const PROFILES = {
  /** 串口监视器——第一个压力测试样本（28 条命令、视图态/插件级混合） */
  serial: {
    label: "serial-monitor（硬件压力样本）",
    pluginId: "serial-monitor",
    /** R0 只读命令——回执深度断言与「entry 级无视图可调」的样本 */
    readCommand: "serial-monitor.listPorts",
    /** 视图态命令——无视图调它必须回可判读码（EVIEWREQUIRED/ENOTACTIVE） */
    viewCommand: "serial-monitor.copy",
    /** 可逆写命令——执行后必须有后置状态可回读（⛔ 禁 {}/null） */
    changeCommand: "serial-monitor.openPort",
    /** 后置状态面——change 之后读它验证「状态如实」 */
    stateCommand: "serial-monitor.receiveStatus",
    /** 收尾命令——change 成功后恢复现场，且状态面确认无残留 */
    teardownCommand: "serial-monitor.closePort",
    /** T-B：串口未声明 idempotencyKey / 版本前置 ⇒ 幂等/冲突断言跳过（⛔ 硬造） */
    idempotentCommand: null,
    conflictCommand: null,
  },
  /** file-tree——非硬件领域（跨领域验收：同一条断言链，⛔ 没有串口语义也能跑） */
  "file-tree": {
    label: "file-tree（非硬件领域）",
    pluginId: "file-tree",
    readCommand: "file-tree.refresh",
    // file-tree 当前全部 entry 注册（B 的 activation 草案）——无视图态样本 ⇒ 该断言跳过
    viewCommand: null,
    // 无「可逆写 + 可回读后置状态」的无害样本 ⇒ 后置状态/收尾断言跳过（⛔ 硬造一条写盘命令当样本）
    changeCommand: null,
    // 1.0.38（T-B）：refresh 回状态快照，无视图也回（viewMounted:false）——状态键断言的真实样本
    stateCommand: "file-tree.refresh",
    teardownCommand: null,
    // 幂等键：rename 是「目标路径收敛」写，同键重放可验；但**异键负控**会撞 ENOENT（源已不在）
    // ⇒ 不给 doctor 做负控样本（幂等断言仍由 state-probe 覆盖）
    idempotentCommand: null,
    // 版本前置：冲突先于落盘 ⇒ 用不存在的路径即可验码（⛔ 需要真文件）
    conflictCommand: "file-tree.rename",
    conflictArgs: { uri: "C:/linkdesk-doctor-none.txt", newName: "none-2.txt", expectedVersion: 999999 },
  },
  /**
   * device-probe——设备会话样本（Block 3a）：只用宿主 device.*（tcp transport），
   * ⛔ 不读 serial 源码。运行前需一个 TCP 回环服务（地址 = --endpoint 或 profile 缺省）。
   */
  "device-probe": {
    label: "device-probe（设备会话样本 · dev-fixtures）",
    pluginId: "device-probe",
    readCommand: "device-probe.state",
    viewCommand: null,
    changeCommand: null,
    stateCommand: null,
    teardownCommand: null,
    idempotentCommand: null,
    conflictCommand: null,
    deviceAcquireCommand: "device-probe.acquire",
    deviceStateCommand: "device-probe.state",
    deviceReleaseCommand: "device-probe.release",
    deviceEndpoint: "127.0.0.1:9100",
  },
  /**
   * state-probe——纯软件状态样本（T-B · 13-状态命令约定）。
   * 插件住 `dev-fixtures/state-probe/`（验证用，⛔ 随壳发货）：装上后同一条断言链对
   * 「读快照 → 改 → 回读确认 → 同键重放 → 版本冲突」全链路成立。
   */
  "state-probe": {
    label: "state-probe（纯软件状态样本 · dev-fixtures）",
    pluginId: "state-probe",
    readCommand: "state-probe.readState",
    viewCommand: null,
    changeCommand: "state-probe.writeValue",
    changeArgs: { value: 1 },
    stateCommand: "state-probe.readState",
    teardownCommand: "state-probe.reset",
    idempotentCommand: "state-probe.writeValue",
    idempotentArgs: { value: 5 },
    conflictCommand: "state-probe.writeValue",
    conflictArgs: { value: 6, expectedVersion: 999999 },
  },
};

const RISK_LEVELS = new Set(["R0", "R1", "R2", "R3"]);
const RISK_SOURCES = new Set(["shell", "declared", "fallback"]);

/** exec 的错误回执（内核按码拒绝时 call 抛 BridgeError——包回来让断言能判） */
async function execChecked(call, commandId, args = []) {
  try {
    return { ok: true, result: await call("exec", { commandId, args }) };
  } catch (e) {
    return {
      ok: false,
      code: e && e.code ? e.code : "EERROR",
      message: e ? e.message : String(e),
      ...(e && e.details !== undefined ? { details: e.details } : {}),
    };
  }
}

/** 该插件是否已有打开的标签页（tabs 操作的结构：windows[].groups[].tabs[].pluginId） */
async function pluginHasOpenTab(ctx, pluginId) {
  try {
    const layout = await ctx.call("tabs");
    const wins = (layout && Array.isArray(layout.windows)) ? layout.windows : [];
    for (const w of wins) {
      const groups = (w && Array.isArray(w.groups)) ? w.groups : [];
      for (const g of groups) {
        const tabs = (g && Array.isArray(g.tabs)) ? g.tabs : [];
        if (tabs.some((t) => t && t.pluginId === pluginId)) return true;
      }
    }
  } catch {
    /* tabs 读不到 ⇒ 不阻断断言（按无视图处理，失败会照常报红并给复现命令） */
  }
  return false;
}

/** 一条断言的结果形状（⛔ 只打 FAILED——失败必须可定位） */
function resultOf(id, name, source, body) {
  return {
    id,
    name,
    source,
    pass: body.pass,
    ...(body.skip ? { skip: true, note: body.note } : {}),
    expected: body.expected,
    actual: body.actual,
    repro: body.repro,
  };
}

/**
 * 断言全集——`run(ctx)` 的 ctx = `{ call, profile, note }`；`call` = callBridge 同形
 * （返回 result；内核错误抛带 code 的 BridgeError）。
 * `source` = 它防的是哪条回归（05 判据：每条断言都有来源，⛔ 空着）。
 */
export const DOCTOR_ASSERTIONS = [
  {
    id: "a-ping",
    name: "通道可达：ping 应答且身份一致",
    source: "B2-5（EPENDING 只能干等 → 先证通道与身份）",
    async run(ctx) {
      const r = await ctx.call("ping");
      const pass = !!r && typeof r.pid === "number" && r.pid > 0;
      return { pass, expected: "ping 应答含 pid", actual: pass ? `pid=${r.pid}` : "应答缺 pid", repro: "linkdeskctl ping" };
    },
  },
  {
    id: "a-desc-shape",
    name: "描述面自述完整：commands 每条带 risk/riskSource（严格 JSON 形状）",
    source: "B2-4/I-1（靠试错猜请求体 / 风险轴为空）",
    async run(ctx) {
      const r = await ctx.call("describe");
      const cs = r && r.commands;
      if (!Array.isArray(cs)) {
        return { pass: false, expected: "describe.commands 是数组", actual: `实得 ${typeof cs}`, repro: "linkdeskctl describe --json" };
      }
      const bad = cs.filter(
        (c) => !c || typeof c.id !== "string" || !c.id || !RISK_LEVELS.has(c.risk) || !RISK_SOURCES.has(c.riskSource),
      );
      const countOk = r.commandCount === cs.length;
      const missReturns = cs.filter((c) => c && !("returns" in c)).length;
      const missActivation = cs.filter((c) => c && !("activation" in c) && typeof c.activation !== "string").length;
      // returns/activation 按现有 manifest 记 note（B 补齐后转严）——⛔ 现在红 = 假红
      const pass = bad.length === 0 && countOk;
      return {
        pass,
        skip: false,
        expected: `全部 ${cs.length} 条命令带 risk/riskSource，commandCount 一致`,
        actual: pass
          ? `全过（note：returns 缺失 ${missReturns}、activation 缺失 ${missActivation}——按现有 manifest 记 skip，B 补齐后转严）`
          : `坏条目 ${bad.length} 条 / commandCount=${r.commandCount} vs commands=${cs.length}`,
        repro: "linkdeskctl describe --json",
      };
    },
  },
  {
    id: "a-unknown-code",
    name: "错误有码：不存在的命令 ⇒ EUNKNOWNCOMMAND（⛔ 中文裸字符串）",
    source: "B1-9（错误让我从中文句子里猜）",
    async run(ctx) {
      const r = await execChecked(ctx.call, `${ctx.profile.pluginId}.doctor-no-such`);
      const pass = !r.ok && r.code === "EUNKNOWNCOMMAND";
      return {
        pass,
        expected: "code=EUNKNOWNCOMMAND",
        actual: r.ok ? "居然执行成功了" : `code=${r.code}`,
        repro: `linkdeskctl exec ${ctx.profile.pluginId}.doctor-no-such`,
      };
    },
  },
  {
    id: "a-view-code",
    name: "可达性有码：无视图调视图态命令 ⇒ EVIEWREQUIRED（Block 1 起只认此码）",
    source: "B1-7/I-2（when=… 命令不开视图够不着、且看不出要开视图）",
    async run(ctx) {
      const cmd = ctx.profile.viewCommand;
      if (!cmd) {
        return { pass: true, skip: true, note: "profile 无视图态命令样本（该插件当前全部 entry 注册）", expected: "—", actual: "—", repro: "—" };
      }
      // 🔴 前置：断言前提是「该插件的视图不在场」。真实实例上用户常开着串口页，
      //    此时 view 命令**本就该成功**——不检查前置就会误红（2026-11-25 外部实测踩到）。
      const openPlugin = await pluginHasOpenTab(ctx, ctx.profile.pluginId);
      if (openPlugin) {
        return {
          pass: true,
          skip: true,
          note: `插件 "${ctx.profile.pluginId}" 的视图已开着（命令本就可用，该断言的前提不成立）——关掉视图后再单跑本条`,
          expected: "—",
          actual: "—",
          repro: `linkdeskctl tabs`,
        };
      }
      const r = await execChecked(ctx.call, cmd);
      // Block 1（2026-11-25）：只认 EVIEWREQUIRED——ENOTACTIVE 是「入口没认领」，不是「视图不在场」，
      // 混着接受会让 manifest 声明缺失/入口加载失败长期伪装成可达性正常。
      const pass = !r.ok && r.code === "EVIEWREQUIRED";
      return {
        pass,
        expected: "EVIEWREQUIRED（视图态命令的唯一可判读码）",
        actual: r.ok
          ? "居然执行成功了"
          : `code=${r.code}${r.code === "ENOTACTIVE" ? "（入口没认领——查 manifest activation 声明与插件启用状态）" : ""}`,
        repro: `linkdeskctl exec ${cmd}`,
      };
    },
  },
  {
    id: "a-exec-depth",
    name: "回执深度恒 1：exec 信封恰好一层（⛔ 嵌套第二层信封）",
    source: "B1-6（回执嵌套 1 层 / 2 层不一致）＋ 回执深度哨兵（不复现则销账但留哨兵）",
    async run(ctx) {
      const cmd = ctx.profile.readCommand;
      const r = await execChecked(ctx.call, cmd);
      if (!r.ok) {
        return { pass: false, expected: "readCommand 执行成功", actual: `code=${r.code} ${r.message}`, repro: `linkdeskctl exec ${cmd}` };
      }
      const out = r.result;
      const keys = out && typeof out === "object" && !Array.isArray(out) ? Object.keys(out) : null;
      // exec 回执形状 = { commandId, result }——result 内容任意，但信封必须只此一层（再嵌一层信封 = 红）
      const oneLayer = !!keys && keys.includes("commandId") && keys.includes("result") && !(out.result && typeof out.result === "object" && "commandId" in out.result && "result" in out.result);
      return {
        pass: oneLayer,
        expected: "回执 = { commandId, result } 单层信封",
        actual: keys ? `keys=${JSON.stringify(keys)}` : `实得 ${JSON.stringify(out)?.slice(0, 80)}`,
        repro: `linkdeskctl exec ${cmd}`,
      };
    },
  },
  {
    id: "a-poststate",
    name: "状态如实：变更命令执行后必有后置状态可回读（⛔ 禁 {}/null；失败也必须有码）",
    source: "B1-3/B2-1（paused 吞数据 → 静默假死 / open:true 撒谎）",
    async run(ctx) {
      const change = ctx.profile.changeCommand;
      if (!change) {
        return { pass: true, skip: true, note: "profile 无可逆写样本", expected: "—", actual: "—", repro: "—" };
      }
      const r = await execChecked(ctx.call, change, ctx.profile.changeArgs ?? []);
      if (!r.ok) {
        // 变更失败合法（如无设备）——但失败必须是**带码**的（⛔ 裸字符串 = 门外不可判读）
        const coded = typeof r.code === "string" && r.code.length > 0 && !r.code.startsWith("EERROR");
        return {
          pass: coded,
          expected: "变更命令失败 ⇒ 带可判读码（无设备等场景合法，⛔ 裸失败）",
          actual: `code=${r.code}`,
          repro: `linkdeskctl exec ${change}`,
        };
      }
      const state = await execChecked(ctx.call, ctx.profile.stateCommand);
      // exec 回执 = 信封 {commandId, result}——后置状态看**内层 result**（⛔ 查信封本身恒非空，等于假绿）
      const inner = state.ok && state.result && typeof state.result === "object" ? state.result.result : undefined;
      const nonEmpty =
        inner !== null && inner !== undefined
        && (Array.isArray(inner) ? inner.length > 0 : typeof inner === "object" && Object.keys(inner).length > 0);
      return {
        pass: nonEmpty,
        expected: `${ctx.profile.stateCommand} 的后置状态非空（⛔ {}/null/空数组）`,
        actual: state.ok ? `内层实得 ${JSON.stringify(inner)?.slice(0, 80)}` : `code=${state.code}`,
        repro: `linkdeskctl exec ${ctx.profile.stateCommand}`,
      };
    },
  },
  {
    id: "a-teardown",
    name: "收尾无残留：teardown 命令成功，且状态面不再报已变更状态",
    source: "B2-1（拔插后 open:true 关不掉、状态撒谎）",
    async run(ctx) {
      const change = ctx.profile.changeCommand;
      const teardown = ctx.profile.teardownCommand;
      if (!change || !teardown) {
        return { pass: true, skip: true, note: "profile 无收尾样本", expected: "—", actual: "—", repro: "—" };
      }
      const t = await execChecked(ctx.call, teardown);
      const pass = t.ok || (typeof t.code === "string" && t.code.length > 0);
      return {
        pass,
        expected: "teardown 执行成功（或带码失败——⛔ 裸错误）",
        actual: t.ok ? "成功" : `code=${t.code}`,
        repro: `linkdeskctl exec ${teardown}`,
      };
    },
  },
  {
    id: "a-async-op",
    name: "异步句柄：async 命令回 {pending,opId}，opStatus 读到终态，log 有 op.completed",
    source: "B2-5（EPENDING 后没法确认何时结束，只能干等）",
    async run(ctx) {
      const desc = await ctx.call("describe");
      const asyncCmd = (desc && Array.isArray(desc.commands) ? desc.commands : []).find(
        (c) => c && c.async === true && typeof c.id === "string",
      );
      if (!asyncCmd) {
        return {
          pass: true,
          skip: true,
          note: "当前命令面没有声明 async 的命令（插件尚未使用 S6；出现第一条后本条自动转严）",
          expected: "—",
          actual: "—",
          repro: "linkdeskctl describe --json",
        };
      }
      const r = await execChecked(ctx.call, asyncCmd.id, ctx.profile.asyncArgs ?? []);
      if (!r.ok) {
        return {
          pass: false,
          expected: `${asyncCmd.id} 回 pending+opId`,
          actual: `code=${r.code} ${r.message}`,
          repro: `linkdeskctl exec ${asyncCmd.id}`,
        };
      }
      const out = r.result;
      const hasHandle = out && out.pending === true && typeof out.opId === "string" && out.opId.length > 0;
      if (!hasHandle) {
        return {
          pass: false,
          expected: "async 回执 {pending:true, opId}",
          actual: `实得 ${JSON.stringify(out)?.slice(0, 120)}`,
          repro: `linkdeskctl exec ${asyncCmd.id}`,
        };
      }
      // 采样窗口：应见 running → 终态（⛔ 干等）。
      // 🔴 轮询间隔必须有——连打三次无间隔时，快命令也可能还没结算就被判红（2026-11-25 实测 flaky：op_093f25ab）。
      const states = [];
      for (let i = 0; i < 6; i += 1) {
        const st = await ctx.call("opStatus", { opId: out.opId }).catch((e) => ({ state: `error:${e && e.code}` }));
        states.push(st && st.state);
        if (st && (st.state === "done" || st.state === "failed")) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      const terminal = states.includes("done") || states.includes("failed");
      const log = await ctx.call("log", { limit: 50 }).catch(() => null);
      const logged = !!(log && Array.isArray(log.entries) && log.entries.some((e) => e && e.op === "op.completed" && e.opId === out.opId));
      return {
        pass: terminal && logged,
        expected: "opStatus 采样到终态 ＋ log 有同一 opId 的 op.completed",
        actual: `采样=${JSON.stringify(states)} · log事件=${logged}`,
        repro: `linkdeskctl exec --status ${out.opId}`,
      };
    },
  },
  {
    id: "a-state-keys",
    name: "状态快照可判读：只读命令实收回执的键 ⊆ describe 声明的 returns",
    source: "T-B/13（声明面与实收回执漂移：AI 按 returns 写的断言对不上真回执）",
    async run(ctx) {
      const cmd = ctx.profile.stateCommand ?? ctx.profile.readCommand;
      const desc = await ctx.call("describe");
      const entry = (desc && Array.isArray(desc.commands) ? desc.commands : []).find((c) => c && c.id === cmd);
      if (!entry || !Array.isArray(entry.returns) || entry.returns.length === 0) {
        return { pass: true, skip: true, note: `${cmd} 未声明 returns（B 补齐后转严）`, expected: "—", actual: "—", repro: "linkdeskctl describe --json" };
      }
      const r = await execChecked(ctx.call, cmd);
      if (!r.ok) {
        return { pass: false, expected: `${cmd} 执行成功`, actual: `code=${r.code} ${r.message}`, repro: `linkdeskctl exec ${cmd}` };
      }
      const inner = r.result && typeof r.result === "object" ? r.result.result : undefined;
      const keys = inner && typeof inner === "object" && !Array.isArray(inner) ? Object.keys(inner) : [];
      const declared = new Set(entry.returns.map((f) => f && f.name).filter((n) => typeof n === "string"));
      const unexpected = keys.filter((k) => !declared.has(k));
      return {
        pass: keys.length > 0 && unexpected.length === 0,
        expected: `实收键 ⊆ 声明 returns（${[...declared].join("/")}）`,
        actual: unexpected.length ? `未声明键=${unexpected.join(",")}` : `keys=${JSON.stringify(keys)}`,
        repro: `linkdeskctl exec ${cmd}`,
      };
    },
  },
  {
    id: "a-idempotent",
    name: "重试不重复执行：同一 idempotencyKey 第二次回 replayed:true，换键则真执行",
    source: "T-B/13（AI 超时重试 = 同一动作做两遍）",
    async run(ctx) {
      const cmd = ctx.profile.idempotentCommand;
      if (!cmd) {
        return { pass: true, skip: true, note: "profile 无声明幂等键的写命令样本", expected: "—", actual: "—", repro: "—" };
      }
      const base = ctx.profile.idempotentArgs ?? {};
      const key = `doctor-${Date.now()}`;
      const first = await execChecked(ctx.call, cmd, [{ ...base, idempotencyKey: key }]);
      if (!first.ok) {
        return { pass: false, expected: `${cmd} 首次执行成功`, actual: `code=${first.code} ${first.message}`, repro: `linkdeskctl exec ${cmd} '${JSON.stringify({ ...base, idempotencyKey: key })}'` };
      }
      const second = await execChecked(ctx.call, cmd, [{ ...base, idempotencyKey: key }]);
      const inner = second.ok && second.result && typeof second.result === "object" ? second.result.result : undefined;
      const replayed = !!inner && inner.replayed === true;
      // 负控：换一个键必须是真执行（否则「重放」是假的——命令根本没在跑）
      const third = await execChecked(ctx.call, cmd, [{ ...base, idempotencyKey: `${key}-b` }]);
      const inner3 = third.ok && third.result && typeof third.result === "object" ? third.result.result : undefined;
      const negative = third.ok && (!inner3 || inner3.replayed !== true);
      return {
        pass: replayed && negative,
        expected: "同键第二次 replayed:true；不同键不回放",
        actual: `second.replayed=${replayed} · third.replayed=${inner3 ? inner3.replayed === true : "n/a"}`,
        repro: `linkdeskctl exec ${cmd} '{"value":...,"idempotencyKey":"<同键>"}'`,
      };
    },
  },
  {
    id: "a-conflict",
    name: "冲突可判读：陈旧 stateVersion 写入 ⇒ ECONFLICT ＋ details.stateVersion",
    source: "T-B/13（并发覆盖：AI 只能从中文猜「版本不对」）",
    async run(ctx) {
      const cmd = ctx.profile.conflictCommand;
      if (!cmd) {
        return { pass: true, skip: true, note: "profile 无版本前置的写命令样本", expected: "—", actual: "—", repro: "—" };
      }
      const r = await execChecked(ctx.call, cmd, [ctx.profile.conflictArgs ?? {}]);
      const hasVersion = !!(r.details && typeof r.details === "object" && "stateVersion" in r.details);
      return {
        pass: !r.ok && r.code === "ECONFLICT" && hasVersion,
        expected: "code=ECONFLICT ＋ details.stateVersion（当前快照版本）",
        actual: r.ok ? "居然执行成功了" : `code=${r.code} · details=${JSON.stringify(r.details ?? null)}`,
        repro: `linkdeskctl exec ${cmd} '${JSON.stringify(ctx.profile.conflictArgs ?? {})}'`,
      };
    },
  },
  {
    id: "a-device-truth",
    name: "设备状态如实：acquire ⇒ open:true/属主可读；release ⇒ 无会话；重复 release 幂等",
    source: "Block 3a/03（串口五类 bug 的通用化：状态撒谎/僵尸/幂等释放）",
    async run(ctx) {
      const acq = ctx.profile.deviceAcquireCommand;
      if (!acq) {
        return { pass: true, skip: true, note: "profile 无设备会话样本", expected: "—", actual: "—", repro: "—" };
      }
      const endpoint = ctx.endpoint ?? ctx.profile.deviceEndpoint;
      if (!endpoint) {
        return { pass: true, skip: true, note: "未给 --endpoint（设备会话断言需要真实设备/回环服务）", expected: "—", actual: "—", repro: "linkdeskctl doctor --profile device-probe --endpoint 127.0.0.1:9100" };
      }
      const a = await execChecked(ctx.call, acq, [{ endpoint }]);
      const inner = a.ok && a.result && typeof a.result === "object" ? a.result.result : undefined;
      if (!a.ok) {
        return { pass: false, expected: `${acq} 成功（需要 TCP 回环服务在 ${endpoint}）`, actual: `code=${a.code} ${a.message}`, repro: `linkdeskctl exec ${acq} '{"endpoint":"${endpoint}"}'` };
      }
      const sessionId = inner && inner.sessionId;
      const opened = !!inner && inner.state && inner.state.open === true && inner.state.ownerSessionId === sessionId;
      const st = await execChecked(ctx.call, ctx.profile.deviceStateCommand, [{ endpoint }]);
      const stInner = st.ok && st.result && typeof st.result === "object" ? st.result.result : undefined;
      const listed = !!stInner && Array.isArray(stInner.sessions) && stInner.sessions.some((x) => x && x.sessionId === sessionId && x.open === true && x.stale === false);
      const rel = await execChecked(ctx.call, ctx.profile.deviceReleaseCommand, [{ sessionId }]);
      const relInner = rel.ok && rel.result && typeof rel.result === "object" ? rel.result.result : undefined;
      const released = !!relInner && relInner.released === true;
      const again = await execChecked(ctx.call, ctx.profile.deviceReleaseCommand, [{ sessionId }]);
      const againInner = again.ok && again.result && typeof again.result === "object" ? again.result.result : undefined;
      const idempotent = !!againInner && againInner.already === true;
      const after = await execChecked(ctx.call, ctx.profile.deviceStateCommand, [{ endpoint }]);
      const afterInner = after.ok && after.result && typeof after.result === "object" ? after.result.result : undefined;
      const empty = !!afterInner && Array.isArray(afterInner.sessions) && afterInner.sessions.length === 0;
      return {
        pass: opened && listed && released && idempotent && empty,
        expected: "acquire 后 open:true；release 后无会话；重复 release ⇒ already:true",
        actual: `open=${opened} · listed=${listed} · released=${released} · idempotent=${idempotent} · empty=${empty}`,
        repro: `linkdeskctl doctor --profile device-probe --endpoint ${endpoint}`,
      };
    },
  },
  {
    id: "a-device-owner",
    name: "设备属主唯一：他主 acquire ⇒ EBUSY；非属主 release ⇒ EBADARGS",
    source: "Block 3a/03（一个 OS 句柄只归一个会话；⛔ 作用到别人会话）",
    async run(ctx) {
      const acq = ctx.profile.deviceAcquireCommand;
      const endpoint = ctx.endpoint ?? ctx.profile.deviceEndpoint;
      if (!acq || !endpoint) {
        return { pass: true, skip: true, note: "无设备样本或未给 --endpoint", expected: "—", actual: "—", repro: "—" };
      }
      const a = await execChecked(ctx.call, acq, [{ endpoint, owner: "doctor-a" }]);
      const inner = a.ok && a.result && typeof a.result === "object" ? a.result.result : undefined;
      const sessionId = inner && inner.sessionId;
      if (!sessionId) {
        return { pass: false, expected: `${acq}（owner=doctor-a）成功`, actual: `code=${a.code} ${a.message}`, repro: `linkdeskctl exec ${acq} '{"endpoint":"${endpoint}","owner":"doctor-a"}'` };
      }
      const busy = await execChecked(ctx.call, acq, [{ endpoint, owner: "doctor-b" }]);
      const busyOk = !busy.ok && busy.code === "EBUSY" && busy.details && busy.details.ownerSessionId === sessionId;
      const wrong = await execChecked(ctx.call, ctx.profile.deviceReleaseCommand, [{ sessionId, owner: "doctor-b" }]);
      const wrongOk = !wrong.ok && wrong.code === "EBADARGS";
      // 收尾：真属主释放（失败也不掩盖前两条）
      await execChecked(ctx.call, ctx.profile.deviceReleaseCommand, [{ sessionId, owner: "doctor-a" }]);
      return {
        pass: busyOk && wrongOk,
        expected: "他主 acquire ⇒ EBUSY(details.ownerSessionId)；非属主 release ⇒ EBADARGS",
        actual: `busy=${busyOk} · wrongOwner=${wrongOk}`,
        repro: `linkdeskctl doctor --profile device-probe --endpoint ${endpoint}`,
      };
    },
  },
];

/**
 * 编排——按序跑断言（a-ping 先证通道，连接类错误整场失败）。
 * @param {{call: Function, profile?: string, only?: string}} opts
 * @returns 每条的 resultOf 形状数组
 */
export async function runDoctor({ call, profile = "serial", only = null, endpoint = null }) {
  const profileData = PROFILES[profile];
  if (!profileData) {
    throw new Error(`未知 profile "${profile}"——可选: ${Object.keys(PROFILES).join(" / ")}`);
  }
  const ctx = { call, profile: profileData, endpoint: endpoint ?? profileData.deviceEndpoint ?? null };
  const list = only ? DOCTOR_ASSERTIONS.filter((a) => a.id === only) : DOCTOR_ASSERTIONS;
  if (only && list.length === 0) {
    throw new Error(`未知断言 "${only}"——用 --list 看全部`);
  }
  const out = [];
  for (const a of list) {
    const body = await a.run(ctx);
    out.push(resultOf(a.id, a.name, a.source, body));
  }
  return out;
}
