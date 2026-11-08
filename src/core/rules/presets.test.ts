import { describe, expect, it } from 'vitest';
import { CURRENT_PRESET_IDS, CURRENT_RULES_URL, CURRENT_SEASON, currentPresets, DEFAULT_PRESET_ID, getPreset, PRESETS } from './presets';

describe('rule presets', () => {
  it('point at this season’s official presets (update these together each fall)', () => {
    for (const id of Object.values(CURRENT_PRESET_IDS)) {
      expect(getPreset(id).season).toBe(CURRENT_SEASON);
      expect(getPreset(id).official).toBe(true);
    }
    expect(DEFAULT_PRESET_ID).toBe(CURRENT_PRESET_IDS.regional);
    expect(CURRENT_RULES_URL).toContain(`Rules${CURRENT_SEASON}`);
    expect(currentPresets().map((p) => p.id)).toEqual(expect.arrayContaining(Object.values(CURRENT_PRESET_IDS)));
  });

  it('have unique ids', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
});
