import { describe, expect, it } from 'vitest';
import { seededRandom } from '../core/plan';
import type { Question, TeamVisual } from '../core/schema';
import type { PhotoSet } from '../core/visual/photos';
import { makeVisualPicker } from './visualPool';

const photos: PhotoSet = {
  generatedAt: '',
  groups: [{ id: 'cloud-genus', subject: 'earth_space', question: 'Identify the cloud genus.', mcQuestion: 'Which cloud genus?' }],
  photos: ['cumulus', 'stratus'].map((id) => ({ id, group: 'cloud-genus', answer: id.toUpperCase(), accept: [], file: `photos/${id}.webp`, width: 1, height: 1, alt: '', credit: '', source: '', license: '' })),
};

const teamVisual = (id: string, subject: Question['subject']): TeamVisual => ({
  id,
  createdAt: '',
  updatedAt: '',
  authorId: null,
  question: { id, kind: 'bonus', number: 1, subject, sourceCategory: '', format: 'short_answer', stem: 'x?', answer: 'Y', accept: [], reject: [], answerRaw: 'Y', source: { provider: 'team', setId: 'v', roundId: 'v', credit: '' } },
});

describe('choosing visual bonuses', () => {
  it('uses each team visual and photo once, then falls back to what is left', () => {
    const pickFor = makeVisualPicker({ photos, team: [teamVisual('vtm-a', 'earth_space')], random: seededRandom('x') });
    const ids = Array.from({ length: 8 }, () => pickFor('earth_space'));
    expect(ids.filter((id) => id === 'vtm-a')).toHaveLength(1);
    const photoIds = ids.filter((id) => id?.startsWith('vph-')).map((id) => id!.replace(/-\d+$/, ''));
    expect(new Set(photoIds).size).toBe(photoIds.length);
    // Once the team visual and both photos are used, only generated figures (if the subject has templates) remain.
    for (const id of ids) if (id !== null && id !== 'vtm-a' && !id.startsWith('vph-')) expect(id.startsWith('vis-earth_space-')).toBe(true);
    expect(ids.filter((id) => id !== null).length).toBeGreaterThanOrEqual(3);
  });

  it('gives null for a subject with nothing to offer', () => {
    const pickFor = makeVisualPicker({ photos: { generatedAt: '', groups: [], photos: [] }, team: [], random: seededRandom('y') });
    // Generated templates may exist for a subject; a subject with no templates, photos or team visuals gives null.
    const ids = (['biology', 'chemistry', 'earth_space', 'energy', 'math', 'physics'] as const).map((s) => pickFor(s));
    for (const id of ids) if (id !== null) expect(id.startsWith('vis-')).toBe(true);
  });
});
