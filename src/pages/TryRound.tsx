import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AiExplain } from '../components/AiExplain';
import { saveReading, savedReading, SoloSoundCheck, useSoloSpeech, type ReadingChoice, type ReadingPlan, type SoloSpeech } from '../components/SoloSpeech';
import { AnswerBox, Choices, Concepts, QuestionMeta, RichText } from '../components/QuestionView';
import { Countdown, LoadError, Loading, Notice, PageHeader, useTicker } from '../components/ui';
import { Verdict } from '../components/Verdict';
import { pickDrill, pickMixed, setIdOf, type DrillPick } from '../core/drill';
import { judgeAnswer, type JudgeResult } from '../core/judge/judge';
import { ratingFor } from '../core/mastery';
import { LEVEL_LABEL, libraryLevels, rowLevel, teamCatalog } from '../core/levels';
import { CORE_SUBJECTS, SUBJECT_LABELS, type Catalog, type CatalogRow, type CoreSubject, type DifficultyLevel, type Question, type QuestionPair, type QuestionSet } from '../core/schema';
import { topicsForSubject } from '../core/taxonomy';
import { heardLedger, usePlayerModel } from '../lib/learning';
import { catalogById, loadCatalog, loadConceptIndex, loadQuestions, loadSetById, setGroups, setLabel, useCatalog, useIndex, useTeamLevel } from '../lib/library';
import { topicById } from '../core/taxonomy';
import { MAX_SPEECH_WPM } from '../core/speech';
import { buildReading, lettersPerMinute, readingDurationMs, revealedCount, splitRevealed, wpmFor, type Reading } from '../lib/reading';
import { href } from '../lib/router';
import { signInHref } from '../components/Gates';
import { addAttempt, completeAssignment, completePlanItem, getData, markSeen, updateSettings, useData } from '../lib/store';
import { packetRound } from '../lib/packets';

const TOSSUP_WINDOW_S = 5;
const BONUS_WINDOW_S = 20;
const BONUS_WARNING_S = 15;
/** After buzzing: start typing within 2 s (NSB's "natural pause", Rule 5-3) and finish within 5 s. */
const ANSWER_START_S = 2;
const ANSWER_TOTAL_S = 5;

interface Item {
  pair: QuestionPair;
  where: string;
  /** Serve only the bonus (a topic drill whose topic matches the bonus but not its toss-up). */
  bonusOnly?: boolean;
}

type Step =
  /** Read aloud: the question's recording is being made or fetched before its reading starts. */
  | { kind: 'preparing'; which: 'tossup' | 'bonus' }
  /** `plan`: read aloud (how, and how long the reading lasts). */
  | { kind: 'tossup_reading'; startedAt: number; plan?: ReadingPlan }
  | { kind: 'tossup_open'; openedAt: number }
  | { kind: 'tossup_answering'; interrupt: boolean; latencyMs: number | null; shownChars: number; buzzedAt: number; typingAt: number | null }
  | { kind: 'tossup_result'; response: string; result: JudgeResult | null; interrupt: boolean; latencyMs: number | null; decided: boolean | null }
  | { kind: 'bonus_reading'; startedAt: number; plan?: ReadingPlan }
  | { kind: 'bonus_open'; openedAt: number }
  | { kind: 'bonus_result'; response: string; result: JudgeResult | null; decided: boolean | null };

interface Tally {
  tossupsHeard: number;
  tossupsCorrect: number;
  interrupts: number;
  interruptsWrong: number;
  bonusesHeard: number;
  bonusesCorrect: number;
  points: number;
  missed: Question[];
}

const emptyTally = (): Tally => ({ tossupsHeard: 0, tossupsCorrect: 0, interrupts: 0, interruptsWrong: 0, bonusesHeard: 0, bonusesCorrect: 0, points: 0, missed: [] });

/** The question as read so far: finished words at full strength, the word still appearing fainter. */
function Revealed({ reading, count }: { reading: Reading; count: number }) {
  const { done, current } = splitRevealed(reading, count);
  const lines = done.split('\n');
  return (
    <p className="stem" aria-live="off">
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          <RichText text={line} />
          {i === lines.length - 1 && current && <span className="reading-current">{current}</span>}
        </Fragment>
      ))}
    </p>
  );
}

const UNGRADABLE = ['answer-missing', 'choices-missing'];

/** Solo practice needs a readable answer to grade, so skip pairs the importer could not fully read. */
function playable(pair: QuestionPair): boolean {
  return [pair.tossup, pair.bonus].every((q) => !q || (q.answer.trim() !== '' && !q.flags?.some((f) => UNGRADABLE.includes(f))));
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------------- setup ---------------- */

type Mode = 'round' | 'subject' | 'mixed';

interface Settings {
  mode: Mode;
  setId: string;
  roundId: string;
  subject: CoreSubject;
  /** Topic id, or "" for the whole subject. */
  topic: string;
  /** Also use Energy questions that test this subject. */
  cross: boolean;
  /** Concept id: drill only questions tagged with it ("" for none). */
  concept: string;
  /** Team packet id: play that packet ("" for none). */
  packet: string;
  count: number;
  wpm: number;
  answerTimer: boolean;
  /** A level of the difficulty ladder, or "" for any. */
  level: DifficultyLevel | '';
}

const COUNTS = [5, 8, 10, 15, 20];

/** Drill and mixed-round questions from the whole library (fresh ones first), loading only the sets they come from. */
async function libraryItems(catalog: Catalog, s: Settings, seen: Record<string, number>, rating: (subject: CoreSubject, topic: string) => number): Promise<Item[]> {
  // A few extra, in case some cannot be graded.
  const want = s.count + 3;
  // Choosing a level also draws on the team's uploaded packets at that level. "Any level" keeps to the DOE
  // library, so packets kept for scrimmages stay unheard.
  const team = teamCatalog(getData().packets);
  const rows = s.level ? [...catalog.questions, ...team.rows] : catalog.questions;
  const levelFilter = s.level ? { level: s.level, levelOf: (row: CatalogRow) => rowLevel(row, team.levels) } : {};
  const picks: DrillPick[] = s.mode === 'subject' && s.concept ? await conceptPicks(s.concept, want, seen) : s.mode === 'mixed'
      ? pickMixed(rows, { count: want, seen, rating: (sub, topic) => rating(sub as CoreSubject, topic), ...levelFilter })
      : pickDrill(rows, {
          ...levelFilter,
          subject: s.subject,
          topic: s.topic || undefined,
          includeEnergyCross: s.cross,
          allowBonusOnly: !!s.topic,
          count: want,
          seen,
          rating: (sub, topic) => rating(sub as CoreSubject, topic),
        });
  const found = await loadQuestions(picks.map((p) => p.questionId));
  const items: Item[] = [];
  for (const p of picks) {
    const loc = found.get(p.questionId);
    if (!loc) continue;
    const ok = p.bonusOnly ? !!loc.pair.bonus && playable({ ...loc.pair, tossup: loc.pair.bonus }) : playable(loc.pair);
    if (ok) items.push({ pair: loc.pair, where: `${loc.set.title}, ${loc.round.label}`, bonusOnly: p.bonusOnly });
  }
  return items.slice(0, s.count);
}

/** Questions tagged with a concept, unheard first. A bonus whose toss-up is also picked comes after it, not on its own. */
async function conceptPicks(conceptId: string, want: number, seen: Record<string, number>): Promise<DrillPick[]> {
  const ids = (await loadConceptIndex()).concepts[conceptId] ?? [];
  const fresh = ids.filter((id) => !seen[id]);
  const pool = shuffle(fresh.length >= want ? fresh : [...fresh, ...shuffle(ids.filter((id) => seen[id]))]);
  const chosen = pool.slice(0, want);
  const tossups = new Set(chosen.filter((id) => /-t\d+$/.test(id)));
  return chosen
    .filter((id) => !(/-b\d+$/.test(id) && tossups.has(id.replace(/-b(\d+)$/, '-t$1'))))
    .map((id) => ({ questionId: id, setId: setIdOf(id), bonusOnly: /-b\d+$/.test(id) }));
}

function conceptName(id: string): string | null {
  const topic = topicById(id.split('.').slice(0, 2).join('.'));
  return topic?.concepts.find((c) => c.id === id)?.name ?? null;
}

function Setup({
  onStart,
  initial,
  autoStart,
  reading,
  onReading,
  speech,
}: {
  onStart: (items: Item[], s: Settings) => void;
  initial: Partial<Settings>;
  autoStart: boolean;
  reading: ReadingChoice;
  onReading: (choice: ReadingChoice) => void;
  /** Read aloud: the voices (null when questions are shown). */
  speech: SoloSpeech | null;
}) {
  const data = useData();
  const index = useIndex();
  const catalog = useCatalog();
  const [s, setS] = useState<Settings>({
    mode: 'round',
    setId: '',
    roundId: '',
    subject: 'biology',
    topic: '',
    cross: false,
    concept: '',
    packet: '',
    count: 10,
    wpm: data.settings.readingWpm,
    answerTimer: data.settings.answerTimer,
    level: '',
    ...initial,
  });
  const uploadLevels = useMemo(() => new Set(teamCatalog(data.packets).levels.values()), [data.packets]);
  const doeLevels = useMemo(() => (catalog.data ? libraryLevels(catalog.data.questions) : new Set<DifficultyLevel>(['early', 'late'])), [catalog.data]);
  const [set, setSet] = useState<QuestionSet | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  // Signed in, practice is saved to the player's account; signed out, nothing is saved.
  const playerId = data.settings.soloPlayerId;
  const catalogMap = useMemo(() => (catalog.data ? catalogById(catalog.data) : null), [catalog.data]);
  const model = usePlayerModel(data, playerId, catalogMap);

  const level = useTeamLevel();
  const groups = useMemo(() => (index.data ? setGroups(index.data, level) : []), [index.data, level]);
  // "Surprise me" picks from the team's own level.
  const sets = useMemo(() => groups[0]?.sets ?? [], [groups]);
  const topics = useMemo(() => topicsForSubject(s.subject).filter((t) => (catalog.data?.topicCounts[t.id] ?? 0) > 0), [s.subject, catalog.data]);

  useEffect(() => {
    if (!s.setId || s.mode !== 'round') return;
    let live = true;
    loadSetById(s.setId).then(
      (loaded) => live && setSet(loaded),
      (err: Error) => live && setError(err),
    );
    return () => {
      live = false;
    };
  }, [s.setId, s.mode]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const seen = playerId ? heardLedger(data, playerId) : {};
      let items: Item[] = [];
      let settings = s;
      const teamPacket = s.packet ? data.packets.find((p) => p.id === s.packet) : undefined;
      if (s.packet && !teamPacket) throw new Error("That team packet is not in your team's packets (it may have been deleted).");
      if (teamPacket) {
        const round = await packetRound(teamPacket);
        items = round.pairs.filter(playable).map((pair) => ({ pair, where: teamPacket.title }));
      } else if (s.mode === 'round') {
        let chosen = set;
        if (!chosen || !s.setId) {
          // Random: one of the eight newest sets.
          const pick = sets.slice(0, 8)[Math.floor(Math.random() * Math.min(8, sets.length))];
          chosen = await loadSetById(pick.id);
          settings = { ...s, setId: pick.id };
        }
        const round = chosen.rounds.find((r) => r.id === settings.roundId) ?? chosen.rounds[Math.floor(Math.random() * chosen.rounds.length)];
        items = round.pairs.filter(playable).map((pair) => ({ pair, where: `${chosen!.title}, ${round.label}` }));
      } else {
        const cat = catalog.data ?? (await loadCatalog());
        items = await libraryItems(cat, s, seen, (subject, topic) => ratingFor(model, subject, topic));
      }
      if (items.length === 0) throw new Error('No questions match these settings. Try another topic or subject.');
      if (speech) settings = { ...settings, wpm: Math.min(MAX_SPEECH_WPM, settings.wpm) };
      updateSettings({ readingWpm: settings.wpm, answerTimer: settings.answerTimer });
      onStart(items, settings);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusy(false);
    }
  };

  // Started from Today: begin as soon as the library is ready.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current || !index.data || (s.mode !== 'round' && catalog.loading)) return;
    autoStarted.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, index.data, catalog.loading]);

  const fromLibrary = s.mode !== 'round';

  return (
    <div className="container narrow">
      <PageHeader title={playerId ? 'Solo practice' : 'Try a round'}>
        <p>
          Questions appear letter by letter, at the pace a moderator reads them, or are read aloud. Press <span className="kbd">Space</span> to
          buzz, type your answer, and press <span className="kbd">Enter</span>. You get {TOSSUP_WINDOW_S} seconds after the reading to buzz and{' '}
          {BONUS_WINDOW_S} seconds on bonuses. After you buzz, start typing within {ANSWER_START_S} seconds and finish within {ANSWER_TOTAL_S},
          since NSB only allows a short natural pause before answering.
        </p>
        <p className="small">
          Also: <a href={href('/visual')}>Visual lab</a> (Finals visual bonuses) · <a href={href('/tiebreakers')}>Tiebreakers</a> (5 toss-up
          tiebreakers and shootouts)
        </p>
      </PageHeader>
      {index.loading && <Loading what="Loading the library" />}
      {index.error && <LoadError error={index.error} />}
      {error && <LoadError error={error} />}
      {index.data && (
        <div className="card stack">
          {!playerId && (
            <p className="small muted" style={{ margin: 0 }}>
              Just trying it: nothing is saved. <a href={signInHref()}>Sign in</a> and Rebound skips questions you have heard, puts misses in your review
              queue, and counts your answers in your progress.
            </p>
          )}
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">Practice</legend>
            <label className="checkbox">
              <input type="radio" name="mode" checked={s.mode === 'round'} onChange={() => setS({ ...s, mode: 'round' })} /> A whole round, all subjects
            </label>
            <label className="checkbox">
              <input type="radio" name="mode" checked={s.mode === 'subject'} onChange={() => setS({ ...s, mode: 'subject' })} /> A subject or topic drill, from the
              whole library
            </label>
            <label className="checkbox">
              <input type="radio" name="mode" checked={s.mode === 'mixed'} onChange={() => setS({ ...s, mode: 'mixed' })} /> Mixed toss-ups, all six subjects
            </label>
          </fieldset>
          <div className="grid">
            {s.packet && (
              <div className="field">
                <span className="label">Team packet</span>
                <span>
                  {data.packets.find((p) => p.id === s.packet)?.title ?? 'Not found'}{' '}
                  <button className="btn btn-small btn-ghost" onClick={() => setS({ ...s, packet: '' })}>
                    Clear
                  </button>
                </span>
              </div>
            )}
            {s.mode === 'round' && !s.packet && (
              <>
                <div className="field">
                  <label htmlFor="set">Sample set</label>
                  <select id="set" value={s.setId} onChange={(e) => setS({ ...s, setId: e.target.value, roundId: '' })}>
                    <option value="">Surprise me (recent sets)</option>
                    {groups.map((g) => (
                      <optgroup key={g.level} label={g.label}>
                        {g.sets.map((x) => (
                          <option key={x.id} value={x.id}>
                            {setLabel(x)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="round">Round</label>
                  <select id="round" value={s.roundId} onChange={(e) => setS({ ...s, roundId: e.target.value })} disabled={!set || !s.setId}>
                    <option value="">Random round</option>
                    {s.setId &&
                      set?.rounds.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                  </select>
                </div>
              </>
            )}
            {s.mode === 'subject' && s.concept && (
              <div className="field">
                <span className="label">Concept</span>
                <span>
                  {conceptName(s.concept) ?? s.concept}{' '}
                  <button className="btn btn-small btn-ghost" onClick={() => setS({ ...s, concept: '' })}>
                    Clear
                  </button>
                </span>
              </div>
            )}
            {s.mode === 'subject' && !s.concept && (
              <>
                <div className="field">
                  <label htmlFor="subject">Subject</label>
                  <select id="subject" value={s.subject} onChange={(e) => setS({ ...s, subject: e.target.value as CoreSubject, topic: '', cross: false })}>
                    {CORE_SUBJECTS.map((sub) => (
                      <option key={sub} value={sub}>
                        {SUBJECT_LABELS[sub]}
                      </option>
                    ))}
                  </select>
                </div>
                {topics.length > 0 && (
                  <div className="field">
                    <label htmlFor="topic">Topic</label>
                    <select id="topic" value={s.topic} onChange={(e) => setS({ ...s, topic: e.target.value })}>
                      <option value="">All of {SUBJECT_LABELS[s.subject]}</option>
                      {topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({catalog.data?.topicCounts[t.id] ?? 0})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
            {fromLibrary && !s.concept && (
              <div className="field">
                <label htmlFor="level">Level</label>
                <select id="level" value={s.level} onChange={(e) => setS({ ...s, level: e.target.value as DifficultyLevel | '' })}>
                  <option value="">Any level (DOE library)</option>
                  {(Object.keys(LEVEL_LABEL) as DifficultyLevel[]).map((l) => {
                    const inLibrary = doeLevels.has(l);
                    const inUploads = uploadLevels.has(l);
                    const where =
                      l === 'early'
                        ? 'DOE rounds 1–10'
                        : l === 'late'
                          ? 'DOE rounds 11 and later'
                          : [inLibrary ? 'DOE national rounds' : '', inUploads ? 'your uploaded packets' : ''].filter(Boolean).join(' and ') || 'upload a packet at this level first';
                    return (
                      <option key={l} value={l} disabled={!inLibrary && !inUploads}>
                        {LEVEL_LABEL[l]} ({where})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            {fromLibrary && (
              <div className="field">
                <label htmlFor="count">Questions</label>
                <select id="count" value={s.count} onChange={(e) => setS({ ...s, count: Number(e.target.value) })}>
                  {[...new Set([...COUNTS, s.count])]
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
          {s.mode === 'subject' && s.subject !== 'energy' && !s.topic && (
            <label className="checkbox">
              <input type="checkbox" checked={s.cross} onChange={(e) => setS({ ...s, cross: e.target.checked })} />
              Include Energy questions that really test {SUBJECT_LABELS[s.subject]}
            </label>
          )}
          {fromLibrary && catalog.error && <Notice kind="warn">The question catalog could not be loaded, so drills are unavailable right now. {catalog.error.message}</Notice>}
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">How questions are read</legend>
            <label className="checkbox">
              <input type="radio" name="reading" checked={reading === 'text'} onChange={() => onReading('text')} /> On screen: each question appears letter
              by letter
            </label>
            <label className="checkbox">
              <input
                type="radio"
                name="reading"
                checked={reading === 'speech'}
                onChange={() => {
                  onReading('speech');
                  setS((now) => ({ ...now, wpm: Math.min(MAX_SPEECH_WPM, now.wpm) }));
                }}
              />{' '}
              Read aloud: you hear each question, and its text appears with the answer (turn your sound on)
            </label>
          </fieldset>
          {speech && <SoloSoundCheck speech={speech} wpm={s.wpm} />}
          <div className="field">
            <label htmlFor="wpm">
              Reading speed: {s.wpm} words per minute (about {lettersPerMinute(s.wpm).toLocaleString()} letters per minute)
            </label>
            <input
              id="wpm"
              type="range"
              min={120}
              max={speech ? MAX_SPEECH_WPM : 320}
              step={10}
              value={s.wpm}
              onChange={(e) => setS({ ...s, wpm: Number(e.target.value) })}
            />
            <span className="hint">
              Moderators usually read at roughly 160–220 words per minute. Letters per minute uses the average DOE question word: about 5 letters
              plus a space.
            </span>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={s.answerTimer} onChange={(e) => setS({ ...s, answerTimer: e.target.checked })} />
            Time my answers: start typing within {ANSWER_START_S} seconds of buzzing and finish within {ANSWER_TOTAL_S}
          </label>
          <div>
            <button
              className="btn btn-primary btn-big"
              onClick={() => {
                // Read aloud: let the page speak and play from this click on (Safari on iPads and iPhones).
                speech?.prime();
                void start();
              }}
              disabled={busy || (fromLibrary && !catalog.data)}
            >
              {busy ? 'Loading…' : 'Start'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- play ---------------- */

/** The step a question's reading starts with: read aloud, its recording is made ready first. */
function readingStep(which: 'tossup' | 'bonus', aloud: boolean): Step {
  if (aloud) return { kind: 'preparing', which };
  return which === 'bonus' ? { kind: 'bonus_reading', startedAt: Date.now() } : { kind: 'tossup_reading', startedAt: Date.now() };
}

function firstStep(item: Item, aloud: boolean): Step {
  return readingStep(item.bonusOnly ? 'bonus' : 'tossup', aloud);
}

/** Read aloud: the voice starts this long after the question is ready, so its first words are not lost. */
const LEAD_MS = 300;

/** Read aloud: what shows in place of the question while it is heard (its text comes with the answer). */
function Listening({ step }: { step: Step }) {
  const text =
    step.kind === 'preparing'
      ? 'Getting the question ready…'
      : step.kind === 'tossup_reading' || step.kind === 'bonus_reading'
        ? '🔊 Listening to the question…'
        : 'The question’s text shows with its answer.';
  return (
    <p className="listening" aria-live="off">
      {text}
    </p>
  );
}

function Play({
  items,
  wpm,
  answerTimer,
  speech,
  onDone,
  onQuit,
}: {
  items: Item[];
  wpm: number;
  answerTimer: boolean;
  /** Read aloud (null: questions appear letter by letter). */
  speech: SoloSpeech | null;
  onDone: (t: Tally) => void;
  onQuit: () => void;
}) {
  const data = useData();
  const playerId = data.settings.soloPlayerId;
  const aloud = !!speech;
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>(() => firstStep(items[0], aloud));
  // Read aloud, but this question shows as text (the device has no voice, and there is no recording).
  const [asText, setAsText] = useState(false);
  const [tally, setTally] = useState<Tally>(emptyTally);
  const [response, setResponse] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const item = items[index];
  const tossup = item.pair.tossup;
  const bonus = item.pair.bonus;
  const tossupReading = useMemo(() => buildReading(tossup), [tossup]);
  const bonusReading = useMemo(() => (bonus ? buildReading(bonus) : null), [bonus]);
  const tossupLength = tossupReading.text.length;
  const bonusLength = bonusReading?.text.length ?? 0;
  const timed =
    step.kind === 'tossup_reading' ||
    step.kind === 'tossup_open' ||
    step.kind === 'bonus_reading' ||
    step.kind === 'bonus_open' ||
    (answerTimer && step.kind === 'tossup_answering');
  const now = useTicker(timed, 50);

  // Record that the player has heard the questions.
  useEffect(() => {
    if (playerId && !item.bonusOnly) markSeen([playerId], [tossup.id]);
  }, [playerId, tossup.id, item.bonusOnly]);

  const record = useCallback(
    (q: Question, correct: boolean, interrupt: boolean, latencyMs: number | null, overridden: boolean) => {
      if (!playerId) return;
      addAttempt({ playerId, questionId: q.id, subject: q.subject, kind: q.kind, correct, interrupt, latencyMs, overridden, t: Date.now() });
    },
    [playerId],
  );

  /** How long a reading lasts: read aloud, as its plan says (a recording sets its own length). */
  const lasts = (st: { plan?: ReadingPlan }, reading: Reading) => st.plan?.durationMs ?? readingDurationMs(reading, wpm);
  /** The text's pace: in step with the reading, for a question read aloud that shows as text after all. */
  const pace = (st: { plan?: ReadingPlan }, reading: Reading) => (st.plan ? wpmFor(reading, st.plan.durationMs) : wpm);
  const shownTossup =
    step.kind === 'tossup_reading'
      ? revealedCount(tossupReading, now - step.startedAt, pace(step, tossupReading))
      : step.kind === 'tossup_answering'
        ? step.shownChars
        : tossupLength;
  const shownBonus = step.kind === 'bonus_reading' && bonusReading ? revealedCount(bonusReading, now - step.startedAt, pace(step, bonusReading)) : bonusLength;
  // Read aloud, the question's text is hidden until its answer, unless it cannot be heard.
  const hidden = aloud && !asText && !speech?.unheard;

  // Read aloud: have the next questions recorded ahead, so each is ready when its turn comes.
  useEffect(() => {
    if (!speech) return;
    const first = (it?: Item) => (!it ? [] : it.bonusOnly ? (it.pair.bonus ? [it.pair.bonus] : []) : [it.pair.tossup]);
    const here = items[index]!;
    speech.prepare([...first(here), ...(!here.bonusOnly && here.pair.bonus ? [here.pair.bonus] : []), ...first(items[index + 1]), ...first(items[index + 2])]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Read aloud: once a question is ready (its recording made and fetched, or the device's voice), its reading starts.
  useEffect(() => {
    if (step.kind !== 'preparing' || !speech) return;
    const which = step.which;
    const q = which === 'bonus' ? bonus : tossup;
    if (!q) return;
    let live = true;
    void speech.plan(q, wpm).then((plan) => {
      if (!live) return;
      const startedAt = Date.now() + LEAD_MS;
      setAsText(plan.voice === 'text');
      setStep(which === 'bonus' ? { kind: 'bonus_reading', startedAt, plan } : { kind: 'tossup_reading', startedAt, plan });
      if (which === 'bonus') setTimeout(() => inputRef.current?.focus(), 0);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, index]);

  // Read aloud: the voice follows the reading; a buzz or an answer stops it; the end of the reading lets it finish.
  const voiceKey = step.kind === 'tossup_reading' || step.kind === 'bonus_reading' ? `${step.kind}:${step.startedAt}` : step.kind;
  useEffect(() => {
    if (!speech) return;
    if ((step.kind === 'tossup_reading' || step.kind === 'bonus_reading') && step.plan) {
      const q = step.kind === 'bonus_reading' ? bonus : tossup;
      if (q) speech.read({ q, plan: step.plan, startedAt: step.startedAt, wpm });
    } else if (step.kind === 'tossup_open' || step.kind === 'bonus_open') speech.read(null, 'finish');
    else speech.read(null, 'stop');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => speech?.read(null, 'stop'), []);

  // Automatic transitions: the end of the reading opens the window; windows and the answer timer run out.
  useEffect(() => {
    if (step.kind === 'tossup_reading' && now - step.startedAt >= lasts(step, tossupReading)) {
      setStep({ kind: 'tossup_open', openedAt: step.startedAt + lasts(step, tossupReading) });
    } else if (step.kind === 'tossup_open' && now - step.openedAt >= TOSSUP_WINDOW_S * 1000) {
      setTally((t) => ({ ...t, tossupsHeard: t.tossupsHeard + 1, missed: [...t.missed, tossup] }));
      setStep({ kind: 'tossup_result', response: '', result: null, interrupt: false, latencyMs: null, decided: false });
    } else if (step.kind === 'tossup_answering' && answerTimer) {
      const elapsed = now - step.buzzedAt;
      if (step.typingAt === null && !response.trim() && elapsed >= ANSWER_START_S * 1000) stall();
      else if (elapsed >= ANSWER_TOTAL_S * 1000) submitTossup(response, true);
    } else if (step.kind === 'bonus_reading' && bonusReading && now - step.startedAt >= lasts(step, bonusReading)) {
      setStep({ kind: 'bonus_open', openedAt: step.startedAt + lasts(step, bonusReading) });
    } else if (step.kind === 'bonus_open' && now - step.openedAt >= BONUS_WINDOW_S * 1000) {
      submitBonus(response);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, step]);

  const buzz = useCallback(() => {
    const buzzedAt = Date.now();
    if (step.kind === 'tossup_reading') {
      setStep({ kind: 'tossup_answering', interrupt: true, latencyMs: null, shownChars: shownTossup, buzzedAt, typingAt: null });
    } else if (step.kind === 'tossup_open') {
      setStep({ kind: 'tossup_answering', interrupt: false, latencyMs: buzzedAt - step.openedAt, shownChars: tossupLength, buzzedAt, typingAt: null });
    } else return;
    setResponse('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [step, shownTossup, tossupLength]);

  const submitTossup = (text: string, timedOut = false) => {
    if (step.kind !== 'tossup_answering') return;
    const judged = judgeAnswer(tossup, text);
    const result = timedOut ? { ...judged, reason: `Time: your answer was taken ${ANSWER_TOTAL_S} seconds after the buzz. ${judged.reason}` } : judged;
    const decided = result.verdict === 'review' ? null : result.verdict === 'correct';
    setStep({ kind: 'tossup_result', response: text, result, interrupt: step.interrupt, latencyMs: step.latencyMs, decided });
    if (decided !== null) applyTossup(decided, step.interrupt);
  };

  /** Nothing typed within the natural pause: a stall counts as a wrong answer (Rule 5-3). */
  const stall = () => {
    if (step.kind !== 'tossup_answering') return;
    const result: JudgeResult = { verdict: 'incorrect', reason: `Stall: start answering within ${ANSWER_START_S} seconds of buzzing (NSB Rule 5-3).` };
    setStep({ kind: 'tossup_result', response: '', result, interrupt: step.interrupt, latencyMs: step.latencyMs, decided: false });
    applyTossup(false, step.interrupt);
  };

  /** Update the running tally; `undoPrevious` reverses an earlier decision on the same question first. */
  const applyTossup = (correct: boolean, interrupt: boolean, undoPrevious?: boolean) => {
    setTally((t) => {
      const n = { ...t, missed: [...t.missed] };
      if (undoPrevious) {
        // Reverse the earlier decision before applying the new one.
        if (correct) {
          n.tossupsCorrect += 1;
          n.points += 4 + (interrupt ? 4 : 0);
          n.interruptsWrong -= interrupt ? 1 : 0;
          n.missed = n.missed.filter((q) => q.id !== tossup.id);
        } else {
          n.tossupsCorrect -= 1;
          n.points -= 4 + (interrupt ? 4 : 0);
          n.interruptsWrong += interrupt ? 1 : 0;
          n.missed.push(tossup);
        }
        return n;
      }
      n.tossupsHeard += 1;
      if (interrupt) n.interrupts += 1;
      if (correct) {
        n.tossupsCorrect += 1;
        n.points += 4;
      } else {
        n.missed.push(tossup);
        if (interrupt) {
          n.interruptsWrong += 1;
          n.points -= 4;
        }
      }
      return n;
    });
  };

  const decideTossup = (right: boolean) => {
    if (step.kind !== 'tossup_result' || !step.result) return;
    const previous = step.decided;
    if (previous === right) return;
    setStep({ ...step, decided: right });
    applyTossup(right, step.interrupt, previous !== null);
  };

  const submitBonus = (text: string) => {
    if (!bonus || (step.kind !== 'bonus_open' && step.kind !== 'bonus_reading')) return;
    const result = text.trim() ? judgeAnswer(bonus, text) : null;
    const decided = !result ? false : result.verdict === 'review' ? null : result.verdict === 'correct';
    setStep({ kind: 'bonus_result', response: text, result, decided });
    setTally((t) => ({ ...t, bonusesHeard: t.bonusesHeard + 1 }));
    if (playerId) markSeen([playerId], [bonus.id]);
    if (decided !== null) applyBonus(decided, false);
  };

  const applyBonus = (correct: boolean, undoPrevious: boolean) => {
    if (!bonus) return;
    setTally((t) => {
      const n = { ...t, missed: [...t.missed] };
      if (undoPrevious) {
        n.bonusesCorrect += correct ? 1 : -1;
        n.points += correct ? 10 : -10;
        n.missed = correct ? n.missed.filter((q) => q.id !== bonus.id) : [...n.missed, bonus];
        return n;
      }
      if (correct) {
        n.bonusesCorrect += 1;
        n.points += 10;
      } else n.missed.push(bonus);
      return n;
    });
  };

  const decideBonus = (right: boolean) => {
    if (step.kind !== 'bonus_result' || !step.result) return;
    const previous = step.decided;
    if (previous === right) return;
    setStep({ ...step, decided: right });
    applyBonus(right, previous !== null);
  };

  const canContinue = (step.kind === 'tossup_result' && (step.result === null || step.decided !== null)) || (step.kind === 'bonus_result' && (step.result === null || step.decided !== null));
  const goesToBonus = step.kind === 'tossup_result' && step.decided === true && !!bonus;

  const next = () => {
    if (!canContinue) return;
    // Save the final decision once, when the player moves on (so overrides never double-count).
    if (step.kind === 'tossup_result' && step.result && step.decided !== null) {
      record(tossup, step.decided, step.interrupt, step.latencyMs, step.result.verdict !== (step.decided ? 'correct' : 'incorrect'));
    }
    if (step.kind === 'bonus_result' && bonus && step.result && step.decided !== null) {
      record(bonus, step.decided, false, null, step.result.verdict !== (step.decided ? 'correct' : 'incorrect'));
    }
    setResponse('');
    if (goesToBonus) {
      setStep(readingStep('bonus', aloud));
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    if (index + 1 >= items.length) {
      onDone(tally);
      return;
    }
    setIndex(index + 1);
    setStep(firstStep(items[index + 1], aloud));
    if (items[index + 1].bonusOnly) setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Keyboard: Space buzzes; Space/Enter continues; Y/N decide.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (typing) return;
      const key = e.key.toLowerCase();
      if (key === ' ' && (step.kind === 'tossup_reading' || step.kind === 'tossup_open')) {
        e.preventDefault();
        buzz();
      } else if ((key === ' ' || key === 'enter') && canContinue) {
        if (target?.tagName === 'BUTTON' && key === 'enter') return;
        e.preventDefault();
        next();
      } else if (key === 'y' || key === 'n') {
        if (step.kind === 'tossup_result' && step.result && step.decided === null) decideTossup(key === 'y');
        if (step.kind === 'bonus_result' && step.result && step.decided === null) decideBonus(key === 'y');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onBonus = step.kind === 'bonus_reading' || step.kind === 'bonus_open' || step.kind === 'bonus_result' || (step.kind === 'preparing' && step.which === 'bonus');

  return (
    <div className="container narrow">
      <div className="row spread" style={{ marginBottom: '0.5rem' }}>
        <span className="muted small">
          {item.bonusOnly ? 'Bonus' : 'Toss-up'} {index + 1} of {items.length} · {item.where}
        </span>
        <span className="row small">
          <strong>{tally.points} points</strong>
          <button className="btn btn-small btn-ghost" onClick={onQuit}>
            Stop
          </button>
        </span>
      </div>

      {!onBonus ? (
        <article className="question">
          <QuestionMeta q={tossup} />
          {step.kind === 'tossup_result' ? (
            <>
              <p className="stem">
                <RichText text={tossup.stem} />
              </p>
              <Choices q={tossup} />
            </>
          ) : hidden || step.kind === 'preparing' ? (
            <Listening step={step} />
          ) : (
            <Revealed reading={tossupReading} count={shownTossup} />
          )}
        </article>
      ) : (
        bonus && (
          <article className="question">
            <QuestionMeta q={bonus} />
            {step.kind === 'bonus_result' ? (
              <>
                <p className="stem">
                  <RichText text={bonus.stem} />
                </p>
                <Choices q={bonus} />
              </>
            ) : hidden || step.kind === 'preparing' ? (
              <Listening step={step} />
            ) : (
              bonusReading && <Revealed reading={bonusReading} count={shownBonus} />
            )}
          </article>
        )
      )}

      <div className="stack" style={{ marginTop: '1rem' }}>
        {speech?.blocked && (
          <Notice kind="warn">
            Your browser is waiting for a tap before it plays sound.{' '}
            <button className="btn btn-small" onClick={speech.allow}>
              Turn on the sound
            </button>
          </Notice>
        )}
        {step.kind === 'tossup_reading' && (
          <button className="btn btn-primary btn-big" onClick={buzz}>
            Buzz <span className="kbd">Space</span>
          </button>
        )}
        {step.kind === 'tossup_open' && (
          <>
            <Countdown openedAt={step.openedAt} seconds={TOSSUP_WINDOW_S} now={now} label="Time to buzz" />
            <button className="btn btn-primary btn-big" onClick={buzz}>
              Buzz <span className="kbd">Space</span>
            </button>
          </>
        )}
        {(step.kind === 'tossup_answering' || step.kind === 'bonus_reading' || step.kind === 'bonus_open') && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step.kind === 'tossup_answering') submitTossup(response);
              else submitBonus(response);
            }}
            className="stack"
          >
            {step.kind === 'tossup_answering' && step.interrupt && <span className="badge">Interrupt: a wrong answer gives the other team 4 points</span>}
            {step.kind === 'tossup_answering' &&
              answerTimer &&
              (step.typingAt === null ? (
                <Countdown openedAt={step.buzzedAt} seconds={ANSWER_START_S} now={now} label="Start typing" />
              ) : (
                <Countdown openedAt={step.buzzedAt} seconds={ANSWER_TOTAL_S} now={now} label="Finish your answer" />
              ))}
            {step.kind === 'bonus_open' && <Countdown openedAt={step.openedAt} seconds={BONUS_WINDOW_S} warningAt={BONUS_WARNING_S} now={now} label="Bonus" />}
            <label htmlFor="answer" className="label">
              {step.kind === 'tossup_answering' ? 'Your answer' : 'Bonus answer (you can start typing while it is read)'}
            </label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                id="answer"
                ref={inputRef}
                className="big-input"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={response}
                onChange={(e) => {
                  const value = e.target.value;
                  setResponse(value);
                  if (step.kind === 'tossup_answering' && step.typingAt === null && value.trim()) setStep({ ...step, typingAt: Date.now() });
                }}
                autoFocus
              />
              <button className="btn btn-primary" type="submit">
                Answer
              </button>
            </div>
          </form>
        )}
        {step.kind === 'tossup_result' && (
          <>
            {step.response && <p className="small muted">You answered: “{step.response}”</p>}
            <Verdict result={step.result} decided={step.decided} onDecide={decideTossup} />
            <AnswerBox q={tossup} />
            <AiExplain q={tossup} />
            <Concepts q={tossup} />
          </>
        )}
        {step.kind === 'bonus_result' && bonus && (
          <>
            {step.response && <p className="small muted">You answered: “{step.response}”</p>}
            <Verdict result={step.result} decided={step.decided} onDecide={decideBonus} />
            <AnswerBox q={bonus} />
            <AiExplain q={bonus} />
            <Concepts q={bonus} />
          </>
        )}
        {canContinue && (
          <button className="btn btn-primary btn-big" onClick={next}>
            {goesToBonus ? 'Bonus' : index + 1 >= items.length ? 'Finish' : items[index + 1].bonusOnly ? 'Next bonus' : 'Next toss-up'} <span className="kbd">Space</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Done({ tally, fromPlan, onAgain, onSetup }: { tally: Tally; fromPlan: boolean; onAgain: () => void; onSetup: () => void }) {
  const data = useData();
  return (
    <div className="container narrow">
      <PageHeader title={`${tally.points} points`}>
        <p>
          Toss-ups: {tally.tossupsCorrect} of {tally.tossupsHeard} · Interrupts: {tally.interrupts} ({tally.interruptsWrong} wrong) · Bonuses:{' '}
          {tally.bonusesCorrect} of {tally.bonusesHeard}
        </p>
        <div className="row">
          {fromPlan && (
            <a className="btn btn-primary" href={href('/today')}>
              Back to today's plan
            </a>
          )}
          <button className={fromPlan ? 'btn' : 'btn btn-primary'} onClick={onAgain}>
            Play again
          </button>
          <button className="btn" onClick={onSetup}>
            Change settings
          </button>
          {!data.settings.soloPlayerId && (
            <a className="btn btn-ghost" href={signInHref('/try')}>
              Sign in to save your progress
            </a>
          )}
        </div>
      </PageHeader>
      {tally.missed.length > 0 ? (
        <>
          <h2>Review what you missed</h2>
          {data.settings.soloPlayerId ? (
            <p className="muted small">
              These are in your <a href={href('/review')}>review queue</a> and come back tomorrow, then on a spaced schedule. Slow correct
              answers come back too.
            </p>
          ) : (
            <p className="muted small">
              <a href={signInHref('/try')}>Sign in</a> before you start, and Rebound brings misses back as timed reviews.
            </p>
          )}
          <div className="stack">
            {tally.missed.map((q) => (
              <article className="question" key={q.id}>
                <QuestionMeta q={q} />
                <p className="stem">
                  <RichText text={q.stem} />
                </p>
                <Choices q={q} />
                <AnswerBox q={q} />
              </article>
            ))}
          </div>
        </>
      ) : (
        <Notice kind="good">Nothing missed. Try a harder round or a faster reading speed.</Notice>
      )}
    </div>
  );
}

function initialFromQuery(query: URLSearchParams): Partial<Settings> {
  const initial: Partial<Settings> = {};
  const mode = query.get('mode');
  if (mode === 'subject' || mode === 'mixed' || mode === 'round') initial.mode = mode;
  else if (query.get('set')) initial.mode = 'round';
  if (query.get('set')) initial.setId = query.get('set')!;
  if (query.get('round')) initial.roundId = query.get('round')!;
  const subject = query.get('subject');
  if (subject && (CORE_SUBJECTS as string[]).includes(subject)) initial.subject = subject as CoreSubject;
  if (query.get('topic')) initial.topic = query.get('topic')!;
  if (query.get('cross') === '1') initial.cross = true;
  if (query.get('concept')) initial.concept = query.get('concept')!;
  if (query.get('packet')) {
    initial.packet = query.get('packet')!;
    initial.mode = 'round';
  }
  const count = Number(query.get('count'));
  if (count > 0 && count <= 40) initial.count = Math.round(count);
  return initial;
}

export function TryRound({ query }: { query: URLSearchParams }) {
  const data = useData();
  // On screen or read aloud: remembered on this device, which has (or lacks) the sound and the voices.
  const [reading, setReading] = useState<ReadingChoice>(savedReading);
  const voices = useSoloSpeech(reading === 'speech');
  const speech = reading === 'speech' ? voices : null;
  const [stage, setStage] = useState<'setup' | 'play' | 'done'>('setup');
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tally, setTally] = useState<Tally>(emptyTally);
  const [runKey, setRunKey] = useState(0);
  const queryKey = query.toString();
  const initial = useMemo(() => initialFromQuery(new URLSearchParams(queryKey)), [queryKey]);
  // Launched from a plan item on Today: start straight away, and tick the item off at the end.
  const planItem = query.get('plan');
  const planDay = query.get('day');
  const assignment = query.get('assignment');
  const autoStart = query.get('go') === '1';

  // A new link (for example another plan item) starts over at setup.
  useEffect(() => {
    setStage('setup');
    setSettings(null);
  }, [queryKey]);

  if (stage === 'play' && settings) {
    return (
      <Play
        key={runKey}
        items={items}
        wpm={settings.wpm}
        answerTimer={settings.answerTimer}
        speech={speech}
        onDone={(t) => {
          setTally(t);
          setStage('done');
          const playerId = data.settings.soloPlayerId;
          if (playerId && planItem && planDay) completePlanItem(playerId, planDay, planItem);
          if (playerId && assignment) completeAssignment(assignment, playerId);
        }}
        onQuit={() => setStage('setup')}
      />
    );
  }
  if (stage === 'done') {
    return (
      <Done
        tally={tally}
        fromPlan={!!planItem || !!assignment}
        onAgain={() => {
          setItems(shuffle(items));
          setRunKey((k) => k + 1);
          setStage('play');
        }}
        onSetup={() => setStage('setup')}
      />
    );
  }
  return (
    <Setup
      key={queryKey}
      initial={settings ?? initial}
      autoStart={autoStart && settings === null}
      reading={reading}
      onReading={(choice) => {
        setReading(choice);
        saveReading(choice);
      }}
      speech={speech}
      onStart={(list, s) => {
        if (list.length === 0) return;
        setItems(list);
        setSettings(s);
        setRunKey((k) => k + 1);
        setStage('play');
      }}
    />
  );
}
