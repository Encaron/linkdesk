/** event-sink——Block 3b 订阅端夹具：events.on("plugin:event") 按 eventId 收，不 import 发布方 */
const api = typeof window !== "undefined" ? window.linkdesk : undefined;
const reg = api && api.commands ? api.commands.registerCommand : null;
const received = [];

if (api && api.events && typeof api.events.on === "function") {
  api.events.on("plugin:event", (message) => {
    if (message && message.eventId === "demo.tick") {
      received.push({ n: message.payload && message.payload.n, at: message.payload && message.payload.at, from: message.from });
      if (received.length > 50) received.shift();
    }
  });
}

if (reg) {
  reg("event-sink.last", () => ({
    count: received.length,
    ...(received.length ? { last: received[received.length - 1] } : {}),
  }));
}
