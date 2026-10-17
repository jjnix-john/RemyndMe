export const colors = {
  // Fresh green-to-white breezy palette
  bg: '#F4F9F5',
  bgSoft: '#EAF5EE',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardSoft: '#F8FCF9',
  border: '#DCECE1',
  borderLight: '#EDF5F0',
  text: '#122F22',
  textSecondary: '#385A4A',
  muted: '#648775',
  subtle: '#8EAFA0',

  primary: '#10B981',
  primaryDark: '#059669',
  primaryLight: '#34D399',
  primarySoft: 'rgba(16, 185, 129, 0.12)',
  primaryGlow: 'rgba(16, 185, 129, 0.22)',

  accent: '#0D9488',
  accentSoft: '#F0FDFA',
  leafGreen: '#22C55E',

  danger: '#EF4444',
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#10B981',
};

export const gradients = {
  primary: ['#10B981', '#059669'],
  primaryBreezy: ['#34D399', '#10B981'],
  bg: ['#F4F9F5', '#EAF5EE', '#F8FCF9'],
  card: ['#FFFFFF', '#F8FCF9'],
  alarm: ['#F59E0B', '#EF4444'],
  breezyPill: ['#ECFDF5', '#D1FAE5'],
  leaf: ['#A7F3D0', '#6EE7B7'],
  morningDew: ['#F0FDF4', '#DCFCE7'],
};

export const priorityColor = (p) => colors[p] || colors.medium;
export const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

export const radius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  full: 999,
};

export const shadows = {
  floating: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  card: {
    shadowColor: '#122F22',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  breezy: {
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
};
