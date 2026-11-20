# Rebound's voice, made on your own computer

These scripts record every question in the library with [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M), an
open text-to-speech model (Apache 2.0) that runs on your own graphics card, instead of Google's voice. Each question
becomes one MP3 named the way the server names recordings (a hash of the voice and the words the server says, from
`server/src/tts.ts`), so once they are uploaded the server can find them. The whole library is about 23,600
recordings, 70 hours of speech and 1.5 GB.

- `export-library.ts` lists the questions with the exact words the server reads (pronunciation guides left out, math
  and chemistry said in words) and each recording's name.
- `kokoro_voice.py` records them (`generate`), listens back with Whisper to find mistakes (`check`), and says a line
  so you can fix how a word comes out (`try`).

Uploading the recordings and having matches and solo practice play them is the next step; it is not built yet.

The commands below are for PowerShell on Windows, run from your clone of this repository (after `npm ci`).

## 1. Set up, once

You need Node.js 22 and Python 3.12 (Kokoro supports Python 3.10 to 3.12, not 3.13 or newer). With the Python install
manager (the `py` command from python.org), `py install 3.12` adds it beside a newer Python. To keep it on another
drive, run `py install --target=D:\Python312 3.12` instead, and use `D:\Python312\python.exe` where the first line
below says `py -3.12`. Then:

```powershell
py -3.12 -m venv .venv-voice
.venv-voice\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cu128
pip install -r scripts/voice/requirements.txt
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name())"
```

The last line should print `True` and your graphics card. An RTX 50-series card needs PyTorch built for CUDA 12.8
or later (`cu128` above, or a newer one from pytorch.org). If PowerShell refuses to run `Activate.ps1`, run
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. In a new window, activate the environment again
(`.venv-voice\Scripts\Activate.ps1`) before using the scripts.

The first run downloads Kokoro and its voice (about 330 MB) from Hugging Face, and a small English model it uses to
read words. Warnings about symlinks in the Hugging Face cache, `HF_TOKEN`, `weight_norm` and LSTM dropout are
harmless. Every run then checks that espeak-ng (which says the words missing from Kokoro's dictionary) and all of
Kokoro's weights loaded, and stops with a message if not: without espeak-ng, Kokoro would silently leave those words
out.

## 2. Try 50 hard questions first

```powershell
npx tsx scripts/voice/export-library.ts --sample 50 --out voice/sample.jsonl
python scripts/voice/kokoro_voice.py generate voice/sample.jsonl --out voice/sample
```

`--sample 50` picks the questions hardest to say (long science words, math, chemistry, reading guides) from every
subject. Open `voice/sample/listen.html` in a browser to hear each recording beside its text.

Another voice: export again with `--voice`, for example `--voice kokoro:am_michael` (a man's voice) or
`--voice kokoro:bf_emma` (British). `af_heart`, the default, is rated Kokoro's best. A speed goes after the voice:
`--voice kokoro:af_heart@0.9` is 10% slower. The voice and speed are part of each recording's name, so changing
either makes a new set. Counted the way the site counts reading speed (6 characters a word), `af_heart` at speed 1
says about 150 words a minute over typical questions; the site expects its recorded voice to say about 160
(`NATURAL_WPM` in `src/core/speech.ts`). `am_fenrir` and `bf_emma` are about 10% quicker than `af_heart`, and
`am_michael` about 7% slower.

## 3. Fixing a word

```powershell
python scripts/voice/kokoro_voice.py try "Amoebas move by extending pseudopodia." --play
```

It saves `voice/try.mp3`, plays it, and prints the phonemes Kokoro read. If a word is wrong, add a line to
`scripts/voice/pronunciations.tsv`: the word, a tab, and either phonemes between slashes (start from the ones `try`
printed and change what is wrong) or a respelling (`pseudopodia	sue doe poe dee uh`). Try again until it sounds
right, then record the questions with that word again:

```powershell
python scripts/voice/kokoro_voice.py generate voice/sample.jsonl --out voice/sample --force --only-with pseudopodia
```

On Windows set to a language such as Chinese, phonemes saved to a file come out as `?`; running
`$env:PYTHONUTF8 = '1'` in the window first fixes that.

To find the words most likely to be wrong, list those Kokoro has to guess: the words missing from its dictionary,
which espeak-ng says by its spelling rules. It reads the whole library's list, so export that first (step 4):

```powershell
python scripts/voice/kokoro_voice.py words
```

Open `voice/words/words.html` to hear the 300 most used, each said alone beside its phonemes; `words.tsv` lists all of
them, with questions they are in. A word fixed in `pronunciations.tsv` leaves that list, and `fixes.html` says each
fixed word as the recordings will. `abbreviations.html` says each word in capitals that Kokoro says as a word rather
than letter by letter: most are words (NOT, NASA), but an abbreviation among them (ADP said "adp") needs a fix.

A few things to know when adding a fix:

- Abbreviations are spelled with hyphens (`DOE	D-O-E`); chemical formulas need no line, as a rule spells them. Kokoro
  sometimes reads an "A-" at the start of a spelling as the word "a" ("uh"), so those are given phonemes
  (`ADP	/ˌAdˌipˈi/`).
- A word in capitals only is matched only in capitals, so `AMP` leaves "amp" alone; any other matches in any
  capitalization.
- A fix by phonemes applies to the word on its own: given phonemes for part of a hyphenated word, Kokoro drops or
  repeats words, so a hyphenated word gets a fix of its own (`GABA-B`). Chemical names are split at their hyphens
  first (below), so their parts take ordinary fixes (`fructose`).

Besides these fixes, `kokoro_voice.py` follows some rules of its own about what Kokoro reads (`for_kokoro`), each
found by listening to the library. Chemical formulas and element symbols are spelled letter by letter, as Science
Bowl reads them (Kokoro would say "CO2" as "koh two", "NaCl" as "nah C L" and "Cu" as "koo"), with a group's brackets
said, so the number after one is heard to count the group ("Ca(OH)2" is "C A open parenthesis O H close parenthesis
2"), also when a hyphen joins a symbol to a mass number or another symbol ("Pu-239" is "P U 239", "Ti-Cl" "T I C L"),
and DOE's states are said in words ("H_(2(g))" is "H 2, gas"). In math, Kokoro used to pause inside a term: it drew
out an operator and stopped after it ("x minus... 6", "open parenthesis... e to the power of x"). Kokoro decides how
long every sound lasts before it speaks, so `kokoro_voice.py` keeps those gaps to an ordinary gap between words: after
an operator ("plus", "minus", "times", "equals", and "of", "the", "over" next to math), before "squared", "cubed" and
"to the power of", and inside a bracketed group, while a comma after a group, before the operator after it, lets it
breathe between terms. A chemical name is said a part at a time, its positions one by one
("1,3-butadiene" is "1 3 butadiene"; Kokoro said "thirteen butadiene"), and the prefix di- is "dye". Numbers keep
their decimal point and trailing zeros ("4.0M" is "four point zero M", not "four M"). A four-digit number is a number,
not a year ("9525%" is "nine thousand five hundred twenty-five percent"; Kokoro said "ninety-five twenty-five"),
unless it reads as a year: after "in", "since", "by" or a month, in a range of years, before a name ("the 2011 Nobel
Prize") or as the answer to "what year". A word Kokoro would skip because it has no sounds for it (the "238" of
"Uranium-238", "18y", "Cas9") is said on its own. sin, cos, tan and ln are said
"sine", "cosine", "tangent" and "natural log" (also written against their variable, "tanx"), and II, III and IV are
numbers. The variable a is the letter, not the word "a". A genotype in a question about genetics is said "big A
little a", as DOE's guides say one, and a noble-gas core is spelled ("A-R"). An s orbital is "one S", not "ones".
DOE's notes to moderators ("short pause") become pauses, and a single letter ending a sentence keeps its pause.
Curly apostrophes are made straight ("Darcy’s" alone was "Darcy S"). None of these changes the words, and so the
recordings' names.

How the questions themselves are said, for every voice of the site, is decided in `src/core/speech.ts`: DOE's reading
guides, symbols in words, the brackets of math ("open parenthesis x plus 5 close parenthesis squared", and "times"
between two groups, as DOE's own guides read them), factorials, derivatives ("d y over d x"), slashes ("meters per
second", "x over y", "DC to DC", "CRISPR Cas9"), a plain hyphen between numbers ("negative 10", "3 minus 2i", "5 to
10%"), and a stem the answer choices complete, which ends at its colon rather than a full stop. A change there changes the words, and so the names of the recordings it touches.

## 4. The whole library

```powershell
npx tsx scripts/voice/export-library.ts
python scripts/voice/kokoro_voice.py generate
```

The export writes `voice/jobs.jsonl`; `generate` records into `voice/audio`. As it goes it prints how many it has
made, how many times faster than real time it is working, and about how long is left. Stop it any time (Ctrl+C) and
run it again to go on from where it stopped; a question that fails is retried on the next run. To use more of the
computer, run parts at once in separate windows: `generate --shard 1/3`, `generate --shard 2/3` and
`generate --shard 3/3`. On an RTX 5070 Ti, one process works about 63 times faster than real time (about an hour
for the library) and three parts together about 104 times (about 40 minutes); a fourth adds little. `--kbps 32`
makes smaller files (about 1 GB) with slightly less clear speech.

## 5. Check the recordings

```powershell
python scripts/voice/kokoro_voice.py check
```

Whisper (on the graphics card) listens to every recording and compares what it hears with the text. Open
`voice/audio/review.html` for the ones to listen to, worst first: a phrase left out or said twice, or a recording
whose length is odd for what Kokoro was given to say (`review.tsv` has the same list). Whisper also writes some math and chemistry
differently from the text, so expect a few false alarms there. To fix one, delete its MP3 (or fix a pronunciation)
and run `generate` again. `check --no-listen` only compares lengths, in seconds; `--model medium.en` hears more
carefully but is slower.

On an RTX 5070 Ti, Whisper takes about 0.4 seconds a recording: about 2½ hours for the library. What it hears is kept
(`heard.jsonl`), so stop it any time and run it again to go on; a recording made again since is heard again. To go
faster, run `check --shard 1/3`, `check --shard 2/3` and `check --shard 3/3` in separate windows (under 2 hours), then
`check` once more to make the list from all three.

The generated files stay out of git (`voice/` is ignored).
