/**
 * Electron 层常量——唯一真源。
 * E3i #68a：消 'linkdesk' 字面量散落——以后软件改名只改此处。
 * E5.7#45.5：shared/constants.ts 并入（DEV_SERVER_PORT/URL）——dev server 端口唯一真源。
 */

// E5.8#64：受控外观图片协议——scheme 名单真源在 src/core/utils/path/userDataImagePath（壳/electron 双端共用）
import { USERDATA_IMG_SCHEME } from "../src/core/utils/path/userDataImagePath.js";

/** 自定义协议 scheme——linkdesk:// 协议的注册名 */
export const APP_SCHEME = "linkdesk";

/** 受控外观图片协议 scheme——linkdesk-userdata://appearance/<file> → userData/appearance/<file>（E5.8#64） */
export const APPEARANCE_SCHEME = USERDATA_IMG_SCHEME;

/** window 命名空间——contextBridge.exposeInMainWorld 的 key */
export const APP_NAMESPACE = "linkdesk";

/**
 * dev server 端口——唯一真源（E5#102b 硬编码端口归一化）。
 * 消费方：vite.config.ts（server.port）+ main.ts / windows/window-manager.ts（DEV_SERVER_URL）。
 */
export const DEV_SERVER_PORT = 1420;
export const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
