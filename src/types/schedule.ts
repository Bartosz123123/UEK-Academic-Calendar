export type ClassStatus =
  | 'scheduled'
  | 'cancelled'
  | 'rescheduled'
  | 'room_changed'
  | 'online'
  | 'exam';

export type NormalizedClassType =
  | 'wykład'
  | 'ćwiczenia'
  | 'lektorat'
  | 'seminarium'
  | 'laboratorium'
  | 'egzamin'
  | 'inne';

export interface ScheduleItem {
  id: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: string; // Pn, Wt, Śr, Cz, Pt, Sb, Nd
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  subject: string;
  type: string;
  normalizedType: NormalizedClassType;
  counterLabel?: string; // e.g. "Ćwiczenia 1/6", "Lektorat 4/10", "Wykład 3/3"
  dydacticHours?: number; // e.g. 3 or 4
  lecturer: string;
  lecturerId?: string;
  room: string;
  onlineUrl?: string;
  isOnlineLocation?: boolean;
  rawNotes: string; // e.g. "Uwagi: na 25.10"
  status: ClassStatus;
  statusReason?: string;
  rescheduledToDate?: string;
  rescheduledToTime?: string;
  rescheduledToRoom?: string;
  previousRoom?: string;
  isCustomModified?: boolean;
  isEndedManually?: boolean;
  userNote?: string;
}

export interface ScheduleMetadata {
  sourceUrl: string;
  typ: 'G' | 'N' | 'S';
  entityId: string;
  okres: string;
  groupName: string;
  groupFullName: string;
  authMode: 'cas_authenticated' | 'cookie_session' | 'raw_import' | 'demo_preview';
  casUser?: string;
  fetchedAt: string;
  authWarning?: string;
}

export interface ScheduleResponse {
  metadata: ScheduleMetadata;
  items: ScheduleItem[];
  sessionCookie?: string;
}

export interface CustomStatusOverride {
  status: ClassStatus;
  statusReason?: string;
  rescheduledToDate?: string;
  rescheduledToTime?: string;
  rescheduledToRoom?: string;
  previousRoom?: string;
  isEndedManually?: boolean;
  userNote?: string;
}

export type CategoryColorMode = 'classic' | 'accent_harmony' | 'custom';

export interface CustomColorsConfig {
  accentColor: string;
  darkBgColor: string;
  lightBgColor: string;
  rescheduledColor: string;
  categoryColorMode?: CategoryColorMode;
  cwiczeniaColor?: string;
  wykladColor?: string;
  lektoratColor?: string;
}

export type ScheduleDensity = 'compact' | 'comfortable' | 'spacious';
export type ScheduleCardStyle = 'liquid_glass' | 'matte_minimal' | 'sharp_pro';
export type ScheduleFontFamily = 'jakarta' | 'sf_system' | 'mono';
export type CategoryIndicatorStyle = 'bar' | 'glow_bar' | 'pill_dot';
export type LiveProgressStyle = 'line' | 'dots' | 'timeline_orb';

export interface LayoutPreferencesConfig {
  density: ScheduleDensity;
  cardStyle: ScheduleCardStyle;
  fontFamily: ScheduleFontFamily;
  categoryIndicator: CategoryIndicatorStyle;
  liveProgressStyle: LiveProgressStyle;
  headerBadgeIcon: string;
  customHeaderTitle: string;
  customHeaderSubtitle: string;
  countdownLabel: string;
  countdownDate: string; // YYYY-MM-DD or ''
  showHeroCard: boolean;
  showProgressCard: boolean;
  showBreaks: boolean;
  showWalkTimeHints: boolean;
  showSubjectIcons: boolean;
  showClassDuration: boolean;
  showLecturers: boolean;
  showClassCounters: boolean;
  showAmbientOrbs: boolean;
  autoCollapseCompletedDays: boolean;
}
