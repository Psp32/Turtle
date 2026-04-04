import { describe, it, expect } from 'vitest';
import { reconnectDelayMs } from '../spacetimeReconnect';

describe('spacetimeReconnect', () => {
  it('reconnectDelayMs doubles until capped', () => {
    expect(reconnectDelayMs(0, 1000, 10_000)).toBe(1000);
    expect(reconnectDelayMs(1, 1000, 10_000)).toBe(2000);
    expect(reconnectDelayMs(3, 1000, 10_000)).toBe(8000);
    expect(reconnectDelayMs(10, 1000, 10_000)).toBe(10_000);
  });
});
