/**
 * Static art registry. Metro resolves `require` at build time, so the card
 * images cannot be looked up by a computed path -- every slug is listed here.
 * Regenerate alongside cards.json if the deck ever changes.
 */

export const CARD_ART: Record<string, number> = {
  '00_fool': require('@/assets/cards/00_fool.webp'),
  '01_magician': require('@/assets/cards/01_magician.webp'),
  '02_high_priestess': require('@/assets/cards/02_high_priestess.webp'),
  '03_empress': require('@/assets/cards/03_empress.webp'),
  '04_emperor': require('@/assets/cards/04_emperor.webp'),
  '05_hierophant': require('@/assets/cards/05_hierophant.webp'),
  '06_lovers': require('@/assets/cards/06_lovers.webp'),
  '07_chariot': require('@/assets/cards/07_chariot.webp'),
  '08_strength': require('@/assets/cards/08_strength.webp'),
  '09_hermit': require('@/assets/cards/09_hermit.webp'),
  '10_wheel_of_fortune': require('@/assets/cards/10_wheel_of_fortune.webp'),
  '11_justice': require('@/assets/cards/11_justice.webp'),
  '12_hanged_man': require('@/assets/cards/12_hanged_man.webp'),
  '13_death': require('@/assets/cards/13_death.webp'),
  '14_temperance': require('@/assets/cards/14_temperance.webp'),
  '15_devil': require('@/assets/cards/15_devil.webp'),
  '16_tower': require('@/assets/cards/16_tower.webp'),
  '17_star': require('@/assets/cards/17_star.webp'),
  '18_moon': require('@/assets/cards/18_moon.webp'),
  '19_sun': require('@/assets/cards/19_sun.webp'),
  '20_judgement': require('@/assets/cards/20_judgement.webp'),
  '21_world': require('@/assets/cards/21_world.webp'),
};
