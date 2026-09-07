/**
 * Pool preload 数据域命名空间集合——serial/filesystem/clipboard/path/env/app/encoding/search/fileAssociation。
 * E5.8#0d.10-4d：自 preload-pool.ts 拆出——无模块级状态的纯 IPC 薄转发面（invoke/send/listenDirect）。
 * 依赖方向：namespaces-data → electron/ipc（channels/event-system）+ src/core/types（type）；无反向。
 * E6#57.2b：app 域（buildApp）加此——只读产品身份 main 直答通道（env 同款薄转发）。
 */

import { ipcRenderer } from 'electron';
import { IPC, filesystemChanged } from '../ipc/channels';
import type { EventSystemApi } from '../ipc/event-system';
import type { OpenPortConfig, SerialDataPayload, SerialStatsPayload, SerialSystemPayload } from '../../src/core/types/ipc/serial';
import type { FileChangeEvent } from '../../src/core/services/files/FileService';
import type { SearchWireOptions, SearchWireResult } from '../../src/core/types/ipc/search';

/** serial 命名空间——串口消费端（读/写/监听）。E5.8#6.5：推送走 broadcast → plugin:push 分发 → events.on（原 listenDirect direct 已删） */
export function buildSerial(events: EventSystemApi) {
  // E5.8#1d EXEMPT：壳 preload-shell 镜像——双 preload 各持 window.linkdesk.* 契约（serial 命名空间），无法共享
  /* jscpd:ignore-start */
  // E5.8#26 D2/D5：全操作 portName? 透传（缺省唯一口语义，主进程 getPort 解析）；getStatus 双形态
  return {
    listPorts: () => ipcRenderer.invoke(IPC.serial.listPorts),
    getStatus: (portName?: string) => ipcRenderer.invoke(IPC.serial.getStatus, portName),
    openPort: (cfg: OpenPortConfig) => ipcRenderer.invoke(IPC.serial.openPort, cfg),
    closePort: (portName?: string) => ipcRenderer.invoke(IPC.serial.closePort, portName),
    sendData: (data: number[], portName?: string) => ipcRenderer.invoke(IPC.serial.sendData, data, portName),
    sendText: (text: string, enc: string, portName?: string) => ipcRenderer.invoke(IPC.serial.sendText, text, enc, portName),
    setDtr: (enable: boolean, portName?: string) => ipcRenderer.invoke(IPC.serial.setDtr, enable, portName),
    setRts: (enable: boolean, portName?: string) => ipcRenderer.invoke(IPC.serial.setRts, enable, portName),
    // E5.8#28：回调载荷对象化（SerialDataPayload/SerialStatsPayload/SerialSystemPayload——portName 路由键）
    onData: (cb: (payload: SerialDataPayload) => void) => events.on(IPC.serial.data, cb),
    onStats: (cb: (payload: SerialStatsPayload) => void) => events.on(IPC.serial.stats, cb),
    onSystem: (cb: (payload: SerialSystemPayload) => void) => events.on(IPC.serial.system, cb),
  };
  /* jscpd:ignore-end */
}

/** filesystem 命名空间——路径守卫：池来源写操作经主进程校验（归一化 + 危险目录拒绝 + workspace 外用户确认，读放行） */
export function buildFilesystem(events: EventSystemApi) {
  // E5.8#1d EXEMPT：壳 preload-shell 镜像——双 preload 各持 window.linkdesk.* 契约（filesystem 命名空间），无法共享。
  // jscpd 整段 ignore——镜像面为刻意设计，rename（E5.8#25.2）加入后过克隆阈值，包段消除
  /* jscpd:ignore-start */
  return {
    readTextFile: (p: string) => ipcRenderer.invoke(IPC.filesystem.readTextFile, p),
    writeTextFile: (p: string, d: string) => ipcRenderer.invoke(IPC.filesystem.writeTextFile, p, d),
    readBinaryFile: (p: string) => ipcRenderer.invoke(IPC.filesystem.readBinaryFile, p),
    writeBinaryFile: (p: string, d: Uint8Array) => ipcRenderer.invoke(IPC.filesystem.writeBinaryFile, p, d),
    listDir: (p: string) => ipcRenderer.invoke(IPC.filesystem.listDir, p),
    exists: (p: string) => ipcRenderer.invoke(IPC.filesystem.exists, p),
    createDir: (p: string) => ipcRenderer.invoke(IPC.filesystem.createDir, p),
    copy: (src: string, dest: string) => ipcRenderer.invoke(IPC.filesystem.copy, src, dest),
    // E5.8#25.2：rename 通用 API——原子重命名（对齐 POSIX rename / VS Code fs.rename，零专一化命名）
    rename: (src: string, dest: string) => ipcRenderer.invoke(IPC.filesystem.rename, src, dest),
    remove: (p: string) => ipcRenderer.invoke(IPC.filesystem.remove, p),
    watch: (dirPath: string, onEvent: (e: FileChangeEvent) => void) => {
      return ipcRenderer.invoke(IPC.filesystem.watch, dirPath).then((watcherId: number) => {
        const channel = filesystemChanged(watcherId);
        // E5.8#6.5：文件变更走 broadcast → plugin:push 分发 → events.on（原 ipcRenderer.on direct 已删）
        const unsubscribe = events.on<FileChangeEvent>(channel, (change) => onEvent(change));
        return () => {
          unsubscribe();
          ipcRenderer.invoke(IPC.filesystem.unwatch, watcherId).catch(() => {});
        };
      });
    },
  };
  /* jscpd:ignore-end */
}

/** clipboard 命名空间 */
export function buildClipboard() {
  return {
    readText: () => ipcRenderer.invoke(IPC.clipboard.readText),
    writeText: (text: string) => ipcRenderer.invoke(IPC.clipboard.writeText, text),
    writeFileList: (paths: string[]) => ipcRenderer.invoke(IPC.clipboard.writeFileList, paths),
  };
}

/** path 工具函数命名空间（E5.8#0d.5 池侧补 appDataDir——preload-shell 同款） */
export function buildPath() {
  return {
    // E5.8#0d.5：池侧补 appDataDir（preload-shell 同款）——settings 插件在池内解析 userData 真实路径。
    // 缺它则 FileService.appDataDir() 池侧返回 "" → getFilePath 得 /settings.json → Windows 解析 E:\settings.json 打不开。
    appDataDir: () => ipcRenderer.invoke(IPC.path.appDataDir),
    normalize: (p: string) => p.replace(/\\/g, '/'),
    join: (...parts: string[]) => parts.map(p => p.replace(/\\/g, '/')).join('/').replace(/\/+/g, '/'),
    basename: (p: string) => { const s = p.replace(/\\/g, '/').split('/'); return s[s.length - 1] || ''; },
    dirname: (p: string) => { const s = p.replace(/\\/g, '/').split('/'); s.pop(); return s.join('/') || '.'; },
    extname: (p: string) => { const b = p.replace(/\\/g, '/').split('/').pop() || ''; const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
  };
}

/** env 命名空间——环境信息 */
export function buildEnv() {
  return {
    // E5.8#20 D1 修复：补 pluginId 转发（对齐壳侧 preload-shell + 主进程 env-handlers 正确消费）——
    // 缺它池插件 env.get("my-plugin") 恒拿不到 pluginDataDir/cacheDir/exportsDir（契约承诺与池行为不一致）
    get: (pluginId?: string) => ipcRenderer.invoke(IPC.env.get, pluginId),
  };
}

/** app 命名空间——产品身份只读（E6#57.2b）。只暴露契约面 getVersion（池插件读宿主版本号——市场 minAppVersion 比对 E6#30.8c）；
 *  getProductInfo 壳内私有扩展，不在契约 → 池侧不暴露（E6#27：池侧与契约零漂移）。main 直答通道（env 同形）。 */
export function buildApp() {
  return {
    getVersion: () => ipcRenderer.invoke(IPC.app.getVersion),
  };
}

/** encoding 命名空间——编码检测/转换（E5.6#11.5a） */
export function buildEncoding() {
  return {
    detect: (buffer: Uint8Array): Promise<string> =>
      ipcRenderer.invoke(IPC.encoding.detect, buffer),
    decode: (buffer: Uint8Array, encoding: string): Promise<string> =>
      ipcRenderer.invoke(IPC.encoding.decode, buffer, encoding),
    encode: (text: string, encoding: string): Promise<Uint8Array> =>
      ipcRenderer.invoke(IPC.encoding.encode, text, encoding),
  };
}

/** search 命名空间——全文搜索/替换（IPC 到壳/主进程执行，E5.8#1c wire 契约归口 src/core/types/ipc/search.ts） */
export function buildSearch() {
  return {
    // signal 本地消费——IPC 不传，调用方拿到结果后检查 AbortSignal.aborted 自行丢弃
    searchFiles: (opts: SearchWireOptions): Promise<SearchWireResult> =>
      ipcRenderer.invoke(IPC.search.searchFiles, opts),
  };
}

/** fileAssociation 命名空间——扩展名→插件ID（主进程 FileAssociationService，Registry 主进程化后直答） */
export function buildFileAssociation() {
  return {
    getPluginFor: (ext: string): Promise<string | undefined> =>
      ipcRenderer.invoke(IPC.fileAssociation.getPluginFor, ext),
  };
}
