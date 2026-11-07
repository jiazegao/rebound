import { useEffect, useMemo, useState } from 'react';
import { QuestionView } from '../components/QuestionView';
import { LoadError, Loading, Notice, PageHeader, SubjectTag } from '../components/ui';
import { FigureView } from '../components/Figure';
import { teamCatalog, UPLOAD_LEVEL_LABEL } from '../core/levels';
import { buildScrimmage, FORMATS, LEVEL_TEXT, type ScrimmageLevel, type ScrimmageResult } from '../core/scrimmage';
import type { Round, ScrimmageFormat, TeamPacket, UploadLevel } from '../core/schema';
import { dateText, newId } from '../lib/format';
import { loadCatalog, loadQuestions, useAsync, useCatalog, type Located } from '../lib/library';
import { packetRound, packetRounds } from '../lib/packets';
import { href, navigate } from '../lib/router';
import { deletePacket, savePacket, useData } from '../lib/store';
import { parseJson, parsePdf, uploadSet, UPLOAD_LICENSE, type ParsedRound } from '../lib/upload';
import { makeVisualPicker } from '../lib/visualPool';
import { loadPhotoSet, trustedFigure } from '../lib/visuals';

const SIZES = [10, 15, 20, 25, 30];

const VISUAL_SHARES: Array<{ share: number; label: string }> = [
  { share: 1, label: 'Every bonus' },
  { share: 0.5, label: 'Every other bonus' },
  { share: 0.25, label: 'About one bonus in four' },
];

/** "Scrimmage · Finals visual bonus round · late regional" */
export function packetKindText(p: TeamPacket): string {
  if (p.kind === 'upload') return `Uploaded${p.level ? ` · ${UPLOAD_LEVEL_LABEL[p.level].toLowerCase()}` : ''}`;
  const parts = ['Scrimmage'];
  if (p.options?.format && p.options.format !== 'regional') parts.push(FORMATS[p.options.format].label.toLowerCase());
  if (p.options) parts.push(LEVEL_TEXT[p.options.level].split(' (')[0]!.toLowerCase());
  return parts.join(' · ');
}

function ScrimmageBuilder() {
  const data = useData();
  const catalog = useCatalog();
  const players = data.players.filter((p) => p.active && p.role !== 'coach');
  const [inRoom, setInRoom] = useState<Set<string>>(() => new Set(players.map((p) => p.id)));
  const [format, setFormat] = useState<ScrimmageFormat>('regional');
  const [size, setSize] = useState(FORMATS.regional.size);
  const [level, setLevel] = useState<ScrimmageLevel>('early');
  const [visualShare, setVisualShare] = useState(0.5);
  const team = useMemo(() => teamCatalog(data.packets), [data.packets]);
  const hasLevel = (l: ScrimmageLevel) => (l === 'invitational' || l === 'nationals' ? [...team.levels.values()].includes(l) : true);
  const [built, setBuilt] = useState<{ result: ScrimmageResult; questions: Map<string, Located> } | null>(null);
  const defaultTitle = (f: ScrimmageFormat) => `${f === 'regional' ? 'Scrimmage' : FORMATS[f].label} ${dateText(new Date().toISOString())}`;
  const [title, setTitle] = useState(() => defaultTitle('regional'));
  const [titleEdited, setTitleEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const build = async () => {
    setBusy(true);
    setError(null);
    try {
      const cat = catalog.data ?? (await loadCatalog());
      const heard = new Set<string>();
      for (const id of inRoom) for (const q of Object.keys(data.seen[id] ?? {})) heard.add(q);
      const pickVisual = format === 'finals-visual' ? makeVisualPicker({ photos: await loadPhotoSet(), team: data.visuals, heard }) : undefined;
      // A level also draws on uploaded packets at that level; "Any level" keeps to the DOE library.
      const rows = level === 'any' ? cat.questions : [...cat.questions, ...team.rows];
      const result = buildScrimmage(rows, { size, level, heard, format, teamLevels: team.levels, visualShare, pickVisual });
      const questions = await loadQuestions(result.pairs.flatMap((p) => (p.bonusId ? [p.tossupId, p.bonusId] : [p.tossupId])));
      setBuilt({ result, questions });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!built) return;
    const id = savePacket({
      kind: 'scrimmage',
      title: title.trim() || 'Scrimmage',
      pairs: built.result.pairs.map(({ tossupId, bonusId }) => ({ tossupId, bonusId })),
      options: { level, forPlayers: [...inRoom], size, format, ...(built.result.visualBonuses ? { visualBonuses: built.result.visualBonuses } : {}) },
    });
    navigate(`/packets/${id}`);
  };

  return (
    <section className="card stack" aria-labelledby="scrimmage-heading">
      <h2 id="scrimmage-heading">Build a scrimmage</h2>
      <p className="muted small" style={{ margin: 0 }}>
        A round of questions nobody in the room has heard, balanced across the six subjects like a DOE round.
      </p>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Who will be in the room</legend>
        <div className="row" style={{ gap: '0.25rem 1rem' }}>
          {players.map((p) => (
            <label key={p.id} className="checkbox">
              <input
                type="checkbox"
                checked={inRoom.has(p.id)}
                onChange={(e) => {
                  const next = new Set(inRoom);
                  if (e.target.checked) next.add(p.id);
                  else next.delete(p.id);
                  setInRoom(next);
                }}
              />{' '}
              {p.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="scrim-format">Format</label>
        <select
          id="scrim-format"
          value={format}
          onChange={(e) => {
            const f = e.target.value as ScrimmageFormat;
            setFormat(f);
            setSize(FORMATS[f].size);
            setBuilt(null);
            if (!titleEdited) setTitle(defaultTitle(f));
          }}
        >
          {(Object.keys(FORMATS) as ScrimmageFormat[]).map((f) => (
            <option key={f} value={f}>
              {FORMATS[f].label}
            </option>
          ))}
        </select>
        <span className="hint">{FORMATS[format].hint}</span>
      </div>
      {format === 'finals-visual' && (
        <div className="field">
          <label htmlFor="scrim-visual">Visual bonuses</label>
          <select id="scrim-visual" value={visualShare} onChange={(e) => setVisualShare(Number(e.target.value))}>
            {VISUAL_SHARES.map((v) => (
              <option key={v.share} value={v.share}>
                {v.label}
              </option>
            ))}
          </select>
          <span className="hint">
            DOE does not say how many bonuses in a visual round are visual. Each comes from the{' '}
            <a href={href('/visual')}>Visual lab</a>: your team's own visual questions, the photo set, or a generated figure, in the same subject as
            its toss-up.
          </span>
        </div>
      )}
      <div className="grid">
        <div className="field">
          <label htmlFor="scrim-size">Toss-ups</label>
          <select id="scrim-size" value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="scrim-level">Difficulty</label>
          <select id="scrim-level" value={level} onChange={(e) => setLevel(e.target.value as ScrimmageLevel)}>
            {(Object.keys(LEVEL_TEXT) as ScrimmageLevel[]).map((l) => (
              <option key={l} value={l} disabled={!hasLevel(l)}>
                {LEVEL_TEXT[l]}
                {hasLevel(l) ? '' : ' — upload one first'}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <button className="btn btn-primary" onClick={() => void build()} disabled={busy || inRoom.size === 0}>
          {busy ? 'Building…' : built ? 'Build again' : 'Build packet'}
        </button>
      </div>
      {error && <LoadError error={error} />}
      {built && (
        <>
          <p className="small">
            {built.result.pairs.length} toss-ups{format === 'tiebreak' ? '' : ' with their bonuses'}, from {built.result.sets.length} set
            {built.result.sets.length === 1 ? '' : 's'}
            {built.result.visualBonuses > 0 && `, with ${built.result.visualBonuses} visual bonuses`}.
            {built.result.heardPairs > 0
              ? ` ${built.result.heardPairs} include questions someone has heard: fresh ones at this difficulty ran out.`
              : ' Nobody in the room has heard any of them.'}
          </p>
          <ol className="small" style={{ margin: 0, paddingLeft: '1.4rem', maxHeight: '16rem', overflowY: 'auto' }}>
            {built.result.pairs.map((p) => (
              <li key={p.tossupId}>
                <SubjectTag subject={p.subject} /> {p.visual && <span className="badge">Visual bonus</span>}{' '}
                {(built.questions.get(p.tossupId)?.question.stem ?? '').slice(0, 90)}…
              </li>
            ))}
          </ol>
          <form
            className="row"
            style={{ alignItems: 'flex-end' }}
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="field" style={{ flex: '1 1 220px' }}>
              <label htmlFor="scrim-title">Packet name</label>
              <input
                id="scrim-title"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleEdited(true);
                }}
              />
            </div>
            <button className="btn btn-primary" type="submit">
              Save packet
            </button>
          </form>
        </>
      )}
    </section>
  );
}

function UploadPacket() {
  const [title, setTitle] = useState('');
  const [credit, setCredit] = useState('');
  const [level, setLevel] = useState<UploadLevel>('invitational');
  const [rounds, setRounds] = useState<ParsedRound[]>([]);
  const [leftOut, setLeftOut] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packetId] = useState(() => newId('pk'));

  const read = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const source = credit.trim() || title.trim() || 'Uploaded packet';
      const parsed: ParsedRound[] = [];
      for (const file of Array.from(files)) {
        if (/\.json$/i.test(file.name)) parsed.push(...(await parseJson(file, packetId, source)));
        else if (/\.pdf$/i.test(file.name)) parsed.push(await parsePdf(file, packetId, rounds.length + parsed.length + 1, source));
        else throw new Error(`${file.name}: choose PDF or JSON files.`);
      }
      setRounds([...rounds, ...parsed]);
      if (!title.trim() && parsed[0]) setTitle(parsed[0].fileName.replace(/\.(pdf|json)$/i, ''));
      // Questions the importer flagged as unreadable start out left out.
      const flagged = new Set(leftOut);
      for (const r of parsed)
        for (const p of r.round.pairs)
          if ([p.tossup, p.bonus].some((q) => q?.flags?.some((f) => f === 'answer-missing' || f === 'choices-missing'))) flagged.add(p.tossup.id);
      setLeftOut(flagged);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const kept = rounds.map((r) => ({ ...r.round, pairs: r.round.pairs.filter((p) => !leftOut.has(p.tossup.id)).map((p, i) => ({ ...p, number: i + 1 })) }));
  const total = kept.reduce((n, r) => n + r.pairs.length, 0);

  const save = () => {
    const name = title.trim() || 'Uploaded packet';
    const set = uploadSet(packetId, name, credit.trim() || name, kept.filter((r) => r.pairs.length > 0));
    savePacket({ id: packetId, kind: 'upload', title: name, set, level });
    navigate(`/packets/${packetId}`);
  };

  return (
    <section className="card stack" aria-labelledby="upload-heading">
      <h2 id="upload-heading">Upload a packet</h2>
      <p className="muted small" style={{ margin: 0 }}>
        An invitational's PDF (one file per round) or questions in Rebound's JSON format. Packets formatted like DOE's come in cleanly; anything
        that did not parse is flagged below. {UPLOAD_LICENSE} The packet stays in your team's data.
      </p>
      <div className="grid">
        <div className="field">
          <label htmlFor="up-title">Packet name</label>
          <input id="up-title" type="text" value={title} placeholder="e.g. MIT Invitational 2025" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="up-credit">Source and credit</label>
          <input id="up-credit" type="text" value={credit} placeholder="e.g. MIT Science Bowl Invitational, 2025" onChange={(e) => setCredit(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="up-level">How hard is it?</label>
          <select id="up-level" value={level} onChange={(e) => setLevel(e.target.value as UploadLevel)}>
            {(Object.keys(UPLOAD_LEVEL_LABEL) as UploadLevel[]).map((l) => (
              <option key={l} value={l}>
                {UPLOAD_LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
          <span className="hint">Drills and scrimmages can then aim at this level (Nationals-level for Finals practice).</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="up-files">Files</label>
        <input id="up-files" type="file" accept=".pdf,.json,application/pdf,application/json" multiple disabled={busy} onChange={(e) => void read(e.target.files)} />
      </div>
      {busy && <Loading what="Reading the files" />}
      {error && <Notice kind="error">{error}</Notice>}
      {rounds.length > 0 && (
        <>
          <h3 style={{ margin: 0 }}>Check before saving</h3>
          {rounds.map((r) => (
            <details key={r.round.id} className="card">
              <summary>
                <strong>{r.round.label}</strong> · {r.round.pairs.length} toss-ups · {r.fileName}
                {r.warnings.length > 0 && ` · ${r.warnings.length} note${r.warnings.length === 1 ? '' : 's'}`}
              </summary>
              {r.warnings.length > 0 && (
                <ul className="small">
                  {r.warnings.slice(0, 20).map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              )}
              <div className="stack">
                {r.round.pairs.map((p) => (
                  <div key={p.tossup.id}>
                    <label className="checkbox small">
                      <input
                        type="checkbox"
                        checked={!leftOut.has(p.tossup.id)}
                        onChange={(e) => {
                          const next = new Set(leftOut);
                          if (e.target.checked) next.delete(p.tossup.id);
                          else next.add(p.tossup.id);
                          setLeftOut(next);
                        }}
                      />{' '}
                      Keep pair {p.number}
                    </label>
                    <QuestionView q={p.tossup} />
                    {p.bonus && <QuestionView q={p.bonus} />}
                  </div>
                ))}
              </div>
            </details>
          ))}
          <div className="row">
            <button className="btn btn-primary" onClick={save} disabled={total === 0}>
              Save packet ({total} toss-ups)
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setRounds([]);
                setLeftOut(new Set());
              }}
            >
              Start over
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function PacketList() {
  const data = useData();
  if (data.packets.length === 0) return <p className="muted">No team packets yet.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Packet</th>
            <th>Kind</th>
            <th className="num">Toss-ups</th>
            <th>Made</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {data.packets.map((p) => (
            <tr key={p.id}>
              <td>
                <a href={href(`/packets/${p.id}`)}>{p.title}</a>
              </td>
              <td>{packetKindText(p)}</td>
              <td className="num">{p.kind === 'scrimmage' ? p.pairs?.length ?? 0 : (p.set?.rounds ?? []).reduce((n, r) => n + r.pairs.length, 0)}</td>
              <td>{dateText(p.createdAt)}</td>
              <td>
                <a className="btn btn-small" href={href(`/reader?packet=${p.id}`)}>
                  Play
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PacketsPage() {
  const data = useData();
  if (!data.team) {
    return (
      <div className="container narrow">
        <PageHeader title="Team packets" />
        <Notice>
          Set up your team first on the <a href={href('/team')}>Team</a> page.
        </Notice>
      </div>
    );
  }
  return (
    <div className="container">
      <p className="small">
        <a href={href('/library')}>Library</a> /
      </p>
      <PageHeader title="Team packets">
        <p>Scrimmages built from the library and packets you upload, ready for the Reader console or to print.</p>
      </PageHeader>
      <h2>Your packets</h2>
      <PacketList />
      <div className="grid-2" style={{ marginTop: '1.5rem' }}>
        <ScrimmageBuilder />
        <UploadPacket />
      </div>
    </div>
  );
}

export function PacketView({ id, print }: { id: string; print: boolean }) {
  const data = useData();
  const packet = data.packets.find((p) => p.id === id);
  const [roundId, setRoundId] = useState<string | null>(null);
  const rounds = packet ? packetRounds(packet) : [];
  const chosen = rounds.find((r) => r.id === roundId) ?? rounds[0];
  const round = useAsync<Round>(packet && chosen ? `${packet.id}|${chosen.id}` : null, () => packetRound(packet as TeamPacket, chosen!.id));
  const [showAnswers, setShowAnswers] = useState(true);
  const [worksheet, setWorksheet] = useState(false);
  const subjects = useMemo(() => [...new Set((round.data?.pairs ?? []).map((p) => p.tossup.subject))], [round.data]);

  useEffect(() => {
    if (print && round.data) setTimeout(() => window.print(), 300);
  }, [print, round.data]);

  if (!packet) {
    return (
      <div className="container narrow">
        <Notice kind="error">
          Packet not found on this device. <a href={href('/packets')}>Team packets</a>
        </Notice>
      </div>
    );
  }
  return (
    <div className="container">
      <p className="small no-print">
        <a href={href('/packets')}>Team packets</a> /
      </p>
      <PageHeader title={packet.title}>
        <p>
          {packet.kind === 'scrimmage' ? 'Scrimmage' : (packet.set?.credit ?? 'Uploaded packet')} · {packetKindText(packet)} · made {dateText(packet.createdAt)}
        </p>
        <div className="row no-print">
          <a className="btn btn-primary" href={href(`/reader?packet=${packet.id}`)}>
            Play in the Reader console
          </a>
          <button className="btn" onClick={() => window.print()} disabled={!round.data}>
            Print
          </button>
          <label className="checkbox">
            <input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} /> Show answers
          </label>
          {round.data?.pairs.some((p) => p.bonus && trustedFigure(p.bonus)) && (
            <label className="checkbox">
              <input type="checkbox" checked={worksheet} onChange={(e) => setWorksheet(e.target.checked)} /> Visual bonus worksheet only (figures for
              the players, as in earlier Finals elimination matches)
            </label>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (confirm(`Delete “${packet.title}”? Games already played from it keep their stats.`)) {
                deletePacket(packet.id);
                navigate('/packets');
              }
            }}
          >
            Delete packet
          </button>
        </div>
      </PageHeader>
      {rounds.length > 1 && (
        <div className="field no-print" style={{ maxWidth: '20rem' }}>
          <label htmlFor="packet-round-view">Round</label>
          <select id="packet-round-view" value={chosen?.id ?? ''} onChange={(e) => setRoundId(e.target.value)}>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {round.loading && <Loading what="Loading the questions" />}
      {round.error && <LoadError error={round.error} />}
      {round.data && (
        <>
          <div className="row no-print" style={{ gap: '0.3rem', marginBottom: '1rem' }}>
            {subjects.map((s) => (
              <SubjectTag key={s} subject={s} />
            ))}
          </div>
          {worksheet ? (
            <div className="stack worksheet">
              {round.data.pairs
                .filter((p) => p.bonus && trustedFigure(p.bonus))
                .map((p) => (
                  <section key={p.tossup.id} className="worksheet-item">
                    <h3 style={{ margin: 0 }}>Visual bonus {p.number}</h3>
                    <FigureView q={p.bonus!} />
                  </section>
                ))}
            </div>
          ) : (
            <div className="stack">
              {round.data.pairs.map((p) => (
                <div key={p.tossup.id}>
                  <QuestionView q={p.tossup} showAnswer={showAnswers} />
                  {p.bonus && <QuestionView q={p.bonus} showAnswer={showAnswers} />}
                </div>
              ))}
            </div>
          )}
          <p className="small muted" style={{ marginTop: '1.5rem' }}>
            {packet.kind === 'scrimmage'
              ? `Questions: U.S. Department of Energy, National Science Bowl sample questions (public domain)${packet.options?.visualBonuses ? '; visual bonuses from Rebound’s Visual lab (photos credited with each figure)' : ''}.`
              : `${packet.set?.credit ?? ''}. ${UPLOAD_LICENSE}`}
          </p>
        </>
      )}
    </div>
  );
}
