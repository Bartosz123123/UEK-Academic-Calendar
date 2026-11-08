import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  LayoutGrid,
  MapPin,
  Palette,
  Plus,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  Wand2,
} from 'lucide-react';
import {
  CategoryColorMode,
  CustomColorsConfig,
  LayoutPreferencesConfig,
} from '../types/schedule';

export const DEFAULT_CUSTOM_COLORS: CustomColorsConfig = {
  accentColor: '#0A84FF',
  darkBgColor: '#070B14',
  lightBgColor: '#EEF2F9',
  rescheduledColor: '#38BDF8',
  categoryColorMode: 'classic',
  cwiczeniaColor: '#A855F7',
  wykladColor: '#0EA5E9',
  lektoratColor: '#D97706',
};

export const DEFAULT_LAYOUT_PREFERENCES: LayoutPreferencesConfig = {
  density: 'comfortable',
  cardStyle: 'liquid_glass',
  fontFamily: 'jakarta',
  categoryIndicator: 'bar',
  liveProgressStyle: 'line',
  headerBadgeIcon: '',
  customHeaderTitle: '',
  customHeaderSubtitle: '',
  countdownLabel: '',
  countdownDate: '',
  showHeroCard: true,
  showProgressCard: true,
  showBreaks: true,
  showWalkTimeHints: true,
  showSubjectIcons: true,
  showClassDuration: false,
  showLecturers: true,
  showClassCounters: true,
  showAmbientOrbs: true,
  autoCollapseCompletedDays: true,
};

const STORAGE_SAVED_PALETTES_KEY = 'uek_apple_saved_palettes_v1';

export interface SavedUserPalette {
  id: string;
  name: string;
  createdAt: string;
  colors: CustomColorsConfig;
  layout?: LayoutPreferencesConfig;
}

// Convert hex (#RRGGBB) to RGB { r, g, b }
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = (hex || '#0A84FF').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 10, g: 132, b: 255 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function rgbToHsl(
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rN:
        h = (gN - bN) / d + (gN < bN ? 6 : 0);
        break;
      case gN:
        h = (bN - rN) / d + 2;
        break;
      case bN:
        h = (rN - gN) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const hNorm = ((h % 360) + 360) % 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hNorm >= 0 && hNorm < 60) {
    rPrime = c;
    gPrime = x;
  } else if (hNorm >= 60 && hNorm < 120) {
    rPrime = x;
    gPrime = c;
  } else if (hNorm >= 120 && hNorm < 180) {
    gPrime = c;
    bPrime = x;
  } else if (hNorm >= 180 && hNorm < 240) {
    gPrime = x;
    bPrime = c;
  } else if (hNorm >= 240 && hNorm < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return rgbToHex(
    (rPrime + m) * 255,
    (gPrime + m) * 255,
    (bPrime + m) * 255
  );
}

/**
 * Mixes two hex colors by weightB (0..1)
 */
export function mixHexColors(
  hexA: string,
  hexB: string,
  weightB: number
): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weightB));
  return rgbToHex(
    a.r * (1 - w) + b.r * w,
    a.g * (1 - w) + b.g * w,
    a.b * (1 - w) + b.b * w
  );
}

/**
 * Computes harmonious category colors (Ćwiczenia, Wykład, Lektorat) derived from any accent hex
 */
export function deriveCategoryColorsFromAccent(accentHex: string): {
  cwiczeniaColor: string;
  wykladColor: string;
  lektoratColor: string;
} {
  const { r, g, b } = hexToRgb(accentHex);
  const { h, s } = rgbToHsl(r, g, b);
  const baseSat = Math.min(82, Math.max(58, s));

  const wykladColor = hslToHex(h, baseSat, 54);
  const cwiczeniaColor = hslToHex(
    (h + 38) % 360,
    Math.min(84, baseSat + 6),
    58
  );
  const lektoratColor = hslToHex(
    (h - 42 + 360) % 360,
    Math.min(84, baseSat + 4),
    52
  );

  return {
    cwiczeniaColor,
    wykladColor,
    lektoratColor,
  };
}

export type AccentToneMode = 'balanced' | 'deep' | 'soft';

/**
 * Automatically derives an eye-friendly, harmonious Apple palette from any chosen accent color.
 */
export function deriveHarmonizedColorsFromAccent(
  rawAccentHex: string,
  toneMode: AccentToneMode = 'balanced',
  categoryMode: CategoryColorMode = 'classic'
): CustomColorsConfig {
  const { r, g, b } = hexToRgb(rawAccentHex);
  const { h, s, l } = rgbToHsl(r, g, b);

  let targetS = Math.min(82, Math.max(42, s));
  let targetL = Math.min(60, Math.max(46, l));

  if (toneMode === 'deep') {
    targetS = Math.min(78, Math.max(40, s * 0.92));
    targetL = Math.min(50, Math.max(38, l * 0.85));
  } else if (toneMode === 'soft') {
    targetS = Math.min(66, Math.max(35, s * 0.78));
    targetL = Math.min(63, Math.max(52, l * 1.05));
  }

  const isAlreadyComfortable = l >= 42 && l <= 63 && s <= 90;
  const effectiveAccent =
    toneMode === 'balanced' && isAlreadyComfortable
      ? rawAccentHex.toUpperCase()
      : hslToHex(h, targetS, targetL);

  const darkSat =
    toneMode === 'deep'
      ? Math.min(46, Math.max(22, targetS * 0.52))
      : Math.min(38, Math.max(18, targetS * 0.42));
  const darkLightness =
    toneMode === 'deep' ? 5.5 : toneMode === 'soft' ? 8.5 : 7.0;
  const darkBgColor = hslToHex(h, darkSat, darkLightness);

  const lightSat = Math.min(36, Math.max(14, targetS * 0.35));
  const lightLightness =
    toneMode === 'deep' ? 92.5 : toneMode === 'soft' ? 95.0 : 93.8;
  const lightBgColor = hslToHex(h, lightSat, lightLightness);

  const hueShift = h > 200 && h < 310 ? -36 : 34;
  const rescheduledHue = (h + hueShift + 360) % 360;
  const rescheduledSat = Math.min(80, Math.max(55, targetS * 0.9));
  const rescheduledLight = toneMode === 'deep' ? 54 : 60;
  const rescheduledColor = hslToHex(
    rescheduledHue,
    rescheduledSat,
    rescheduledLight
  );

  const catColors =
    categoryMode === 'accent_harmony'
      ? deriveCategoryColorsFromAccent(effectiveAccent)
      : {
          cwiczeniaColor: '#A855F7',
          wykladColor: '#0EA5E9',
          lektoratColor: '#D97706',
        };

  return {
    accentColor: effectiveAccent,
    darkBgColor,
    lightBgColor,
    rescheduledColor,
    categoryColorMode: categoryMode,
    ...catColors,
  };
}

// Refined, eye-friendly Apple iOS / macOS System Accent Swatches
const APPLE_ACCENT_SWATCHES: Array<{ hex: string; name: string }> = [
  { hex: '#0A84FF', name: 'iOS Blue' },
  { hex: '#5E5CE6', name: 'Indigo Pro' },
  { hex: '#8B5CF6', name: 'Amethyst' },
  { hex: '#BF5AF2', name: 'Cosmic Violet' },
  { hex: '#E11D48', name: 'Apple Rose' },
  { hex: '#F97316', name: 'Coral Sunset' },
  { hex: '#D97706', name: 'Solar Amber' },
  { hex: '#C68B59', name: 'Desert Titanium' },
  { hex: '#10B981', name: 'Alpine Green' },
  { hex: '#0D9488', name: 'Mint Teal' },
  { hex: '#0284C7', name: 'Sierra Sky' },
  { hex: '#64748B', name: 'Natural Titanium' },
];

const DARK_BG_SWATCHES: Array<{ hex: string; name: string }> = [
  { hex: '#070B14', name: 'OLED Midnight' },
  { hex: '#090918', name: 'Indigo Night' },
  { hex: '#0D1017', name: 'Space Black' },
  { hex: '#120A1E', name: 'Cosmic Plum' },
  { hex: '#06130E', name: 'Alpine Night' },
  { hex: '#130F0C', name: 'Titanium Espresso' },
  { hex: '#16080E', name: 'Dark Rose' },
];

const LIGHT_BG_SWATCHES: Array<{ hex: string; name: string }> = [
  { hex: '#EEF2F9', name: 'Apple Cloud' },
  { hex: '#F0EFFA', name: 'Indigo Mist' },
  { hex: '#EBF3FA', name: 'Sierra Mist' },
  { hex: '#F4EFFA', name: 'Soft Lavender' },
  { hex: '#EAF6F0', name: 'Mint Air' },
  { hex: '#F7F2EB', name: 'Warm Sand' },
  { hex: '#F9EEF1', name: 'Blush Silk' },
];

const RESCHEDULED_SWATCHES: Array<{ hex: string; name: string }> = [
  { hex: '#38BDF8', name: 'Sky Cyan' },
  { hex: '#818CF8', name: 'Soft Indigo' },
  { hex: '#2DD4BF', name: 'Aqua Mint' },
  { hex: '#C084FC', name: 'Ultraviolet' },
  { hex: '#F59E0B', name: 'Amber Glow' },
  { hex: '#FB7185', name: 'Soft Coral' },
];

const CATEGORY_SWATCHES: Array<{ hex: string; name: string }> = [
  { hex: '#A855F7', name: 'Fiolet UEK' },
  { hex: '#0EA5E9', name: 'Błękit Wykład' },
  { hex: '#D97706', name: 'Bursztyn Lektorat' },
  { hex: '#10B981', name: 'Szmaragd' },
  { hex: '#EC4899', name: 'Neon Pink' },
  { hex: '#6366F1', name: 'Indigo' },
  { hex: '#14B8A6', name: 'Turkus' },
  { hex: '#F43F5E', name: 'Karmazyn' },
];

export interface AppleThemePreset {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  colors: CustomColorsConfig;
}

export const APPLE_THEME_PRESETS: AppleThemePreset[] = [
  {
    id: 'cupertino-blue',
    name: 'Cupertino Blue',
    subtitle: 'Klasyczny błękit iOS ze stonowanym szafirowym tłem',
    badge: 'Domyślny',
    colors: {
      accentColor: '#0A84FF',
      darkBgColor: '#070B14',
      lightBgColor: '#EEF2F9',
      rescheduledColor: '#38BDF8',
      categoryColorMode: 'classic',
      cwiczeniaColor: '#A855F7',
      wykladColor: '#0EA5E9',
      lektoratColor: '#D97706',
    },
  },
  {
    id: 'midnight-indigo',
    name: 'Indigo Pro',
    subtitle: 'Stonowany indygo i chłodny fiolet przyjazny dla wzroku',
    badge: 'Polecany',
    colors: {
      accentColor: '#5E5CE6',
      darkBgColor: '#090918',
      lightBgColor: '#F0EFFA',
      rescheduledColor: '#818CF8',
      categoryColorMode: 'accent_harmony',
      ...deriveCategoryColorsFromAccent('#5E5CE6'),
    },
  },
  {
    id: 'desert-titanium',
    name: 'Desert Titanium',
    subtitle: 'Ciepłe złoto i piaskowy tytan z serii iPhone Pro',
    badge: 'Pro Titanium',
    colors: {
      accentColor: '#C68B59',
      darkBgColor: '#130F0C',
      lightBgColor: '#F7F2EB',
      rescheduledColor: '#F59E0B',
      categoryColorMode: 'accent_harmony',
      ...deriveCategoryColorsFromAccent('#C68B59'),
    },
  },
  {
    id: 'alpine-emerald',
    name: 'Alpine Emerald',
    subtitle: 'Stonowana szmaragdowa zieleń z leśnym tłem',
    badge: 'Łagodny',
    colors: {
      accentColor: '#10B981',
      darkBgColor: '#06130E',
      lightBgColor: '#EAF6F0',
      rescheduledColor: '#2DD4BF',
      categoryColorMode: 'accent_harmony',
      ...deriveCategoryColorsFromAccent('#10B981'),
    },
  },
  {
    id: 'cosmic-violet',
    name: 'Cosmic Violet',
    subtitle: 'Aksamitny fiolet z miękkim odcieniem lawendy',
    badge: 'Stylowy',
    colors: {
      accentColor: '#8B5CF6',
      darkBgColor: '#11091D',
      lightBgColor: '#F3EFFB',
      rescheduledColor: '#C084FC',
      categoryColorMode: 'accent_harmony',
      ...deriveCategoryColorsFromAccent('#8B5CF6'),
    },
  },
  {
    id: 'sierra-teal',
    name: 'Sierra Ocean',
    subtitle: 'Spokojny morski turkus inspirowany macOS Sequoia',
    badge: 'Spokojny',
    colors: {
      accentColor: '#0D9488',
      darkBgColor: '#061214',
      lightBgColor: '#EAF5F6',
      rescheduledColor: '#38BDF8',
      categoryColorMode: 'accent_harmony',
      ...deriveCategoryColorsFromAccent('#0D9488'),
    },
  },
  {
    id: 'apple-rose',
    name: 'Crimson Rose',
    subtitle: 'Szlachetny malinowy róż z ciepłym grafitem',
    badge: 'Wyrazisty',
    colors: {
      accentColor: '#E11D48',
      darkBgColor: '#15080D',
      lightBgColor: '#F9EEF1',
      rescheduledColor: '#FB7185',
      categoryColorMode: 'accent_harmony',
      ...deriveCategoryColorsFromAccent('#E11D48'),
    },
  },
  {
    id: 'natural-titanium',
    name: 'Natural Titanium',
    subtitle: 'Minimalistyczny stalowy błękit i grafitowy monolit',
    badge: 'Minimal',
    colors: {
      accentColor: '#0284C7',
      darkBgColor: '#090E14',
      lightBgColor: '#EEF3F7',
      rescheduledColor: '#38BDF8',
      categoryColorMode: 'classic',
      cwiczeniaColor: '#A855F7',
      wykladColor: '#0EA5E9',
      lektoratColor: '#D97706',
    },
  },
];

interface AppleAppearanceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  colors: CustomColorsConfig;
  onChangeColors: (next: CustomColorsConfig) => void;
  onResetColors: () => void;
  layoutPrefs: LayoutPreferencesConfig;
  onChangeLayoutPrefs: (next: LayoutPreferencesConfig) => void;
  isDark?: boolean;
}

type DrawerTab = 'auto' | 'presets' | 'layout' | 'manual';

export const AppleAppearanceDrawer: React.FC<AppleAppearanceDrawerProps> = ({
  isOpen,
  onClose,
  colors,
  onChangeColors,
  onResetColors,
  layoutPrefs,
  onChangeLayoutPrefs,
  isDark = true,
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('auto');
  const [toneMode, setToneMode] = useState<AccentToneMode>('balanced');
  const [baseAccentHex, setBaseAccentHex] = useState<string>(
    colors.accentColor
  );
  const [isLivePreviewExpanded, setIsLivePreviewExpanded] =
    useState<boolean>(false);
  const [seeThroughBackdrop, setSeeThroughBackdrop] = useState<boolean>(false);

  // User's saved custom color palettes in localStorage
  const [savedPalettes, setSavedPalettes] = useState<SavedUserPalette[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SAVED_PALETTES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [customSaveName, setCustomSaveName] = useState<string>('');
  const [justSavedToast, setJustSavedToast] = useState<boolean>(false);
  const [shareCodeToast, setShareCodeToast] = useState<string | null>(null);
  const [importCodeOpen, setImportCodeOpen] = useState<boolean>(false);
  const [importCodeInput, setImportCodeInput] = useState<string>('');

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_SAVED_PALETTES_KEY,
        JSON.stringify(savedPalettes)
      );
    } catch {
      // ignore
    }
  }, [savedPalettes]);

  if (!isOpen) return null;

  const activeCategoryMode: CategoryColorMode =
    colors.categoryColorMode || 'classic';

  const handleAutoAccentChange = (
    nextAccent: string,
    mode: AccentToneMode = toneMode,
    catMode: CategoryColorMode = activeCategoryMode
  ) => {
    setBaseAccentHex(nextAccent);
    const harmonized = deriveHarmonizedColorsFromAccent(
      nextAccent,
      mode,
      catMode
    );
    onChangeColors(harmonized);
  };

  const handleToneModeChange = (nextMode: AccentToneMode) => {
    setToneMode(nextMode);
    const harmonized = deriveHarmonizedColorsFromAccent(
      baseAccentHex || colors.accentColor,
      nextMode,
      activeCategoryMode
    );
    onChangeColors(harmonized);
  };

  const handleCategoryColorModeChange = (nextCatMode: CategoryColorMode) => {
    if (nextCatMode === 'accent_harmony') {
      const catColors = deriveCategoryColorsFromAccent(colors.accentColor);
      onChangeColors({
        ...colors,
        categoryColorMode: 'accent_harmony',
        ...catColors,
      });
    } else if (nextCatMode === 'classic') {
      onChangeColors({
        ...colors,
        categoryColorMode: 'classic',
        cwiczeniaColor: '#A855F7',
        wykladColor: '#0EA5E9',
        lektoratColor: '#D97706',
      });
    } else {
      onChangeColors({
        ...colors,
        categoryColorMode: 'custom',
      });
    }
  };

  const handleSaveCurrentPalette = () => {
    const matchedSwatch = APPLE_ACCENT_SWATCHES.find(
      (s) => s.hex.toLowerCase() === colors.accentColor.toLowerCase()
    );
    const defaultName =
      customSaveName.trim() ||
      (matchedSwatch
        ? `${matchedSwatch.name} (${
            toneMode === 'deep'
              ? 'Głęboki'
              : toneMode === 'soft'
              ? 'Łagodny'
              : 'Stonowany'
          })`
        : `Mój styl ${colors.accentColor.toUpperCase()}`);

    const newEntry: SavedUserPalette = {
      id: `saved-${Date.now()}`,
      name: defaultName,
      createdAt: new Date().toLocaleDateString('pl-PL', {
        day: '2-digit',
        month: '2-digit',
      }),
      colors: { ...colors },
      layout: { ...layoutPrefs },
    };

    setSavedPalettes((prev) => [newEntry, ...prev.slice(0, 11)]);
    setCustomSaveName('');
    setJustSavedToast(true);
    window.setTimeout(() => setJustSavedToast(false), 2200);
  };

  const handleDeleteSavedPalette = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSavedPalettes((prev) => prev.filter((p) => p.id !== id));
  };

  const handleCopyShareCode = async () => {
    try {
      const payload = {
        v: 1,
        colors,
        layout: layoutPrefs,
      };
      const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
      await navigator.clipboard.writeText(encoded);
      setShareCodeToast('Skopiowano kod stylu!');
      window.setTimeout(() => setShareCodeToast(null), 2500);
    } catch {
      setShareCodeToast('Nie udało się skopiować');
      window.setTimeout(() => setShareCodeToast(null), 2500);
    }
  };

  const handleApplyImportedCode = () => {
    const trimmed = importCodeInput.trim();
    if (!trimmed) return;
    try {
      const jsonStr = decodeURIComponent(atob(trimmed));
      const parsed = JSON.parse(jsonStr);
      if (parsed && parsed.colors && parsed.colors.accentColor) {
        onChangeColors({
          ...DEFAULT_CUSTOM_COLORS,
          ...parsed.colors,
        });
        if (parsed.layout) {
          onChangeLayoutPrefs({
            ...DEFAULT_LAYOUT_PREFERENCES,
            ...parsed.layout,
          });
        }
        setImportCodeInput('');
        setImportCodeOpen(false);
        setShareCodeToast('Wczytano styl znajomego!');
        window.setTimeout(() => setShareCodeToast(null), 2500);
      } else {
        setShareCodeToast('Nieprawidłowy kod stylu');
        window.setTimeout(() => setShareCodeToast(null), 2500);
      }
    } catch {
      setShareCodeToast('Błędny format kodu stylu');
      window.setTimeout(() => setShareCodeToast(null), 2500);
    }
  };

  const updateLayout = (partial: Partial<LayoutPreferencesConfig>) => {
    onChangeLayoutPrefs({
      ...layoutPrefs,
      ...partial,
    });
  };

  // Subtle Apple depth swatch helper
  const renderLiquidSwatch = (
    hex: string,
    label: string,
    active: boolean,
    onClick: () => void,
    isLightSwatch = false
  ) => (
    <button
      key={hex}
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        backgroundColor: hex,
        boxShadow: active
          ? `inset 0 1px 0 rgba(255,255,255,0.35), 0 0 0 2px ${
              isDark ? '#161922' : '#FFFFFF'
            }, 0 0 0 4px ${
              isDark ? '#FFFFFF' : '#0F172A'
            }, 0 4px 10px -2px ${hex}70`
          : `inset 0 1px 0 rgba(255,255,255,${
              isLightSwatch ? '0.8' : '0.25'
            }), 0 2px 5px rgba(0,0,0,0.18)`,
      }}
      className={`w-7.5 h-7.5 rounded-full transition-all duration-200 ${
        isLightSwatch ? 'border border-slate-300/80' : 'border border-white/15'
      } ${active ? 'scale-110 z-10' : 'hover:scale-105 opacity-90 hover:opacity-100'}`}
    />
  );

  // Mobile-friendly 3-option selector helper with optional inline visual preview
  const renderResponsiveOptionCards = <T extends string>(
    options: ReadonlyArray<{
      id: T;
      label: string;
      desc: string;
      preview?: React.ReactNode;
      sampleFont?: string;
    }>,
    currentValue: T,
    onSelect: (id: T) => void
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {options.map((opt) => {
        const active = currentValue === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            style={{
              ...(active
                ? {
                    borderColor: colors.accentColor,
                    backgroundColor: `${colors.accentColor}1E`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 12px -4px ${colors.accentColor}45`,
                  }
                : undefined),
              ...(opt.sampleFont ? { fontFamily: opt.sampleFont } : undefined),
            }}
            className={`min-w-0 px-3 py-2.5 rounded-xl border text-left transition-all flex sm:flex-col items-center sm:items-stretch justify-between gap-2.5 ${
              active
                ? ''
                : isDark
                ? 'bg-black/25 border-white/8 hover:bg-white/5'
                : 'bg-slate-50 border-slate-200/70 hover:bg-white'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <p className="text-xs sm:text-[11px] font-bold truncate">
                  {opt.label}
                </p>
                {active && (
                  <span
                    style={{ backgroundColor: colors.accentColor }}
                    className="w-4 h-4 sm:w-3.5 sm:h-3.5 rounded-full text-white flex items-center justify-center shrink-0"
                  >
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                )}
              </div>
              <p
                className={`text-[11px] sm:text-[10px] mt-0.5 truncate ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                {opt.desc}
              </p>
            </div>

            {opt.preview && (
              <div className="shrink-0 sm:mt-1.5">{opt.preview}</div>
            )}
          </button>
        );
      })}
    </div>
  );

  // iOS-style toggle switch helper with optional live mini-preview snippet
  const renderToggleRow = (
    title: string,
    subtitle: string,
    checked: boolean,
    onChange: (next: boolean) => void,
    badge?: string,
    previewSnippet?: React.ReactNode
  ) => (
    <div
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      style={
        checked
          ? {
              borderColor: `${colors.accentColor}40`,
            }
          : undefined
      }
      className={`flex items-center justify-between gap-3 p-3 rounded-2xl border cursor-pointer select-none transition-all ${
        isDark
          ? checked
            ? 'bg-white/[0.045] hover:bg-white/[0.065]'
            : 'bg-white/[0.02] border-white/8 hover:bg-white/[0.04]'
          : checked
          ? 'bg-white border-slate-200 shadow-2xs'
          : 'bg-white/65 border-slate-200/70 hover:bg-white'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold leading-snug">{title}</span>
          {badge && (
            <span
              style={{
                backgroundColor: `${colors.accentColor}22`,
                color: colors.accentColor,
              }}
              className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 whitespace-nowrap"
            >
              {badge}
            </span>
          )}
        </div>
        <p
          className={`text-[11px] mt-0.5 leading-snug ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}
        >
          {subtitle}
        </p>
        {previewSnippet && (
          <div
            className={`mt-2 transition-opacity duration-200 ${
              checked ? 'opacity-100' : 'opacity-40 grayscale'
            }`}
          >
            {previewSnippet}
          </div>
        )}
      </div>

      <div
        style={{
          backgroundColor: checked
            ? colors.accentColor
            : isDark
            ? 'rgba(255,255,255,0.14)'
            : 'rgba(15,23,42,0.15)',
        }}
        className="w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center"
      >
        <span
          className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
    </div>
  );

  // Live Preview Computed Styles — distinct visual feedback for density, cardStyle, categoryIndicator, and font
  const previewBg = isDark ? colors.darkBgColor : colors.lightBgColor;
  const previewCardBg =
    layoutPrefs.cardStyle === 'matte_minimal'
      ? isDark
        ? mixHexColors(colors.darkBgColor, '#1E2330', 0.55)
        : mixHexColors('#FFFFFF', colors.lightBgColor, 0.15)
      : isDark
      ? `${mixHexColors(colors.darkBgColor, '#1D2230', 0.44)}F0`
      : `${mixHexColors('#FFFFFF', colors.lightBgColor, 0.32)}F5`;
  const previewBreakBg = isDark
    ? `${mixHexColors(colors.darkBgColor, colors.accentColor, 0.08)}95`
    : mixHexColors(colors.lightBgColor, '#FFFFFF', 0.45);
  const previewRadius =
    layoutPrefs.cardStyle === 'sharp_pro'
      ? 'rounded-[8px]'
      : layoutPrefs.cardStyle === 'matte_minimal'
      ? 'rounded-[16px]'
      : 'rounded-[22px]';
  const previewRowPad =
    layoutPrefs.density === 'compact'
      ? 'py-1 px-2.5'
      : layoutPrefs.density === 'spacious'
      ? 'py-3.5 px-4'
      : 'py-2 px-3';
  const previewFont =
    layoutPrefs.fontFamily === 'mono'
      ? "'JetBrains Mono', monospace"
      : layoutPrefs.fontFamily === 'sf_system'
      ? "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif"
      : "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

  const cwiczeniaHex = colors.cwiczeniaColor || '#A855F7';
  const wykladHex = colors.wykladColor || '#0EA5E9';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 transition-all duration-200 ${
        seeThroughBackdrop
          ? 'bg-black/10 backdrop-blur-[1px]'
          : 'bg-black/60 backdrop-blur-md'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-colors-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: isDark
            ? mixHexColors(colors.darkBgColor, '#181C26', 0.65)
            : mixHexColors(colors.lightBgColor, '#FFFFFF', 0.75),
          boxShadow: isDark
            ? `inset 0 1px 0 rgba(255,255,255,0.12), 0 24px 60px rgba(0,0,0,0.65), 0 0 40px -12px ${colors.accentColor}30`
            : 'inset 0 1px 1px rgba(255,255,255,0.9), 0 24px 60px rgba(15,23,42,0.16)',
        }}
        className={`w-full max-w-[600px] ${
          seeThroughBackdrop
            ? 'max-h-[76dvh] sm:max-h-[78vh]'
            : 'max-h-[92dvh] sm:max-h-[90vh]'
        } flex flex-col rounded-[26px] sm:rounded-[30px] p-4 sm:p-5 border transition-colors ${
          isDark
            ? 'border-white/12 text-[#F5F5F7]'
            : 'border-slate-200/90 text-[#1D1D1F]'
        }`}
      >
        {/* Compact Mobile-First Header — Zero overlapping pills */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Live "13" Day Orb right next to title */}
            <div
              style={{
                background: `linear-gradient(175deg, ${mixHexColors(
                  colors.accentColor,
                  '#FFFFFF',
                  0.12
                )} 0%, ${colors.accentColor} 55%, ${mixHexColors(
                  colors.accentColor,
                  '#000000',
                  0.16
                )} 100%)`,
                boxShadow: `inset 0 1px 0.5px rgba(255, 255, 255, 0.32), inset 0 -1px 1.5px rgba(0, 0, 0, 0.2), 0 4px 10px -2px ${colors.accentColor}55`,
              }}
              className="w-8.5 h-8.5 rounded-full text-white font-bold text-xs flex items-center justify-center tabular-nums shrink-0 border border-white/15"
              title="Podgląd kółka dnia"
            >
              13
            </div>

            <div className="min-w-0">
              <h2
                id="custom-colors-title"
                className="text-base sm:text-lg font-bold tracking-tight truncate leading-tight"
              >
                Personalizacja planu
              </h2>
              <p
                className={`text-[11px] truncate ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Kolory, motywy Apple i układ widoku
              </p>
            </div>
          </div>

          {/* Right Compact Action Pills: "Prześwit tła" + "Podgląd" */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setSeeThroughBackdrop(!seeThroughBackdrop)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                seeThroughBackdrop
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                  : isDark
                  ? 'bg-white/6 border-white/12 text-slate-300 hover:bg-white/12'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
              title="Przełącz przezroczystość tła, aby widzieć pełny plan pod oknem"
            >
              {seeThroughBackdrop ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 shrink-0" />
                  <span>Tło</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 shrink-0" />
                  <span>Tło</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsLivePreviewExpanded(!isLivePreviewExpanded)}
              style={{
                borderColor: isLivePreviewExpanded
                  ? `${colors.accentColor}65`
                  : undefined,
                backgroundColor: isLivePreviewExpanded
                  ? `${colors.accentColor}20`
                  : undefined,
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border shrink-0 whitespace-nowrap transition-all ${
                isLivePreviewExpanded
                  ? ''
                  : isDark
                  ? 'bg-white/6 border-white/12 text-slate-300 hover:bg-white/12'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Sparkles
                style={{ color: colors.accentColor }}
                className="w-3 h-3 shrink-0"
              />
              <span>Podgląd</span>
              {isLivePreviewExpanded ? (
                <ChevronDown className="w-3 h-3 opacity-75 shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 opacity-75 shrink-0" />
              )}
            </button>
          </div>
        </div>

        {/* ULTRA-COMPACT 1-ROW LIVE PREVIEW (Only shown when toggled on, takes minimal height on mobile!) */}
        {isLivePreviewExpanded && (
          <div
            style={{
              backgroundColor: previewBg,
              fontFamily: previewFont,
            }}
            className={`mt-2 p-2 rounded-2xl border relative overflow-hidden transition-all duration-200 shrink-0 ${
              isDark
                ? 'border-white/12 text-[#F5F5F7]'
                : 'border-slate-300/80 text-[#1D1D1F]'
            }`}
          >
            {/* Compact 1-Card Sample */}
            <div
              style={{ backgroundColor: previewCardBg }}
              className={`relative z-10 ${previewRadius} border overflow-hidden transition-all ${
                isDark
                  ? 'border-white/10 shadow-sm'
                  : 'border-white shadow-2xs'
              }`}
            >
              <div className={`${previewRowPad} flex items-stretch gap-2`}>
                <div className="w-9 shrink-0 text-right tabular-nums">
                  <p className="text-[10px] font-bold leading-tight">09:45</p>
                  <p
                    className={`text-[9px] leading-tight ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    11:15
                  </p>
                  {layoutPrefs.showClassDuration && (
                    <p
                      style={{ color: cwiczeniaHex }}
                      className="text-[8px] font-bold leading-tight"
                    >
                      90m
                    </p>
                  )}
                </div>

                {layoutPrefs.categoryIndicator === 'pill_dot' ? (
                  <div className="flex flex-col items-center pt-1 shrink-0">
                    <span
                      style={{
                        backgroundColor: cwiczeniaHex,
                        boxShadow: `0 0 6px ${cwiczeniaHex}85`,
                      }}
                      className="w-2 h-2 rounded-full"
                    />
                    <span
                      style={{ backgroundColor: `${cwiczeniaHex}30` }}
                      className="w-0.5 flex-1 rounded-full mt-0.5"
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      backgroundColor: cwiczeniaHex,
                      boxShadow:
                        layoutPrefs.categoryIndicator === 'glow_bar'
                          ? `0 0 8px ${cwiczeniaHex}90`
                          : undefined,
                    }}
                    className="w-1 rounded-full shrink-0"
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[11px] font-bold truncate">
                      {layoutPrefs.showSubjectIcons && (
                        <span className="mr-1">📊</span>
                      )}
                      Rachunkowość finansowa
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        style={{
                          color: isDark
                            ? colors.rescheduledColor
                            : mixHexColors(
                                colors.rescheduledColor,
                                '#0F172A',
                                0.28
                              ),
                        }}
                        className="text-[9px] font-bold whitespace-nowrap"
                      >
                        na 25.10
                      </span>
                      {layoutPrefs.showClassCounters && (
                        <span
                          style={{
                            backgroundColor: isDark
                              ? `${cwiczeniaHex}28`
                              : mixHexColors(cwiczeniaHex, '#FFFFFF', 0.85),
                            borderColor: `${cwiczeniaHex}55`,
                            color: isDark
                              ? mixHexColors(cwiczeniaHex, '#FFFFFF', 0.45)
                              : mixHexColors(cwiczeniaHex, '#0F172A', 0.35),
                          }}
                          className="px-1.5 py-0.2 rounded-full text-[8px] font-semibold border whitespace-nowrap"
                        >
                          Ćw. 2/6
                        </span>
                      )}
                    </div>
                  </div>
                  <p
                    className={`text-[9px] truncate flex items-center gap-1 ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    <MapPin className="w-2.5 h-2.5 text-sky-400 shrink-0" />
                    <span className="text-sky-400 font-medium">Paw.A 118</span>
                    {layoutPrefs.showLecturers && (
                      <span>· dr hab. J. Kowalski</span>
                    )}
                  </p>
                  {/* Mini live progress preview inside compact card */}
                  <div className="mt-1.5">
                    {(layoutPrefs.liveProgressStyle || 'line') === 'line' && (
                      <div
                        className={`h-1 w-full rounded-full overflow-hidden ${
                          isDark ? 'bg-white/10' : 'bg-slate-200/80'
                        }`}
                      >
                        <div
                          style={{
                            width: '55%',
                            backgroundColor: colors.accentColor,
                            boxShadow: `0 0 8px ${colors.accentColor}80`,
                          }}
                          className="h-full rounded-full transition-all"
                        />
                      </div>
                    )}
                    {layoutPrefs.liveProgressStyle === 'dots' && (
                      <div className="grid grid-cols-12 gap-1 items-center">
                        {Array.from({ length: 12 }).map((_, dotIdx) => {
                          const isDone = dotIdx < 6;
                          const isCurrent = dotIdx === 6;
                          return (
                            <span
                              key={dotIdx}
                              style={
                                isDone || isCurrent
                                  ? {
                                      backgroundColor: colors.accentColor,
                                      boxShadow: isCurrent
                                        ? `0 0 6px ${colors.accentColor}`
                                        : undefined,
                                    }
                                  : undefined
                              }
                              className={`h-1.5 rounded-full transition-all ${
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
                        })}
                      </div>
                    )}
                    {layoutPrefs.liveProgressStyle === 'timeline_orb' && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[8px] font-bold tabular-nums opacity-65">
                          09:45
                        </span>
                        <div
                          className={`relative flex-1 h-1 rounded-full ${
                            isDark ? 'bg-white/12' : 'bg-slate-200/90'
                          }`}
                        >
                          <div
                            style={{
                              width: '55%',
                              backgroundColor: colors.accentColor,
                            }}
                            className="h-full rounded-full"
                          />
                          <span
                            style={{
                              left: '55%',
                              backgroundColor: colors.accentColor,
                              boxShadow: `0 0 8px ${colors.accentColor}`,
                            }}
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 px-1 py-0.2 rounded-full text-[7px] font-bold text-white leading-tight tabular-nums shadow"
                          >
                            55%
                          </span>
                        </div>
                        <span className="text-[8px] font-bold tabular-nums opacity-65">
                          11:15
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {layoutPrefs.showBreaks && (
                <div
                  style={{ backgroundColor: previewBreakBg }}
                  className={`py-0.5 px-2 text-[9px] border-t flex items-center justify-center gap-1 tabular-nums truncate ${
                    isDark
                      ? 'border-white/6 text-slate-400'
                      : 'border-slate-200/70 text-slate-600'
                  }`}
                >
                  <span>przerwa 15 min</span>
                  {layoutPrefs.showWalkTimeHints && (
                    <span
                      style={{
                        color: isDark
                          ? mixHexColors(colors.accentColor, '#FFFFFF', 0.35)
                          : mixHexColors(colors.accentColor, '#000000', 0.2),
                      }}
                      className="font-semibold truncate"
                    >
                      · 🚶 Paw. A → Paw. F (~4 min)
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4-Tab Segmented Switcher */}
        <div
          className={`mt-3 p-1 rounded-2xl grid grid-cols-4 gap-1 border shrink-0 ${
            isDark
              ? 'bg-black/30 border-white/10'
              : 'bg-black/5 border-slate-200/80'
          }`}
        >
          {(
            [
              { id: 'auto', label: 'Auto-Akcent', Icon: Wand2 },
              { id: 'presets', label: 'Motywy', Icon: Palette },
              { id: 'layout', label: 'Układ i opcje', Icon: LayoutGrid },
              { id: 'manual', label: 'Ręcznie', Icon: Sliders },
            ] as const
          ).map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                style={
                  isActive
                    ? {
                        background: `linear-gradient(180deg, ${mixHexColors(
                          colors.accentColor,
                          '#FFFFFF',
                          0.1
                        )}, ${colors.accentColor})`,
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.3), 0 3px 10px ${colors.accentColor}45`,
                      }
                    : undefined
                }
                className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 py-1.5 sm:py-2 px-1 rounded-xl text-[10px] sm:text-xs font-semibold transition-all min-w-0 ${
                  isActive
                    ? 'text-white'
                    : isDark
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-full leading-tight">
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab Body (Scrollable) */}
        <div className="mt-3 flex-1 overflow-y-auto gpu-scroll-container pr-0.5 sm:pr-1 space-y-3.5">
          {/* TAB 1: AUTO-AKCENT */}
          {activeTab === 'auto' && (
            <div className="space-y-3.5">
              <div
                className={`p-3.5 sm:p-4 rounded-2xl border ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10'
                    : 'bg-white/70 border-slate-200/80'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold">
                      1. Wybierz kolor akcentu (np. Indigo Pro)
                    </h3>
                    <p
                      className={`text-[11px] sm:text-xs mt-0.5 ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      Aplikacja sama dobierze stonowane tło (ciemne i jasne),
                      odcień kart oraz kolor zajęć przeniesionych.
                    </p>
                  </div>

                  <label
                    title="Wybierz dowolny kolor z próbnika — zostanie automatycznie stonowany"
                    className={`relative w-11 h-8 sm:w-12 sm:h-9 rounded-xl border overflow-hidden cursor-pointer shrink-0 shadow-sm ${
                      isDark ? 'border-white/30' : 'border-slate-300'
                    }`}
                  >
                    <input
                      type="color"
                      value={colors.accentColor}
                      onChange={(e) =>
                        handleAutoAccentChange(e.target.value, toneMode)
                      }
                      className="sr-only"
                    />
                    <span
                      style={{ backgroundColor: colors.accentColor }}
                      className="block w-full h-full"
                    />
                  </label>
                </div>

                {/* Apple Swatches Grid */}
                <div className="mt-3.5 grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-2.5 place-items-center">
                  {APPLE_ACCENT_SWATCHES.map((swatch) => {
                    const isActive =
                      baseAccentHex.toLowerCase() ===
                        swatch.hex.toLowerCase() ||
                      colors.accentColor.toLowerCase() ===
                        swatch.hex.toLowerCase();
                    return (
                      <button
                        key={swatch.hex}
                        type="button"
                        onClick={() =>
                          handleAutoAccentChange(swatch.hex, toneMode)
                        }
                        className="group flex flex-col items-center gap-1 w-full min-w-0"
                      >
                        <div
                          style={{
                            background: `linear-gradient(175deg, ${mixHexColors(
                              swatch.hex,
                              '#FFFFFF',
                              0.12
                            )} 0%, ${swatch.hex} 55%, ${mixHexColors(
                              swatch.hex,
                              '#000000',
                              0.15
                            )} 100%)`,
                            boxShadow: isActive
                              ? `inset 0 1px 0 rgba(255,255,255,0.35), 0 0 0 2px ${
                                  isDark ? '#141821' : '#FFFFFF'
                                }, 0 0 0 4px ${swatch.hex}, 0 4px 12px -2px ${
                                  swatch.hex
                                }75`
                              : 'inset 0 1px 0 rgba(255,255,255,0.28), 0 2px 6px rgba(0,0,0,0.2)',
                          }}
                          className={`w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-full transition-all duration-200 flex items-center justify-center border border-white/15 ${
                            isActive
                              ? 'scale-110'
                              : 'group-hover:scale-105 opacity-90 group-hover:opacity-100'
                          }`}
                        >
                          {isActive && (
                            <Check className="w-4 h-4 text-white drop-shadow-xs" />
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-medium text-center leading-tight truncate max-w-full ${
                            isActive
                              ? isDark
                                ? 'text-white font-bold'
                                : 'text-slate-900 font-bold'
                              : isDark
                              ? 'text-slate-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {swatch.name}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 2. Tone Intensity Selector */}
                <div
                  className={`mt-3.5 pt-3 border-t space-y-2 ${
                    isDark ? 'border-white/8' : 'border-slate-200/70'
                  }`}
                >
                  <span
                    className={`text-xs font-semibold block ${
                      isDark ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    2. Charakter odcienia i tła:
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'balanced', label: 'Stonowany', sub: 'Optymalny' },
                        { id: 'deep', label: 'Głęboki', sub: 'Ciemniejszy' },
                        { id: 'soft', label: 'Łagodny', sub: 'Pastelowy' },
                      ] as const
                    ).map((opt) => {
                      const active = toneMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleToneModeChange(opt.id)}
                          style={
                            active
                              ? {
                                  backgroundColor: `${colors.accentColor}25`,
                                  borderColor: colors.accentColor,
                                  color: isDark
                                    ? '#FFFFFF'
                                    : mixHexColors(
                                        colors.accentColor,
                                        '#000000',
                                        0.25
                                      ),
                                }
                              : undefined
                          }
                          className={`px-2 py-1.5 rounded-xl text-center border transition-all min-w-0 ${
                            active
                              ? ''
                              : isDark
                              ? 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                              : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <p className="text-[11px] font-bold truncate">
                            {opt.label}
                          </p>
                          <p className="text-[9px] opacity-75 truncate">
                            {opt.sub}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Harmonizacja kolorów kategorii zajęć */}
                <div
                  className={`mt-3.5 pt-3 border-t space-y-2 ${
                    isDark ? 'border-white/8' : 'border-slate-200/70'
                  }`}
                >
                  <span
                    className={`text-xs font-semibold block ${
                      isDark ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    3. Kolory kategorii zajęć (Ćwiczenia, Wykład, Lektorat):
                  </span>
                  {renderResponsiveOptionCards(
                    [
                      {
                        id: 'classic',
                        label: 'Klasyczny UEK',
                        desc: 'Fiolet · Błękit · Bursztyn',
                      },
                      {
                        id: 'accent_harmony',
                        label: 'Pod kolor akcentu',
                        desc: 'Spójne z motywem',
                      },
                      {
                        id: 'custom',
                        label: 'Własne (w Ręcznie)',
                        desc: 'Dowolne kolory',
                      },
                    ] as const,
                    activeCategoryMode,
                    (mode) => handleCategoryColorModeChange(mode)
                  )}
                </div>
              </div>

              {/* Harmonized Auto-Generated Palette Breakdown */}
              <div
                className={`p-3.5 rounded-2xl border ${
                  isDark
                    ? 'bg-black/25 border-white/10'
                    : 'bg-white/80 border-slate-200/80'
                }`}
              >
                <p
                  className={`text-[10px] font-semibold uppercase tracking-wider mb-2.5 ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Automatycznie dopasowane kolory (nie rażą w oczy):
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Akcent', hex: colors.accentColor, light: false },
                    {
                      label: 'Tło ciemne',
                      hex: colors.darkBgColor,
                      light: false,
                    },
                    {
                      label: 'Tło jasne',
                      hex: colors.lightBgColor,
                      light: true,
                    },
                    {
                      label: 'Przeniesione',
                      hex: colors.rescheduledColor,
                      light: false,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className={`p-2 rounded-xl border flex items-center gap-2 min-w-0 ${
                        isDark
                          ? 'bg-white/[0.03] border-white/8'
                          : 'bg-slate-50 border-slate-200/70'
                      }`}
                    >
                      <span
                        style={{ backgroundColor: item.hex }}
                        className={`w-5 h-5 rounded-full shrink-0 border shadow-xs ${
                          item.light ? 'border-slate-300' : 'border-white/25'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold truncate">
                          {item.label}
                        </p>
                        <p className="text-[10px] font-mono opacity-65 truncate">
                          {item.hex}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GOTOWE MOTYWY APPLE */}
          {activeTab === 'presets' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              {APPLE_THEME_PRESETS.map((preset) => {
                const isSelected =
                  colors.accentColor.toLowerCase() ===
                    preset.colors.accentColor.toLowerCase() &&
                  colors.darkBgColor.toLowerCase() ===
                    preset.colors.darkBgColor.toLowerCase();

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setBaseAccentHex(preset.colors.accentColor);
                      onChangeColors(preset.colors);
                    }}
                    style={
                      isSelected
                        ? {
                            borderColor: preset.colors.accentColor,
                            boxShadow: `inset 0 1px 1px rgba(255,255,255,0.2), 0 6px 18px -6px ${preset.colors.accentColor}50`,
                          }
                        : undefined
                    }
                    className={`group text-left p-3.5 rounded-2xl border transition-all relative overflow-hidden ${
                      isSelected
                        ? isDark
                          ? 'bg-white/[0.07]'
                          : 'bg-white'
                        : isDark
                        ? 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'
                        : 'bg-white/70 border-slate-200/80 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold tracking-tight truncate">
                        {preset.name}
                      </span>
                      <span
                        style={{
                          backgroundColor: `${preset.colors.accentColor}22`,
                          color: preset.colors.accentColor,
                        }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 whitespace-nowrap"
                      >
                        {preset.badge}
                      </span>
                    </div>

                    <p
                      className={`text-[11px] mt-1 line-clamp-2 ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {preset.subtitle}
                    </p>

                    {/* 4-Color Swatch Bar */}
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center -space-x-1.5">
                        <span
                          style={{ backgroundColor: preset.colors.accentColor }}
                          className="w-6 h-6 rounded-full border-2 border-[#141821] shadow-xs"
                          title="Akcent"
                        />
                        <span
                          style={{ backgroundColor: preset.colors.darkBgColor }}
                          className="w-6 h-6 rounded-full border-2 border-[#141821] shadow-xs"
                          title="Ciemne tło"
                        />
                        <span
                          style={{
                            backgroundColor: preset.colors.lightBgColor,
                          }}
                          className="w-6 h-6 rounded-full border-2 border-slate-300 shadow-xs"
                          title="Jasne tło"
                        />
                        <span
                          style={{
                            backgroundColor: preset.colors.rescheduledColor,
                          }}
                          className="w-6 h-6 rounded-full border-2 border-[#141821] shadow-xs"
                          title="Zajęcia przeniesione"
                        />
                      </div>

                      {isSelected && (
                        <span
                          style={{ backgroundColor: preset.colors.accentColor }}
                          className="w-5 h-5 rounded-full text-white flex items-center justify-center shadow-xs"
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* TAB 3: UKŁAD I FUNKCJE */}
          {activeTab === 'layout' && (
            <div className="space-y-3.5">
              {/* 1. Własny podpis nagłówka + Ikona odznaki */}
              <div
                className={`p-3.5 rounded-2xl border space-y-2.5 ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10'
                    : 'bg-white/75 border-slate-200/80'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">
                    Własny tytuł, ikona i podpis planu
                  </span>
                  {(layoutPrefs.customHeaderTitle ||
                    layoutPrefs.customHeaderSubtitle ||
                    layoutPrefs.headerBadgeIcon) && (
                    <button
                      type="button"
                      onClick={() =>
                        updateLayout({
                          customHeaderTitle: '',
                          customHeaderSubtitle: '',
                          headerBadgeIcon: '',
                        })
                      }
                      className="text-[11px] text-rose-400 hover:underline shrink-0 whitespace-nowrap"
                    >
                      Przywróć domyślny
                    </button>
                  )}
                </div>

                {/* Header Badge Icon Selector */}
                <div>
                  <span
                    className={`text-[11px] block mb-1.5 ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Ikona obok tytułu w górnym pasku:
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { icon: '', label: 'Brak' },
                      { icon: '🎓', label: '🎓' },
                      { icon: '💻', label: '💻' },
                      { icon: '📊', label: '📊' },
                      { icon: '🏛️', label: '🏛️' },
                      { icon: '⚡', label: '⚡' },
                      { icon: '🚀', label: '🚀' },
                      { icon: '☕', label: '☕' },
                      { icon: '✨', label: '✨' },
                    ].map((b) => {
                      const active =
                        (layoutPrefs.headerBadgeIcon || '') === b.icon;
                      return (
                        <button
                          key={b.label}
                          type="button"
                          onClick={() =>
                            updateLayout({ headerBadgeIcon: b.icon })
                          }
                          style={
                            active
                              ? {
                                  borderColor: colors.accentColor,
                                  backgroundColor: `${colors.accentColor}22`,
                                }
                              : undefined
                          }
                          className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap ${
                            active
                              ? ''
                              : isDark
                              ? 'bg-black/25 border-white/10 text-slate-300 hover:bg-white/10'
                              : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-white'
                          }`}
                        >
                          {b.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={layoutPrefs.customHeaderTitle}
                    onChange={(e) =>
                      updateLayout({ customHeaderTitle: e.target.value })
                    }
                    placeholder="Tytuł (np. Plan zajęć / FiR)"
                    maxLength={36}
                    className={`px-3 py-2 rounded-xl text-xs border outline-none ${
                      isDark
                        ? 'bg-black/30 border-white/12 text-white placeholder:text-slate-500 focus:border-white/30'
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-400'
                    }`}
                  />
                  <input
                    type="text"
                    value={layoutPrefs.customHeaderSubtitle}
                    onChange={(e) =>
                      updateLayout({ customHeaderSubtitle: e.target.value })
                    }
                    placeholder="Podtytuł (np. Semestr zimowy · UEK)"
                    maxLength={48}
                    className={`px-3 py-2 rounded-xl text-xs border outline-none ${
                      isDark
                        ? 'bg-black/30 border-white/12 text-white placeholder:text-slate-500 focus:border-white/30'
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-400'
                    }`}
                  />
                </div>

                {/* Quick Title Chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {[
                    'Plan zajęć',
                    'Informatyka Stosowana',
                    'Finanse i Rachunkowość',
                    'Zarządzanie UEK',
                    'Mój Harmonogram',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => updateLayout({ customHeaderTitle: chip })}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors whitespace-nowrap ${
                        layoutPrefs.customHeaderTitle === chip
                          ? isDark
                            ? 'bg-white/15 border-white/30 text-white font-semibold'
                            : 'bg-slate-200 border-slate-300 text-slate-900 font-semibold'
                          : isDark
                          ? 'bg-white/5 border-white/8 text-slate-400 hover:text-white'
                          : 'bg-slate-100 border-slate-200/70 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Własne odliczanie (np. do sesji, kolokwium, końca semestru) */}
              <div
                className={`p-3.5 rounded-2xl border space-y-2.5 ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10'
                    : 'bg-white/75 border-slate-200/80'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CalendarClock
                      style={{ color: colors.accentColor }}
                      className="w-4 h-4 shrink-0"
                    />
                    <span className="text-xs font-bold truncate">
                      Własny licznik dni (np. do sesji / kolokwium)
                    </span>
                  </div>
                  {(layoutPrefs.countdownLabel || layoutPrefs.countdownDate) && (
                    <button
                      type="button"
                      onClick={() =>
                        updateLayout({ countdownLabel: '', countdownDate: '' })
                      }
                      className="text-[11px] text-rose-400 hover:underline shrink-0 whitespace-nowrap"
                    >
                      Wyłącz licznik
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={layoutPrefs.countdownLabel || ''}
                    onChange={(e) =>
                      updateLayout({ countdownLabel: e.target.value })
                    }
                    placeholder="Nazwa (np. Sesja egzaminacyjna 🎯)"
                    maxLength={34}
                    className={`px-3 py-2 rounded-xl text-xs border outline-none ${
                      isDark
                        ? 'bg-black/30 border-white/12 text-white placeholder:text-slate-500 focus:border-white/30'
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-400'
                    }`}
                  />
                  <input
                    type="date"
                    value={layoutPrefs.countdownDate || ''}
                    onChange={(e) =>
                      updateLayout({ countdownDate: e.target.value })
                    }
                    className={`px-3 py-2 rounded-xl text-xs border outline-none ${
                      isDark
                        ? 'bg-black/30 border-white/12 text-white focus:border-white/30'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-slate-400'
                    }`}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    {
                      label: 'Sesja zimowa 📝',
                      date: '2027-01-25',
                    },
                    {
                      label: 'Kolokwium zaliczeniowe 📊',
                      date: '2026-12-12',
                    },
                    {
                      label: 'Przerwa świąteczna 🎄',
                      date: '2026-12-23',
                    },
                    {
                      label: 'Koniec semestru 🎉',
                      date: '2027-02-14',
                    },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        updateLayout({
                          countdownLabel: preset.label,
                          countdownDate: preset.date,
                        })
                      }
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors whitespace-nowrap ${
                        layoutPrefs.countdownLabel === preset.label
                          ? isDark
                            ? 'bg-white/15 border-white/30 text-white font-semibold'
                            : 'bg-slate-200 border-slate-300 text-slate-900 font-semibold'
                          : isDark
                          ? 'bg-white/5 border-white/8 text-slate-400 hover:text-white'
                          : 'bg-slate-100 border-slate-200/70 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Gęstość kart + Styl obramowań + Krój czcionki + Styl paska kategorii */}
              <div
                className={`p-3.5 rounded-2xl border space-y-3.5 ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10'
                    : 'bg-white/75 border-slate-200/80'
                }`}
              >
                <div>
                  <span className="text-xs font-bold block mb-1.5">
                    Gęstość widoku zajęć
                  </span>
                  {renderResponsiveOptionCards(
                    [
                      {
                        id: 'compact',
                        label: 'Kompaktowy',
                        desc: 'Więcej na ekranie',
                        preview: (
                          <div
                            className={`p-1.5 rounded-lg border space-y-1 ${
                              isDark
                                ? 'bg-black/30 border-white/10'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span
                                style={{ backgroundColor: cwiczeniaHex }}
                                className="w-1 h-2.5 rounded-full shrink-0"
                              />
                              <span
                                className={`h-1.5 w-12 rounded-full ${
                                  isDark ? 'bg-white/60' : 'bg-slate-600'
                                }`}
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span
                                style={{ backgroundColor: wykladHex }}
                                className="w-1 h-2.5 rounded-full shrink-0"
                              />
                              <span
                                className={`h-1.5 w-10 rounded-full ${
                                  isDark ? 'bg-white/40' : 'bg-slate-400'
                                }`}
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span
                                style={{ backgroundColor: colors.accentColor }}
                                className="w-1 h-2.5 rounded-full shrink-0"
                              />
                              <span
                                className={`h-1.5 w-11 rounded-full ${
                                  isDark ? 'bg-white/40' : 'bg-slate-400'
                                }`}
                              />
                            </div>
                          </div>
                        ),
                      },
                      {
                        id: 'comfortable',
                        label: 'Standardowy',
                        desc: 'Domyślny Apple',
                        preview: (
                          <div
                            className={`p-1.5 rounded-lg border space-y-2 ${
                              isDark
                                ? 'bg-black/30 border-white/10'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 py-0.5">
                              <span
                                style={{ backgroundColor: cwiczeniaHex }}
                                className="w-1 h-3 rounded-full shrink-0"
                              />
                              <span
                                className={`h-2 w-12 rounded-full ${
                                  isDark ? 'bg-white/65' : 'bg-slate-600'
                                }`}
                              />
                            </div>
                            <div className="flex items-center gap-1.5 py-0.5">
                              <span
                                style={{ backgroundColor: wykladHex }}
                                className="w-1 h-3 rounded-full shrink-0"
                              />
                              <span
                                className={`h-2 w-10 rounded-full ${
                                  isDark ? 'bg-white/40' : 'bg-slate-400'
                                }`}
                              />
                            </div>
                          </div>
                        ),
                      },
                      {
                        id: 'spacious',
                        label: 'Przestronny',
                        desc: 'Większe odstępy',
                        preview: (
                          <div
                            className={`p-2 rounded-lg border space-y-2.5 ${
                              isDark
                                ? 'bg-black/30 border-white/10'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 py-1">
                              <span
                                style={{ backgroundColor: cwiczeniaHex }}
                                className="w-1 h-3.5 rounded-full shrink-0"
                              />
                              <span
                                className={`h-2 w-12 rounded-full ${
                                  isDark ? 'bg-white/65' : 'bg-slate-600'
                                }`}
                              />
                            </div>
                            <div className="flex items-center gap-1.5 py-0.5">
                              <span
                                style={{ backgroundColor: wykladHex }}
                                className="w-1 h-3.5 rounded-full shrink-0"
                              />
                              <span
                                className={`h-2 w-9 rounded-full ${
                                  isDark ? 'bg-white/40' : 'bg-slate-400'
                                }`}
                              />
                            </div>
                          </div>
                        ),
                      },
                    ] as const,
                    layoutPrefs.density,
                    (id) => updateLayout({ density: id })
                  )}
                </div>

                <div>
                  <span className="text-xs font-bold block mb-1.5">
                    Styl kart i zaokrągleń
                  </span>
                  {renderResponsiveOptionCards(
                    [
                      {
                        id: 'liquid_glass',
                        label: 'Liquid Glass',
                        desc: 'Miękkie szkło 26px',
                        preview: (
                          <div className="relative overflow-hidden p-1.5 rounded-[14px] border border-white/25 bg-white/10 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]">
                            <span
                              style={{ backgroundColor: colors.accentColor }}
                              className="w-6 h-6 rounded-full blur-xs opacity-60 absolute -right-1 -top-1 pointer-events-none"
                            />
                            <div className="relative z-10 flex items-center gap-1.5 text-[9px] font-bold">
                              <span
                                style={{ backgroundColor: colors.accentColor }}
                                className="w-2 h-2 rounded-full"
                              />
                              <span>Zaokrąglenie 26px</span>
                            </div>
                          </div>
                        ),
                      },
                      {
                        id: 'matte_minimal',
                        label: 'Matowy Clean',
                        desc: 'Bez poświaty w tle',
                        preview: (
                          <div
                            className={`p-1.5 rounded-[10px] border ${
                              isDark
                                ? 'bg-[#181C26] border-white/12'
                                : 'bg-slate-100 border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 text-[9px] font-bold opacity-85">
                              <span className="w-2 h-2 rounded-full bg-slate-400" />
                              <span>Gładki mat 22px</span>
                            </div>
                          </div>
                        ),
                      },
                      {
                        id: 'sharp_pro',
                        label: 'Techniczny Pro',
                        desc: 'Krawędzie 16px',
                        preview: (
                          <div
                            className={`p-1.5 rounded-[4px] border ${
                              isDark
                                ? 'bg-black/45 border-white/25'
                                : 'bg-white border-slate-400'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold">
                              <span
                                style={{ backgroundColor: colors.accentColor }}
                                className="w-2 h-2 rounded-[2px]"
                              />
                              <span>Krawędź Pro</span>
                            </div>
                          </div>
                        ),
                      },
                    ] as const,
                    layoutPrefs.cardStyle,
                    (id) =>
                      updateLayout({
                        cardStyle: id,
                        showAmbientOrbs: id !== 'matte_minimal',
                      })
                  )}
                </div>

                <div>
                  <span className="text-xs font-bold block mb-1.5">
                    Styl wskaźnika kategorii przy przedmiocie
                  </span>
                  {renderResponsiveOptionCards(
                    [
                      {
                        id: 'bar',
                        label: 'Klasyczny pasek',
                        desc: 'Pionowa linia Apple',
                        preview: (
                          <div
                            className={`px-2 py-1.5 rounded-lg border flex items-center gap-2 ${
                              isDark
                                ? 'bg-black/30 border-white/10'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <span className="text-[9px] font-bold tabular-nums opacity-70">
                              09:45
                            </span>
                            <span
                              style={{ backgroundColor: cwiczeniaHex }}
                              className="w-1 h-4 rounded-full shrink-0"
                            />
                            <span className="text-[9px] font-bold truncate">
                              Finanse
                            </span>
                          </div>
                        ),
                      },
                      {
                        id: 'glow_bar',
                        label: 'Neon Glow',
                        desc: 'Pasek z poświatą',
                        preview: (
                          <div
                            className={`px-2 py-1.5 rounded-lg border flex items-center gap-2 ${
                              isDark
                                ? 'bg-black/30 border-white/10'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <span className="text-[9px] font-bold tabular-nums opacity-70">
                              09:45
                            </span>
                            <span
                              style={{
                                backgroundColor: cwiczeniaHex,
                                boxShadow: `0 0 8px ${cwiczeniaHex}`,
                              }}
                              className="w-1 h-4 rounded-full shrink-0"
                            />
                            <span className="text-[9px] font-bold truncate">
                              Finanse
                            </span>
                          </div>
                        ),
                      },
                      {
                        id: 'pill_dot',
                        label: 'Kropka + Akcent',
                        desc: 'Subtelny punkt',
                        preview: (
                          <div
                            className={`px-2 py-1.5 rounded-lg border flex items-center gap-2 ${
                              isDark
                                ? 'bg-black/30 border-white/10'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <span className="text-[9px] font-bold tabular-nums opacity-70">
                              09:45
                            </span>
                            <div className="flex flex-col items-center">
                              <span
                                style={{
                                  backgroundColor: cwiczeniaHex,
                                  boxShadow: `0 0 6px ${cwiczeniaHex}`,
                                }}
                                className="w-2 h-2 rounded-full"
                              />
                              <span
                                style={{ backgroundColor: `${cwiczeniaHex}40` }}
                                className="w-0.5 h-2 rounded-full mt-0.5"
                              />
                            </div>
                            <span className="text-[9px] font-bold truncate">
                              Finanse
                            </span>
                          </div>
                        ),
                      },
                    ] as const,
                    layoutPrefs.categoryIndicator || 'bar',
                    (id) => updateLayout({ categoryIndicator: id })
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <CalendarClock className="w-3.5 h-3.5 opacity-75" />
                    <span className="text-xs font-bold">
                      Styl postępu trwających zajęć (na żywo)
                    </span>
                  </div>
                  {renderResponsiveOptionCards(
                    [
                      {
                        id: 'line',
                        label: 'Płynny pasek',
                        desc: 'Klasyczna linia Live',
                        preview: (
                          <div
                            className={`px-2.5 py-2 rounded-lg border flex flex-col gap-1.5 ${
                              isDark
                                ? 'bg-black/30 border-white/10'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[8px] font-bold opacity-75 tabular-nums">
                              <span>W trakcie</span>
                              <span>jeszcze 38 min</span>
                            </div>
                            <div
                              className={`h-1.5 w-full rounded-full overflow-hidden ${
                                isDark ? 'bg-white/12' : 'bg-slate-200'
                              }`}
                            >
                              <div
                                style={{
                                  width: '58%',
                                  backgroundColor: colors.accentColor,
                                  boxShadow: `0 0 8px ${colors.accentColor}`,
                                }}
                                className="h-full rounded-full"
                              />
                            </div>
                          </div>
                        ),
                      },
                      {
                        id: 'dots',
                        label: 'Kropki postępu',
                        desc: 'Segmentowe punkty',
                        preview: (
                          <div
                            className={`px-2.5 py-2 rounded-lg border flex flex-col gap-1.5 ${
                              isDark
                                ? 'bg-black/30 border-white/10'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[8px] font-bold opacity-75 tabular-nums">
                              <span>Krok 6/10</span>
                              <span>jeszcze 38 min</span>
                            </div>
                            <div className="grid grid-cols-10 gap-1 items-center">
                              {Array.from({ length: 10 }).map((_, idx) => {
                                const done = idx < 5;
                                const active = idx === 5;
                                return (
                                  <span
                                    key={idx}
                                    style={
                                      done || active
                                        ? {
                                            backgroundColor: colors.accentColor,
                                            boxShadow: active
                                              ? `0 0 6px ${colors.accentColor}`
                                              : undefined,
                                          }
                                        : undefined
                                    }
                                    className={`h-1.5 rounded-full ${
                                      active
                                        ? 'scale-y-125'
                                        : done
                                        ? 'opacity-90'
                                        : isDark
                                        ? 'bg-white/15'
                                        : 'bg-slate-200'
                                    }`}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        ),
                      },
                      {
                        id: 'timeline_orb',
                        label: 'Oś z kapsułką %',
                        desc: 'Suwak + procenty',
                        preview: (
                          <div
                            className={`px-2 py-2 rounded-lg border flex flex-col gap-1.5 ${
                              isDark
                                ? 'bg-black/30 border-white/10'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[8px] font-bold opacity-75 tabular-nums">
                              <span>Oś czasu</span>
                              <span>58% za Tobą</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[7px] font-bold opacity-60 tabular-nums">
                                09:45
                              </span>
                              <div
                                className={`relative flex-1 h-1 rounded-full ${
                                  isDark ? 'bg-white/15' : 'bg-slate-200'
                                }`}
                              >
                                <div
                                  style={{
                                    width: '58%',
                                    backgroundColor: colors.accentColor,
                                  }}
                                  className="h-full rounded-full"
                                />
                                <span
                                  style={{
                                    left: '58%',
                                    backgroundColor: colors.accentColor,
                                  }}
                                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 px-1 py-0.2 rounded-full text-[7px] font-bold text-white leading-none tabular-nums shadow"
                                >
                                  58%
                                </span>
                              </div>
                              <span className="text-[7px] font-bold opacity-60 tabular-nums">
                                11:15
                              </span>
                            </div>
                          </div>
                        ),
                      },
                    ] as const,
                    layoutPrefs.liveProgressStyle || 'line',
                    (id) => updateLayout({ liveProgressStyle: id })
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Type className="w-3.5 h-3.5 opacity-75" />
                    <span className="text-xs font-bold">Krój czcionki</span>
                  </div>
                  {renderResponsiveOptionCards(
                    [
                      {
                        id: 'jakarta',
                        label: 'Plus Jakarta',
                        desc: 'Nowoczesny',
                        sampleFont:
                          "'Plus Jakarta Sans', -apple-system, sans-serif",
                        preview: (
                          <div
                            style={{
                              fontFamily:
                                "'Plus Jakarta Sans', -apple-system, sans-serif",
                            }}
                            className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${
                              isDark
                                ? 'bg-black/30 border-white/10'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            09:45 · Paw.A 118
                          </div>
                        ),
                      },
                      {
                        id: 'sf_system',
                        label: 'Apple SF System',
                        desc: 'Klasyczny iOS',
                        sampleFont:
                          "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                        preview: (
                          <div
                            style={{
                              fontFamily:
                                "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                            }}
                            className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${
                              isDark
                                ? 'bg-black/30 border-white/10'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            09:45 · Paw.A 118
                          </div>
                        ),
                      },
                      {
                        id: 'mono',
                        label: 'JetBrains Mono',
                        desc: 'Koderski / Tech',
                        sampleFont: "'JetBrains Mono', monospace",
                        preview: (
                          <div
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                            className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${
                              isDark
                                ? 'bg-black/30 border-white/10'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            09:45 · Paw.A 118
                          </div>
                        ),
                      },
                    ] as const,
                    layoutPrefs.fontFamily,
                    (id) => updateLayout({ fontFamily: id })
                  )}
                </div>
              </div>

              {/* 4. Przełączniki modułów i inteligentnych funkcji (z bezpośrednim podglądem na każdym kafelku!) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <p
                    className={`text-[10px] font-semibold uppercase tracking-wider ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Widoczne sekcje i inteligentni asystenci
                  </p>
                  <span
                    style={{ color: colors.accentColor }}
                    className="text-[10px] font-semibold"
                  >
                    Podgląd na żywo ↑ oraz na każdym kafelku
                  </span>
                </div>

                {renderToggleRow(
                  'Asystent zmiany pawilonu w przerwie',
                  'Pokazuje na pasku przerwy szacowany czas przejścia, gdy kolejne zajęcia są w innym budynku',
                  layoutPrefs.showWalkTimeHints,
                  (val) => updateLayout({ showWalkTimeHints: val }),
                  'Smart UEK',
                  <div
                    style={{ backgroundColor: previewBreakBg }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 text-[10px] font-semibold"
                  >
                    <span className="opacity-75">przerwa 15 min ·</span>
                    <span style={{ color: colors.accentColor }}>
                      🚶 Paw. A → Paw. F (~4 min · 290 m)
                    </span>
                  </div>
                )}

                {renderToggleRow(
                  'Automatyczne ikony przedmiotów',
                  'Dodaje dopasowaną ikonę przed nazwą przedmiotu na podstawie tematyki zajęć',
                  layoutPrefs.showSubjectIcons ?? true,
                  (val) => updateLayout({ showSubjectIcons: val }),
                  'Nowość',
                  <div className="inline-flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                    <span
                      className={`px-2 py-0.5 rounded-md border ${
                        isDark
                          ? 'bg-black/30 border-white/10'
                          : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      💻 Python
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md border ${
                        isDark
                          ? 'bg-black/30 border-white/10'
                          : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      📊 Finanse
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md border ${
                        isDark
                          ? 'bg-black/30 border-white/10'
                          : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      🇬🇧 Lektorat
                    </span>
                  </div>
                )}

                {renderToggleRow(
                  'Czas trwania zajęć pod godziną (np. 90 min)',
                  'Wyświetla dokładną długość bloku zajęciowego w kolumnie godzin po lewej stronie',
                  layoutPrefs.showClassDuration ?? false,
                  (val) => updateLayout({ showClassDuration: val }),
                  undefined,
                  <div
                    className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[10px] tabular-nums ${
                      isDark
                        ? 'bg-black/30 border-white/10'
                        : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    <span className="font-bold">09:45–11:15</span>
                    <span
                      style={{ color: cwiczeniaHex }}
                      className="font-bold"
                    >
                      · 90 min
                    </span>
                  </div>
                )}

                {renderToggleRow(
                  'Karta „Najbliższe zajęcia / Trwa teraz”',
                  'Duży kafelek u góry ekranu wyróżniający aktualne lub kolejne zajęcia',
                  layoutPrefs.showHeroCard,
                  (val) => updateLayout({ showHeroCard: val }),
                  undefined,
                  <div
                    style={{
                      background: `linear-gradient(135deg, ${colors.accentColor}, ${mixHexColors(
                        colors.accentColor,
                        '#060D20',
                        0.45
                      )})`,
                    }}
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    <span>TRWA TERAZ · Rachunkowość finansowa</span>
                  </div>
                )}

                {renderToggleRow(
                  'Karta „Postęp planu” (statystyki semestru)',
                  'Wykres kołowy z procentem odbytych zajęć, zjazdami i godzinami dydaktycznymi',
                  layoutPrefs.showProgressCard,
                  (val) => updateLayout({ showProgressCard: val }),
                  undefined,
                  <div
                    className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[10px] font-semibold ${
                      isDark
                        ? 'bg-black/30 border-white/10'
                        : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    <span className="text-emerald-400 font-bold">◕ 64%</span>
                    <span>· 9 zjazdów · 42 zajęć</span>
                  </div>
                )}

                {renderToggleRow(
                  'Paski przerw między zajęciami',
                  'Wyświetla informację „przerwa 15 min” między kolejnymi blokami',
                  layoutPrefs.showBreaks,
                  (val) => updateLayout({ showBreaks: val }),
                  undefined,
                  <div
                    style={{ backgroundColor: previewBreakBg }}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-md border border-white/10 text-[10px]"
                  >
                    przerwa 15 min
                  </div>
                )}

                {renderToggleRow(
                  'Nazwiska wykładowców na liście zajęć',
                  'Ukryj, jeśli wolisz bardziej minimalistyczny widok samych przedmiotów i sal',
                  layoutPrefs.showLecturers,
                  (val) => updateLayout({ showLecturers: val }),
                  undefined,
                  <div
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[10px] ${
                      isDark
                        ? 'bg-black/30 border-white/10'
                        : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    <span className="text-sky-400 font-semibold">
                      Paw.A 118
                    </span>
                    <span>· dr hab. J. Kowalski</span>
                  </div>
                )}

                {renderToggleRow(
                  'Liczniki zajęć (np. Ćwiczenia 2/6)',
                  'Kolorowe pastylki z numerem spotkania w semestrze',
                  layoutPrefs.showClassCounters,
                  (val) => updateLayout({ showClassCounters: val }),
                  undefined,
                  <span
                    style={{
                      backgroundColor: isDark
                        ? `${cwiczeniaHex}28`
                        : mixHexColors(cwiczeniaHex, '#FFFFFF', 0.85),
                      borderColor: `${cwiczeniaHex}55`,
                      color: isDark
                        ? mixHexColors(cwiczeniaHex, '#FFFFFF', 0.45)
                        : mixHexColors(cwiczeniaHex, '#0F172A', 0.35),
                    }}
                    className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold border"
                  >
                    Ćwiczenia 2/6
                  </span>
                )}

                {renderToggleRow(
                  'Automatyczne zwijanie odbytych dni',
                  'Zakończone dni zjazdu domyślnie zwijają się do pojedynczego paska z zielonym znacznikiem ✓',
                  layoutPrefs.autoCollapseCompletedDays,
                  (val) => updateLayout({ autoCollapseCompletedDays: val }),
                  undefined,
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 text-[10px] font-semibold">
                    <span>✓ Piątek · 3 zajęcia (zwinięty)</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: RĘCZNIE */}
          {activeTab === 'manual' && (
            <div className="space-y-4">
              {/* 1. Kolor akcentu */}
              <div>
                <div
                  className={`flex items-center justify-between pb-2 border-b ${
                    isDark ? 'border-white/10' : 'border-slate-200'
                  }`}
                >
                  <span className="text-xs sm:text-sm font-semibold">
                    Kolor akcentu (przyciski, dni tygodnia)
                  </span>
                  <label
                    className={`relative w-11 h-7 rounded-lg border overflow-hidden cursor-pointer shrink-0 ${
                      isDark ? 'border-white/25' : 'border-slate-300'
                    }`}
                  >
                    <input
                      type="color"
                      value={colors.accentColor}
                      onChange={(e) =>
                        onChangeColors({
                          ...colors,
                          accentColor: e.target.value,
                        })
                      }
                      className="sr-only"
                    />
                    <span
                      style={{ backgroundColor: colors.accentColor }}
                      className="block w-full h-full"
                    />
                  </label>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                  {APPLE_ACCENT_SWATCHES.map((s) =>
                    renderLiquidSwatch(
                      s.hex,
                      s.name,
                      colors.accentColor.toLowerCase() === s.hex.toLowerCase(),
                      () => onChangeColors({ ...colors, accentColor: s.hex })
                    )
                  )}
                </div>
              </div>

              {/* 2. Ciemny motyw */}
              <div>
                <div
                  className={`flex items-center justify-between pb-2 border-b ${
                    isDark ? 'border-white/10' : 'border-slate-200'
                  }`}
                >
                  <span className="text-xs sm:text-sm font-semibold">
                    Ciemny motyw: tło i karty
                  </span>
                  <label
                    className={`relative w-11 h-7 rounded-lg border overflow-hidden cursor-pointer shrink-0 ${
                      isDark ? 'border-white/25' : 'border-slate-300'
                    }`}
                  >
                    <input
                      type="color"
                      value={colors.darkBgColor}
                      onChange={(e) =>
                        onChangeColors({
                          ...colors,
                          darkBgColor: e.target.value,
                        })
                      }
                      className="sr-only"
                    />
                    <span
                      style={{ backgroundColor: colors.darkBgColor }}
                      className="block w-full h-full"
                    />
                  </label>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                  {DARK_BG_SWATCHES.map((s) =>
                    renderLiquidSwatch(
                      s.hex,
                      s.name,
                      colors.darkBgColor.toLowerCase() === s.hex.toLowerCase(),
                      () => onChangeColors({ ...colors, darkBgColor: s.hex })
                    )
                  )}
                </div>
              </div>

              {/* 3. Jasny motyw */}
              <div>
                <div
                  className={`flex items-center justify-between pb-2 border-b ${
                    isDark ? 'border-white/10' : 'border-slate-200'
                  }`}
                >
                  <span className="text-xs sm:text-sm font-semibold">
                    Jasny motyw: tło i powierzchnie
                  </span>
                  <label
                    className={`relative w-11 h-7 rounded-lg border overflow-hidden cursor-pointer shrink-0 ${
                      isDark ? 'border-white/25' : 'border-slate-300'
                    }`}
                  >
                    <input
                      type="color"
                      value={colors.lightBgColor}
                      onChange={(e) =>
                        onChangeColors({
                          ...colors,
                          lightBgColor: e.target.value,
                        })
                      }
                      className="sr-only"
                    />
                    <span
                      style={{ backgroundColor: colors.lightBgColor }}
                      className="block w-full h-full"
                    />
                  </label>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                  {LIGHT_BG_SWATCHES.map((s) =>
                    renderLiquidSwatch(
                      s.hex,
                      s.name,
                      colors.lightBgColor.toLowerCase() === s.hex.toLowerCase(),
                      () => onChangeColors({ ...colors, lightBgColor: s.hex }),
                      true
                    )
                  )}
                </div>
              </div>

              {/* 4. Zajęcia przeniesione */}
              <div>
                <div
                  className={`flex items-center justify-between pb-2 border-b ${
                    isDark ? 'border-white/10' : 'border-slate-200'
                  }`}
                >
                  <span className="text-xs sm:text-sm font-semibold">
                    Zajęcia przeniesione
                  </span>
                  <label
                    className={`relative w-11 h-7 rounded-lg border overflow-hidden cursor-pointer shrink-0 ${
                      isDark ? 'border-white/25' : 'border-slate-300'
                    }`}
                  >
                    <input
                      type="color"
                      value={colors.rescheduledColor}
                      onChange={(e) =>
                        onChangeColors({
                          ...colors,
                          rescheduledColor: e.target.value,
                        })
                      }
                      className="sr-only"
                    />
                    <span
                      style={{ backgroundColor: colors.rescheduledColor }}
                      className="block w-full h-full"
                    />
                  </label>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                  {RESCHEDULED_SWATCHES.map((s) =>
                    renderLiquidSwatch(
                      s.hex,
                      s.name,
                      colors.rescheduledColor.toLowerCase() ===
                        s.hex.toLowerCase(),
                      () =>
                        onChangeColors({
                          ...colors,
                          rescheduledColor: s.hex,
                        })
                    )
                  )}
                </div>
              </div>

              {/* 5. Własne kolory typów zajęć (Ćwiczenia, Wykład, Lektorat) */}
              <div
                className={`p-3.5 rounded-2xl border space-y-3 ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10'
                    : 'bg-white/75 border-slate-200/80'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold block">
                      Własne kolory typów zajęć
                    </span>
                    <span
                      className={`text-[11px] ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      Ustaw osobny kolor dla Ćwiczeń, Wykładów i Lektoratu
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleCategoryColorModeChange('accent_harmony')
                    }
                    style={{
                      backgroundColor: `${colors.accentColor}20`,
                      color: colors.accentColor,
                    }}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold hover:opacity-90 whitespace-nowrap shrink-0"
                  >
                    Dopasuj do akcentu ✨
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    {
                      key: 'cwiczeniaColor' as const,
                      label: 'Ćwiczenia',
                      val: colors.cwiczeniaColor || '#A855F7',
                    },
                    {
                      key: 'wykladColor' as const,
                      label: 'Wykład',
                      val: colors.wykladColor || '#0EA5E9',
                    },
                    {
                      key: 'lektoratColor' as const,
                      label: 'Lektorat',
                      val: colors.lektoratColor || '#D97706',
                    },
                  ].map((cat) => (
                    <div
                      key={cat.key}
                      className={`p-2.5 rounded-xl border flex flex-col gap-2 ${
                        isDark
                          ? 'bg-black/25 border-white/8'
                          : 'bg-slate-50 border-slate-200/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">{cat.label}</span>
                        <label
                          className={`relative w-8 h-6 rounded-lg border overflow-hidden cursor-pointer shrink-0 ${
                            isDark ? 'border-white/25' : 'border-slate-300'
                          }`}
                        >
                          <input
                            type="color"
                            value={cat.val}
                            onChange={(e) =>
                              onChangeColors({
                                ...colors,
                                categoryColorMode: 'custom',
                                [cat.key]: e.target.value,
                              })
                            }
                            className="sr-only"
                          />
                          <span
                            style={{ backgroundColor: cat.val }}
                            className="block w-full h-full"
                          />
                        </label>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {CATEGORY_SWATCHES.slice(0, 6).map((sw) => (
                          <button
                            key={sw.hex}
                            type="button"
                            onClick={() =>
                              onChangeColors({
                                ...colors,
                                categoryColorMode: 'custom',
                                [cat.key]: sw.hex,
                              })
                            }
                            style={{ backgroundColor: sw.hex }}
                            className={`w-4.5 h-4.5 rounded-full border border-white/25 transition-transform ${
                              cat.val.toLowerCase() === sw.hex.toLowerCase()
                                ? 'scale-125 ring-2 ring-white'
                                : 'opacity-80 hover:opacity-100'
                            }`}
                            title={sw.name}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SAVED USER PALETTES SECTION ("Moje zapisane style" — Clean 2-Row Layout so buttons NEVER wrap text!) */}
          <div
            className={`p-3.5 rounded-2xl border space-y-2.5 ${
              isDark
                ? 'bg-white/[0.03] border-white/10'
                : 'bg-white/80 border-slate-200/80'
            }`}
          >
            {/* Row 1: Title on Left + Share/Paste Buttons on Right (all whitespace-nowrap) */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Bookmark
                  style={{ color: colors.accentColor }}
                  className="w-4 h-4 shrink-0"
                />
                <span className="text-xs font-bold truncate">
                  Moje zapisane style ({savedPalettes.length})
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyShareCode}
                  title="Skopiuj kod swojego stylu i wyślij znajomym z grupy"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                    isDark
                      ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200/70'
                  }`}
                >
                  <Copy className="w-3 h-3 shrink-0" />
                  <span>Udostępnij</span>
                </button>
                <button
                  type="button"
                  onClick={() => setImportCodeOpen(!importCodeOpen)}
                  title="Wklej kod stylu od znajomego"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                    isDark
                      ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200/70'
                  }`}
                >
                  <Download className="w-3 h-3 shrink-0" />
                  <span>Wklej kod</span>
                </button>
              </div>
            </div>

            {/* Row 2: Full-width Name Input + "+ Zapisz obecny" button */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customSaveName}
                onChange={(e) => setCustomSaveName(e.target.value)}
                placeholder="Nazwa stylu (opcjonalnie)..."
                maxLength={24}
                className={`flex-1 px-3 py-1.5 rounded-xl text-xs border outline-none transition-colors min-w-0 ${
                  isDark
                    ? 'bg-black/30 border-white/12 text-white placeholder:text-slate-500 focus:border-white/30'
                    : 'bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-400'
                }`}
              />
              <button
                type="button"
                onClick={handleSaveCurrentPalette}
                style={{
                  backgroundColor: `${colors.accentColor}22`,
                  borderColor: `${colors.accentColor}50`,
                  color: isDark
                    ? '#FFFFFF'
                    : mixHexColors(colors.accentColor, '#000000', 0.25),
                }}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-semibold border hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
              >
                {justSavedToast ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Zapisano!</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>Zapisz obecny</span>
                  </>
                )}
              </button>
            </div>

            {shareCodeToast && (
              <p className="text-[11px] font-semibold text-emerald-400">
                ✓ {shareCodeToast}
              </p>
            )}

            {importCodeOpen && (
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="text"
                  value={importCodeInput}
                  onChange={(e) => setImportCodeInput(e.target.value)}
                  placeholder="Wklej tutaj kod stylu od znajomego..."
                  className={`flex-1 px-3 py-1.5 rounded-xl text-xs border outline-none min-w-0 ${
                    isDark
                      ? 'bg-black/35 border-white/15 text-white placeholder:text-slate-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={handleApplyImportedCode}
                  style={{ backgroundColor: colors.accentColor }}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white whitespace-nowrap shrink-0"
                >
                  Zastosuj
                </button>
              </div>
            )}

            {savedPalettes.length === 0 ? (
              <p
                className={`text-[11px] ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Gdy trafisz na odcień i układ, który Ci się podoba, kliknij{' '}
                <strong>„+ Zapisz obecny”</strong> — pojawi się tutaj na stałe,
                abyś mógł do niego wrócić jednym kliknięciem.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                {savedPalettes.map((saved) => {
                  const isCurrent =
                    saved.colors.accentColor.toLowerCase() ===
                      colors.accentColor.toLowerCase() &&
                    saved.colors.darkBgColor.toLowerCase() ===
                      colors.darkBgColor.toLowerCase() &&
                    saved.colors.rescheduledColor.toLowerCase() ===
                      colors.rescheduledColor.toLowerCase();

                  return (
                    <div
                      key={saved.id}
                      onClick={() => {
                        setBaseAccentHex(saved.colors.accentColor);
                        onChangeColors(saved.colors);
                        if (saved.layout) {
                          onChangeLayoutPrefs(saved.layout);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setBaseAccentHex(saved.colors.accentColor);
                          onChangeColors(saved.colors);
                          if (saved.layout) {
                            onChangeLayoutPrefs(saved.layout);
                          }
                        }
                      }}
                      style={
                        isCurrent
                          ? {
                              borderColor: saved.colors.accentColor,
                              backgroundColor: `${saved.colors.accentColor}15`,
                            }
                          : undefined
                      }
                      className={`group flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                        isCurrent
                          ? ''
                          : isDark
                          ? 'bg-black/25 border-white/10 hover:bg-white/[0.06]'
                          : 'bg-slate-50 border-slate-200/80 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex items-center -space-x-1.5 shrink-0">
                          <span
                            style={{
                              backgroundColor: saved.colors.accentColor,
                            }}
                            className="w-5 h-5 rounded-full border border-white/30 shadow-xs"
                          />
                          <span
                            style={{
                              backgroundColor: saved.colors.darkBgColor,
                            }}
                            className="w-5 h-5 rounded-full border border-white/25 shadow-xs"
                          />
                          <span
                            style={{
                              backgroundColor: saved.colors.rescheduledColor,
                            }}
                            className="w-5 h-5 rounded-full border border-white/25 shadow-xs"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">
                            {saved.name}
                          </p>
                          <p
                            className={`text-[10px] font-mono ${
                              isDark ? 'text-slate-400' : 'text-slate-500'
                            }`}
                          >
                            {saved.colors.accentColor}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isCurrent && (
                          <span
                            style={{
                              backgroundColor: saved.colors.accentColor,
                            }}
                            className="w-4.5 h-4.5 rounded-full text-white flex items-center justify-center"
                          >
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSavedPalette(e, saved.id)}
                          title="Usuń zapisany styl"
                          className={`p-1 rounded-lg opacity-65 hover:opacity-100 transition-opacity ${
                            isDark
                              ? 'hover:bg-rose-500/20 text-slate-400 hover:text-rose-300'
                              : 'hover:bg-rose-100 text-slate-500 hover:text-rose-600'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Actions */}
        <div
          className={`mt-3 pt-3 border-t flex items-center justify-between gap-3 shrink-0 ${
            isDark ? 'border-white/10' : 'border-slate-200/80'
          }`}
        >
          <button
            type="button"
            onClick={onResetColors}
            className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
              isDark
                ? 'bg-white/6 hover:bg-white/12 border-white/12 text-slate-200'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
            }`}
          >
            Przywróć domyślne
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: `linear-gradient(180deg, ${mixHexColors(
                colors.accentColor,
                '#FFFFFF',
                0.1
              )}, ${colors.accentColor})`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28), 0 4px 12px ${colors.accentColor}45`,
            }}
            className="px-6 sm:px-7 py-2 sm:py-2.5 rounded-full text-xs font-semibold text-white hover:opacity-95 transition-opacity whitespace-nowrap"
          >
            Gotowe
          </button>
        </div>
      </div>
    </div>
  );
};
