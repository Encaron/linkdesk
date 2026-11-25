/** event-source——Block 3b 发布端夹具：只调宿主 eventBus.publish（⛔ 私有通道） */
function pluginError(code, message, hint, details) {
  return { isPluginError: true, code, message, ...(hint ? { hint } : {}), ...(details !== undefined ? { details } : {}) };
}

const api = typeof window !== "undefined" ? window.linkdesk : undefined;
const bus = api && api.eventBus;
const reg = api && api.commands ? api.commands.registerCommand : null;
let seq = 0;

if (reg && bus) {
  reg("event-source.fire", async (n) => {
    const value = typeof n === "number" ? n : ++seq;
    const reply = await bus.publish("demo.tick", { n: value, at: Date.now() }, "event-source");
    if (reply && reply.ok === false) {
      return pluginError(reply.code, reply.message, reply.hint, reply.details);
    }
    const { ok: _ok, ...rest } = reply;
    return rest;
  });
}
