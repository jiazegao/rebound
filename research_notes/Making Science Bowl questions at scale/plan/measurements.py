"""Two measurements behind docs/QUESTION-PIPELINE.md. Run: python3 -I measurements.py > measurements.txt

1. How well do cheap searches find the DOE question a draft duplicates? The labelled pairs come from the
   pilot: the writer's 41 replaced drafts, its rejected candidates, and the duplicates and template
   matches the two checkers found in the final rounds. Two searches are tried: a keyword search (BM25)
   over each library question's stem, choices and answer, and the list of library questions with the
   same answer, put in the keyword search's order.
2. How often does the library use the same word answer again?"""
import json, glob, math, os, re, collections
HERE = os.path.dirname(os.path.abspath(__file__))
PILOT = os.path.join(HERE, '..', 'pilot')
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))

def norm(text):
    text = re.sub(r'\[[^\]]*\]', ' ', text.lower())
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()

STOP = set('a an the of in on at to for from by with and or is are was were be been which what that this these those following it its as into than then would will can could should does do did has have had not no one two three'.split())
def toks(text):
    return [w for w in norm(text).split() if w not in STOP and len(w) > 1]

# ---- library
lib = {}
for f in sorted(glob.glob(ROOT + '/public/data/doe/doe-*.json')):
    s = json.load(open(f))
    for r in s['rounds']:
        for p in r['pairs']:
            for q in (p['tossup'], p.get('bonus')):
                if q: lib[q['id']] = q
ids = list(lib)
def qtext(q):
    return ' '.join([q['stem']] + list((q.get('choices') or {}).values()) + [q.get('answer', '')])
docs = [toks(qtext(lib[i])) for i in ids]
N = len(docs)
df = collections.Counter()
for d in docs: df.update(set(d))
avgdl = sum(map(len, docs)) / N
inv = collections.defaultdict(list)
for n, d in enumerate(docs):
    for w, c in collections.Counter(d).items(): inv[w].append((n, c))
def bm25(query, k1=1.2, b=0.75):
    scores = collections.defaultdict(float)
    for w in set(query):
        if w not in inv: continue
        idf = math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5))
        for n, c in inv[w]:
            scores[n] += idf * c * (k1 + 1) / (c + k1 * (1 - b + b * len(docs[n]) / avgdl))
    return sorted(scores, key=scores.get, reverse=True)

# answer index: content words of the answer (short answers and the right choice's text)
ans_words = [set(toks(lib[i].get('answer', ''))) for i in ids]
ans_norm = [norm(lib[i].get('answer', '')) for i in ids]
def answer_matches(answer):
    a = set(toks(answer)); an = norm(answer)
    out = []
    if not a: return out
    for n in range(N):
        b = ans_words[n]
        if not b: continue
        if an == ans_norm[n] or a <= b or b <= a or len(a & b) * 2 >= max(len(a), len(b)):
            out.append(n)
    return out

def strip_answer_line(line):
    line = re.sub(r'^[WXYZ]\)\s*', '', line)
    return re.sub(r'\((accept|do not accept)[^)]*\)', ' ', line, flags=re.I)

# ---- labelled pairs
pairs = []  # (label, group, stem, answer, [library ids])
for e in json.load(open(PILOT + '/logs/originality-log.json')):
    pairs.append((e['id'], 'writer: replaced draft', e['oldStem'], strip_answer_line(e['oldAnswer']), [e['libraryMatch']]))
    for c in e.get('rejectedCandidates') or []:
        m = re.match(r'^(.*)\(([^()]*)\)\s*$', c['stem'].strip())
        stem, ans = (m.group(1), m.group(2)) if m else (c['stem'], '')
        pairs.append((e['id'] + '+cand', 'writer: rejected candidate', stem, ans, [c['match']]))
final = {}
gs = json.load(open(PILOT + '/generated-set.json'))
for r in gs['rounds']:
    for p in r['pairs']:
        for q in (p['tossup'], p.get('bonus')):
            if q: final[q['id']] = q
keys = {}
for lvl in ('hs', 'ms'):
    k = json.load(open(f'{PILOT}/key/key-{lvl}.json'))['key']
    for anon, v in k.items(): keys[anon] = v['originalId']
checker = {
  'M017': (['doe-ms-09-r05-t17'], 'checker: same answer and cue'),
  'M052': (['doe-ms-16-r09-b18'], 'checker: same answer and cue'),
  'M051': (['doe-hs-03-r08-b06'], 'checker: same answer and cue'),
  'M031': (['doe-ms-14-r07-t06', 'doe-ms-01-r03-t20', 'doe-ms-10-r11-t06'], 'checker: same template'),
  'M009': (['doe-ms-07-r05-b01'], 'checker: same template'),
  'M044': (['doe-ms-02-r01-t13'], 'checker: same template'),
  'M050': (['doe-ms-08-r03-t14'], 'checker: same template'),
  'H038': (['doe-ms-16-r05-t01'], 'checker: same template'),
  'H006': (['doe-hs-14-r03-b06', 'doe-ms-14-r15-b01'], 'checker: same template'),
  'H027': (['doe-ms-05-r15-t06', 'doe-ms-03-r10-b03'], 'checker: same template'),
  'H042': (['doe-ms-13-r01-b17'], 'checker: same template'),
}
for anon, (targets, group) in checker.items():
    q = final[keys[anon]]
    pairs.append((anon, group, q['stem'] + ' ' + ' '.join((q.get('choices') or {}).values()), q.get('answer', ''), targets))

idx = {i: n for n, i in enumerate(ids)}
rows = []
for label, group, stem, ans, targets in pairs:
    tn = [idx[t] for t in targets if t in idx]
    if not tn: print('left out (the log names no single matching id):', label, targets); continue
    rank_stem = bm25(toks(stem))
    rank_both = bm25(toks(stem + ' ' + ans))
    am = answer_matches(ans)
    def best(rank):
        pos = [rank.index(t) + 1 for t in tn if t in rank]
        return min(pos) if pos else 10**9
    # answer matches ordered by the stem's BM25 order
    order = {n: r for r, n in enumerate(rank_both)}
    am_sorted = sorted(am, key=lambda n: order.get(n, 10**9))
    am_rank = min([am_sorted.index(t) + 1 for t in tn if t in am_sorted] or [10**9])
    rows.append(dict(label=label, group=group, stem=best(rank_stem), both=best(rank_both), in_answer=any(t in am for t in tn), n_answer=len(am), am_rank=am_rank))

def recall(rows, key, k): return sum(1 for r in rows if r[key] <= k)
groups = collections.OrderedDict()
for r in rows: groups.setdefault(r['group'], []).append(r)
groups['ALL'] = rows
print(f'library questions: {N}; labelled drafts: {len(rows)}')
for g, rs in groups.items():
    print(f'\n== {g} (n={len(rs)})')
    for k in (5, 10, 20, 50):
        u = sum(1 for r in rs if r['both'] <= k or r['am_rank'] <= k)
        print(f'  top {k:>2}: stem-only BM25 {recall(rs,"stem",k):>2} | stem+answer BM25 {recall(rs,"both",k):>2} | same-answer list (BM25 order) {recall(rs,"am_rank",k):>2} | either list {u:>2}')
    print('  match is in the same-answer list at any depth:', sum(r['in_answer'] for r in rs), '| median size of that list:', sorted(r['n_answer'] for r in rs)[len(rs)//2])
miss = [r for r in rows if not (r['both'] <= 20 or r['am_rank'] <= 20)]
print('\nnot found in top 20 of either list:', [(r['label'], r['group'], r['both'], r['am_rank']) for r in miss])

# ---- 2. how often word answers recur
def answer_key(t):
    t = re.sub(r'\[[^\]]*\]', ' ', t.lower()).strip()
    t = re.sub(r'^(the|a|an)\s+', '', t)
    return re.sub(r'[^a-z0-9]+', ' ', t).strip()
levels = {}
for f in sorted(glob.glob(ROOT + '/public/data/doe/doe-*.json')):
    s = json.load(open(f))
    for r in s['rounds']:
        for p in r['pairs']:
            for q in (p['tossup'], p.get('bonus')):
                if q: levels.setdefault(s['level'], []).append(q)
print('\n== word answers used more than once (short-answer questions; numbers and list answers left out)')
for lvl in ('HS', 'MS'):
    sa = [q for q in levels[lvl] if q['format'] == 'short_answer' and q.get('answer', '').strip()]
    def is_number(a): return bool(re.search(r'\d', a)) and bool(re.fullmatch(r'[\d\s.,/+\-−–πx()^%:]*(and|to|only)?[\d\s.,/+\-−–πx()^%:]*', a))
    def is_list(a): return bool(re.fullmatch(r'(all|none|[123 ,and]+)( of them)?', a))
    words = [answer_key(q['answer']) for q in sa]
    words = [a for a in words if a and not is_number(a) and not is_list(a)]
    c = collections.Counter(words); n = len(words)
    share = lambda k: 100 * sum(v for v in c.values() if v >= k) / n
    print(f'  {lvl}: {n} questions, {len(c)} different answers; answer used 2+ times: {share(2):.0f}% of questions, 3+: {share(3):.0f}%, 5+: {share(5):.0f}%')
    print('     most used:', ', '.join(f'{a} ({v})' for a, v in c.most_common(12)))
