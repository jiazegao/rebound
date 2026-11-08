/**
 * AI help through the real Worker and the user's Durable Object, with the Claude API replaced by a fake `fetch`
 * (the SDK sends its requests through it). Checks the request shape, the daily limit per user, the explanation
 * cache, and that calls which never reached the model are not counted.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { aiSettings, setAiTestOverrides } from '../src/ai';
import { call, makeTeam, signUp, type Json } from './helpers';

const PASSAGE = `Mitochondria are membrane-bound organelles found in most eukaryotic cells. They carry out aerobic respiration, making most of the cell's ATP. The inner membrane is folded into cristae, which increase the surface area available for the electron transport chain. Mitochondria have their own circular DNA, which supports the endosymbiotic theory: they descend from bacteria that were engulfed by an ancestral cell.`;

interface Seen {
  url: string;
  headers: Headers;
  body: Json;
}

type Reply = { status?: number; json: Json };

/** A fake Claude API. `reply` answers each request from its system prompt; every request is recorded in `seen`. */
function fakeApi(reply: (body: Json) => Reply) {
  const seen: Seen[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const body = await request.json();
    seen.push({ url: request.url, headers: request.headers, body });
    const r = reply(body);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
  }) as typeof fetch;
  return { seen, fetchFn };
}

const message = (body: Json, value: unknown, stop = 'end_turn'): Reply => ({
  json: {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: body.model,
    content: stop === 'refusal' ? [] : [{ type: 'text', text: JSON.stringify(value) }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  },
});

const system = (body: Json): string => (typeof body.system === 'string' ? body.system : JSON.stringify(body.system));

/** Drafts two questions; the blind check answers the first right and the second wrong. */
function standardReply(body: Json): Reply {
  const s = system(body);
  if (s.includes('You write practice questions')) {
    return message(body, {
      questions: [
        {
          kind: 'tossup',
          format: 'short_answer',
          stem: 'What folded structures of the inner mitochondrial membrane increase the area for the electron transport chain?',
          choices: [],
          answerLetter: '',
          answer: 'CRISTAE',
          accept: ['CRISTA'],
          support: 'The inner membrane is folded into cristae, which increase the surface area available for the electron transport chain.',
        },
        {
          kind: 'bonus',
          format: 'multiple_choice',
          stem: 'Which of the following supports the endosymbiotic theory?',
          choices: ['Mitochondria have circular DNA', 'Mitochondria lack membranes', 'Mitochondria make glucose', 'Mitochondria are found only in plants'],
          answerLetter: 'W',
          answer: 'Mitochondria have circular DNA',
          accept: [],
          support: 'Mitochondria have their own circular DNA, which supports the endosymbiotic theory.',
        },
      ],
    });
  }
  if (s.includes('strong National Science Bowl player')) {
    const user = String(body.messages[0].content);
    return message(body, { answer: user.includes('folded structures') ? 'cristae' : 'X) Mitochondria lack membranes' });
  }
  if (s.includes('You explain')) return message(body, { explanation: 'Cristae are folds of the inner membrane that add surface area.', answerLooksWrong: false });
  if (s.includes('concept cards')) return message(body, { summary: 'Mitochondria make most of the cell’s ATP.', facts: ['Cristae add surface area', 'They have circular DNA'], traps: 'Not the same as chloroplasts.' });
  return { status: 400, json: { type: 'error', error: { type: 'invalid_request_error', message: 'unexpected test request' } } };
}

const draftBody = (over: Record<string, unknown> = {}) => ({ passage: PASSAGE, source: 'NIH National Human Genome Research Institute, Mitochondria', subject: 'biology', kind: 'either', count: 2, ...over });

afterEach(() => setAiTestOverrides({}));

describe('AI help', () => {
  it('is off without an API key', async () => {
    const user = await signUp('Ida');
    const status = await call('/api/ai', { token: user.token });
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ enabled: false });
    const draft = await call('/api/ai/draft', { token: user.token, body: draftBody() });
    expect(draft.status).toBe(404);
    expect(draft.body.error).toBe('AI help is not turned on for this server.');
  });

  it('needs a signed-in user', async () => {
    const { fetchFn, seen } = fakeApi(standardReply);
    setAiTestOverrides({ apiKey: 'sk-test', fetch: fetchFn });
    expect((await call('/api/ai')).status).toBe(401);
    expect((await call('/api/ai/draft', { body: draftBody() })).status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  it('drafts questions from a passage with a blind answer check, and counts the calls', async () => {
    const { fetchFn, seen } = fakeApi(standardReply);
    setAiTestOverrides({ apiKey: 'sk-test', fetch: fetchFn });
    const max = await signUp('Max');

    const status = await call('/api/ai', { token: max.token });
    expect(status.body).toEqual({ enabled: true, model: 'claude-opus-5-5', dailyLimit: 50, usedToday: 0 });

    const res = await call('/api/ai/draft', { token: max.token, body: draftBody() });
    expect(res.status).toBe(200);
    expect(res.body.model).toBe('claude-opus-5-5');
    expect(res.body.drafts).toHaveLength(2);
    const [first, second] = res.body.drafts;
    expect(first).toMatchObject({ kind: 'tossup', format: 'short_answer', answer: 'CRISTAE', accept: ['CRISTA'], blindAnswer: 'cristae', blindAgreed: true });
    expect(second).toMatchObject({
      kind: 'bonus',
      format: 'multiple_choice',
      answerLetter: 'W',
      answer: 'Mitochondria have circular DNA',
      choices: { W: 'Mitochondria have circular DNA', X: 'Mitochondria lack membranes', Y: 'Mitochondria make glucose', Z: 'Mitochondria are found only in plants' },
      blindAgreed: false,
    });
    // One drafting call and one blind check per draft.
    expect(res.body.usedToday).toBe(3);
    expect(seen).toHaveLength(3);

    // The request: current model, server-side refusal fallback, structured output, effort; no thinking settings.
    const draftCall = seen.find((s) => system(s.body).includes('You write practice questions'))!;
    expect(draftCall.url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages/);
    expect(draftCall.headers.get('authorization')).toBe('Bearer sk-test');
    expect(draftCall.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(draftCall.body).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 16000, fallbacks: 'default', output_config: { effort: 'high', format: { type: 'json_schema' } } });
    expect(draftCall.body.thinking).toBeUndefined();
    expect(system(draftCall.body)).toContain('high school');
    expect(draftCall.body.messages[0].content).toContain('NIH National Human Genome Research Institute, Mitochondria');
    // The blind check sees the question but neither the key nor the passage.
    const blind = seen.filter((s) => system(s.body).includes('strong National Science Bowl player'));
    expect(blind).toHaveLength(2);
    for (const b of blind) {
      expect(b.body.messages[0].content).not.toContain('CRISTAE');
      expect(b.body.messages[0].content).not.toContain('endosymbiotic theory: they descend');
      expect(b.body.output_config.effort).toBe('medium');
    }
  });

  it('writes for middle school on a middle school team', async () => {
    const { fetchFn, seen } = fakeApi(standardReply);
    setAiTestOverrides({ apiKey: 'sk-test', fetch: fetchFn });
    const user = await signUp('Mia');
    await makeTeam(user, { level: 'MS' });
    const res = await call('/api/ai/draft', { token: user.token, body: draftBody({ count: 1 }) });
    expect(res.status).toBe(200);
    expect(system(seen[0]!.body)).toContain('middle school');
  });

  it('checks the request before calling the model', async () => {
    const { fetchFn, seen } = fakeApi(standardReply);
    setAiTestOverrides({ apiKey: 'sk-test', fetch: fetchFn });
    const user = await signUp('Nell');
    const draft = (over: Record<string, unknown>) => call('/api/ai/draft', { token: user.token, body: draftBody(over) });
    expect((await draft({ passage: 'Too short.' })).body.error).toMatch(/Paste a passage of 200/);
    expect((await draft({ passage: 'x'.repeat(12_001) })).status).toBe(400);
    expect((await draft({ source: '  ' })).body.error).toMatch(/where the passage comes from/);
    expect((await draft({ source: 'OpenStax Biology 2e, 4.3' })).body.error).toMatch(/OpenStax's license/);
    expect((await draft({ subject: 'toString' })).body.error).toBe('Choose a subject.');
    expect((await draft({ count: 6 })).body.error).toMatch(/1 to 5/);
    expect((await draft({ kind: 'lightning' })).status).toBe(400);
    const explain = await call('/api/ai/explain', { token: user.token, body: { stem: 'Q?', answer: 'A', choices: { W: 'a', X: 'b' } } });
    expect(explain.body.error).toMatch(/Each choice/);
    expect(seen).toHaveLength(0);
    expect((await call('/api/ai', { token: user.token })).body.usedToday).toBe(0);
  });

  it('explains an answer once and serves the user from their cache after that', async () => {
    const { fetchFn, seen } = fakeApi(standardReply);
    setAiTestOverrides({ apiKey: 'sk-test', fetch: fetchFn });
    const user = await signUp('Ora');
    const body = { subject: 'biology', stem: 'What folds of the inner mitochondrial membrane increase its surface area?', answer: 'CRISTAE' };
    const first = await call('/api/ai/explain', { token: user.token, body });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ explanation: expect.stringContaining('Cristae'), answerLooksWrong: false, model: 'claude-opus-5-5', cached: false, usedToday: 1 });
    expect(seen[0]!.body.output_config.effort).toBe('medium');

    const again = await call('/api/ai/explain', { token: user.token, body });
    expect(again.body).toMatchObject({ explanation: first.body.explanation, cached: true, usedToday: 1 });
    expect(seen).toHaveLength(1);

    // The cache and the limit are each user's own.
    const other = await signUp('Pat');
    const theirs = await call('/api/ai/explain', { token: other.token, body });
    expect(theirs.body).toMatchObject({ cached: false, usedToday: 1 });
    expect(seen).toHaveLength(2);
  });

  it('drafts a concept card from a passage', async () => {
    const { fetchFn } = fakeApi(standardReply);
    setAiTestOverrides({ apiKey: 'sk-test', fetch: fetchFn });
    const user = await signUp('Quy');
    const res = await call('/api/ai/card', { token: user.token, body: { concept: 'Mitochondria', passage: PASSAGE, source: 'NIH NHGRI, Mitochondria' } });
    expect(res.status).toBe(200);
    expect(res.body.card).toEqual({ summary: 'Mitochondria make most of the cell’s ATP.', facts: ['Cristae add surface area', 'They have circular DNA'], traps: 'Not the same as chloroplasts.' });
    expect(res.body.usedToday).toBe(1);
  });

  it('keeps to the daily limit', async () => {
    const { fetchFn, seen } = fakeApi(standardReply);
    setAiTestOverrides({ apiKey: 'sk-test', dailyLimit: 4, fetch: fetchFn });
    const user = await signUp('Ria');
    const ok = await call('/api/ai/draft', { token: user.token, body: draftBody({ count: 2 }) });
    expect(ok.body.usedToday).toBe(3);
    const tooMany = await call('/api/ai/draft', { token: user.token, body: draftBody({ count: 2 }) });
    expect(tooMany.status).toBe(429);
    expect(tooMany.body.error).toBe('That needs 3 AI calls, and you have 1 left today. Ask for fewer, or wait until midnight UTC.');
    expect(Number(tooMany.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(seen).toHaveLength(3);
    const card = await call('/api/ai/card', { token: user.token, body: { concept: 'Mitochondria', passage: PASSAGE, source: 'NIH NHGRI' } });
    expect(card.body.usedToday).toBe(4);
    const none = await call('/api/ai/card', { token: user.token, body: { concept: 'Mitochondria', passage: PASSAGE, source: 'NIH NHGRI' } });
    expect(none.body.error).toBe("You have used today's 4 AI calls. They start again at midnight UTC.");
  });

  it('counts a refusal, but not a call that never reached the model', async () => {
    let mode: 'refuse' | 'bad-key' = 'refuse';
    const { fetchFn } = fakeApi((body) =>
      mode === 'refuse'
        ? message(body, null, 'refusal')
        : { status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } },
    );
    setAiTestOverrides({ apiKey: 'sk-test', fetch: fetchFn });
    const user = await signUp('Sam');
    const refused = await call('/api/ai/draft', { token: user.token, body: draftBody({ count: 3 }) });
    expect(refused.status).toBe(422);
    expect(refused.body.error).toBe('The AI model declined this request.');
    // The drafting call ran; the three blind checks it reserved never did.
    expect((await call('/api/ai', { token: user.token })).body.usedToday).toBe(1);

    mode = 'bad-key';
    const failed = await call('/api/ai/explain', { token: user.token, body: { stem: 'What is the powerhouse of the cell?', answer: 'MITOCHONDRION' } });
    expect(failed.status).toBe(503);
    expect(failed.body.error).toBe("The server's AI key is not working. Ask whoever runs the server to check it.");
    expect((await call('/api/ai', { token: user.token })).body.usedToday).toBe(1);
  });

  it('turns a reply in the wrong form into a plain error', async () => {
    const { fetchFn } = fakeApi((body) => ({ json: { ...message(body, {}).json, content: [{ type: 'text', text: 'not json' }] } }));
    setAiTestOverrides({ apiKey: 'sk-test', fetch: fetchFn });
    const user = await signUp('Tia');
    const res = await call('/api/ai/card', { token: user.token, body: { concept: 'Mitochondria', passage: PASSAGE, source: 'NIH NHGRI' } });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('The AI reply was not in the expected form. Try again.');
  });

  it('sends no fallback settings to a model without a server-side fallback', async () => {
    const { fetchFn, seen } = fakeApi(standardReply);
    setAiTestOverrides({ apiKey: 'sk-test', fetch: fetchFn, model: 'claude-haiku-5-5' });
    const user = await signUp('Uri');
    const res = await call('/api/ai/card', { token: user.token, body: { concept: 'Mitochondria', passage: PASSAGE, source: 'NIH NHGRI' } });
    expect(res.body.model).toBe('claude-haiku-5-5');
    expect(seen[0]!.body.model).toBe('claude-haiku-5-5');
    expect(seen[0]!.body.fallbacks).toBeUndefined();
    expect(seen[0]!.headers.get('anthropic-beta') ?? '').not.toContain('server-side-fallback');
  });

  it('reads its settings from the environment', () => {
    expect(aiSettings({} as Env)).toBeNull();
    expect(aiSettings({ ANTHROPIC_API_KEY: 'k' } as Env)).toEqual({ apiKey: 'k', model: 'claude-opus-5-5', checkModel: 'claude-opus-5-5', dailyLimit: 50 });
    expect(aiSettings({ ANTHROPIC_API_KEY: 'k', AI_MODEL: ' claude-sonnet-5-5 ', AI_CHECK_MODEL: 'claude-opus-5-5', AI_DAILY_LIMIT: '200' } as Env)).toEqual({
      apiKey: 'k',
      model: 'claude-sonnet-5-5',
      checkModel: 'claude-opus-5-5',
      dailyLimit: 200,
    });
    expect(aiSettings({ ANTHROPIC_API_KEY: 'k', AI_DAILY_LIMIT: 'lots' } as Env)?.dailyLimit).toBe(50);
  });
});
