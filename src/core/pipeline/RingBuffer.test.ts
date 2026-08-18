import { describe, it, expect } from "vitest";
import { RingBuffer } from "./RingBuffer";

describe("RingBuffer", () => {
  it("初始为空", () => {
    const rb = new RingBuffer<string>(8);
    expect(rb.size).toBe(0);
    expect(rb.drainAll()).toEqual([]);
  });

  it("写入并取出", () => {
    const rb = new RingBuffer<string>(8);
    rb.write("a");
    rb.write("b");
    expect(rb.size).toBe(2);
    expect(rb.drainAll()).toEqual(["a", "b"]);
    expect(rb.size).toBe(0);
  });

  it("满容量覆盖最老数据", () => {
    const rb = new RingBuffer<number>(3);
    rb.write(1);
    rb.write(2);
    rb.write(3);
    rb.write(4); // 覆盖 1
    expect(rb.size).toBe(3);
    expect(rb.drainAll()).toEqual([2, 3, 4]);
  });

  it("drainAll 清空", () => {
    const rb = new RingBuffer<number>(4);
    rb.write(1); rb.write(2);
    expect(rb.drainAll()).toEqual([1, 2]);
    rb.write(3);
    expect(rb.drainAll()).toEqual([3]);
  });
});
