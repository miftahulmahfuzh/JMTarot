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

en = get('/s/aaaaaaaaaaaa', 'en-GB,en;q=0.9')
check('chrome follows the viewer (en)', 'A shared reading' in en, 'eyebrow')
id_ = get('/s/aaaaaaaaaaaa', 'id-ID,id;q=0.9')
check('chrome follows the viewer (id)', 'Bacaan yang dibagikan' in id_)

# The seeded reading is `en` prose. So: mismatch line for an `id` viewer, none for `en`.
check('otherLanguage shown on a mismatch', 'otherLanguage' in id_)
check('otherLanguage ABSENT when they agree', 'otherLanguage' not in en)
check('prose tagged with its own lang', 'lang="en"' in id_)

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
