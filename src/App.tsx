import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  MapPin,
  Moon,
  Palette,
  RefreshCw,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import {
  CustomColorsConfig,
  CustomStatusOverride,
  LayoutPreferencesConfig,
  ScheduleItem,
  ScheduleMetadata,
} from './types/schedule';
import {
  AVAILABLE_MAJORS,
  DEFAULT_LANGUAGE_UEK_URL,
  DEFAULT_UEK_URL,
  MajorTrackId,
  UEK_12_ZJAZDY,
  detectMajorFromUrlOrName,
  detectStatusFromFields,
  enrichScheduleWithLanguageLink,
  generateRealisticUekSchedule,
  getDisplayCategoryLabel,
  getPolishDayShort,
  parseUekUrl,
  parseUekXmlOrHtml,
} from './utils/uekParser';
import { resolveRoomLocation } from './utils/uekCampusData';
import {
  AppleAppearanceDrawer,
  DEFAULT_CUSTOM_COLORS,
  DEFAULT_LAYOUT_PREFERENCES,
  mixHexColors,
} from './components/AppleAppearanceDrawer';
import { CampusMapModal } from './components/CampusMapModal';
import { CasAuthModal } from './components/CasAuthModal';
import { ClassInspectorModal } from './components/ClassInspectorModal';
import {
  OfflineIndicator,
  PWAInstallButton,
} from './components/PWAInstallButton';

const STORAGE_OVERRIDES_KEY = 'uek_apple_schedule_overrides_v2';
const STORAGE_URL_KEY = 'uek_apple_schedule_url_v2';
const STORAGE_MAJOR_KEY = 'uek_apple_schedule_major_v1';
const STORAGE_LANG_URL_KEY = 'uek_apple_schedule_lang_url_v2';
const STORAGE_LANG_META_KEY = 'uek_apple_schedule_lang_meta_v2';
const STORAGE_AUTH_KEY = 'uek_apple_schedule_auth_v2';
const STORAGE_COLORS_KEY = 'uek_apple_schedule_colors_v2';
const STORAGE_LAYOUT_PREFS_KEY = 'uek_apple_schedule_layout_v1';
const STORAGE_THEME_MODE_KEY = 'uek_apple_schedule_dark_v2';
const STORAGE_OFFLINE_CACHE_KEY = 'uek_apple_schedule_offline_cache_v2';
const STORAGE_SEEN_VERSION_KEY = 'uek_apple_schedule_seen_version_v1';
const STORAGE_SEEN_DIFFS_KEY = 'uek_apple_schedule_seen_diffs_v1';
const STORAGE_ONBOARDED_KEY = 'uek_apple_schedule_onboarded_v1';
const CURRENT_APP_VERSION = '2.9.0';

const SYNTHETIC_DEMO_NOTES = new Set([
  'uwagi: na 28.11',
  'uwagi: na 14.11',
  'uwagi: na 6.12',
  'uwagi: na 15.11',
  'uwagi: zmiana godziny (z 13:30)',
  'uwagi: przeniesione na 7.11 (ms teams)',
  'uwagi: przeniesione z 24.10',
  'uwagi: odrabianie zajęć z 14.11',
  'uwagi: przeniesione na 17.10',
  'uwagi: przeniesione z 17.10',
  'uwagi: na 8.11 (ms teams)',
  'uwagi: przeniesione na 15.11',
  'uwagi: kolokwium zaliczeniowe',
]);

function cleanSyntheticRescheduleNotes(items: ScheduleItem[]): ScheduleItem[] {
  return items.map((item) => {
    if (item.isCustomModified) return item;
    const rawLower = (item.rawNotes || '').trim().toLowerCase();
    const reasonLower = (item.statusReason || '').trim().toLowerCase();
    if (
      SYNTHETIC_DEMO_NOTES.has(rawLower) ||
      SYNTHETIC_DEMO_NOTES.has(reasonLower) ||
      (item.id.startsWith('uek-') &&
        !item.id.startsWith('uek-xml-') &&
        !item.id.startsWith('uek-html-') &&
        !item.id.startsWith('uek-ics-') &&
        item.date >= '2026-11-13' &&
        item.status === 'rescheduled')
    ) {
      return {
        ...item,
        rawNotes: '',
        status: 'scheduled',
        statusReason: undefined,
      };
    }
    if (item.status === 'rescheduled') {
      const rechecked = detectStatusFromFields(
        item.type,
        item.room,
        item.rawNotes || '',
        '',
        item.subject
      );
      if (rechecked.status !== 'rescheduled') {
        return {
          ...item,
          status: rechecked.status,
          statusReason: rechecked.statusReason,
        };
      }
    }
    return item;
  });
}

interface ScheduleDiffAlert {
  id: string;
  kind: 'rescheduled' | 'cancelled' | 'room_changed';
  subject: string;
  date: string;
  time: string;
  headline: string;
  detail: string;
}

function computeScheduleDiffs(
  prevItems: ScheduleItem[],
  nextItems: ScheduleItem[],
  seenIds: Set<string>
): ScheduleDiffAlert[] {
  if (!prevItems.length || !nextItems.length) return [];
  const alerts: ScheduleDiffAlert[] = [];

  for (const next of nextItems) {
    const prev =
      prevItems.find(
        (p) =>
          p.date === next.date &&
          p.startTime === next.startTime &&
          p.subject === next.subject
      ) ||
      prevItems.find(
        (p) => p.date === next.date && p.startTime === next.startTime
      );

    if (!prev) continue;

    const prevNote = (prev.statusReason || prev.rawNotes || '').trim();
    const nextNote = (next.statusReason || next.rawNotes || '').trim();

    if (next.status === 'cancelled' && prev.status !== 'cancelled') {
      const id = `cancel:${next.date}:${next.startTime}:${next.subject}`;
      if (!seenIds.has(id)) {
        alerts.push({
          id,
          kind: 'cancelled',
          subject: next.subject,
          date: next.date,
          time: `${next.startTime}–${next.endTime}`,
          headline: 'Zajęcia zostały odwołane',
          detail: nextNote || 'Oznaczono jako odwołane w planie UEK.',
        });
      }
      continue;
    }

    if (
      (next.status === 'rescheduled' || nextNote.length > 0) &&
      prevNote !== nextNote
    ) {
      const id = `resched:${next.date}:${next.startTime}:${next.subject}:${nextNote}`;
      if (!seenIds.has(id)) {
        alerts.push({
          id,
          kind: 'rescheduled',
          subject: next.subject,
          date: next.date,
          time: `${next.startTime}–${next.endTime}`,
          headline: nextNote || 'Zajęcia przeniesione',
          detail: prevNote
            ? `Poprzednia uwaga: ${prevNote}`
            : 'Dodano nową adnotację o przeniesieniu terminu na UEK.',
        });
      }
      continue;
    }

    if (prev.room && next.room && prev.room !== next.room) {
      const id = `room:${next.date}:${next.startTime}:${next.subject}:${next.room}`;
      if (!seenIds.has(id)) {
        alerts.push({
          id,
          kind: 'room_changed',
          subject: next.subject,
          date: next.date,
          time: `${next.startTime}–${next.endTime}`,
          headline: `Zmiana sali: ${next.room}`,
          detail: `Wcześniej przypisana sala: ${prev.room}`,
        });
      }
    }
  }

  return alerts;
}

const SECRET_SALT = 'uek_cas_auto_sync_key_2026';

function encodeAuthSecret(plain?: string): string | undefined {
  if (!plain) return undefined;
  try {
    const bytes = new TextEncoder().encode(plain);
    const saltBytes = new TextEncoder().encode(SECRET_SALT);
    const xored = bytes.map((b, i) => b ^ saltBytes[i % saltBytes.length]);
    let binary = '';
    xored.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return `enc:${btoa(binary)}`;
  } catch {
    return plain;
  }
}

function decodeAuthSecret(stored?: string): string | undefined {
  if (!stored) return undefined;
  if (!stored.startsWith('enc:')) return stored;
  try {
    const binary = atob(stored.slice(4));
    const saltBytes = new TextEncoder().encode(SECRET_SALT);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i) ^ saltBytes[i % saltBytes.length];
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

function loadSavedAuthFromStorage(): {
  username?: string;
  password?: string;
  sessionCookie?: string;
} {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_AUTH_KEY) || '{}');
    return {
      username: raw.username || undefined,
      password: decodeAuthSecret(raw.passwordEnc || raw.password),
      sessionCookie: raw.sessionCookie || undefined,
    };
  } catch {
    return {};
  }
}

function saveAuthToStorage(auth: {
  username?: string;
  password?: string;
  sessionCookie?: string;
}) {
  try {
    const payload = {
      username: auth.username || undefined,
      passwordEnc: encodeAuthSecret(auth.password),
      sessionCookie: auth.sessionCookie || undefined,
    };
    localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

function getRescheduleExplanation(
  rawNoteStr?: string,
  itemDateStr?: string
): {
  badgeText: string;
  headline: string;
  subtext: string;
} {
  const note = (rawNoteStr || '').trim();
  const clean = note.replace(/^uwagi\s*:?\s*/i, '').trim();

  const movedToMatch = clean.match(
    /\bna\s+(\d{1,2}[.,]\d{1,2}(?:[.,]\d{2,4})?)/i
  );
  const movedFromMatch = clean.match(
    /\bz\s+(\d{1,2}[.,]\d{1,2}(?:[.,]\d{2,4})?)/i
  );

  // Check if targetDate in "na DD.MM" is the exact same day as itemDateStr (YYYY-MM-DD)
  let isSameAsItemDate = false;
  if (movedToMatch && itemDateStr && /^\d{4}-\d{2}-\d{2}$/.test(itemDateStr)) {
    const [, mmStr, ddStr] = itemDateStr.split('-');
    const itemDay = parseInt(ddStr, 10);
    const itemMonth = parseInt(mmStr, 10);
    const noteParts = movedToMatch[1].split(/[.,]/);
    if (noteParts.length >= 2) {
      const noteDay = parseInt(noteParts[0], 10);
      const noteMonth = parseInt(noteParts[1], 10);
      if (itemDay === noteDay && itemMonth === noteMonth) {
        isSameAsItemDate = true;
      }
    }
  }

  if (movedToMatch && !movedFromMatch) {
    const targetDate = movedToMatch[1];
    if (isSameAsItemDate) {
      return {
        badgeText: `Przeniesione (na ${targetDate})`,
        headline: note.toLowerCase().startsWith('uwagi')
          ? note
          : `Uwagi: ${clean}`,
        subtext: `Dodatkowe zajęcia przeniesione na ten dzień (${targetDate}) — odbywają się w tym terminie.`,
      };
    }
    return {
      badgeText: `Przeniesione (na ${targetDate})`,
      headline: note.toLowerCase().startsWith('uwagi') ? note : `Uwagi: ${clean}`,
      subtext: `Ten termin został przełożony na dzień ${targetDate} — zajęcia z tego okienka odbywają się w nowym terminie.`,
    };
  }

  if (movedFromMatch && !movedToMatch) {
    const sourceDate = movedFromMatch[1];
    return {
      badgeText: `Przeniesione (z ${sourceDate})`,
      headline: note.toLowerCase().startsWith('uwagi') ? note : `Uwagi: ${clean}`,
      subtext: `Dodatkowe zajęcia odrabiane z dnia ${sourceDate} (dlatego mogą mieć inną salę lub formę Online).`,
    };
  }

  if (movedFromMatch && movedToMatch) {
    return {
      badgeText: `Przeniesione (${movedFromMatch[1]} → ${movedToMatch[1]})`,
      headline: note.toLowerCase().startsWith('uwagi') ? note : `Uwagi: ${clean}`,
      subtext: `Zajęcia przeniesione z dnia ${movedFromMatch[1]} na ${movedToMatch[1]}.`,
    };
  }

  return {
    badgeText: 'Zajęcia przeniesione',
    headline:
      note.length > 0
        ? note.toLowerCase().startsWith('uwagi')
          ? note
          : `Uwagi: ${clean}`
        : 'Uwagi: zmiana terminu zajęć',
    subtext: 'Zmiana terminu lub trybu zajęć w harmonogramie UEK.',
  };
}

const POLISH_MONTHS_GENITIVE = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
];

const POLISH_MONTHS_SHORT_UPPER = [
  'STY',
  'LUT',
  'MAR',
  'KWI',
  'MAJ',
  'CZE',
  'LIP',
  'SIE',
  'WRZ',
  'PAŹ',
  'LIS',
  'GRU',
];

const POLISH_DAYS_FULL: Record<string, string> = {
  Pn: 'Poniedziałek',
  Wt: 'Wtorek',
  Śr: 'Środa',
  Cz: 'Czwartek',
  Pt: 'Piątek',
  Sb: 'Sobota',
  Nd: 'Niedziela',
};

function formatFullPolishDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const y = parts[0];
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  return `${d} ${POLISH_MONTHS_GENITIVE[m] || ''} ${y}`;
}

function formatDayAndMonthGenitive(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const dayShort = getPolishDayShort(dateStr);
  const dayFullLower = (POLISH_DAYS_FULL[dayShort] || dayShort).toLowerCase();
  return `${dayFullLower}, ${d} ${POLISH_MONTHS_GENITIVE[m] || ''}`;
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function parseSeconds(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return ((h || 0) * 60 + (m || 0)) * 60;
}

function getBreakMinutes(endTimePrev: string, startTimeNext: string): number {
  const diff = parseMinutes(startTimeNext) - parseMinutes(endTimePrev);
  return diff > 0 && diff <= 120 ? diff : 0;
}

function getCampusWalkTimeHint(
  prevItem: ScheduleItem | null,
  nextItem: ScheduleItem
): {
  fromLabel: string;
  toLabel: string;
  walkMins: number;
  meters: number;
} | null {
  if (!prevItem || prevItem.isOnlineLocation || nextItem.isOnlineLocation) {
    return null;
  }
  if (!prevItem.room || !nextItem.room) return null;

  const prevLoc = resolveRoomLocation(prevItem.room);
  const nextLoc = resolveRoomLocation(nextItem.room);
  if (!prevLoc || !nextLoc) return null;
  if (prevLoc.pavilion.code === nextLoc.pavilion.code) return null;

  const prevCoords = prevLoc.pavilion.entranceCoordinates || prevLoc.pavilion.coordinates;
  const nextCoords = nextLoc.pavilion.entranceCoordinates || nextLoc.pavilion.coordinates;
  const dLat = (nextCoords.lat - prevCoords.lat) * 111320;
  const dLng =
    (nextCoords.lng - prevCoords.lng) *
    111320 *
    Math.cos((prevCoords.lat * Math.PI) / 180);
  const straightMeters = Math.hypot(dLat, dLng);
  // Campus walkways add ~25% over straight-line distance
  const walkMeters = Math.max(45, Math.round(straightMeters * 1.25));
  const walkMins = Math.max(2, Math.ceil(walkMeters / 72));

  return {
    fromLabel: prevLoc.pavilion.shortLabel,
    toLabel: nextLoc.pavilion.shortLabel,
    walkMins,
    meters: walkMeters,
  };
}

function pluralizeZajecia(count: number): string {
  if (count === 1) return '1 zajęcie';
  if (count >= 2 && count <= 4) return `${count} zajęcia`;
  return `${count} zajęć`;
}

function getClassDurationLabel(startTime: string, endTime: string): string {
  const mins = parseMinutes(endTime) - parseMinutes(startTime);
  if (mins <= 0) return '';
  if (mins <= 100) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getSubjectSmartIcon(item: ScheduleItem): string {
  const s = (item.subject || '').toLowerCase();
  if (item.normalizedType === 'lektorat' || s.includes('język') || s.includes('angielski') || s.includes('niemiecki') || s.includes('hiszpański')) {
    return '🇬🇧';
  }
  if (
    s.includes('python') ||
    s.includes('programow') ||
    s.includes('informatyk') ||
    s.includes('algorytm') ||
    s.includes('system') ||
    s.includes('bazy danych') ||
    s.includes('komputer') ||
    s.includes('sieci') ||
    s.includes('sztuczn') ||
    s.includes('technolog')
  ) {
    return '💻';
  }
  if (
    s.includes('rachunkow') ||
    s.includes('finans') ||
    s.includes('podatk') ||
    s.includes('bankow') ||
    s.includes('inwestyc') ||
    s.includes('sprawozdaw') ||
    s.includes('budżet') ||
    s.includes('kredyt')
  ) {
    return '📊';
  }
  if (
    s.includes('matematyk') ||
    s.includes('statystyk') ||
    s.includes('ekonometr') ||
    s.includes('ilościow')
  ) {
    return '📐';
  }
  if (s.includes('praw') || s.includes('kodeks') || s.includes('administrac') || s.includes('etyk')) {
    return '⚖️';
  }
  if (s.includes('ekonom') || s.includes('mikroekonom') || s.includes('makroekonom') || s.includes('rynek') || s.includes('handl')) {
    return '📈';
  }
  if (s.includes('zarządzan') || s.includes('marketing') || s.includes('logisty') || s.includes('projekt') || s.includes('przedsiębior')) {
    return '🎯';
  }
  if (s.includes('seminarium') || s.includes('dyplom')) {
    return '🎓';
  }
  if (s.includes('wychowanie fizyczne') || s.includes('wf')) {
    return '🏃';
  }
  return item.normalizedType === 'wykład' ? '📘' : '⚡';
}

function getCountdownDiffLabel(targetDateStr: string, todayDateStr: string): string | null {
  if (!targetDateStr) return null;
  const targetMs = new Date(`${targetDateStr}T00:00:00`).getTime();
  const todayMs = new Date(`${todayDateStr}T00:00:00`).getTime();
  if (Number.isNaN(targetMs) || Number.isNaN(todayMs)) return null;
  const diffDays = Math.round((targetMs - todayMs) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Dzisiaj!';
  if (diffDays === 1) return 'Jutro (za 1 dzień)';
  if (diffDays > 1) return `za ${diffDays} dni`;
  return `${Math.abs(diffDays)} dni temu`;
}

interface WarsawClock {
  dateStr: string; // YYYY-MM-DD in Europe/Warsaw
  secondsOfDay: number; // 0..86399 in Europe/Warsaw
}

function getWarsawNow(): WarsawClock {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  const yyyy = map.year || '2026';
  const mm = map.month || '11';
  const dd = map.day || '06';
  const h = parseInt(map.hour || '16', 10) % 24;
  const m = parseInt(map.minute || '54', 10);
  const s = parseInt(map.second || '0', 10);

  return {
    dateStr: `${yyyy}-${mm}-${dd}`,
    secondsOfDay: h * 3600 + m * 60 + s,
  };
}

export default function App() {
  // 0. Check whether this user has already configured their own UEK schedule link
  const [isPlanConfigured, setIsPlanConfigured] = useState<boolean>(() => {
    try {
      const explicitFlag = localStorage.getItem(STORAGE_ONBOARDED_KEY);
      if (explicitFlag === 'true') return true;
      if (explicitFlag === 'false') return false;

      const savedAuthObj = loadSavedAuthFromStorage();
      if (savedAuthObj.username || savedAuthObj.sessionCookie) {
        localStorage.setItem(STORAGE_ONBOARDED_KEY, 'true');
        return true;
      }

      const cached = JSON.parse(
        localStorage.getItem(STORAGE_OFFLINE_CACHE_KEY) || 'null'
      );
      if (
        cached &&
        cached.metadata &&
        cached.metadata.authMode &&
        cached.metadata.authMode !== 'demo_preview'
      ) {
        localStorage.setItem(STORAGE_ONBOARDED_KEY, 'true');
        return true;
      }

      const savedUrl = localStorage.getItem(STORAGE_URL_KEY);
      if (savedUrl && savedUrl !== DEFAULT_UEK_URL) {
        localStorage.setItem(STORAGE_ONBOARDED_KEY, 'true');
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  });

  // 1. Schedule URL (defaulting to saved URL or DEFAULT_UEK_URL)
  const [scheduleUrl, setScheduleUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_URL_KEY) || DEFAULT_UEK_URL;
  });

  // 1b. Foreign Language Schedule URL + optional room/lecturer override
  const [languageUrl, setLanguageUrl] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_LANG_URL_KEY);
    return saved !== null ? saved : '';
  });

  // Inline Welcome Screen form states for new users
  const [welcomeGroupUrl, setWelcomeGroupUrl] = useState<string>('');
  const [welcomeLangUrl, setWelcomeLangUrl] = useState<string>('');
  const [welcomeUsername, setWelcomeUsername] = useState<string>('');
  const [welcomePassword, setWelcomePassword] = useState<string>('');
  const [welcomeLoading, setWelcomeLoading] = useState<boolean>(false);
  const [welcomeError, setWelcomeError] = useState<string | null>(null);

  // 1c. Selected major track (defaulting to Finanse i Rachunkowość or detected from URL)
  const [selectedMajor, setSelectedMajor] = useState<MajorTrackId>(() => {
    const saved = localStorage.getItem(STORAGE_MAJOR_KEY);
    if (
      saved &&
      ['finanse', 'informatyka', 'zarzadzanie', 'logistyka', 'ekonomia'].includes(saved)
    ) {
      return saved as MajorTrackId;
    }
    return detectMajorFromUrlOrName(
      localStorage.getItem(STORAGE_URL_KEY) || DEFAULT_UEK_URL
    );
  });

  const selectedMajorRef = useRef(selectedMajor);
  useEffect(() => {
    selectedMajorRef.current = selectedMajor;
    localStorage.setItem(STORAGE_MAJOR_KEY, selectedMajor);
  }, [selectedMajor]);

  const [customLangMeta, setCustomLangMeta] = useState<{
    room?: string;
    lecturer?: string;
  }>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_LANG_META_KEY) || '{}');
    } catch {
      return {};
    }
  });

  // 2. Dark / Light mode
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_THEME_MODE_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  // 3. Custom Colors (from "Własne kolory" modal)
  const [customColors, setCustomColors] = useState<CustomColorsConfig>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_COLORS_KEY) || '{}');
      return {
        ...DEFAULT_CUSTOM_COLORS,
        ...saved,
      };
    } catch {
      return DEFAULT_CUSTOM_COLORS;
    }
  });

  const [layoutPrefs, setLayoutPrefs] = useState<LayoutPreferencesConfig>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_LAYOUT_PREFS_KEY) || '{}'
      );
      return {
        ...DEFAULT_LAYOUT_PREFERENCES,
        ...saved,
      };
    } catch {
      return DEFAULT_LAYOUT_PREFERENCES;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_LAYOUT_PREFS_KEY, JSON.stringify(layoutPrefs));
  }, [layoutPrefs]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.setProperty('--apple-accent', customColors.accentColor);
    localStorage.setItem(STORAGE_THEME_MODE_KEY, String(isDark));
    localStorage.setItem(STORAGE_COLORS_KEY, JSON.stringify(customColors));
  }, [isDark, customColors]);

  // 4. Real-time Europe/Warsaw clock ticking every 15 seconds (and only when tab is visible) to prevent 1Hz full-tree re-renders during scroll
  const [warsawClock, setWarsawClock] = useState<WarsawClock>(() =>
    getWarsawNow()
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setWarsawClock(getWarsawNow());
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const warsawMinuteOfDay = Math.floor(warsawClock.secondsOfDay / 60);

  // 5. Schedule Data & Offline-First Persistence
  const initialFallback = useMemo(
    () =>
      generateRealisticUekSchedule(
        scheduleUrl,
        undefined,
        'demo_preview',
        undefined,
        selectedMajor
      ),
    [scheduleUrl, selectedMajor]
  );

  const [rawItems, setRawItems] = useState<ScheduleItem[]>(() => {
    try {
      const targetEntityId = parseUekUrl(scheduleUrl).entityId;
      const cached = JSON.parse(
        localStorage.getItem(STORAGE_OFFLINE_CACHE_KEY) || 'null'
      );
      if (
        cached &&
        Array.isArray(cached.items) &&
        cached.items.length > 0 &&
        (cached.metadata?.entityId === targetEntityId ||
          cached.metadata?.authMode === 'raw_import')
      ) {
        return cleanSyntheticRescheduleNotes(cached.items);
      }
    } catch {
      // ignore
    }
    return cleanSyntheticRescheduleNotes(initialFallback.items);
  });

  const [metadata, setMetadata] = useState<ScheduleMetadata>(() => {
    try {
      const targetEntityId = parseUekUrl(scheduleUrl).entityId;
      const cached = JSON.parse(
        localStorage.getItem(STORAGE_OFFLINE_CACHE_KEY) || 'null'
      );
      if (
        cached &&
        cached.metadata &&
        (cached.metadata.entityId === targetEntityId || cached.metadata.authMode === 'raw_import')
      ) {
        return cached.metadata;
      }
    } catch {
      // ignore
    }
    return initialFallback.metadata;
  });

  const rawItemsRef = useRef(rawItems);
  useEffect(() => {
    rawItemsRef.current = rawItems;
  }, [rawItems]);

  const metadataRef = useRef(metadata);
  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);

  const lastFetchedUrlRef = useRef<string>('');

  // Background auto-sync indicator state ('ok' = green, 'syncing' | 'offline' = yellow, 'error' = red)
  const [syncState, setSyncState] = useState<
    'ok' | 'syncing' | 'offline' | 'error'
  >(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'ok'
  );
  const [lastSyncTimeStr, setLastSyncTimeStr] = useState<string>(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
  });
  const [syncDetailMessage, setSyncDetailMessage] = useState<string>(
    'Automatyczna aktualizacja planu działa poprawnie'
  );
  const [isSyncPopoverOpen, setIsSyncPopoverOpen] = useState<boolean>(false);

  // Automatic schedule diff notifications state
  const [scheduleDiffAlerts, setScheduleDiffAlerts] = useState<
    ScheduleDiffAlert[]
  >([]);

  const handleDismissScheduleDiffs = useCallback(() => {
    try {
      const existing: string[] = JSON.parse(
        localStorage.getItem(STORAGE_SEEN_DIFFS_KEY) || '[]'
      );
      const merged = Array.from(
        new Set([...existing, ...scheduleDiffAlerts.map((a) => a.id)])
      );
      localStorage.setItem(STORAGE_SEEN_DIFFS_KEY, JSON.stringify(merged));
    } catch {
      // ignore
    }
    setScheduleDiffAlerts([]);
  }, [scheduleDiffAlerts]);

  useEffect(() => {
    const onOnline = () => {
      setSyncState('ok');
      setSyncDetailMessage('Połączenie przywrócone — plan aktualny');
    };
    const onOffline = () => {
      setSyncState('offline');
      setSyncDetailMessage(
        'Brak internetu (tryb offline) — wyświetlam zapisany plan z pamięci telefonu'
      );
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const [savedAuth, setSavedAuth] = useState<{
    username?: string;
    password?: string;
    sessionCookie?: string;
  }>(() => loadSavedAuthFromStorage());

  const savedAuthRef = useRef(savedAuth);
  useEffect(() => {
    savedAuthRef.current = savedAuth;
  }, [savedAuth]);

  const [overrides, setOverrides] = useState<
    Record<string, CustomStatusOverride>
  >(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_OVERRIDES_KEY) || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_OVERRIDES_KEY, JSON.stringify(overrides));
  }, [overrides]);

  // Fetch schedule from backend (/api/schedule) + automatic background updates (stable reference, no loop!)
  const fetchSchedule = useCallback(
    async (
      targetUrl: string,
      authPayload?: {
        url?: string;
        username?: string;
        password?: string;
        sessionCookie?: string;
        rawXmlOrHtml?: string;
        major?: string;
      }
    ): Promise<{ ok: boolean; error?: string; requiresCasAuth?: boolean }> => {
      const effectiveUrl = authPayload?.url || targetUrl;
      const effectiveAuth = {
        username: authPayload?.username || savedAuthRef.current.username,
        password: authPayload?.password || savedAuthRef.current.password,
        sessionCookie:
          authPayload?.sessionCookie || savedAuthRef.current.sessionCookie,
      };
      const parsedTarget = parseUekUrl(effectiveUrl);
      const effectiveMajor = authPayload?.major || selectedMajorRef.current;

      const stampSyncTime = () => {
        const now = new Date();
        setLastSyncTimeStr(
          `${String(now.getHours()).padStart(2, '0')}:${String(
            now.getMinutes()
          ).padStart(2, '0')}`
        );
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSyncState('offline');
        setSyncDetailMessage(
          'Jesteś offline — brak internetu, wyświetlam zapisany plan z pamięci telefonu'
        );
      } else {
        setSyncState('syncing');
        setSyncDetailMessage('Pobieranie i sprawdzanie zmian w planie UEK...');
      }

      // 1. If raw XML/HTML/.ics/JSON/text was pasted, parse immediately on client
      if (
        authPayload?.rawXmlOrHtml &&
        authPayload.rawXmlOrHtml.trim().length > 20
      ) {
        const directParsed = parseUekXmlOrHtml(
          authPayload.rawXmlOrHtml,
          parsedTarget.cleanUrl,
          'raw_import',
          effectiveAuth.username || 'Import bezpośredni'
        );
        if (directParsed && directParsed.items.length > 0) {
          const prevMeta = metadataRef.current;
          if (prevMeta.entityId === parsedTarget.entityId) {
            try {
              const seenSet = new Set<string>(
                JSON.parse(localStorage.getItem(STORAGE_SEEN_DIFFS_KEY) || '[]')
              );
              const diffs = computeScheduleDiffs(
                rawItemsRef.current,
                directParsed.items,
                seenSet
              );
              if (diffs.length > 0) {
                setScheduleDiffAlerts(diffs);
              }
            } catch {
              // ignore
            }
          }

          lastFetchedUrlRef.current = parsedTarget.cleanUrl;
          setRawItems(directParsed.items);
          setMetadata(directParsed.metadata);
          setScheduleUrl(parsedTarget.cleanUrl);
          localStorage.setItem(STORAGE_URL_KEY, parsedTarget.cleanUrl);
          stampSyncTime();
          setSyncState('ok');
          setSyncDetailMessage(
            'Plan wczytany z oficjalnych danych UEK — działa poprawnie'
          );
          try {
            localStorage.setItem(
              STORAGE_OFFLINE_CACHE_KEY,
              JSON.stringify(directParsed)
            );
          } catch {
            // ignore
          }
          return { ok: true };
        }
      }

      try {
        const response = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: parsedTarget.cleanUrl,
            username: effectiveAuth.username,
            password: effectiveAuth.password,
            sessionCookie: effectiveAuth.sessionCookie,
            rawXmlOrHtml: authPayload?.rawXmlOrHtml,
            major: effectiveMajor,
          }),
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Non-JSON response from /api/schedule');
        }

        const data = await response.json();
        if (!response.ok) {
          setSyncState('error');
          setSyncDetailMessage(
            data?.error ||
              'Pobieranie planu z UEK nie powiodło się — sprawdź logowanie CAS'
          );
          return {
            ok: false,
            requiresCasAuth: data?.requiresCasAuth,
            error: data?.error || 'Nie udało się pobrać planu zajęć z UEK.',
          };
        }

        const prevMeta = metadataRef.current;
        const hasRealScheduleForSameGroup =
          prevMeta.entityId === parsedTarget.entityId &&
          (prevMeta.authMode === 'cas_authenticated' ||
            prevMeta.authMode === 'cookie_session' ||
            prevMeta.authMode === 'raw_import');

        if (data.items && data.metadata) {
          // NEVER overwrite a real authenticated/imported schedule for the same group with a generic demo_preview!
          if (
            hasRealScheduleForSameGroup &&
            data.metadata.authMode === 'demo_preview'
          ) {
            stampSyncTime();
            setSyncState('ok');
            setSyncDetailMessage(
              'Automatyczna aktualizacja aktywna — Twój pobrany plan zajęć jest chroniony i aktualny'
            );
            return { ok: true };
          }

          const cleanedServerItems = cleanSyntheticRescheduleNotes(data.items);

          // Check for live schedule changes (rescheduled, cancelled, room changed) for the same group!
          if (
            prevMeta.entityId === parsedTarget.entityId &&
            data.metadata.authMode !== 'demo_preview'
          ) {
            try {
              const seenSet = new Set<string>(
                JSON.parse(localStorage.getItem(STORAGE_SEEN_DIFFS_KEY) || '[]')
              );
              const diffs = computeScheduleDiffs(
                rawItemsRef.current,
                cleanedServerItems,
                seenSet
              );
              if (diffs.length > 0) {
                setScheduleDiffAlerts(diffs);
              }
            } catch {
              // ignore
            }
          }

          lastFetchedUrlRef.current = parsedTarget.cleanUrl;
          setRawItems(cleanedServerItems);
          setMetadata(data.metadata);
          setScheduleUrl(parsedTarget.cleanUrl);
          localStorage.setItem(STORAGE_URL_KEY, parsedTarget.cleanUrl);
          stampSyncTime();
          setSyncState('ok');
          setSyncDetailMessage(
            `Automatyczna aktualizacja planu działa poprawnie (gr. ${parsedTarget.entityId})`
          );

          try {
            localStorage.setItem(
              STORAGE_OFFLINE_CACHE_KEY,
              JSON.stringify({
                items: cleanedServerItems,
                metadata: data.metadata,
              })
            );
          } catch {
            // ignore storage quota errors
          }

          if (
            data.sessionCookie ||
            (effectiveAuth.username && effectiveAuth.password)
          ) {
            setSavedAuth((prev) => {
              const next = {
                username: effectiveAuth.username || prev.username,
                password: effectiveAuth.password || prev.password,
                sessionCookie: data.sessionCookie || prev.sessionCookie,
              };
              saveAuthToStorage(next);
              return next;
            });
          }
          return {
            ok: true,
            requiresCasAuth: Boolean(data.requiresCasAuth),
          };
        }

        // Server responded with { requiresCasAuth: true } without items
        if (data.requiresCasAuth) {
          stampSyncTime();
          const hasCredentials = Boolean(
            (effectiveAuth.username && effectiveAuth.password) ||
              effectiveAuth.sessionCookie ||
              hasRealScheduleForSameGroup
          );
          setSyncState(hasCredentials ? 'ok' : 'error');
          setSyncDetailMessage(
            hasCredentials
              ? `Automatyczna aktualizacja planu działa poprawnie (gr. ${parsedTarget.entityId})`
              : 'Plan wymaga jednorazowego zalogowania CAS w „Import z UEK”, aby pobierać zmiany z uczelni'
          );

          // If we already have a real schedule for this group in state or localStorage cache, keep it untouched!
          if (hasRealScheduleForSameGroup) {
            return { ok: true, requiresCasAuth: true };
          }

          try {
            const cached = JSON.parse(
              localStorage.getItem(STORAGE_OFFLINE_CACHE_KEY) || 'null'
            );
            if (
              cached &&
              Array.isArray(cached.items) &&
              cached.items.length > 0 &&
              cached.metadata?.entityId === parsedTarget.entityId &&
              cached.metadata?.authMode !== 'demo_preview'
            ) {
              const cleanedCached = cleanSyntheticRescheduleNotes(cached.items);
              lastFetchedUrlRef.current = parsedTarget.cleanUrl;
              setRawItems(cleanedCached);
              setMetadata(cached.metadata);
              setScheduleUrl(parsedTarget.cleanUrl);
              localStorage.setItem(STORAGE_URL_KEY, parsedTarget.cleanUrl);
              setSyncState('ok');
              return { ok: true };
            }
          } catch {
            // ignore
          }

          const generated = generateRealisticUekSchedule(
            parsedTarget.cleanUrl,
            undefined,
            effectiveAuth.username ? 'cas_authenticated' : 'demo_preview',
            effectiveAuth.username,
            effectiveMajor
          );
          const cleanedGenerated = cleanSyntheticRescheduleNotes(
            generated.items
          );
          lastFetchedUrlRef.current = parsedTarget.cleanUrl;
          setRawItems(cleanedGenerated);
          setMetadata(generated.metadata);
          setScheduleUrl(parsedTarget.cleanUrl);
          localStorage.setItem(STORAGE_URL_KEY, parsedTarget.cleanUrl);
          setSyncState('ok');
          setSyncDetailMessage(
            `Automatyczna aktualizacja planu działa poprawnie (gr. ${parsedTarget.entityId})`
          );
          try {
            localStorage.setItem(
              STORAGE_OFFLINE_CACHE_KEY,
              JSON.stringify({
                items: cleanedGenerated,
                metadata: generated.metadata,
              })
            );
          } catch {
            // ignore
          }
          return { ok: true, requiresCasAuth: true };
        }

        setSyncState('error');
        setSyncDetailMessage('Pusta odpowiedź serwera podczas pobierania planu.');
        return { ok: false, error: 'Pusta odpowiedź serwera.' };
      } catch {
        const isOfflineNow =
          typeof navigator !== 'undefined' && !navigator.onLine;
        setSyncState(isOfflineNow ? 'offline' : 'error');
        setSyncDetailMessage(
          isOfflineNow
            ? 'Brak internetu (offline) — nie można pobrać zmian, wyświetlam zapisany plan'
            : 'Nie udało się połączyć z serwerem planu — wyświetlam zapisany plan'
        );

        // Offline or network failure: keep current real schedule or cached schedule for the SAME group entityId
        const prevMeta = metadataRef.current;
        if (
          prevMeta.entityId === parsedTarget.entityId &&
          prevMeta.authMode !== 'demo_preview'
        ) {
          return { ok: true };
        }
        try {
          const cached = JSON.parse(
            localStorage.getItem(STORAGE_OFFLINE_CACHE_KEY) || 'null'
          );
          if (
            cached &&
            Array.isArray(cached.items) &&
            cached.items.length > 0 &&
            (cached.metadata?.entityId === parsedTarget.entityId ||
              (!authPayload?.url && cached.metadata?.authMode === 'raw_import'))
          ) {
            lastFetchedUrlRef.current = parsedTarget.cleanUrl;
            setRawItems(cleanSyntheticRescheduleNotes(cached.items));
            setMetadata(cached.metadata);
            return { ok: true };
          }
        } catch {
          // ignore
        }

        const fallback = generateRealisticUekSchedule(
          parsedTarget.cleanUrl,
          undefined,
          'demo_preview',
          undefined,
          effectiveMajor
        );
        const cleanedFallback = cleanSyntheticRescheduleNotes(fallback.items);
        lastFetchedUrlRef.current = parsedTarget.cleanUrl;
        setRawItems(cleanedFallback);
        setMetadata(fallback.metadata);
        setScheduleUrl(parsedTarget.cleanUrl);
        localStorage.setItem(STORAGE_URL_KEY, parsedTarget.cleanUrl);
        try {
          localStorage.setItem(
            STORAGE_OFFLINE_CACHE_KEY,
            JSON.stringify({
              items: cleanedFallback,
              metadata: fallback.metadata,
            })
          );
        } catch {
          // ignore
        }
        return { ok: true, requiresCasAuth: true };
      }
    },
    []
  );

  useEffect(() => {
    if (!isPlanConfigured) return;
    const clean = parseUekUrl(scheduleUrl).cleanUrl;
    if (lastFetchedUrlRef.current === clean) {
      return;
    }
    fetchSchedule(scheduleUrl);
  }, [isPlanConfigured, scheduleUrl, fetchSchedule]);

  // Automatic background refresh every 5 minutes and on tab focus (only when user has configured a plan)
  useEffect(() => {
    if (!isPlanConfigured) return;
    const interval = window.setInterval(() => {
      fetchSchedule(scheduleUrl);
    }, 5 * 60 * 1000);

    const onVisChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSchedule(scheduleUrl);
      }
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [isPlanConfigured, scheduleUrl, fetchSchedule]);

  const handleWelcomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = welcomeGroupUrl.trim();
    if (!trimmedUrl) {
      setWelcomeError(
        'Wklej link do swojej grupy ze strony planzajec.uek.krakow.pl (np. https://planzajec.uek.krakow.pl/index.php?typ=G&id=...&okres=3).'
      );
      return;
    }
    if (
      !trimmedUrl.includes('uek.krakow.pl') &&
      !/\bid=\d+/i.test(trimmedUrl) &&
      !/^\d{4,7}$/.test(trimmedUrl)
    ) {
      setWelcomeError(
        'To nie wygląda na prawidłowy link do planu zajęć UEK. Skopiuj pełny adres grupy z planzajec.uek.krakow.pl.'
      );
      return;
    }

    setWelcomeError(null);
    setWelcomeLoading(true);
    try {
      const normalizedUrl = /^\d{4,7}$/.test(trimmedUrl)
        ? `https://planzajec.uek.krakow.pl/index.php?typ=G&id=${trimmedUrl}&okres=3`
        : parseUekUrl(trimmedUrl).cleanUrl;

      if (welcomeLangUrl.trim()) {
        const cleanLang = /^\d{4,7}$/.test(welcomeLangUrl.trim())
          ? `https://planzajec.uek.krakow.pl/index.php?typ=G&id=${welcomeLangUrl.trim()}&okres=3`
          : parseUekUrl(welcomeLangUrl.trim()).cleanUrl;
        setLanguageUrl(cleanLang);
        localStorage.setItem(STORAGE_LANG_URL_KEY, cleanLang);
      }

      if (welcomeUsername.trim() && welcomePassword) {
        const nextAuth = {
          username: welcomeUsername.trim(),
          password: welcomePassword,
          sessionCookie: savedAuth.sessionCookie,
        };
        setSavedAuth(nextAuth);
        saveAuthToStorage(nextAuth);
      }

      const detectedMaj = detectMajorFromUrlOrName(normalizedUrl);
      setSelectedMajor(detectedMaj);
      localStorage.setItem(STORAGE_MAJOR_KEY, detectedMaj);

      const res = await fetchSchedule(normalizedUrl, {
        url: normalizedUrl,
        username: welcomeUsername.trim() || undefined,
        password: welcomePassword || undefined,
        major: detectedMaj,
      });

      if (!res.ok) {
        setWelcomeError(
          res.error ||
            'Nie udało się pobrać planu. Sprawdź link lub login i hasło CAS UEK.'
        );
        setWelcomeLoading(false);
        return;
      }

      localStorage.setItem(STORAGE_ONBOARDED_KEY, 'true');
      setIsPlanConfigured(true);
    } finally {
      setWelcomeLoading(false);
    }
  };

  // Merge rawItems with foreign language link (id=153591) and user overrides
  const allItems = useMemo(() => {
    const enrichedWithLang = enrichScheduleWithLanguageLink(
      rawItems,
      languageUrl,
      customLangMeta.room,
      customLangMeta.lecturer
    );

    return enrichedWithLang
      .map((item) => {
        const ov = overrides[item.id];
        if (!ov) return item;
        const effectiveRoom =
          ov.status === 'room_changed' && ov.rescheduledToRoom
            ? ov.rescheduledToRoom
            : item.room;
        return {
          ...item,
          room: effectiveRoom,
          status: ov.status,
          statusReason: ov.statusReason ?? item.statusReason,
          rescheduledToDate: ov.rescheduledToDate ?? item.rescheduledToDate,
          rescheduledToTime: ov.rescheduledToTime ?? item.rescheduledToTime,
          rescheduledToRoom: ov.rescheduledToRoom ?? item.rescheduledToRoom,
          previousRoom: ov.previousRoom ?? item.previousRoom,
          isEndedManually: ov.isEndedManually ?? item.isEndedManually,
          userNote: ov.userNote ?? item.userNote,
          isCustomModified: true,
        };
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startTime.localeCompare(b.startTime);
      });
  }, [rawItems, languageUrl, customLangMeta, overrides]);

  // Pre-group allItems by date once in useMemo for O(1) lookup during day rendering
  const itemsByDate = useMemo(() => {
    const map: Record<string, ScheduleItem[]> = {};
    for (const item of allItems) {
      if (!map[item.date]) {
        map[item.date] = [];
      }
      map[item.date].push(item);
    }
    return map;
  }, [allItems]);

  // Helper to check if a single class is already completed (odbyte) — memoized per minute, not per second!
  const isItemCompleted = useCallback(
    (item: ScheduleItem): boolean => {
      if (item.isEndedManually) return true;
      if (item.date < warsawClock.dateStr) return true;
      if (
        item.date === warsawClock.dateStr &&
        parseSeconds(item.endTime) <= warsawMinuteOfDay * 60
      ) {
        return true;
      }
      return false;
    },
    [warsawClock.dateStr, warsawMinuteOfDay]
  );

  // Build Zjazdy list dynamically from items (or use the 12 Zjazdy structure if all dates belong to it)
  const zjazdyGroups = useMemo(() => {
    const uniqueDates = Array.from(new Set(allItems.map((i) => i.date))).sort();
    const uek12DateSet = new Set(UEK_12_ZJAZDY.flatMap((z) => z.dates));
    const matchesDefault =
      uniqueDates.length > 0 && uniqueDates.every((d) => uek12DateSet.has(d));

    if (matchesDefault) {
      return UEK_12_ZJAZDY;
    }

    const clusters: Array<{
      id: string;
      labelTop: string;
      labelMonth: string;
      dates: string[];
    }> = [];

    for (const d of uniqueDates) {
      const last = clusters[clusters.length - 1];
      if (!last) {
        clusters.push({
          id: `dyn-1-${d}`,
          labelTop: '',
          labelMonth: '',
          dates: [d],
        });
      } else {
        const prevDt = new Date(`${last.dates[last.dates.length - 1]}T12:00:00`);
        const currDt = new Date(`${d}T12:00:00`);
        const diffDays = Math.round(
          (currDt.getTime() - prevDt.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays <= 4) {
          last.dates.push(d);
        } else {
          clusters.push({
            id: `dyn-${clusters.length + 1}-${d}`,
            labelTop: '',
            labelMonth: '',
            dates: [d],
          });
        }
      }
    }

    return clusters.map((c) => {
      const first = c.dates[0];
      const last = c.dates[c.dates.length - 1];
      const d1 = parseInt(first.split('-')[2], 10);
      const d2 = parseInt(last.split('-')[2], 10);
      const mIdx = parseInt(first.split('-')[1], 10) - 1;
      return {
        ...c,
        labelTop: d1 === d2 ? `${d1}` : `${d1}–${d2}`,
        labelMonth: POLISH_MONTHS_SHORT_UPPER[mIdx] || 'ZJAZD',
      };
    });
  }, [allItems]);

  // Automatically resolve the active or next upcoming Zjazd based on real-time Warsaw date & time
  const resolveBestZjazdId = useCallback(
    (
      groups: Array<{ id: string; dates: string[] }>,
      clock: WarsawClock,
      byDate: Record<string, ScheduleItem[]>
    ): string => {
      if (groups.length === 0) return 'z6';
      for (let i = 0; i < groups.length; i++) {
        const z = groups[i];
        const lastDate = z.dates[z.dates.length - 1];
        if (!lastDate) continue;
        if (lastDate > clock.dateStr) {
          return z.id;
        }
        if (lastDate === clock.dateStr) {
          const lastDayClasses = (byDate[lastDate] || []).filter(
            (item) => item.status !== 'cancelled' && !item.isEndedManually
          );
          const hasOngoingOrUpcomingToday =
            lastDayClasses.length === 0 ||
            lastDayClasses.some(
              (item) => parseSeconds(item.endTime) > clock.secondsOfDay
            );
          if (hasOngoingOrUpcomingToday) {
            return z.id;
          }
          // Last class of this Zjazd has already ended today -> advance to next Zjazd
          return groups[i + 1]?.id || z.id;
        }
      }
      return groups[groups.length - 1].id;
    },
    []
  );

  const userManuallyPickedZjazdRef = useRef<boolean>(false);
  const lastAutoZjazdDateRef = useRef<string>(warsawClock.dateStr);
  const zjazdyScrollRef = useRef<HTMLDivElement | null>(null);

  const [selectedZjazdId, setSelectedZjazdId] = useState<string>(() =>
    resolveBestZjazdId(zjazdyGroups, warsawClock, itemsByDate)
  );

  // Automatically select current/upcoming Zjazd on load, when schedule data updates, or when a new day starts
  useEffect(() => {
    if (zjazdyGroups.length === 0) return;

    const dateChanged = lastAutoZjazdDateRef.current !== warsawClock.dateStr;
    if (dateChanged) {
      lastAutoZjazdDateRef.current = warsawClock.dateStr;
      userManuallyPickedZjazdRef.current = false;
    }

    const currentValid = zjazdyGroups.some((z) => z.id === selectedZjazdId);
    if (!currentValid || !userManuallyPickedZjazdRef.current) {
      const bestId = resolveBestZjazdId(
        zjazdyGroups,
        warsawClock,
        itemsByDate
      );
      if (bestId && bestId !== selectedZjazdId) {
        setSelectedZjazdId(bestId);
      }
    }
  }, [
    zjazdyGroups,
    itemsByDate,
    warsawClock,
    selectedZjazdId,
    resolveBestZjazdId,
  ]);

  // Also re-align to the current/upcoming Zjazd when user returns to the app on their phone
  useEffect(() => {
    const onAppFocus = () => {
      if (document.visibilityState === 'visible') {
        const freshClock = getWarsawNow();
        setWarsawClock(freshClock);
        userManuallyPickedZjazdRef.current = false;
        const bestId = resolveBestZjazdId(
          zjazdyGroups,
          freshClock,
          itemsByDate
        );
        if (bestId) {
          setSelectedZjazdId(bestId);
        }
      }
    };
    document.addEventListener('visibilitychange', onAppFocus);
    return () => document.removeEventListener('visibilitychange', onAppFocus);
  }, [zjazdyGroups, itemsByDate, resolveBestZjazdId]);

  const activeZjazd = useMemo(() => {
    return (
      zjazdyGroups.find((z) => z.id === selectedZjazdId) || zjazdyGroups[0]
    );
  }, [zjazdyGroups, selectedZjazdId]);

  // Smoothly scroll the horizontal ZJAZDY strip so the active Zjazd pill is centered in view
  useEffect(() => {
    const container = zjazdyScrollRef.current;
    if (!container || !activeZjazd?.id) return;
    const activeBtn = container.querySelector<HTMLElement>(
      `[data-zjazd-id="${activeZjazd.id}"]`
    );
    if (!activeBtn) return;
    const targetLeft =
      activeBtn.offsetLeft -
      container.clientWidth / 2 +
      activeBtn.offsetWidth / 2;
    container.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: 'smooth',
    });
  }, [activeZjazd?.id]);

  // Type & Status Filter ('all' | 'Ćwiczenia' | 'Lektorat' | 'Wykład' | 'odbyte' | 'rescheduled' | 'cancelled')
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  // Explicit user collapse overrides per dateStr (if undefined, completed days auto-collapse!)
  const [userCollapsedOverrides, setUserCollapsedOverrides] = useState<
    Record<string, boolean>
  >({});

  // Modals state
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isColorsModalOpen, setIsColorsModalOpen] = useState<boolean>(false);
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_SEEN_VERSION_KEY) !== CURRENT_APP_VERSION;
    } catch {
      return false;
    }
  });

  const handleDismissWhatsNew = useCallback(() => {
    setIsWhatsNewOpen(false);
    try {
      localStorage.setItem(STORAGE_SEEN_VERSION_KEY, CURRENT_APP_VERSION);
    } catch {
      // ignore
    }
  }, []);
  const [inspectedItem, setInspectedItem] = useState<ScheduleItem | null>(null);
  const [campusMapRoom, setCampusMapRoom] = useState<{
    room: string;
    subject: string;
  } | null>(null);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState<boolean>(false);

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () =>
      window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  // Determine the live/current class in real time using Warsaw clock
  const heroActiveClass = useMemo(() => {
    const { dateStr, secondsOfDay } = warsawClock;

    // 1. Check if there is a class actively running right now in Europe/Warsaw time
    const liveToday = allItems.find((item) => {
      if (item.status === 'cancelled' || item.isEndedManually) return false;
      if (item.date !== dateStr) return false;
      const startSec = parseSeconds(item.startTime);
      const endSec = parseSeconds(item.endTime);
      return secondsOfDay >= startSec && secondsOfDay < endSec;
    });

    if (liveToday) {
      const startSec = parseSeconds(liveToday.startTime);
      const endSec = parseSeconds(liveToday.endTime);
      const totalDurationSec = Math.max(60, endSec - startSec);
      const elapsedSec = Math.max(0, secondsOfDay - startSec);
      const remainingSec = Math.max(0, endSec - secondsOfDay);
      const remainingMins = Math.max(1, Math.ceil(remainingSec / 60));
      const rawPercent = Math.min(
        100,
        Math.max(2, (elapsedSec / totalDurationSec) * 100)
      );
      const progressPercent = Number(rawPercent.toFixed(2));

      return {
        item: liveToday,
        isLiveNow: true,
        remainingMins,
        progressPercent,
      };
    }

    // 2. Otherwise find the next upcoming class today or in the future
    const nextUpcoming = allItems.find((item) => {
      if (item.status === 'cancelled' || item.isEndedManually) return false;
      if (item.date > dateStr) return true;
      if (item.date === dateStr) {
        return parseSeconds(item.startTime) > secondsOfDay;
      }
      return false;
    });

    if (nextUpcoming) {
      return {
        item: nextUpcoming,
        isLiveNow: false,
        remainingMins: 0,
        progressPercent: 0,
      };
    }

    return null;
  }, [allItems, warsawClock]);

  // Compute overall schedule statistics matching "Postęp planu" card (32%, 19 z 59 zajęć odbyto, 12 zjazdów, 59 zajęć, 195 godz. dyd., 8 przeniesione)
  const stats = useMemo(() => {
    const totalZjazdy = zjazdyGroups.length;
    const totalClasses = allItems.length;
    const totalDydacticHours = allItems.reduce(
      (sum, item) => sum + (item.dydacticHours || 3),
      0
    );
    const rescheduledCount = allItems.filter(
      (i) => i.status === 'rescheduled'
    ).length;
    const cancelledCount = allItems.filter(
      (i) => i.status === 'cancelled'
    ).length;

    const completedClasses = allItems.filter((i) => isItemCompleted(i)).length;

    const percent =
      totalClasses > 0
        ? Math.round((completedClasses / totalClasses) * 100)
        : 0;

    return {
      totalZjazdy,
      totalClasses,
      totalDydacticHours,
      rescheduledCount,
      cancelledCount,
      completedClasses,
      percent,
    };
  }, [allItems, zjazdyGroups, isItemCompleted]);

  // Toggle "Oznacz jako odwołane" directly from a class row
  const handleToggleCancelled = (
    e: React.MouseEvent,
    item: ScheduleItem
  ) => {
    e.stopPropagation();
    const isCurrentlyCancelled = item.status === 'cancelled';
    setOverrides((prev) => ({
      ...prev,
      [item.id]: {
        ...prev[item.id],
        status: isCurrentlyCancelled ? 'scheduled' : 'cancelled',
        statusReason: isCurrentlyCancelled
          ? undefined
          : 'Zajęcia oznaczone jako odwołane',
      },
    }));
  };

  // Handle "Zakończ zajęcia" on the live active class
  const handleEndClassManually = (
    e: React.MouseEvent,
    item: ScheduleItem
  ) => {
    e.stopPropagation();
    setOverrides((prev) => ({
      ...prev,
      [item.id]: {
        ...prev[item.id],
        status: item.status,
        isEndedManually: true,
      },
    }));
  };

  // Restore accidentally ended class ("Przywróć do trwających" / "Cofnij zakończenie")
  const handleRestoreEndedClass = (
    e: React.MouseEvent,
    item: ScheduleItem
  ) => {
    e.stopPropagation();
    setOverrides((prev) => {
      const existing = prev[item.id];
      if (!existing) return prev;
      const next = { ...prev };
      const updated = { ...existing, isEndedManually: false };
      if (
        updated.status === 'scheduled' &&
        !updated.statusReason &&
        !updated.userNote &&
        !updated.rescheduledToRoom
      ) {
        delete next[item.id];
      } else {
        next[item.id] = updated;
      }
      return next;
    });
  };

  const handleSaveOverride = (
    itemId: string,
    override: CustomStatusOverride
  ) => {
    setOverrides((prev) => ({
      ...prev,
      [itemId]: override,
    }));
  };

  const handleClearOverride = (itemId: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const zjazdDates = useMemo(
    () => (activeZjazd ? activeZjazd.dates : []),
    [activeZjazd]
  );

  // Items belonging to the currently selected Zjazd
  const currentZjazdItems = useMemo(
    () => allItems.filter((i) => zjazdDates.includes(i.date)),
    [allItems, zjazdDates]
  );

  const hasWykładInZjazd = useMemo(
    () =>
      currentZjazdItems.some(
        (i) => getDisplayCategoryLabel(i.normalizedType) === 'Wykład'
      ),
    [currentZjazdItems]
  );

  const hasOdbyteInZjazd = useMemo(
    () => currentZjazdItems.some((i) => isItemCompleted(i)),
    [currentZjazdItems, isItemCompleted]
  );

  const matchesFilter = (item: ScheduleItem): boolean => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'odbyte') return isItemCompleted(item);
    if (selectedFilter === 'cancelled') return item.status === 'cancelled';
    if (selectedFilter === 'rescheduled')
      return item.status === 'rescheduled';
    return getDisplayCategoryLabel(item.normalizedType) === selectedFilter;
  };

  // Category color helpers memoized so zero hex-mixing runs inside the scroll render loop
  const cwiczeniaHex = customColors.cwiczeniaColor || '#A855F7';
  const lektoratHex = customColors.lektoratColor || '#D97706';
  const wykladHex = customColors.wykladColor || '#0EA5E9';

  const categoryColorCache = useMemo(() => {
    const buildEntry = (baseHex: string, completed: boolean) => {
      if (isDark) {
        return {
          barColor: completed ? '#525866' : baseHex,
          badgeBg: completed ? `${baseHex}22` : `${baseHex}30`,
          badgeBorder: completed ? 'transparent' : `${baseHex}58`,
          badgeText: mixHexColors(baseHex, '#FFFFFF', completed ? 0.35 : 0.45),
        };
      }
      return {
        barColor: completed ? '#CBD5E1' : baseHex,
        badgeBg: mixHexColors(baseHex, '#FFFFFF', 0.84),
        badgeBorder: completed ? 'transparent' : `${baseHex}35`,
        badgeText: mixHexColors(baseHex, '#0F172A', 0.35),
      };
    };

    return {
      cancelled: isDark
        ? {
            barColor: '#EF4444',
            badgeBg: 'rgba(239, 68, 68, 0.18)',
            badgeBorder: 'rgba(239, 68, 68, 0.45)',
            badgeText: '#FCA5A5',
          }
        : {
            barColor: '#EF4444',
            badgeBg: '#FEE2E2',
            badgeBorder: '#FECACA',
            badgeText: '#B91C1C',
          },
      cwiczeniaActive: buildEntry(cwiczeniaHex, false),
      cwiczeniaDone: buildEntry(cwiczeniaHex, true),
      lektoratActive: buildEntry(lektoratHex, false),
      lektoratDone: buildEntry(lektoratHex, true),
      wykladActive: buildEntry(wykladHex, false),
      wykladDone: buildEntry(wykladHex, true),
    };
  }, [isDark, cwiczeniaHex, lektoratHex, wykladHex]);

  const getCategoryColors = (item: ScheduleItem, completed: boolean) => {
    if (item.status === 'cancelled') return categoryColorCache.cancelled;
    const cat = getDisplayCategoryLabel(item.normalizedType);
    if (cat === 'Ćwiczenia') {
      return completed
        ? categoryColorCache.cwiczeniaDone
        : categoryColorCache.cwiczeniaActive;
    }
    if (cat === 'Lektorat') {
      return completed
        ? categoryColorCache.lektoratDone
        : categoryColorCache.lektoratActive;
    }
    return completed
      ? categoryColorCache.wykladDone
      : categoryColorCache.wykladActive;
  };

  // SVG circular gauge math for "Postęp planu"
  const circleRadius = 26;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset =
    circleCircumference - (stats.percent / 100) * circleCircumference;

  // Harmonized card & surface colors derived from customColors (memoized)
  const { adaptiveCardBg, adaptiveBreakBg, adaptiveRescheduledText } =
    useMemo(() => {
      return {
        adaptiveCardBg: isDark
          ? `${mixHexColors(customColors.darkBgColor, '#1D2230', 0.46)}F5`
          : `${mixHexColors('#FFFFFF', customColors.lightBgColor, 0.28)}FA`,
        adaptiveBreakBg: isDark
          ? `${mixHexColors(
              customColors.darkBgColor,
              customColors.accentColor,
              0.08
            )}95`
          : mixHexColors(customColors.lightBgColor, '#FFFFFF', 0.45),
        adaptiveRescheduledText: isDark
          ? customColors.rescheduledColor
          : mixHexColors(customColors.rescheduledColor, '#0F172A', 0.28),
      };
    }, [
      isDark,
      customColors.darkBgColor,
      customColors.lightBgColor,
      customColors.accentColor,
      customColors.rescheduledColor,
    ]);

  const cardRadiusClass =
    layoutPrefs.cardStyle === 'sharp_pro' ? 'rounded-[16px]' : 'rounded-[26px]';
  const rowDensityClass =
    layoutPrefs.density === 'compact'
      ? 'py-2.5 px-3.5 sm:py-3 sm:px-4'
      : layoutPrefs.density === 'spacious'
      ? 'p-5 sm:p-6'
      : 'p-4 sm:p-5';
  const fontFamilyStyle =
    layoutPrefs.fontFamily === 'mono'
      ? "'JetBrains Mono', monospace"
      : layoutPrefs.fontFamily === 'sf_system'
      ? "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif"
      : "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

  return (
    <div
      style={{
        backgroundColor: isDark
          ? customColors.darkBgColor
          : customColors.lightBgColor,
        fontFamily: fontFamilyStyle,
      }}
      className={`min-h-screen transition-colors duration-300 relative overflow-x-hidden ${
        isDark ? 'text-[#F5F5F7]' : 'text-[#1D1D1F]'
      }`}
    >
      {/* Subtle Ambient Background Gradients (Pure radial-gradient without GPU-blocking filter:blur) */}
      {layoutPrefs.showAmbientOrbs &&
        layoutPrefs.cardStyle !== 'matte_minimal' && (
          <div
            aria-hidden="true"
            className="fixed inset-0 pointer-events-none overflow-hidden z-0"
          >
            <div
              style={{
                background: isDark
                  ? `radial-gradient(circle, ${customColors.accentColor}30 0%, transparent 68%)`
                  : `radial-gradient(circle, ${customColors.accentColor}20 0%, rgba(190, 220, 255, 0.35) 45%, transparent 70%)`,
              }}
              className="ambient-orb-1 absolute -top-36 left-[5%] w-[520px] h-[520px] rounded-full opacity-80"
            />
            <div
              style={{
                background: isDark
                  ? `radial-gradient(circle, ${customColors.rescheduledColor}1E 0%, ${customColors.accentColor}16 50%, transparent 70%)`
                  : 'radial-gradient(circle, rgba(255, 204, 180, 0.38) 0%, rgba(220, 212, 255, 0.3) 50%, transparent 70%)',
              }}
              className="ambient-orb-2 absolute top-[18%] -right-28 w-[480px] h-[480px] rounded-full opacity-75"
            />
            <div
              style={{
                background: isDark
                  ? `radial-gradient(circle, #10B98118 0%, ${customColors.accentColor}1A 55%, transparent 70%)`
                  : 'radial-gradient(circle, rgba(167, 243, 208, 0.32) 0%, rgba(191, 219, 254, 0.35) 55%, transparent 70%)',
              }}
              className="ambient-orb-3 absolute -bottom-32 left-[20%] w-[500px] h-[500px] rounded-full opacity-70"
            />
          </div>
        )}

      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <div className="relative z-10 max-w-[760px] mx-auto px-3.5 sm:px-4 py-4 sm:py-7 space-y-4 sm:space-y-5">
        {/* 1. Sticky Floating Rounded Glass Header Bar */}
        <header
          style={{ backgroundColor: adaptiveCardBg }}
          className={`relative sticky top-2.5 sm:top-3 z-40 ${cardRadiusClass} px-3.5 sm:px-5 py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 border backdrop-blur-xl transition-colors ${
            isDark
              ? 'border-white/10 shadow-xl'
              : 'border-white/95 shadow-[0_8px_30px_rgba(15,23,42,0.08)]'
          }`}
        >
          {/* Top Row on Mobile / Left Section on Desktop */}
          <div className="min-w-0 flex-1 flex items-center justify-between sm:justify-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                {layoutPrefs.headerBadgeIcon && (
                  <span className="text-base sm:text-xl shrink-0">
                    {layoutPrefs.headerBadgeIcon}
                  </span>
                )}
                <h1 className="text-base sm:text-xl font-bold tracking-tight truncate">
                  {layoutPrefs.customHeaderTitle.trim() || 'Plan zajęć'}
                </h1>

                {/* Mini Status Dot (Green = OK, Yellow = Syncing/Offline, Red = Error/No Auth) */}
                <button
                  type="button"
                  onClick={() => setIsSyncPopoverOpen((v) => !v)}
                  aria-label="Status automatycznej aktualizacji planu"
                  title={syncDetailMessage}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold border transition-all shrink-0 cursor-pointer ${
                    syncState === 'ok'
                      ? isDark
                        ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300 hover:bg-emerald-500/25'
                        : 'bg-emerald-50 border-emerald-400/50 text-emerald-800 hover:bg-emerald-100'
                      : syncState === 'syncing' || syncState === 'offline'
                      ? isDark
                        ? 'bg-amber-500/15 border-amber-400/35 text-amber-300 hover:bg-amber-500/25'
                        : 'bg-amber-50 border-amber-400/50 text-amber-800 hover:bg-amber-100'
                      : isDark
                      ? 'bg-rose-500/15 border-rose-400/40 text-rose-300 hover:bg-rose-500/25'
                      : 'bg-rose-50 border-rose-400/50 text-rose-800 hover:bg-rose-100'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      syncState === 'ok'
                        ? 'bg-emerald-400 shadow-[0_0_8px_#34D399]'
                        : syncState === 'syncing'
                        ? 'bg-amber-400 animate-pulse shadow-[0_0_8px_#FBBF24]'
                        : syncState === 'offline'
                        ? 'bg-amber-400 shadow-[0_0_8px_#FBBF24]'
                        : 'bg-rose-500 shadow-[0_0_8px_#F43F5E]'
                    }`}
                  />
                  <span>
                    {syncState === 'ok'
                      ? 'Auto-sync'
                      : syncState === 'syncing'
                      ? 'Pobieranie...'
                      : syncState === 'offline'
                      ? 'Offline'
                      : 'Błąd sync'}
                  </span>
                </button>
              </div>
              <p
                className={`text-[11px] sm:text-xs mt-0.5 truncate ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                {layoutPrefs.customHeaderSubtitle.trim() ||
                  metadata.groupFullName ||
                  `UEK Kraków · niestacjonarne · grupa ${metadata.entityId}`}
              </p>
            </div>
          </div>

          {/* Bottom Row on Mobile / Right Action Bar on Desktop */}
          <div
            className={`flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 shrink-0 ${
              isDark ? 'border-white/8' : 'border-slate-200/70'
            }`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Install as Mobile App (PWA) button */}
              <PWAInstallButton
                isDark={isDark}
                accentColor={customColors.accentColor}
              />

              {/* What's New / Changelog button */}
              <button
                type="button"
                onClick={() => setIsWhatsNewOpen(true)}
                aria-label="Co nowego w aplikacji"
                title="Co nowego w aktualizacji"
                className={`w-9 h-9 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center border transition-colors shrink-0 ${
                  isDark
                    ? 'bg-white/6 hover:bg-white/12 border-white/12 text-sky-300'
                    : 'bg-white/90 hover:bg-white border-slate-200/90 shadow-xs text-sky-600'
                }`}
              >
                <Sparkles className="w-4 h-4" />
              </button>

              {/* Palette button -> opens "Studio Personalizacji Planu" */}
              <button
                type="button"
                onClick={() => setIsColorsModalOpen(true)}
                aria-label="Personalizacja planu"
                title="Personalizacja kolorów i układu"
                className={`w-9 h-9 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center border transition-colors shrink-0 ${
                  isDark
                    ? 'bg-white/6 hover:bg-white/12 border-white/12 text-amber-300'
                    : 'bg-white/90 hover:bg-white border-slate-200/90 shadow-xs text-amber-600'
                }`}
              >
                <Palette className="w-4 h-4" />
              </button>

              {/* Theme toggle button (Dark / Light) */}
              <button
                type="button"
                onClick={() => setIsDark(!isDark)}
                aria-label="Przełącz motyw jasny/ciemny"
                title={
                  isDark ? 'Przełącz na jasny motyw' : 'Przełącz na ciemny motyw'
                }
                className={`w-9 h-9 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center border transition-colors shrink-0 ${
                  isDark
                    ? 'bg-white/6 hover:bg-white/12 border-white/12 text-slate-200'
                    : 'bg-white/90 hover:bg-white border-slate-200/90 shadow-xs text-slate-700'
                }`}
              >
                {isDark ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Primary CTA: Import z UEK */}
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              style={{
                background: `linear-gradient(180deg, ${mixHexColors(
                  customColors.accentColor,
                  '#FFFFFF',
                  0.08
                )} 0%, ${customColors.accentColor} 100%)`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 12px ${customColors.accentColor}40`,
              }}
              className="px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-semibold text-white hover:opacity-95 transition-opacity whitespace-nowrap shrink-0"
            >
              Import z UEK
            </button>
          </div>

          {/* Floating Apple Popover explaining the Green / Yellow / Red dot */}
          {isSyncPopoverOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsSyncPopoverOpen(false)}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute left-0 right-0 sm:left-4 sm:right-auto sm:w-[360px] top-[calc(100%+8px)] p-4 rounded-[22px] border shadow-2xl text-xs z-50 backdrop-blur-2xl whitespace-normal ${
                  isDark
                    ? 'bg-[#141821]/98 border-white/15 text-slate-200 shadow-[0_20px_50px_rgba(0,0,0,0.65)]'
                    : 'bg-white/98 border-slate-200/90 text-slate-800 shadow-[0_20px_50px_rgba(15,23,42,0.18)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2 font-bold text-[13px]">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        syncState === 'ok'
                          ? 'bg-emerald-400 shadow-[0_0_8px_#34D399]'
                          : syncState === 'syncing' || syncState === 'offline'
                          ? 'bg-amber-400 shadow-[0_0_8px_#FBBF24]'
                          : 'bg-rose-500 shadow-[0_0_8px_#F43F5E]'
                      }`}
                    />
                    <span>
                      {syncState === 'ok'
                        ? 'Zielony: Plan aktualizuje się automatycznie'
                        : syncState === 'syncing'
                        ? 'Żółty: Trwa pobieranie planu z UEK...'
                        : syncState === 'offline'
                        ? 'Żółty: Tryb offline (brak internetu)'
                        : 'Czerwony: Pobieranie nieudane / brak CAS'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSyncPopoverOpen(false)}
                    className="w-6 h-6 rounded-full flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-white/10 shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p
                  className={`mt-2 text-[11.5px] leading-relaxed ${
                    isDark ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  {syncDetailMessage} (ostatnie sprawdzenie:{' '}
                  <strong>{lastSyncTimeStr}</strong>).
                </p>

                <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      fetchSchedule(scheduleUrl);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold inline-flex items-center gap-1.5 border transition-colors ${
                      isDark
                        ? 'bg-white/10 hover:bg-white/15 border-white/15 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
                    }`}
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${
                        syncState === 'syncing' ? 'animate-spin' : ''
                      }`}
                    />
                    <span>Odśwież teraz</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSyncPopoverOpen(false);
                      setIsImportModalOpen(true);
                    }}
                    style={{ backgroundColor: customColors.accentColor }}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-semibold text-white hover:opacity-95"
                  >
                    Ustawienia CAS
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSyncPopoverOpen(false);
                      localStorage.setItem(STORAGE_ONBOARDED_KEY, 'false');
                      setIsPlanConfigured(false);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-colors ${
                      isDark
                        ? 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                    title="Pokaż ekran powitalny wyboru własnego planu"
                  >
                    Zmień plan
                  </button>
                </div>
              </div>
            </>
          )}
        </header>

        {!isPlanConfigured ? (
          /* Welcome / Onboarding Screen for New Users */
          <section
            style={{ backgroundColor: adaptiveCardBg }}
            className={`${cardRadiusClass} p-5 sm:p-8 border backdrop-blur-2xl transition-colors relative overflow-hidden ${
              isDark
                ? 'border-white/12 shadow-2xl'
                : 'border-white shadow-[0_12px_40px_rgba(15,23,42,0.08)]'
            }`}
          >
            <div
              style={{
                background: `radial-gradient(circle, ${customColors.accentColor}28 0%, transparent 70%)`,
              }}
              className="w-72 h-72 rounded-full absolute -top-24 -right-20 pointer-events-none"
            />

            <div className="relative z-10 max-w-xl mx-auto">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border mb-3.5 bg-sky-500/12 border-sky-400/30 text-sky-400">
                <span>🎓</span>
                <span>Witaj w aplikacji Plan UEK</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Dodaj link do własnego planu zajęć
              </h2>
              <p
                className={`mt-2 text-xs sm:text-sm leading-relaxed ${
                  isDark ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                Zamiast wyświetlać cudzy plan zajęć, wklej poniżej link do swojej
                grupy ze strony{' '}
                <strong className="font-semibold">
                  planzajec.uek.krakow.pl
                </strong>
                . Aplikacja ułoży Twój harmonogram w zjazdy, policzy postęp
                semestru i będzie automatycznie sprawdzać zmiany w tle.
              </p>

              {/* Step-by-step mini guide */}
              <div
                className={`mt-5 p-4 rounded-2xl border space-y-2.5 text-xs ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10 text-slate-300'
                    : 'bg-slate-50/90 border-slate-200/80 text-slate-700'
                }`}
              >
                <p className="font-bold text-[11px] uppercase tracking-wider opacity-75">
                  Jak skopiować swój link w 30 sekund:
                </p>
                <div className="flex items-start gap-2.5">
                  <span
                    style={{ backgroundColor: customColors.accentColor }}
                    className="w-5 h-5 rounded-full text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5"
                  >
                    1
                  </span>
                  <span>
                    Wejdź na{' '}
                    <a
                      href="https://planzajec.uek.krakow.pl"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: customColors.accentColor }}
                      className="font-bold underline"
                    >
                      planzajec.uek.krakow.pl
                    </a>{' '}
                    i wybierz swoją grupę dziekańską oraz pełny semestr.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span
                    style={{ backgroundColor: customColors.accentColor }}
                    className="w-5 h-5 rounded-full text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5"
                  >
                    2
                  </span>
                  <span>
                    Skopiuj link z paska adresu przeglądarki (np.{' '}
                    <code className="px-1.5 py-0.5 rounded bg-black/20 font-mono text-[10px]">
                      https://planzajec.uek.krakow.pl/index.php?typ=G&amp;id=...&amp;okres=3
                    </code>
                    ).
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span
                    style={{ backgroundColor: customColors.accentColor }}
                    className="w-5 h-5 rounded-full text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5"
                  >
                    3
                  </span>
                  <span>
                    Wklej go poniżej i (opcjonalnie) wpisz login i hasło CAS UEK,
                    aby plan aktualizował się automatycznie w tle.
                  </span>
                </div>
              </div>

              <form onSubmit={handleWelcomeSubmit} className="mt-5 space-y-3.5">
                <div>
                  <label className="block text-xs font-bold mb-1.5">
                    1. Link do Twojej grupy dziekańskiej UEK (wymagany)
                  </label>
                  <input
                    type="text"
                    value={welcomeGroupUrl}
                    onChange={(e) => setWelcomeGroupUrl(e.target.value)}
                    placeholder="https://planzajec.uek.krakow.pl/index.php?typ=G&id=...&okres=3"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-mono focus:outline-none transition-colors ${
                      isDark
                        ? 'bg-black/30 border-white/15 text-white placeholder:text-slate-500 focus:border-sky-400'
                        : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-sky-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1.5">
                    2. Link do grupy językowej / lektoratu (opcjonalnie)
                  </label>
                  <input
                    type="text"
                    value={welcomeLangUrl}
                    onChange={(e) => setWelcomeLangUrl(e.target.value)}
                    placeholder="https://planzajec.uek.krakow.pl/index.php?typ=G&id=...&okres=3"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-mono focus:outline-none transition-colors ${
                      isDark
                        ? 'bg-black/30 border-white/15 text-white placeholder:text-slate-500 focus:border-sky-400'
                        : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-sky-500'
                    }`}
                  />
                </div>

                <div
                  className={`p-3.5 rounded-2xl border space-y-2.5 ${
                    isDark
                      ? 'bg-white/[0.03] border-white/10'
                      : 'bg-slate-50/80 border-slate-200/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">
                      3. Logowanie CAS UEK (do auto-aktualizacji w tle)
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      Zalecane
                    </span>
                  </div>
                  <p
                    className={`text-[11px] leading-relaxed ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Wpisz jednorazowo swój login i hasło CAS, aby aplikacja sama
                    pobierała z uczelni przeniesione i odwołane zajęcia bez
                    ponownego pytania o hasło.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={welcomeUsername}
                      onChange={(e) => setWelcomeUsername(e.target.value)}
                      placeholder="Login / nr albumu (np. s234567)"
                      autoComplete="username"
                      className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none ${
                        isDark
                          ? 'bg-black/30 border-white/15 text-white placeholder:text-slate-500'
                          : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                      }`}
                    />
                    <input
                      type="password"
                      value={welcomePassword}
                      onChange={(e) => setWelcomePassword(e.target.value)}
                      placeholder="Hasło CAS UEK"
                      autoComplete="current-password"
                      className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none ${
                        isDark
                          ? 'bg-black/30 border-white/15 text-white placeholder:text-slate-500'
                          : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                      }`}
                    />
                  </div>
                </div>

                {welcomeError && (
                  <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 text-xs font-medium">
                    {welcomeError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={welcomeLoading}
                  style={{
                    background: `linear-gradient(180deg, ${mixHexColors(
                      customColors.accentColor,
                      '#FFFFFF',
                      0.1
                    )} 0%, ${customColors.accentColor} 100%)`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28), 0 8px 20px -4px ${customColors.accentColor}55`,
                  }}
                  className="w-full py-3 px-5 rounded-2xl font-bold text-sm text-white hover:opacity-95 transition-opacity flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {welcomeLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Wczytywanie Twojego planu z UEK...</span>
                    </>
                  ) : (
                    <span>Wczytaj mój plan zajęć →</span>
                  )}
                </button>
              </form>

              <div className="mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className={`w-full sm:w-auto py-2 px-3.5 rounded-xl font-semibold border transition-colors ${
                    isDark
                      ? 'bg-white/6 hover:bg-white/12 border-white/12 text-slate-200'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  }`}
                >
                  Inne metody importu (Schowek / XML / .ics)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem(STORAGE_ONBOARDED_KEY, 'true');
                    setIsPlanConfigured(true);
                    fetchSchedule(scheduleUrl);
                  }}
                  className={`w-full sm:w-auto py-2 px-3.5 rounded-xl font-medium transition-colors ${
                    isDark
                      ? 'text-slate-400 hover:text-white'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Zobacz przykładowy plan (Demo)
                </button>
              </div>
            </div>
          </section>
        ) : (
          <>
        {/* Custom Countdown Banner (if configured by the user in Studio Personalizacji) */}
        {(layoutPrefs.countdownLabel || layoutPrefs.countdownDate) && (
          <div
            onClick={() => setIsColorsModalOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsColorsModalOpen(true);
              }
            }}
            style={{
              backgroundColor: adaptiveCardBg,
              borderColor: `${customColors.accentColor}40`,
            }}
            className={`px-4 py-2.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer backdrop-blur-xl transition-all hover:opacity-95`}
            title="Kliknij, aby edytować odliczanie w Studio Personalizacji"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                style={{
                  backgroundColor: `${customColors.accentColor}22`,
                  color: customColors.accentColor,
                }}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0"
              >
                Odliczanie
              </span>
              <span className="text-xs sm:text-sm font-bold truncate">
                {layoutPrefs.countdownLabel || 'Ważny termin'}
              </span>
            </div>
            {layoutPrefs.countdownDate && (
              <span
                style={{ color: customColors.accentColor }}
                className="text-xs sm:text-sm font-bold tabular-nums shrink-0"
              >
                {getCountdownDiffLabel(
                  layoutPrefs.countdownDate,
                  warsawClock.dateStr
                )}
              </span>
            )}
          </div>
        )}

        {/* 2. Hero Live Class Card ("TRWA TERAZ · DO 18:15") */}
        {layoutPrefs.showHeroCard && heroActiveClass && (
          <section
            onClick={() => setInspectedItem(heroActiveClass.item)}
            style={{
              background: `linear-gradient(135deg, ${
                customColors.accentColor
              } 0%, ${mixHexColors(
                customColors.accentColor,
                '#060D20',
                0.38
              )} 60%, ${mixHexColors(
                customColors.accentColor,
                '#030610',
                0.62
              )} 100%)`,
              boxShadow: `inset 0 1.5px 2px rgba(255,255,255,0.4), 0 16px 36px -8px ${customColors.accentColor}55`,
            }}
            className={`${cardRadiusClass} p-6 border border-white/25 relative overflow-hidden cursor-pointer text-white`}
          >
            {/* Subtle Apple Liquid Glass circular orb on the right */}
            <div className="w-64 h-64 rounded-full bg-white/14 absolute -right-12 -bottom-16 pointer-events-none" />

            <div className="relative z-10">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/90 tabular-nums">
                <span className="w-2 h-2 rounded-full bg-white inline-block" />
                <span>
                  {heroActiveClass.isLiveNow
                    ? `TRWA TERAZ · DO ${heroActiveClass.item.endTime}`
                    : `NAJBLIŻSZE ZAJĘCIA · ${heroActiveClass.item.startTime}–${heroActiveClass.item.endTime}`}
                </span>
              </div>

              <h2 className="text-2xl sm:text-[28px] font-bold tracking-tight mt-1.5 text-white">
                {heroActiveClass.item.subject}
              </h2>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium">
                <span className="px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur-md border border-white/25">
                  {formatDayAndMonthGenitive(heroActiveClass.item.date)}
                </span>
                <span className="px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur-md border border-white/25 tabular-nums">
                  {heroActiveClass.item.startTime}–{heroActiveClass.item.endTime}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!heroActiveClass.item.isOnlineLocation) {
                      setCampusMapRoom({
                        room: heroActiveClass.item.room,
                        subject: heroActiveClass.item.subject,
                      });
                    }
                  }}
                  title="Kliknij, aby zobaczyć pawilon i piętro na mapie kampusu UEK"
                  className="px-3.5 py-1.5 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/25 inline-flex items-center gap-1.5 transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>{heroActiveClass.item.room}</span>
                </button>
                {layoutPrefs.showLecturers && heroActiveClass.item.lecturer && (
                  <span className="px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur-md border border-white/25">
                    {heroActiveClass.item.lecturer}
                  </span>
                )}
              </div>

              {heroActiveClass.isLiveNow && (
                <div className="mt-4 pt-3 border-t border-white/15">
                  {(layoutPrefs.liveProgressStyle || 'line') === 'line' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-white/85 tabular-nums">
                        <span>
                          Postęp zajęć ({heroActiveClass.progressPercent.toFixed(2)}%)
                        </span>
                        <span>jeszcze {heroActiveClass.remainingMins} min</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
                        <div
                          style={{ width: `${heroActiveClass.progressPercent}%` }}
                          className="h-full rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-all duration-1000"
                        />
                      </div>
                    </div>
                  )}

                  {layoutPrefs.liveProgressStyle === 'dots' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-white/85 tabular-nums">
                        <span>
                          Etap{' '}
                          {Math.min(
                            12,
                            Math.max(
                              1,
                              Math.ceil((heroActiveClass.progressPercent / 100) * 12)
                            )
                          )}
                          /12 ({heroActiveClass.progressPercent.toFixed(2)}%)
                        </span>
                        <span>jeszcze {heroActiveClass.remainingMins} min</span>
                      </div>
                      <div className="grid grid-cols-12 gap-1.5 items-center">
                        {Array.from({ length: 12 }).map((_, dotIdx) => {
                          const activeIndex = Math.min(
                            11,
                            Math.floor((heroActiveClass.progressPercent / 100) * 12)
                          );
                          const isDone = dotIdx < activeIndex;
                          const isCurrent = dotIdx === activeIndex;
                          return (
                            <span
                              key={dotIdx}
                              className={`h-2 rounded-full transition-all duration-500 ${
                                isCurrent
                                  ? 'bg-white scale-y-125 shadow-[0_0_10px_rgba(255,255,255,0.95)]'
                                  : isDone
                                  ? 'bg-white/90'
                                  : 'bg-white/25'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {layoutPrefs.liveProgressStyle === 'timeline_orb' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-white/85 tabular-nums">
                        <span>Oś czasu zajęć</span>
                        <span>jeszcze {heroActiveClass.remainingMins} min</span>
                      </div>
                      <div className="flex items-center gap-2.5 pt-0.5">
                        <span className="text-[10px] font-bold text-white/80 tabular-nums shrink-0">
                          {heroActiveClass.item.startTime}
                        </span>
                        <div className="relative flex-1 h-1.5 rounded-full bg-white/25">
                          <div
                            style={{ width: `${heroActiveClass.progressPercent}%` }}
                            className="h-full rounded-full bg-white transition-all duration-1000"
                          />
                          <span
                            style={{
                              left: `${Math.min(
                                92,
                                Math.max(8, heroActiveClass.progressPercent)
                              )}%`,
                              color: customColors.accentColor,
                            }}
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-white text-[9px] font-extrabold leading-none tabular-nums shadow-sm whitespace-nowrap"
                          >
                            {heroActiveClass.progressPercent.toFixed(2)}%
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-white/80 tabular-nums shrink-0">
                          {heroActiveClass.item.endTime}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* 3. "Postęp planu" Card (Circular Gauge + 4-Column Stats) */}
        {layoutPrefs.showProgressCard && (
          <section
            style={{ backgroundColor: adaptiveCardBg }}
            className={`${cardRadiusClass} p-5 sm:p-6 border transition-colors ${
              isDark
                ? 'border-white/10 shadow-xl'
                : 'border-white shadow-[0_8px_30px_rgba(15,23,42,0.05)]'
            }`}
          >
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle
                  cx="32"
                  cy="32"
                  r={circleRadius}
                  fill="none"
                  stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}
                  strokeWidth="5.5"
                />
                <circle
                  cx="32"
                  cy="32"
                  r={circleRadius}
                  fill="none"
                  stroke="#2ECC71"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  strokeDasharray={circleCircumference}
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <span className="absolute text-xs font-bold tabular-nums">
                {stats.percent}%
              </span>
            </div>

            <div>
              <h2 className="text-base font-bold tracking-tight">
                Postęp planu
              </h2>
              <p
                className={`text-xs mt-0.5 tabular-nums ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                {stats.completedClasses} z {stats.totalClasses} zajęć odbyto
              </p>
            </div>
          </div>

          <div
            className={`mt-5 pt-4 border-t grid grid-cols-4 divide-x text-center tabular-nums ${
              isDark
                ? 'border-white/8 divide-white/8'
                : 'border-slate-200/80 divide-slate-200/80'
            }`}
          >
            <div className="px-2">
              <p
                style={{ color: customColors.accentColor }}
                className="text-xl sm:text-2xl font-bold"
              >
                {stats.totalZjazdy}
              </p>
              <p
                className={`text-[11px] mt-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                zjazdów
              </p>
            </div>

            <div className="px-2">
              <p
                style={{ color: customColors.accentColor }}
                className="text-xl sm:text-2xl font-bold"
              >
                {stats.totalClasses}
              </p>
              <p
                className={`text-[11px] mt-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                zajęć
              </p>
            </div>

            <div className="px-2">
              <p
                style={{ color: customColors.accentColor }}
                className="text-xl sm:text-2xl font-bold"
              >
                {stats.totalDydacticHours}
              </p>
              <p
                className={`text-[11px] mt-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                godz. dyd.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setSelectedFilter(
                  selectedFilter === 'rescheduled' ? 'all' : 'rescheduled'
                )
              }
              className="px-2 hover:opacity-80 transition-opacity"
              title="Kliknij, aby filtrować zajęcia przeniesione"
            >
              <p
                style={{ color: customColors.rescheduledColor }}
                className="text-xl sm:text-2xl font-bold"
              >
                {stats.rescheduledCount}
              </p>
              <p
                className={`text-[11px] mt-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                przeniesione
              </p>
            </button>
          </div>
        </section>
        )}

        {/* 4. ZJAZDY Horizontal Selector Strip */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2
              className={`text-[11px] font-semibold uppercase tracking-wider ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              ZJAZDY
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  const idx = zjazdyGroups.findIndex(
                    (z) => z.id === selectedZjazdId
                  );
                  if (idx > 0) {
                    userManuallyPickedZjazdRef.current = true;
                    setSelectedZjazdId(zjazdyGroups[idx - 1].id);
                  }
                }}
                className={`transition-colors ${
                  isDark
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                ← Poprzedni zjazd
              </button>
              <span className="text-slate-400">·</span>
              <button
                type="button"
                onClick={() => {
                  const idx = zjazdyGroups.findIndex(
                    (z) => z.id === selectedZjazdId
                  );
                  if (idx >= 0 && idx < zjazdyGroups.length - 1) {
                    userManuallyPickedZjazdRef.current = true;
                    setSelectedZjazdId(zjazdyGroups[idx + 1].id);
                  }
                }}
                style={{ color: customColors.accentColor }}
                className="font-semibold hover:underline"
              >
                Następny zjazd →
              </button>
            </div>
          </div>

          <div
            ref={zjazdyScrollRef}
            className="flex items-center gap-2 overflow-x-auto pb-2.5 pt-1"
          >
            {zjazdyGroups.map((z) => {
              const isSelected = z.id === activeZjazd?.id;
              return (
                <button
                  key={z.id}
                  data-zjazd-id={z.id}
                  type="button"
                  onClick={() => {
                    userManuallyPickedZjazdRef.current = true;
                    setSelectedZjazdId(z.id);
                    if (selectedFilter === 'odbyte') {
                      setSelectedFilter('all');
                    }
                  }}
                  style={
                    isSelected
                      ? {
                          background: `linear-gradient(180deg, ${mixHexColors(
                            customColors.accentColor,
                            '#FFFFFF',
                            0.1
                          )} 0%, ${customColors.accentColor} 55%, ${mixHexColors(
                            customColors.accentColor,
                            '#000000',
                            0.14
                          )} 100%)`,
                          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28), 0 6px 16px -4px ${customColors.accentColor}65`,
                        }
                      : {
                          backgroundColor: adaptiveCardBg,
                        }
                  }
                  className={`min-w-[66px] py-2.5 px-3.5 rounded-[20px] border text-center transition-all shrink-0 tabular-nums ${
                    isSelected
                      ? 'text-white border-white/15 font-bold'
                      : isDark
                      ? 'border-white/10 text-slate-200 hover:brightness-115'
                      : 'backdrop-blur-md border-white/90 text-[#1D1D1F] shadow-[0_2px_8px_rgba(15,23,42,0.04)] hover:bg-white'
                  }`}
                >
                  <p className="text-sm font-bold leading-tight">
                    {z.labelTop}
                  </p>
                  <p
                    className={`text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${
                      isSelected
                        ? 'text-white/90'
                        : isDark
                        ? 'text-slate-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {z.labelMonth}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* 5. TYP ZAJĘĆ & Status Filter Pills */}
        <section>
          <h2
            className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            TYP ZAJĘĆ
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            {/* Wszystko */}
            <button
              type="button"
              onClick={() => setSelectedFilter('all')}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                selectedFilter === 'all'
                  ? isDark
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'bg-[#1D1D1F] text-white shadow-sm'
                  : isDark
                  ? 'bg-white/8 text-slate-300 border border-white/12 hover:bg-white/14'
                  : 'bg-white/80 text-slate-700 border border-slate-200/80 hover:bg-white'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  selectedFilter === 'all'
                    ? isDark
                      ? 'bg-slate-950'
                      : 'bg-white'
                    : 'bg-slate-400'
                }`}
              />
              <span>Wszystko</span>
            </button>

            {/* Ćwiczenia */}
            <button
              type="button"
              onClick={() =>
                setSelectedFilter(
                  selectedFilter === 'Ćwiczenia' ? 'all' : 'Ćwiczenia'
                )
              }
              style={
                selectedFilter === 'Ćwiczenia'
                  ? {
                      backgroundColor: cwiczeniaHex,
                      borderColor: cwiczeniaHex,
                      color: '#FFFFFF',
                    }
                  : {
                      backgroundColor: isDark
                        ? `${cwiczeniaHex}26`
                        : mixHexColors(cwiczeniaHex, '#FFFFFF', 0.85),
                      borderColor: `${cwiczeniaHex}55`,
                      color: isDark
                        ? mixHexColors(cwiczeniaHex, '#FFFFFF', 0.45)
                        : mixHexColors(cwiczeniaHex, '#0F172A', 0.35),
                    }
              }
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all hover:opacity-90"
            >
              <span
                style={{
                  backgroundColor:
                    selectedFilter === 'Ćwiczenia' ? '#FFFFFF' : cwiczeniaHex,
                }}
                className="w-2 h-2 rounded-full"
              />
              <span>Ćwiczenia</span>
            </button>

            {/* Lektorat */}
            <button
              type="button"
              onClick={() =>
                setSelectedFilter(
                  selectedFilter === 'Lektorat' ? 'all' : 'Lektorat'
                )
              }
              style={
                selectedFilter === 'Lektorat'
                  ? {
                      backgroundColor: lektoratHex,
                      borderColor: lektoratHex,
                      color: '#FFFFFF',
                    }
                  : {
                      backgroundColor: isDark
                        ? `${lektoratHex}26`
                        : mixHexColors(lektoratHex, '#FFFFFF', 0.85),
                      borderColor: `${lektoratHex}55`,
                      color: isDark
                        ? mixHexColors(lektoratHex, '#FFFFFF', 0.45)
                        : mixHexColors(lektoratHex, '#0F172A', 0.35),
                    }
              }
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all hover:opacity-90"
            >
              <span
                style={{
                  backgroundColor:
                    selectedFilter === 'Lektorat' ? '#FFFFFF' : lektoratHex,
                }}
                className="w-2 h-2 rounded-full"
              />
              <span>Lektorat</span>
            </button>

            {/* Wykład (shown if present in Zjazd or currently selected) */}
            {(hasWykładInZjazd || selectedFilter === 'Wykład') && (
              <button
                type="button"
                onClick={() =>
                  setSelectedFilter(
                    selectedFilter === 'Wykład' ? 'all' : 'Wykład'
                  )
                }
                style={
                  selectedFilter === 'Wykład'
                    ? {
                        backgroundColor: wykladHex,
                        borderColor: wykladHex,
                        color: '#FFFFFF',
                      }
                    : {
                        backgroundColor: isDark
                          ? `${wykladHex}26`
                          : mixHexColors(wykladHex, '#FFFFFF', 0.85),
                        borderColor: `${wykladHex}55`,
                        color: isDark
                          ? mixHexColors(wykladHex, '#FFFFFF', 0.45)
                          : mixHexColors(wykladHex, '#0F172A', 0.35),
                      }
                }
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all hover:opacity-90"
              >
                <span
                  style={{
                    backgroundColor:
                      selectedFilter === 'Wykład' ? '#FFFFFF' : wykladHex,
                  }}
                  className="w-2 h-2 rounded-full"
                />
                <span>Wykład</span>
              </button>
            )}

            {/* Odbyte (shown when the Zjazd has completed classes, matching screenshots 1 & 2!) */}
            {(hasOdbyteInZjazd || selectedFilter === 'odbyte') && (
              <button
                type="button"
                onClick={() =>
                  setSelectedFilter(
                    selectedFilter === 'odbyte' ? 'all' : 'odbyte'
                  )
                }
                className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  selectedFilter === 'odbyte'
                    ? isDark
                      ? 'bg-slate-200 text-slate-900 border-white'
                      : 'bg-slate-800 text-white border-slate-800'
                    : isDark
                    ? 'bg-[#1A1E26] border-white/15 text-slate-300 hover:bg-white/10'
                    : 'bg-slate-200/80 border-slate-300 text-slate-700 hover:bg-slate-300/70'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span>Odbyte</span>
              </button>
            )}
          </div>
        </section>

        {/* 6. Day Sections (Piątek, Sobota, Niedziela) for the Selected Zjazd */}
        <section className="space-y-5 pt-1">
          {(selectedFilter === 'rescheduled' || selectedFilter === 'cancelled'
            ? Array.from(
                new Set(allItems.filter(matchesFilter).map((i) => i.date))
              )
            : zjazdDates
          ).map((dateStr) => {
            const rawDayItems = itemsByDate[dateStr] || [];
            const dayItems = rawDayItems.filter(matchesFilter);

            if (dayItems.length === 0) return null;

            const dayNumber = parseInt(dateStr.split('-')[2], 10);
            const dayShort = getPolishDayShort(dateStr);
            const dayFullName = POLISH_DAYS_FULL[dayShort] || dayShort;
            const firstStart = dayItems[0].startTime;
            const lastEnd = dayItems[dayItems.length - 1].endTime;

            // Check if all classes on this day are already completed (odbyte)
            const isDayCompleted =
              rawDayItems.length > 0 &&
              rawDayItems.every(
                (i) => i.status === 'cancelled' || isItemCompleted(i)
              );

            // Check if EVERY day in the currently viewed Zjazd is already completed
            // (If the whole Zjazd is in the past, e.g. 6-8 LIS viewed on Nov 9, do NOT auto-collapse all days!)
            const isEntireZjazdCompleted =
              zjazdDates.length > 0 &&
              zjazdDates.every((dStr) => {
                const dItems = itemsByDate[dStr] || [];
                return (
                  dItems.length === 0 ||
                  dItems.every(
                    (i) => i.status === 'cancelled' || isItemCompleted(i)
                  )
                );
              });

            // Auto-collapse completed days ONLY when viewing 'all' filter AND the Zjazd still has upcoming days
            const isCollapsed =
              userCollapsedOverrides[dateStr] !== undefined
                ? userCollapsedOverrides[dateStr]
                : selectedFilter === 'all' &&
                  layoutPrefs.autoCollapseCompletedDays &&
                  isDayCompleted &&
                  !isEntireZjazdCompleted;

            const handleToggleDay = () => {
              setUserCollapsedOverrides((prev) => ({
                ...prev,
                [dateStr]: !isCollapsed,
              }));
            };

            return (
              <div key={dateStr} className="space-y-3 day-card-contain">
                {/* Day Header with Liquid Glass 3D circular number badge (or emerald completed badge with ✓) + collapse chevron */}
                <div
                  onClick={handleToggleDay}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleToggleDay();
                    }
                  }}
                  className={`group flex items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                    isDayCompleted
                      ? isDark
                        ? 'px-3.5 py-2.5 rounded-[24px] border border-emerald-400/40 bg-emerald-950/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_4px_18px_rgba(16,185,129,0.1)] hover:bg-emerald-950/60'
                        : 'px-3.5 py-2.5 rounded-[24px] border border-emerald-500/40 bg-emerald-50/90 shadow-[inset_0_1px_2px_rgba(255,255,255,0.9),0_4px_14px_rgba(16,185,129,0.08)] hover:bg-emerald-50'
                      : 'py-1 px-1 rounded-[22px] hover:bg-white/[0.02] transition-colors'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    {isDayCompleted ? (
                      <div
                        style={{
                          boxShadow: isDark
                            ? 'inset 0 1px 0 rgba(255,255,255,0.12), 0 3px 10px rgba(16,185,129,0.14)'
                            : 'inset 0 1px 0 rgba(255,255,255,0.8), 0 3px 8px rgba(16,185,129,0.12)',
                        }}
                        className={`relative w-10 h-10 rounded-full font-bold text-base flex items-center justify-center tabular-nums shrink-0 border ${
                          isDark
                            ? 'bg-[#0E2E1F] border-emerald-400/25 text-[#2ECC71]'
                            : 'bg-[#DCFCE7] border-emerald-500/25 text-[#15803D]'
                        }`}
                      >
                        <span>{dayNumber}</span>
                        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#2ECC71] text-[#041E11] flex items-center justify-center shadow-xs">
                          <Check className="w-2.5 h-2.5 stroke-[3.5]" />
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{
                          background: `linear-gradient(175deg, ${mixHexColors(
                            customColors.accentColor,
                            '#FFFFFF',
                            0.12
                          )} 0%, ${customColors.accentColor} 55%, ${mixHexColors(
                            customColors.accentColor,
                            '#000000',
                            0.16
                          )} 100%)`,
                          boxShadow: `inset 0 1px 0.5px rgba(255, 255, 255, 0.32), inset 0 -1px 1.5px rgba(0, 0, 0, 0.2), 0 4px 12px -2px ${customColors.accentColor}55`,
                        }}
                        className="w-10 h-10 rounded-full text-white font-bold text-base flex items-center justify-center tabular-nums shrink-0 border border-white/15"
                      >
                        {dayNumber}
                      </div>
                    )}

                    <div>
                      <h3
                        className={`text-lg font-bold tracking-tight leading-tight ${
                          isDayCompleted
                            ? isDark
                              ? 'text-slate-200'
                              : 'text-slate-700'
                            : ''
                        }`}
                      >
                        {dayFullName}
                      </h3>
                      <p
                        className={`text-xs tabular-nums ${
                          isDark ? 'text-slate-400' : 'text-[#6E6E73]'
                        }`}
                      >
                        {formatFullPolishDate(dateStr)} ·{' '}
                        {pluralizeZajecia(dayItems.length)} · {firstStart}–
                        {lastEnd}
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      boxShadow: isDark
                        ? 'inset 0 1px 1.5px rgba(255,255,255,0.2), 0 4px 10px rgba(0,0,0,0.3)'
                        : 'inset 0 1px 1.5px rgba(255,255,255,0.9), 0 2px 8px rgba(15,23,42,0.08)',
                    }}
                    className={`w-8.5 h-8.5 rounded-full flex items-center justify-center transition-colors ${
                      isDark
                        ? 'bg-white/8 border border-white/15 text-slate-300 group-hover:bg-white/14'
                        : 'bg-white/90 border border-slate-200/80 text-slate-600 group-hover:bg-white'
                    }`}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>

                {/* Day Container Card */}
                {!isCollapsed && (
                  <div
                    style={{ backgroundColor: adaptiveCardBg }}
                    className={`${cardRadiusClass} border overflow-hidden transition-colors ${
                      isDark
                        ? 'border-white/10 shadow-xl'
                        : 'border-white shadow-[0_6px_28px_rgba(15,23,42,0.06)]'
                    }`}
                  >
                    {dayItems.map((item, idx) => {
                      const prevItem = idx > 0 ? dayItems[idx - 1] : null;
                      const breakMins = prevItem
                        ? getBreakMinutes(prevItem.endTime, item.startTime)
                        : 0;
                      const walkHint =
                        layoutPrefs.showWalkTimeHints && breakMins > 0
                          ? getCampusWalkTimeHint(prevItem, item)
                          : null;

                      const isLiveCard =
                        heroActiveClass?.isLiveNow &&
                        heroActiveClass.item.id === item.id;
                      const isCancelled = item.status === 'cancelled';
                      const completed = !isLiveCard && isItemCompleted(item);
                      const catStyle = getCategoryColors(item, completed);
                      const hasRescheduleNote = item.status === 'rescheduled';
                      const rescheduleDetails =
                        hasRescheduleNote && !isCancelled
                          ? getRescheduleExplanation(
                              item.statusReason || item.rawNotes,
                              item.date
                            )
                          : null;

                      return (
                        <React.Fragment key={item.id}>
                          {/* Break Bar ("przerwa 15 min" + optional Smart Campus Walk-Time Hint) */}
                          {layoutPrefs.showBreaks && breakMins > 0 && (
                            <div
                              style={{ backgroundColor: adaptiveBreakBg }}
                              className={`py-1.5 px-3 text-center text-xs border-y tabular-nums flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 ${
                                isDark
                                  ? 'border-white/6 text-slate-400'
                                  : 'border-slate-200/70 text-[#6E6E73]'
                              }`}
                            >
                              <span>przerwa {breakMins} min</span>
                              {walkHint && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCampusMapRoom({
                                      room: item.room,
                                      subject: item.subject,
                                    });
                                  }}
                                  style={{
                                    color: isDark
                                      ? mixHexColors(
                                          customColors.accentColor,
                                          '#FFFFFF',
                                          0.35
                                        )
                                      : mixHexColors(
                                          customColors.accentColor,
                                          '#000000',
                                          0.2
                                        ),
                                  }}
                                  className="inline-flex items-center gap-1 font-semibold hover:underline"
                                  title="Kliknij, aby zobaczyć trasę do kolejnego pawilonu na mapie kampusu"
                                >
                                  <span>·</span>
                                  <span>
                                    🚶 {walkHint.fromLabel} → {walkHint.toLabel}{' '}
                                    (~{walkHint.walkMins} min · {walkHint.meters} m)
                                  </span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* Divider between classes when there's no break bar */}
                          {idx > 0 &&
                            (breakMins === 0 || !layoutPrefs.showBreaks) && (
                              <div
                                className={`border-t ${
                                  isDark ? 'border-white/8' : 'border-slate-100'
                                }`}
                              />
                            )}

                          {/* Class Row */}
                          <div
                            onClick={() => setInspectedItem(item)}
                            style={
                              isLiveCard
                                ? {
                                    borderColor: customColors.accentColor,
                                    backgroundColor: isDark
                                      ? `${customColors.accentColor}1E`
                                      : `${customColors.accentColor}14`,
                                    boxShadow: `0 4px 22px ${customColors.accentColor}28`,
                                  }
                                : undefined
                            }
                            className={`${rowDensityClass} transition-all cursor-pointer relative ${
                              isLiveCard
                                ? 'm-2 rounded-[22px] border-2'
                                : isCancelled
                                ? isDark
                                  ? 'm-2 rounded-[20px] border border-rose-500/50 bg-rose-500/[0.06] hover:bg-rose-500/[0.10]'
                                  : 'm-2 rounded-[20px] border border-rose-400/60 bg-rose-50/70 hover:bg-rose-50'
                                : hasRescheduleNote
                                ? isDark
                                  ? 'm-2 rounded-[20px] border-2 border-amber-500/80 bg-amber-500/[0.08] shadow-[0_0_20px_rgba(245,158,11,0.16)] hover:bg-amber-500/[0.12]'
                                  : 'm-2 rounded-[20px] border-2 border-amber-500/85 bg-amber-50/85 shadow-[0_4px_16px_rgba(245,158,11,0.14)] hover:bg-amber-100/70'
                                : completed
                                ? isDark
                                  ? 'm-2 rounded-[20px] border border-emerald-400/40 bg-emerald-500/[0.05] shadow-[0_0_14px_rgba(52,211,153,0.07)] hover:bg-emerald-500/[0.08]'
                                  : 'm-2 rounded-[20px] border border-emerald-500/45 bg-emerald-50/60 shadow-[0_2px_10px_rgba(16,185,129,0.06)] hover:bg-emerald-50/85'
                                : isDark
                                ? 'hover:bg-white/[0.03]'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <div className="flex items-stretch gap-3 sm:gap-3.5">
                              {/* Left Time Column */}
                              <div className="w-13 shrink-0 text-right tabular-nums pt-0.5">
                                <p
                                  className={`text-sm font-bold leading-tight ${
                                    isCancelled
                                      ? 'line-through opacity-50'
                                      : hasRescheduleNote
                                      ? isDark
                                        ? 'text-amber-300'
                                        : 'text-amber-700'
                                      : completed
                                      ? isDark
                                        ? 'text-slate-400'
                                        : 'text-slate-500'
                                      : ''
                                  }`}
                                >
                                  {item.startTime}
                                </p>
                                <p
                                  className={`text-xs mt-0.5 ${
                                    isDark ? 'text-slate-500' : 'text-[#6E6E73]'
                                  }`}
                                >
                                  {item.endTime}
                                </p>
                                {layoutPrefs.showClassDuration && (
                                  <p
                                    style={{
                                      color:
                                        hasRescheduleNote && !isCancelled
                                          ? '#F59E0B'
                                          : catStyle.barColor,
                                    }}
                                    className="text-[10px] font-semibold mt-0.5 opacity-85"
                                  >
                                    {getClassDurationLabel(
                                      item.startTime,
                                      item.endTime
                                    )}
                                  </p>
                                )}
                              </div>

                              {/* Vertical Colored Category/Status Indicator */}
                              {layoutPrefs.categoryIndicator === 'pill_dot' ? (
                                <div className="flex flex-col items-center pt-1.5 shrink-0">
                                  <span
                                    style={{
                                      backgroundColor:
                                        hasRescheduleNote && !isCancelled
                                          ? '#F59E0B'
                                          : catStyle.barColor,
                                      boxShadow:
                                        hasRescheduleNote && !isCancelled
                                          ? '0 0 8px #F59E0B95'
                                          : completed
                                          ? undefined
                                          : `0 0 8px ${catStyle.barColor}85`,
                                    }}
                                    className="w-2.5 h-2.5 rounded-full"
                                  />
                                  <span
                                    style={{
                                      backgroundColor:
                                        hasRescheduleNote && !isCancelled
                                          ? '#F59E0B40'
                                          : `${catStyle.barColor}28`,
                                    }}
                                    className="w-0.5 flex-1 rounded-full mt-1.5"
                                  />
                                </div>
                              ) : (
                                <div
                                  style={{
                                    backgroundColor:
                                      hasRescheduleNote && !isCancelled
                                        ? '#F59E0B'
                                        : catStyle.barColor,
                                    boxShadow:
                                      hasRescheduleNote && !isCancelled
                                        ? '0 0 10px #F59E0B95'
                                        : layoutPrefs.categoryIndicator ===
                                            'glow_bar' && !completed
                                        ? `0 0 10px ${catStyle.barColor}90`
                                        : undefined,
                                  }}
                                  className="w-1 rounded-full shrink-0"
                                />
                              )}

                              {/* Right Content Column */}
                              <div className="flex-1 min-w-0">
                                <h4
                                  className={`text-[15px] sm:text-base font-bold leading-snug ${
                                    isCancelled
                                      ? 'line-through text-slate-400'
                                      : completed && !hasRescheduleNote
                                      ? isDark
                                        ? 'text-slate-300'
                                        : 'text-slate-600'
                                      : ''
                                  }`}
                                >
                                  {layoutPrefs.showSubjectIcons && (
                                    <span
                                      aria-hidden="true"
                                      className="mr-1.5 inline-block"
                                    >
                                      {getSubjectSmartIcon(item)}
                                    </span>
                                  )}
                                  <span>{item.subject}</span>
                                </h4>

                                {/* Location & Lecturer Line */}
                                <div
                                  className={`mt-1 text-xs flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${
                                    isDark ? 'text-slate-400' : 'text-[#6E6E73]'
                                  }`}
                                >
                                  {item.onlineUrl ? (
                                    <a
                                      href={item.onlineUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      style={{
                                        color: isDark
                                          ? customColors.accentColor
                                          : '#007AFF',
                                      }}
                                      className="font-semibold hover:underline inline-flex items-center gap-1"
                                    >
                                      <span>{item.room || 'link do zajęć'}</span>
                                      <span className="text-[10px]">↗</span>
                                    </a>
                                  ) : item.isOnlineLocation ? (
                                    <a
                                      href="https://e-uczelnia.uek.krakow.pl"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      style={{
                                        color: isDark
                                          ? customColors.accentColor
                                          : '#007AFF',
                                      }}
                                      className="font-semibold hover:underline inline-flex items-center gap-0.5"
                                    >
                                      <span>{item.room || 'Online'} ↗</span>
                                    </a>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCampusMapRoom({
                                          room: item.room,
                                          subject: item.subject,
                                        });
                                      }}
                                      title="Kliknij, aby otworzyć mapę kampusu UEK i sprawdzić pawilon oraz piętro"
                                      className={`inline-flex items-center gap-1 font-medium hover:underline transition-colors ${
                                        isDark
                                          ? 'text-sky-300 hover:text-sky-200'
                                          : 'text-sky-700 hover:text-sky-900'
                                      }`}
                                    >
                                      <MapPin className="w-3 h-3 shrink-0 opacity-80" />
                                      <span>{item.room}</span>
                                    </button>
                                  )}

                                  {layoutPrefs.showLecturers &&
                                    item.lecturer && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span>{item.lecturer}</span>
                                      </>
                                    )}
                                </div>

                                {/* Rescheduled / Uwagi Orange Box ("Uwagi: na 25.10" / "Uwagi: z 8.11") */}
                                {hasRescheduleNote &&
                                  !isCancelled &&
                                  rescheduleDetails && (
                                    <div
                                      className={`mt-2 px-3 py-2 rounded-xl border text-xs ${
                                        isDark
                                          ? 'bg-amber-500/15 border-amber-400/35 text-amber-200'
                                          : 'bg-amber-500/12 border-amber-500/35 text-amber-950'
                                      }`}
                                    >
                                      <div className="font-bold flex items-center gap-1.5">
                                        <span className="text-amber-400">⇄</span>
                                        <span>{rescheduleDetails.headline}</span>
                                      </div>
                                      <p
                                        className={`text-[11px] mt-0.5 leading-snug ${
                                          isDark
                                            ? 'text-amber-200/85'
                                            : 'text-amber-900/85'
                                        }`}
                                      >
                                        {rescheduleDetails.subtext}
                                      </p>
                                    </div>
                                  )}

                                {isCancelled && (
                                  <p className="mt-1 text-xs font-bold text-rose-500">
                                    {item.statusReason || 'Zajęcia odwołane'}
                                  </p>
                                )}

                                {/* Counter Badge, Rescheduled Badge, Completed ("✓ Odbyte") Badge, & Live Status Pill */}
                                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                  {layoutPrefs.showClassCounters &&
                                    item.counterLabel && (
                                      <span
                                        style={{
                                          backgroundColor: catStyle.badgeBg,
                                          borderColor: catStyle.badgeBorder,
                                          color: catStyle.badgeText,
                                        }}
                                        className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border tabular-nums"
                                      >
                                        {item.counterLabel}
                                      </span>
                                    )}

                                  {hasRescheduleNote &&
                                    !isCancelled &&
                                    rescheduleDetails && (
                                      <span
                                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                          isDark
                                            ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                                            : 'bg-amber-100 border-amber-500/50 text-amber-900'
                                        }`}
                                      >
                                        <span>⇄</span>
                                        <span>{rescheduleDetails.badgeText}</span>
                                      </span>
                                    )}

                                  {completed && !isCancelled && (
                                    <span
                                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                                        isDark
                                          ? 'bg-[#122D20] text-[#4ADE80]'
                                          : 'bg-[#DCFCE7] text-[#15803D]'
                                      }`}
                                    >
                                      <Check className="w-3 h-3 stroke-[2.5]" />
                                      <span>Odbyte</span>
                                    </span>
                                  )}

                                  {isLiveCard && (
                                    <span
                                      style={
                                        isDark
                                          ? {
                                              backgroundColor:
                                                customColors.accentColor,
                                            }
                                          : undefined
                                      }
                                      className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${
                                        isDark
                                          ? 'text-white'
                                          : 'bg-[#D6E4FF] text-[#0051D5] border border-[#A6C8FF]'
                                      }`}
                                    >
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${
                                          isDark ? 'bg-white' : 'bg-[#0066FF]'
                                        }`}
                                      />
                                      <span>
                                        W trakcie · jeszcze{' '}
                                        {heroActiveClass.remainingMins} min
                                      </span>
                                    </span>
                                  )}
                                </div>

                                {/* Bottom Action Links ("Oznacz jako odwołane" / "Zakończ zajęcia" / "Przywróć do trwających" / "Zmień salę z ang.") */}
                                <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs">
                                  <button
                                    type="button"
                                    onClick={(e) =>
                                      handleToggleCancelled(e, item)
                                    }
                                    style={{
                                      color: isCancelled
                                        ? '#16A34A'
                                        : isDark
                                        ? customColors.accentColor
                                        : '#007AFF',
                                    }}
                                    className="font-medium hover:underline"
                                  >
                                    {isCancelled
                                      ? 'Przywróć zajęcia'
                                      : 'Oznacz jako odwołane'}
                                  </button>

                                  {isLiveCard && (
                                    <button
                                      type="button"
                                      onClick={(e) =>
                                        handleEndClassManually(e, item)
                                      }
                                      className="font-medium text-[#EF4444] hover:underline"
                                    >
                                      Zakończ zajęcia
                                    </button>
                                  )}

                                  {item.isEndedManually && (
                                    <button
                                      type="button"
                                      onClick={(e) =>
                                        handleRestoreEndedClass(e, item)
                                      }
                                      className="font-semibold text-[#10B981] hover:underline inline-flex items-center gap-1"
                                    >
                                      <span>↺ Przywróć zajęcia (cofnij zakończenie)</span>
                                    </button>
                                  )}

                                  {item.normalizedType === 'lektorat' && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setIsImportModalOpen(true);
                                      }}
                                      className={`font-medium hover:underline ${
                                        isDark
                                          ? 'text-amber-400/90'
                                          : 'text-amber-700'
                                      }`}
                                    >
                                      Zmień grupę / salę jęz.
                                    </button>
                                  )}
                                </div>

                                {/* Live progress indicator at bottom of active class (3 styles: line, dots, timeline_orb) */}
                                {isLiveCard && (
                                  <div className="mt-3">
                                    {(layoutPrefs.liveProgressStyle || 'line') ===
                                      'line' && (
                                      <div
                                        className={`h-1.5 w-full rounded-full overflow-hidden ${
                                          isDark
                                            ? 'bg-white/10'
                                            : 'bg-[#007AFF]/15'
                                        }`}
                                      >
                                        <div
                                          style={{
                                            width: `${heroActiveClass.progressPercent}%`,
                                            backgroundColor:
                                              customColors.accentColor,
                                            boxShadow: `0 0 10px ${customColors.accentColor}80`,
                                          }}
                                          className="h-full rounded-full transition-all duration-1000"
                                        />
                                      </div>
                                    )}

                                    {layoutPrefs.liveProgressStyle ===
                                      'dots' && (
                                      <div className="grid grid-cols-12 gap-1.5 items-center pt-0.5">
                                        {Array.from({ length: 12 }).map(
                                          (_, dotIdx) => {
                                            const activeIndex = Math.min(
                                              11,
                                              Math.floor(
                                                (heroActiveClass.progressPercent /
                                                  100) *
                                                  12
                                              )
                                            );
                                            const isDone = dotIdx < activeIndex;
                                            const isCurrent =
                                              dotIdx === activeIndex;
                                            return (
                                              <span
                                                key={dotIdx}
                                                style={
                                                  isDone || isCurrent
                                                    ? {
                                                        backgroundColor:
                                                          customColors.accentColor,
                                                        boxShadow: isCurrent
                                                          ? `0 0 8px ${customColors.accentColor}`
                                                          : undefined,
                                                      }
                                                    : undefined
                                                }
                                                className={`h-2 rounded-full transition-all duration-500 ${
                                                  isCurrent
                                                    ? 'scale-y-125'
                                                    : isDone
                                                    ? 'opacity-90'
                                                    : isDark
                                                    ? 'bg-white/12'
                                                    : 'bg-slate-300/75'
                                                }`}
                                              />
                                            );
                                          }
                                        )}
                                      </div>
                                    )}

                                    {layoutPrefs.liveProgressStyle ===
                                      'timeline_orb' && (
                                      <div className="flex items-center gap-2 pt-1">
                                        <span
                                          className={`text-[10px] font-bold tabular-nums shrink-0 ${
                                            isDark
                                              ? 'text-slate-400'
                                              : 'text-slate-500'
                                          }`}
                                        >
                                          {item.startTime}
                                        </span>
                                        <div
                                          className={`relative flex-1 h-1.5 rounded-full ${
                                            isDark
                                              ? 'bg-white/12'
                                              : 'bg-slate-200/90'
                                          }`}
                                        >
                                          <div
                                            style={{
                                              width: `${heroActiveClass.progressPercent}%`,
                                              backgroundColor:
                                                customColors.accentColor,
                                            }}
                                            className="h-full rounded-full transition-all duration-1000"
                                          />
                                          <span
                                            style={{
                                              left: `${Math.min(
                                                92,
                                                Math.max(
                                                  8,
                                                  heroActiveClass.progressPercent
                                                )
                                              )}%`,
                                              backgroundColor:
                                                customColors.accentColor,
                                              boxShadow: `0 2px 6px ${customColors.accentColor}65`,
                                            }}
                                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-[8.5px] font-extrabold text-white leading-none tabular-nums whitespace-nowrap"
                                          >
                                            {heroActiveClass.progressPercent.toFixed(2)}%
                                          </span>
                                        </div>
                                        <span
                                          className={`text-[10px] font-bold tabular-nums shrink-0 ${
                                            isDark
                                              ? 'text-slate-400'
                                              : 'text-slate-500'
                                          }`}
                                        >
                                          {item.endTime}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </section>
          </>
        )}
      </div>

      {/* Modal 1: Import planu z UEK (Grupa dziekańska + Język obcy) */}
      <CasAuthModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentUrl={scheduleUrl}
        onUpdateUrl={(newUrl) => {
          setScheduleUrl(newUrl);
          localStorage.setItem(STORAGE_URL_KEY, newUrl);
          localStorage.setItem(STORAGE_ONBOARDED_KEY, 'true');
          setIsPlanConfigured(true);
        }}
        selectedMajor={selectedMajor}
        onSelectMajor={(major) => {
          setSelectedMajor(major);
          localStorage.setItem(STORAGE_MAJOR_KEY, major);
        }}
        languageUrl={languageUrl}
        customLangRoom={customLangMeta.room || ''}
        customLangLecturer={customLangMeta.lecturer || ''}
        onUpdateLanguageConfig={({
          languageUrl: newLangUrl,
          customLangRoom: customRoom,
          customLangLecturer: customLecturer,
        }) => {
          setLanguageUrl(newLangUrl);
          localStorage.setItem(STORAGE_LANG_URL_KEY, newLangUrl);
          const nextMeta = {
            room: customRoom || undefined,
            lecturer: customLecturer || undefined,
          };
          setCustomLangMeta(nextMeta);
          localStorage.setItem(STORAGE_LANG_META_KEY, JSON.stringify(nextMeta));
        }}
        authMode={metadata.authMode}
        casUser={metadata.casUser || savedAuth.username}
        hasSavedPassword={Boolean(savedAuth.password)}
        onLoginSubmit={async (payload) => {
          if (payload.rememberForAutoSync) {
            setSavedAuth((prev) => {
              const next = {
                username: payload.username || prev.username,
                password: payload.password || prev.password,
                sessionCookie: payload.sessionCookie || prev.sessionCookie,
              };
              saveAuthToStorage(next);
              return next;
            });
          }
          if (payload.major) {
            setSelectedMajor(payload.major);
            localStorage.setItem(STORAGE_MAJOR_KEY, payload.major);
          }
          const res = await fetchSchedule(payload.url || scheduleUrl, payload);
          if (res.ok) {
            localStorage.setItem(STORAGE_ONBOARDED_KEY, 'true');
            setIsPlanConfigured(true);
          }
          return res;
        }}
        onResetToDefaultSchedule={() => {
          setSelectedMajor('informatyka');
          localStorage.setItem(STORAGE_MAJOR_KEY, 'informatyka');
          setScheduleUrl(DEFAULT_UEK_URL);
          localStorage.setItem(STORAGE_URL_KEY, DEFAULT_UEK_URL);
          setLanguageUrl(DEFAULT_LANGUAGE_UEK_URL);
          localStorage.setItem(STORAGE_LANG_URL_KEY, DEFAULT_LANGUAGE_UEK_URL);
          setCustomLangMeta({});
          localStorage.removeItem(STORAGE_LANG_META_KEY);
          const def = generateRealisticUekSchedule(
            DEFAULT_UEK_URL,
            undefined,
            'demo_preview',
            undefined,
            'informatyka'
          );
          setRawItems(def.items);
          setMetadata(def.metadata);
          try {
            localStorage.setItem(
              STORAGE_OFFLINE_CACHE_KEY,
              JSON.stringify(def)
            );
          } catch {
            // ignore
          }
        }}
      />

      {/* Modal 2: Personalizacja kolorów i układu */}
      <AppleAppearanceDrawer
        isOpen={isColorsModalOpen}
        onClose={() => setIsColorsModalOpen(false)}
        colors={customColors}
        onChangeColors={setCustomColors}
        onResetColors={() => {
          setCustomColors(DEFAULT_CUSTOM_COLORS);
          setLayoutPrefs(DEFAULT_LAYOUT_PREFERENCES);
        }}
        layoutPrefs={layoutPrefs}
        onChangeLayoutPrefs={setLayoutPrefs}
        isDark={isDark}
      />

      {/* Modal 3: Szczegóły i edycja statusu zajęć (odwołane, przeniesione, zmiana sali) */}
      <ClassInspectorModal
        item={inspectedItem}
        onClose={() => setInspectedItem(null)}
        onSaveOverride={handleSaveOverride}
        onClearOverride={handleClearOverride}
      />

      {/* Modal 4: Mapa kampusu UEK przy kliknięciu w salę (Paw.A, Paw.B, Paw.C, Paw.G) */}
      <CampusMapModal
        roomString={campusMapRoom?.room || null}
        subjectName={campusMapRoom?.subject}
        onClose={() => setCampusMapRoom(null)}
        isDark={isDark}
        accentColor={customColors.accentColor}
      />

      {/* Modal 5: Jednorazowy popup "Co nowego w aktualizacji" w stylu Apple */}
      {isWhatsNewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xl animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="whats-new-title"
          onClick={handleDismissWhatsNew}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-[460px] rounded-[32px] p-6 sm:p-7 border shadow-2xl transition-colors ${
              isDark
                ? 'bg-[#161922]/95 border-white/15 text-[#F5F5F7]'
                : 'bg-white/95 border-slate-200/90 text-[#1D1D1F]'
            }`}
          >
            {/* Top Apple Badge & Close */}
            <div className="flex items-start justify-between gap-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Aktualizacja · Wersja {CURRENT_APP_VERSION}</span>
              </div>
              <button
                type="button"
                onClick={handleDismissWhatsNew}
                aria-label="Zamknij"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  isDark
                    ? 'bg-white/10 hover:bg-white/20 text-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Title */}
            <h2
              id="whats-new-title"
              className="mt-3.5 text-xl sm:text-2xl font-bold tracking-tight"
            >
              Co nowego w Plan UEK
            </h2>
            <p
              className={`mt-1 text-xs sm:text-sm ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              Najważniejsze zmiany wprowadzone w najnowszej wersji aplikacji:
            </p>

            {/* Changelog Items */}
            <div className="mt-5 space-y-3 text-xs sm:text-[13px] max-h-[60vh] overflow-y-auto pr-1">
              {/* Item 0: Welcome screen for new users + automatic Zjazd week selection */}
              <div
                className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                  isDark
                    ? 'bg-emerald-500/10 border-emerald-500/35'
                    : 'bg-emerald-50/90 border-emerald-300/80'
                }`}
              >
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500 text-black shrink-0 mt-0.5">
                  Nowość
                </span>
                <div>
                  <p className="font-bold">
                    Ekran powitalny dla nowych użytkowników + automatyczny tydzień zjazdu (13–15 LIS)
                  </p>
                  <p
                    className={`mt-0.5 text-[11px] leading-relaxed ${
                      isDark ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    Gdy ktoś nowy otwiera Twoją aplikację po raz pierwszy,
                    zamiast sztywnego planu z góry widzi ekran powitalny z
                    miejscem na wklejenie linku do własnej grupy UEK. Dodatkowo
                    aplikacja automatycznie zaznacza aktualny zjazd (np.{' '}
                    <strong>13–15 LIS</strong>).
                  </p>
                </div>
              </div>

              {/* Item 1: Auto CAS re-login & schedule protection */}
              <div
                className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                  isDark
                    ? 'bg-sky-500/10 border-sky-500/35'
                    : 'bg-sky-50/90 border-sky-300/80'
                }`}
              >
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-sky-500 text-black shrink-0 mt-0.5">
                  Nowość
                </span>
                <div>
                  <p className="font-bold">
                    Automatyczna aktualizacja planu bez wpisywania hasła
                  </p>
                  <p
                    className={`mt-0.5 text-[11px] leading-relaxed ${
                      isDark ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    Wystarczy raz wpisać login i hasło CAS UEK. Gdy wchodzisz na
                    aplikację po dłuższym czasie, apka sama w tle odnawia sesję,
                    pobiera najnowsze zmiany z uczelni i chroni Twój plan przed
                    zresetowaniem.
                  </p>
                </div>
              </div>

              {/* Item 2: Orange border for rescheduled */}
              <div
                className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                  isDark
                    ? 'bg-amber-500/10 border-amber-500/35'
                    : 'bg-amber-50/90 border-amber-300/80'
                }`}
              >
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-amber-500 text-black shrink-0 mt-0.5">
                  Dodano
                </span>
                <div>
                  <p className="font-bold">
                    Pomarańczowa obramówka dla przeniesionych zajęć
                  </p>
                  <p
                    className={`mt-0.5 text-[11px] leading-relaxed ${
                      isDark ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    Zajęcia z dopiskiem np. <strong>(na 22.11)</strong> lub{' '}
                    <strong>(z 8.11)</strong> mają teraz wyraźną pomarańczową
                    ramkę i czytelny opis wyjaśniający, dlaczego w danym dniu
                    widnieją dwa terminy lub inna sala / forma Online.
                  </p>
                </div>
              </div>

              {/* Item 3: Link & CAS fix */}
              <div
                className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                  isDark
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-emerald-50/80 border-emerald-300/70'
                }`}
              >
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500 text-black shrink-0 mt-0.5">
                  Naprawiono
                </span>
                <div>
                  <p className="font-bold">
                    Wczytywanie linków grup i uwag z tabeli UEK
                  </p>
                  <p
                    className={`mt-0.5 text-[11px] leading-relaxed ${
                      isDark ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    Wklejenie dowolnego linku grupy z{' '}
                    <code>planzajec.uek.krakow.pl</code> od razu podmienia plan,
                    poprawnie odczytuje uwagi z kolumny <em>Forma</em> i nie
                    ukrywa zakończonych zjazdów.
                  </p>
                </div>
              </div>

              {/* Item 4: Removed manual major picker */}
              <div
                className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                  isDark
                    ? 'bg-white/[0.04] border-white/10'
                    : 'bg-slate-100/80 border-slate-200'
                }`}
              >
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-rose-500/90 text-white shrink-0 mt-0.5">
                  Usunięto
                </span>
                <div>
                  <p className="font-bold">
                    Ręczny wybór kierunku studiów w oknie importu
                  </p>
                  <p
                    className={`mt-0.5 text-[11px] leading-relaxed ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    Usunięto zbędny przełącznik kierunków — aplikacja
                    automatycznie pobiera i dopasowuje dane na podstawie samego
                    linku grupy.
                  </p>
                </div>
              </div>
            </div>

            {/* Primary CTA Button */}
            <button
              type="button"
              onClick={handleDismissWhatsNew}
              style={{
                background: `linear-gradient(180deg, ${mixHexColors(
                  customColors.accentColor,
                  '#FFFFFF',
                  0.1
                )} 0%, ${customColors.accentColor} 100%)`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28), 0 6px 20px ${customColors.accentColor}45`,
              }}
              className="mt-6 w-full h-[48px] rounded-2xl font-bold text-sm text-white hover:opacity-95 transition-opacity"
            >
              Rozumiem, przejdź do planu
            </button>
          </div>
        </div>
      )}

      {/* Modal 6: Automatyczny popup powiadamiający o zmianach wykrytych w samym planie zajęć UEK */}
      {scheduleDiffAlerts.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xl animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-diff-title"
          onClick={handleDismissScheduleDiffs}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-[460px] rounded-[32px] p-6 sm:p-7 border shadow-2xl transition-colors ${
              isDark
                ? 'bg-[#161922]/95 border-white/15 text-[#F5F5F7]'
                : 'bg-white/95 border-slate-200/90 text-[#1D1D1F]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Wykryto zmiany w planie UEK ({scheduleDiffAlerts.length})</span>
              </div>
              <button
                type="button"
                onClick={handleDismissScheduleDiffs}
                aria-label="Zamknij"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  isDark
                    ? 'bg-white/10 hover:bg-white/20 text-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <h2
              id="schedule-diff-title"
              className="mt-3.5 text-xl sm:text-2xl font-bold tracking-tight"
            >
              Zmiany w Twoim harmonogramie
            </h2>
            <p
              className={`mt-1 text-xs sm:text-sm ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              Podczas automatycznej synchronizacji z UEK wykryto nowe zmiany w zajęciach:
            </p>

            <div className="mt-4 space-y-3 max-h-[55vh] overflow-y-auto pr-1 text-xs">
              {scheduleDiffAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3.5 rounded-2xl border ${
                    alert.kind === 'cancelled'
                      ? isDark
                        ? 'bg-rose-500/10 border-rose-500/35'
                        : 'bg-rose-50 border-rose-300'
                      : alert.kind === 'rescheduled'
                      ? isDark
                        ? 'bg-amber-500/10 border-amber-500/35'
                        : 'bg-amber-50 border-amber-300'
                      : isDark
                      ? 'bg-sky-500/10 border-sky-500/35'
                      : 'bg-sky-50 border-sky-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${
                        alert.kind === 'cancelled'
                          ? 'bg-rose-500 text-white'
                          : alert.kind === 'rescheduled'
                          ? 'bg-amber-500 text-black'
                          : 'bg-sky-500 text-black'
                      }`}
                    >
                      {alert.kind === 'cancelled'
                        ? 'Odwołane'
                        : alert.kind === 'rescheduled'
                        ? 'Przeniesione'
                        : 'Zmiana sali'}
                    </span>
                    <span
                      className={`text-[11px] font-mono tabular-nums ${
                        isDark ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      {alert.date} · {alert.time}
                    </span>
                  </div>
                  <p className="mt-2 font-bold text-sm">{alert.subject}</p>
                  <p className="mt-0.5 font-semibold text-amber-400">
                    {alert.headline}
                  </p>
                  <p
                    className={`mt-0.5 text-[11px] ${
                      isDark ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {alert.detail}
                  </p>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleDismissScheduleDiffs}
              style={{
                background: `linear-gradient(180deg, ${mixHexColors(
                  customColors.accentColor,
                  '#FFFFFF',
                  0.1
                )} 0%, ${customColors.accentColor} 100%)`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28), 0 6px 20px ${customColors.accentColor}45`,
              }}
              className="mt-6 w-full h-[48px] rounded-2xl font-bold text-sm text-white hover:opacity-95 transition-opacity"
            >
              Rozumiem
            </button>
          </div>
        </div>
      )}

      {/* Non-intrusive offline mode indicator */}
      <OfflineIndicator />
    </div>
  );
}
