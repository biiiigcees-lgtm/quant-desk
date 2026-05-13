import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base:     '#0B0F14',
        surface:  '#11161D',
        elevated: '#1B222C',
        border:   '#2A3441',
        primary:  '#E5E7EB',
        secondary:'#9CA3AF',
        muted:    '#6B7280',
        green:    '#22C55E',
        yellow:   '#F59E0B',
        red:      '#EF4444',
        blue:     '#6B7280',
        neutral:  '#6B7280',
      },
      fontFamily: {
        mono: ['"IBM Plex Sans"', 'Inter', '"SF Pro Text"', 'system-ui', 'sans-serif'],
        ui:   ['Inter', '"SF Pro Text"', '"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
    },
  },
  plugins: [],
};

export default config;
