/**
 * MCP 配置片段生成器（M4 `AI#38.6` ② / `AI#40` 共用——⛔ 唯一一份，不许 fork）。
 *
 * 消费方两处：
 *   · CLI：`linkdeskctl mcp config --for <client>`（AI#40 落地时接）；
 *   · 壳设置页：`aiBridge.copyMcpConfig` 命令（复制到剪贴板）——判据「剪贴板内容与 CLI 输出逐字一致」
 *     就靠**同一份函数**保证，机械可比。
 *
 * 形态按手册 07 §3.2 拍板：`linkdeskctl` ＋ `args:["mcp"]`（stdio 皮；MCP server 是 `linkdeskctl mcp`
 * 子命令，**不是** spawn 主进程代码——asar 不可 spawn，会话 7 实测订正）。零第三方依赖（AI#40 随包硬前提）。
 *
 * 纯函数、无 IO：命令名缺省 `linkdeskctl`（PATH 发现，安装版默认勾选 PATH——build/installer.nsh）。
 */

/** 已知客户端的配置文件形态（首版两种；新客户端 = 加一个 case，不改调用方） */
const CLIENTS = {
  /** 通用 JSON 形（Claude Desktop / 多数 MCP 客户端：mcpServers 表） */
  json: (snippet) => JSON.stringify(snippet, null, 2) + '\n',
  /** Codex CLI 的 config.toml 形 */
  codex: (snippet) => {
    const s = snippet.mcpServers.linkdesk;
    return `[mcp_servers.linkdesk]\ncommand = "${s.command}"\nargs = [${s.args.map((a) => `"${a}"`).join(', ')}]\n`;
  },
};

/**
 * 生成 MCP 配置片段。
 * @param {string} [client='json'] 目标客户端（CLIENTS 的键；未知客户端回落 json 并在文本里注明）
 * @param {string} [command='linkdeskctl'] 启动 MCP server 的命令（PATH 上的名字）
 * @returns {string} 可直接粘进客户端配置的文本
 */
export function formatMcpConfig(client = 'json', command = 'linkdeskctl') {
  const snippet = { mcpServers: { linkdesk: { command, args: ['mcp'] } } };
  const render = CLIENTS[client];
  if (render) return render(snippet);
  // 未知客户端：回落通用 JSON，头部注明（CLI --for 与复制按钮同享这一行为，不各写各的）
  return `# unknown client "${client}" — generic JSON:\n${CLIENTS.json(snippet)}`;
}

/** 支持的客户端名单（CLI `--for` 的枚举提示用；与 CLIENTS 的键同源） */
export function mcpConfigClients() {
  return Object.keys(CLIENTS);
}
