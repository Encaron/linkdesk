/**
 * openMatch——双击/F4 打开匹配行所在文件（E6#87a 从 SearchView.tsx 拆出，逐字搬运）。
 */

import type { SearchWireMatch } from "@linkdesk/contracts";
import { extension } from "../../utils/pathUtils";

const lk = window.linkdesk;

export async function openMatch(match: SearchWireMatch): Promise<void> {
  const ext = extension(match.filePath);
  if (!ext) return;
  const pluginId = await lk.fileAssociation.getPluginFor(ext);
  if (!pluginId) return;
  window.linkdesk?.tabs?.create(pluginId, {
    filePath: match.filePath,
    label: match.filePath.split("/").pop() ?? match.filePath,
    pinned: true,
  });
}
