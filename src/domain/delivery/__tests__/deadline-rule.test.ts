import { describe, expect, it } from 'vitest';
import {
  finishSeconds,
  isOnTime,
  secondsToHHMM,
  timeToSeconds,
} from '../deadline-rule';

// Authoritative shop hours: start 11:30, deadline 12:30.
const START = timeToSeconds('11:30:00');
const DEADLINE = timeToSeconds('12:30:00');

describe('deadline rule', () => {
  it('finishes at 12:29 and exactly 12:30 as valid', () => {
    expect(isOnTime(timeToSeconds('12:29'), DEADLINE)).toBe(true);
    expect(isOnTime(timeToSeconds('12:30'), DEADLINE)).toBe(true);
    expect(isOnTime(timeToSeconds('12:30:00'), DEADLINE)).toBe(true);
  });

  it('rejects finishes after the deadline, even by one second', () => {
    expect(isOnTime(timeToSeconds('12:30:01'), DEADLINE)).toBe(false);
    expect(isOnTime(timeToSeconds('12:31'), DEADLINE)).toBe(false);
  });

  it('adds OSRM road durations to the 11:30 start', () => {
    // 18-minute road route finishes 11:48 — on time.
    const finish = finishSeconds(START, 18);
    expect(secondsToHHMM(finish)).toBe('11:48');
    expect(isOnTime(finish, DEADLINE)).toBe(true);
  });

  it('adds fallback-estimated durations the same way (flagged approximate upstream)', () => {
    // 61-minute fallback estimate finishes 12:31 — infeasible.
    const finish = finishSeconds(START, 61);
    expect(secondsToHHMM(finish)).toBe('12:31');
    expect(isOnTime(finish, DEADLINE)).toBe(false);
  });

  it('handles fractional durations without hiding lateness', () => {
    // 60.02 min finishes 12:30:01 — invalid despite rounding to 12:30.
    const finish = finishSeconds(START, 60 + 1 / 60);
    expect(secondsToHHMM(finish)).toBe('12:30');
    expect(isOnTime(finish, DEADLINE)).toBe(false);
    expect(isOnTime(finishSeconds(START, 60), DEADLINE)).toBe(true);
  });
});
