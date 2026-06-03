export interface ThemeTokens {
  bg: string
  surface: string
  card: string
  cardBorder: string
  accent: string
  accentDim: string
  accentBorder: string
  gold: string
  red: string
  amber: string
  green: string
  purple: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  gridLine: string
  chartBg: string
}

export const darkTokens: ThemeTokens = {
  bg: '#0a0c10',
  surface: '#0f1218',
  card: '#141820',
  cardBorder: '#1e2530',
  accent: '#00e5ff',
  accentDim: 'rgba(0,229,255,0.08)',
  accentBorder: 'rgba(0,229,255,0.2)',
  gold: '#f5c518',
  red: '#ff4757',
  amber: '#ffa502',
  green: '#2ed573',
  purple: '#7c5cbf',
  textPrimary: '#e8ecf0',
  textSecondary: '#6b7a8d',
  textMuted: '#3d4a57',
  gridLine: 'rgba(255,255,255,0.04)',
  chartBg: 'rgba(0,229,255,0.08)',
}

export const lightTokens: ThemeTokens = {
  bg: '#f4f6fb',
  surface: '#ffffff',
  card: '#ffffff',
  cardBorder: '#e8e6e0',
  accent: '#1a73e8',
  accentDim: 'rgba(26,115,232,0.06)',
  accentBorder: 'rgba(26,115,232,0.15)',
  gold: '#d4a017',
  red: '#dc3545',
  amber: '#e67e22',
  green: '#28a745',
  purple: '#6f42c1',
  textPrimary: '#1a1a2e',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  gridLine: 'rgba(0,0,0,0.06)',
  chartBg: 'rgba(26,115,232,0.08)',
}

export function getTokens(dark: boolean): ThemeTokens {
  return dark ? darkTokens : lightTokens
}

export const STATUS_COLORS: Record<string, { light: string; dark: string }> = {
  pending: { light: '#e67e22', dark: '#ffa502' },
  approved: { light: '#28a745', dark: '#2ed573' },
  rejected: { light: '#dc3545', dark: '#ff4757' },
  requires_action: { light: '#e74c3c', dark: '#ff6b81' },
  action_taken: { light: '#3b82f6', dark: '#70a1ff' },
}

export function getStatusColor(status: string, dark: boolean): string {
  const c = STATUS_COLORS[status]
  return c ? (dark ? c.dark : c.light) : (dark ? '#6b7a8d' : '#9ca3af')
}

export const QUESTION_LABELS: Record<string, string> = {
  // Original questions
  scp_area_clean: 'SCP area clean',
  waste_segregated: 'Waste segregated',
  waste_collection_status: 'Collection status',
  swatch_workers_count: 'Swatch workers',
  staff_present: 'Staff present',
  workers_wearing_uniform: 'Workers uniform',
  collection_team_mixing_waste: 'Waste not mixed',
  driver_helper_uniform: 'Driver uniform',
  vehicle_separate_compartments: 'Vehicle compartments',
  // New-format questions (found in recent reports)
  waste_present: 'Waste present',
  area_clean_remarks: 'Area clean remarks',
  swachh_workers_present: 'Swachh workers present',
  pmc_vehicle_present: 'PMC vehicle present',
  area_clean_30m: 'Area clean (30m)',
  swd_clean: 'SWD clean',
  signboard_visible: 'Signboard visible',
  third_person_dumping: 'Third-party dumping',
  leachate_visible: 'Leachate visible',
  stray_animals_present: 'Stray animals present',
  waste_scattered_outside: 'Waste scattered outside',
}

export const TOP_PERFORMER_ICONS: Record<string, string> = {
  'Top zone': '🗺️',
  'Top ward': '🏘️',
  'Top kothi': '🏠',
  'Top member': '👤',
  'Top feeder point': '📍',
  'Top chronic point': '⚡',
}

export const TOP_PERFORMER_COLORS: Record<string, { light: string; dark: string }> = {
  'Top zone': { light: '#1a73e8', dark: '#00e5ff' },
  'Top ward': { light: '#28a745', dark: '#2ed573' },
  'Top kothi': { light: '#d4a017', dark: '#f5c518' },
  'Top member': { light: '#6f42c1', dark: '#7c5cbf' },
  'Top feeder point': { light: '#1a73e8', dark: '#00e5ff' },
  'Top chronic point': { light: '#d4a017', dark: '#f5c518' },
}