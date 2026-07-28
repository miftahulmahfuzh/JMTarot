"""Live checks against a running dev server. Rendered markup only -- the RSC
flight payload carries the whole message catalog, so a grep over raw HTML matches
copy the page never drew. V6 recorded the same trap for `textContent`."""
import re, subprocess, sys

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3003'
SENTINEL = 'sentinel-question-haruskah-aku-pindah-kerja'
fails = []

def get(path, lang=None, whole=False):
    cmd = ['curl', '-s', f'{BASE}{path}']
    if lang:
        cmd[2:2] = ['-H', f'accept-language: {lang}']
    html = subprocess.run(cmd, capture_output=True, text=True).stdout
    if whole:
        """
        THE WHOLE RESPONSE, FOR THE STREAMED CASE.

        `notFound()` from a `force-dynamic` page does NOT put `not-found.tsx`'s
        markup inside the first `<body>` slice: Next streams it in a later chunk
        that replaces a suspense boundary. Slicing to `<body>` reported "the gone
        page does not render" against a page that renders perfectly -- the same
        class of harness bug V6 recorded twice.

        Scoping to a CSS-MODULE CLASS NAME is what makes this safe without the
        `<script>` strip: `goneTitle` only ever appears in a `class` attribute the
        renderer emitted, whereas the flight payload carries message KEYS
        (`share.gone.title`) and their values -- so a grep for the copy itself
        would match text the page never drew.
        """
        return html
    no_script = re.sub(r'<script[\s\S]*?</script>', '', html)
    m = re.search(r'<body[^>]*>([\s\S]*)</body>', no_script)
    return m.group(1) if m else no_script

def check(name, ok, detail=''):
    print(('PASS  ' if ok else 'FAIL  ') + name + (f'  [{detail}]' if detail else ''))
    if not ok:
        fails.append(name)

body = get('/s/aaaaaaaaaaaa')
check('the reading renders', 'ReadingView-module' in body)
check('three slots drawn', body.count('data-slotbox') == 3, str(body.count('data-slotbox')))
check('the CTA is present and targets /', 'TryItYourself' in body and 'href="/"' in body)
check('the disclaimer is present', 'disclaimer' in body)

# Miftah's 2026-07-28 ruling: the question is part of the reading, so a link
# minted with the column default MUST show it. Under VD9 this was the opposite
# assertion, and flipping it is the whole point of the change.
check('the question IS shown, because the link took the column default', SENTINEL in body)
check('and it is inside the question BLOCK, not loose in the prose',
      'questionBlock' in body and 'questionLabel' in body)

# ---------------------------------------------------------------------------
# THE PAGE IS MONOLINGUAL, IN THE READING'S LANGUAGE (Miftah's ruling 2026-07-28)
# ---------------------------------------------------------------------------
#
# **THESE TWO ASSERTIONS ARE INVERTED, NOT NEW.** They used to read "chrome follows
# the viewer", both ways, and that shipped a page in two languages: English prose
# under `Bacaan yang dibagikan` / `Bacaan untuk Mif` / `Kartu Harian`, which reads as
# half-translated. The chrome now follows the PROSE, whatever the viewer asked for.
#
# `aaaaaaaaaaaa` is pinned `id` on an `id` reading, so its chrome is Indonesian for
# BOTH viewers. That is the assertion: the `accept-language` header stops mattering.
id_pinned_en_viewer = get('/s/aaaaaaaaaaaa', 'en-GB,en;q=0.9')
id_pinned_id_viewer = get('/s/aaaaaaaaaaaa', 'id-ID,id;q=0.9')
check('an id-pinned page is Indonesian for an ID viewer',
      'Bacaan yang dibagikan' in id_pinned_id_viewer)
check('an id-pinned page is STILL Indonesian for an EN viewer',
      'Bacaan yang dibagikan' in id_pinned_en_viewer and
      'A shared reading' not in id_pinned_en_viewer)

# And the mirror, which is the case the report was actually about: an en-pinned link
# opened by an Indonesian reader must be English throughout, chrome included.
en_pinned_id_viewer = get('/s/bbbbbbbbbbbb', 'id-ID,id;q=0.9')
check('an en-pinned page is English for an ID viewer',
      'A shared reading' in en_pinned_id_viewer and
      'Bacaan yang dibagikan' not in en_pinned_id_viewer)
check('...including the disclaimer, which is the accepted cost of the ruling',
      'entertainment only' in en_pinned_id_viewer)
check('...and the CTA', 'Try it yourself' in en_pinned_id_viewer)

# Kept so the names below still resolve.
en = id_pinned_en_viewer
id_ = id_pinned_id_viewer

# ---------------------------------------------------------------------------
# ONE READING, THREE LIVE ADDRESSES -- the reported bug, checked live.
# ---------------------------------------------------------------------------
#
# Miftah, 2026-07-28: "I got a share link for card session A in English. It opened
# nicely. When I changed the language and created a share link for card session A in
# Bahasa, somehow the share link in no 1 cannot be opened again."
#
# Under `unique (user_id, entity, entity_id)` the second mint replaced the first
# address. The fixture now plants one row per language, so the check is that none of
# them has taken the others' place. THIS IS THE ASSERTION THE FILE EXISTS FOR NOW.
en_pinned = get('/s/bbbbbbbbbbbb')
as_written = get('/s/cccccccccccc')
check('the id-pinned address resolves', 'ReadingView-module' in body)
check('the en-pinned address resolves TOO, not instead', 'ReadingView-module' in en_pinned)
check('and the legacy unpinned address resolves as well',
      'ReadingView-module' in as_written)

# Each renders its OWN language, which is what makes them worth being separate.
check('the en-pinned address renders the ENGLISH body', 'SENTINEL-EN' in en_pinned)
check('the id-pinned address does NOT render the English body',
      'SENTINEL-EN' not in body)
check('the unpinned address renders as-written, i.e. NOT the translation',
      'SENTINEL-EN' not in as_written)

# `lang` comes from `renderedLocale(reading, translation)`, never `reading.locale`:
# against the source a screen reader pronounces English as Indonesian. It is now the
# ONLY thing declaring the prose's language -- see the notice check below.
check('the en-pinned prose is tagged lang="en"', 'lang="en"' in en_pinned)
check('the id-pinned prose is tagged lang="id"', 'lang="id"' in body)
check('the unpinned prose is tagged with the SOURCE lang', 'lang="id"' in as_written)

# THE NOTICE IS DELETED (Miftah's ruling, 2026-07-28) and this checker asserted the
# OPPOSITE until 2026-07-28 -- it still expected `otherLanguage` on a mismatch, so it
# was failing against main for a release. Inverted rather than removed, because the
# failure mode of deleting chrome is somebody adding it back in six months.
for name, page in (('id viewer', id_), ('en viewer', en), ('en-pinned', en_pinned),
                   ('unpinned', as_written)):
    check(f'NO other-language notice ({name})', 'otherLanguage' not in page)

check('no session context in the tree', 'ViewerProvider' not in body)
check('no account button on a public page', 'AccountButton' not in body)
check('no share_links leaked into the payload', 'share_links' not in body)

gone = get('/s/zzzzzzzzzzzz', whole=True)
check('an unknown slug renders the gone page', 'goneTitle' in gone)
check('the gone page offers a way into the app', 'goneAction' in gone)
# Scoped to the rendered class names above, so this one can look at the copy.
rendered_gone = re.sub(r'<script[\s\S]*?</script>', '', gone)
check('the gone page says nothing about why',
      not re.search(r'revoked|expired|dihapus|dicabut', rendered_gone, re.I))

print()
print('FAILURES: ' + (', '.join(fails) if fails else 'none'))
sys.exit(1 if fails else 0)
