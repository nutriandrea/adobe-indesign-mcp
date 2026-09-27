import { describe, it, expect } from 'vitest';
import { createFifoQueue } from '../../bridge-proxy.mjs';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('bridge-proxy: createFifoQueue', () => {
  it('completes tasks in FIFO order', async () => {
    const queue = createFifoQueue();
    const order: number[] = [];
    const tasks = [1, 2, 3].map((n) => async () => {
      await tick();
      order.push(n);
      return n * 10;
    });

    const results = await Promise.all(tasks.map((t) => queue.enqueue(t)));
    expect(order).toEqual([1, 2, 3]);
    expect(results).toEqual([10, 20, 30]);
    expect(queue.size).toBe(0);
  });

  it('serializes execution: only one task runs at a time', async () => {
    const queue = createFifoQueue();
    let running = 0;
    let maxConcurrent = 0;

    const task = async () => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      await tick();
      await tick();
      running -= 1;
    };

    await Promise.all(Array.from({ length: 5 }, () => queue.enqueue(task)));
    expect(maxConcurrent).toBe(1);
  });

  it('propagates task failures to the enqueue caller without breaking the queue', async () => {
    const queue = createFifoQueue();
    const failing = queue.enqueue(async () => {
      throw new Error('boom');
    });
    const succeeding = queue.enqueue(async () => 'still works');

    await expect(failing).rejects.toThrow('boom');
    await expect(succeeding).resolves.toBe('still works');
    expect(queue.size).toBe(0);
  });

  it('clear() drops queued tasks, rejecting them', async () => {
    const queue = createFifoQueue();
    const blocker = queue.enqueue(() => new Promise<never>(() => {})); // never settles
    const queued = queue.enqueue(async () => 'never runs');

    await tick();
    expect(queue.size).toBe(2);
    queue.clear();

    await expect(queued).rejects.toThrow(/cleared|cancel/i);
    expect(queue.size).toBe(1); // the blocker is still active — clear() must not kill running tasks
    blocker.catch(() => {}); // silence unhandled rejection for the never-settling task
  });
});
