# The deck contract

Read by `tools/gen_card_art.py`, which parses this file — the fences and the
`- NN_slug:` line format are an interface, not decoration. One file a human
edits and a script reads, so the prompt that was sent can never drift from the
prompt that is documented.

**Bump the version when you change the style block.** Every card carries the
version it was generated under in its `.txt` sidecar, so a mixed deck is
detectable instead of merely suspected — which is precisely what
`docs/art-inconsistency.md` could not do for the last one.

---

## The style block

Sent verbatim, identically, with every single card.

<!-- STYLE BLOCK v2 -->
A single tarot card illustration, portrait, in a dark occult style.

FULL BLEED — THIS IS THE MOST IMPORTANT RULE. The card artwork fills the entire
image edge to edge. Do not render a photograph of a card. No background surface,
no table, no mat, no border of empty space, no drop shadow, no rounded corners,
no white or black margin on any side. The image IS the card face. Pixels at the
very edge of the image are the outermost edge of the card's own painted border.

NO TEXT ANYWHERE. No card title, no name, no roman numeral, no number, no
lettering, no signature, no watermark, no glyph that reads as writing. The card
is titled by the application, not by the artwork. Any text is an automatic
rejection.

BORDER: a narrow ornamental border of tarnished pewter and oxidised bronze,
about 4% of the image width, running unbroken around all four sides. Muted and
mid-toned — clearly lighter than the scene it frames but never bright or
glowing; roughly 28% luminance, neutral in hue. A single dark red hairline runs
just inside it. Keep the outermost band plain and the four corners quiet: the
application clips a rounded corner and any flourish there is lost.

PALETTE: desaturated and cold — bitumen black, slate, ash grey, drowned blue,
bone white, with tarnished metal in the border. One saturated accent and only
one: dark arterial red. Everything else stays muted so the red carries.

BLOOD: present on every card as the deck's signature, and always as a mark
already left behind rather than an act taking place. Staining stone, pooling in
hollows, soaking into cloth, beading and dripping from an edge, running in thin
rills, dried and crusted at the rim of a vessel, spreading slowly through still
water. No figure is shown being harmed.

TONE: this world is a cruel place and the card does not look away from it.
Dread, decay, weight, indifference, memento mori. Grave and unflinching, never
gleeful and never lurid. The menace is carried entirely by composition, scale,
silence and light — an empty chair in a flooded hall, an implement set down and
still wet.

RENDERING: painted, matte, heavy chiaroscuro, visible brushwork, the look of
aged oil on board with fine surface craquelure. No gloss, no neon, no digital
airbrush, no lens flare, no 3D render, no photographic realism.

MUST READ UPSIDE DOWN. The application shows a reversed card by rotating this
artwork 180 degrees, so the composition has to hold when inverted. No element
depends on the viewer knowing which way is up.

ONE SCENE, ITS OWN SCENE. This card's setting and composition belong to it
alone. Do not reuse a generic mountain range, lake, reflection or star field as
a default backdrop — ten cards of the previous deck shared one and it read as
broken.
<!-- /STYLE BLOCK -->

---

## Scenes

One line per card, appended to the style block. Each names a **distinct setting,
framing and camera** — that distinctness is a hard requirement, not flavour.
Format is parsed: `- <slug>: <scene>`.

**AFTERMATH, NEVER THE ACT.** This is a hard rule and it was learned the
expensive way: v1's Wheel of Fortune described bodies bound to the rim and the
API refused it outright with `safety_violations=[violence]`. A scene that shows
harm being done gets rejected; a scene that shows what harm has already left
behind gets generated — and it is the better image anyway, because implication
carries further than depiction. Rags, bone, a stain, an abandoned crown, a still
wet blade set down. Never a figure being hurt.

The same effect applies to the style block: **do not enumerate what is
forbidden.** v1 listed the words it was banning and the classifier read the
words rather than the ban. Say what the card IS.

- 00_fool: A barefoot youth mid-stride off a crumbling clifftop, arms loose, face turned up to the sky, not seeing the drop. Far below, a scree slope of bones with a thin red rill threading through it. A small pale dog howling at the lip behind him. Wide, vertiginous, looking down past him into the fall.
- 01_magician: A gaunt figure at a stone slab in a windowless cellar, one arm raised, the other pointing at the floor. On the slab: a knife, a chipped cup brimming dark red, a bent coin, a snapped staff. Blood tracks along a channel cut into the stone and drips off the near edge. Close, cramped, single guttering light.
- 02_high_priestess: A veiled seated figure between two black pillars at the mouth of a flooded crypt, water to her ankles, a crescent at her feet. Dark red spreads from beneath her hem across the still surface in slow threads. Frontal, symmetrical, drowned and silent.
- 03_empress: A heavy enthroned woman in a rotting orchard, one hand on a swollen belly. Overripe fruit split open on the ground bleeding pulp, wheat blackened at the tips, crows crowding the branches. Tight, oppressive, low green-grey light with the canopy pressing down.
- 04_emperor: A mailed ruler on a throne built from interlocked blades and rib bones, ram skulls at the arms. Seen steeply from below so he fills the frame. A dark stain worked deep into the stone step at his feet. Monumental, frontal, grey daylight from high behind.
- 05_hierophant: A masked celebrant high on a pulpit in a vast stone nave, hands raised over a basin of dark red. Two tonsured acolytes kneel far below him in a shallow spreading pool. Extreme vertical, cavernous, ranks of candles receding into dark.
- 06_lovers: Two nude figures standing back to back, wrists bound behind them with red cord drawn tight. A vast winged shape above, its face lost in shadow. A serpent at the woman's ankle. Nocturnal garden gone entirely to thorn. Mid-shot, cold moonlight.
- 07_chariot: An armoured driver in a stone war-cart hauled by two sphinxes, one black one white, over ground churned to red mud. Banners in rags, a burning city on the horizon behind. Mid-distance, hard motion across the frame, smoke-orange sky.
- 08_strength: A woman kneeling in dust, one hand laid flat on the muzzle of an enormous lion whose jaws hang open beside her face. Her sleeves are dark and wet to the elbow. Her expression is entirely calm. Very tight, intimate, hot low sidelight through hanging dust.
- 09_hermit: An old man with a shuttered lantern on a black knife-edge ridge above an ocean of cloud, one hand on a staff. Snow underfoot, and a trail of dark drops behind him leading back into the white. Wide, cold, brutally isolating, thin high light.
- 10_wheel_of_fortune: A great iron wheel half sunk in a stone pit, its rim hung with rags, bone and a tarnished crown — everything it has already carried round. A hooded figure turns it by a crank, unhurried. The pit floor is dark and wet, and the wheel's lower arc drags through it and lifts dark red as it climbs. Oblique from above, torchlight from the rim.
- 11_justice: A blindfolded figure enthroned in a bare hall, sword held upright with its point set in a spreading pool at the foot of the throne, scales in the other hand — a heart in one pan, a coin in the other, the coin lower. Frontal, rigidly symmetrical, austere flat light.
- 12_hanged_man: A figure suspended by one ankle from a living tree, inverted, hands bound behind the back, one leg crossed, face serene. Hair hangs down into a black pool that gives back no reflection. Dark red beads along the rope and falls, ring by ring, into the water. Vertical, still, dusk.
- 13_death: A skeletal rider in black plate on a pale gaunt horse, crossing a field of turned earth and abandoned armour from left to right. A scythe carried upright as a standard. A king's crown pressed into the mud beneath a hoof, the mud around it stained dark. Horizontal frieze, low horizon, failing light.
- 14_temperance: A winged figure standing with one foot in a black river and one on the bank, pouring dark red from one vessel to another — the stream hanging between them, touching neither lip. Two irises rotting on the bank. Mid-shot, twilight, mist off the water.
- 15_devil: A horned figure squatting on an inverted plinth in a low cavern, two naked figures chained at the neck below it, the chains slack enough to step out of. A torch held downward, guttering, its embers falling short of them onto wet stone. Cramped, ember-lit, ceiling close overhead.
- 16_tower: A stone tower split top to bottom by lightning, its crown sliding away. Two cloaked silhouettes thrown clear of it, small and distant against the dark. Fire in the window slots, masonry and dark red spraying outward into a black sky. Vertical, lit only by the strike.
- 17_star: A naked figure kneeling at the lip of a black pool beneath one enormous star and seven small ones, pouring from two vessels. What she pours runs dark and spreads. One bare tree, one bird. Wide, nocturnal, quiet, the water absolutely flat.
- 18_moon: A stone road running dead away from the viewer between two towers to a far horizon, under a bone-white moon with a face half formed in it. A wolf and a dog howling from opposite verges. A crayfish hauling itself from a pool of dark water in the immediate foreground. Deep one-point perspective.
- 19_sun: A child on a pale horse under a swollen white sun in a bleached, colourless sky, arms thrown wide, a fallen banner trampled underfoot. A wall of dead sunflowers behind, ground cracked and rust-stained. Overexposed, hot, flat, wrong.
- 20_judgement: An angel above with a long trumpet, and below, the ground broken open — figures rising from stone coffins with their arms up, standing in shallow red water that runs between the graves. Low horizon, enormous sky, grey light with no source.
- 21_world: A nude figure suspended inside a wreath of thorn and bone above a dark globe, the wreath bound at four points with red cord. At the four corners, a bull, a lion, an eagle and an angel, all rendered as skulls. Frontal, iconic, void black background.
