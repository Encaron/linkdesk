/**
 * 能力闸单测（Block 3a · 安全复核）——重点负控：未知属主不得绕过。
 */

import { describe, expect, it } from 'vitest';
import { assertTransportCapability } from './capability.js';

function deps(map: Record<string, string[] | null>) {
  return {
    isLoaded: (id: string) => Object.prototype.hasOwnProperty.call(map, id),
    transportsOf: (id: string) => (Object.prototype.hasOwnProperty.call(map, id) ? map[id] : null),
  };
}

describe('transport 能力闸（Block 3a 安全复核）', () => {
  it('已装且声明 tcp ⇒ 放行', () => {
    expect(() => assertTransportCapability('device-probe', 'tcp', deps({ 'device-probe': ['tcp'] }))).not.toThrow();
  });

  it('已装未声明 ⇒ 只给存量 serial（tcp 被拒 ECAPABILITY）', () => {
    expect(() => assertTransportCapability('legacy', 'serial', deps({ legacy: null }))).not.toThrow();
    expect(() => assertTransportCapability('legacy', 'tcp', deps({ legacy: null })))
      .toThrowError(expect.objectContaining({ code: 'ECAPABILITY' }));
  });

  it('🔴 未知属主（ghost）⇒ ECAPABILITY，⛔ 不再放行', () => {
    expect(() => assertTransportCapability('ghost', 'tcp', deps({ 'device-probe': ['tcp'] })))
      .toThrowError(expect.objectContaining({ code: 'ECAPABILITY', details: { owner: 'ghost', transport: 'tcp' } }));
  });

  it('声明里没有该 transport ⇒ ECAPABILITY（details 带 allowed）', () => {
    expect(() => assertTransportCapability('device-probe', 'ble', deps({ 'device-probe': ['tcp'] })))
      .toThrowError(expect.objectContaining({ code: 'ECAPABILITY', details: { transport: 'ble', allowed: ['tcp'] } }));
  });

  it('宿主内部 __shell__ 放行（legacy 无主打开）', () => {
    expect(() => assertTransportCapability('__shell__', 'serial', deps({}))).not.toThrow();
  });
});
