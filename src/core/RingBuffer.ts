/**
 * 固定容量环形缓冲区。
 * 单生产者（Rust emit 回调写）、单消费者（rAF 读）。
 * 满则覆盖最老数据。
 */
export class RingBuffer<T> {
  private buf: T[];
  private head = 0;
  private tail = 0;
  private count = 0;

  constructor(private capacity = 512) {
    this.buf = new Array<T>(capacity);
  }

  /** 写入一条数据。满则覆盖最老。 */
  write(item: T): void {
    this.buf[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      // 已满，head 推进（覆盖最老）
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /** 取出当前所有数据并清空 */
  drainAll(): T[] {
    const result: T[] = [];
    while (this.count > 0) {
      result.push(this.buf[this.head]);
      this.head = (this.head + 1) % this.capacity;
      this.count--;
    }
    return result;
  }

  /** 当前缓冲区中的数据条数 */
  get size(): number {
    return this.count;
  }
}
