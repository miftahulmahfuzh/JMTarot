/**
 * Design tokens extracted from the approved Claude Design HTML.
 *
 * This is the source of truth for every screen, including the ones the original
 * design did not cover (onboarding, reader picker, result). When adding a
 * screen, compose from these rather than introducing new values.
 */

export const color = {
  /** App background, and the splash / status bar backdrop. */
  canvas: '#0a0812',
  /** Radial stops, painted 120% 90% at 50% 4%. */
  bgRadial: ['#221a3a', '#130f22', '#08060f'] as const,

  gold: '#c9a227',
  goldLift: '#d8b76a',
  goldPale: '#f0dfae',
  goldText: '#f2e7c9',

  text: '#e6dcc4',
  textWarm: '#ddd3bb',
  muted: '#9c93b4',
  label: '#7a7192',
  faint: '#6f668a',

  cardBack: ['#1d1636', '#291f4a', '#17112b'] as const,
  cardBackBorder: '#4a3d72',
  cardFace: ['#fbf4e2', '#f1e6cb'] as const,

  /**
   * The edge of a face-up card. REPLACES `cardFaceBorder: '#c9a227'`, which was
   * full-strength gold.
   *
   * That gold was the only thing separating a card from the near-black canvas
   * back when the artwork was three inconsistent generations. The regenerated
   * deck carries its own painted frame at 22-25% luminance against a canvas at
   * ~4%, so the card defines its own edge and a gold ring on top of it was a
   * SECOND border competing with the first -- on the darkest cards it became the
   * brightest thing in the cell, which is the art losing to the chrome.
   *
   * Keyed to the artwork's pewter rather than to gold, and at an opacity that
   * reads as the outermost millimetre of the painting instead of as app chrome.
   * Its whole job is keeping the rounded corners crisp on The Moon and The Hanged
   * Man, which go soft with no border at all.
   *
   * GOLD NOW MEANS EXACTLY ONE THING ON THE DRAW SCREEN: "a card goes here."
   * `Slots.module.css` keeps `--gold-hairline` on the EMPTY box, so the empty and
   * filled states stopped sharing a signal. That was a side effect of an
   * aesthetic fix and it is the better half of it.
   */
  cardEdge: 'rgba(198,188,170,0.17)',

  /** Translucent golds, used for hairlines, chips and button fills. */
  /**
   * The ONE destructive colour in the app, and `/account`'s deletion sheet is its
   * only consumer (V8).
   *
   * `## Styling` says a new value needs a reason worth writing down, and this is
   * it: a destructive action styled in gold is a destructive action nobody reads
   * twice. Every other control in this app is gold or muted, so gold carries no
   * warning at all -- on the draw screen it means "a card goes here", which is the
   * opposite of a stop signal.
   *
   * A DESATURATED BRICK RATHER THAN A UI RED. `#e74c3c` against `--canvas` is the
   * brightest thing on any screen in this app and would make "Delete account" the
   * visual focus of a page that is otherwise about who somebody is. This sits at
   * roughly the luminance of `--muted` and reads as a warning without shouting.
   *
   * USED AS A BORDER AND A LABEL, NEVER AS A FILL. The safe button is the
   * primary-styled one; the destructive one is outlined. A filled red button is
   * the one a thumb goes to.
   */
  danger: '#a3423a',

  goldHairline: 'rgba(201,162,39,0.22)',
  goldBorder: 'rgba(201,162,39,0.45)',
  goldWash: 'rgba(201,162,39,0.08)',
  goldWashStrong: 'rgba(201,162,39,0.20)',
} as const;

export const font = {
  /** Cinzel: labels, eyebrows, buttons, card titles. Always uppercase. */
  display: 'Cinzel_400Regular',
  displayMedium: 'Cinzel_500Medium',
  displaySemiBold: 'Cinzel_600SemiBold',
  /** Cormorant Garamond: all body copy and reading text. */
  body: 'CormorantGaramond_300Light',
  bodyItalic: 'CormorantGaramond_300Light_Italic',
  bodyRegular: 'CormorantGaramond_400Regular',
} as const;

/**
 * Cinzel is used at small sizes with wide tracking. React Native has no
 * `text-transform` shorthand worth relying on here, so callers uppercase their
 * own strings.
 */
export const type = {
  eyebrow: { fontFamily: font.display, fontSize: 10, letterSpacing: 4.2, color: color.gold },
  slotLabel: { fontFamily: font.display, fontSize: 10, letterSpacing: 3.0, color: color.label },
  sectionLabel: { fontFamily: font.display, fontSize: 10, letterSpacing: 3.4, color: color.gold },
  button: { fontFamily: font.display, fontSize: 10, letterSpacing: 2.6, color: '#e8dbb6' },
  counter: { fontFamily: font.display, fontSize: 10, letterSpacing: 2.6, color: color.faint },
  title: { fontFamily: font.display, fontSize: 34, letterSpacing: 2.0, color: color.goldText },
  /** Cinzel on dark: reader names, service names, card names outside a card face. */
  cardTitleLight: { fontFamily: font.display, fontSize: 18, letterSpacing: 1.2, color: color.goldText },
  /** Cinzel on the cream card face, where the art does not already print a title. */
  cardName: { fontFamily: font.display, fontSize: 12, letterSpacing: 1.2, color: '#241c33' },
  hint: { fontFamily: font.bodyItalic, fontSize: 17, color: color.muted },
  reading: { fontFamily: font.body, fontSize: 19, lineHeight: 28, color: color.textWarm },
} as const;

/**
 * Timings lifted verbatim from the design. Reanimated takes the bezier via
 * `Easing.bezier(...)`, applied at the call site.
 */
export const motion = {
  card: { duration: 620, bezier: [0.22, 0.9, 0.24, 1] as const },
  flip: { duration: 620, bezier: [0.3, 0.85, 0.3, 1] as const },
  /** Beat held after the final pick, before advancing to the result. */
  settle: 600,
} as const;

/**
 * Cards are 2:3. The design specified 160x260 (1:1.63), which would stretch the
 * artwork -- corrected here to a true 2:3.
 */
export const CARD_RATIO = 2 / 3;
export const radius = { card: 10, chip: 2 } as const;

export const space = (n: number) => n * 4;
