/**
 * state-probe——T-B 状态命令约定的**验证夹具**（⛔ 不随壳发货）。
 *
 * 形态：无视图、只注册命令的插件入口。壳在命令 miss 时 `import()` 本入口（on-command 激活），
 * 顶层注册即生效——与 file-tree 的 `src/index.tsx` 同一时机契约。
 *
 * 它证明三件事（对应 13-状态命令约定 §五 验收）：
 *   1. 读快照：`readState` 的实收键 ⊆ manifest 声明的 `returns`；
 *   2. 写后置状态：`writeValue` 回执 = 变更后的状态（⛔ `{}`/`true`）；
 *   3. 幂等键 + 版本冲突：`idempotencyKey` 由**宿主**回放（本文件不实现重放），
 *      `expectedVersion` 不一致 ⇒ 结构化 `ECONFLICT` ＋ `details.stateVersion`。
 *
 * ⚠️ 状态只活在内存：重启插件（池 reload）即归零——夹具语义，不落盘。
 */

const state = { value: 0, stateVersion: 0, updatedAt: null };

/** @returns {{value:number,stateVersion:number,updatedAt:string|null}} */
function snapshot() {
  return { value: state.value, stateVersion: state.stateVersion, updatedAt: state.updatedAt };
}

/** T14 信封：跨 contextBridge 抛错会丢自定义属性，必须**返回**结构化错误对象 */
function pluginError(code, message, hint, details) {
  return {
    isPluginError: true,
    code,
    message,
    ...(hint ? { hint } : {}),
    ...(details !== undefined ? { details } : {}),
  };
}

const reg = typeof window !== "undefined" && window.linkdesk && window.linkdesk.commands
  ? window.linkdesk.commands.registerCommand
  : null;

if (reg) {
  reg("state-probe.readState", () => snapshot());

  reg("state-probe.writeValue", (value, expectedVersion, idempotencyKey) => {
    // idempotencyKey 不在这里用：同键重放由宿主（exec 钩子）完成——插件只声明参数，
    // ⛔ 插件自建第二套重放 = 两套真相（13-状态命令约定 §二.3）。
    void idempotencyKey;
    if (typeof value !== "number" || Number.isNaN(value)) {
      return pluginError("EBADARGS", "value 必须是 number", "传一个数字，例如 {value: 1}");
    }
    if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== state.stateVersion) {
      return pluginError(
        "ECONFLICT",
        `状态版本冲突：期望 ${String(expectedVersion)}，当前 ${state.stateVersion}`,
        "先读 state-probe.readState 拿当前 stateVersion，按它重算后再写；⛔ 原样重试",
        { stateVersion: state.stateVersion },
      );
    }
    state.value = value;
    state.stateVersion += 1;
    state.updatedAt = new Date().toISOString();
    return snapshot();
  });

  reg("state-probe.reset", () => {
    state.value = 0;
    state.stateVersion = 0;
    state.updatedAt = new Date().toISOString();
    return snapshot();
  });
}
