/**
 * useSerialContext——E6#87b 从 services/SerialContext.tsx 搬出（只搬不改）。
 *
 * 读者：ControlPanel（per-tab connected 派生）/ SerialSettingsView / SessionListView。
 * 模块级 mutable 状态在 store.ts（单一属主），IPC 监听器记账在 ipc.ts——本文件只接 React 生命周期。
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { HandshakeState, SerialActions, SerialFrame, SerialState } from "./types";
import {
  _notifyPort, _setState, _subscribe, _writePortState,
  deleteOpenPort, getSharedState, hasOpenPort, setOpenPort,
} from "./store";
import { mergeStatus } from "./status";
import { _initOnce, _registerIPCListeners, _unregisterIPCListeners, closePortFromModule } from "./ipc";

export function useSerialContext(): { state: SerialState; actions: SerialActions } {
  const s = window.linkdesk?.serial;

  // 一次性数据拉取——端口列表 + 状态（模块级 guard，只跑一次）
  _initOnce();

  // 朴素的订阅模式：useState + useEffect subscribe
  const [state, setState] = useState<SerialState>(getSharedState);

  // E3j #81 方向 B：IPC 监听器走组件生命周期——引用计数，
  // mount → 注册（第一个 consumer），unmount → 减引用（最后一个 consumer 全清）。
  useEffect(() => {
    _registerIPCListeners();
    return () => _unregisterIPCListeners();
  }, []);

  useEffect(() => {
    return _subscribe(() => setState(getSharedState()));
  }, []);

  // 🔥 B86 预防：ref 桥接
  const sourceNameRef = useRef(state.sourceName);
  sourceNameRef.current = state.sourceName;
  const baudRateRef = useRef(state.baudRate);
  baudRateRef.current = state.baudRate;

  // 支线：明确打开/关闭——多标签页场景 ControlPanel 按 per-tab connected 决策
  const openPort = useCallback(async (portName: string, baudRate: number, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => {
    if (!s) return;
    sourceNameRef.current = portName;
    baudRateRef.current = String(baudRate);
    // E5.8#30.17：帧格式透传——openPortConfig dataBits/stopBits/parity（wire 已支持，#26 实锤）
    await s.openPort({ portName, baudRate, encoding, dataBits: frame?.dataBits, stopBits: frame?.stopBits, parity: frame?.parity });
    // E5.8#30.18：打开时应用握手信号初始电平（DTR/RTS）——非致命，失败只记日志不阻断开串口
    if (handshake) {
      s.setDtr?.(handshake.dtr, portName).catch((e) => console.error("[serial-monitor] 应用 DTR 初始电平失败:", e));
      s.setRts?.(handshake.rts, portName).catch((e) => console.error("[serial-monitor] 应用 RTS 初始电平失败:", e));
    }
    // E5.8#27：定向取刚开的口——多口下 getStatus()[0] 未必是本次开的（#26 遗留，D5 定向修复）
    const fresh = (await s.getStatus(portName));
    // E5.8#54：set 挪到 _setState 前——对齐 closePortFromModule（delete→setState→notify→write），
    // 消除「开一关一不对称」：订阅 _openPorts 的瞬时读不再拿到旧态
    setOpenPort(portName, { baudRate, txBytes: 0, rxBytes: 0 });
    if (fresh) _setState((p) => mergeStatus(p, fresh));
    _notifyPort(portName); // E5.8#30.12：打开 → 接收区 per-tab 计数从 0 起
    _writePortState(portName, true); // E5.8#30.9：打开按口显式亮灯
  }, [s]);

  const closePort = useCallback(async (port: string) => {
    // E5.8#30.16（P8）：委托模块级咽喉 closePortFromModule——UI 与 beforeClose handler 共用同一写入路径
    await closePortFromModule(port);
  }, []);

  // E5.8#30.8：开/关单动作——显式传口 + 按口已开决策（per-tab 精确，D1 多口共存）。
  // 组合原子动作 closePort/openPort（审视 ③：灭 toggleOpen 死代码 + 「开关=一个动作一处写」归一）
  const toggleOpen = useCallback(async (port: string, baudRate?: number, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => {
    if (!s || !port) return;
    if (hasOpenPort(port)) {
      await closePort(port);
    } else {
      // 口未开 → 开（D1 不影响其他已开口）；baudRate 缺省走投影 baudRateRef
      await openPort(port, baudRate ?? Number(baudRateRef.current), encoding, frame, handshake);
    }
  }, [s, closePort, openPort]);

  const setSourceName = useCallback(async (name: string, oldPort: string, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => {
    if (!s) return;
    sourceNameRef.current = name;
    _setState((p) => ({ ...p, sourceName: name }));
    // E5.8#30.10（P7）：换口触发条件 per-tab 精确——本标签页旧口真开着才关旧开新；
    // 他标签页开着不误触（旧口显式传入，不读投影 _sharedState.sourceName）；新标签页选口
    // （旧口空/未开）只记配置、点「打开」才开（被 per-tab 判断天然覆盖，无需单独拦）。
    // 关旧口按口显式灭灯 + 开新口复用 openPort action 走咽喉（#30.9）。
    if (oldPort && hasOpenPort(oldPort)) {
      await s.closePort(oldPort);
      deleteOpenPort(oldPort);
      _notifyPort(oldPort); // E5.8#30.12：换口 → 旧口接收区 per-tab 计数归零
      _writePortState(oldPort, false);
      await openPort(name, Number(baudRateRef.current), encoding, frame, handshake);
    }
  }, [s, openPort]);

  const setBaudRate = useCallback(async (baud: string, port: string, encoding?: string, frame?: SerialFrame, handshake?: HandshakeState) => {
    if (!s) return;
    baudRateRef.current = baud;
    _setState((p) => ({ ...p, baudRate: baud }));
    // 改波特率 = 定向关 + 重开同口（E5.8#30.8：显式传口；per-tab 精确判断——该口真开着才重开，
    // 不再用投影 isOpen 判断避免他标签页口开着也误重开）；port 空 = 纯存配置（会话未开）
    // E5.8#30.9：closePort/openPort 组合——两原子动作已走灯写入咽喉（归一性）
    if (port && hasOpenPort(port)) {
      await closePort(port);
      await openPort(port, Number(baud), encoding, frame, handshake);
    }
  }, [s, closePort, openPort]);

  // E5.8#30.17：改帧格式（8N1/校验）——同 setBaudRate 语义（该口真开着才关旧重开，port 空 = 纯存配置）。
  // 会话帧字段由 ControlPanel updateSession 写入；本动作只做「口开着 → 用新帧重开」的端口侧生效。
  const setFrame = useCallback(async (frame: SerialFrame, port: string, baudRate: number, encoding?: string, handshake?: HandshakeState) => {
    if (!s) return;
    if (port && hasOpenPort(port)) {
      await closePort(port);
      await openPort(port, baudRate, encoding, frame, handshake);
    }
  }, [s, closePort, openPort]);

  // E5.8#30.18：运行中切握手信号——显式传口（per-tab 精确）；口未开时只写会话（侧栏开关仍是配置态）
  const setDtr = useCallback(async (port: string, enable: boolean) => {
    if (!s || !port) return;
    await s.setDtr(enable, port);
  }, [s]);

  const setRts = useCallback(async (port: string, enable: boolean) => {
    if (!s || !port) return;
    await s.setRts(enable, port);
  }, [s]);

  // 支线：刷新可用串口列表——USB 热插拔后下拉框即时更新
  const refreshPorts = useCallback(async () => {
    if (!s) return;
    const listPorts = s.listPorts;
    const ports = await listPorts?.();
    if (ports) _setState((p) => ({ ...p, ports }));
  }, [s]);

  return { state, actions: { toggleOpen, openPort, closePort, setSourceName, setBaudRate, setFrame, setDtr, setRts, refreshPorts } };
}
