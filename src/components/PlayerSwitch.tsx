import { href } from '../lib/router';
import { updateSettings, useData } from '../lib/store';

/** "Practicing as" picker. The choice is remembered on this device (shared laptops can switch). */
export function PlayerSwitch({ label = 'Practicing as' }: { label?: string }) {
  const data = useData();
  const players = data.players.filter((p) => p.active);
  const current = players.find((p) => p.id === data.settings.soloPlayerId) ?? null;
  if (players.length === 0) {
    return (
      <p className="muted small">
        No players yet. Add players on the <a href={href('/team')}>Team</a> page.
      </p>
    );
  }
  return (
    <div className="field player-switch">
      <label htmlFor="player-switch">{label}</label>
      <select id="player-switch" value={current?.id ?? ''} onChange={(e) => updateSettings({ soloPlayerId: e.target.value || null })}>
        <option value="">Choose your name</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The selected player, if they are still on the team. */
export function useCurrentPlayer() {
  const data = useData();
  return data.players.find((p) => p.active && p.id === data.settings.soloPlayerId) ?? null;
}
