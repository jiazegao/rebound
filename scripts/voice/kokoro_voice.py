#!/usr/bin/env python3
"""
Rebound's voice, made on your own computer with Kokoro (an open text-to-speech model): see scripts/voice/README.md.

  python scripts/voice/kokoro_voice.py generate [voice/jobs.jsonl] [--out voice/audio] [--limit N] [--shard 1/3]
  python scripts/voice/kokoro_voice.py check    [voice/jobs.jsonl] [--out voice/audio] [--model small.en] [--shard 1/3]
  python scripts/voice/kokoro_voice.py try      "Words to hear" [--voice kokoro:af_heart] [--play]
  python scripts/voice/kokoro_voice.py words    [voice/jobs.jsonl] [--out voice/words] [--top 300]
  python scripts/voice/kokoro_voice.py publish  [--out voice/audio] [--hosts 2] [--account ID] [--dry-run]

generate  Records each question listed by scripts/voice/export-library.ts as <name>.mp3 (mono, 24 kHz), skipping
          those already made, so it can be stopped and started again. For a list of up to 500 (a sample), it also
          writes listen.html, to hear each recording beside its text.
check     Listens to the recordings with Whisper and lists those whose words differ from the text, or whose length is
          odd for it, worst first: review.tsv, and review.html to hear them. What it hears is kept (heard.jsonl), so it
          can be stopped and started again, or run in parts at once.
try       Says a line, prints the phonemes Kokoro reads, and saves it as voice/try.mp3: for fixing how a word is said
          (scripts/voice/pronunciations.tsv).
words     Lists the words Kokoro has to guess (not in its dictionary), most used first, and says each one alone:
          words.html to hear them, words.tsv for the whole list. Those are the likeliest to come out wrong.
publish   Puts the recordings online for the site (scripts/voice/publish.py): checks every one the library needs is
          made, uploads them to two small Cloudflare Workers, and writes the site's index (public/data/voice).

Needs Python 3.10 to 3.12, PyTorch, and scripts/voice/requirements.txt.
"""
from __future__ import annotations

import argparse
import csv
import difflib
import hashlib
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


def lexicon_lines(path: Path | None) -> list[tuple[str, str]]:
    """
    pronunciations.tsv: a word, a tab, and how to say it, either as phonemes between slashes (/fˈinətˌIp/, as `try`
    prints them) or as a respelling (fee no type). Lines starting with # are notes. Only the recording changes: the
    words, and so the recording's name, stay as the server has them.
    """
    if not path or not path.exists():
        return []
    lines = []
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        word, _, say = line.partition('\t')
        word, say = word.strip(), say.strip()
        if word and say:
            lines.append((word, say))
    return lines


def phonemes_of(say: str) -> bool:
    """A fix given as phonemes between slashes, rather than as a respelling."""
    return len(say) > 2 and say.startswith('/') and say.endswith('/')


def word_pattern(word: str, joined: bool = True) -> re.Pattern:
    """
    Where a word or phrase of pronunciations.tsv is in a text: whole, and with `joined`, also as part of a hyphenated
    word ("NaCl-based"). One in capitals only (ADP, OF) matches only in capitals, leaving "amp" and "of" alone; any
    other matches in any capitalization.
    """
    capitals = any(c.isupper() for c in word) and not any(c.islower() for c in word)
    edge = r'\w' if joined else r'[\w-]'
    return re.compile(rf'(?<!{edge})' + re.escape(word) + rf'(?!{edge})', 0 if capitals else re.IGNORECASE)


def load_lexicon(path: Path | None) -> list[tuple[re.Pattern, str]]:
    """
    The fixes in pronunciations.tsv: where each word is, and how to say it. Phonemes are given to Kokoro on the word
    itself, which it gets wrong when the word is joined to another by a hyphen (it drops or repeats words): those fix
    only a word on its own, and a hyphenated word takes a fix of its own (Fructose-1,6-bisphosphate).
    """
    return [(word_pattern(word, joined=not phonemes_of(say)), say) for word, say in lexicon_lines(path)]


# Rules for what Kokoro is given to read, found by listening to the library (scripts/voice/README.md, "Fixing a word").
# None changes the words a question is said with, which its recording's name comes from: only how Kokoro says them.

LETTER_A = '[A](/ˈA/)'  # the letter A, which Kokoro often reads as the word "a" ("uh")

# A note to the moderator inside DOE's reading guides ("A-R-4-s-2-short pause-3-d-9") is a pause, not words to say.
NOTE = re.compile(r'-?\b(?:short|long|brief|slight) pause\b-?|(?<=[\d)] )pause\b|\bpause(?= (?:open|\d))', re.IGNORECASE)

# A noble-gas core ("[Ar] 4s 2") is spelled, as DOE's guides spell it; just before that spelling ("Ar A-R-4-s-2",
# the core and its guide both kept by the reading) it is left out, rather than said twice.
NOBLE_GASES = {'He': 'H-E', 'Ne': 'N-E', 'Ar': 'A-R', 'Kr': 'K-R', 'Xe': 'X-E', 'Rn': 'R-N'}
NOBLE_BEFORE_GUIDE = re.compile(r'\b(He|Ne|Ar|Kr|Xe|Rn) (?=(H-E|N-E|A-R|K-R|X-E|R-N)\b)')
NOBLE_CORE = re.compile(r'\b(He|Ne|Ar|Kr|Xe|Rn)(?= ?\d)')

# A genotype ("AaBb") in a question about genetics is said the way DOE's guides say one, "big A little a big B
# little b"; just before such a guide, it is left out. (Outside genetics, "RR Lyrae" and "aa lava" stay as they are.)
GENETICS = re.compile(
    r'\b(?:genotypes?|phenotypes?|alleles?|homozygous|heterozygous|dominant|recessive|offspring|cross(?:es|ed|ing)?'
    r'|Punnett|gametes?|Mendel\w*|self-fertiliz\w*|\w*hybrid)\b',
    re.IGNORECASE,
)
GENOTYPE = re.compile(r'(?<![\w-])(?:([A-Za-z])(?i:\1))+(?![\w-])')
SIZED_A = re.compile(r'\b(big|little)[- ]([Aa])\b', re.IGNORECASE)  # "big A, little a": the letter, not "uh"

# DOE writes a subscript and a state as "2 H_(2(g))", which the reading keeps as "2 H (2(g))": the subscript goes back
# on its formula and the state is said in words ("2 H2 (gas)"), as for "NaOH ((aq))" ("NaOH (aqueous)").
STATES = {'g': 'gas', 'l': 'liquid', 's': 'solid', 'aq': 'aqueous', 'gas': 'gas', 'liquid': 'liquid', 'solid': 'solid', 'aqueous': 'aqueous'}
SUBSCRIPT_STATE = re.compile(r'(?<=[A-Za-z)]) \((\d+) ?\((g|l|s|aq|gas|liquid|solid|aqueous)\)\)')
DOUBLE_STATE = re.compile(r'\(\((g|l|s|aq|gas|liquid|solid|aqueous)\)\)')

# Chemical formulas are said letter by letter, as Science Bowl reads them: Kokoro says "CO2" as "koh two", "NaCl" as
# "nah C L" and "Cu" as "koo". A formula is a word made only of element symbols, digits and brackets, with a digit, a
# bracket or a two-letter symbol in it (so NO, OF and HIV are left to the fixes); a two-letter symbol on its own (Fe 2
# plus) too, unless it is a word (He, In, As). Kokoro reads a leading "A-" as the word "a", so that A is given its sound.
ELEMENTS = frozenset(
    'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo '
    'Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl '
    'Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr'.split()
)
NOT_FORMULAS = {'HeLa'}
FORMULA = re.compile(r'(?<![\w\[/-])(?<!\d[.,])\d*(?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d*)+(?![\w\]-])')  # not "10,000K"
LONE_SYMBOL = re.compile(
    r'(?<![\w\[/-])(Cu|Na|Fe|Zn|Mg|Ag|Au|Pb|Sn|Hg|Ca|Cl|Br|Mn|Cr|Ni|Li|Rb|Cs|Sr|Ba|Kr|Ne|Xe|Rn|Si|Sb|Cd|Ti|Pt|Pd|Ga|Ge|Se|Te'
    r'|Tl|Sc|Zr|Nb|Ru|Rh|Ir|Hf|Ta|Ar|Al)(?![\w\]-])'
)


def spell(token: str) -> str:
    """
    NaCl -> N-A-C-L, AgCl -> [A](/ˈA/) G-C-L, and a group's brackets said, so the number after one is heard to count the
    group: Ca(OH)2 -> C-A open parenthesis O-H close parenthesis 2.
    """
    words = []
    for run in re.split(r'([()])', token):
        if run in '()':
            words.append({'(': 'open parenthesis', ')': 'close parenthesis'}.get(run, ''))
            continue
        letters = '-'.join(p if p.isdigit() else '-'.join(p.upper()) for p in re.findall(r'\d+|[A-Z][a-z]?', run))
        words.append(f'{LETTER_A} {letters[2:]}' if letters.startswith('A-') else letters)
    return ' '.join(w for w in words if w)


# DOE's own spelling of a formula keeps its brackets ("Ni(CO)4 [N-I(C-O)4]"): they are said too.
SPELLED_GROUP = re.compile(r'(?<![\w\[/-])([A-Z0-9](?:-[A-Z0-9]+)*)\(([A-Z0-9](?:-[A-Z0-9]+)*)\)(\d*)(?![\w\]-])')


# An element symbol joined by a hyphen to a mass number or to another symbol is spelled too: Kokoro said "Pu-239" as
# "poo 239", "Ti-Cl" as "tie C L" and "Cu-H" as "koo H". So is helium in a list of symbols ("Li plus, He."), which
# would be the word "he".
ISOTOPE = re.compile(r'(?<![\w\[/-])([A-Z][a-z])-(\d+m?)(?![\w-])')
BOND = re.compile(r'(?<![\w\[/-])([A-Z][a-z]?(?:-[A-Z][a-z]?)+)(?![\w\]-])')
HELIUM_LISTED = re.compile(r'(?<=, )He(?=[.,;?!]|$)')


def say_bond(m: re.Match) -> str:
    symbols = m.group(1).split('-')
    if not all(s in ELEMENTS for s in symbols) or not any(len(s) == 2 for s in symbols):
        return m.group(0)  # "H-C-O-O-H", "Co-A": already letters, or not symbols
    return ' '.join(spell(s) for s in symbols)


# A chemical name is said a part at a time, as a chemist reads it: "2-methyl-1-propene" is "2 methyl 1 propene" and
# "cis-5,6-dimethyl-1,3-cyclohexadiene" is "cis 5, 6 dimethyl 1, 3 cyclohexadiene". Kokoro ran the parts together, and
# read a list of positions as one number ("1,3-butadiene" was "thirteen butadiene"). A name is a hyphenated word with
# a position or a prefix (di, cis, tert) before a chemical part, or made only of chemical parts ("dichloro-methane").
CHEMICAL_PART = re.compile(
    r'(?i)meth|eth|prop|but|pent|hex|hept|oct|chlor|brom|fluor|iod|nitr|amin|amid|hydrox|cyclo|benz|phen|phosph'
    r'|sulf|carb|cyan|acet|glyc|xyl|tolu|oxy|^\w{3,}(?:ane|ene|yne|ol|al|one|yl|oic|ose|ate|ide|ine|ium)$'  # "oxide", not "side"
)
POSITION = re.compile(r"\(?\d+[′'’]?(?:,\d+[′'’]?)*[A-Z]?\)?|\([RSEZ]\)|[NOS]")
NAME_PREFIXES = {'di', 'tri', 'tetra', 'penta', 'hexa', 'bis', 'tris', 'cis', 'trans', 'tert', 'sec', 'iso', 'neo', 'alpha', 'beta', 'gamma'}
CHEMICAL_NAME = re.compile(r'(?<![\w\[\]/-])[\w,′\'’()]+(?:-[\w,′\'’()]+)+')
LOOSE_POSITION = re.compile(r'(?<=[\d)])-\s+(?=[\d(a-z])|(?<=\b\d), (?=\d+-[A-Za-z])')  # "(R)-2- bromobutane", "1, 1-dichloro"


def say_chemical(m: re.Match) -> str:
    token = m.group(0)
    # Punctuation after the name, and brackets around it ("(2-methylpropane)"), stay as they are.
    head, core, tail = '', token, ''
    while core and (core[-1] in ',;:' or (core[-1] == ')' and core.count(')') > core.count('('))):
        core, tail = core[:-1], core[-1] + tail
    if core.startswith('(') and core.endswith(')') and core.count('(') == 1:
        head, core, tail = '(', core[1:-1], ')' + tail
    parts = core.split('-')
    named = [bool(re.fullmatch(r'[A-Za-z]{3,}', p) and CHEMICAL_PART.search(p)) for p in parts]
    before_name = [i + 1 < len(parts) and named[i + 1] for i in range(len(parts))]
    if not (
        any(POSITION.fullmatch(p) and before_name[i] for i, p in enumerate(parts))
        or any(p.lower() in NAME_PREFIXES and before_name[i] for i, p in enumerate(parts))
        or all(named)
    ):
        return token
    # Positions are said one by one, without a pause between them ("2,4" is "2 4": with a comma, Kokoro rose on the
    # first as if asking).
    return head + ' '.join(re.sub(r',(?=\d)', ' ', p) for p in parts if p) + tail


# The prefix di- is "dye" (DOE's guides spell it "dy-METH-uhl"), which Kokoro said "dih" in a word it had to guess:
# "di-ene", "di-GMP", and a name said a part at a time ("2,2 di methyl"). Whole words are in pronunciations.tsv.
DI = re.compile(r'(?<![\w\[/-])([Dd]i)(?:-|\s+)(?=[A-Za-z])')

# Kokoro takes a curly apostrophe for a quotation mark: "Darcy’s" alone was "Darcy S".
APOSTROPHE = re.compile(r'(?<=[A-Za-z])[’‘](?=[A-Za-z])')


def say_formula(m: re.Match) -> str:
    token = m.group(0)
    symbols = re.findall(r'[A-Z][a-z]?', token)
    if (
        token in NOT_FORMULAS
        or any(s not in ELEMENTS for s in symbols)
        or re.sub(r'[A-Z][a-z]?|\d|[()]', '', token)
        or re.fullmatch(r'\(?[IVX]+\)?', token)  # Roman numerals, not iodine and vanadium
        or token.endswith('s')  # plurals (CFCs, VOCs), not caesium or osmium
        or not (re.search(r'[\d(]', token) or any(len(s) == 2 for s in symbols))
        or (len(symbols) < 2 and not re.search(r'\d', token))
    ):
        return token
    if re.fullmatch(r'\([^()]+\)', token):  # "(CCS)": the brackets stay, for the pause
        return f'({spell(token[1:-1])})'
    return spell(token)


def say_genotype(m: re.Match) -> str:
    token = m.group(0)
    if re.fullmatch(r'[XYZWxyzw]+|II', token):  # sex chromosomes (XX, ZW), and the numeral II
        return token
    if re.match(r'[\s,]*(?:big|little)\b', m.string[m.end() :], re.IGNORECASE):
        return ''
    return ' '.join(('big ' if c.isupper() else 'little ') + (LETTER_A if c in 'Aa' else c.upper()) for c in token)


# A decimal keeps its point and its zeros. Kokoro reads "4.0M" as "four M", "2.0" as "two" and "1.50" as "one point
# five", dropping significant figures: a number with letters stuck on is parted from them, and one ending in a zero is
# said digit by digit ("2 point 0").
STUCK_DECIMAL = re.compile(r'(?<![\w.])(\d+\.\d+)(?=[A-Za-z(])')
TRAILING_ZERO = re.compile(r'(?<![\w.$£€])(\d+)\.(\d*0)(?!\d)(?!\.\d)')  # not money: "$2.00" is "two dollars"

# Misaki reads every four-digit number as a year: "9525%" is "ninety-five twenty-five percent" and "1029" "ten
# twenty-nine". A number that is not a year gets its thousands comma ("9,525"), which misaki reads as a number. A year
# keeps its reading: after "in", "since", "by" or a month ("In 1995", "March 11, 2011", "the spring of 2013"), in a
# range of years ("from 2001 to 2011"), before "'s", an era or a name ("the 1970's", "the 2011 Nobel Prize"), in an
# event ("a landmark 1958 study"), and as a choice when the question asks for a year. So do a steel grade ("1040
# steel") and a radio station ("WDOE 1410"). A round number reads well either way ("fifteen hundred", "two thousand
# five") and is left alone.
FOUR_DIGITS = re.compile(r'(?<![\w.,$£€¥-])([1-9]\d{3})(?![\w-]|[.,]\d)')
_MONTH = r'(?:January|February|March|April|May|June|July|August|September|October|November|December)'
YEAR_BEFORE = re.compile(
    rf'(?:\b(?i:in|since|until|till|years?|from|between|during|before|after|circa)'
    rf'|(?<!divisible )(?<!divided )(?<!multiplied )\b(?i:by)|\b{_MONTH}(?: \d{{1,2}},)?'
    rf'|\b(?:{_MONTH}|spring|summer|fall|autumn|winter|quarter|[Aa]s|Act|eruption|year) of'
    rf'|\b(?i:the) (?:spring|summer|fall|autumn|winter)|\b(?:1\d{{3}}|20\d\d) (?:to|and|or|through)|\b[KW][A-Z]{{2,3}})\s+$'
)
YEAR_AFTER = re.compile(  # a name after it, not a unit named for someone ("2660 Torr")
    r"['’]s\b|\s+(?:B\.?C\.?(?:E\.?)?|A\.?D\.?|C\.?E\.?)(?!\w)|\s+steel\b"
    r'|\s+(?!(?:Torr|Kelvins?|Celsius|Fahrenheit|Newtons?|Joules?|Watts?|Pascals?|Hertz|Volts?|Amperes?|Ohms?|Teslas?'
    r'|Gauss|Calories?|Daltons?)\b)[A-Z][a-z]{2,}'
)
YEAR_EVENT = re.compile(  # "the 1994 Nobel Prize", "his 1801 double-slit experiment"
    r'(?:\s+[\w-]+){0,2}?\s+(?:earthquake|eruption|experiment|study|disaster|season|hurricane|spill|census|election'
    r'|eclipse|flood|tsunami|outbreak|expedition|mission|accident|launch|discovery|survey|report|paper|treaty|act)\b'
)
YEAR_DETERMINER = re.compile(r'\b(?i:the|an?|his|her|its|their|our|what|landmark)\s+$')
YEAR_CHOICE = re.compile(r'(?:^|\s)[WXYZ],\s*$')
YEAR_QUESTION = re.compile(r'\b(?i:what|which|next|following)\s+years?\b')


def say_four_digits(m: re.Match) -> str:
    number, before, after = m.group(1), m.string[: m.start()], m.string[m.end():]
    high, low = divmod(int(number), 100)
    if (low == 0 or (high % 10 == 0 and low < 10) or YEAR_BEFORE.search(before) or YEAR_AFTER.match(after)
            or (YEAR_DETERMINER.search(before) and YEAR_EVENT.match(after))
            or (YEAR_CHOICE.search(before) and re.match(r'\s*(?:[.,;]|$)', after) and YEAR_QUESTION.search(m.string))):
        return number
    return f'{number[0]},{number[1:]}'

# Functions are said by their names, "sine of (x)", not as written ("sin", "cos").
FUNCTIONS = {
    'sin': 'sine', 'cos': 'cosine', 'tan': 'tangent', 'sec': 'secant', 'csc': 'cosecant', 'cot': 'cotangent',
    'arcsin': 'arc sine', 'arccos': 'arc cosine', 'arctan': 'arc tangent', 'sinh': 'hyperbolic sine',
    'cosh': 'hyperbolic cosine', 'tanh': 'hyperbolic tangent', 'ln': 'natural log',
}
FUNCTION = re.compile(r'(?<![A-Za-z-])(' + '|'.join(sorted(FUNCTIONS, key=len, reverse=True)) + r')(?![A-Za-z-])(\s*\()?', re.IGNORECASE)
# A function written against its variable ("tanx/secx", "cosx"), which Kokoro read as a word ("tanks").
FUNCTION_JOINED = re.compile(r'(?<![A-Za-z-])(sin|cos|tan|sec|csc|cot|ln)(x)(?![A-Za-z])')  # x only: "cost" is a word


def say_function(m: re.Match) -> str:
    name = m.group(1).lower()
    if name == 'sec' and not m.group(2) and re.search(r'\d\s*$', m.string[: m.start()]):
        return m.group(0)  # seconds ("10 sec")
    return f' {FUNCTIONS[name]}' + (' of (' if m.group(2) else '')


# Roman numerals: II, III and IV are numbers wherever they are (Photosystem II, iron III); I only after a word that
# numbers things (Population I, Meiosis I), or before "and II", as elsewhere it is a variable or a pronoun.
ROMAN = re.compile(r'(?<![\w-])(III|II|IV)(?![\w-])')
ROMAN_WORDS = {'II': 'two', 'III': 'three', 'IV': 'four'}
ROMAN_ONE = re.compile(
    r'\b((?i:population|type|meiosis|mitosis|photosystem|prophase|metaphase|anaphase|telophase|phase|quadrant|class'
    r'|stage|region|complex|generation|war|polymerase)) I(?![\w-])'
)
ROMAN_ONE_PAIR = re.compile(r'(?<![\w-])I(?= and two\b)')

# An s orbital ("1s 2 2s 2") is a number and a letter, which Kokoro would read as a plural ("ones", "twos").
ORBITAL = re.compile(r'(?<![\w.])([1-7])s(?![\w-])')

# In a long stretch of math Kokoro takes a breath where it likes, and it liked "x minus, 3" and "plus open parenthesis,
# y": a comma after a bracketed group (with its power or denominator), before the operator that follows, lets it
# breathe between terms instead ("... close parenthesis squared over 16, plus open parenthesis ...").
GROUP_END = re.compile(  # an operator, with a term after it: "Co(NH3)4Cl2 plus?" ends with a charge
    r'(close parenthesis(?: (?!(?:plus|minus|times|divided|equals|open|close)\b)[^\s,.;:?!]+){0,5}) '
    r'(?=(?:plus|minus|times|divided by|equals|is less than|is greater than) [^\s,.;:?!])'
)

# Phonemes given on a single letter or word just before a full stop ("block [A](/ˈA/). The") make Kokoro take the two
# for an abbreviation and lose its place in the sentence, so it drops or repeats words after it: a space keeps them apart.
STUCK_STOP = re.compile(r'(\]\(/[^)]*/\))(?=[.?!])')

# The variable a ("a plus b", "where a, b and c are constants") and a capital A within a sentence ("and A is") are the
# letter, which Kokoro would read as the word "a". The word "a" is never followed by these words or by punctuation.
VARIABLE_FOLLOWERS = r'(?:plus|minus|times|over|equals|squared|cubed|divided|and|or|is|are|be|was|were|has|have|to|sub|then|than|multiplied)(?![\w-])'
VARIABLE_A = re.compile(  # not a.m.; after "the" ("the a parameter"); and an operator DOE names ("a star b")
    r'(?<![\w-])a(?![\w-])(?!\.\w)(?=\s*(?:[,.;:?!)]|$)|\s+' + VARIABLE_FOLLOWERS + r'|\s+star\s+[a-z](?![\w-]))'
    r'|(?<=\b[Tt]he )a(?![\w-])(?!\.\w)'
)
CAPITAL_A = re.compile(  # after a word or number ("point A", "3 A"), not after "1) " where a list item starts
    r'(?:(?<=[a-z0-9’\'] )|(?<=[a-z0-9], ))A(?![\w-])|(?<![\w-])A(?![\w-])(?=\s*(?:[,.;:?!)]|$)|\s+' + VARIABLE_FOLLOWERS + ')'
)

# Kokoro takes a single letter before a full stop for an initial ("block A. The", "angle G. Z, ...", "the U.S. W,
# ...") and runs on into the next sentence without a pause: a space before the stop keeps it. Initials themselves
# ("J. J. Thomson"), and "U.S." within a sentence ("the U.S. Navy"), are left as they are.
LETTER_STOP = re.compile(r"(?<![A-Z]\. )(?<!\.)(?<!['’])\b([A-Za-z])\. (?=[A-Z])(?![A-Z]\. )|(?<=\.)([A-Za-z])\. (?=[WXYZ], )")


def for_kokoro(text: str, lexicon: list[tuple[re.Pattern, str]]) -> str:
    """The words as Kokoro reads them: square brackets mean something to it, and the rules above and the fixes apply."""
    text = text.replace('[', '(').replace(']', ')')
    text = NOTE.sub(', ', text)
    text = SUBSCRIPT_STATE.sub(lambda m: f'{m.group(1)} ({STATES[m.group(2)]})', text)
    text = DOUBLE_STATE.sub(lambda m: f'({STATES[m.group(1)]})', text)
    text = NOBLE_BEFORE_GUIDE.sub(lambda m: '' if NOBLE_GASES[m.group(1)] == m.group(2) else m.group(0), text)
    text = NOBLE_CORE.sub(lambda m: NOBLE_GASES[m.group(1)], text)
    if GENETICS.search(text):
        text = GENOTYPE.sub(say_genotype, text)
    text = APOSTROPHE.sub("'", text)
    text = ISOTOPE.sub(lambda m: f'{spell(m.group(1))} {m.group(2)}' if m.group(1) in ELEMENTS else m.group(0), text)
    text = BOND.sub(say_bond, text)
    text = HELIUM_LISTED.sub('H-E', text)
    text = CHEMICAL_NAME.sub(say_chemical, LOOSE_POSITION.sub(lambda m: ',' if ',' in m.group(0) else '-', text))
    # Formulas before the fixes, so a fix for a word in capitals ("CO" "C-O") leaves a formula with it whole ("Ni(CO)4").
    text = FORMULA.sub(say_formula, text)
    text = SPELLED_GROUP.sub(lambda m: f'{m.group(1)} open parenthesis {m.group(2)} close parenthesis {m.group(3)}'.rstrip(), text)
    for pattern, say in lexicon:
        if phonemes_of(say):
            text = pattern.sub(lambda m, say=say: f'[{m.group(0)}]({say})', text)
        else:
            text = pattern.sub(lambda m, say=say: say, text)
    text = DI.sub(r'[\1](/dˈI/) ', text)
    text = LONE_SYMBOL.sub(lambda m: spell(m.group(0)), text)
    text = SIZED_A.sub(lambda m: f'{m.group(1)} {LETTER_A}', text)
    text = ORBITAL.sub(r'\1 s', text)
    text = STUCK_DECIMAL.sub(r'\1 ', text)
    text = TRAILING_ZERO.sub(lambda m: f'{m.group(1)} point ' + ' '.join(m.group(2)), text)
    text = FOUR_DIGITS.sub(say_four_digits, text)
    text = FUNCTION_JOINED.sub(lambda m: f' {FUNCTIONS[m.group(1)]} {m.group(2)}', text)
    text = FUNCTION.sub(say_function, text)
    text = ROMAN.sub(lambda m: ROMAN_WORDS[m.group(1)], text)
    text = ROMAN_ONE.sub(r'\1 one', text)
    text = ROMAN_ONE_PAIR.sub('one', text)
    text = VARIABLE_A.sub(LETTER_A, text)
    text = CAPITAL_A.sub(LETTER_A, text)
    text = GROUP_END.sub(r'\1, ', text)
    text = LETTER_STOP.sub(lambda m: (m.group(1) or m.group(2)) + ' . ', text)
    text = STUCK_STOP.sub(r'\1 ', text)
    return re.sub(r' {2,}', ' ', re.sub(r'\s+,', ',', text)).strip()


# Kokoro decides how long every sound lasts before it speaks, and in math it often drew out an operator and paused
# after it, inside a term: "x minus... 6" (its last sound held 250 ms, then a pause), "open parenthesis... e to the
# power of x". In math, the gap after an operator ("minus", "of" in "the power of"), before "squared" or "cubed", and
# every gap inside a bracketed group are kept to an ordinary gap between words; it still breathes between terms.
# The words are matched by their phonemes, as misaki writes them (a stress mark may come before any vowel).
_S = '[ˈˌ]?'
_M = '[ˈˌ]'  # stressed, as letters and numbers always are: "four" is fˈɔɹ, "for" fɔɹ; "two" tˈu, "to" tə
GAP_AFTER = re.compile(rf'^(?:pl{_S}ʌs|m{_S}Inəs|t{_S}Imz|{_S}ikwᵊlz|p{_S}Wəɹ)$')  # plus, minus, times, equals, power
GAP_AFTER_NEAR_MATH = re.compile(  # words that are math only next to math ("the square root of x", not "square feet")
    rf'^(?:{_S}[ʌə]v|t{_S}ə|ð{_S}[əi]|b{_S}I|{_S}Ovəɹ|n{_S}ɛɡəTɪv|{_S}Opᵊn|kl{_S}O[sz]|s{_S}ʌb|ɹ{_S}ut|l{_S}ɔɡ|b{_S}As|kw{_S}ɑntəTi'
    rf'|skw{_S}ɛɹ|kj{_S}ub|v{_S}ælju)$'  # of, to, the, by, over, negative, open, close, sub, root, log, base, quantity, ...
)
GAP_BEFORE = re.compile(rf'^(?:skw{_S}ɛɹd|kj{_S}ubd|fækt{_S}ɔɹiəl|pɹ{_S}Im)$')  # squared, cubed, factorial, prime
MATH_WORD = re.compile(
    rf'^(?:{_M}A|b{_M}i|s{_M}i|d{_M}i|{_M}i|{_M}ɛf|ʤ{_M}i|{_M}Aʧ|{_M}I|k{_M}A|{_M}ɛl|{_M}ɛm|{_M}ɛn|{_M}O|p{_M}i|kj{_M}u|{_M}ɑɹ|{_M}ɛs'
    rf'|t{_M}i|j{_M}u|v{_M}i|d{_M}ʌbᵊlju|{_M}ɛks|w{_M}I|z{_M}i|p{_M}I|θ{_M}ATə|z{_M}ɪɹO|w{_M}ʌn|t{_M}u|θɹ{_M}i|f{_M}ɔɹ|f{_M}Iv|s{_M}ɪks'
    rf'|s{_M}ɛvən|{_M}At|n{_M}In|t{_M}ɛn|əl{_M}ɛvən|tw{_M}ɛlv|h{_M}ʌndɹəd|θ{_M}Wzənd)$'  # letters, pi, theta, numbers
)
OPEN_BRACKET = re.compile(rf'^{_S}Opᵊn$')
CLOSE_BRACKET = re.compile(rf'^kl{_S}O[sz]$')
BRACKET = re.compile(rf'^pəɹ{_S}ɛnθəsɪs$')
TO, THE, POWER, OVER = (re.compile(rf'^{p}$') for p in (rf't{_S}[əu]', rf'ð{_S}[əi]', rf'p{_S}Wəɹ', rf'{_S}Ovəɹ'))


def math_gaps(phonemes: str) -> set[int]:
    """Where in Kokoro's phonemes a gap between words is kept short: the positions of those spaces."""
    words = [(m.end(), m.group(0)) for m in re.finditer(r'\S+', phonemes)]
    core = lambda w: w.rstrip(',.;:?!').strip('()')  # noqa: E731  (a bracket of the text, "(1 over 2)", is part of a word)
    math = lambda w: bool(  # noqa: E731
        MATH_WORD.match(w) or GAP_AFTER.match(w) or GAP_BEFORE.match(w) or BRACKET.match(w) or OPEN_BRACKET.match(w) or re.search(r'\d', w)
    )
    gaps, depth = set(), 0
    for n, (end, word) in enumerate(words[:-1]):
        here, previous = core(word), core(words[n - 1][1]) if n else ''
        following = [core(w) for _, w in words[n + 1 : n + 4]]
        # After "close parenthesis", or a bracket of the text, it breathes as it likes: the group is said.
        closed = bool(BRACKET.match(here) and CLOSE_BRACKET.match(previous)) or word.rstrip(',.;:?!').endswith(')')
        if BRACKET.match(here) and CLOSE_BRACKET.match(previous):
            depth = max(0, depth - 1)
        if OPEN_BRACKET.match(here) and BRACKET.match(following[0]):
            depth += 1
        if word.rstrip(',.;:?!') != word:
            continue  # punctuation: a pause belongs there
        # What belongs to the term before it: "squared", "cubed", "to the power of" ("close parenthesis to the power of").
        power = len(following) == 3 and TO.match(following[0]) and THE.match(following[1]) and POWER.match(following[2])
        # A simple fraction, "1 over 2", is one term.
        fraction = OVER.match(following[0]) and MATH_WORD.match(here) and len(following) > 1 and MATH_WORD.match(following[1])
        if (
            GAP_BEFORE.match(following[0])
            or power
            or fraction
            or (not closed and (depth > 0 or GAP_AFTER.match(here) or (GAP_AFTER_NEAR_MATH.match(here) and math(following[0]))))
        ):
            gaps.add(end)
    return gaps


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
        self.check_install()
        self.device = str(self.pipeline.model.device)
        if self.device.startswith('cuda'):
            import torch

            self.device += f' ({torch.cuda.get_device_name()})'
        print(f'Kokoro voice {name} at speed {speed:g}, running on {self.device}.')

    def check_install(self) -> None:
        """
        Stops on the two ways an install goes wrong without an error. Without espeak-ng, Kokoro leaves out every word
        missing from its dictionary, and science is full of them. And Kokoro loads its weights leniently: one whose name
        a newer transformers has changed would keep random values, and the voice would sound worse.
        """
        import torch
        from huggingface_hub import hf_hub_download

        if getattr(self.pipeline.g2p, 'fallback', None) is None:
            sys.exit('espeak-ng did not load (see the warning above), so Kokoro would leave out every word it does not know.')
        model = self.pipeline.model
        path = hf_hub_download(repo_id=model.repo_id, filename=type(model).MODEL_NAMES[model.repo_id])
        for part, weights in torch.load(path, map_location='cpu', weights_only=True).items():
            module = getattr(model, part)
            # As Kokoro loads them (the file's names start with "module."), but listing what is missing. The file leaves
            # out the scale and shift of Kokoro's InstanceNorm layers on purpose: they start at 1 and 0, and change nothing.
            missing = [
                key
                for key in module.load_state_dict({k.removeprefix('module.'): v for k, v in weights.items()}, strict=False).missing_keys
                if not isinstance(module.get_submodule(key.rpartition('.')[0]), torch.nn.InstanceNorm1d)
            ]
            if missing:
                cause = (
                    'the installed transformers may be too new for Kokoro. Try  pip install "transformers<5"'
                    if part == 'bert'  # the one part transformers builds
                    else 'the installed PyTorch may be too new for Kokoro'
                )
                sys.exit(f"Kokoro's {part} did not load {len(missing)} of its weights (such as {missing[0]}): {cause}.")

    def say(self, text: str) -> tuple[np.ndarray, list[str]]:
        """The audio (24 kHz, float) and the phonemes Kokoro read, chunk by chunk."""
        parts: list[np.ndarray] = []
        phonemes: list[str] = []
        tokens = self.pipeline.g2p(text)[1]
        # Now and then misaki gives a word no phonemes ("18" in "plus 18y plus", "-10"), and Kokoro would leave it out
        # without a word: such a word is said on its own.
        for token in tokens:
            if not token.phonemes and re.search(r'[A-Za-z0-9]', token.text):
                alone = self.pipeline.g2p(re.sub(r'^-(?=\d)', 'minus ', token.text))[1]
                token.phonemes = ' '.join(t.phonemes for t in alone if t.phonemes)
        # As KPipeline does it (its words to phonemes, in chunks Kokoro can say at once), with the gaps in math kept short.
        for _, ps, _ in self.pipeline.en_tokenize(tokens):
            if not ps:
                continue
            ps = ps[:510]
            phonemes.append(ps)
            parts.append(self.speak(ps, math_gaps(ps)))
        if not parts:
            raise RuntimeError('Kokoro made no audio')
        return np.concatenate(parts), phonemes

    def speak(self, phonemes: str, short_gaps: set[int]) -> np.ndarray:
        """
        Kokoro's own forward pass (KModel.forward_with_tokens), but with the gaps at `short_gaps` (positions in
        `phonemes`) kept to an ordinary gap between words (2 frames of 25 ms), and the sound before each no longer than
        3 frames. Pitch and loudness are predicted after the lengths, so the voice runs on over a gap kept short.
        """
        import torch

        model = self.pipeline.model
        if not hasattr(self, 'pack'):
            self.pack = self.pipeline.load_voice(self.name).to(model.device)
        keep = [k for k, c in enumerate(phonemes) if model.vocab.get(c) is not None]  # as KModel.forward drops the rest
        place = {k: n + 1 for n, k in enumerate(keep)}  # a phoneme's place among the ids, after the start token
        with torch.no_grad():
            ids = torch.LongTensor([[0, *(model.vocab[phonemes[k]] for k in keep), 0]]).to(model.device)
            ref_s = self.pack[len(phonemes) - 1].to(model.device)
            lengths = torch.full((1,), ids.shape[-1], device=model.device, dtype=torch.long)
            mask = torch.gt(torch.arange(lengths.max()).unsqueeze(0).type_as(lengths) + 1, lengths.unsqueeze(1)).to(model.device)
            d_en = model.bert_encoder(model.bert(ids, attention_mask=(~mask).int())).transpose(-1, -2)
            style = ref_s[:, 128:]
            d = model.predictor.text_encoder(d_en, style, lengths, mask)
            x, _ = model.predictor.lstm(d)
            duration = torch.sigmoid(model.predictor.duration_proj(x)).sum(axis=-1) / self.speed
            frames = torch.round(duration).clamp(min=1).long().squeeze()
            for k in short_gaps:
                if k in place:
                    frames[place[k]] = min(int(frames[place[k]]), 2)
                if k - 1 in place:
                    frames[place[k - 1]] = min(int(frames[place[k - 1]]), 3)
            indices = torch.repeat_interleave(torch.arange(ids.shape[1], device=model.device), frames)
            alignment = torch.zeros((ids.shape[1], indices.shape[0]), device=model.device)
            alignment[indices, torch.arange(indices.shape[0])] = 1
            alignment = alignment.unsqueeze(0)
            f0, energy = model.predictor.F0Ntrain(d.transpose(-1, -2) @ alignment, style)
            asr = model.text_encoder(ids, lengths, mask) @ alignment
            audio = model.decoder(asr, f0, energy, ref_s[:, :128]).squeeze()
        return audio.detach().cpu().numpy().astype(np.float32)


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


def open_log(path: Path):
    """Opens a list to add lines to, first ending a line left unfinished by a run stopped while writing it."""
    unfinished = False
    if path.exists() and path.stat().st_size:
        with path.open('rb') as f:
            f.seek(-1, os.SEEK_END)
            unfinished = f.read(1) != b'\n'
    log = path.open('a', encoding='utf-8')
    if unfinished:
        log.write('\n')
    return log


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
        found = [word_pattern(w) for w in args.only_with]
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
        with open_log(manifest) as log:
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
            try:
                row = json.loads(line)
                made[row['key']] = row
            except (ValueError, KeyError):
                continue  # an empty line, or the last one of a run that was stopped while writing it
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


def stamp(path: Path) -> str:
    """A recording's size and time, which change when it is made again (after fixing how a word is said)."""
    info = path.stat()
    return f'{info.st_size}:{info.st_mtime_ns}'


def read_heard(out: Path) -> dict[tuple[str, str, str], str]:
    """What Whisper heard in earlier runs (heard*.jsonl), by recording, model and stamp."""
    heard: dict[tuple[str, str, str], str] = {}
    for path in sorted(out.glob('heard*.jsonl')):
        for line in path.read_text(encoding='utf-8').splitlines():
            try:
                row = json.loads(line)
                heard[(row['key'], row['model'], row['stamp'])] = row['heard']
            except (ValueError, KeyError):
                continue  # an empty line, or the last one of a run that was stopped while writing it
    return heard


def check(args: argparse.Namespace, hear=None) -> None:
    meta, jobs = read_jobs(Path(args.jobs))
    out = Path(args.out)
    made = read_manifests(out)
    present = [j for j in jobs if (out / f"{j['key']}.mp3").exists()]
    if not present:
        sys.exit(f'No recordings in {out} yet: run generate first.')
    # Pace is measured on what Kokoro reads: a formula spelled out, or a bracket said, takes longer than its text.
    lexicon = load_lexicon(Path(args.lexicon) if getattr(args, 'lexicon', None) else DEFAULT_LEXICON)
    length = {j['key']: len(re.sub(r'\[([^\]]*)\]\(/[^)]*/\)', r'\1', for_kokoro(j['text'], lexicon))) for j in present}
    paces = [length[j['key']] / (made[j['key']]['ms'] / 1000) for j in present if j['key'] in made and made[j['key']]['ms'] > 0]
    usual = statistics.median(paces) if paces else 15.0
    # What Whisper hears is kept as it goes (heard.jsonl), so check can be stopped and started again, and run in parts
    # at once (--shard). A recording made again since is heard again.
    stamps = {j['key']: stamp(out / f"{j['key']}.mp3") for j in present}
    transcripts = {} if args.no_listen else read_heard(out)
    said = lambda job: transcripts.get((job['key'], args.model, stamps[job['key']]))  # noqa: E731
    if not args.no_listen:
        part, parts = shard_of(args.shard)
        mine = {j['key'] for i, j in enumerate(jobs) if i % parts == part}
        todo = [j for j in present if j['key'] in mine and said(j) is None]
        print(
            f'Listening to {len(todo):,} of the {len(present):,} recordings with Whisper {args.model}'
            + (f' (part {part + 1} of {parts})' if parts > 1 else '')
            + f'; {len(present) - len(todo):,} heard before or left to other parts.'
        )
        if todo:
            hear = hear or listener(args.model, args.device)
            started = time.time()
            with open_log(out / (f'heard-{part + 1}of{parts}.jsonl' if parts > 1 else 'heard.jsonl')) as log:
                for n, job in enumerate(todo, 1):
                    key = (job['key'], args.model, stamps[job['key']])
                    transcripts[key] = hear(out / f"{job['key']}.mp3")
                    log.write(json.dumps({'key': key[0], 'model': key[1], 'stamp': key[2], 'heard': transcripts[key]}) + '\n')
                    log.flush()
                    if n % 100 == 0 or n == len(todo):
                        took = time.time() - started
                        print(f'  listened to {n:,}/{len(todo):,}, about {clock(took / n * (len(todo) - n))} to go', flush=True)
    rows = []
    for job in present:
        ms = made.get(job['key'], {}).get('ms') or 0
        pace = length[job['key']] / (ms / 1000) if ms else usual
        heard = said(job)
        similarity, missing, added = compare(job['text'], heard) if heard is not None else (None, 0, 0)
        found = problems(similarity, missing, added, pace, usual)
        if found:
            badness = (1 - (similarity if similarity is not None else 1)) + 0.1 * missing + 0.05 * added + (0.3 if 'quick' in ' '.join(found) or 'slow' in ' '.join(found) else 0)
            rows.append((badness, '; '.join(found), similarity, job, heard or ''))
    unheard = sum(1 for j in present if said(j) is None)
    if unheard and not args.no_listen:
        print(f'{unheard:,} recordings not heard yet (other parts still running?): their lengths are checked, and their words will be once check runs again.')
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


# ---------------- words ----------------


def guessed_words(args: argparse.Namespace) -> None:
    """
    The words Kokoro has to guess, most used first: those missing from its dictionary, which espeak-ng says by its
    spelling rules. They are the likeliest to come out wrong, so listening to each one alone finds most of the words to
    fix. A word fixed in pronunciations.tsv leaves the list.
    """
    from collections import Counter

    meta, jobs = read_jobs(Path(args.jobs))
    name, speed = parse_voice(meta['voice'])
    lexicon = load_lexicon(Path(args.lexicon) if args.lexicon else DEFAULT_LEXICON)
    voice = Voice(name, speed, args.device)
    found: dict[str, dict] = {}
    for n, job in enumerate(jobs, 1):
        for token in voice.pipeline.g2p(for_kokoro(job['text'], lexicon))[1]:
            if token._.rating != 2 or not token.phonemes:  # 2: espeak-ng's guess (4 and 3: Kokoro's dictionaries, 5: a fix)
                continue
            # A number or a letter with punctuation stuck to it ("8)", "x?") is guessed only for the punctuation.
            text = token.text.strip('.,;:!?()[]{}"\'‘’“”')
            if not text or re.fullmatch(r'[\d.,]+|\w', text):
                continue
            word = found.setdefault(text.lower().replace('’', "'"), {'count': 0, 'forms': Counter(), 'phonemes': Counter(), 'ids': []})
            word['count'] += 1
            word['forms'][text] += 1
            word['phonemes'][token.phonemes] += 1
            if len(word['ids']) < 3 and job['ids'][0] not in word['ids']:
                word['ids'].append(job['ids'][0])
        if n % 2000 == 0 or n == len(jobs):
            print(f'  read {n:,}/{len(jobs):,} recordings: {len(found):,} words guessed', flush=True)
    ranked = sorted(found.items(), key=lambda item: (-item[1]['count'], item[0]))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    with (out / 'words.tsv').open('w', encoding='utf-8', newline='') as f:
        table = csv.writer(f, delimiter='\t')
        table.writerow(['word', 'times', 'phonemes', 'questions'])
        for word, info in ranked:
            table.writerow([info['forms'].most_common(1)[0][0], info['count'], info['phonemes'].most_common(1)[0][0], ' '.join(info['ids'])])
    rows = []
    # Math without letters ("-8", "(-2)(-5)") is heard in its question, not alone: Kokoro says nothing for some of it alone.
    for word, info in [item for item in ranked if re.search(r'[^\W\d_]', item[0])][: args.top]:
        said = info['forms'].most_common(1)[0][0]
        file = re.sub(r'[^a-z0-9]+', '-', word).strip('-') + '-' + hashlib.sha1(word.encode('utf-8')).hexdigest()[:6] + '.mp3'
        try:
            write_file(out / file, mp3(tidy(voice.say(said)[0]), args.kbps))
        except Exception as error:
            print(f'  could not say {said!r}: {error}', file=sys.stderr)
            continue
        rows.append(
            f'<li><audio controls preload="none" src="{file}"></audio><p><b>{html.escape(said)}</b> &nbsp;/{html.escape(info["phonemes"].most_common(1)[0][0])}/'
            f' &nbsp;<small>{info["count"]:,} times: {html.escape(", ".join(info["ids"]))}</small></p></li>'
        )
    (out / 'words.html').write_text(page_html(f'The {len(rows)} words Kokoro guesses most often, {meta["voice"]}', rows), encoding='utf-8')
    # The words already fixed leave the list above, so they are said here, as the recordings will say them.
    fixes = []
    for word, say in lexicon_lines(Path(args.lexicon) if args.lexicon else DEFAULT_LEXICON):
        file = 'fix-' + hashlib.sha1(word.encode('utf-8')).hexdigest()[:8] + '.mp3'
        try:
            write_file(out / file, mp3(tidy(voice.say(for_kokoro(word, lexicon))[0]), args.kbps))
        except Exception as error:
            print(f'  could not say {word!r}: {error}', file=sys.stderr)
            continue
        fixes.append(f'<li><audio controls preload="none" src="{file}"></audio><p><b>{html.escape(word)}</b> &nbsp;{html.escape(say)}</p></li>')
    (out / 'fixes.html').write_text(page_html(f'The {len(fixes)} words fixed in pronunciations.tsv, {meta["voice"]}', fixes), encoding='utf-8')
    # Words in capitals that Kokoro says as a word rather than letter by letter, as the recordings will say them: most
    # are words (NOT, NASA), but an abbreviation among them (ADP said "adp") needs a fix, which these lists would miss.
    def sounds(text: str) -> str:
        return re.sub(r'[ˈˌ\s]', '', ''.join(t.phonemes or '' for t in voice.pipeline.g2p(text)[1]))

    capitals = Counter(m.group(0) for job in jobs for m in re.finditer(r'(?<![\w-])[A-Z]{2,6}(?![\w-])', job['text']))
    found_in = {}
    for job in jobs:
        for m in re.finditer(r'(?<![\w-])[A-Z]{2,6}(?![\w-])', job['text']):
            found_in.setdefault(m.group(0), job['ids'][0])
    said_as_word = []
    for word, count in capitals.most_common():
        said = for_kokoro(word, lexicon)
        if sounds(said) == ''.join(LETTER_SOUNDS[c] for c in word):
            continue
        file = 'caps-' + hashlib.sha1(word.encode('utf-8')).hexdigest()[:8] + '.mp3'
        try:
            write_file(out / file, mp3(tidy(voice.say(said)[0]), args.kbps))
        except Exception as error:
            print(f'  could not say {word!r}: {error}', file=sys.stderr)
            continue
        said_as_word.append(
            f'<li><audio controls preload="none" src="{file}"></audio><p><b>{html.escape(word)}</b> &nbsp;<small>{count:,} times, '
            f'as in {html.escape(found_in[word])}</small></p></li>'
        )
    (out / 'abbreviations.html').write_text(
        page_html(f'The {len(said_as_word)} words in capitals Kokoro says as a word, not letter by letter, {meta["voice"]}', said_as_word), encoding='utf-8'
    )
    print(
        f'{len(ranked):,} words guessed, used {sum(i["count"] for _, i in ranked):,} times: {out / "words.html"} (the {len(rows)} most used) '
        f'and words.tsv (all); {out / "fixes.html"} says the {len(fixes)} words fixed, and {out / "abbreviations.html"} the '
        f'{len(said_as_word)} in capitals said as a word.'
    )


# Each letter's name as Kokoro says it (its phonemes, without stress marks): a word in capitals said as these, one after
# another, is spelled out.
LETTER_SOUNDS = dict(zip(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    ['A', 'bi', 'si', 'di', 'i', 'ɛf', 'ʤi', 'Aʧ', 'I', 'ʤA', 'kA', 'ɛl', 'ɛm', 'ɛn', 'O', 'pi', 'kju', 'ɑɹ', 'ɛs', 'ti', 'ju', 'vi',
     'dʌbᵊlju', 'ɛks', 'wI', 'zi'],
))


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
    c.add_argument('--shard', help='listen to this part, like 1/3: run 1/3, 2/3 and 3/3 at once, then check again to list them all')

    t = commands.add_parser('try', help='say a line, to hear how a word comes out')
    common(t, with_jobs=False)
    t.add_argument('text')
    t.add_argument('--voice', default='kokoro:af_heart')
    t.add_argument('--out', default=str(Path('voice') / 'try.mp3'))
    t.add_argument('--kbps', type=int, default=48)
    t.add_argument('--lexicon', help='pronunciation fixes (scripts/voice/pronunciations.tsv)')
    t.add_argument('--play', action='store_true', help='open it in the default player (Windows)')

    w = commands.add_parser('words', help='list the words Kokoro has to guess, most used first, and say each one')
    w.add_argument('jobs', nargs='?', default=str(Path('voice') / 'jobs.jsonl'), help='the list from export-library.ts (voice/jobs.jsonl)')
    w.add_argument('--out', default=str(Path('voice') / 'words'), help='the folder for the list and the recordings (voice/words)')
    common(w, with_jobs=False)
    w.add_argument('--top', type=int, default=300, help='say this many of the most used (300); words.tsv lists them all')
    w.add_argument('--kbps', type=int, default=48)
    w.add_argument('--lexicon', help='pronunciation fixes (scripts/voice/pronunciations.tsv)')

    from publish import add_arguments as publish_arguments, publish

    pub = commands.add_parser('publish', help='put the recordings online for the site (scripts/voice/publish.py)')
    publish_arguments(pub)

    args = parser.parse_args(argv)
    # A Windows console that is not set to UTF-8 should show a ? for a phoneme, not stop the run.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(errors='replace')
    {'generate': generate, 'check': check, 'try': try_line, 'words': guessed_words, 'publish': publish}[args.command](args)


if __name__ == '__main__':
    main()
