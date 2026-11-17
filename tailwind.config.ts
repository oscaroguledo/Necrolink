import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // UI palette (dark graveyard). Status colors are tints chosen for
        // >= 4.5:1 contrast on the night background; never the only signal.
        night: { DEFAULT: '#0b0e13', 900: '#0f141b', 800: '#151c25', 700: '#1e2733', 600: '#2a3544' },
        mist: { DEFAULT: '#e6edf3', muted: '#a3b1bf', faint: '#738396' },
        status: {
          ghost: '#fca5a5',
          zombie: '#fcd34d',
          lost: '#cbd5e1',
          living: '#6ee7b7',
          error: '#fdba74',
        },
        // Spooky graveyard palette
        graveyard: {
          stone: '#4a5568',
          moss: '#2d3748',
          fog: '#edf2f7',
          ghost: '#e2e8f0',
          zombie: '#fbbf24',
          living: '#10b981',
          dead: '#ef4444',
        },
      },
      animation: {
        'tombstone-rise': 'rise 0.6s ease-out',
        'ghost-float': 'float 3s ease-in-out infinite',
        'zombie-shamble': 'shamble 2s ease-in-out infinite',
      },
      fontFamily: {
        display: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
      },
      keyframes: {
        rise: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        shamble: {
          '0%, 100%': { transform: 'translateX(0px) rotate(0deg)' },
          '25%': { transform: 'translateX(-5px) rotate(-2deg)' },
          '75%': { transform: 'translateX(5px) rotate(2deg)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
