import { describe, expect, it } from 'vitest';
import { judgeAnswer } from '../judge/judge';
import { parsePhotoQuestionId, photoQuestion, photoQuestionId, sentenceCase, type PhotoSet } from './photos';

const SET: PhotoSet = {
  generatedAt: '2026-11-07',
  groups: [{ id: 'cloud-genus', subject: 'earth_space', topic: 'earth_space.meteorology-climate', question: 'Identify the cloud genus shown in the photo.', mcQuestion: 'Which of the following cloud genera is shown in the photo?' }],
  photos: ['CUMULUS', 'STRATUS', 'CIRRUS', 'CUMULONIMBUS'].map((answer) => ({
    id: answer.toLowerCase(),
    group: 'cloud-genus',
    answer,
    accept: [`${answer} CLOUDS`],
    file: `photos/${answer.toLowerCase()}.webp`,
    width: 900,
    height: 600,
    alt: 'A cloud',
    credit: 'NOAA',
    source: 'https://commons.wikimedia.org/wiki/File:x.jpg',
    license: 'Public domain',
  })),
};

describe('photo set questions', () => {
  it('ids round-trip', () => {
    expect(parsePhotoQuestionId(photoQuestionId('cumulonimbus-1', 42))).toEqual({ photoId: 'cumulonimbus-1', seed: 42 });
    expect(parsePhotoQuestionId('vis-math-sector-3')).toBeNull();
  });

  it('builds short-answer and multiple-choice questions that grade correctly', () => {
    const formats = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const q = photoQuestion(SET, 'cumulonimbus', seed)!;
      formats.add(q.format);
      expect(q.visual).toBe(true);
      expect(q.figure).toMatchObject({ kind: 'image', src: 'data/visual/photos/cumulonimbus.webp' });
      if (q.format === 'multiple_choice') {
        expect(Object.values(q.choices!)).toContain('Cumulonimbus');
        expect(judgeAnswer(q, q.answerLetter!).verdict).toBe('correct');
      } else {
        expect(judgeAnswer(q, 'cumulonimbus').verdict).toBe('correct');
        expect(judgeAnswer(q, 'cumulonimbus clouds').verdict).toBe('correct');
        expect(judgeAnswer(q, 'cumulus').verdict).toBe('incorrect');
      }
      // The same seed gives the same question.
      expect(JSON.stringify(photoQuestion(SET, 'cumulonimbus', seed))).toBe(JSON.stringify(q));
    }
    expect(formats).toEqual(new Set(['short_answer', 'multiple_choice']));
  });

  it('unknown photos give null', () => {
    expect(photoQuestion(SET, 'nimbostratus', 1)).toBeNull();
  });

  it('sentence case', () => {
    expect(sentenceCase('SHIELD VOLCANO')).toBe('Shield volcano');
  });
});
