/**
 * 幂等重放表单测（T-B · 13-状态命令约定 §二.3）——纯函数直打，不起窗口。
 */

import { describe, it, expect } from "vitest";
import { createIdempotencyRegistry, extractIdempotencyKey } from "./idempotency.js";

describe("extractIdempotencyKey：只在声明了同名参数时启用", () => {
  const declared = [{ name: "value" }, { name: "idempotencyKey" }];

  it("具名对象实参", () => {
    expect(extractIdempotencyKey(declared, [{ value: 1, idempotencyKey: "k1" }])).toBe("k1");
  });

  it("逐位平铺实参（位置按声明顺序）", () => {
    expect(extractIdempotencyKey(declared, [1, "k2"])).toBe("k2");
  });

  it("未声明 ⇒ null（默认关闭，参数被忽略）", () => {
    expect(extractIdempotencyKey([{ name: "value" }], [{ value: 1, idempotencyKey: "k" }])).toBeNull();
    expect(extractIdempotencyKey(undefined, ["k"])).toBeNull();
  });

  it("键不是非空字符串 ⇒ null（⛔ 把 0/空串当键）", () => {
    expect(extractIdempotencyKey(declared, [1, ""])).toBeNull();
    expect(extractIdempotencyKey(declared, [1, 42])).toBeNull();
    expect(extractIdempotencyKey(declared, [{ value: 1, idempotencyKey: null }])).toBeNull();
  });
});

describe("幂等重放表：命中回放、TTL、容量", () => {
  it("同键命中返回首次结果；不同键互不影响", () => {
    const reg = createIdempotencyRegistry();
    reg.store("demo.write", "a", { value: 1 });
    expect(reg.lookup("demo.write", "a")).toEqual({ result: { value: 1 } });
    expect(reg.lookup("demo.write", "b")).toBeNull();
    expect(reg.lookup("other.write", "a")).toBeNull(); // 命令 id 参与键
  });

  it("TTL 到期后不再命中（惰性清扫）", () => {
    let t = 0;
    const reg = createIdempotencyRegistry({ ttlMs: 1000, now: () => t });
    reg.store("demo.write", "a", { ok: true });
    t = 999;
    expect(reg.lookup("demo.write", "a")).not.toBeNull();
    t = 1000;
    expect(reg.lookup("demo.write", "a")).toBeNull();
    expect(reg.size()).toBe(0);
  });

  it("容量上限淘汰最老条目", () => {
    const reg = createIdempotencyRegistry({ maxEntries: 2 });
    reg.store("demo.write", "a", 1);
    reg.store("demo.write", "b", 2);
    reg.store("demo.write", "c", 3);
    expect(reg.size()).toBe(2);
    expect(reg.lookup("demo.write", "a")).toBeNull();
    expect(reg.lookup("demo.write", "c")).toEqual({ result: 3 });
  });
});
