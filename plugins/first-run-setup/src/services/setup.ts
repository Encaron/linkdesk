/**
 * 首次配置——插件在**本机上做的那次性配置**的全流程（E6#73p）。
 *
 * ═══ 这个模块补的是哪个洞 ═══
 *
 * R5-17 定过：装插件时「安装成功」和「配置成功」跳出两条是**正常的**——前者是插件市场/壳说的
 * （「装上了」），后者是**刚装好的那只插件自己**说的（「我在你电脑上配置好了」）。两条来源不同、
 * 生命周期不同，物理上就该是两块，不互相盖。
 *
 * 壳那半**已经在了**：`src/pluginLoader/lifecycle/lifecycle.ts` 的 onDidInstall 消费端发
 * 「已安装：X v1.0（即时生效）」，source = 被装插件 id。
 *
 * 「配置成功」这一半**全仓零生产者**——没有任何插件在装完之后真在本机上做过配置、更没发过通知。
 * 于是那套设计只能交付容器、交付不了实机可见的效果，等于只能靠嘴说。本模块把那半补上，
 * 并且写成**可以照着抄的样板**：
 *
 *   ① `workspace.env.get(自己的 id)` 拿到本机给的插件数据目录（安装时壳已建好）
 *   ② 把本机相关路径落成自己的 `config.json`——**这是"配置"的最朴素形态**，也是任何真插件
 *      装完第一件要做的事（本插件自己的目录、自己的缓存位、自己的导出口）
 *   ③ 真写了盘才出声：`notifications.show(..., { source: 自己的 id })`
 *
 * ═══ 作者抄这里时必须知道的三条 ═══
 *
 * 1. `source` **只能你自己报**——池是单进程共享 realm，preload 判不出是谁发的；不报就全落「其他」组。
 * 2. **别在"已经配过"时再发一次**——配置是一次性的，重复播报就是噪声（本模块用 config.json 的存在
 *    本身当标记，不另存状态；重跑必须显式 `force`）。
 * 3. **并发要合并**——视图和状态栏会各自触发一次，第二次必须复用第一次的进行中 Promise，
 *    否则同一次配置写两遍盘、发两条通知（硬约束 13 同款判据）。
 */
import i18n from "i18next";
import { FIRST_RUN_SETUP_PLUGIN_ID } from "../pluginId";

/** 配置档案文件名——落在插件数据目录根下 */
const CONFIG_FILE = "config.json";

/** 配置档案——落盘内容。写的是**本机事实**（目录、时间），不是偏好设置 */
export interface SetupConfig {
  /** 结构版本——将来换形状时按它判读 */
  schema: 1;
  pluginId: string;
  /** 本机完成首次配置的时刻（ISO 8601） */
  configuredAt: string;
  /** 本机路径档案——让「配置」这件事有实物，而不只是面板上闪过一行字 */
  dirs: { data: string; cache: string; exports: string };
}

/** 配置结果——`already: true` = 本机早配过了（**不发通知**） */
export type SetupResult =
  | { ok: true; already: boolean; config: SetupConfig; configPath: string }
  | { ok: false; error: string; configPath: string };

/** 并发去重——见档头「作者抄这里时必须知道的」第 3 条 */
let _inflight: Promise<SetupResult> | null = null;

/**
 * 执行首次配置。已配置过 → 直接返回（安静，不出声）；`force: true` → 覆盖重写并**再发一次通知**
 * （「重新配置」按钮与命令走这条——它同时也让这套流程可以反复演示）。
 */
export function runFirstRunSetup(opts?: { force?: boolean }): Promise<SetupResult> {
  if (_inflight) return _inflight;
  const p = runSetup(opts?.force === true).finally(() => {
    _inflight = null;
  });
  _inflight = p;
  return p;
}

/** 读配置档案——读不到/读坏了都返回 null（调用方据此重配，不崩） */
export async function readSetupConfig(configPath: string): Promise<SetupConfig | null> {
  try {
    if (!(await window.linkdesk.filesystem.exists(configPath))) return null;
    const raw = await window.linkdesk.filesystem.readTextFile(configPath);
    const parsed = JSON.parse(raw) as SetupConfig;
    return parsed && parsed.schema === 1 ? parsed : null;
  } catch {
    return null;
  }
}

async function runSetup(force: boolean): Promise<SetupResult> {
  const lk = window.linkdesk;
  const dataDir = await resolveDataDir();
  if (typeof dataDir !== "string") return dataDir; // 已是失败结果

  const configPath = lk.workspace.path.join(dataDir, CONFIG_FILE);

  if (!force) {
    const existing = await readSetupConfig(configPath);
    // 已配置 = 安静返回。**这里绝不能顺手补一条"已配置"通知**——一次性的事重复播报就是噪声。
    if (existing) return { ok: true, already: true, config: existing, configPath };
  }

  const env = await lk.workspace.env.get(FIRST_RUN_SETUP_PLUGIN_ID);
  const config: SetupConfig = {
    schema: 1,
    pluginId: FIRST_RUN_SETUP_PLUGIN_ID,
    configuredAt: new Date().toISOString(),
    dirs: {
      data: dataDir,
      cache: env.pluginCacheDir ?? lk.workspace.path.join(dataDir, "cache"),
      exports: env.pluginExportsDir ?? lk.workspace.path.join(dataDir, "exports"),
    },
  };

  try {
    await lk.filesystem.writeTextFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), configPath };
  }

  // ★ 本插件存在的理由：真写完了盘，才发这条带**自己来源**的通知。
  //   source 不传 → 它会被劈进「其他」组，跟壳发的那条「已安装：X」混在一起，R5-17 就白定了。
  await lk.notifications
    .show(i18n.t("首次配置完成——已在本机写好配置档案"), {
      type: "info",
      source: FIRST_RUN_SETUP_PLUGIN_ID,
    })
    .catch(() => {
      // 通知发不出去不该让配置本身算失败——盘已经落了，这是既成事实。
    });

  return { ok: true, already: false, config, configPath };
}

/** 取本机给的插件数据目录——拿不到时返回失败结果（调用方直接把它当结果用） */
async function resolveDataDir(): Promise<string | SetupResult> {
  try {
    const env = await window.linkdesk.workspace.env.get(FIRST_RUN_SETUP_PLUGIN_ID);
    if (!env.pluginDataDir) {
      return { ok: false, error: i18n.t("本机未提供插件数据目录——无法完成首次配置"), configPath: "" };
    }
    return env.pluginDataDir;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      configPath: "",
    };
  }
}
