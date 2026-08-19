/**
 * Pool preload 数据域命名空间集合——serial/filesystem/clipboard/path/env/encoding/search/fileAssociation。
 * E5.8#0d.10-4d：自 preload-pool.ts 拆出——无模块级状态的纯 IPC 薄转发面（invoke/send/listenDirect）。
 * 依赖方向：namespaces-data → electron/ipc（channels/event-system）+ src/core/types（type）；无反向。
 */

import { ipcRenderer } from 'electron';
import { IPC, filesystemChanged } from '../ipc/channels';
import type { EventSystemApi } from '../ipc/event-system';
import type { OpenPortConfig, SerialStats } from '../../src/core/types/ipc/serial';
import type { FileChangeEvent } from '../../src/core/services/files/FileService';
import type { SearchWireOptions, SearchWireResult } from '../../src/core/types/ipc/search';

/** serial 命名空间——串口消费端（读/写/监听）。E5.8#6.5：推送走 broadcast → plugin:push 分发 → events.on（原 listenDirect direct 已删） */
export function buildSerial(events: EventSystemApi) {
  // E5.8#1d EXEMPT：壳 preload-shell 镜像——双 preload 各持 window.linkdesk.* 契约（serial 命名空间），无法共享
  /* jscpd:ignore-start */
  return {
    listPorts: () => ipcRenderer.invoke(IPC.serial.listPorts),
    getStatus: () => ipcRenderer.invoke(IPC.serial.getStatus),
    openPort: (cfg: OpenPortConfig) => ipcRenderer.invoke(IPC.serial.openPort, cfg),
    closePort: () => ipcRenderer.invoke(IPC.serial.closePort),
    sendData: (data: number[]) => ipcRenderer.invoke(IPC.serial.sendData, data),
    sendText: (text: string, enc: string) => ipcRenderer.invoke(IPC.serial.sendText, text, enc),
    setDtr: (enable: boolean) => ipcRenderer.invoke(IPC.serial.setDtr, enable),
    setRts: (enable: boolean) => ipcRenderer.invoke(IPC.serial.setRts, enable),
    onData: (cb: (text: string) => void) => events.on(IPC.serial.data, cb),
    onStats: (cb: (stats: SerialStats) => void) => events.on(IPC.serial.stats, cb),
    onSystem: (cb: (message: string) => void) => events.on(IPC.serial.system, cb),
  };
  /* jscpd:ignore-end */
}

/** filesystem 命名空间——路径守卫：池来源写操作经主进程校验（归一化 + 危险目录拒绝 + workspace 外用户确认，读放行） */
export function buildFilesystem(events: EventSystemApi) {
  return {
    readTextFile: (p: string) => ipcRenderer.invoke(IPC.filesystem.readTextFile, p),
    writeTextFile: (p: string, d: string) => ipcRenderer.invoke(IPC.filesystem.writeTextFile, p, d),
    readBinaryFile: (p: string) => ipcRenderer.invoke(IPC.filesystem.readBinaryFile, p),
    writeBinaryFile: (p: string, d: Uint8Array) => ipcRenderer.invoke(IPC.filesystem.writeBinaryFile, p, d),
    listDir: (p: string) => ipcRenderer.invoke(IPC.filesystem.listDir, p),
    exists: (p: string) => ipcRenderer.invoke(IPC.filesystem.exists, p),
    createDir: (p: string) => ipcRenderer.invoke(IPC.filesystem.createDir, p),
    copy: (src: string, dest: string) => ipcRenderer.invoke(IPC.filesystem.copy, src, dest),
    remove: (p: string) => ipcRenderer.invoke(IPC.filesystem.remove, p),
    // E5.8#1d EXEMPT：壳 preload-shell 镜像（filesystem.watch 同一监听→退订模式）
    /* jscpd:ignore-start */
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
    /* jscpd:ignore-end */
  };
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
