export const tokens = {
  bg: {
    base:    '#0B0F14',
    surface: '#11161D',
    elevated:'#1B222C',
    border:  '#2A3441',
  },
  text: {
    primary:  '#E5E7EB',
    secondary:'#9CA3AF',
    muted:    '#6B7280',
  },
  accent: {
    green:   '#22C55E',
    yellow:  '#F59E0B',
    red:     '#EF4444',
    blue:    '#6B7280',
    neutral: '#6B7C93',
  },
  font: {
    mono: '"IBM Plex Sans", "Inter", "SF Pro Text", system-ui, sans-serif',
    ui:   '"Inter", "SF Pro Text", "IBM Plex Sans", system-ui, sans-serif',
  },
} as const;

export const SYSTEM_STATE_COLOR: Record<string, string> = {
  nominal:  '#22C55E',
  cautious: '#F59E0B',
  degraded: '#F59E0B',
  halted:   '#EF4444',
};

export const SEVERITY_COLOR: Record<string, string> = {
  low:      '#22C55E',
  medium:   '#F59E0B',
  high:     '#F59E0B',
  critical: '#EF4444',
  none:     '#6B7280',
};
