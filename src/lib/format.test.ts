import { describe, expect, it } from 'vitest';
import { fromIstInput, toIstInput } from './format';

describe('IST datetime-local helpers', () => {
  it('shows an instant as IST wall-clock time', () => {
    expect(toIstInput('2026-11-08T04:30:00.000Z')).toBe('2026-11-08T10:00');
    expect(toIstInput('2026-11-07T20:00:00.000Z')).toBe('2026-11-08T01:30');
  });
  it('reads the input as IST, whatever the device zone', () => {
    expect(fromIstInput('2026-11-08T10:00')).toBe('2026-11-08T04:30:00.000Z');
  });
  it('round-trips without moving the time', () => {
    const iso = '2026-12-31T18:45:00.000Z';
    expect(fromIstInput(toIstInput(iso))).toBe(iso);
  });
  it('rejects empty or malformed values', () => {
    expect(fromIstInput('')).toBeNull();
    expect(fromIstInput('2026-11-08')).toBeNull();
  });
});
