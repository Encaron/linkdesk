/**
 * device-probe——Block 3a 的「第二个作者」验证夹具（⛔ 不随壳发货）。
 *
 * 只做一件事：把 `window.linkdesk.device.*` 暴露成命令，证明**不读串口插件源码**也能
 * 拿到正确的会话语义（属主/幂等/僵尸/恢复）。协议、帧、编码一概不做——那是真实设备插件的事。
 *
 * 依赖面：`linkdesk.device.{acquire,release,getState,recover}`——规格见
 * `docs/04-软件更新/待抉择池/通用能力底盘/03-设备会话共享契约.md §8.2`。
 */

/** T14 信封：跨 contextBridge 抛错会丢自定义属性，必须返回结构化错误 */
function pluginError(code, message, hint, details) {
  return {
    isPluginError: true,
    code,
    message,
    ...(hint ? { hint } : {}),
    ...(details !== undefined ? { details } : {}),
  };
}

const api = typeof window !== "undefined" ? window.linkdesk : undefined;
const dev = api && api.device;
const reg = api && api.commands ? api.commands.registerCommand : null;

/**
 * 宿主 device.* 返回**回执信封**（contextBridge 抛错会丢 code/details）：
 * 成功剥掉 ok 后原样透传；失败原样转成插件错误信封（宿主码 EBUSY/EBADARGS/EDEVICE 原样带出）。
 */
/** 兜底：宿主信封已覆盖预期错误；这里只接意外 throw（无码 ⇒ EDEVICE） */
function wrap(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      return pluginError(
        e && typeof e.code === "string" && e.code ? e.code : "EDEVICE",
        e instanceof Error ? e.message : String(e),
      );
    }
  };
}

function unwrap(reply) {
  if (reply && reply.ok === false) {
    return pluginError(reply.code, reply.message, reply.hint, reply.details);
  }
  const { ok: _ok, ...rest } = reply;
  return rest;
}

if (reg && dev) {
  reg("device-probe.acquire", wrap(async (endpoint, owner) => {
    if (typeof endpoint !== "string" || !endpoint) {
      return pluginError("EBADARGS", "acquire 需要 endpoint（host:port）", "例：127.0.0.1:9100");
    }
    return unwrap(await dev.acquire({
      deviceKey: endpoint,
      transport: "tcp",
      ownerPluginId: typeof owner === "string" && owner ? owner : "device-probe",
      params: {},
    }));
  }));

  reg("device-probe.release", wrap(async (sessionId, owner) => {
    if (typeof sessionId !== "string" || !sessionId) {
      return pluginError("EBADARGS", "release 需要 sessionId");
    }
    return unwrap(await dev.release(sessionId, typeof owner === "string" && owner ? owner : "device-probe"));
  }));

  reg("device-probe.state", wrap(async (endpoint) => {
    return unwrap(await dev.getState({ ...(typeof endpoint === "string" && endpoint ? { deviceKey: endpoint } : {}), ownerPluginId: "device-probe" }));
  }));

  reg("device-probe.recover", wrap(async (sessionId) => {
    if (typeof sessionId !== "string" || !sessionId) {
      return pluginError("EBADARGS", "recover 需要 sessionId");
    }
    return unwrap(await dev.recover(sessionId, "device-probe"));
  }));
}
