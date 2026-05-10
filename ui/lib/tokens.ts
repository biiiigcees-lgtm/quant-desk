export const tokens = {
  bg: {
    base:    '#0A0F1C',
    surface: '#0F1629',
    elevated:'#152033',
    border:  '#1E2D42',
  },
  text: {
    primary:  '#E6EDF3',
    secondary:'#8B9CB8',
    muted:    '#4A5568',
  },
  accent: {
    green:   '#00E5A8',
    yellow:  '#FFB020',
    red:     '#FF4D4D',
    blue:    '#3B82F6',
    neutral: '#6B7C93',
  },
  font: {
    mono: '"JetBrains Mono", "Fira Code", monospace',
    ui:   '"Inter", system-ui, sans-serif',
  },
} as const;

export const SYSTEM_STATE_COLOR: Record<string, string> = {
  nominal:  '#00E5A8',
  cautious: '#FFB020',
  degraded: '#FF8C00',
  halted:   '#FF4D4D',
};

export const SEVERITY_COLOR: Record<string, string> = {
  low:      '#00E5A8',
  medium:   '#FFB020',
  high:     '#FF8C00',
  critical: '#FF4D4D',
  none:     '#6B7C93',
};
