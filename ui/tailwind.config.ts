import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base:     '#0A0F1C',
        surface:  '#0F1629',
        elevated: '#152033',
        border:   '#1E2D42',
        primary:  '#E6EDF3',
        secondary:'#8B9CB8',
        muted:    '#4A5568',
        green:    '#00E5A8',
        yellow:   '#FFB020',
        red:      '#FF4D4D',
        blue:     '#3B82F6',
        neutral:  '#6B7C93',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        ui:   ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
    },
  },
  plugins: [],
};

export default config;
