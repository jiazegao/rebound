import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WORKSPACE_VARIABLE } from './llm';
import { rememberWorkspace, workspaceId } from './workspace';

const dir = mkdtempSync(path.join(tmpdir(), 'rebound-workspace-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('the workspace an organization’s key is used in', () => {
  it('is read from the variable first, then from where the key check remembered it', () => {
    const before = process.env[WORKSPACE_VARIABLE];
    delete process.env[WORKSPACE_VARIABLE];
    try {
      const remembered = path.join(dir, 'workspace.json');
      expect(workspaceId(remembered)).toBeNull();
      rememberWorkspace({ id: 'wrkspc_remembered', name: 'Default' }, remembered);
      expect(workspaceId(remembered)).toBe('wrkspc_remembered');
      expect(JSON.parse(readFileSync(remembered, 'utf8'))).toMatchObject({ id: 'wrkspc_remembered', name: 'Default' });
      process.env[WORKSPACE_VARIABLE] = ' wrkspc_named ';
      expect(workspaceId(remembered)).toBe('wrkspc_named');
      delete process.env[WORKSPACE_VARIABLE];
      writeFileSync(remembered, 'not json');
      expect(workspaceId(remembered)).toBeNull();
    } finally {
      if (before === undefined) delete process.env[WORKSPACE_VARIABLE];
      else process.env[WORKSPACE_VARIABLE] = before;
    }
  });
});
