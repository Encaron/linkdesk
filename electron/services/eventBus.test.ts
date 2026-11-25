/**
 * 事件总线单测（Block 3b）——发布鉴权/recipients/dropped 的负控。
 */

import { describe, expect, it } from 'vitest';
import { createEventBus } from './eventBus.js';
import type { PluginEventsDecl } from '../plugins/plugin-manifest-loader.js';

function setup(map: Record<string, PluginEventsDecl>) {
  return createEventBus({
    declOf: (id) => map[id] ?? null,
    all: () => Object.entries(map).map(([pluginId, events]) => ({ pluginId, events })),
  });
}

const src: PluginEventsDecl = { publishes: [{ id: 'demo.tick' }], subscribes: [] };
const sink: PluginEventsDecl = { publishes: [], subscribes: [{ id: 'demo.tick' }] };

describe('事件发布鉴权与投递统计（Block 3b）', () => {
  it('已声明发布 ⇒ 通过，recipients = 订阅者数（不含自己）', () => {
    const bus = setup({ 'event-source': src, 'event-sink': sink });
    expect(bus.publish({ pluginId: 'event-source', eventId: 'demo.tick', payload: { n: 1 } }))
      .toEqual({ recipients: 1, dropped: 0 });
  });

  it('发布未声明事件 ⇒ EEVENTUNDECLARED（⛔ 发他人/猜的事件）', () => {
    const bus = setup({ 'event-source': src });
    expect(() => bus.publish({ pluginId: 'event-source', eventId: 'demo.other' }))
      .toThrowError(expect.objectContaining({ code: 'EEVENTUNDECLARED' }));
  });

  it('未声明 publishes 的插件 ⇒ 拒绝', () => {
    const bus = setup({ 'event-sink': sink });
    expect(() => bus.publish({ pluginId: 'event-sink', eventId: 'demo.tick' }))
      .toThrowError(expect.objectContaining({ code: 'EEVENTUNDECLARED' }));
  });

  it('0 订阅方 ⇒ dropped=1（fire-and-forget 如实计数）', () => {
    const bus = setup({ 'event-source': src });
    expect(bus.publish({ pluginId: 'event-source', eventId: 'demo.tick' })).toEqual({ recipients: 0, dropped: 1 });
  });

  it('自己订阅自己不算 recipient（⛔ 回环）', () => {
    const bus = setup({ solo: { publishes: [{ id: 'demo.self' }], subscribes: [{ id: 'demo.self' }] } });
    expect(bus.publish({ pluginId: 'solo', eventId: 'demo.self' })).toEqual({ recipients: 0, dropped: 1 });
  });

  it('宿主内部发布（__shell__）跳过发布声明闸', () => {
    const bus = setup({ 'event-sink': sink });
    expect(bus.publish({ pluginId: '__shell__', eventId: 'demo.tick' })).toEqual({ recipients: 1, dropped: 0 });
  });

  it('缺 pluginId/eventId ⇒ EBADARGS', () => {
    const bus = setup({});
    expect(() => bus.publish({ pluginId: '', eventId: 'x' })).toThrowError(expect.objectContaining({ code: 'EBADARGS' }));
    expect(() => bus.publish({ pluginId: 'p', eventId: '' })).toThrowError(expect.objectContaining({ code: 'EBADARGS' }));
  });
});
