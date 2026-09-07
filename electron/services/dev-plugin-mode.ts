/**
 * dev 插件门控（E6#28b）——壳侧 dev（`npm run dev:plugin -- <id> --electron`）把主进程的
 * 插件发现/三表加载门控到「单个正在开发的插件」，并让它走物化 dist 目录消费（与第三方
 * 同一条 loadPlugin bundled 路径）。
 *
 * 门控信号 = 环境变量（dev 脚本拉起 electron 时注入，主进程零命令行参数解析）：
 *   LINKDESK_DEV_PLUGIN_ID  —— 正在开发的插件 id
 *   LINKDESK_DEV_PLUGIN_DIR —— 该插件物化目录绝对路径（`<repo>/plugins/<id>/dist/<id>.linkdesk-plugin`，
 *                              含根级 index.bundle.js，正斜杠）
 *
 * 为什么独立模块：plugin-file-service（发现）+ plugin-manifest-loader（三表）两处同读，
 * 放独立模块防 env 解析漂移——双写两处迟早不一致。
 *
 * 无 env / 打包态 = 零作用（electron:dev 原样走，惰性零回归——守卫全在 active() 一层）。
 * E6#62f：协议收单根等后续轮不需要重复此门控，直接 active() 判定。
 */

import { existsSync } from "fs";
import * as path from "path";
import { app } from "electron";

/** 门控描述——消费方（plugin-file-service / plugin-manifest-loader）经 devPluginMode.active() 解构取值 */
interface DevPluginMode {
  pluginId: string;
  /** 物化目录绝对路径（正斜杠）——含根级 index.bundle.js + plugin.json */
  dir: string;
}

class DevPluginModeService {
  /** undefined = 未求值（env 在 electron 进程启动前已定，惰性求值一次后冻结） */
  private _active: DevPluginMode | null | undefined;

  /** 当前 dev 门控；无（普通 electron:dev / 打包态 / env 无效）→ null */
  active(): DevPluginMode | null {
    if (this._active !== undefined) return this._active;
    this._active = this._resolve();
    return this._active;
  }

  private _resolve(): DevPluginMode | null {
    // 打包态双保险：dev 命令不进发货产物，env 残留也不得触发门控（发现层静默变空难查）
    if (app.isPackaged) return null;

    const pluginId = process.env.LINKDESK_DEV_PLUGIN_ID;
    const dir = process.env.LINKDESK_DEV_PLUGIN_DIR;
    if (!pluginId || !dir) return null;

    // 物化目录必须含 plugin.json 才算有效门控——防 env 残留指向已删/半截目录 →
    // 发现层静默空列表难查，宁 warn 退回全量发现
    if (!existsSync(path.join(dir, "plugin.json"))) {
      console.warn(
        `[dev-plugin-mode] LINKDESK_DEV_PLUGIN_DIR 指向目录缺 plugin.json，忽略 dev 门控（退回全量发现）: ${dir}`
      );
      return null;
    }

    return { pluginId, dir: dir.replace(/\\/g, "/") };
  }
}

export const devPluginMode = new DevPluginModeService();
