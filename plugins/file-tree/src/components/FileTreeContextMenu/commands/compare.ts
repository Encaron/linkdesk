/**
 * compare 命令组——Diff「选择以比较 / 与已选项比较」（E6#87a 二次拆分）。
 *
 * 🔴 **模块级 mutable 单一属主**：`_selectedForCompare` 全仓仅在本文件声明。
 */
import { getOpenFileFn } from "../host-bridge";

const lk = window.linkdesk;

// E4V#40m——Diff："选择以比较"存储的基准文件路径
let _selectedForCompare: string | null = null;

export function registerCompareCommands(): void {
  // ── E4V#40m: Diff——选择以比较 / 与已选项比较 ──
  lk.commands.registerCommand("editor.selectForCompare", async (...args) => {
    const item = (args[0] as { uri?: string }) ?? {};
    if (item.uri) _selectedForCompare = item.uri;
  });
  lk.commands.registerCommand("editor.compareWithSelected", async (...args) => {
    const item = (args[0] as { uri?: string }) ?? {};
    const uri = item.uri;
    if (!uri || !_selectedForCompare || _selectedForCompare === uri) return;
    const orig = _selectedForCompare;
    _selectedForCompare = null;
    const origName = (orig.split("/").pop() || orig);
    const modName = (uri.split("/").pop() || uri);
    const sourceId = `${orig}|||${uri}`;
    getOpenFileFn()?.(sourceId, `${origName} ↔ ${modName}`, "pin");
  });
}
