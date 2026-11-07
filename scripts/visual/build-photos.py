#!/usr/bin/env python3
"""Build the public-domain photo set for Rebound's photo identification visual bonuses.

Reads scripts/visual/photo-list.json, asks Wikimedia Commons for each file's imageinfo (iiurlwidth=900),
refuses any file that is not public domain (or that carries restrictions such as insignia, personality rights
or trademarks), downloads its thumbnail, converts it to WebP (longest side at most 900 px) and writes

  public/data/visual/photos/<id>.webp
  public/data/visual/photos.json   { generatedAt, groups, photos: [{ id, group, answer, accept, file, width,
                                     height, alt, credit, source, license }] }

Thumbnails only: Commons serves thumbnails in standard widths (it rounds a 900-pixel request up to 960) and
throttles automated downloads of original files hard. A file narrower than 960 px has no 960 thumbnail (the
API then offers the original), so the script asks again for the largest standard width below the file's own
width (500 or 330 px, say) and downloads that. It never downloads an original.

Usage (from the repository root; -I because the script reads downloaded files):

  python3 -I scripts/visual/build-photos.py               # build
  python3 -I scripts/visual/build-photos.py --check       # validate the list and licenses only, write nothing
  python3 -I scripts/visual/build-photos.py --cache-dir D # keep downloads in D (an empty directory of their
                                                          # own) and reuse them on the next run

Re-runnable: the same list gives the same files. photos.json keeps its previous generatedAt when nothing
else in it changed, and WebP files are rewritten only when their bytes change.

Polite: one request at a time, at least 1 s apart (3 s for media), with the project User-Agent; on HTTP 429
or 503 it waits exactly as long as Retry-After asks before trying again, for up to an hour per request.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

USER_AGENT = 'ReboundStudyTool/0.1 (https://github.com/jiazegao/rebound)'
API = 'https://commons.wikimedia.org/w/api.php'
ROOT = Path(__file__).resolve().parents[2]
LIST_PATH = ROOT / 'scripts' / 'visual' / 'photo-list.json'
TAXONOMY_PATH = ROOT / 'src' / 'core' / 'taxonomy.ts'
OUT_DIR = ROOT / 'public' / 'data' / 'visual'
PHOTO_DIR = OUT_DIR / 'photos'

MAX_SIDE = 900
THUMB_STEPS = (120, 250, 330, 500, 960)  # Commons' standard thumbnail widths up to the 900 px we need
QUALITY = 72
TARGET_BYTES = 110 * 1024
SUBJECTS = {'earth_space', 'biology', 'energy', 'chemistry', 'physics', 'math'}
RASTER_MIMES = {'image/jpeg', 'image/png', 'image/tiff', 'image/webp'}
METADATA = 'LicenseShortName|License|Artist|Credit|Restrictions|UsageTerms|Copyrighted'
ID_RE = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')


class BuildError(Exception):
    pass


# ---------------------------------------------------------------------------------------------- network

class Polite:
    """One request at a time, spaced out, identified, and waiting as long as the servers ask.

    Wikimedia answers HTTP 429 with a Retry-After that counts down to the end of its rate-limit window;
    a refused request is retried exactly when that window ends (never sooner), as often as needed, until
    `budget` seconds have passed.
    """

    def __init__(self, budget: float = 3600) -> None:
        self.last = 0.0
        self.count = 0
        self.budget = budget

    def get(self, url: str, *, gap: float = 1.1) -> bytes:
        start = time.monotonic()
        refusals = 0
        while True:
            wait = self.last + gap - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
            self.count += 1
            pause = None
            try:
                with urllib.request.urlopen(request, timeout=90) as response:
                    return response.read()
            except urllib.error.HTTPError as error:
                if error.code not in (429, 500, 502, 503, 504) or time.monotonic() - start > self.budget:
                    raise BuildError(f'HTTP {error.code} for {url}') from None
                try:
                    pause = max(2, min(1800, int(error.headers.get('Retry-After') or 30))) + 1
                except ValueError:
                    pause = 30
                refusals += 1
                if refusals % 5 == 1:
                    print(f'    HTTP {error.code} (x{refusals}); retrying in {pause} s as asked', file=sys.stderr)
            except (urllib.error.URLError, TimeoutError) as error:
                if time.monotonic() - start > self.budget:
                    raise BuildError(f'{error} for {url}') from None
                pause = 30
            finally:
                self.last = time.monotonic()
            time.sleep(pause)


def fetch_imageinfo(net: Polite, titles: list[str], width: int = MAX_SIDE) -> dict[str, dict]:
    """imageinfo for each requested title (50 per request), keyed by the title as written in the list."""
    found: dict[str, dict] = {}
    for start in range(0, len(titles), 50):
        batch = titles[start:start + 50]
        params = {
            'action': 'query', 'format': 'json', 'formatversion': '2', 'redirects': '1',
            'titles': '|'.join(batch), 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size|mime',
            'iiurlwidth': str(width), 'iiextmetadatafilter': METADATA, 'iiextmetadatalanguage': 'en',
        }
        data = json.loads(net.get(API + '?' + urllib.parse.urlencode(params)))
        query = data.get('query') or {}
        rename = {}
        for step in query.get('normalized', []) + query.get('redirects', []):
            rename[step['from']] = step['to']
        pages = {page['title']: page for page in query.get('pages', [])}
        for title in batch:
            final = title
            for _ in range(3):
                final = rename.get(final, final)
            page = pages.get(final)
            if page and not page.get('missing') and page.get('imageinfo'):
                found[title] = {'title': page['title'], **page['imageinfo'][0]}
    return found


def is_thumbnail(url: str | None) -> bool:
    return '/thumb/' in urllib.parse.urlsplit(url or '').path


def use_standard_thumbnails(net: Polite, infos: dict[str, dict]) -> None:
    """Point files narrower than 960 px (whose 'thumbnail' is the original) at a smaller standard thumbnail."""
    by_step: dict[int, list[str]] = {}
    for title, info in infos.items():
        if not is_thumbnail(info.get('thumburl')):
            steps = [s for s in THUMB_STEPS if s < int(info.get('width') or 0)]
            if steps:
                by_step.setdefault(steps[-1], []).append(title)
    for step, titles in sorted(by_step.items()):
        for title, info in fetch_imageinfo(net, titles, width=step).items():
            if is_thumbnail(info.get('thumburl')):
                infos[title]['thumburl'] = info['thumburl']


def canonical_url(url: str) -> str:
    """thumb.wikimedia.org serves the same paths as upload.wikimedia.org; drop the tracking query string."""
    parts = urllib.parse.urlsplit(url)
    if parts.netloc not in ('upload.wikimedia.org', 'thumb.wikimedia.org'):
        raise BuildError(f'unexpected media host in {url}')
    if not is_thumbnail(url):
        raise BuildError(f'refusing to download an original file: {url}')
    return urllib.parse.urlunsplit(('https', 'upload.wikimedia.org', parts.path, '', ''))


def cache_name(url: str) -> str:
    suffix = Path(urllib.parse.urlsplit(url).path).suffix.lower() or '.bin'
    return hashlib.sha256(url.encode()).hexdigest()[:24] + suffix


# ---------------------------------------------------------------------------------------------- metadata

def plain(value: str | None) -> str:
    """Text of an extmetadata HTML value, with the doubled '{{Unknown|author}}' wording collapsed."""
    text = re.sub(r'<[^>]+>', ' ', value or '')
    text = re.sub(r'\s+', ' ', html.unescape(text)).strip()
    words = text.split(' ')
    half = len(words) // 2
    if len(words) % 2 == 0 and half and words[:half] == words[half:]:
        text = ' '.join(words[:half])
    return text


def meta(info: dict, key: str) -> str:
    return plain((info.get('extmetadata') or {}).get(key, {}).get('value'))


def is_public_domain(info: dict) -> bool:
    short = meta(info, 'LicenseShortName').lower()
    code = meta(info, 'License').lower()
    return short == 'public domain' or code.startswith('pd')


def credit_for(entry: dict, info: dict) -> str:
    if entry.get('credit'):
        return entry['credit']
    for key in ('Artist', 'Credit'):
        text = meta(info, key)
        if text and not text.lower().startswith('unknown') and text.lower() != 'own work':
            return text[:160].rstrip() + ('…' if len(text) > 160 else '')
    raise BuildError(f'{entry["id"]}: no author or credit on Commons; add a "credit" to the list entry')


def file_page(title: str) -> str:
    return 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_'), safe=':/(),\'!*-_.~')


# ---------------------------------------------------------------------------------------------- list

def taxonomy_topics() -> set[str]:
    source = TAXONOMY_PATH.read_text(encoding='utf-8')
    return {f'{s}.{t}' for s, t in re.findall(r"topic\(\s*'([a-z_]+)'\s*,\s*'([a-z0-9-]+)'", source)}


def load_list() -> tuple[list[dict], list[dict]]:
    data = json.loads(LIST_PATH.read_text(encoding='utf-8'))
    groups, photos = data['groups'], data['photos']
    topics = taxonomy_topics()
    problems: list[str] = []
    group_ids = set()
    for group in groups:
        gid = group.get('id', '')
        if not ID_RE.match(gid) or gid in group_ids:
            problems.append(f'group id {gid!r} is not kebab-case or is repeated')
        group_ids.add(gid)
        if group.get('subject') not in SUBJECTS:
            problems.append(f'{gid}: subject {group.get("subject")!r} is not one of {sorted(SUBJECTS)}')
        if group.get('topic') not in topics or not str(group.get('topic')).startswith(f'{group.get("subject")}.'):
            problems.append(f'{gid}: topic {group.get("topic")!r} is not a {group.get("subject")} topic in taxonomy.ts')
        for key in ('question', 'mcQuestion'):
            if not str(group.get(key, '')).strip():
                problems.append(f'{gid}: {key} is missing')
    ids = set()
    answers: dict[str, set[str]] = {g: set() for g in group_ids}
    for photo in photos:
        pid = photo.get('id', '')
        if not ID_RE.match(pid) or pid in ids:
            problems.append(f'photo id {pid!r} is not kebab-case or is repeated')
        ids.add(pid)
        if photo.get('group') not in group_ids:
            problems.append(f'{pid}: unknown group {photo.get("group")!r}')
        answer = photo.get('answer', '')
        if not answer or answer != answer.upper():
            problems.append(f'{pid}: answer {answer!r} must be non-empty upper case')
        accept = photo.get('accept', [])
        if not isinstance(accept, list) or any(not isinstance(a, str) or a != a.upper() or a == answer for a in accept) \
                or len(set(accept)) != len(accept):
            problems.append(f'{pid}: accept must be distinct upper-case strings other than the answer')
        if not str(photo.get('commonsFile', '')).startswith('File:'):
            problems.append(f'{pid}: commonsFile must be a "File:..." title')
        alt = str(photo.get('alt', ''))
        if len(alt) < 20:
            problems.append(f'{pid}: alt text is missing or too short')
        named = [w for w in [answer, *accept] if len(w) > 3 and re.search(rf'\b{re.escape(w)}\b', alt, re.I)]
        if named:
            problems.append(f'{pid}: alt text gives the answer away ({named[0]!r})')
        answers.setdefault(photo.get('group'), set()).add(answer)
    for gid, found in answers.items():
        if gid in group_ids and len(found) < 4:
            problems.append(f'group {gid} has {len(found)} different answers; multiple choice needs at least 4')
    if problems:
        raise BuildError('photo-list.json problems:\n  ' + '\n  '.join(problems))
    return groups, photos


# ---------------------------------------------------------------------------------------------- images

def to_webp(raw: bytes) -> tuple[bytes, int, int, int]:
    """WebP with the longest side at most 900 px: quality 72, stepping down to 56 and then shrinking the image
    in 10% steps (not below 600 px) until it fits in TARGET_BYTES. Deterministic for the same input."""
    with Image.open(io.BytesIO(raw)) as source:
        image = ImageOps.exif_transpose(source)
        if image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info):
            rgba = image.convert('RGBA')
            image = Image.new('RGB', rgba.size, (0, 0, 0))
            image.paste(rgba, mask=rgba.getchannel('A'))
        else:
            image = image.convert('RGB')
    side = MAX_SIDE
    while True:
        sized = image.copy()
        sized.thumbnail((side, side), Image.Resampling.LANCZOS)
        for quality in range(QUALITY, 55, -4):
            buffer = io.BytesIO()
            sized.save(buffer, 'WEBP', quality=quality, method=6)
            data = buffer.getvalue()
            if len(data) <= TARGET_BYTES:
                return data, sized.width, sized.height, quality
        if max(sized.size) <= 600:
            return data, sized.width, sized.height, quality
        side = int(max(sized.size) * 0.9)


def write_if_changed(path: Path, data: bytes) -> bool:
    if path.exists() and path.read_bytes() == data:
        return False
    path.write_bytes(data)
    return True


# ---------------------------------------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--check', action='store_true', help='validate the list and licenses; write nothing')
    parser.add_argument('--cache-dir', type=Path, help='keep downloaded thumbnails here and reuse them')
    args = parser.parse_args()

    groups, photos = load_list()
    net = Polite()
    print(f'{len(photos)} photos in {len(groups)} groups; asking Commons for imageinfo')
    infos = fetch_imageinfo(net, [p['commonsFile'] for p in photos])

    refused = []
    for photo in photos:
        info = infos.get(photo['commonsFile'])
        if info is None:
            refused.append(f'{photo["id"]}: {photo["commonsFile"]} not found on Commons')
        elif not is_public_domain(info):
            refused.append(f'{photo["id"]}: not public domain ({meta(info, "LicenseShortName") or "no license"})')
        elif meta(info, 'Restrictions'):
            refused.append(f'{photo["id"]}: restricted ({meta(info, "Restrictions")})')
        elif info.get('mime') not in RASTER_MIMES:
            refused.append(f'{photo["id"]}: {info.get("mime")} is not a raster photo')
    if refused:
        print('Refused:\n  ' + '\n  '.join(refused), file=sys.stderr)
        return 1
    if args.check:
        print(f'list and licenses OK ({net.count} requests)')
        return 0

    use_standard_thumbnails(net, infos)
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    temp = None
    if args.cache_dir:
        cache = args.cache_dir.resolve()
        cache.mkdir(parents=True, exist_ok=True)
    else:
        temp = tempfile.TemporaryDirectory(prefix='rebound-photos-')
        cache = Path(temp.name)

    entries, total, changed = [], 0, 0
    try:
        for photo in photos:
            info = infos[photo['commonsFile']]
            url = canonical_url(info.get('thumburl') or '')
            cached = cache / cache_name(url)
            if cached.exists():
                raw = cached.read_bytes()
            else:
                raw = net.get(url, gap=3.0)
                cached.write_bytes(raw)
            data, width, height, quality = to_webp(raw)
            changed += write_if_changed(PHOTO_DIR / f'{photo["id"]}.webp', data)
            total += len(data)
            note = '' if len(data) <= TARGET_BYTES else '  (over target)'
            print(f'  {photo["id"]:28} {width:4}x{height:<4} q{quality} {len(data) / 1024:6.1f} KB{note}')
            entries.append({
                'id': photo['id'],
                'group': photo['group'],
                'answer': photo['answer'],
                'accept': photo.get('accept', []),
                'file': f'photos/{photo["id"]}.webp',
                'width': width,
                'height': height,
                'alt': photo['alt'],
                'credit': credit_for(photo, info),
                'source': file_page(info['title']),
                'license': meta(info, 'LicenseShortName'),
            })
    finally:
        if temp is not None:
            temp.cleanup()

    keep = {f'{p["id"]}.webp' for p in photos}
    for stale in sorted(PHOTO_DIR.glob('*.webp')):
        if stale.name not in keep:
            stale.unlink()
            print(f'  removed stale {stale.name}')

    out_groups = [{k: g[k] for k in ('id', 'subject', 'topic', 'question', 'mcQuestion')} for g in groups]
    manifest_path = OUT_DIR / 'photos.json'
    generated = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    if manifest_path.exists():
        try:
            previous = json.loads(manifest_path.read_text(encoding='utf-8'))
            if previous.get('groups') == out_groups and previous.get('photos') == entries:
                generated = previous.get('generatedAt', generated)
        except ValueError:
            pass
    manifest = {'generatedAt': generated, 'groups': out_groups, 'photos': entries}
    text = json.dumps(manifest, indent=2, ensure_ascii=False) + '\n'
    write_if_changed(manifest_path, text.encode('utf-8'))
    print(f'{len(entries)} photos, {total / 1024:.0f} KB of WebP, {changed} file(s) changed, {net.count} requests')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except BuildError as error:
        print(f'error: {error}', file=sys.stderr)
        sys.exit(1)
