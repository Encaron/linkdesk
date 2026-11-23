/**
 * 账本读-改-写串行化 —— 两份账本（installed / source-ledger）的共用实现（2026-11-24 去重）。
 *
 * 为什么需要：7 路安装并发时各自读到同一份旧账、各自写回，后者覆盖前者。修法 = 一条 Promise 链：
 * 每次写挂在上一次之后，读-改-写三步入临界区。**每个账本独立一个队列**（工厂），⛔ 不共享链。
 * 不加锁对象、不引依赖；链尾吞异常（前一次失败不能让后续写连坐）。
 */

import { read as storageRead } from "../../configuration/StorageService";

/** 创建一个独立的串行队列（每个账本一个实例） */
export function createSerializedQueue() {
  let chain: Promise<unknown> = Promise.resolve();
  return function serialized<T>(op: () => Promise<T>): Promise<T> {
    const run = chain.then(op, op);
    chain = run.catch(() => { /* 单次失败不阻塞后续写 */ });
    return run;
  };
}

/** 读账本对象——缺/坏/读失败一律空表（首次启动常态） */
export async function readLedgerObject<T extends object>(key: string): Promise<T> {
  try {
    const data = await storageRead<T>(key);
    return data && typeof data === "object" ? data : ({} as T);
  } catch {
    return {} as T;
  }
}
