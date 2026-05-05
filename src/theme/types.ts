export interface ColorTokens {
  background: string;
  surface: string;
  surfaceVariant: string;
  border: string;

  text: string;
  textSecondary: string;
  textDisabled: string;
  textInverse: string;

  primary: string;
  onPrimary: string;
  primaryVariant: string;

  success: string;
  onSuccess: string;
  error: string;
  onError: string;
  warning: string;
  onWarning: string;
}

export interface TypographyTokens {
  /** Minimum body size — 18px for Student (WCAG AAA), 16px for Tutor (AA) */
  sizeBody: number;
  sizeSM: number;
  sizeMD: number;
  sizeLG: number;
  sizeXL: number;
  sizeXXL: number;

  weightRegular: '400';
  weightMedium: '500';
  weightSemiBold: '600';
  weightBold: '700';

  lineHeightBody: number;
  lineHeightHeading: number;
}

export interface SpacingTokens {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  /** Minimum interactive touch target (px). Student=64, Tutor=48. */
  touchTarget: number;
  /** Minimum gap between adjacent touch targets to prevent mis-tap. */
  touchGap: number;
}

export interface RadiusTokens {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  full: number;
}

export interface Theme {
  colors: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
}
