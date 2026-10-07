/**
 * Serial port wire contract—E5.7#97.
 *
 * OpenPortConfig was originally defined in electron/services/serial-service.ts (main-process internal),
 * but is passed through preload to the plugin API on both ends (linkdesk.serial.openPort)—a cross-stack protocol, consolidated into this directory.
 * Request-side payloads = SerialStatus/SerialPortInfo; push-side payloads = SerialDataPayload/SerialStatsPayload/
 * SerialSystemPayload (E5.8#28—the three channels' payloads became objects; portName = the routing key).
 *
 * 🔀 Generic routing-key pattern (#28 contract comment = capability visibility): the portName field of the three channels' payloads is the "data-source routing key"—
 * consumers receive data by key (multiple ports coexist, each receiving its own). Future MQTT/TCP info sources copy this pattern (topic / host:port are isomorphic);
 * no generic envelope layer (D6—the existing-API-first principle).
 */

/** Open serial port config—plugin API input + consumed by the main-process serial-service */
export interface OpenPortConfig {
  portName: string;
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: string;
  encoding?: string;
  /** E5.8#26 D8—resource ownership declaration: declared by the plugin itself at openPort (pool WCV means multiple plugins share one JS context,
   *  so the main process cannot identify the plugin from the sender); on unload, closePortsByOwner reclaims the hardware resources by it. */
  ownerPluginId?: string;
}

/** Serial port status snapshot—F5 refresh / getStatus() return */
export interface SerialStatus {
  isOpen: boolean;
  portName: string;
  baudRate: number;
}

/** Serial data payload—the serial.data push (E5.8#28: evolved from the original port-name-less string—D6 payload objectification). */
export interface SerialDataPayload {
  /** Data-source port = routing key—consumers receive their own port's data by portName (multiple ports coexist, each receiving its own) */
  portName: string;
  /** Decoded line text */
  text: string;
}

/** Serial stats payload—the serial.stats push (E5.8#28: evolved from the original port-name-less SerialStats—the data source for the S10 per-port counters).
 *  tx/rx are push deltas (not cumulative values)—consumers accumulate on their own. */
export interface SerialStatsPayload {
  /** Stats-owner port = routing key—each port's counters accumulate independently */
  portName: string;
  tx?: number;
  rx?: number;
}

/** Serial system message payload—the serial.system push (E5.8#28: evolved from the original port-name-less string—the root fix for the S12 regex-extract-port-name hack).
 *  message keeps the V2 message format (a localized status banner embedding the port name, e.g. `---- <serial port opened> COM3 ----`—the runtime string itself is Chinese, verbatim samples live in the serial handler tests); portName is structured so no parsing is needed.
 *  E5.8#30.11 (P1)—type classification tag (review ①: classified at the source end, one concept written in one place, no consumer-side message-keyword matching):
 *  status = normal success flow (open/close/baud-rate switch); error = abnormal flow (D8 refusal of a second open on the same port / driver errors / unplug).
 *  Consumer-side routing by key: status filtered per port (other ports' operations are not shown); error globally visible (shown even on inactive tabs). */
export interface SerialSystemPayload {
  /** Message-owner port = routing key—consumed exclusively by this port's session (open/close state switches); non-matching sessions may still display the text but do not trigger a state switch */
  portName: string;
  message: string;
  /** Message category—status success flow / error failure anomaly (D8 refusal, driver error, unplug) */
  type: "status" | "error";
}

/** Port list entry—the listPorts() return */
export interface SerialPortInfo {
  name: string;
  description: string;
}
