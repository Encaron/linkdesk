/**
 * Registry IPC 处理器——E5.7#49。
 *
 * 主进程三表（LangDef / Protocol / FileAssociation）的直接 IPC 接收端——
 * Registry 主进程化后，数据由 plugin-manifest-loader 预加载进主进程实例，
 * 池渲染进程经 preload-pool 直连这些通道（2 跳代理拉直为 1 跳）。
 * 只暴露可序列化字段：LangDef 剥 monarch tokenizer、Protocol 剥 parseLine/detect（JS 函数不可跨进程）。
 *
 * 通道名与旧代理保持一致（langDef:get / protocol:listProtocols / …）——池侧 API 面零改动。
 * E5.7#36：无状态 handler——IPC 通道只注册一次（壳崩重建复用不重注册）。
 */

import { ipcMain } from 'electron';
import { getLangDef } from '../../../src/core/registry/languages/LangDefRegistry.js';
import {
  listProtocols,
  getActiveProtocolId,
  setActiveProtocol,
} from '../../../src/core/registry/ProtocolRegistry.js';
import {
  listDeclaredExtensions,
  listHandlersFor,
  onAssociationsChanged,
  onSecondContender,
  resolveOpenTarget,
  WORKBENCH_FILE_ASSOCIATIONS_KEY,
} from '../../../src/core/services/files/FileAssociationService.js';
import { IPC } from '../channels.js';
import { IpcBridge } from '../ipc-bridge.js';
import { fileService } from '../../services/file-service.js';
import { getIntegrationState, setIntegrationEnabled, type OsIntegrationKind } from '../../services/registry-integration.js'; // E6#45f
import { configureOsAssociationsSync, scheduleOsAssociationsSync } from '../../services/os-associations-sync.js'; // T6（第 5 波）

let _registered = false;

/**
 * settings.json 平表现读（缺文件/读不动 = 空表——首次启动常态，不是错误）。
 * 本文件的两个读点（D1 覆盖表 / T6「跟随插件」两键）共用这一份读法：
 * storage-handlers `resolveEffectiveCacheDir` 同款——每次现读，零缓存失效复杂度。
 */
async function readSettingsJson(): Promise<Record<string, unknown>> {
  try {
    const raw = await fileService.readTextFile(
      fileService.join(fileService.appDataDir(), 'settings.json')
    );
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * D1 用户覆盖表现值——settings.json 平键直读（键形带点小写，查询侧 `resolveOpenTarget`
 * 对键做同款归一，此处只验形状（string→string）不重排）。
 */
async function readOverrideTable(): Promise<Record<string, string>> {
  const settings = await readSettingsJson();
  const table = settings[WORKBENCH_FILE_ASSOCIATIONS_KEY];
  if (!table || typeof table !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(table as Record<string, unknown>)) {
    if (typeof v === 'string' && v) out[k] = v;
  }
  return out;
}

export function registerRegistryHandlers(): void {
  if (_registered) return;
  _registered = true;

  ipcMain.handle(IPC.langDef.get, (_event, extension: string) => {
    const def = getLangDef(extension);
    if (!def) return null;
    return {
      id: def.id,
      lsp: def.lsp ?? null,
    };
  });

  ipcMain.handle(IPC.protocol.listProtocols, () =>
    listProtocols().map((p) => ({
      id: p.id,
      name: p.name,
      pluginId: p.pluginId,
      mode: p.mode,
    }))
  );

  ipcMain.handle(IPC.protocol.getActiveProtocolId, () => getActiveProtocolId());

  ipcMain.handle(IPC.protocol.setActiveProtocolId, (_event, protocolId: string) => {
    setActiveProtocol(protocolId);
  });

  // E5.7#50：FileAssociation 直连——原 PROXY_CHANNELS 代理（主进程→壳）拉直为主进程直答
  // T2（第 3 波）：getPluginFor 升级为**覆盖表感知**的完整解析（resolveOpenTarget：覆盖 → 声明 → 角色）
  // ——三入口（FoldersView／SearchView／intake）同吃一条通道 ⇒ F3「一处真相」的机械保证。契约返回形
  // `string | undefined` 不变：无声明且无挂牌者时返回 welcome（E22 提示页语义），空扩展名返回 undefined。
  ipcMain.handle(IPC.fileAssociation.getPluginFor, async (_event, extension: string) => {
    if (!extension) return undefined;
    return resolveOpenTarget(extension, await readOverrideTable());
  });

  // T2 只读面（01 §T2.1）：「打开方式…」选择器数据源——全部声明者＋当前默认标记
  ipcMain.handle(IPC.fileAssociation.listHandlersFor, async (_event, extension: string) =>
    listHandlersFor(extension, await readOverrideTable())
  );

  // E1/E2（D7）：第二竞争者出现 → 广播到壳（壳 startup 装配的提示组装弹通知）。
  // 广播时机 = 注册时间线（manifest loader 注册关联时）；启动批次落在壳订阅前被丢弃（启动不打扰）。
  onSecondContender((event) => {
    IpcBridge.active?.broadcast(IPC.fileAssociation.secondContender, event, 'shell');
  });

  // ── T6（第 5 波）：插件声明的文件类型进出 OS「打开方式」候选（运行期动态半）──
  // 装配点选这里的理由（本文件就是主进程的装配点）：三份输入在这儿都够得着——
  //   · 注册表现状（getIntegrationState：ProgId 树 = 「文件关联」开关事实）
  //   · settings.json 平键现读（readSettingsJson）
  //   · 活跃声明集合（listDeclaredExtensions：卸载/禁用即出表，E5/E7 同规）
  // 触发③（启动）：main.ts 在插件清单加载完之后显式调一次（见那里的注释）。
  configureOsAssociationsSync({
    statePath: fileService.join(fileService.appDataDir(), 'os-associations-dynamic.json'),
    readSettings: readSettingsJson,
    isProgIdRegistered: async () => (await getIntegrationState()).fileAssoc,
    listDeclared: listDeclaredExtensions,
  });
  // 触发①：注册/回收（插件装/卸/激活）
  onAssociationsChanged(() => scheduleOsAssociationsSync('plugin-lifecycle'));

  // E6#45f：OS 集成开关——读现状 / 开-关某项（写 HKCU 注册表，per-user 免提权；幂等）。
  // exePath = process.execPath（dev 下为 electron.exe——不做特判：dev 验的就是这条链）
  ipcMain.handle(IPC.registry.getIntegrationState, () => getIntegrationState());
  ipcMain.handle(IPC.registry.setIntegrationEnabled, async (_event, kind: OsIntegrationKind, enabled: boolean) => {
    const state = await setIntegrationEnabled(kind, enabled, process.execPath);
    // T6 触发补充：「文件关联」一关，ProgId 整树被删 ⇒ 动态候选必须同笔撤掉，否则资源管理器的
    // 「打开方式」里会挂出**指向空 ProgId 的僵尸行**；再打开则回填。这一步不能靠配置通知兜底
    // （开关的 onApply 与配置落盘谁先谁后不定），必须在写注册表这个点上就地补。
    if (kind === 'fileAssoc') scheduleOsAssociationsSync('integration-toggle:fileAssoc');
    return state;
  });
}
