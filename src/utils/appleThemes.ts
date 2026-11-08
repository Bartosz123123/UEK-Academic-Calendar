import { ScheduleItem } from '../types/schedule';

export interface AppleWallpaperPreset {
  id: string;
  name: string;
  subtitle: string;
  isDark: boolean;
  canvasBg: string;
  meshStyle: string;
  previewGradient: string;
}

export interface AppleAccentPreset {
  id: string;
  name: string;
  hex: string;
  darkHex: string;
  softBg: string;
}

export const APPLE_WALLPAPERS: AppleWallpaperPreset[] = [
  {
    id: 'tahoe-glass',
    name: 'macOS Tahoe Liquid',
    subtitle: 'Krystaliczny błękit i perła',
    isDark: false,
    canvasBg: '#EEF2F8',
    meshStyle:
      'radial-gradient(at 12% 10%, rgba(0, 122, 255, 0.20) 0px, transparent 52%), radial-gradient(at 88% 14%, rgba(88, 86, 214, 0.18) 0px, transparent 50%), radial-gradient(at 75% 88%, rgba(50, 173, 230, 0.22) 0px, transparent 55%), radial-gradient(at 18% 82%, rgba(175, 82, 222, 0.12) 0px, transparent 50%)',
    previewGradient: 'linear-gradient(135deg, #E0ECFF 0%, #C8DCFF 50%, #D9E4FF 100%)',
  },
  {
    id: 'cupertino-pearl',
    name: 'Cupertino Daylight',
    subtitle: 'Czysty alabaster i srebro',
    isDark: false,
    canvasBg: '#F5F5F7',
    meshStyle:
      'radial-gradient(at 20% 0%, rgba(0, 113, 227, 0.10) 0px, transparent 50%), radial-gradient(at 85% 20%, rgba(142, 142, 147, 0.14) 0px, transparent 50%), radial-gradient(at 50% 100%, rgba(0, 122, 255, 0.08) 0px, transparent 55%)',
    previewGradient: 'linear-gradient(135deg, #F5F5F7 0%, #E5E5EA 100%)',
  },
  {
    id: 'sonoma-horizon',
    name: 'Sonoma Golden Hour',
    subtitle: 'Kalifornijski bursztyn i róż',
    isDark: false,
    canvasBg: '#F9F3F0',
    meshStyle:
      'radial-gradient(at 15% 15%, rgba(255, 149, 0, 0.18) 0px, transparent 52%), radial-gradient(at 85% 18%, rgba(255, 45, 85, 0.15) 0px, transparent 50%), radial-gradient(at 60% 85%, rgba(175, 82, 222, 0.14) 0px, transparent 55%)',
    previewGradient: 'linear-gradient(135deg, #FFE6D5 0%, #FFD6E0 55%, #E8D7FF 100%)',
  },
  {
    id: 'space-black',
    name: 'Space Black Pro',
    subtitle: 'Tytanowy onyks i głębia',
    isDark: true,
    canvasBg: '#090A0F',
    meshStyle:
      'radial-gradient(at 15% 10%, rgba(10, 132, 255, 0.22) 0px, transparent 50%), radial-gradient(at 85% 12%, rgba(94, 92, 230, 0.20) 0px, transparent 48%), radial-gradient(at 50% 90%, rgba(48, 176, 199, 0.14) 0px, transparent 55%)',
    previewGradient: 'linear-gradient(135deg, #141722 0%, #090A0F 60%, #1B2238 100%)',
  },
  {
    id: 'midnight-nebula',
    name: 'Midnight Nebula',
    subtitle: 'Nocny indygo i ultrafiolet',
    isDark: true,
    canvasBg: '#0B0914',
    meshStyle:
      'radial-gradient(at 10% 15%, rgba(94, 92, 230, 0.28) 0px, transparent 52%), radial-gradient(at 88% 20%, rgba(191, 90, 242, 0.22) 0px, transparent 50%), radial-gradient(at 70% 85%, rgba(10, 132, 255, 0.20) 0px, transparent 55%)',
    previewGradient: 'linear-gradient(135deg, #1E1538 0%, #0D0B18 55%, #17254A 100%)',
  },
];

export const APPLE_ACCENTS: AppleAccentPreset[] = [
  {
    id: 'blue',
    name: 'Błękit Apple',
    hex: '#007AFF',
    darkHex: '#0A84FF',
    softBg: 'rgba(0, 122, 255, 0.12)',
  },
  {
    id: 'indigo',
    name: 'Indygo',
    hex: '#5856D6',
    darkHex: '#5E5CE6',
    softBg: 'rgba(88, 86, 214, 0.12)',
  },
  {
    id: 'purple',
    name: 'Fiolet',
    hex: '#AF52DE',
    darkHex: '#BF5AF2',
    softBg: 'rgba(175, 82, 222, 0.12)',
  },
  {
    id: 'rose',
    name: 'Karmin',
    hex: '#FF2D55',
    darkHex: '#FF375F',
    softBg: 'rgba(255, 45, 85, 0.12)',
  },
  {
    id: 'teal',
    name: 'Turkus',
    hex: '#008899',
    darkHex: '#40C8E0',
    softBg: 'rgba(0, 136, 153, 0.12)',
  },
  {
    id: 'orange',
    name: 'Bursztyn',
    hex: '#E67E00',
    darkHex: '#FF9F0A',
    softBg: 'rgba(230, 126, 0, 0.12)',
  },
];

export function exportScheduleToIcs(items: ScheduleItem[], groupName: string): void {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Plan UEK//Apple Calendar Export//PL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Plan UEK - ${groupName}`,
    'X-WR-TIMEZONE:Europe/Warsaw',
  ];

  for (const item of items) {
    const cleanDate = item.date.replace(/-/g, '');
    const startClean = item.startTime.replace(':', '') + '00';
    const endClean = item.endTime.replace(':', '') + '00';

    const statusPrefix =
      item.status === 'cancelled'
        ? '[ODWOŁANE] '
        : item.status === 'rescheduled'
        ? '[PRZENIESIONE] '
        : item.status === 'room_changed'
        ? '[ZMIANA SALI] '
        : item.status === 'exam'
        ? '[KOLOKWIUM/EGZAMIN] '
        : '';

    const summary = `${statusPrefix}${item.subject} (${item.type})`;
    const descriptionParts = [
      `Prowadzący: ${item.lecturer}`,
      `Forma: ${item.type}`,
      item.statusReason ? `Status: ${item.statusReason}` : '',
      item.rawNotes ? `Uwagi UEK: ${item.rawNotes}` : '',
      item.userNote ? `Notatka własna: ${item.userNote}` : '',
    ].filter(Boolean);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${item.id}@planzajec.uek.krakow.pl`);
    lines.push(`DTSTAMP:${cleanDate}T070000Z`);
    lines.push(`DTSTART;TZID=Europe/Warsaw:${cleanDate}T${startClean}`);
    lines.push(`DTEND;TZID=Europe/Warsaw:${cleanDate}T${endClean}`);
    lines.push(`SUMMARY:${summary.replace(/[,;]/g, ' ')}`);
    lines.push(`LOCATION:${item.room.replace(/[,;]/g, ' ')}`);
    lines.push(`DESCRIPTION:${descriptionParts.join('\\n').replace(/[,;]/g, ' ')}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `plan-uek-${groupName.replace(/[^a-zA-Z0-9_-]/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
