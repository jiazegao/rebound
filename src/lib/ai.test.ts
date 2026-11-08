import { describe, expect, it } from 'vitest';
import { aiRestrictedSource, explainable, usageText } from './ai';

describe('AI help helpers', () => {
  it('explains only questions the model can see in full', () => {
    expect(explainable({ stem: 'What organelle makes ATP?', answer: 'MITOCHONDRION' })).toBe(true);
    expect(explainable({ stem: 'Which is right?', answer: '', answerLetter: 'X' })).toBe(true);
    expect(explainable({ stem: 'What is shown?', answer: 'A', visual: true })).toBe(false);
    expect(explainable({ stem: 'Read the graph.', answer: '4', figure: { kind: 'image', src: 'data/visual/photos/a.webp', alt: 'a graph' } })).toBe(false);
    expect(explainable({ stem: 'Q', answer: '  ' })).toBe(false);
  });

  it('keeps OpenStax text out of AI drafts', () => {
    expect(aiRestrictedSource('OpenStax Biology 2e, 12.3')).toBe(true);
    expect(aiRestrictedSource('Biology https://openstax.org/books/biology-2e/pages/12-3')).toBe(true);
    expect(aiRestrictedSource('NOAA JetStream: Air Masses')).toBe(false);
  });

  it('describes the day’s use', () => {
    expect(usageText({ enabled: true, dailyLimit: 50, usedToday: 12 })).toBe('12 of 50 AI calls used today');
    expect(usageText({ enabled: false })).toBe('');
    expect(usageText(null)).toBe('');
  });
});
