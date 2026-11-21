"""
Tests for publish.py (scripts/voice/README.md, "6. Publish"), with silent stand-in recordings and a local web server
in place of Cloudflare. Only the Python standard library is needed:

  python -m unittest discover -s scripts/voice -p "test_*.py"
"""
from __future__ import annotations

import argparse
import contextlib
import http.server
import io
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish  # noqa: E402

# One MPEG-2 Layer III frame as lameenc makes them for Kokoro: 48 kbit/s, 24 kHz, mono, 144 bytes, 24 ms.
FRAME_24K = bytes([0xFF, 0xF3, 0x64, 0xC0]) + bytes(140)
# One MPEG-1 Layer III frame (32 kbit/s, 32 kHz, mono), as the server's silent test recordings were: 36 ms.
FRAME_32K = bytes([0xFF, 0xFB, 0x18, 0xC0]) + bytes(140)


def recording(ms: int, salt: int = 0) -> bytes:
    """A silent recording `ms` long (in whole 24 ms frames); `salt` makes files of the same length differ."""
    frames = max(1, round(ms / 24))
    body = bytearray(FRAME_24K * frames)
    body[-1] = salt % 256
    return bytes(body)


def key_of(n: int, first: str) -> str:
    return first + f'{n:039x}'


class Mp3Length(unittest.TestCase):
    def test_kokoro_frames(self):
        self.assertEqual(publish.mp3_duration_ms(FRAME_24K * 100), 2400)

    def test_mpeg1_frames_like_the_server_read_them(self):
        # The server's silentMp3(3000) made 83 such frames, which it read as 2988 ms.
        self.assertEqual(publish.mp3_duration_ms(FRAME_32K * 83), 2988)

    def test_skips_an_id3_tag(self):
        tag = b'ID3' + bytes([4, 0, 0, 0, 0, 0, 10]) + bytes(10)
        self.assertEqual(publish.mp3_duration_ms(tag + FRAME_24K * 10), 240)

    def test_not_audio(self):
        self.assertIsNone(publish.mp3_duration_ms(b'<html>Not found</html>'))
        self.assertIsNone(publish.mp3_duration_ms(b''))
        self.assertIsNone(publish.mp3_duration_ms(bytes([0xFF, 0xFF, 0xFF, 0xFF]) * 10))


class Names(unittest.TestCase):
    def test_which_worker(self):
        self.assertEqual([publish.host_of(c * 40, 2) for c in '0123456789abcdef'], [0] * 8 + [1] * 8)
        self.assertEqual([publish.host_of(c * 40, 3) for c in '056abf'], [0, 0, 1, 1, 2, 2])
        self.assertEqual({publish.host_of(c * 40, 1) for c in '0f'}, {0})

    def test_set_of_a_question(self):
        self.assertEqual(publish.set_id_of('doe-hs-06-r09-t06'), 'doe-hs-06')
        self.assertEqual(publish.set_id_of('doe-ms-finals-r01-b03'), 'doe-ms-finals')
        self.assertIsNone(publish.set_id_of('sample'))

    def test_fingerprint(self):
        self.assertRegex(publish.fingerprint(b'abc'), r'^[0-9a-f]{8}$')
        self.assertNotEqual(publish.fingerprint(recording(1000, 1)), publish.fingerprint(recording(1000, 2)))


class Library(unittest.TestCase):
    """The recordings in a folder, as `generate` leaves them, and the list the export makes."""

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir, ignore_errors=True)
        self.audio = self.dir / 'audio'
        self.audio.mkdir()
        self.jobs = []
        for n in range(10):
            first = '0123456789abcdef'[n % 16]
            key = key_of(n, first)
            ids = [f"doe-hs-0{1 + n % 2}-r01-t{n:02d}"]
            if n == 4:
                ids.append('doe-ms-finals-r01-b01')  # the same words in another set: one recording
            self.jobs.append({'key': key, 'text': f'Question {n}', 'ids': ids})
            (self.audio / f'{key}.mp3').write_bytes(recording(1000 + 100 * n, n))
        sample = key_of(99, 'c')
        self.jobs.append({'key': sample, 'text': 'Toss-up 1.', 'ids': ['sample']})
        (self.audio / f'{sample}.mp3').write_bytes(recording(4000, 99))
        self.meta = {'voice': 'kokoro:af_heart', 'questions': 11, 'recordings': len(self.jobs)}


class Measure(Library):
    def test_lengths_and_fingerprints(self):
        found = publish.measure(self.jobs, self.audio)
        self.assertEqual(len(found), 11)
        first = found[self.jobs[0]['key']]
        self.assertEqual(first['ms'], 1008)  # 42 frames of 24 ms
        self.assertEqual(first['v'], publish.fingerprint((self.audio / f"{self.jobs[0]['key']}.mp3").read_bytes()))

    def test_a_missing_recording_stops_it(self):
        (self.audio / f"{self.jobs[3]['key']}.mp3").unlink()
        with self.assertRaises(SystemExit) as stopped:
            publish.measure(self.jobs, self.audio)
        self.assertIn('1 of 11 recordings are not in', str(stopped.exception))
        self.assertIn('generate', str(stopped.exception))

    def test_a_file_that_is_not_audio_stops_it(self):
        (self.audio / f"{self.jobs[2]['key']}.mp3").write_bytes(b'not audio')
        with self.assertRaises(SystemExit) as stopped:
            publish.measure(self.jobs, self.audio)
        self.assertIn('not MP3 audio', str(stopped.exception))


class Stage(Library):
    def test_two_workers_with_their_files(self):
        found = publish.measure(self.jobs, self.audio)
        folders = publish.stage(found, 2, self.dir / 'publish')
        self.assertEqual([f.name for f in folders], ['rebound-voice-1', 'rebound-voice-2'])
        for n, folder in enumerate(folders):
            files = sorted(p.name for p in (folder / 'files').iterdir())
            self.assertIn('_headers', files)
            mp3s = [f for f in files if f.endswith('.mp3')]
            self.assertTrue(mp3s)
            self.assertTrue(all(publish.host_of(f, 2) == n for f in mp3s))
            config = json.loads((folder / 'wrangler.json').read_text())
            self.assertEqual(config['name'], f'rebound-voice-{n + 1}')
            self.assertEqual(config['assets'], {'directory': './files'})
            headers = (folder / 'files' / '_headers').read_text()
            self.assertIn('Access-Control-Allow-Origin: *', headers)
            self.assertIn('immutable', headers)
        self.assertEqual(sum(len(list((f / 'files').glob('*.mp3'))) for f in folders), 11)

    def test_a_recording_no_longer_needed_is_dropped(self):
        found = publish.measure(self.jobs, self.audio)
        root = self.dir / 'publish'
        publish.stage(found, 2, root)
        gone = self.jobs[0]['key']
        del found[gone]
        publish.stage(found, 2, root)
        self.assertFalse(any(root.rglob(f'{gone}.mp3')))

    def test_too_many_files_for_a_free_worker(self):
        found = publish.measure(self.jobs, self.audio)
        with mock.patch.object(publish, 'MAX_FILES', 3):
            with self.assertRaises(SystemExit) as stopped:
                publish.stage(found, 2, self.dir / 'publish')
        self.assertIn('--hosts 3', str(stopped.exception))


class Index(Library):
    def test_per_set_files_and_the_index(self):
        found = publish.measure(self.jobs, self.audio)
        out = self.dir / 'voice'
        (out).mkdir()
        (out / 'doe-old.json').write_text('{}')  # a set no longer in the library goes
        index = publish.write_index(found, ['https://a.example', 'https://b.example'], self.meta, out)
        self.assertEqual(sorted(p.name for p in out.iterdir()), ['doe-hs-01.json', 'doe-hs-02.json', 'doe-ms-finals.json', 'index.json'])
        self.assertEqual(index['hosts'], ['https://a.example', 'https://b.example'])
        self.assertEqual(index['voice'], 'kokoro:af_heart')
        self.assertEqual(index['recordings'], 11)
        self.assertEqual(index['sample']['key'], key_of(99, 'c'))
        self.assertEqual(index['sample']['ms'], 4008)  # 167 frames of 24 ms
        self.assertEqual(index['sets'], {'doe-hs-01': 5, 'doe-hs-02': 5, 'doe-ms-finals': 1})
        one = json.loads((out / 'doe-hs-01.json').read_text())
        self.assertEqual(list(one), sorted(one))
        first = self.jobs[0]['key']
        self.assertEqual(one[first], [found[first]['ms'], found[first]['v']])
        self.assertEqual(json.loads((out / 'index.json').read_text()), index)

    def test_no_sample_line(self):
        found = publish.measure(self.jobs[:-1], self.audio)
        with self.assertRaises(SystemExit) as stopped:
            publish.write_index(found, ['https://a.example'], self.meta, self.dir / 'voice')
        self.assertIn('sample', str(stopped.exception))


class Deploy(unittest.TestCase):
    def run_stub(self, script: str) -> str:
        folder = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, folder, ignore_errors=True)
        folder = folder / 'rebound-voice-1'
        folder.mkdir()
        stub = folder.parent / 'wrangler_stub.py'
        stub.write_text(script)
        with mock.patch.dict(os.environ, {'REBOUND_WRANGLER': f'{sys.executable} {stub}'}):
            with contextlib.redirect_stdout(io.StringIO()):
                return publish.deploy(folder, None)

    def test_reads_the_address(self):
        url = self.run_stub(
            "print('Uploaded rebound-voice-1 (12.30 sec)')\n"
            "print('Deployed rebound-voice-1 triggers (0.80 sec)')\n"
            "print('  https://rebound-voice-1.someone.workers.dev')\n"
        )
        self.assertEqual(url, 'https://rebound-voice-1.someone.workers.dev')

    def test_not_signed_in(self):
        with self.assertRaises(SystemExit) as stopped:
            self.run_stub("import sys\nprint('You are not authenticated. Please run `wrangler login`.')\nsys.exit(1)\n")
        self.assertIn('wrangler login', str(stopped.exception))

    def test_more_than_one_account(self):
        with self.assertRaises(SystemExit) as stopped:
            self.run_stub("import sys\nprint('More than one account available but unable to select one in non-interactive mode.')\nsys.exit(1)\n")
        self.assertIn('--account', str(stopped.exception))


class FakeWorker(http.server.SimpleHTTPRequestHandler):
    """Serves a staged Worker's files as Cloudflare would: the query string ignored, the _headers rules added."""

    def end_headers(self):
        if self.path.split('?')[0].endswith('.mp3'):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        super().end_headers()

    def log_message(self, *args):
        pass


def serve(folder: Path) -> tuple[str, http.server.ThreadingHTTPServer]:
    handler = lambda *a, **k: FakeWorker(*a, directory=str(folder), **k)  # noqa: E731
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{server.server_address[1]}', server


class Publish(Library):
    def args(self, **more) -> argparse.Namespace:
        values = {'out': str(self.audio), 'hosts': 2, 'account': None, 'stage': str(self.dir / 'publish'), 'index': str(self.dir / 'voice'), 'dry_run': False}
        values.update(more)
        return argparse.Namespace(**values)

    def test_publishes_checks_and_writes_the_index(self):
        servers = []

        def deploy(folder: Path, account):
            url, server = serve(folder / 'files')
            servers.append(server)
            return url

        try:
            with mock.patch.object(publish, 'fresh_jobs', return_value=(self.meta, self.jobs)), mock.patch.object(publish, 'deploy', deploy):
                with contextlib.redirect_stdout(io.StringIO()) as said:
                    publish.publish(self.args())
        finally:
            for server in servers:
                server.shutdown()
        index = json.loads((self.dir / 'voice' / 'index.json').read_text())
        self.assertEqual(len(index['hosts']), 2)
        self.assertEqual(index['recordings'], 11)
        self.assertIn('Published 11 recordings', said.getvalue())
        self.assertIn('git add public/data/voice', said.getvalue())

    def test_a_file_that_came_back_different(self):
        found = publish.measure(self.jobs, self.audio)
        folders = publish.stage(found, 1, self.dir / 'publish')
        for f in (folders[0] / 'files').glob('*.mp3'):
            f.unlink()
            f.write_bytes(recording(500, 7))  # another file under the same name
        url, server = serve(folders[0] / 'files')
        try:
            with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit) as stopped:
                publish.verify([url], found, per_host=2, wait_s=0)
        finally:
            server.shutdown()
        self.assertIn('sent a different file', str(stopped.exception))

    def test_dry_run_uploads_nothing(self):
        with mock.patch.object(publish, 'fresh_jobs', return_value=(self.meta, self.jobs)), mock.patch.object(publish, 'deploy') as deploy:
            with contextlib.redirect_stdout(io.StringIO()):
                publish.publish(self.args(dry_run=True))
        deploy.assert_not_called()
        self.assertFalse((self.dir / 'voice').exists())
        self.assertTrue((self.dir / 'publish' / 'rebound-voice-1' / 'wrangler.json').exists())


@unittest.skipUnless(shutil.which('node') and (publish.ROOT / 'node_modules' / 'tsx').exists(), 'needs Node and npm ci')
class Export(unittest.TestCase):
    def test_the_library_list_has_the_sample_line(self):
        meta, jobs = publish.fresh_jobs()
        self.assertEqual(meta['voice'], 'kokoro:af_heart')
        samples = [j for j in jobs if 'sample' in j['ids']]
        self.assertEqual(len(samples), 1)
        self.assertTrue(all(publish.set_id_of(i) for j in jobs for i in j['ids'] if i != 'sample'))


if __name__ == '__main__':
    unittest.main()
