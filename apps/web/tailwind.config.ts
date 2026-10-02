import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        ink: 'var(--ink)',
        mist: 'var(--mist)',
        line: 'var(--line)',
        tide: 'var(--tide)',
        clay: 'var(--clay)',
        card: 'var(--card)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Noto Sans', 'sans-serif'],
        display: ['var(--font-display)', 'serif'],
      },
      boxShadow: {
        sheet: '0 24px 60px -32px rgba(40, 28, 16, 0.45)',
      },
    },
  },
  plugins: [],
};

export default config;
