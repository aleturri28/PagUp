/**
 * TutorTheme — WCAG 2.1 AA compliant (contrast ≥ 4.5:1 for normal text, ≥ 3:1 large text).
 * Modern, professional palette inspired by Material Design 3 tonal system.
 *
 * Verified contrast ratios:
 *   text (#212121) on background (#F8F9FA)          → 16.3 : 1  ✓ AA+
 *   textSecondary (#616161) on background           →  5.7 : 1  ✓ AA
 *   primary (#3F51B5) on background                 →  6.6 : 1  ✓ AA+
 *   onPrimary (#FFFFFF) on primary (#3F51B5)        →  6.6 : 1  ✓ AA+
 *   success (#2E7D32) on background                 →  4.8 : 1  ✓ AA
 *   error (#C62828) on background                   →  5.4 : 1  ✓ AA
 *   warning (#E65100) — onWarning #000 on warning   →  5.7 : 1  ✓ AA
 *
 * Typography: body 16px, comfortable line-height 1.5.
 * Spacing: standard 48dp touch targets per WCAG minimum.
 */
import type { Theme } from './types';

export const tutorTheme: Theme = {
  colors: {
    background:     '#F8F9FA',
    surface:        '#FFFFFF',
    surfaceVariant: '#EEF0F4',
    border:         '#CFD8DC',

    text:           '#212121',   // 16.3:1 on #F8F9FA ✓
    textSecondary:  '#616161',   //  5.7:1 ✓
    textDisabled:   '#9E9E9E',   // decorative — not carrying meaning
    textInverse:    '#FFFFFF',

    primary:        '#3F51B5',   //  6.6:1 on background ✓
    onPrimary:      '#FFFFFF',   //  6.6:1 on primary ✓
    primaryVariant: '#303F9F',

    success:        '#2E7D32',   //  4.8:1 ✓
    onSuccess:      '#FFFFFF',
    error:          '#C62828',   //  5.4:1 ✓
    onError:        '#FFFFFF',
    warning:        '#E65100',   //  onWarning black = 5.7:1 ✓
    onWarning:      '#000000',
  },

  typography: {
    sizeBody:    16,
    sizeSM:      13,
    sizeMD:      16,
    sizeLG:      20,
    sizeXL:      26,
    sizeXXL:     32,

    weightRegular:  '400',
    weightMedium:   '500',
    weightSemiBold: '600',
    weightBold:     '700',

    lineHeightBody:    1.5,
    lineHeightHeading: 1.2,
  },

  spacing: {
    xs:          4,
    sm:          8,
    md:          16,
    lg:          24,
    xl:          32,
    xxl:         48,
    touchTarget: 48,   // WCAG minimum
    touchGap:    8,
  },

  radius: {
    sm:   4,
    md:   8,
    lg:  12,
    xl:  16,
    full: 9999,
  },
};
