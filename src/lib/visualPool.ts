/**
 * Choosing visual bonuses for a Finals visual round, one subject at a time: the team's own visual
 * questions first (they were written for practice), then the photo set, then generated ones. Within one
 * packet a picture is used once and templates are varied while others are left; pictures somebody in the
 * room has already seen come last.
 */
import type { CoreSubject, TeamVisual } from '../core/schema';
import { generatedId, templatesFor } from '../core/visual';
import { photoQuestionId, type PhotoSet } from '../core/visual/photos';
import { newSeed } from '../core/visual/rng';

export function makeVisualPicker(opts: {
  photos: PhotoSet;
  team: readonly TeamVisual[];
  /** Question ids somebody in the room has heard (visual ids included). */
  heard?: ReadonlySet<string>;
  random?: () => number;
}): (subject: CoreSubject) => string | null {
  const random = opts.random ?? Math.random;
  const heard = opts.heard ?? new Set<string>();
  // Photos seen under any seed count as seen.
  const seenPhotos = new Set([...heard].filter((id) => id.startsWith('vph-')).map((id) => id.replace(/^vph-(.+)-\d+$/, '$1')));
  const usedTeam = new Set<string>();
  const usedPhotos = new Set<string>();
  const usedTemplates = new Set<string>();
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  /** Unseen candidates if there are any, otherwise all of them. */
  const preferFresh = <T>(list: T[], fresh: (x: T) => boolean): T[] => {
    const f = list.filter(fresh);
    return f.length ? f : list;
  };

  return (subject) => {
    const team = preferFresh(
      opts.team.filter((v) => v.question.subject === subject && !usedTeam.has(v.id)),
      (v) => !heard.has(v.id),
    );
    const groups = new Set(opts.photos.groups.filter((g) => g.subject === subject).map((g) => g.id));
    const photos = preferFresh(
      opts.photos.photos.filter((p) => groups.has(p.group) && !usedPhotos.has(p.id)),
      (p) => !seenPhotos.has(p.id),
    );
    const templates = templatesFor(subject);
    const freshTemplates = templates.filter((t) => !usedTemplates.has(t.id));

    // Weighted choice among the sources that have something: team 3, photos 2, generated 2.
    const sources: Array<'team' | 'photo' | 'generated'> = [];
    if (team.length) sources.push('team', 'team', 'team');
    if (photos.length) sources.push('photo', 'photo');
    if (templates.length) sources.push('generated', 'generated');
    if (sources.length === 0) return null;
    const source = pick(sources);
    if (source === 'team') {
      const v = pick(team);
      usedTeam.add(v.id);
      return v.id;
    }
    if (source === 'photo') {
      const p = pick(photos);
      usedPhotos.add(p.id);
      return photoQuestionId(p.id, newSeed(random));
    }
    const t = pick(freshTemplates.length ? freshTemplates : templates);
    usedTemplates.add(t.id);
    return generatedId(t.id, newSeed(random));
  };
}
