export const colorTokens = {
  brand: {
    primary: '#8a1c24',
    secondary: '#f97316',
    accent: '#fcd34d',
    surface: '#fff7ed',
    dark: '#450a0a',
  },
  ink: {
    50: '#faf5f5',
    100: '#f3ebea',
    200: '#e5d4d2',
    300: '#d3b5b0',
    400: '#b78484',
    500: '#9c4d4d',
    600: '#7f3737',
    700: '#642b2b',
    800: '#4c2020',
    900: '#331616',
  },
} as const

export const spacingTokens = {
  gutter: {
    compact: '1rem',
    cozy: '1.5rem',
    roomy: '2.5rem',
  },
} as const

export const typographyTokens = {
  families: {
    sans: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    display: '"Playfair Display", "Times New Roman", serif',
  },
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const

export const themeTokens = {
  colors: colorTokens,
  spacing: spacingTokens,
  typography: typographyTokens,
}

export type ThemeTokens = typeof themeTokens
