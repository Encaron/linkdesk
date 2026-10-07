/**
 * linkdesk-api data domain — split out of linkdesk-api.ts (E5.8#0d.10-9c).
 * The serial/clipboard/p2p/events/pluginState five namespace surfaces verbatim.
 * Dependency direction: data → types/ipc/serial; cross-composed by the aggregator.
 */

import type { OpenPortConfig, SerialStatus, SerialDataPayload, SerialStatsPayload, SerialSystemPayload, SerialPortInfo } from "../../types/ipc/serial";

/** Serial / clipboard / inter-plugin communication / events / persistent storage namespace surfaces — modeled after VS Code SerialPort API + p2p + EventEmitter + state */
export interface DataAPI {
  /** Serial — read/write/listen, modeled after VS Code SerialPort API */
  serial: {
    listPorts(): Promise<SerialPortInfo[]>;
    /** E5.8#26 D5 dual form: no arg → SerialStatus[] (all open ports, empty array = all closed) / with arg → a single port snapshot (for F5 traversal restore) */
    getStatus(): Promise<SerialStatus[]>;
    getStatus(portName: string): Promise<SerialStatus>;
    openPort(cfg: OpenPortConfig): Promise<void>;
    /** E5.8#26 D2 — portName optional: omitted = the only open port (0 ports throws "serial port not open" / ≥2 ports throws "multiple serial ports open, please specify portName") */
    closePort(portName?: string): Promise<void>;
    sendData(data: number[], portName?: string): Promise<void>;
    sendText(text: string, enc: string, portName?: string): Promise<void>;
    setDtr(enable: boolean, portName?: string): Promise<void>;
    setRts(enable: boolean, portName?: string): Promise<void>;
    /** E5.8#28: payloads made objects — SerialDataPayload.portName = routing key (multiple ports coexist, each receives its own) */
    onData(cb: (payload: SerialDataPayload) => void): () => void;
    onStats(cb: (payload: SerialStatsPayload) => void): () => void;
    onSystem(cb: (payload: SerialSystemPayload) => void): () => void;
  };

  /** Clipboard — read/write the system clipboard */
  clipboard: {
    readText(): Promise<string>;
    writeText(text: string): Promise<void>;
    /** Write a file list — used by file-tree copy/paste */
    writeFileList(paths: string[]): Promise<void>;
  };

  /** E5#65: p2p targeted inter-plugin push — same pattern as bridge.broadcast (fire-and-forget) */
  p2p: {
    send(target: string, channel: string, data: unknown): void;
    on(channel: string, cb: (data: unknown) => void): () => void;
  };

  /** Generic event subscribe + publish — the inter-plugin data pipeline. channel is a free-form string; payloads are typed per channel — subscribers narrow */
  events: {
    /** E5.7#98: on made generic — the payload type is inferred from the subscriber's cb (same as the event-system EventSystemApi; #97 already made the impl generic); channel contract types (ConfigurationChangedPayload etc.) can be passed directly */
    on<T = unknown>(channel: string, cb: (payload: T) => void): () => void;
    emit(channel: string, payload: unknown): void;
    heartbeat?(): void;
    notifyTheme?(isDark: boolean): void;
  };

  /** E5#71: plugin persistent storage — centralized cache + file persistence */
  pluginState: {
    /** Read persisted state — a runtime dynamic value; defaults to unknown; callers narrow via explicit get<string>(...) or their own narrowing */
    get<T = unknown>(pluginId: string, key: string): Promise<T | undefined>;
    set(pluginId: string, key: string, value: unknown): Promise<void>;
    /** Subscribe to persisted state changes — exact match on pluginId+key (wildcard key subscription goes through events.on("plugin-state:changed"), see the E5.8#20 added export PluginStateChangedPayload). Returns unsubscribe */
    onChange(pluginId: string, key: string, cb: (value: unknown) => void): () => void;
  };
}
