// Token-level WCAG 2.2 AA gate, ported from Curated Thoughts
// (src/__tests__/a11y-contrast.test.ts there). The palette is the design
// language in docs/design/DESIGN.md of curated-thoughts; values must match.
import { Colors, tint } from '@/constants/theme';

type Palette = (typeof Colors)['light'];
type Token = keyof Palette;

const HEX = /^#[0-9a-fA-F]{6}$/;

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// [fg, bg, minRatio, why]
const PAIRS: [Token, Token, number, string][] = [
  ['onSurface', 'bg', 4.5, 'body text'],
  ['onSurface', 'surface', 4.5, 'text on sheets/dialogs'],
  ['onSurface', 'elev3', 4.5, 'text on highest elevation'],
  ['onSurfaceVar', 'bg', 4.5, 'secondary text'],
  ['onSurfaceVar', 'elev1', 4.5, 'inactive tab label / text in list groups'],
  ['onSurfaceVar', 'elev2', 4.5, 'secondary text on cards'],
  ['outline', 'bg', 4.5, 'placeholder / meta text'],
  ['outline', 'elev1', 4.5, 'meta text in list groups'],
  ['outline', 'elev2', 4.5, 'meta text on cards'],
  ['outline', 'elev3', 4.5, 'meta text on highest elevation'],
  ['primary', 'bg', 4.5, 'link-style buttons'],
  ['primary', 'elev1', 4.5, 'active tab label'],
  ['primary', 'elev3', 3, 'primary icons on highest elevation'],
  ['primary', 'surfaceVariant', 3, 'primary icons on variant surface'],
  ['secondary', 'bg', 4.5, 'secondary accents'],
  ['onPrimary', 'primary', 4.5, 'label on primary button'],
  ['onPrimary', 'primaryHover', 4.5, 'label on pressed primary button'],
  ['onPrimaryCont', 'primaryContainer', 4.5, 'selected row label'],
  ['error', 'bg', 4.5, 'error text'],
  ['error', 'elev1', 4.5, 'error text in list groups'],
  ['success', 'bg', 4.5, 'success text'],
  ['warning', 'bg', 4.5, 'warning text'],
  ['outlineVar', 'bg', 3, 'control boundaries (SC 1.4.11)'],
  ['outlineVar', 'elev1', 3, 'control boundaries in list groups'],
  ['outlineVar', 'elev3', 3, 'control boundaries on highest elevation'],
  // Disabled: label ≥4.5:1 wherever a control sits; the dashed border is
  // floored at 2:1 (SC 1.4.11 exempts inactive components; the dash carries
  // the state).
  ['disabledFg', 'disabledBg', 4.5, 'disabled label on its own fill'],
  ['disabledFg', 'bg', 4.5, 'disabled label on a page'],
  ['disabledFg', 'elev2', 4.5, 'disabled label on a card'],
  ['disabledBorder', 'disabledBg', 2, 'disabled boundary on its own fill'],
  ['disabledBorder', 'bg', 2, 'disabled boundary on a page'],
  ['disabledBorder', 'elev2', 2, 'disabled boundary on a card'],
  // Hairlines are not control boundaries; the floor is "actually visible".
  ['separator', 'bg', 1.15, 'region hairlines'],
  ['separator', 'elev1', 1.1, 'hairlines in tab bar / list groups'],
  ['separator', 'elev2', 1.1, 'hairlines on cards'],
];

describe.each([
  ['light', Colors.light],
  ['dark', Colors.dark],
] as const)('%s theme tokens', (_name, t: Palette) => {
  it('every fg/bg pair meets its WCAG threshold', () => {
    const failures = PAIRS.flatMap(([fg, bg, min, why]) => {
      const f = t[fg];
      const b = t[bg];
      // A malformed hex makes luminance() NaN, and NaN < min is false — fail
      // loudly instead of passing silently.
      if (!HEX.test(f) || !HEX.test(b)) return [`${why}: ${fg}(${f}) / ${bg}(${b}) not #rrggbb`];
      const ratio = contrast(f, b);
      return Number.isFinite(ratio) && ratio >= min
        ? []
        : [`${why}: ${fg}(${f}) on ${bg}(${b}) = ${ratio.toFixed(2)} < ${min}`];
    });
    expect(failures).toEqual([]);
  });
});

it('light and dark define the same token set', () => {
  expect(Object.keys(Colors.dark).sort()).toEqual(Object.keys(Colors.light).sort());
});

it('matches the Curated Thoughts palette', () => {
  expect(Colors.light).toMatchObject({
    bg: '#fffcf9',
    surface: '#fffcf9',
    primary: '#835400',
    primaryContainer: '#eadbc4',
    outline: '#6b5e50',
    outlineVar: '#94826e',
    separator: '#e0d3c4',
    disabledBg: '#faf5f0',
    disabledBorder: '#ab9a84',
    disabledFg: '#6b5e50',
  });
  expect(Colors.dark).toMatchObject({
    bg: '#101215',
    surface: '#15181c',
    primary: '#7aa2f7',
    primaryContainer: '#262e3c',
    outline: '#8b95a3',
    outlineVar: '#6f7a87',
    separator: '#262c33',
    success: '#4bbf73',
    warning: '#e0a458',
    disabledBg: '#171a1f',
    disabledBorder: '#525c68',
    disabledFg: '#8b95a3',
  });
});

it('tint() appends an alpha byte like color-mix with transparent', () => {
  expect(tint('#ba1a1a', 10)).toBe('#ba1a1a1a');
  expect(tint('#ba1a1a', 30)).toBe('#ba1a1a4d');
  expect(() => tint('red', 10)).toThrow();
});
