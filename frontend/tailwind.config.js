import defaultTheme from 'tailwindcss/defaultTheme'
import forms from '@tailwindcss/forms'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        sans: ['\"Inter\"', ...defaultTheme.fontFamily.sans],
        display: ['\"Playfair Display\"', ...defaultTheme.fontFamily.serif],
      },
      boxShadow: {
        brand: '0 20px 45px -20px rgba(138, 28, 36, 0.45)',
      },
      backgroundImage: {
        'hero-texture': "radial-gradient(circle at 20% 20%, rgba(249, 115, 22, 0.15), transparent 55%), radial-gradient(circle at 80% 0%, rgba(252, 211, 77, 0.18), transparent 50%)",
      },
      screens: {
        '2xs': '360px',
        'xs': '475px',
      },
    },
  },
  plugins: [forms],
}
