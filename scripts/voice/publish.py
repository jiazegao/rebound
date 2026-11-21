#!/usr/bin/env python3
"""
Puts Rebound's recorded voice online (scripts/voice/README.md, "6. Publish"), from the recordings `generate` made.

  python scripts/voice/kokoro_voice.py publish [--out voice/audio] [--hosts 2] [--account ID] [--dry-run]

1. Lists the recordings the site needs now: it runs export-library.ts afresh, so the list always matches the library
   and how the site says each question. A recording missing from voice/audio stops it (run export and generate).
2. Measures each recording: its length from its MP3 frames (as a browser plays it) and a fingerprint of its bytes.
3. Uploads them as the files of small Cloudflare Workers that only serve files: rebound-voice-1 has the names that
   start with 0 to 7, rebound-voice-2 those from 8 to f (a free Worker holds at most 20,000 files). Each upload sends
   only files that are new or changed. It needs wrangler (npm ci in server/) and a sign-in: wrangler login.
4. Fetches a few recordings back from each Worker and compares them with the originals.
5. Writes the site's index of the recordings, public/data/voice/: index.json (the voice, the Workers' addresses, the
   sample line) and one file per set of questions, each recording's name with its length and fingerprint. Commit
   these: the site plays a question only when its recording is listed there.

Every recording's address ends with ?v=<fingerprint>, so browsers keep a file for good and fetch it again only when it
was made again (after fixing how a word is said). Only the Python standard library is used, plus Node for the export
and for wrangler.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
LIBRARY = ROOT / 'public' / 'data' / 'doe'
INDEX_DIR = ROOT / 'public' / 'data' / 'voice'
WORKER_PREFIX = 'rebound-voice-'
# A Worker on Cloudflare's free plan serves at most 20,000 files.
MAX_FILES = 20_000
SAMPLE_ID = 'sample'
COMPATIBILITY_DATE = '2026-10-01'
HEADERS = """# Rebound's recorded voice (scripts/voice/publish.py). Every address carries ?v=<fingerprint of the file>, so a
# file can be kept for good: a recording made again gets a new address.
/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=31536000, immutable
  X-Content-Type-Options: nosniff
"""


# ---------------- MP3 ----------------

# Bit rates (kbit/s) by index: MPEG-1 Layer III, and MPEG-2 and 2.5 Layer III. The same reading of frames as the
# server's used to (server/src/tts.ts, mp3DurationMs before the recorded voice): what a browser plays.
BITRATES_V1 = (0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320)
BITRATES_V2 = (0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160)
SAMPLE_RATES = {3: (44100, 48000, 32000), 2: (22050, 24000, 16000), 0: (11025, 12000, 8000)}


def mp3_duration_ms(data: bytes) -> int | None:
    """The length of an MP3 (Layer III) in ms, from its frames; None when it holds no frames."""
    i = 0
    if len(data) > 10 and data[:3] == b'ID3':  # skip an ID3v2 tag
        i = 10 + (((data[6] & 0x7F) << 21) | ((data[7] & 0x7F) << 14) | ((data[8] & 0x7F) << 7) | (data[9] & 0x7F))
    seconds = 0.0
    frames = 0
    n = len(data)
    while i + 4 <= n:
        b1 = data[i + 1]
        b2 = data[i + 2]
        if data[i] != 0xFF or (b1 & 0xE0) != 0xE0:
            i += 1
            continue
        version = (b1 >> 3) & 3  # 3: MPEG-1, 2: MPEG-2, 0: MPEG-2.5
        layer = (b1 >> 1) & 3  # 1: Layer III
        bitrate_index = (b2 >> 4) & 15
        rate_index = (b2 >> 2) & 3
        bitrate = (BITRATES_V1 if version == 3 else BITRATES_V2)[bitrate_index] if bitrate_index < 15 else 0
        rate = SAMPLE_RATES[version][rate_index] if version in SAMPLE_RATES and rate_index < 3 else 0
        if layer != 1 or version == 1 or not bitrate or not rate:
            i += 1
            continue
        padding = (b2 >> 1) & 1
        samples = 1152 if version == 3 else 576
        seconds += samples / rate
        frames += 1
        i += (samples // 8 * bitrate * 1000) // rate + padding
    return int(seconds * 1000 + 0.5) if frames else None


def fingerprint(data: bytes) -> str:
    """Eight hex characters of the file's SHA-256: a recording made again gets a new one (and a new address)."""
    return hashlib.sha256(data).hexdigest()[:8]


# ---------------- which Worker serves a recording ----------------


def host_of(key: str, count: int) -> int:
    """
    Which of `count` Workers serves a recording, by the first character of its name: with two, 0 to 7 go to the first
    and 8 to f to the second. The site does the same (src/lib/voice.ts, hostOf).
    """
    return int(key[0], 16) * count // 16


def worker_name(n: int) -> str:
    return f'{WORKER_PREFIX}{n + 1}'


# ---------------- the list of recordings ----------------


def set_id_of(question_id: str) -> str | None:
    """A question's set ("doe-hs-06-r09-t06" is in "doe-hs-06"), as the site works it out (src/core/drill.ts)."""
    m = re.fullmatch(r'(.+)-r\d+[a-z]*-[tb]\d+', question_id, re.IGNORECASE)
    return m.group(1) if m else None


def tool(path: Path, setup: str) -> Path:
    if not path.exists():
        sys.exit(f'{path} is missing: {setup}')
    return path


def node() -> str:
    found = shutil.which('node')
    if not found:
        sys.exit('Node.js is needed (nodejs.org, version 22): it runs the export and wrangler.')
    return found


def fresh_jobs() -> tuple[dict, list[dict]]:
    """The recordings the site needs now: export-library.ts run afresh, into a temporary file."""
    tsx = tool(ROOT / 'node_modules' / 'tsx' / 'dist' / 'cli.mjs', 'run  npm ci  in the repository first.')
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / 'jobs.jsonl'
        result = subprocess.run(
            [node(), str(tsx), str(HERE / 'export-library.ts'), '--out', str(out)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
        )
        if result.returncode != 0 or not out.exists():
            sys.exit(f'The export failed:\n{result.stdout}{result.stderr}')
        rows = [json.loads(line) for line in out.read_text(encoding='utf-8').splitlines() if line.strip()]
    meta = next((r['meta'] for r in rows if 'meta' in r), None)
    jobs = [r for r in rows if 'meta' not in r]
    if not meta:
        sys.exit('The export wrote no list.')
    return meta, jobs


def measure(jobs: list[dict], audio: Path) -> dict[str, dict]:
    """Each recording's length and fingerprint, read from its file. Stops if any is missing or unreadable."""
    missing = [j for j in jobs if not (audio / f"{j['key']}.mp3").exists()]
    if missing:
        sys.exit(
            f'{len(missing):,} of {len(jobs):,} recordings are not in {audio} (for example {missing[0]["ids"][0]}). The library or how it '
            'is said has changed since they were made: run  npx tsx scripts/voice/export-library.ts  and then '
            '  python scripts/voice/kokoro_voice.py generate, then publish again.'
        )
    found: dict[str, dict] = {}
    bad: list[str] = []
    for n, job in enumerate(jobs, 1):
        path = audio / f"{job['key']}.mp3"
        data = path.read_bytes()
        ms = mp3_duration_ms(data)
        if not ms or ms < 300:
            bad.append(path.name)
            continue
        found[job['key']] = {'ms': ms, 'v': fingerprint(data), 'bytes': len(data), 'path': path, 'ids': job['ids']}
        if n % 5000 == 0:
            print(f'  measured {n:,} of {len(jobs):,}', flush=True)
    if bad:
        sys.exit(f'{len(bad)} recordings are empty or not MP3 audio (for example {bad[0]}): delete them and run generate again.')
    return found


# ---------------- the Workers ----------------


def stage(found: dict[str, dict], count: int, root: Path) -> list[Path]:
    """
    One folder for each Worker: its configuration, and its files (links to the recordings, or copies where a link
    cannot be made), with the _headers that let the site fetch them and browsers keep them.
    """
    folders = []
    groups: list[list[str]] = [[] for _ in range(count)]
    for key in sorted(found):
        groups[host_of(key, count)].append(key)
    for n, keys in enumerate(groups):
        if len(keys) > MAX_FILES:
            sys.exit(f'{worker_name(n)} would hold {len(keys):,} files, more than the {MAX_FILES:,} a free Worker can: publish with --hosts {count + 1}.')
        folder = root / worker_name(n)
        files = folder / 'files'
        if files.exists():
            shutil.rmtree(files)  # a recording no longer needed is no longer uploaded
        files.mkdir(parents=True)
        for key in keys:
            target = files / f'{key}.mp3'
            try:
                os.link(found[key]['path'], target)
            except OSError:
                shutil.copyfile(found[key]['path'], target)
        (files / '_headers').write_text(HEADERS, encoding='utf-8')
        config = {
            'name': worker_name(n),
            'compatibility_date': COMPATIBILITY_DATE,
            'workers_dev': True,
            'assets': {'directory': './files'},
        }
        (folder / 'wrangler.json').write_text(json.dumps(config, indent=2) + '\n', encoding='utf-8')
        folders.append(folder)
    return folders


def wrangler_command() -> list[str]:
    """How to run wrangler: REBOUND_WRANGLER (tests), or the server's copy (npm ci in server/)."""
    override = os.environ.get('REBOUND_WRANGLER')
    if override:
        return override.split()
    script = tool(ROOT / 'server' / 'node_modules' / 'wrangler' / 'bin' / 'wrangler.js', 'run  npm ci  in the server folder first.')
    return [node(), str(script)]


def deploy(folder: Path, account: str | None) -> str:
    """Uploads one Worker's files (only those new or changed) and gives back its address."""
    env = dict(os.environ, FORCE_COLOR='0', CI='1')
    if account:
        env['CLOUDFLARE_ACCOUNT_ID'] = account
    name = folder.name
    print(f'\nUploading {name} (only new or changed files)...', flush=True)
    process = subprocess.Popen(
        [*wrangler_command(), 'deploy', '--config', str(folder / 'wrangler.json')],
        cwd=folder,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding='utf-8',
        errors='replace',
    )
    lines = []
    assert process.stdout is not None
    for line in process.stdout:
        lines.append(line)
        print('  ' + line.rstrip(), flush=True)
    process.wait()
    output = ''.join(lines)
    if process.returncode != 0:
        if re.search(r'not logged in|wrangler login|authenticat|API[ _]TOKEN', output, re.IGNORECASE):
            sys.exit('wrangler is not signed in to Cloudflare: run  cd server; npx wrangler login  once, then publish again.')
        if re.search(r'more than one account', output, re.IGNORECASE):
            sys.exit('Your Cloudflare sign-in has more than one account: publish again with --account <account ID> (wrangler whoami lists them).')
        sys.exit(f'Uploading {name} failed (above).')
    found = re.search(rf'https://{re.escape(name)}\.[a-z0-9-]+\.workers\.dev', output)
    if not found:
        sys.exit(f'{name} was uploaded, but wrangler showed no workers.dev address for it. Turn on its workers.dev route in the Cloudflare dashboard (Workers, {name}, Settings), then publish again.')
    return found.group(0)


def fetch(url: str) -> tuple[int, dict[str, str], bytes]:
    request = urllib.request.Request(url, headers={'User-Agent': 'rebound-voice-publish'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, {k.lower(): v for k, v in response.headers.items()}, response.read()
    except urllib.error.HTTPError as error:
        return error.code, {k.lower(): v for k, v in error.headers.items()}, b''


def verify(hosts: list[str], found: dict[str, dict], per_host: int = 12, wait_s: float = 90.0) -> None:
    """Fetches a few recordings back from each Worker (and one that does not exist) and checks them."""
    print('\nChecking the uploaded files...', flush=True)
    for n, host in enumerate(hosts):
        keys = sorted(k for k in found if host_of(k, len(hosts)) == n)
        picked = random.sample(keys, min(per_host, len(keys))) if keys else []
        for key in picked:
            info = found[key]
            url = f'{host}/{key}.mp3?v={info["v"]}'
            deadline = time.time() + wait_s
            while True:
                status, headers, body = fetch(url)
                problem = None
                if status != 200:
                    problem = f'answered {status}'
                elif fingerprint(body) != info['v']:
                    problem = 'sent a different file'
                elif headers.get('access-control-allow-origin') != '*':
                    problem = 'has no Access-Control-Allow-Origin: * header'
                elif 'immutable' not in headers.get('cache-control', ''):
                    problem = f'has Cache-Control {headers.get("cache-control")!r}'
                if not problem:
                    break
                if time.time() > deadline:
                    sys.exit(f'{url} {problem}. The upload may still be settling: publish again in a minute.')
                time.sleep(5)
        status, _, _ = fetch(f'{host}/no-such-recording.mp3')
        if status != 404:
            sys.exit(f'{host} answered {status} for a recording that does not exist (it should be 404).')
        print(f'  {host}: {len(picked)} recordings fetched back, each the same as here.', flush=True)


# ---------------- the site's index ----------------


def write_index(found: dict[str, dict], hosts: list[str], meta: dict, out: Path = INDEX_DIR) -> dict:
    """public/data/voice: index.json, and per set each recording's [length in ms, fingerprint]."""
    by_set: dict[str, dict[str, list]] = {}
    sample = None
    for key, info in found.items():
        for qid in info['ids']:
            if qid == SAMPLE_ID:
                sample = {'key': key, 'ms': info['ms'], 'v': info['v']}
                continue
            set_id = set_id_of(qid)
            if not set_id:
                sys.exit(f'Question {qid} has an id of no set.')
            by_set.setdefault(set_id, {})[key] = [info['ms'], info['v']]
    if sample is None:
        sys.exit('The export has no sample line: export-library.ts is older than this script.')
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob('*.json'):
        old.unlink()  # a set no longer in the library goes
    for set_id, recordings in sorted(by_set.items()):
        body = {key: recordings[key] for key in sorted(recordings)}
        (out / f'{set_id}.json').write_text(json.dumps(body, separators=(',', ':')) + '\n', encoding='utf-8')
    index = {
        'voice': meta['voice'],
        'hosts': hosts,
        'recordings': len(found),
        'questions': meta['questions'],
        'sample': sample,
        'sets': {set_id: len(r) for set_id, r in sorted(by_set.items())},
    }
    (out / 'index.json').write_text(json.dumps(index, indent=2) + '\n', encoding='utf-8')
    return index


# ---------------- publish ----------------


def publish(args: argparse.Namespace) -> None:
    if not 1 <= args.hosts <= 16:
        sys.exit('--hosts takes 1 to 16.')
    audio = Path(args.out)
    print('Listing the recordings the site needs (export-library.ts)...', flush=True)
    meta, jobs = fresh_jobs()
    print(f"  {len(jobs):,} recordings, voice {meta['voice']}.", flush=True)
    found = measure(jobs, audio)
    total = sum(i['bytes'] for i in found.values())
    hours = sum(i['ms'] for i in found.values()) / 3_600_000
    print(f'  all here: {total / 1e9:.2f} GB, {hours:.1f} hours of speech.', flush=True)
    folders = stage(found, args.hosts, Path(args.stage))
    for folder in folders:
        count = sum(1 for p in (folder / 'files').iterdir() if p.suffix == '.mp3')
        print(f'  {folder.name}: {count:,} files ready in {folder}', flush=True)
    if args.dry_run:
        print('\nDry run: nothing uploaded, and the site index left as it was.')
        return
    hosts = [deploy(folder, args.account) for folder in folders]
    verify(hosts, found)
    index = write_index(found, hosts, meta, Path(args.index))
    print(
        f"\nPublished {index['recordings']:,} recordings for {index['questions']:,} questions, served by {', '.join(hosts)}.\n"
        f'Wrote the site index in {args.index} ({len(index["sets"])} sets). Commit it:\n'
        '  git add public/data/voice\n'
        '  git commit -m "Rebound\'s voice: the published recordings"\n'
        'The site plays a recording only once that index is on the live site.'
    )


def add_arguments(p: argparse.ArgumentParser) -> None:
    p.add_argument('--out', default=str(Path('voice') / 'audio'), help='the folder with the recordings (voice/audio)')
    p.add_argument('--hosts', type=int, default=2, help='how many Workers share the files (2; a free Worker holds 20,000)')
    p.add_argument('--account', help='the Cloudflare account ID, when your sign-in has more than one')
    p.add_argument('--stage', default=str(Path('voice') / 'publish'), help='where the Workers are put together (voice/publish)')
    p.add_argument('--index', default=str(INDEX_DIR), help='where the site index goes (public/data/voice)')
    p.add_argument('--dry-run', action='store_true', help='check and put the Workers together, but upload nothing')


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description='Puts Rebound’s recorded voice online (scripts/voice/README.md, "6. Publish").')
    add_arguments(parser)
    args = parser.parse_args(argv)
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(errors='replace')
    publish(args)


if __name__ == '__main__':
    main()
