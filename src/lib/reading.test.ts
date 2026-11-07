import { describe, expect, it } from 'vitest';
import { buildReading, CHOICE_PAUSE_CHARS, lettersPerMinute, msPerChar, readingDurationMs, revealedCount, splitRevealed } from './reading';

describe('letter-by-letter reading', () => {
  it('converts words per minute to characters using six characters per word', () => {
    expect(msPerChar(200)).toBe(50);
    expect(lettersPerMinute(200)).toBe(1200);
  });

  it('reveals one character per step and takes words-per-minute time overall', () => {
    const r = buildReading({ stem: 'What is the powerhouse of the cell?' });
    expect(revealedCount(r, 0, 200)).toBe(0);
    expect(revealedCount(r, 50, 200)).toBe(1);
    expect(revealedCount(r, 49, 200)).toBe(0);
    expect(revealedCount(r, 10 * 50, 200)).toBe(10);
    expect(readingDurationMs(r, 200)).toBe(r.text.length * 50);
    expect(revealedCount(r, readingDurationMs(r, 200), 200)).toBe(r.text.length);
  });

  it('shows a pronunciation guide all at once', () => {
    const r = buildReading({ stem: 'The vestibular [ves-TIB-u-lar] system' });
    const guideStart = r.text.indexOf('[');
    const guideEnd = r.text.indexOf(']') + 1;
    // Once the space before the guide is read, the whole guide is visible.
    const n = revealedCount(r, guideStart * 50, 200);
    expect(n).toBeGreaterThanOrEqual(guideEnd);
    expect(r.totalUnits).toBe(r.text.length - (guideEnd - guideStart));
  });

  it('pauses before each answer choice', () => {
    const r = buildReading({ stem: 'Pick one:', choices: { W: 'a', X: 'b', Y: 'c', Z: 'd' } });
    expect(r.text).toBe('Pick one:\nW) a\nX) b\nY) c\nZ) d');
    const newlines = (r.text.match(/\n/g) ?? []).length;
    expect(r.totalUnits).toBe(r.text.length - newlines + newlines * CHOICE_PAUSE_CHARS);
  });

  it('marks the word that is still appearing', () => {
    const r = buildReading({ stem: 'Name the organelle' });
    expect(splitRevealed(r, 7)).toEqual({ done: 'Name ', current: 'th' });
    expect(splitRevealed(r, 8)).toEqual({ done: 'Name the', current: '' });
    expect(splitRevealed(r, r.text.length)).toEqual({ done: 'Name the organelle', current: '' });
  });
});
