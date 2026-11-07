/**
 * Team packets in play: turning a scrimmage (library question ids) or an uploaded packet (its own
 * questions) into a Round the Reader console and the print view can use.
 */
import type { Round, TeamPacket } from '../core/schema';
import { findRound, loadQuestions, loadSetById } from './library';
import { getData, type GameRecord } from './store';

/** Set id used for a team packet, in games and question ids. */
export const teamSetId = (packetId: string) => `team-${packetId}`;

export function isTeamSet(setId: string): boolean {
  return setId.startsWith('team-');
}

/** The rounds a packet can be played as (a scrimmage is one round). */
export function packetRounds(p: TeamPacket): Array<{ id: string; label: string }> {
  if (p.kind === 'upload') return (p.set?.rounds ?? []).map((r) => ({ id: r.id, label: r.label }));
  return [{ id: `${teamSetId(p.id)}-r01`, label: p.title }];
}

/** A packet's round, with questions numbered in packet order (ids stay those of the library, for stats). */
export async function packetRound(p: TeamPacket, roundId?: string): Promise<Round> {
  if (p.kind === 'upload') {
    const round = p.set?.rounds.find((r) => r.id === roundId) ?? p.set?.rounds[0];
    if (!round) throw new Error('This packet has no rounds.');
    return round;
  }
  const pairs = p.pairs ?? [];
  const found = await loadQuestions(pairs.flatMap((x) => (x.bonusId ? [x.tossupId, x.bonusId] : [x.tossupId])));
  const out: Round['pairs'] = [];
  for (const x of pairs) {
    const t = found.get(x.tossupId);
    if (!t) continue;
    const number = out.length + 1;
    const b = x.bonusId ? found.get(x.bonusId) : undefined;
    out.push({ number, tossup: { ...t.question, number }, bonus: b ? { ...b.question, number } : undefined });
  }
  if (out.length === 0) throw new Error('The questions in this packet could not be loaded.');
  return { id: `${teamSetId(p.id)}-r01`, label: p.title, order: 1, pairs: out };
}

/** The round a game is played from: a DOE round or a team packet. */
export async function loadGameRound(packet: GameRecord['packet']): Promise<Round> {
  if (isTeamSet(packet.setId)) {
    const p = getData().packets.find((x) => teamSetId(x.id) === packet.setId);
    if (!p) throw new Error('This game uses a team packet that is not on this device (it may have been deleted).');
    return packetRound(p, packet.roundId);
  }
  const set = await loadSetById(packet.setId);
  const round = findRound(set, packet.roundId);
  if (!round) throw new Error("This game's round is missing from the library.");
  return round;
}
