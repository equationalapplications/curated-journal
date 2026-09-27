/**
 * Curated design language tokens — ported from Curated Thoughts
 * (`docs/design/DESIGN.md`, Part 1, and `src/index.css` there).
 *
 * Two themes, one structure: light is "warm paper" (cream surfaces, brown-black
 * text, amber accent); dark is "neutral slate" (blue-grey surfaces, cool grey
 * text, soft blue accent). Always reference the role, never the hex.
 *
 * Contrast is asserted in `__tests__/themeContrast.test.ts`.
 */

import '@/global.css';

import { Platform } from 'react-native';

const light = {
  // Surfaces — climb from page to raised.
  bg: '#fffcf9', // page; text-field fill
  surface: '#fffcf9', // sheets, dialogs
  elev1: '#f9f3f2', // tab bar, cards, list groups, dialog footer
  elev2: '#f5eeeb', // resting button fill; pressed quiet rows
  elev3: '#f1e9e3', // pressed buttons
  surfaceVariant: '#f0e0d0',

  // Text — strongest to quietest. `outline` is used as text (≥4.5:1).
  onSurface: '#1f1b16',
  onSurfaceVar: '#4f4539',
  outline: '#6b5e50',

  // Borders — hairline between regions vs. boundary of a control.
  separator: '#e0d3c4',
  outlineVar: '#94826e',

  // Accent.
  primary: '#835400',
  primaryHover: '#6d4600', // also the pressed state on touch
  onPrimary: '#ffffff',
  primaryContainer: '#eadbc4',
  onPrimaryCont: '#2a1800',
  secondary: '#705b40',
  secondaryCont: '#fbdebc',
  tertiaryCont: '#d5eaba',

  // Status — apply as a tint (see `tint()`), never a solid slab behind text.
  error: '#ba1a1a',
  success: '#2e7d32',
  warning: '#8a5200',

  // Disabled — structural: receding fill, dashed border, muted label.
  disabledBg: '#faf5f0',
  disabledBorder: '#ab9a84',
  disabledFg: '#6b5e50',

  // Scrims, tinted with the theme's own near-black.
  backdropModal: 'rgba(24,18,12,0.42)',
  backdropPanel: 'rgba(24,18,12,0.30)',
  backdropPalette: 'rgba(24,18,12,0.20)',
};

const dark: typeof light = {
  bg: '#101215',
  surface: '#15181c',
  elev1: '#191d22',
  elev2: '#1f242a',
  elev3: '#262c33',
  surfaceVariant: '#2c333b',

  onSurface: '#ccd3dc',
  onSurfaceVar: '#9ea8b5',
  outline: '#8b95a3',

  separator: '#262c33',
  outlineVar: '#6f7a87',

  primary: '#7aa2f7',
  primaryHover: '#9cb9f9',
  onPrimary: '#0d1017',
  primaryContainer: '#262e3c',
  onPrimaryCont: '#ccd6e6',
  secondary: '#8fa0b4',
  secondaryCont: '#1d232a',
  tertiaryCont: '#1f3029',

  error: '#f07178',
  success: '#4bbf73',
  warning: '#e0a458',

  disabledBg: '#171a1f',
  disabledBorder: '#525c68',
  disabledFg: '#8b95a3',

  backdropModal: 'rgba(0,0,0,0.58)',
  backdropPanel: 'rgba(0,0,0,0.40)',
  backdropPalette: 'rgba(0,0,0,0.28)',
};

/**
 * Legacy Expo-template names, kept as aliases onto the design roles so older
 * call sites keep working. New code should use the role names above.
 */
function withLegacy<T extends typeof light>(t: T) {
  return {
    ...t,
    text: t.onSurface,
    textSecondary: t.onSurfaceVar,
    background: t.bg,
    backgroundElement: t.elev1,
    backgroundSelected: t.primaryContainer,
  };
}

export const Colors = {
  light: withLegacy(light),
  dark: withLegacy(dark),
} as const;

export type Theme = (typeof Colors)['light'];
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Status tint: `color-mix(in srgb, <color> <pct>%, transparent)` for RN.
 * DESIGN.md uses 10% for a banner fill, 30% for its border, 14–18% for a
 * destructive pressed state. Accepts `#rrggbb` only.
 */
export function tint(hex: string, percent: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`tint() expects #rrggbb, got ${hex}`);
  }
  const alpha = Math.round(Math.min(Math.max(percent, 0), 100) * 2.55)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alpha}`;
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-ui)',
    mono: 'var(--font-mono)',
  },
});

/**
 * Mobile type scale (DESIGN.md Part 3: keep the ratios and roles, not the
 * desktop pixel values). Only weights 400/500/600; no italics for UI states.
 */
export const Type = {
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  secondary: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  /** The signature section label: uppercase, 600, 0.06em tracking. */
  label: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.75,
    textTransform: 'uppercase',
  },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const;

/** 4px base: sp-1 4, sp-2 8, sp-3 12, sp-4 16, sp-5 24, sp-6 32. */
export const Space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
} as const;

/** Legacy Expo-template spacing; prefer `Space`. */
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Nothing larger than `lg` outside pills. */
export const Radius = {
  sm: 4,
  md: 6,
  lg: 10,
  pill: 999,
} as const;

/** Minimum hit target: 44pt (iOS) / 48dp (Android). */
export const TouchTarget = Platform.select({ ios: 44, default: 48 });

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
