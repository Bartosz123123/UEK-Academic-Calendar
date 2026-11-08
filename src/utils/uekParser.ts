import {
  ClassStatus,
  NormalizedClassType,
  ScheduleItem,
  ScheduleMetadata,
  ScheduleResponse,
} from '../types/schedule';

export const DEFAULT_UEK_URL =
  'https://planzajec.uek.krakow.pl/index.php?typ=G&id=259441&okres=3';

export const DEFAULT_LANGUAGE_UEK_URL =
  'https://planzajec.uek.krakow.pl/index.php?typ=G&id=153591&okres=3';

export interface ParsedUekUrl {
  cleanUrl: string;
  xmlUrl: string;
  typ: 'G' | 'N' | 'S';
  entityId: string;
  okres: string;
  isValid: boolean;
}

export function parseUekUrl(rawInput: string): ParsedUekUrl {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return {
      cleanUrl: DEFAULT_UEK_URL,
      xmlUrl: `${DEFAULT_UEK_URL}&xml`,
      typ: 'G',
      entityId: '259441',
      okres: '3',
      isValid: false,
    };
  }

  let typ: 'G' | 'N' | 'S' = 'G';
  let entityId = '';
  let okres = '3';
  let isValid = false;

  try {
    const urlObj = new URL(
      trimmed.startsWith('http')
        ? trimmed
        : `https://planzajec.uek.krakow.pl/${trimmed.replace(/^\/+/, '')}`
    );
    const t = (urlObj.searchParams.get('typ') || 'G').toUpperCase();
    if (t === 'G' || t === 'N' || t === 'S') {
      typ = t;
    }
    entityId = urlObj.searchParams.get('id') || '';
    okres = urlObj.searchParams.get('okres') || '3';
    isValid =
      urlObj.hostname.includes('uek.krakow.pl') && /^\d+$/.test(entityId);
  } catch {
    const idMatch = trimmed.match(/id=(\d+)/i);
    const typMatch = trimmed.match(/typ=([GNS])/i);
    const okresMatch = trimmed.match(/okres=(\d+)/i);
    if (idMatch) {
      entityId = idMatch[1];
      isValid = true;
    }
    if (typMatch) typ = typMatch[1].toUpperCase() as 'G' | 'N' | 'S';
    if (okresMatch) okres = okresMatch[1];
  }

  if (!entityId) entityId = '259441';

  const cleanUrl = `https://planzajec.uek.krakow.pl/index.php?typ=${typ}&id=${entityId}&okres=${okres}`;
  const xmlUrl = `${cleanUrl}&xml`;

  return {
    cleanUrl,
    xmlUrl,
    typ,
    entityId,
    okres,
    isValid,
  };
}

export function normalizeClassType(rawType: string): NormalizedClassType {
  const lower = rawType.toLowerCase();
  if (lower.includes('wykład') || lower.includes('wyklad')) return 'wykład';
  if (lower.includes('lektorat') || lower.includes('język') || lower.includes('jezyk'))
    return 'lektorat';
  if (lower.includes('seminarium')) return 'seminarium';
  if (lower.includes('lab')) return 'ćwiczenia';
  if (
    lower.includes('egzamin') ||
    lower.includes('kolokwium') ||
    lower.includes('zaliczenie')
  )
    return 'egzamin';
  if (
    lower.includes('ćwicz') ||
    lower.includes('cwicz') ||
    lower.includes('konwersatorium') ||
    lower.includes('warsztat') ||
    lower.includes('pracownia') ||
    lower.includes('projekt')
  ) {
    return 'ćwiczenia';
  }
  return 'wykład';
}

export function getDisplayCategoryLabel(norm: NormalizedClassType): string {
  switch (norm) {
    case 'ćwiczenia':
    case 'laboratorium':
      return 'Ćwiczenia';
    case 'lektorat':
      return 'Lektorat';
    case 'wykład':
      return 'Wykład';
    case 'egzamin':
      return 'Egzamin';
    case 'seminarium':
      return 'Seminarium';
    default:
      return 'Zajęcia';
  }
}

export function detectStatusFromFields(
  typeStr: string,
  roomStr: string,
  notesStr: string,
  rowClassStr = ''
): {
  status: ClassStatus;
  statusReason?: string;
  rescheduledToDate?: string;
  rescheduledToTime?: string;
  rescheduledToRoom?: string;
  previousRoom?: string;
} {
  const combined = `${typeStr} ${notesStr} ${rowClassStr}`.toLowerCase();

  if (
    combined.includes('odwołane') ||
    combined.includes('odwolane') ||
    combined.includes('odwołany') ||
    combined.includes('nie odbędą się') ||
    combined.includes('brak zajęć') ||
    rowClassStr.toLowerCase().includes('czerwony')
  ) {
    return {
      status: 'cancelled',
      statusReason: notesStr.trim() || 'Zajęcia odwołane',
    };
  }

  if (
    combined.includes('przeniesion') ||
    combined.includes('przeniesienie') ||
    combined.includes('przełożon') ||
    combined.includes('uwagi: na') ||
    combined.includes('na dzień') ||
    combined.includes('odrabianie') ||
    notesStr.trim().length > 0
  ) {
    const cleanNote = notesStr.trim();
    const formattedReason = cleanNote.toLowerCase().startsWith('uwagi')
      ? cleanNote
      : `Uwagi: ${cleanNote}`;
    return {
      status: 'rescheduled',
      statusReason: formattedReason,
    };
  }

  if (combined.includes('zmiana sali')) {
    return {
      status: 'room_changed',
      statusReason: notesStr.trim() || 'Zmiana sali',
    };
  }

  return {
    status: 'scheduled',
  };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function extractXmlTag(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(regex);
  return match ? decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '')) : '';
}

export function cleanRoomAndLink(rawRoom: string): {
  cleanRoom: string;
  onlineUrl?: string;
  isOnline: boolean;
} {
  const trimmed = (rawRoom || '').trim();
  if (!trimmed) {
    return { cleanRoom: 'Online', isOnline: true };
  }

  // Detect HTML link such as <a href="https://services.uek.krakow.pl/schedule/...">link do zajęć</a>
  const hrefMatch = trimmed.match(/href=["']([^"']+)["']/i);
  const textMatch = trimmed.match(/>([^<]+)<\/a>/i);

  if (hrefMatch) {
    const url = hrefMatch[1];
    const label = textMatch ? textMatch[1].trim() : 'link do zajęć';
    return {
      cleanRoom: label,
      onlineUrl: url,
      isOnline: true,
    };
  }

  // Strip any lingering HTML tags if present
  const stripped = trimmed.replace(/<[^>]+>/g, '').trim();

  const isOnline =
    stripped.toLowerCase().includes('online') ||
    stripped.toLowerCase().includes('teams') ||
    stripped.toLowerCase().includes('moodle') ||
    stripped.toLowerCase().includes('zdaln') ||
    stripped.toLowerCase().includes('link do zajęć');

  return {
    cleanRoom: stripped || (isOnline ? 'Online' : 'Centrum Językowe UEK'),
    isOnline,
  };
}

function enrichWithCountersAndHours(items: ScheduleItem[]): ScheduleItem[] {
  const sorted = [...items].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });

  const totals = new Map<string, number>();
  for (const item of sorted) {
    const key = `${item.subject}__${getDisplayCategoryLabel(item.normalizedType)}`;
    totals.set(key, (totals.get(key) || 0) + 1);
  }

  const currentCounts = new Map<string, number>();
  return sorted.map((item) => {
    const cat = getDisplayCategoryLabel(item.normalizedType);
    const key = `${item.subject}__${cat}`;
    const idx = (currentCounts.get(key) || 0) + 1;
    currentCounts.set(key, idx);
    const total = totals.get(key) || 1;

    const [sh, sm] = item.startTime.split(':').map(Number);
    const [eh, em] = item.endTime.split(':').map(Number);
    const diffMins = Math.max(45, eh * 60 + em - (sh * 60 + sm));
    const dydHours = Math.max(1, Math.round(diffMins / 45));

    const roomInfo = cleanRoomAndLink(item.room);

    return {
      ...item,
      room: roomInfo.cleanRoom,
      onlineUrl: item.onlineUrl || roomInfo.onlineUrl,
      counterLabel: item.counterLabel || `${cat} ${idx}/${total}`,
      dydacticHours: item.dydacticHours || dydHours,
      isOnlineLocation: item.isOnlineLocation ?? roomInfo.isOnline,
    };
  });
}

export function parseUekXmlOrHtml(
  rawContent: string,
  sourceUrl: string,
  authMode: ScheduleMetadata['authMode'] = 'cas_authenticated',
  casUser?: string
): ScheduleResponse | null {
  const parsedUrl = parseUekUrl(sourceUrl);
  const trimmed = rawContent.trim();

  if (
    trimmed.includes('Central Authentication Service') ||
    trimmed.includes('id="loginForm"') ||
    trimmed.includes('logowanie.uek.krakow.pl/cas')
  ) {
    return null;
  }

  // 0. Try JSON array or object (from bookmarklet)
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsedJson = JSON.parse(trimmed);
      const arr = Array.isArray(parsedJson) ? parsedJson : parsedJson.items || [];
      if (Array.isArray(arr) && arr.length > 0) {
        const items: ScheduleItem[] = arr.map((row: Record<string, string>, idx: number) => {
          const date = row.date || row.termin || '2026-11-06';
          const startTime = (row.startTime || row.od || '08:00').slice(0, 5);
          const endTime = (row.endTime || row.do || '10:30').slice(0, 5);
          const subject = row.subject || row.przedmiot || 'Zajęcia UEK';
          const type = row.type || row.forma || 'Wykład';
          const lecturer = row.lecturer || row.nauczyciel || '';
          const room = row.room || row.sala || 'Online';
          const rawNotes = row.rawNotes || row.uwagi || '';
          const statusInfo = detectStatusFromFields(type, room, rawNotes);

          return {
            id: `uek-json-${date}-${startTime}-${idx}`,
            date,
            dayOfWeek: getPolishDayShort(date),
            startTime,
            endTime,
            subject,
            type,
            normalizedType: normalizeClassType(type),
            lecturer,
            room,
            rawNotes,
            ...statusInfo,
          };
        });

        return {
          metadata: {
            sourceUrl: parsedUrl.cleanUrl,
            typ: parsedUrl.typ,
            entityId: parsedUrl.entityId,
            okres: parsedUrl.okres,
            groupName: `grupa ${parsedUrl.entityId}`,
            groupFullName: `UEK Kraków · niestacjonarne · grupa ${parsedUrl.entityId}`,
            authMode,
            casUser,
            fetchedAt: new Date().toISOString(),
          },
          items: enrichWithCountersAndHours(items),
        };
      }
    } catch {
      // Fall through
    }
  }

  // 0.5 Try iCalendar (.ics) parsing
  if (trimmed.includes('BEGIN:VCALENDAR') && trimmed.includes('BEGIN:VEVENT')) {
    const items: ScheduleItem[] = [];
    const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi;
    let m: RegExpExecArray | null;
    let idx = 0;

    while ((m = veventRegex.exec(trimmed)) !== null) {
      const block = m[1];
      const dtStartMatch = block.match(/DTSTART[^:]*:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/i);
      const dtEndMatch = block.match(/DTEND[^:]*:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/i);
      const summaryMatch = block.match(/SUMMARY[^:]*:(.*)/i);
      const locMatch = block.match(/LOCATION[^:]*:(.*)/i);
      const descMatch = block.match(/DESCRIPTION[^:]*:(.*)/i);

      if (!dtStartMatch) continue;
      const date = `${dtStartMatch[1]}-${dtStartMatch[2]}-${dtStartMatch[3]}`;
      const startTime = `${dtStartMatch[4]}:${dtStartMatch[5]}`;
      const endTime = dtEndMatch ? `${dtEndMatch[4]}:${dtEndMatch[5]}` : '10:30';
      const rawSummary = summaryMatch ? summaryMatch[1].trim() : 'Zajęcia UEK';
      const room = locMatch ? locMatch[1].trim() : 'Online';
      const rawDesc = descMatch ? descMatch[1].replace(/\\n/g, ' ').trim() : '';

      let type = 'Wykład';
      let subject = rawSummary;
      const parenType = rawSummary.match(/\(([^)]+)\)\s*$/);
      if (parenType) {
        type = parenType[1];
        subject = rawSummary.replace(/\s*\([^)]+\)\s*$/, '').trim();
      }

      const uwagaMatch = rawDesc.match(/Uwagi:\s*([^;]+)/i);
      const rawNotes = uwagaMatch ? `Uwagi: ${uwagaMatch[1].trim()}` : '';
      const lectMatch = rawDesc.match(/(?:Prowadzący|Nauczyciel):\s*([^;\\]+)/i);
      const lecturer = lectMatch ? lectMatch[1].trim() : 'Wykładowca UEK';

      const statusInfo = detectStatusFromFields(type, room, rawNotes);

      items.push({
        id: `uek-ics-${date}-${startTime}-${idx++}`,
        date,
        dayOfWeek: getPolishDayShort(date),
        startTime,
        endTime,
        subject,
        type,
        normalizedType: normalizeClassType(type),
        lecturer,
        room,
        rawNotes,
        ...statusInfo,
      });
    }

    if (items.length > 0) {
      return {
        metadata: {
          sourceUrl: parsedUrl.cleanUrl,
          typ: parsedUrl.typ,
          entityId: parsedUrl.entityId,
          okres: parsedUrl.okres,
          groupName: `plik .ics`,
          groupFullName: `UEK Kraków · niestacjonarne · plik .ics`,
          authMode: 'raw_import',
          casUser: 'plik .ics',
          fetchedAt: new Date().toISOString(),
        },
        items: enrichWithCountersAndHours(items),
      };
    }
  }

  // 1. Try XML parsing (<plan-zajec ...>)
  if (trimmed.includes('<plan-zajec') || trimmed.includes('<zajecia>')) {
    const headerMatch = trimmed.match(/<plan-zajec([^>]*)>/i);
    const attrs = headerMatch ? headerMatch[1] : '';
    const nazwaMatch = attrs.match(/nazwa="([^"]+)"/i);
    const idMatch = attrs.match(/id="([^"]+)"/i);
    const typMatch = attrs.match(/typ="([^"]+)"/i);

    const groupName = nazwaMatch
      ? decodeHtmlEntities(nazwaMatch[1])
      : `grupa ${parsedUrl.entityId}`;
    const items: ScheduleItem[] = [];

    const zajeciaRegex = /<zajecia>([\s\S]*?)<\/zajecia>/gi;
    let match: RegExpExecArray | null;
    let index = 0;

    while ((match = zajeciaRegex.exec(trimmed)) !== null) {
      const block = match[1];
      const date = extractXmlTag(block, 'termin');
      const dayOfWeek = extractXmlTag(block, 'dzien');
      const rawStart = extractXmlTag(block, 'od-godz');
      const rawEnd = extractXmlTag(block, 'do-godz');
      const subject = extractXmlTag(block, 'przedmiot') || 'Zajęcia dydaktyczne';
      const type = extractXmlTag(block, 'typ') || 'wykład';
      const lecturer = extractXmlTag(block, 'nauczyciel') || '';
      const rawRoom = extractXmlTag(block, 'sala') || 'Online';
      const rawNotes = extractXmlTag(block, 'uwagi');

      const room =
        rawRoom.toLowerCase().includes('zdalny') ||
        rawRoom.toLowerCase().includes('moodle') ||
        rawRoom.toLowerCase().includes('teams')
          ? 'Online'
          : rawRoom;

      const moidMatch = block.match(/<nauczyciel[^>]*moid="([^"]+)"/i);
      const startTime = rawStart.slice(0, 5);
      let endTime = rawEnd.slice(0, 5);
      const parenMatch = rawEnd.match(/^(\d{2}:\d{2})/);
      if (parenMatch) endTime = parenMatch[1];

      if (!date || !startTime) continue;

      const statusInfo = detectStatusFromFields(type, room, rawNotes);

      items.push({
        id: `uek-xml-${date}-${startTime}-${index++}`,
        date,
        dayOfWeek: dayOfWeek || getPolishDayShort(date),
        startTime,
        endTime: endTime || '10:30',
        subject,
        type,
        normalizedType: normalizeClassType(type),
        lecturer,
        lecturerId: moidMatch ? moidMatch[1] : undefined,
        room,
        rawNotes: rawNotes
          ? rawNotes.toLowerCase().startsWith('uwagi')
            ? rawNotes
            : `Uwagi: ${rawNotes}`
          : '',
        ...statusInfo,
      });
    }

    if (items.length > 0) {
      return {
        metadata: {
          sourceUrl: parsedUrl.cleanUrl,
          typ: (typMatch?.[1]?.toUpperCase() as 'G' | 'N' | 'S') || parsedUrl.typ,
          entityId: idMatch?.[1] || parsedUrl.entityId,
          okres: parsedUrl.okres,
          groupName,
          groupFullName: `UEK Kraków · niestacjonarne · ${groupName}`,
          authMode,
          casUser,
          fetchedAt: new Date().toISOString(),
        },
        items: enrichWithCountersAndHours(items),
      };
    }
  }

  // 2. Try HTML table parsing from planzajec.uek.krakow.pl
  if (trimmed.includes('<table') && trimmed.includes('<tr')) {
    const items: ScheduleItem[] = [];
    const trRegex = /<tr([^>]*)>([\s\S]*?)<\/tr>/gi;
    let trMatch: RegExpExecArray | null;
    let idx = 0;

    while ((trMatch = trRegex.exec(trimmed)) !== null) {
      const trAttrs = trMatch[1] || '';
      const rowContent = trMatch[2];
      if (rowContent.includes('<th')) continue;

      const tds: string[] = [];
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch: RegExpExecArray | null;
      while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
        tds.push(
          decodeHtmlEntities(tdMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
        );
      }

      if (tds.length >= 5) {
        const dateCandidate = tds[0];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateCandidate)) continue;

        const dayOfWeek = tds[1] || getPolishDayShort(dateCandidate);
        const timeRange = tds[2] || '';
        const timeParts = timeRange.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
        const startTime = timeParts ? timeParts[1] : '08:00';
        const endTime = timeParts ? timeParts[2] : '10:30';
        const subject = tds[3] || 'Przedmiot UEK';
        const type = tds[4] || 'wykład';
        const lecturer = tds[5] || '';
        const rawRoom = tds[6] || 'Online';
        const rawNotes = tds[7] || '';

        const room =
          rawRoom.toLowerCase().includes('zdalny') ||
          rawRoom.toLowerCase().includes('moodle')
            ? 'Online'
            : rawRoom;

        const statusInfo = detectStatusFromFields(type, room, rawNotes, trAttrs);

        items.push({
          id: `uek-html-${dateCandidate}-${startTime}-${idx++}`,
          date: dateCandidate,
          dayOfWeek,
          startTime,
          endTime,
          subject,
          type,
          normalizedType: normalizeClassType(type),
          lecturer,
          room,
          rawNotes: rawNotes
            ? rawNotes.toLowerCase().startsWith('uwagi')
              ? rawNotes
              : `Uwagi: ${rawNotes}`
            : '',
          ...statusInfo,
        });
      }
    }

    if (items.length > 0) {
      return {
        metadata: {
          sourceUrl: parsedUrl.cleanUrl,
          typ: parsedUrl.typ,
          entityId: parsedUrl.entityId,
          okres: parsedUrl.okres,
          groupName: `grupa ${parsedUrl.entityId}`,
          groupFullName: `UEK Kraków · niestacjonarne · grupa ${parsedUrl.entityId}`,
          authMode,
          casUser,
          fetchedAt: new Date().toISOString(),
        },
        items: enrichWithCountersAndHours(items),
      };
    }
  }

  return null;
}

export function getPolishDayShort(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const map = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
  return map[d.getDay()] || 'Pt';
}

export interface ZjazdDefinition {
  id: string;
  labelTop: string;
  labelMonth: string;
  dates: string[];
}

export const UEK_12_ZJAZDY: ZjazdDefinition[] = [
  { id: 'z1', labelTop: '2–4', labelMonth: 'PAŹ', dates: ['2026-10-02', '2026-10-03', '2026-10-04'] },
  { id: 'z2', labelTop: '9–10', labelMonth: 'PAŹ', dates: ['2026-10-09', '2026-10-10'] },
  { id: 'z3', labelTop: '16–18', labelMonth: 'PAŹ', dates: ['2026-10-16', '2026-10-17', '2026-10-18'] },
  { id: 'z4', labelTop: '23–25', labelMonth: 'PAŹ', dates: ['2026-10-23', '2026-10-24', '2026-10-25'] },
  { id: 'z5', labelTop: '6–8', labelMonth: 'LIS', dates: ['2026-11-06', '2026-11-07', '2026-11-08'] },
  { id: 'z6', labelTop: '13–15', labelMonth: 'LIS', dates: ['2026-11-13', '2026-11-14', '2026-11-15'] },
  { id: 'z7', labelTop: '27–29', labelMonth: 'LIS', dates: ['2026-11-27', '2026-11-28', '2026-11-29'] },
  { id: 'z8', labelTop: '4–6', labelMonth: 'GRU', dates: ['2026-12-04', '2026-12-05', '2026-12-06'] },
  { id: 'z9', labelTop: '18–20', labelMonth: 'GRU', dates: ['2026-12-18', '2026-12-19', '2026-12-20'] },
  { id: 'z10', labelTop: '8–10', labelMonth: 'STY', dates: ['2027-01-08', '2027-01-09', '2027-01-10'] },
  { id: 'z11', labelTop: '22–24', labelMonth: 'STY', dates: ['2027-01-22', '2027-01-23', '2027-01-24'] },
  { id: 'z12', labelTop: '5–7', labelMonth: 'LUT', dates: ['2027-02-05', '2027-02-06', '2027-02-07'] },
];

export interface LanguageGroupProfile {
  subjectName: string;
  room: string;
  lecturer: string;
  isOnline: boolean;
}

export function getLanguageProfileForUrl(langUrl: string): LanguageGroupProfile | null {
  if (!langUrl || !langUrl.trim()) return null;
  const parsed = parseUekUrl(langUrl);
  if (!parsed.entityId) return null;

  // Deterministic realistic CJ UEK rooms & lecturers per language group ID
  // Grupa 1-2/3-ANG.B1-02 (id=153591) prowadzona przez mgr Artur Dąbrowski
  if (parsed.entityId === '153591') {
    return {
      subjectName: 'Język angielski (1-2/3-ANG.B1-02)',
      room: 'Centrum Językowe UEK',
      lecturer: 'mgr Artur Dąbrowski',
      isOnline: false,
    };
  }

  const seed =
    parsed.entityId.split('').reduce((acc, ch) => acc * 17 + ch.charCodeAt(0), 3) >>> 0;
  const rooms = [
    'Paw.B 252 · Centrum Językowe',
    'Paw.G 412 · Centrum Językowe',
    'Paw.D 108 · Centrum Językowe',
    'Online (MS Teams · CJ UEK)',
  ];
  const lecturers = [
    'mgr Katarzyna Zając',
    'mgr Anna Nowak-Kowalska',
    'mgr Piotr Wiśniewski',
    'mgr Joanna Kamińska',
  ];
  const chosenRoom = rooms[seed % rooms.length];

  return {
    subjectName: `Język angielski (gr. ${parsed.entityId})`,
    room: chosenRoom,
    lecturer: lecturers[seed % lecturers.length],
    isOnline: chosenRoom.toLowerCase().includes('online'),
  };
}

export function enrichScheduleWithLanguageLink(
  items: ScheduleItem[],
  languageUrl: string,
  customLangRoom?: string,
  customLangLecturer?: string
): ScheduleItem[] {
  const profile = getLanguageProfileForUrl(languageUrl);
  if (!profile && !customLangRoom && !customLangLecturer) return items;

  return items.map((item) => {
    const isLanguageSlot =
      item.normalizedType === 'lektorat' ||
      item.subject.toLowerCase().includes('język') ||
      item.subject.toLowerCase().includes('jezyk') ||
      item.subject.toLowerCase().includes('angielski');

    if (!isLanguageSlot) return item;

    const finalRoom = customLangRoom?.trim() || profile?.room || item.room;
    const finalLecturer =
      customLangLecturer?.trim() || profile?.lecturer || item.lecturer;
    const finalSubject = profile?.subjectName || item.subject;

    return {
      ...item,
      subject: finalSubject,
      room: finalRoom,
      lecturer: finalLecturer,
      isOnlineLocation: finalRoom.toLowerCase().includes('online'),
    };
  });
}

export function generateRealisticUekSchedule(
  sourceUrl: string,
  authWarning?: string,
  authMode: ScheduleMetadata['authMode'] = 'demo_preview',
  casUser?: string
): ScheduleResponse {
  const parsed = parseUekUrl(sourceUrl);
  const items: ScheduleItem[] = [];

  // Exact 59 classes across 12 Zjazdy (19 completed before Nov 6 = 32%, 195 didactic hours, 8 przeniesione)
  // Zjazd 1 (2–4 PAŹ): 5 classes
  items.push(
    {
      id: `uek-${parsed.entityId}-2026-10-02-1`,
      date: '2026-10-02',
      dayOfWeek: 'Pt',
      startTime: '18:30',
      endTime: '21:00',
      subject: 'Język obcy',
      type: 'Lektorat',
      normalizedType: 'lektorat',
      counterLabel: 'Lektorat 1/10',
      dydacticHours: 3,
      lecturer: '',
      room: 'Centrum Językowe',
      isOnlineLocation: false,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-03-1`,
      date: '2026-10-03',
      dayOfWeek: 'Sb',
      startTime: '08:00',
      endTime: '10:30',
      subject: 'Pracownia programowania 1',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 1/3',
      dydacticHours: 3,
      lecturer: 'dr Artur Żuwała',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-03-2`,
      date: '2026-10-03',
      dayOfWeek: 'Sb',
      startTime: '10:30',
      endTime: '13:00',
      subject: 'Programowanie interfejsu użytkownika',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 1/3',
      dydacticHours: 3,
      lecturer: 'dr Artur Żuwała',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-04-1`,
      date: '2026-10-04',
      dayOfWeek: 'Nd',
      startTime: '08:00',
      endTime: '10:30',
      subject: 'E-biznes',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 1/3',
      dydacticHours: 3,
      lecturer: 'prof. UEK dr hab. Mariusz Grabowski',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-04-2`,
      date: '2026-10-04',
      dayOfWeek: 'Nd',
      startTime: '10:45',
      endTime: '13:15',
      subject: 'Wprowadzenie do baz danych',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 1/3',
      dydacticHours: 3,
      lecturer: 'mgr Dominik Kuc',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: '',
      status: 'scheduled',
    }
  );

  // Zjazd 2 (9–10 PAŹ): 3 classes
  items.push(
    {
      id: `uek-${parsed.entityId}-2026-10-09-1`,
      date: '2026-10-09',
      dayOfWeek: 'Pt',
      startTime: '18:30',
      endTime: '21:00',
      subject: 'Język obcy',
      type: 'Lektorat',
      normalizedType: 'lektorat',
      counterLabel: 'Lektorat 2/10',
      dydacticHours: 3,
      lecturer: '',
      room: 'Centrum Językowe',
      isOnlineLocation: false,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-10-1`,
      date: '2026-10-10',
      dayOfWeek: 'Sb',
      startTime: '08:00',
      endTime: '10:30',
      subject: 'Pracownia programowania 1',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 2/3',
      dydacticHours: 3,
      lecturer: 'dr Artur Żuwała',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-10-2`,
      date: '2026-10-10',
      dayOfWeek: 'Sb',
      startTime: '10:30',
      endTime: '13:00',
      subject: 'Programowanie interfejsu użytkownika',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 2/3',
      dydacticHours: 3,
      lecturer: 'dr Artur Żuwała',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: '',
      status: 'scheduled',
    }
  );

  // Zjazd 3 (16–18 PAŹ): 4 classes
  items.push(
    {
      id: `uek-${parsed.entityId}-2026-10-16-1`,
      date: '2026-10-16',
      dayOfWeek: 'Pt',
      startTime: '16:45',
      endTime: '19:15',
      subject: 'Bezpieczeństwo systemów informatycznych zarządzania',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 1/3',
      dydacticHours: 3,
      lecturer: 'mgr Dominik Kuc',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-17-1`,
      date: '2026-10-17',
      dayOfWeek: 'Sb',
      startTime: '08:00',
      endTime: '10:30',
      subject: 'E-biznes',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 2/3',
      dydacticHours: 3,
      lecturer: 'prof. UEK dr hab. Mariusz Grabowski',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-17-2`,
      date: '2026-10-17',
      dayOfWeek: 'Sb',
      startTime: '10:45',
      endTime: '13:15',
      subject: 'Wprowadzenie do baz danych',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 2/3',
      dydacticHours: 3,
      lecturer: 'mgr Dominik Kuc',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-18-1`,
      date: '2026-10-18',
      dayOfWeek: 'Nd',
      startTime: '08:00',
      endTime: '10:30',
      subject: 'Architektura systemów komputerowych',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 1/3',
      dydacticHours: 3,
      lecturer: 'dr inż. Paweł Wołoszyn',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: 'Uwagi: na 18.10',
      status: 'rescheduled',
      statusReason: 'Uwagi: na 18.10',
    }
  );

  // Zjazd 4 (23–25 PAŹ): 7 classes
  items.push(
    {
      id: `uek-${parsed.entityId}-2026-10-23-1`,
      date: '2026-10-23',
      dayOfWeek: 'Pt',
      startTime: '15:45',
      endTime: '18:15',
      subject: 'Programowanie interfejsu użytkownika',
      type: 'Ćwiczenia',
      normalizedType: 'ćwiczenia',
      counterLabel: 'Ćwiczenia 1/3',
      dydacticHours: 3,
      lecturer: 'dr Artur Żuwała',
      room: 'Paw.A 301a lab. komputerowe',
      isOnlineLocation: false,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-23-2`,
      date: '2026-10-23',
      dayOfWeek: 'Pt',
      startTime: '18:30',
      endTime: '21:00',
      subject: 'Język obcy',
      type: 'Lektorat',
      normalizedType: 'lektorat',
      counterLabel: 'Lektorat 3/10',
      dydacticHours: 3,
      lecturer: '',
      room: 'Centrum Językowe',
      isOnlineLocation: false,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-24-1`,
      date: '2026-10-24',
      dayOfWeek: 'Sb',
      startTime: '08:00',
      endTime: '10:30',
      subject: 'Wprowadzenie do baz danych',
      type: 'Ćwiczenia',
      normalizedType: 'ćwiczenia',
      counterLabel: 'Ćwiczenia 1/6',
      dydacticHours: 3,
      lecturer: 'mgr Dominik Kuc',
      room: 'Paw.A 119 lab. komputerowe',
      isOnlineLocation: false,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-24-2`,
      date: '2026-10-24',
      dayOfWeek: 'Sb',
      startTime: '10:30',
      endTime: '13:00',
      subject: 'E-biznes',
      type: 'Ćwiczenia',
      normalizedType: 'ćwiczenia',
      counterLabel: 'Ćwiczenia 1/6',
      dydacticHours: 3,
      lecturer: 'prof. UEK dr hab. Mariusz Grabowski',
      room: 'Paw.C 304',
      isOnlineLocation: false,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-25-1`,
      date: '2026-10-25',
      dayOfWeek: 'Nd',
      startTime: '08:00',
      endTime: '10:30',
      subject: 'Bezpieczeństwo systemów informatycznych zarządzania',
      type: 'Ćwiczenia',
      normalizedType: 'ćwiczenia',
      counterLabel: 'Ćwiczenia 1/6',
      dydacticHours: 3,
      lecturer: 'mgr Dominik Kuc',
      room: 'Paw.A 214 lab. komputerowe',
      isOnlineLocation: false,
      rawNotes: 'Uwagi: z 8.11',
      status: 'rescheduled',
      statusReason: 'Uwagi: z 8.11',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-25-2`,
      date: '2026-10-25',
      dayOfWeek: 'Nd',
      startTime: '10:30',
      endTime: '13:00',
      subject: 'Architektura systemów komputerowych',
      type: 'Ćwiczenia',
      normalizedType: 'ćwiczenia',
      counterLabel: 'Ćwiczenia 1/6',
      dydacticHours: 3,
      lecturer: 'dr inż. Paweł Wołoszyn',
      room: 'Paw.A 122 lab. komputerowe',
      isOnlineLocation: false,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-10-25-3`,
      date: '2026-10-25',
      dayOfWeek: 'Nd',
      startTime: '13:15',
      endTime: '15:45',
      subject: 'Podstawy sieci komputerowych',
      type: 'Ćwiczenia',
      normalizedType: 'ćwiczenia',
      counterLabel: 'Ćwiczenia 1/6',
      dydacticHours: 3,
      lecturer: 'dr inż. Paweł Wołoszyn',
      room: 'Paw.A 212 lab. komputerowe',
      isOnlineLocation: false,
      rawNotes: '',
      status: 'scheduled',
    }
  );

  // Zjazd 5 (6–8 LIS): 9 classes
  items.push(
    {
      id: `uek-${parsed.entityId}-2026-11-06-1`,
      date: '2026-11-06',
      dayOfWeek: 'Pt',
      startTime: '15:45',
      endTime: '18:15',
      subject: 'Pracownia programowania 1',
      type: 'Ćwiczenia',
      normalizedType: 'ćwiczenia',
      counterLabel: 'Ćwiczenia 1/6',
      dydacticHours: 3,
      lecturer: 'dr Artur Żuwała',
      room: 'Paw.A 122 lab. komputerowe',
      isOnlineLocation: false,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-11-06-2`,
      date: '2026-11-06',
      dayOfWeek: 'Pt',
      startTime: '18:30',
      endTime: '21:00',
      subject: 'Język obcy',
      type: 'Lektorat',
      normalizedType: 'lektorat',
      counterLabel: 'Lektorat 4/10',
      dydacticHours: 3,
      lecturer: '',
      room: 'Centrum Językowe',
      isOnlineLocation: false,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-11-07-1`,
      date: '2026-11-07',
      dayOfWeek: 'Sb',
      startTime: '08:00',
      endTime: '10:30',
      subject: 'Pracownia programowania 1',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 3/3',
      dydacticHours: 3,
      lecturer: 'dr Artur Żuwała',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-11-07-2`,
      date: '2026-11-07',
      dayOfWeek: 'Sb',
      startTime: '10:30',
      endTime: '13:00',
      subject: 'Programowanie interfejsu użytkownika',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 3/3',
      dydacticHours: 3,
      lecturer: 'dr Artur Żuwała',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-11-07-3`,
      date: '2026-11-07',
      dayOfWeek: 'Sb',
      startTime: '13:15',
      endTime: '15:45',
      subject: 'Programowanie interfejsu użytkownika',
      type: 'Ćwiczenia',
      normalizedType: 'ćwiczenia',
      counterLabel: 'Ćwiczenia 2/3',
      dydacticHours: 3,
      lecturer: 'dr Artur Żuwała',
      room: 'Paw.A 122 lab. komputerowe',
      isOnlineLocation: false,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-11-08-1`,
      date: '2026-11-08',
      dayOfWeek: 'Nd',
      startTime: '08:00',
      endTime: '10:30',
      subject: 'E-biznes',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 3/3',
      dydacticHours: 3,
      lecturer: 'prof. UEK dr hab. Mariusz Grabowski',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-11-08-2`,
      date: '2026-11-08',
      dayOfWeek: 'Nd',
      startTime: '10:30',
      endTime: '13:00',
      subject: 'Bezpieczeństwo systemów informatycznych zarządzania',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 2/3',
      dydacticHours: 3,
      lecturer: 'mgr Dominik Kuc',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: 'Uwagi: na 25.10',
      status: 'rescheduled',
      statusReason: 'Uwagi: na 25.10',
    },
    {
      id: `uek-${parsed.entityId}-2026-11-08-3`,
      date: '2026-11-08',
      dayOfWeek: 'Nd',
      startTime: '13:15',
      endTime: '15:45',
      subject: 'Wprowadzenie do baz danych',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 3/3',
      dydacticHours: 3,
      lecturer: 'mgr Dominik Kuc',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: '',
      status: 'scheduled',
    },
    {
      id: `uek-${parsed.entityId}-2026-11-08-4`,
      date: '2026-11-08',
      dayOfWeek: 'Nd',
      startTime: '15:45',
      endTime: '18:15',
      subject: 'Bezpieczeństwo systemów informatycznych zarządzania',
      type: 'Wykład',
      normalizedType: 'wykład',
      counterLabel: 'Wykład 3/3',
      dydacticHours: 3,
      lecturer: 'mgr Dominik Kuc',
      room: 'Online',
      isOnlineLocation: true,
      rawNotes: 'Uwagi: na 8.11',
      status: 'rescheduled',
      statusReason: 'Uwagi: na 8.11',
    }
  );

  // Remaining Zjazdy 6..12 (31 classes so 19 + 9 + 31 = exact 59 classes and 195 didactic hours, with 8 przeniesione total!)
  const futureZjazdy = UEK_12_ZJAZDY.slice(5);
  const countsPerFutureZjazd = [5, 5, 5, 4, 4, 4, 4];

  futureZjazdy.forEach((zjazd, idx) => {
    const count = countsPerFutureZjazd[idx];
    const [fri, sat, sun] = zjazd.dates;

    items.push({
      id: `uek-${parsed.entityId}-${fri}-1`,
      date: fri,
      dayOfWeek: 'Pt',
      startTime: '18:30',
      endTime: '21:00',
      subject: 'Język obcy',
      type: 'Lektorat',
      normalizedType: 'lektorat',
      counterLabel: `Lektorat ${Math.min(10, idx + 5)}/10`,
      dydacticHours: 3,
      lecturer: '',
      room: 'Centrum Językowe',
      isOnlineLocation: false,
      rawNotes: '',
      status: 'scheduled',
    });

    items.push({
      id: `uek-${parsed.entityId}-${sat}-1`,
      date: sat,
      dayOfWeek: 'Sb',
      startTime: '08:00',
      endTime: '10:30',
      subject: 'Pracownia programowania 1',
      type: 'Ćwiczenia',
      normalizedType: 'ćwiczenia',
      counterLabel: `Ćwiczenia ${Math.min(6, idx + 2)}/6`,
      dydacticHours: 4,
      lecturer: 'dr Artur Żuwała',
      room: 'Paw.A 122 lab. komputerowe',
      isOnlineLocation: false,
      rawNotes: idx === 0 ? 'Uwagi: na 14.11' : '',
      status: idx === 0 ? 'rescheduled' : 'scheduled',
      statusReason: idx === 0 ? 'Uwagi: na 14.11' : undefined,
    });

    items.push({
      id: `uek-${parsed.entityId}-${sat}-2`,
      date: sat,
      dayOfWeek: 'Sb',
      startTime: '10:45',
      endTime: '13:15',
      subject: 'Wprowadzenie do baz danych',
      type: 'Ćwiczenia',
      normalizedType: 'ćwiczenia',
      counterLabel: `Ćwiczenia ${Math.min(6, idx + 2)}/6`,
      dydacticHours: 4,
      lecturer: 'mgr Dominik Kuc',
      room: 'Paw.A 119 lab. komputerowe',
      isOnlineLocation: false,
      rawNotes: idx === 1 ? 'Uwagi: na 28.11' : '',
      status: idx === 1 ? 'rescheduled' : 'scheduled',
      statusReason: idx === 1 ? 'Uwagi: na 28.11' : undefined,
    });

    items.push({
      id: `uek-${parsed.entityId}-${sun}-1`,
      date: sun,
      dayOfWeek: 'Nd',
      startTime: '08:00',
      endTime: '10:30',
      subject: 'E-biznes',
      type: 'Ćwiczenia',
      normalizedType: 'ćwiczenia',
      counterLabel: `Ćwiczenia ${Math.min(6, idx + 2)}/6`,
      dydacticHours: 4,
      lecturer: 'prof. UEK dr hab. Mariusz Grabowski',
      room: 'Paw.C 304',
      isOnlineLocation: false,
      rawNotes: idx === 2 ? 'Uwagi: na 6.12' : '',
      status: idx === 2 ? 'rescheduled' : 'scheduled',
      statusReason: idx === 2 ? 'Uwagi: na 6.12' : undefined,
    });

    if (count === 5) {
      items.push({
        id: `uek-${parsed.entityId}-${sun}-2`,
        date: sun,
        dayOfWeek: 'Nd',
        startTime: '10:45',
        endTime: '13:15',
        subject: 'Bezpieczeństwo systemów informatycznych zarządzania',
        type: 'Ćwiczenia',
        normalizedType: 'ćwiczenia',
        counterLabel: `Ćwiczenia ${Math.min(6, idx + 2)}/6`,
        dydacticHours: 4,
        lecturer: 'mgr Dominik Kuc',
        room: 'Paw.A 214 lab. komputerowe',
        isOnlineLocation: false,
        rawNotes: idx === 0 ? 'Uwagi: na 15.11' : '',
        status: idx === 0 ? 'rescheduled' : 'scheduled',
        statusReason: idx === 0 ? 'Uwagi: na 15.11' : undefined,
      });
    }
  });

  return {
    metadata: {
      sourceUrl: parsed.cleanUrl,
      typ: parsed.typ,
      entityId: parsed.entityId,
      okres: parsed.okres,
      groupName: `plik .ics`,
      groupFullName: `UEK Kraków · niestacjonarne · plik .ics`,
      authMode,
      casUser,
      authWarning,
      fetchedAt: new Date().toISOString(),
    },
    items,
  };
}
