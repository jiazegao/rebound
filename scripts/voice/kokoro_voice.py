#!/usr/bin/env python3
"""
Rebound's voice, made on your own computer with Kokoro (an open text-to-speech model): see scripts/voice/README.md.

  python scripts/voice/kokoro_voice.py generate [voice/jobs.jsonl] [--out voice/audio] [--limit N] [--shard 1/3]
  python scripts/voice/kokoro_voice.py check    [voice/jobs.jsonl] [--out voice/audio] [--model small.en]
  python scripts/voice/kokoro_voice.py try      "Words to hear" [--voice kokoro:af_heart] [--play]

generate  Records each question listed by scripts/voice/export-library.ts as <name>.mp3 (mono, 24 kHz), skipping
          those already made, so it can be stopped and started again. For a list of up to 500 (a sample), it also
          writes listen.html, to hear each recording beside its text.
check     Listens to the recordings with Whisper and lists those whose words differ from the text, or whose length is
          odd for it, worst first: review.tsv, and review.html to hear them.
try       Says a line, prints the phonemes Kokoro reads, and saves it as voice/try.mp3: for fixing how a word is said
          (scripts/voice/pronunciations.tsv).

Needs Python 3.10 to 3.12, PyTorch, and scripts/voice/requirements.txt.
"""
from __future__ import annotations

import argparse
import csv
import difflib
import html
import json
import os
import re
import statistics
import sys
import time
from pathlib import Path

import numpy as np

SAMPLE_RATE = 24_000
HERE = Path(__file__).resolve().parent
DEFAULT_LEXICON = HERE / 'pronunciations.tsv'
SAMPLE_PAGE_LIMIT = 500


# ---------------- the list of recordings ----------------


def read_jobs(path: Path) -> tuple[dict, list[dict]]:
    """The list written by export-library.ts: its first line describes it, then one recording a line."""
    if not path.exists():
        sys.exit(f'{path} is missing: run  npx tsx scripts/voice/export-library.ts  first (see scripts/voice/README.md).')
    meta: dict | None = None
    jobs: list[dict] = []
    with path.open(encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            if 'meta' in row:
                meta = row['meta']
            else:
                jobs.append(row)
    if not meta or not str(meta.get('voice', '')).startswith('kokoro:'):
        sys.exit(f'{path} is not a list from export-library.ts (its first line names the voice).')
    return meta, jobs


def parse_voice(voice: str) -> tuple[str, float]:
    """kokoro:af_heart -> ('af_heart', 1.0); kokoro:am_michael@0.95 -> ('am_michael', 0.95)."""
    m = re.fullmatch(r'kokoro:([a-z]{2}_[a-z0-9]+)(?:@(\d+(?:\.\d+)?))?', voice)
    if not m:
        sys.exit(f'Unknown voice {voice!r}: use kokoro:<voice> or kokoro:<voice>@<speed>, like kokoro:af_heart.')
    return m.group(1), float(m.group(2) or 1.0)


def shard_of(spec: str | None) -> tuple[int, int]:
    """--shard 2/3: the second of three parts (each process takes every third recording)."""
    if not spec:
        return 0, 1
    m = re.fullmatch(r'(\d+)/(\d+)', spec)
    if not m or not 1 <= int(m.group(1)) <= int(m.group(2)):
        sys.exit('--shard takes a part and a count, like 1/3, 2/3 and 3/3 in three windows.')
    return int(m.group(1)) - 1, int(m.group(2))


# ---------------- how words are said ----------------


def load_lexicon(path: Path | None) -> list[tuple[re.Pattern, str]]:
    """
    pronunciations.tsv: a word, a tab, and how to say it, either as phonemes between slashes (/fˈinoʊtˌIp/, as `try`
    prints them) or as a respelling (fee no type). Lines starting with # are notes. Only the recording changes: the
    words, and so the recording's name, stay as the server has them.
    """
    if not path or not path.exists():
        return []
    entries = []
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        word, _, say = line.partition('\t')
        word, say = word.strip(), say.strip()
        if word and say:
            entries.append((re.compile(r'(?<![\w-])' + re.escape(word) + r'(?![\w-])', re.IGNORECASE), say))
    return entries


def for_kokoro(text: str, lexicon: list[tuple[re.Pattern, str]]) -> str:
    """The words as Kokoro reads them: square brackets mean something to it, and the lexicon's fixes apply."""
    text = text.replace('[', '(').replace(']', ')')
    for pattern, say in lexicon:
        if len(say) > 2 and say.startswith('/') and say.endswith('/'):
            text = pattern.sub(lambda m, say=say: f'[{m.group(0)}]({say})', text)
        else:
            text = pattern.sub(say, text)
    return text


class Voice:
    """One Kokoro voice, loaded once (the model and the voice download from Hugging Face the first time)."""

    def __init__(self, name: str, speed: float, device: str | None):
        try:
            from kokoro import KPipeline
        except ImportError:
            sys.exit('Kokoro is not installed: see scripts/voice/README.md (Python 3.10 to 3.12, then pip install -r scripts/voice/requirements.txt).')
        self.name = name
        self.speed = speed
        # The first letter of a voice is its language: a for American English, b for British.
        self.pipeline = KPipeline(lang_code=name[0], repo_id='hexgrad/Kokoro-82M', device=device)
        self.device = str(self.pipeline.model.device)
        if self.device.startswith('cuda'):
            import torch

            self.device += f' ({torch.cuda.get_device_name()})'
        print(f'Kokoro voice {name} at speed {speed:g}, running on {self.device}.')

    def say(self, text: str) -> tuple[np.ndarray, list[str]]:
        """The audio (24 kHz, float) and the phonemes Kokoro read, chunk by chunk."""
        parts: list[np.ndarray] = []
        phonemes: list[str] = []
        for result in self.pipeline(text, voice=self.name, speed=self.speed, split_pattern=None):
            phonemes.append(result.phonemes)
            if result.audio is not None:
                parts.append(result.audio.detach().cpu().numpy().astype(np.float32))
        if not parts:
            raise RuntimeError('Kokoro made no audio')
        return np.concatenate(parts), phonemes


def tidy(audio: np.ndarray) -> np.ndarray:
    """Trims the silence around the words (keeping a breath) and sets the loudness, so every recording matches."""
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak <= 1e-4:
        raise RuntimeError('the recording is silent')
    sound = np.flatnonzero(np.abs(audio) > peak * 0.02)
    start = max(0, int(sound[0]) - int(0.05 * SAMPLE_RATE))
    end = min(audio.size, int(sound[-1]) + int(0.15 * SAMPLE_RATE))
    return audio[start:end] * (0.89 / peak)


def mp3(audio: np.ndarray, kbps: int) -> bytes:
    """Mono MP3 at the model's 24 kHz (the format the server reads, and that every browser plays)."""
    import lameenc

    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype('<i2').tobytes()
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(kbps)
    encoder.set_in_sample_rate(SAMPLE_RATE)
    encoder.set_channels(1)
    encoder.set_quality(2)
    return bytes(encoder.encode(pcm)) + bytes(encoder.flush())


def write_file(path: Path, data: bytes) -> None:
    """Writes beside the file and renames, so a run that stops never leaves half a recording."""
    part = path.with_name(path.name + '.part')
    part.write_bytes(data)
    os.replace(part, path)


# ---------------- generate ----------------


def clock(seconds: float) -> str:
    seconds = int(seconds)
    return f'{seconds // 3600}:{seconds // 60 % 60:02d}:{seconds % 60:02d}'


def generate(args: argparse.Namespace) -> None:
    meta, jobs = read_jobs(Path(args.jobs))
    name, speed = parse_voice(meta['voice'])
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    part, parts = shard_of(args.shard)
    mine = [j for i, j in enumerate(jobs) if i % parts == part]
    if args.only_with:
        # Only the questions with these words (after fixing how one is said).
        found = [re.compile(r'(?<![\w-])' + re.escape(w) + r'(?![\w-])', re.IGNORECASE) for w in args.only_with]
        mine = [j for j in mine if any(p.search(j['text']) for p in found)]
    todo = [j for j in mine if args.force or not (out / f"{j['key']}.mp3").exists()]
    if args.limit:
        todo = todo[: args.limit]
    lexicon = load_lexicon(Path(args.lexicon) if args.lexicon else DEFAULT_LEXICON)
    made = sum(1 for j in mine if (out / f"{j['key']}.mp3").exists())
    print(
        f"{meta['voice']}: {made:,} of {len(mine):,} recordings already made; making {len(todo):,}"
        + (' (again, with --force)' if args.force else '')
        + (f' (part {part + 1} of {parts})' if parts > 1 else '')
        + '.'
    )
    if lexicon:
        print(f'Pronunciations: {len(lexicon)} from {args.lexicon or DEFAULT_LEXICON}.')
    manifest = out / (f'manifest-{part + 1}of{parts}.jsonl' if parts > 1 else 'manifest.jsonl')
    if todo:
        voice = Voice(name, speed, args.device)
        started = time.time()
        spoken = 0.0
        failed = 0
        with manifest.open('a', encoding='utf-8') as log:
            for n, job in enumerate(todo, 1):
                try:
                    audio = tidy(voice.say(for_kokoro(job['text'], lexicon))[0])
                    write_file(out / f"{job['key']}.mp3", mp3(audio, args.kbps))
                except Exception as error:  # one bad question should not stop a night's run
                    failed += 1
                    print(f"  could not record {job['ids'][0]}: {error}", file=sys.stderr)
                    continue
                seconds = audio.size / SAMPLE_RATE
                spoken += seconds
                log.write(json.dumps({'key': job['key'], 'ms': round(seconds * 1000), 'chars': len(job['text']), 'ids': job['ids']}) + '\n')
                log.flush()
                if n % 25 == 0 or n == len(todo):
                    took = time.time() - started
                    left = took / n * (len(todo) - n)
                    print(f'  {n:,}/{len(todo):,}  {spoken / 3600:.2f} h of speech  {spoken / took:.0f}x real time  {clock(took)} so far, about {clock(left)} to go', flush=True)
        print(f'Done: {len(todo) - failed:,} recordings in {out}' + (f', {failed} could not be made (run again to retry them)' if failed else '') + '.')
    if len(jobs) <= SAMPLE_PAGE_LIMIT:
        page = write_listen_page(out, jobs, meta)
        print(f'To listen: open {page}')


def write_listen_page(out: Path, jobs: list[dict], meta: dict) -> Path:
    rows = []
    for job in jobs:
        if (out / f"{job['key']}.mp3").exists():
            rows.append(
                f'<li><audio controls preload="none" src="{job["key"]}.mp3"></audio>'
                f'<p>{html.escape(job["text"])}</p><small>{html.escape(", ".join(job["ids"]))}</small></li>'
            )
    page = out / 'listen.html'
    page.write_text(page_html(f'{len(rows)} recordings, {meta["voice"]}', rows), encoding='utf-8')
    return page


def page_html(title: str, rows: list[str]) -> str:
    return (
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        f'<title>{html.escape(title)}</title>'
        '<style>body{font:16px/1.5 system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem}'
        'li{margin:0 0 1.5rem}audio{width:100%}p{margin:.3rem 0}small,.heard{color:#666}</style>'
        f'<h1>{html.escape(title)}</h1><ol>{"".join(rows)}</ol>'
    )


# ---------------- check ----------------


def words(text: str) -> list[str]:
    """Words to compare what was meant with what was heard: lower case, no punctuation (but 2.5 stays 2.5)."""
    text = text.lower().replace('–', ' ').replace('—', ' ').replace('-', ' ')
    text = re.sub(r"[^\w\s.']", ' ', text)
    text = re.sub(r'(?<!\d)\.|\.(?!\d)', ' ', text)
    return [w.strip("'") for w in text.split() if w.strip("'")]


def compare(meant: str, heard: str) -> tuple[float, int, int]:
    """How alike the words are (0 to 1), the longest run of words left out, and the longest run of words added."""
    a, b = words(meant), words(heard)
    matcher = difflib.SequenceMatcher(None, a, b, autojunk=False)
    missing = added = 0
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag in ('delete', 'replace'):
            missing = max(missing, i2 - i1)
        if tag in ('insert', 'replace'):
            added = max(added, j2 - j1)
    return matcher.ratio(), missing, added


def problems(similarity: float | None, missing: int, added: int, pace: float, usual: float) -> list[str]:
    found = []
    if similarity is not None:
        if missing >= 4:
            found.append(f'{missing} words in a row not heard')
        if added >= 4:
            found.append(f'{added} words heard that are not in the text')
        if similarity < 0.8:
            found.append(f'words {similarity:.0%} alike')
    if pace < usual * 0.6:
        found.append('slow for its text (a long pause or a repeat?)')
    elif pace > usual * 1.6:
        found.append('quick for its text (words left out?)')
    return found


def read_manifests(out: Path) -> dict[str, dict]:
    made: dict[str, dict] = {}
    for path in sorted(out.glob('manifest*.jsonl')):
        for line in path.read_text(encoding='utf-8').splitlines():
            if line.strip():
                row = json.loads(line)
                made[row['key']] = row
    return made


def listener(model_name: str, device: str | None):
    """Whisper, as a function from a recording's file to the words it hears."""
    try:
        import soundfile
        import whisper
        from scipy.signal import resample_poly
        import torch
    except ImportError:
        sys.exit('check needs Whisper: pip install -r scripts/voice/requirements.txt (or run check with --no-listen).')
    device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
    model = whisper.load_model(model_name, device=device)

    def hear(path: Path) -> str:
        audio, rate = soundfile.read(str(path), dtype='float32')
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        if rate != 16_000:
            audio = resample_poly(audio, 16_000, rate).astype(np.float32)
        result = model.transcribe(audio, language='en', fp16=device == 'cuda', condition_on_previous_text=False, temperature=0.0)
        return str(result.get('text', '')).strip()

    return hear


def check(args: argparse.Namespace, hear=None) -> None:
    meta, jobs = read_jobs(Path(args.jobs))
    out = Path(args.out)
    made = read_manifests(out)
    present = [j for j in jobs if (out / f"{j['key']}.mp3").exists()]
    if not present:
        sys.exit(f'No recordings in {out} yet: run generate first.')
    paces = [made[j['key']]['chars'] / (made[j['key']]['ms'] / 1000) for j in present if j['key'] in made and made[j['key']]['ms'] > 0]
    usual = statistics.median(paces) if paces else 15.0
    if hear is None and not args.no_listen:
        hear = listener(args.model, args.device)
    rows = []
    started = time.time()
    for n, job in enumerate(present, 1):
        path = out / f"{job['key']}.mp3"
        ms = made.get(job['key'], {}).get('ms') or 0
        pace = len(job['text']) / (ms / 1000) if ms else usual
        heard, similarity, missing, added = '', None, 0, 0
        if hear is not None:
            heard = hear(path)
            similarity, missing, added = compare(job['text'], heard)
        found = problems(similarity, missing, added, pace, usual)
        if found:
            badness = (1 - (similarity if similarity is not None else 1)) + 0.1 * missing + 0.05 * added + (0.3 if 'quick' in ' '.join(found) or 'slow' in ' '.join(found) else 0)
            rows.append((badness, '; '.join(found), similarity, job, heard))
        if hear is not None and (n % 100 == 0 or n == len(present)):
            took = time.time() - started
            print(f'  listened to {n:,}/{len(present):,}, {len(rows):,} to review, about {clock(took / n * (len(present) - n))} to go', flush=True)
    rows.sort(key=lambda r: -r[0])
    with (out / 'review.tsv').open('w', encoding='utf-8', newline='') as f:
        table = csv.writer(f, delimiter='\t')
        table.writerow(['problem', 'alike', 'recording', 'questions', 'text', 'heard'])
        for _, found, similarity, job, heard in rows:
            table.writerow([found, '' if similarity is None else f'{similarity:.2f}', f"{job['key']}.mp3", ' '.join(job['ids']), job['text'], heard])
    page_rows = [
        f'<li><audio controls preload="none" src="{job["key"]}.mp3"></audio><p><b>{html.escape(found)}</b></p>'
        f'<p>{html.escape(job["text"])}</p>' + (f'<p class="heard">Heard: {html.escape(heard)}</p>' if heard else '') + f'<small>{html.escape(" ".join(job["ids"]))}</small></li>'
        for _, found, _, job, heard in rows[:SAMPLE_PAGE_LIMIT]
    ]
    (out / 'review.html').write_text(page_html(f'{len(rows)} recordings to review, {meta["voice"]}', page_rows), encoding='utf-8')
    print(f'{len(rows):,} of {len(present):,} recordings to review: {out / "review.html"} (and review.tsv). Usual pace: {usual:.1f} characters a second.')


# ---------------- try ----------------


def try_line(args: argparse.Namespace) -> None:
    name, speed = parse_voice(args.voice)
    lexicon = load_lexicon(Path(args.lexicon) if args.lexicon else DEFAULT_LEXICON)
    voice = Voice(name, speed, args.device)
    audio, phonemes = voice.say(for_kokoro(args.text, lexicon))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    write_file(out, mp3(tidy(audio), args.kbps))
    print('Phonemes: ' + ' | '.join(phonemes))
    print(f'Saved {out} ({audio.size / SAMPLE_RATE:.1f} s).')
    if args.play and hasattr(os, 'startfile'):
        os.startfile(out)  # Windows: opens it in the default player


# ---------------- command line ----------------


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description='Rebound’s voice, made with Kokoro (scripts/voice/README.md).')
    commands = parser.add_subparsers(dest='command', required=True)

    def common(p: argparse.ArgumentParser, with_jobs: bool = True) -> None:
        if with_jobs:
            p.add_argument('jobs', nargs='?', default=str(Path('voice') / 'jobs.jsonl'), help='the list from export-library.ts (voice/jobs.jsonl)')
            p.add_argument('--out', default=str(Path('voice') / 'audio'), help='the folder for the recordings (voice/audio)')
        p.add_argument('--device', choices=['cuda', 'cpu'], help='where to run (the graphics card when there is one)')

    g = commands.add_parser('generate', help='record the questions')
    common(g)
    g.add_argument('--limit', type=int, default=0, help='record at most this many (to try a few)')
    g.add_argument('--shard', help='this part of the list, like 1/3: run 1/3, 2/3 and 3/3 at once in three windows')
    g.add_argument('--kbps', type=int, default=48, help='MP3 bit rate (48: clear speech, about 1.5 GB for the library)')
    g.add_argument('--lexicon', help='pronunciation fixes (scripts/voice/pronunciations.tsv)')
    g.add_argument('--force', action='store_true', help='record again those already made (after fixing a pronunciation)')
    g.add_argument('--only-with', action='append', metavar='WORD', help='only the questions with this word (repeat for more)')

    c = commands.add_parser('check', help='listen back with Whisper and list recordings to review')
    common(c)
    c.add_argument('--model', default='small.en', help='Whisper model (small.en; medium.en hears more but is slower)')
    c.add_argument('--no-listen', action='store_true', help='only check each recording’s length against its text')

    t = commands.add_parser('try', help='say a line, to hear how a word comes out')
    common(t, with_jobs=False)
    t.add_argument('text')
    t.add_argument('--voice', default='kokoro:af_heart')
    t.add_argument('--out', default=str(Path('voice') / 'try.mp3'))
    t.add_argument('--kbps', type=int, default=48)
    t.add_argument('--lexicon', help='pronunciation fixes (scripts/voice/pronunciations.tsv)')
    t.add_argument('--play', action='store_true', help='open it in the default player (Windows)')

    args = parser.parse_args(argv)
    # A Windows console that is not set to UTF-8 should show a ? for a phoneme, not stop the run.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(errors='replace')
    {'generate': generate, 'check': check, 'try': try_line}[args.command](args)


if __name__ == '__main__':
    main()
