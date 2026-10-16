export const colors = {
  bg: '#0B0B14',
  surface: '#12121E',
  card: '#1A1A2B',
  border: '#2A2A40',
  text: '#F2F2FA',
  muted: '#8B8BA7',
  primary: '#7C5CFF',
  primarySoft: 'rgba(124,92,255,0.16)',
  accent: '#2DD4BF',
  danger: '#FF5C7A',
  high: '#FF5C7A',
  medium: '#FFB020',
  low: '#2DD4BF',
};

export const gradients = {
  primary: ['#7C5CFF', '#4F8CFF'],
  alarm: ['#FF5C7A', '#FF9A5C'],
  bg: ['#0B0B14', '#14102A'],
};

export const priorityColor = (p) => colors[p] || colors.medium;
export const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

export const radius = { sm: 10, md: 16, lg: 24 };
