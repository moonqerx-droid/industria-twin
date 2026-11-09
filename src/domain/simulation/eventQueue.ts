/**
 * Календарь событий: двоичная min-куча.
 * Порядок: время → приоритет типа события → порядковый номер постановки (seq).
 * Вторичные ключи делают порядок полностью детерминированным при совпадающем времени.
 */
export interface CalendarEntry<T> {
  time: number;
  priority: number;
  seq: number;
  payload: T;
}

export class EventCalendar<T> {
  private heap: CalendarEntry<T>[] = [];
  private seqCounter = 0;

  get size(): number {
    return this.heap.length;
  }

  schedule(time: number, priority: number, payload: T): void {
    if (!Number.isFinite(time)) return;
    const entry: CalendarEntry<T> = { time, priority, seq: this.seqCounter++, payload };
    this.heap.push(entry);
    this.siftUp(this.heap.length - 1);
  }

  peek(): CalendarEntry<T> | undefined {
    return this.heap[0];
  }

  pop(): CalendarEntry<T> | undefined {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (top === undefined || last === undefined) return undefined;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private less(a: CalendarEntry<T>, b: CalendarEntry<T>): boolean {
    if (a.time !== b.time) return a.time < b.time;
    if (a.priority !== b.priority) return a.priority < b.priority;
    return a.seq < b.seq;
  }

  private siftUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const a = this.heap[i]!;
      const p = this.heap[parent]!;
      if (!this.less(a, p)) break;
      this.heap[i] = p;
      this.heap[parent] = a;
      i = parent;
    }
  }

  private siftDown(index: number): void {
    let i = index;
    const n = this.heap.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < n && this.less(this.heap[l]!, this.heap[smallest]!)) smallest = l;
      if (r < n && this.less(this.heap[r]!, this.heap[smallest]!)) smallest = r;
      if (smallest === i) break;
      const tmp = this.heap[i]!;
      this.heap[i] = this.heap[smallest]!;
      this.heap[smallest] = tmp;
      i = smallest;
    }
  }
}
