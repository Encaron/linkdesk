/**
 * T4 白名单闸门自测——「受控 openExternal」的判据（本案「文件打开方式与贡献点」阶段 6）。
 *
 * 为什么单测钉在这里而不是端到端：闸门是**纯函数**（`sanitizeExternalUrl`），而它的两个消费点
 * （`window.open` 路由 handler ／ `IPC.shell.openExternal` handler）都只是「调它 + 转交系统」。
 * 把判据钉在纯函数上 ⇒ 正例负例一起红绿、无 Electron 运行时依赖。
 *
 * 🔴 负控三条（`file:` / `javascript:` / `data:`）是 D5 点名要拒的面——它们不是「随便挑的坏例子」：
 *   · `file:///C:/Windows/System32/calc.exe` —— 把外部输入指向本地任意路径（本该由插件的文件面走，不经 OS 壳）；
 *   · `javascript:…` / `data:text/html,…` —— 把外部输入当脚本/页面执行。
 *   任一条从白名单漏出去，插件就成了「无确认的系统级执行入口」。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { on: () => undefined },
  shell: { openExternal: async () => undefined, openPath: async () => '' },
}));

import { OPEN_EXTERNAL_PROTOCOLS, sanitizeExternalUrl } from './external-links';

describe('sanitizeExternalUrl —— T4 白名单闸门', () => {
  it('正例：白名单内的协议原样放行（归一化后）', () => {
    expect(sanitizeExternalUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(sanitizeExternalUrl('http://example.com/')).toBe('http://example.com/');
    expect(sanitizeExternalUrl('mailto:someone@example.com')).toBe('mailto:someone@example.com');
  });

  it('正例：`vscode://`（D5 的常量登记协议）——本案「以 VS Code 打开」的地基', () => {
    expect(sanitizeExternalUrl('vscode://file/C:/proj/a.ts')).toBe('vscode://file/C:/proj/a.ts');
  });

  it('协议名大小写不敏感（`HTTPS://` 同样放行）', () => {
    expect(sanitizeExternalUrl('HTTPS://example.com/')).toBe('https://example.com/');
    expect(sanitizeExternalUrl('VSCode://file/C:/a')).toBe('vscode://file/C:/a');
  });

  it('🔴 负控：`file:` / `javascript:` / `data:` 一律拒（D5 点名）', () => {
    expect(sanitizeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBeNull();
    expect(sanitizeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('🔴 负控：表外协议（含大小写变体）一律拒', () => {
    expect(sanitizeExternalUrl('ftp://example.com/x')).toBeNull();
    expect(sanitizeExternalUrl('ms-msdt:/id')).toBeNull();
    expect(sanitizeExternalUrl('LinkDesk://open')).toBeNull();
  });

  it('🔴 负控：非字符串 / 空串 / 无协议的相对路径一律拒', () => {
    expect(sanitizeExternalUrl(undefined)).toBeNull();
    expect(sanitizeExternalUrl(null)).toBeNull();
    expect(sanitizeExternalUrl(42)).toBeNull();
    expect(sanitizeExternalUrl({ url: 'https://example.com' })).toBeNull();
    expect(sanitizeExternalUrl('')).toBeNull();
    expect(sanitizeExternalUrl('example.com/a')).toBeNull();
    expect(sanitizeExternalUrl('//example.com/a')).toBeNull();
  });

  it('白名单常量就是这四个——⛔ 加协议必须同笔抬 host-reserved 账（本断言是那份账的哨兵）', () => {
    expect([...OPEN_EXTERNAL_PROTOCOLS]).toEqual(['http', 'https', 'mailto', 'vscode']);
  });
});
