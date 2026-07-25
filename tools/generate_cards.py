#!/usr/bin/env python3
"""Generate the structural card dataset for the app.

Source of truth is the approved Claude Design HTML, whose ARCANA table carries
numeral / name / astrological glyph / keywords / upright / reversed for all 22
Majors. This script transcribes it once, mechanically, and enriches it with the
fields the combination engine needs.

    python3 tools/generate_cards.py

Writes src/data/cards.json          structural data the app imports
       docs/seed-meanings.en.json   English seed lines, for content authoring

Card names stay English on purpose: the artwork has its title rendered into the
image ("THE FOOL"), so an Indonesian display name would contradict the card the
user is looking at. Keywords and every word of reading copy are Indonesian.
"""

import json
from pathlib import Path

# Glyph -> element. Zodiacal cards take their sign's element; planetary cards
# take the element of the sign they rule. Drives `dominantElement` in the
# combination engine.
GLYPH_ELEMENT = {
    "✧": "air",    "☿": "air",    "☾": "water",  "♀": "earth",
    "♈": "fire",   "♉": "earth",  "♊": "air",    "♋": "water",
    "♌": "fire",   "♍": "earth",  "♃": "fire",   "♎": "air",
    "♆": "water",  "♏": "water",  "♐": "fire",   "♑": "earth",
    "♂": "fire",   "♒": "air",    "♓": "water",  "☉": "fire",
    "♇": "water",  "♄": "earth",
}

# id, slug, numeral, name, glyph, keywords(id), polarity, yesno, upright, reversed
ARCANA = [
    (0,  "00_fool",             "0",     "The Fool",         "✧", ["lompatan", "kepolosan", "percaya"],           "light",   "yes",   "a beginning taken on trust",  "a leap made carelessly"),
    (1,  "01_magician",         "I",     "The Magician",     "☿", ["kehendak", "fokus", "keahlian"],              "light",   "yes",   "power directed with intent",  "talent spent on illusion"),
    (2,  "02_high_priestess",   "II",    "The High Priestess","☾", ["rahasia", "intuisi", "kedalaman"],           "neutral", "maybe", "knowledge held in silence",   "an inner voice ignored"),
    (3,  "03_empress",          "III",   "The Empress",      "♀", ["kelimpahan", "merawat", "tubuh"],             "light",   "yes",   "something growing and fed",   "care given past its limit"),
    (4,  "04_emperor",          "IV",    "The Emperor",      "♈", ["ketertiban", "otoritas", "struktur"],         "neutral", "yes",   "structure that steadies you", "control mistaken for strength"),
    (5,  "05_hierophant",       "V",     "The Hierophant",   "♉", ["tradisi", "ajaran", "ikrar"],                 "neutral", "yes",   "wisdom passed down",          "dogma outliving its use"),
    (6,  "06_lovers",           "VI",    "The Lovers",       "♊", ["penyatuan", "pilihan", "keselarasan"],        "light",   "yes",   "a choice made with the whole self", "a self divided"),
    (7,  "07_chariot",          "VII",   "The Chariot",      "♋", ["dorongan", "kemenangan", "pelindung"],        "light",   "yes",   "momentum you can steer",      "force without direction"),
    (8,  "08_strength",         "VIII",  "Strength",         "♌", ["keberanian", "kesabaran", "menjinakkan"],     "light",   "yes",   "gentleness that governs",     "courage spent on the wrong beast"),
    (9,  "09_hermit",           "IX",    "The Hermit",       "♍", ["kesunyian", "pelita", "pencarian"],           "neutral", "no",    "withdrawal that clarifies",   "isolation dressed as wisdom"),
    (10, "10_wheel_of_fortune", "X",     "Wheel of Fortune", "♃", ["perputaran", "takdir", "siklus"],             "neutral", "maybe", "the turn arriving",           "resisting the turn"),
    (11, "11_justice",          "XI",    "Justice",          "♎", ["keseimbangan", "kebenaran", "sebab"],         "neutral", "maybe", "the honest reckoning",        "a scale weighted by fear"),
    (12, "12_hanged_man",       "XII",   "The Hanged Man",   "♆", ["penangguhan", "pembalikan", "sudut pandang"],  "shadow",  "no",    "surrender that reveals",      "waiting used as escape"),
    (13, "13_death",            "XIII",  "Death",            "♏", ["akhir", "ambang", "pelepasan"],               "shadow",  "no",    "an ending that frees",        "clinging to what is over"),
    (14, "14_temperance",       "XIV",   "Temperance",       "♐", ["perpaduan", "ukuran", "penyelarasan"],        "light",   "maybe", "the patient middle way",      "extremes that will not mix"),
    (15, "15_devil",            "XV",    "The Devil",        "♑", ["belenggu", "hasrat", "bayangan"],             "shadow",  "no",    "the chain you can see",       "a hunger left unnamed"),
    (16, "16_tower",            "XVI",   "The Tower",        "♂", ["keruntuhan", "kilat", "kebenaran"],           "shadow",  "no",    "the necessary collapse",      "a warning unheeded"),
    (17, "17_star",             "XVII",  "The Star",         "♒", ["harapan", "ketenangan", "bimbingan"],         "light",   "yes",   "quiet hope after ruin",       "faith set on a false light"),
    (18, "18_moon",             "XVIII", "The Moon",         "♓", ["mimpi", "ilusi", "pasang"],                   "shadow",  "no",    "what the dark is telling you", "fear mistaken for omen"),
    (19, "19_sun",              "XIX",   "The Sun",          "☉", ["kejelasan", "sukacita", "vitalitas"],         "light",   "yes",   "plain and warming truth",     "glare that hides the detail"),
    (20, "20_judgement",        "XX",    "Judgement",        "♇", ["kebangkitan", "panggilan", "perhitungan"],    "neutral", "yes",   "the call you must answer",    "a summons postponed"),
    (21, "21_world",            "XXI",   "The World",        "♄", ["penyelesaian", "keutuhan", "kembali"],         "light",   "yes",   "the circle closed",           "an ending declared too soon"),
]


def stage_for(card_id):
    """Partition the Fool's Journey. Feeds `dominantStage` in the rule engine."""
    if card_id <= 7:
        return "beginning"
    if card_id <= 14:
        return "trial"
    return "reckoning"


def main():
    root = Path(__file__).resolve().parent.parent
    cards, seeds = [], {}

    for cid, slug, numeral, name, glyph, keywords, polarity, yesno, upright, reversed_ in ARCANA:
        cards.append({
            "id": cid,
            "slug": slug,
            "numeral": numeral,
            "name": name,
            "glyph": glyph,
            "element": GLYPH_ELEMENT[glyph],
            "stage": stage_for(cid),
            "polarity": polarity,
            "yesno": yesno,
            "keywords": keywords,
        })
        seeds[slug] = {"name": name, "upright": upright, "reversed": reversed_}

    assert len(cards) == 22, f"expected 22 cards, built {len(cards)}"
    assert [c["id"] for c in cards] == list(range(22)), "card ids must be 0..21 in order"

    art_dir = root / "assets" / "cards"
    if art_dir.is_dir():
        missing = [c["slug"] for c in cards if not (art_dir / f"{c['slug']}.webp").is_file()]
        if missing:
            raise SystemExit(f"missing normalized art: {', '.join(missing)}\n"
                             f"run: python3 tools/normalize_cards.py")

    data_dir = root / "src" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "cards.json").write_text(
        json.dumps(cards, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    docs_dir = root / "docs"
    docs_dir.mkdir(exist_ok=True)
    (docs_dir / "seed-meanings.en.json").write_text(
        json.dumps(seeds, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    by_stage = {}
    by_polarity = {}
    for c in cards:
        by_stage[c["stage"]] = by_stage.get(c["stage"], 0) + 1
        by_polarity[c["polarity"]] = by_polarity.get(c["polarity"], 0) + 1

    print(f"wrote src/data/cards.json         {len(cards)} cards")
    print(f"wrote docs/seed-meanings.en.json  {len(seeds)} seed pairs")
    print(f"  stage     {by_stage}")
    print(f"  polarity  {by_polarity}")


if __name__ == "__main__":
    main()
