#!/usr/bin/env python3
"""Generate the structural card dataset for the app.

Source of truth is the approved Claude Design HTML, whose ARCANA table carries
numeral / name / astrological glyph / keywords / upright / reversed for all 22
Majors. This script transcribes it once, mechanically, and enriches it with the
fields the combination engine needs.

    python3 tools/generate_cards.py

Writes src/data/cards.json          structural data the app imports

Card names stay English on purpose, in BOTH locales: the artwork has its title
rendered into the image ("THE FOOL"), so an Indonesian display name would
contradict the card the user is looking at. Numerals and glyphs likewise. What is
localized is `keywords` and `meaning`, both now `Localized<>` -- a sub-object per
locale, so a missing locale is a compile error in `types.ts` rather than a blank
string on the card detail overlay.

IT NO LONGER WRITES docs/seed-meanings.en.json, and the file is deleted (W6 I19).
It was a GENERATED artefact -- this script wrote it from two English seed columns
in the ARCANA tuples -- and once MEANINGS_EN exists there are two English tables
that will drift. Worse, the drift is silent in one direction: a hand edit to the
generated file vanishes on the next `npm run cards`. The seeds themselves were not
thrown away; they are the provenance note in MEANINGS_EN's header below, which is
the only thing they were ever good for. To read the file as it last stood:

    git show c299122:docs/seed-meanings.en.json
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

# id, slug, numeral, name, glyph, polarity, yesno
#
# THE TWO ENGLISH SEED COLUMNS ARE GONE (W6 I19). They held phrases like
# "a beginning taken on trust" / "a leap made carelessly" and their only consumer
# was the generated seed file. Their content is preserved in MEANINGS_EN's header.
# The keyword column moved out too, into KEYWORDS_EN, so both localized fields are
# now keyed by slug and neither hides inside a positional tuple.
ARCANA = [
    (0,  "00_fool",             "0",     "The Fool",          "✧", "light",   "yes"),
    (1,  "01_magician",         "I",     "The Magician",      "☿", "light",   "yes"),
    (2,  "02_high_priestess",   "II",    "The High Priestess", "☾", "neutral", "maybe"),
    (3,  "03_empress",          "III",   "The Empress",       "♀", "light",   "yes"),
    (4,  "04_emperor",          "IV",    "The Emperor",       "♈", "neutral", "yes"),
    (5,  "05_hierophant",       "V",     "The Hierophant",    "♉", "neutral", "yes"),
    (6,  "06_lovers",           "VI",    "The Lovers",        "♊", "light",   "yes"),
    (7,  "07_chariot",          "VII",   "The Chariot",       "♋", "light",   "yes"),
    (8,  "08_strength",         "VIII",  "Strength",          "♌", "light",   "yes"),
    (9,  "09_hermit",           "IX",    "The Hermit",        "♍", "neutral", "no"),
    (10, "10_wheel_of_fortune", "X",     "Wheel of Fortune",  "♃", "neutral", "maybe"),
    (11, "11_justice",          "XI",    "Justice",           "♎", "neutral", "maybe"),
    (12, "12_hanged_man",       "XII",   "The Hanged Man",    "♆", "shadow",  "no"),
    (13, "13_death",            "XIII",  "Death",             "♏", "shadow",  "no"),
    (14, "14_temperance",       "XIV",   "Temperance",        "♐", "light",   "maybe"),
    (15, "15_devil",            "XV",    "The Devil",         "♑", "shadow",  "no"),
    (16, "16_tower",            "XVI",   "The Tower",         "♂", "shadow",  "no"),
    (17, "17_star",             "XVII",  "The Star",          "♒", "light",   "yes"),
    (18, "18_moon",             "XVIII", "The Moon",          "♓", "shadow",  "no"),
    (19, "19_sun",              "XIX",   "The Sun",           "☉", "light",   "yes"),
    (20, "20_judgement",        "XX",    "Judgement",         "♇", "neutral", "yes"),
    (21, "21_world",            "XXI",   "The World",         "♄", "light",   "yes"),
]


# slug -> three keywords, Indonesian.
#
# These reach the model as grounding in the user turn ("kata kunci: ...") and are
# also the chips on the reader picker. Three each, no more: the prompt reads them
# as a hint, and a longer list starts competing with the card's own meaning.
KEYWORDS_ID = {
    "00_fool":             ["lompatan", "kepolosan", "percaya"],
    "01_magician":         ["kehendak", "fokus", "keahlian"],
    "02_high_priestess":   ["rahasia", "intuisi", "kedalaman"],
    "03_empress":          ["kelimpahan", "merawat", "tubuh"],
    "04_emperor":          ["ketertiban", "otoritas", "struktur"],
    "05_hierophant":       ["tradisi", "ajaran", "ikrar"],
    "06_lovers":           ["penyatuan", "pilihan", "keselarasan"],
    "07_chariot":          ["dorongan", "kemenangan", "pelindung"],
    "08_strength":         ["keberanian", "kesabaran", "menjinakkan"],
    "09_hermit":           ["kesunyian", "pelita", "pencarian"],
    "10_wheel_of_fortune": ["perputaran", "takdir", "siklus"],
    "11_justice":          ["keseimbangan", "kebenaran", "sebab"],
    "12_hanged_man":       ["penangguhan", "pembalikan", "sudut pandang"],
    "13_death":            ["akhir", "ambang", "pelepasan"],
    "14_temperance":       ["perpaduan", "ukuran", "penyelarasan"],
    "15_devil":            ["belenggu", "hasrat", "bayangan"],
    "16_tower":            ["keruntuhan", "kilat", "kebenaran"],
    "17_star":             ["harapan", "ketenangan", "bimbingan"],
    "18_moon":             ["mimpi", "ilusi", "pasang"],
    "19_sun":              ["kejelasan", "sukacita", "vitalitas"],
    "20_judgement":        ["kebangkitan", "panggilan", "perhitungan"],
    "21_world":            ["penyelesaian", "keutuhan", "kembali"],
}


# slug -> three keywords, English.
#
# NOT A GLOSSARY LOOKUP OF THE INDONESIAN. These are the words an English tarot
# reader would use, chosen to sit in the same register as the Indonesian rather
# than to be its dictionary equivalent -- `pelindung` is literally "protector" and
# is `armour` here, because that is the word that means the Chariot's canopy.
#
# `truth` appears twice, on Justice and The Tower, exactly as `kebenaran` does in
# the Indonesian. That is the two cards genuinely sharing a keyword and not a
# copy-paste; the assertions below forbid duplicate MEANING lines and deliberately
# allow duplicate keywords.
KEYWORDS_EN = {
    "00_fool":             ["leap", "innocence", "trust"],
    "01_magician":         ["will", "focus", "skill"],
    "02_high_priestess":   ["secrets", "intuition", "depth"],
    "03_empress":          ["abundance", "nurture", "body"],
    "04_emperor":          ["order", "authority", "structure"],
    "05_hierophant":       ["tradition", "teaching", "vows"],
    "06_lovers":           ["union", "choice", "alignment"],
    "07_chariot":          ["drive", "victory", "armour"],
    "08_strength":         ["courage", "patience", "taming"],
    "09_hermit":           ["solitude", "lantern", "seeking"],
    "10_wheel_of_fortune": ["turning", "fate", "cycles"],
    "11_justice":          ["balance", "truth", "cause"],
    "12_hanged_man":       ["suspension", "reversal", "perspective"],
    "13_death":            ["ending", "threshold", "release"],
    "14_temperance":       ["blending", "measure", "attunement"],
    "15_devil":            ["bondage", "craving", "shadow"],
    "16_tower":            ["collapse", "lightning", "truth"],
    "17_star":             ["hope", "stillness", "guidance"],
    "18_moon":             ["dreams", "illusion", "tides"],
    "19_sun":              ["clarity", "joy", "vitality"],
    "20_judgement":        ["awakening", "summons", "reckoning"],
    "21_world":            ["completion", "wholeness", "return"],
}


# slug -> (upright, reversed), one line each, Indonesian.
#
# These are the only card text the querent ever reads outside a generated
# reading: the detail overlay shows one of the two, chosen by orientation. They
# are written as a PAIR and the reversed line is never the upright line with
# "tidak" in front of it -- a reversal turns the card's own energy against
# itself, so each line names a different thing that can go on.
MEANINGS_ID = {
    "00_fool":             ("Langkah pertama yang diambil karena percaya, bukan karena yakin.",
                            "Lompatan yang diambil tanpa sempat melihat ke bawah."),
    "01_magician":         ("Kemampuan yang diarahkan dengan niat yang jelas.",
                            "Bakat yang habis dipakai untuk terlihat hebat."),
    "02_high_priestess":   ("Sesuatu yang sudah kamu tahu tapi belum kamu ucapkan.",
                            "Suara dari dalam yang terus kamu lewatkan."),
    "03_empress":          ("Sesuatu yang tumbuh karena benar-benar dirawat.",
                            "Merawat sampai melewati batas dirimu sendiri."),
    "04_emperor":          ("Struktur yang membuat pijakanmu lebih tenang.",
                            "Kendali yang dikira sebagai kekuatan."),
    "05_hierophant":       ("Pelajaran yang diwariskan dan masih terpakai.",
                            "Aturan yang hidup lebih lama daripada gunanya."),
    "06_lovers":           ("Pilihan yang diambil dengan seluruh dirimu.",
                            "Diri yang terbelah di antara dua arah."),
    "07_chariot":          ("Dorongan yang masih bisa kamu kemudikan.",
                            "Tenaga besar yang tidak punya arah."),
    "08_strength":         ("Kelembutan yang justru memegang kendali.",
                            "Keberanian yang dipakai pada hal yang keliru."),
    "09_hermit":           ("Menarik diri sebentar supaya semuanya jernih.",
                            "Menyendiri yang disamarkan jadi kebijaksanaan."),
    "10_wheel_of_fortune": ("Putaran yang memang sedang tiba giliranmu.",
                            "Menahan putaran yang sudah waktunya berjalan."),
    "11_justice":          ("Perhitungan yang jujur, apa adanya.",
                            "Timbangan yang dimiringkan oleh rasa takut."),
    "12_hanged_man":       ("Berhenti sejenak, dan sudut pandangnya berubah.",
                            "Menunggu yang dipakai untuk menghindar."),
    "13_death":            ("Akhir yang justru membebaskan.",
                            "Menggenggam sesuatu yang sebenarnya sudah selesai."),
    "14_temperance":       ("Jalan tengah yang butuh kesabaran.",
                            "Dua hal berlawanan yang menolak menyatu."),
    "15_devil":            ("Rantai yang sebenarnya kamu lihat sendiri.",
                            "Keinginan yang belum berani kamu sebut namanya."),
    "16_tower":            ("Keruntuhan yang memang perlu terjadi.",
                            "Peringatan yang terus dilewatkan begitu saja."),
    "17_star":             ("Harapan yang tenang setelah semuanya berantakan.",
                            "Harapan yang ditaruh pada cahaya yang keliru."),
    "18_moon":             ("Apa yang sedang dibisikkan oleh hal yang belum jelas.",
                            "Rasa takut yang dikira pertanda."),
    "19_sun":              ("Kebenaran yang terang dan menghangatkan.",
                            "Silau yang justru menutupi detailnya."),
    "20_judgement":        ("Panggilan yang harus kamu jawab.",
                            "Panggilan yang terus kamu tunda."),
    "21_world":            ("Lingkaran yang akhirnya tertutup.",
                            "Akhir yang diumumkan terlalu cepat."),
}


# slug -> (upright, reversed), one line each, English.
#
# WRITTEN UP FROM THE OLD SEED COLUMNS, NOT TRANSLATED FROM THE INDONESIAN, and
# the distinction is the reason this table exists rather than a translation pass.
# The seeds -- which this script used to dump to docs/seed-meanings.en.json and no
# longer does (I19) -- were lowercase noun-phrase fragments with no terminal
# punctuation, written as the English *sense* MEANINGS_ID was composed against:
#
#     00_fool          a beginning taken on trust      / a leap made carelessly
#     01_magician      power directed with intent      / talent spent on illusion
#     02_high_priestess knowledge held in silence      / an inner voice ignored
#     03_empress       something growing and fed       / care given past its limit
#     04_emperor       structure that steadies you     / control mistaken for strength
#     05_hierophant    wisdom passed down              / dogma outliving its use
#     06_lovers        a choice made with the whole self / a self divided
#     07_chariot       momentum you can steer          / force without direction
#     08_strength      gentleness that governs         / courage spent on the wrong beast
#     09_hermit        withdrawal that clarifies       / isolation dressed as wisdom
#     10_wheel         the turn arriving               / resisting the turn
#     11_justice       the honest reckoning            / a scale weighted by fear
#     12_hanged_man    surrender that reveals          / waiting used as escape
#     13_death         an ending that frees            / clinging to what is over
#     14_temperance    the patient middle way          / extremes that will not mix
#     15_devil         the chain you can see           / a hunger left unnamed
#     16_tower         the necessary collapse          / a warning unheeded
#     17_star          quiet hope after ruin           / faith set on a false light
#     18_moon          what the dark is telling you    / fear mistaken for omen
#     19_sun           plain and warming truth         / glare that hides the detail
#     20_judgement     the call you must answer        / a summons postponed
#     21_world         the circle closed               / an ending declared too soon
#
# That is the semantic spine and it is good: all 22 pairs are already distinct,
# already reversal-aware, and already agree with the Indonesian. It is NOT
# shippable copy. The Indonesian display lines are full sentences addressed to the
# querent; these are raised into the same register -- sentence case, second person
# where the Indonesian is second person, a full stop -- which is the whole reason
# the seed file had no further purpose.
MEANINGS_EN = {
    "00_fool":             ("A first step taken on trust rather than on certainty.",
                            "A leap made before you had time to look down."),
    "01_magician":         ("Ability pointed at something, with a clear intent behind it.",
                            "Talent spent on looking impressive."),
    "02_high_priestess":   ("Something you already know and have not said out loud.",
                            "The voice inside that you keep stepping past."),
    "03_empress":          ("Something growing because it is genuinely being fed.",
                            "Care given well past your own limit."),
    "04_emperor":          ("Structure that makes your footing calmer.",
                            "Control mistaken for strength."),
    "05_hierophant":       ("A lesson handed down that still earns its place.",
                            "A rule that has outlived its reason."),
    "06_lovers":           ("A choice made with the whole of you.",
                            "A self split between two directions."),
    "07_chariot":          ("Momentum you can still steer.",
                            "Great force with nowhere to point it."),
    "08_strength":         ("Gentleness that turns out to be holding the reins.",
                            "Courage spent on the wrong thing."),
    "09_hermit":           ("Stepping back a while so that it all comes clear.",
                            "Solitude dressed up as wisdom."),
    "10_wheel_of_fortune": ("A turn that has come round to you.",
                            "Holding back a turn whose time has come."),
    "11_justice":          ("The reckoning, honest and as it is.",
                            "A scale tilted by fear."),
    "12_hanged_man":       ("Stop a moment, and the angle changes.",
                            "Waiting used as a way out."),
    "13_death":            ("An ending that frees you.",
                            "Holding on to something already finished."),
    "14_temperance":       ("The middle way, and it asks for patience.",
                            "Two opposites that refuse to combine."),
    "15_devil":            ("A chain you can see perfectly well from where you stand.",
                            "A hunger you have not dared to name."),
    "16_tower":            ("A collapse that needed to happen.",
                            "A warning let past again and again."),
    "17_star":             ("Quiet hope, after everything came apart.",
                            "Hope set on the wrong light."),
    "18_moon":             ("What the thing you cannot see clearly is telling you.",
                            "Fear taken for an omen."),
    "19_sun":              ("Truth that is plain, and warm with it.",
                            "Glare that hides the detail."),
    "20_judgement":        ("A call you have to answer.",
                            "A call you keep putting off."),
    "21_world":            ("The circle finally closed.",
                            "An ending announced too early."),
}


def stage_for(card_id):
    """Partition the Fool's Journey. Feeds `dominantStage` in the rule engine."""
    if card_id <= 7:
        return "beginning"
    if card_id <= 14:
        return "trial"
    return "reckoning"


def main():
    root = Path(__file__).resolve().parent.parent
    cards = []

    for cid, slug, numeral, name, glyph, polarity, yesno in ARCANA:
        up_id, rev_id = MEANINGS_ID[slug]
        up_en, rev_en = MEANINGS_EN[slug]
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
            # Locale-keyed sub-objects, not `keywords_en` flat fields (I18). One
            # place a card's data lives, and `Record<Locale, T>` in types.ts makes
            # a missing locale a compile error, which a suffixed field cannot.
            "keywords": {"id": KEYWORDS_ID[slug], "en": KEYWORDS_EN[slug]},
            "meaning": {
                "id": {"upright": up_id, "reversed": rev_id},
                "en": {"upright": up_en, "reversed": rev_en},
            },
        })

    slugs = {c["slug"] for c in cards}

    assert len(cards) == 22, f"expected 22 cards, built {len(cards)}"
    assert [c["id"] for c in cards] == list(range(22)), "card ids must be 0..21 in order"

    # Every assertion the single-language version had, now per language, plus two
    # that only become possible with two tables.
    for lang, table in (("id", MEANINGS_ID), ("en", MEANINGS_EN)):
        assert set(table) == slugs, f"MEANINGS_{lang.upper()} must cover every slug exactly"
        for slug, (up, rev) in table.items():
            assert up and rev and up != rev, f"{slug} [{lang}]: needs two distinct one-liners"
        # A copy-paste ACROSS cards is as bad as one within a card, and much
        # harder to see by eye in a 22-row table.
        for field, label in ((0, "upright"), (1, "reversed")):
            lines = [v[field] for v in table.values()]
            assert len(set(lines)) == len(lines), (
                f"MEANINGS_{lang.upper()}: duplicate {label} line")

    # THE ONE THAT ACTUALLY HAPPENS: a slug whose English pair was never written
    # and still holds the Indonesian, to make the generator run.
    for slug in sorted(slugs):
        assert MEANINGS_ID[slug] != MEANINGS_EN[slug], f"{slug}: en line never written"

    for lang, table in (("id", KEYWORDS_ID), ("en", KEYWORDS_EN)):
        assert set(table) == slugs, f"KEYWORDS_{lang.upper()} must cover every slug exactly"
        for slug, words in table.items():
            assert len(words) == 3, f"{slug} [{lang}]: expected three keywords, got {len(words)}"
            assert all(w.strip() for w in words), f"{slug} [{lang}]: blank keyword"
    for slug in sorted(slugs):
        assert KEYWORDS_ID[slug] != KEYWORDS_EN[slug], f"{slug}: en keywords never written"

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

    by_stage = {}
    by_polarity = {}
    for c in cards:
        by_stage[c["stage"]] = by_stage.get(c["stage"], 0) + 1
        by_polarity[c["polarity"]] = by_polarity.get(c["polarity"], 0) + 1

    print(f"wrote src/data/cards.json         {len(cards)} cards, 2 locales")
    print(f"  stage     {by_stage}")
    print(f"  polarity  {by_polarity}")


if __name__ == "__main__":
    main()
