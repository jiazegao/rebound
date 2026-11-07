import { describe, expect, it } from 'vitest';
import { decimalText, fractionText, piText, radicalText, simplifyRoot } from './exact';
import { generatedId, generateVisual, parseGeneratedId, questionForGeneratedId, randomVisual, VISUAL_TEMPLATES } from './index';
import { makeRng } from './rng';
import { checkSvgMarkup } from './testkit';

describe('generated visual questions', () => {
  it('template ids are unique', () => {
    const ids = VISUAL_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ids round-trip and rebuild the same question', () => {
    const t = VISUAL_TEMPLATES[0]!;
    const id = generatedId(t.id, 12345);
    expect(parseGeneratedId(id)).toEqual({ templateId: t.id, seed: 12345 });
    const a = questionForGeneratedId(id);
    const b = generateVisual(t.id, 12345);
    expect(a).not.toBeNull();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a!.id).toBe(id);
    expect(a!.kind).toBe('bonus');
    expect(a!.visual).toBe(true);
    expect(a!.source.provider).toBe('rebound');
  });

  it('unknown templates and malformed ids give null', () => {
    expect(questionForGeneratedId('vis-math-no-such-template-5')).toBeNull();
    expect(parseGeneratedId('doe-hs-17-r01-b01')).toBeNull();
    expect(parseGeneratedId('vis-math-sector-abc')).toBeNull();
  });

  it('random questions come from the templates given', () => {
    const q = randomVisual([VISUAL_TEMPLATES[0]!], makeRng(3).next);
    expect(parseGeneratedId(q.id)?.templateId).toBe(VISUAL_TEMPLATES[0]!.id);
  });
});

describe('exact answers', () => {
  it('fractions reduce', () => {
    expect(fractionText(6, 8)).toBe('3/4');
    expect(fractionText(-6, 8)).toBe('-3/4');
    expect(fractionText(6, -8)).toBe('-3/4');
    expect(fractionText(8, 4)).toBe('2');
  });
  it('radicals simplify with no root in a denominator', () => {
    expect(simplifyRoot(72)).toEqual([6, 2]);
    expect(radicalText(1, 1, 8)).toBe('2√2');
    expect(radicalText(1, 2, 12)).toBe('√3');
    expect(radicalText(5, 3, 7)).toBe('5√7/3');
    expect(radicalText(1, 2, 3)).toBe('√3/2');
    expect(radicalText(3, 1, 16)).toBe('12');
    expect(radicalText(-2, 1, 5)).toBe('-2√5');
  });
  it('multiples of π', () => {
    expect(piText(1)).toBe('π');
    expect(piText(6, 4)).toBe('3π/2');
    expect(piText(2)).toBe('2π');
    expect(piText(-1, 3)).toBe('-π/3');
  });
  it('decimals drop trailing zeros', () => {
    expect(decimalText(2.5, 2)).toBe('2.5');
    expect(decimalText(3, 2)).toBe('3');
    expect(decimalText(0.125, 2)).toBe('0.13');
  });
});

describe('figure markup check', () => {
  it('accepts a well-formed figure and refuses broken or unsafe ones', () => {
    expect(checkSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g><line x1="0"/></g></svg>')).toBeNull();
    expect(checkSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g></svg>')).not.toBeNull();
    expect(checkSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>x</script></svg>')).not.toBeNull();
    expect(checkSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="NaN">a</text></svg>')).not.toBeNull();
  });
});
