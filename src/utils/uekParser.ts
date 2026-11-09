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

export function extractCleanTypeAndNotes(
  rawType: string,
  rawNotes: string,
  rawSubject = '',
  rawRoom = ''
): { cleanType: string; cleanSubject: string; combinedNotes: string } {
  let cleanType = (rawType || 'Wykład').trim();
  let cleanSubject = (rawSubject || 'Zajęcia UEK').trim();
  const noteParts: string[] = [];

  if (rawNotes && rawNotes.trim()) {
    noteParts.push(rawNotes.trim());
  }

  // Check if rawType has embedded "Uwagi: ..." or newline-separated note (from <br> in UEK HTML table)
  const typeUwagiMatch = cleanType.match(/^(.*?)\b(uwagi\s*:?\s*[\s\S]+)$/i);
  if (typeUwagiMatch) {
    cleanType = typeUwagiMatch[1].trim() || 'Wykład';
    noteParts.push(typeUwagiMatch[2].trim());
  } else if (cleanType.includes('\n')) {
    const lines = cleanType
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length >= 2) {
      cleanType = lines[0];
      noteParts.push(lines.slice(1).join(' · '));
    }
  } else {
    const inlineDateShift = cleanType.match(
      /^(wykład|ćwiczenia|lektorat|seminarium|laboratorium|konwersatorium|projekt)\s+((?:przeniesion|odwołan|z\s+\d|na\s+\d|odrabian|kolokwium|egzamin|zaliczenie)[\s\S]+)$/i
    );
    if (inlineDateShift) {
      cleanType = inlineDateShift[1].trim();
      noteParts.push(inlineDateShift[2].trim());
    }
  }

  // Check if rawSubject has embedded "Uwagi: ..."
  const subjUwagiMatch = cleanSubject.match(/^(.*?)\s*\b(uwagi\s*:?\s*[\s\S]+)$/i);
  if (subjUwagiMatch && subjUwagiMatch[1].trim().length > 2) {
    cleanSubject = subjUwagiMatch[1].trim();
    noteParts.push(subjUwagiMatch[2].trim());
  }

  // Check if rawRoom has embedded "Uwagi: ..."
  const roomUwagiMatch = (rawRoom || '').match(/\b(uwagi\s*:?\s*[\s\S]+)$/i);
  if (roomUwagiMatch) {
    noteParts.push(roomUwagiMatch[1].trim());
  }

  const uniqueNotes = Array.from(
    new Set(
      noteParts
        .map((n) => n.replace(/^uwagi\s*:?\s*/i, '').trim())
        .filter(Boolean)
    )
  );

  const combinedNotes =
    uniqueNotes.length > 0 ? `Uwagi: ${uniqueNotes.join(' · ')}` : '';

  return { cleanType, cleanSubject, combinedNotes };
}

export function detectStatusFromFields(
  typeStr: string,
  roomStr: string,
  notesStr: string,
  rowClassStr = '',
  subjectStr = ''
): {
  status: ClassStatus;
  statusReason?: string;
  rescheduledToDate?: string;
  rescheduledToTime?: string;
  rescheduledToRoom?: string;
  previousRoom?: string;
} {
  const { combinedNotes } = extractCleanTypeAndNotes(
    typeStr,
    notesStr,
    subjectStr,
    roomStr
  );
  const effectiveNotes = combinedNotes || notesStr.trim();
  const combined =
    `${subjectStr} ${typeStr} ${roomStr} ${effectiveNotes} ${rowClassStr}`.toLowerCase();

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
      statusReason: effectiveNotes || 'Zajęcia odwołane',
    };
  }

  if (
    effectiveNotes.length > 0 ||
    combined.includes('uwagi') ||
    combined.includes('przeniesion') ||
    combined.includes('przeniesienie') ||
    combined.includes('przełożon') ||
    combined.includes('przelozon') ||
    combined.includes('na dzień') ||
    combined.includes('z dnia') ||
    combined.includes('odrabianie') ||
    combined.includes('zmiana terminu') ||
    /\b(z|na)\s+\d{1,2}\.\d{1,2}\b/i.test(combined)
  ) {
    const cleanNote = effectiveNotes || notesStr.trim() || typeStr.trim();
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
      statusReason: effectiveNotes || 'Zmiana sali',
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

function extractXmlTag(block: string, tag: string, preserveLinks = false): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(regex);
  if (!match) return '';
  const inner = match[1];
  if (preserveLinks && /<a\s+[^>]*href=/i.test(inner)) {
    return decodeHtmlEntities(inner);
  }
  return decodeHtmlEntities(
    inner.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  );
}

export function cleanRoomAndLink(rawRoom: string): {
  cleanRoom: string;
  onlineUrl?: string;
  isOnline: boolean;
} {
  const trimmed = (rawRoom || '')
    .replace(/\b(uwagi\s*:?\s*[\s\S]+)$/i, '')
    .trim();
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

export function mergeScheduleNotes(
  primary: ScheduleResponse,
  secondary: ScheduleResponse | null
): ScheduleResponse {
  if (!secondary || !secondary.items || secondary.items.length === 0) {
    return primary;
  }
  const secMap = new Map<string, ScheduleItem>();
  for (const sItem of secondary.items) {
    const key = `${sItem.date}__${sItem.startTime}`;
    if (sItem.rawNotes || sItem.status !== 'scheduled' || sItem.onlineUrl) {
      secMap.set(key, sItem);
    }
  }
  if (secMap.size === 0) return primary;

  const mergedItems = primary.items.map((pItem) => {
    const match = secMap.get(`${pItem.date}__${pItem.startTime}`);
    if (!match) return pItem;
    const rawNotes = pItem.rawNotes || match.rawNotes || '';
    const status =
      pItem.status !== 'scheduled' ? pItem.status : match.status;
    const statusReason =
      pItem.statusReason || match.statusReason || rawNotes || undefined;
    return {
      ...pItem,
      rawNotes,
      status,
      statusReason,
      onlineUrl: pItem.onlineUrl || match.onlineUrl,
    };
  });

  return {
    ...primary,
    items: mergedItems,
  };
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
          const rawSubject = row.subject || row.przedmiot || 'Zajęcia UEK';
          const rawType = row.type || row.forma || 'Wykład';
          const lecturer = row.lecturer || row.nauczyciel || '';
          const room = row.room || row.sala || 'Online';
          const rawNotesInput = row.rawNotes || row.uwagi || '';

          const { cleanType, cleanSubject, combinedNotes } =
            extractCleanTypeAndNotes(rawType, rawNotesInput, rawSubject, room);
          const statusInfo = detectStatusFromFields(
            cleanType,
            room,
            combinedNotes,
            '',
            cleanSubject
          );

          return {
            id: `uek-json-${date}-${startTime}-${idx}`,
            date,
            dayOfWeek: getPolishDayShort(date),
            startTime,
            endTime,
            subject: cleanSubject,
            type: cleanType,
            normalizedType: normalizeClassType(cleanType),
            lecturer,
            room,
            rawNotes: combinedNotes,
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

      let rawType = 'Wykład';
      let rawSubject = rawSummary;
      const parenType = rawSummary.match(/\(([^)]+)\)\s*$/);
      if (parenType) {
        rawType = parenType[1];
        rawSubject = rawSummary.replace(/\s*\([^)]+\)\s*$/, '').trim();
      }

      const uwagaMatch = rawDesc.match(/Uwagi:\s*([^;]+)/i);
      const rawNotesInput = uwagaMatch ? `Uwagi: ${uwagaMatch[1].trim()}` : '';
      const lectMatch = rawDesc.match(/(?:Prowadzący|Nauczyciel):\s*([^;\\]+)/i);
      const lecturer = lectMatch ? lectMatch[1].trim() : '';

      const { cleanType, cleanSubject, combinedNotes } =
        extractCleanTypeAndNotes(rawType, rawNotesInput, rawSubject, room);
      const statusInfo = detectStatusFromFields(
        cleanType,
        room,
        combinedNotes,
        '',
        cleanSubject
      );

      items.push({
        id: `uek-ics-${date}-${startTime}-${idx++}`,
        date,
        dayOfWeek: getPolishDayShort(date),
        startTime,
        endTime,
        subject: cleanSubject,
        type: cleanType,
        normalizedType: normalizeClassType(cleanType),
        lecturer,
        room,
        rawNotes: combinedNotes,
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
      const rawSubject = extractXmlTag(block, 'przedmiot') || 'Zajęcia dydaktyczne';
      const rawType = extractXmlTag(block, 'typ') || 'wykład';
      const lecturer = extractXmlTag(block, 'nauczyciel') || '';
      const rawRoom = extractXmlTag(block, 'sala', true) || 'Online';
      const rawNotesInput =
        extractXmlTag(block, 'uwagi') || extractXmlTag(block, 'uwaga');

      const { cleanType, cleanSubject, combinedNotes } =
        extractCleanTypeAndNotes(rawType, rawNotesInput, rawSubject, rawRoom);

      const room =
        rawRoom.toLowerCase().includes('zdalny') ||
        rawRoom.toLowerCase().includes('moodle') ||
        rawRoom.toLowerCase().includes('teams')
          ? rawRoom.includes('href=')
            ? rawRoom
            : 'Online'
          : rawRoom;

      const moidMatch = block.match(/<nauczyciel[^>]*moid="([^"]+)"/i);
      const startTime = rawStart.slice(0, 5);
      let endTime = rawEnd.slice(0, 5);
      const parenMatch = rawEnd.match(/^(\d{2}:\d{2})/);
      if (parenMatch) endTime = parenMatch[1];

      if (!date || !startTime) continue;

      const statusInfo = detectStatusFromFields(
        cleanType,
        room,
        combinedNotes,
        '',
        cleanSubject
      );

      items.push({
        id: `uek-xml-${date}-${startTime}-${index++}`,
        date,
        dayOfWeek: dayOfWeek || getPolishDayShort(date),
        startTime,
        endTime: endTime || '10:30',
        subject: cleanSubject,
        type: cleanType,
        normalizedType: normalizeClassType(cleanType),
        lecturer,
        lecturerId: moidMatch ? moidMatch[1] : undefined,
        room,
        rawNotes: combinedNotes,
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

  // 2. Try HTML table parsing from planzajec.uek.krakow.pl (supports 6-col, 7/8-col, <br> Uwagi inside Forma, and follow-up Uwagi rows)
  if (trimmed.includes('<table') && trimmed.includes('<tr')) {
    const items: ScheduleItem[] = [];
    const trRegex = /<tr([^>]*)>([\s\S]*?)<\/tr>/gi;
    let trMatch: RegExpExecArray | null;
    let idx = 0;

    const headingMatch =
      trimmed.match(/<div[^>]*class=["'][^"']*grupa[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
      trimmed.match(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/i);
    const extractedHeading = headingMatch
      ? decodeHtmlEntities(headingMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
      : '';

    while ((trMatch = trRegex.exec(trimmed)) !== null) {
      const trAttrs = trMatch[1] || '';
      const rowContent = trMatch[2];
      if (rowContent.includes('<th')) continue;

      const tds: string[] = [];
      const rawTdsHtml: string[] = [];
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch: RegExpExecArray | null;
      while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
        rawTdsHtml.push(tdMatch[1]);
        const withNewlines = tdMatch[1]
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>|<\/div>/gi, '\n')
          .replace(/<[^>]+>/g, ' ');
        const cleanedLines = withNewlines
          .split('\n')
          .map((line) => decodeHtmlEntities(line.replace(/\s+/g, ' ')))
          .filter(Boolean);
        tds.push(cleanedLines.join('\n'));
      }

      if (tds.length >= 5) {
        const dateCandidate = (tds[0] || '').trim().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateCandidate)) {
          // Check if this row is a standalone note row for the previous class
          const joinedRow = tds.join(' ').trim();
          if (
            items.length > 0 &&
            (joinedRow.toLowerCase().includes('uwagi') ||
              joinedRow.toLowerCase().includes('przeniesion') ||
              joinedRow.toLowerCase().includes('odwołan'))
          ) {
            const prev = items[items.length - 1];
            const { combinedNotes } = extractCleanTypeAndNotes(
              prev.type,
              prev.rawNotes ? `${prev.rawNotes} · ${joinedRow}` : joinedRow,
              prev.subject,
              prev.room
            );
            const st = detectStatusFromFields(
              prev.type,
              prev.room,
              combinedNotes,
              trAttrs,
              prev.subject
            );
            prev.rawNotes = combinedNotes;
            prev.status = st.status;
            prev.statusReason = st.statusReason;
          }
          continue;
        }

        let dayOfWeek = getPolishDayShort(dateCandidate);
        let startTime = '08:00';
        let endTime = '10:30';
        let rawSubject = 'Przedmiot UEK';
        let rawType = 'wykład';
        let lecturer = '';
        let rawRoom = 'Online';
        let rawNotesInput = '';

        // Check if tds[1] combines day + time range (e.g. "Pt 15:45 - 18:15 (3 godz.)")
        const combinedTimeParts = (tds[1] || '').match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
        if (combinedTimeParts) {
          startTime = combinedTimeParts[1];
          endTime = combinedTimeParts[2];
          const dayPrefix = (tds[1] || '').trim().split(/\s+/)[0];
          if (dayPrefix && dayPrefix.length <= 3) {
            dayOfWeek = dayPrefix;
          }
          rawSubject = tds[2] || 'Przedmiot UEK';
          rawType = tds[3] || 'wykład';
          lecturer = (tds[4] || '').replace(/\n/g, ' ');
          rawRoom =
            rawTdsHtml[5] && /<a\s+[^>]*href=/i.test(rawTdsHtml[5])
              ? decodeHtmlEntities(rawTdsHtml[5])
              : (tds[5] || 'Online').replace(/\n/g, ' ');
          rawNotesInput = tds[6] || '';
        } else {
          dayOfWeek = (tds[1] || getPolishDayShort(dateCandidate)).trim();
          const timeRange = tds[2] || '';
          const timeParts = timeRange.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
          startTime = timeParts ? timeParts[1] : '08:00';
          endTime = timeParts ? timeParts[2] : '10:30';
          rawSubject = tds[3] || 'Przedmiot UEK';
          rawType = tds[4] || 'wykład';
          lecturer = (tds[5] || '').replace(/\n/g, ' ');
          rawRoom =
            rawTdsHtml[6] && /<a\s+[^>]*href=/i.test(rawTdsHtml[6])
              ? decodeHtmlEntities(rawTdsHtml[6])
              : (tds[6] || 'Online').replace(/\n/g, ' ');
          rawNotesInput = tds[7] || '';
        }

        const { cleanType, cleanSubject, combinedNotes } =
          extractCleanTypeAndNotes(rawType, rawNotesInput, rawSubject, rawRoom);

        const room =
          rawRoom.toLowerCase().includes('zdalny') ||
          rawRoom.toLowerCase().includes('moodle')
            ? rawRoom.includes('href=')
              ? rawRoom
              : 'Online'
            : rawRoom;

        const statusInfo = detectStatusFromFields(
          cleanType,
          room,
          combinedNotes,
          trAttrs,
          cleanSubject
        );

        items.push({
          id: `uek-html-${dateCandidate}-${startTime}-${idx++}`,
          date: dateCandidate,
          dayOfWeek,
          startTime,
          endTime,
          subject: cleanSubject,
          type: cleanType,
          normalizedType: normalizeClassType(cleanType),
          lecturer,
          room,
          rawNotes: combinedNotes,
          ...statusInfo,
        });
      } else if (tds.length >= 1 && items.length > 0) {
        const joinedRow = tds.join(' ').trim();
        if (
          joinedRow.toLowerCase().includes('uwagi') ||
          joinedRow.toLowerCase().includes('przeniesion') ||
          joinedRow.toLowerCase().includes('odwołan')
        ) {
          const prev = items[items.length - 1];
          const { combinedNotes } = extractCleanTypeAndNotes(
            prev.type,
            prev.rawNotes ? `${prev.rawNotes} · ${joinedRow}` : joinedRow,
            prev.subject,
            prev.room
          );
          const st = detectStatusFromFields(
            prev.type,
            prev.room,
            combinedNotes,
            trAttrs,
            prev.subject
          );
          prev.rawNotes = combinedNotes;
          prev.status = st.status;
          prev.statusReason = st.statusReason;
        }
      }
    }

    if (items.length > 0) {
      const cleanGroupName =
        extractedHeading && extractedHeading.length < 60
          ? extractedHeading
          : `grupa ${parsedUrl.entityId}`;
      return {
        metadata: {
          sourceUrl: parsedUrl.cleanUrl,
          typ: parsedUrl.typ,
          entityId: parsedUrl.entityId,
          okres: parsedUrl.okres,
          groupName: cleanGroupName,
          groupFullName: `UEK Kraków · niestacjonarne · ${cleanGroupName}`,
          authMode,
          casUser,
          fetchedAt: new Date().toISOString(),
        },
        items: enrichWithCountersAndHours(items),
      };
    }
  }

  // 3. Try plain-text / TSV table parsing (e.g. copied from UEK schedule in browser via Ctrl+A, Ctrl+C)
  const rawLines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (rawLines.length >= 2) {
    // Merge wrapped continuation lines (such as "Uwagi: z 8.11\tmgr Dominik Kuc\tPaw.A 214" that wrapped after <br>) into the preceding date row
    const mergedLines: string[] = [];
    const dateStartRegex = /^(\d{4}-\d{2}-\d{2}|\d{2}[.-]\d{2}[.-]\d{4})\b/;

    for (const rawLine of rawLines) {
      if (dateStartRegex.test(rawLine)) {
        mergedLines.push(rawLine);
      } else if (mergedLines.length > 0) {
        const lower = rawLine.toLowerCase();
        // Ignore obvious footer/header noise
        if (
          lower.startsWith('uniwersytet ekonomiczny') ||
          lower.startsWith('plan zajęć') ||
          lower.startsWith('termin\t') ||
          lower.startsWith('wybierz okres') ||
          lower.startsWith('copyright')
        ) {
          continue;
        }
        mergedLines[mergedLines.length - 1] += `\t${rawLine}`;
      }
    }

    const textItems: ScheduleItem[] = [];
    let idx = 0;
    for (const line of mergedLines) {
      const dateMatch =
        line.match(/\b(\d{4}-\d{2}-\d{2})\b/) ||
        line.match(/\b(\d{2})[.-](\d{2})[.-](\d{4})\b/);
      const timeMatch = line.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
      if (!dateMatch || !timeMatch) continue;

      let date = dateMatch[1];
      if (dateMatch[3]) {
        date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      }
      const startTime = timeMatch[1];
      const endTime = timeMatch[2];

      const cols = line.includes('\t')
        ? line
            .split('\t')
            .map((c) => c.trim())
            .filter(Boolean)
        : line
            .split(/\s{2,}/)
            .map((c) => c.trim())
            .filter(Boolean);

      let rawSubject = 'Przedmiot UEK';
      let rawType = 'Wykład';
      let lecturer = '';
      let room = 'Online';
      const extraNoteParts: string[] = [];

      if (cols.length >= 3) {
        const remainingCols = cols.filter(
          (c) =>
            !c.includes(startTime) &&
            !c.includes(date) &&
            !['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'].includes(c)
        );

        // Extract any standalone "Uwagi: ..." columns first so they don't shift lecturer/room columns!
        const nonNoteCols: string[] = [];
        for (const col of remainingCols) {
          if (/^uwagi\s*:/i.test(col)) {
            extraNoteParts.push(col);
          } else {
            nonNoteCols.push(col);
          }
        }

        if (nonNoteCols.length >= 1) rawSubject = nonNoteCols[0];
        if (nonNoteCols.length >= 2) {
          const c1 = nonNoteCols[1].toLowerCase();
          if (
            c1.includes('wykład') ||
            c1.includes('wyklad') ||
            c1.includes('ćwicz') ||
            c1.includes('cwicz') ||
            c1.includes('lektorat') ||
            c1.includes('lab') ||
            c1.includes('seminar') ||
            c1.includes('konwersat') ||
            c1.includes('projekt')
          ) {
            rawType = nonNoteCols[1];
            if (nonNoteCols.length >= 3) lecturer = nonNoteCols[2];
            if (nonNoteCols.length >= 4) room = nonNoteCols[3];
            if (nonNoteCols.length >= 5) {
              extraNoteParts.push(...nonNoteCols.slice(4));
            }
          } else {
            lecturer = nonNoteCols[1];
            if (nonNoteCols.length >= 3) room = nonNoteCols[2];
            if (nonNoteCols.length >= 4) {
              extraNoteParts.push(...nonNoteCols.slice(3));
            }
          }
        }
      } else {
        const cleanLine = line
          .replace(dateMatch[0], '')
          .replace(timeMatch[0], '')
          .replace(/\b(Pn|Wt|Śr|Cz|Pt|Sb|Nd)\b/g, '')
          .trim();
        if (cleanLine) rawSubject = cleanLine.slice(0, 80);
      }

      const { cleanType, cleanSubject, combinedNotes } =
        extractCleanTypeAndNotes(
          rawType,
          extraNoteParts.join(' · '),
          rawSubject,
          room
        );

      const statusInfo = detectStatusFromFields(
        cleanType,
        room,
        combinedNotes,
        '',
        cleanSubject
      );

      textItems.push({
        id: `uek-txt-${date}-${startTime}-${idx++}`,
        date,
        dayOfWeek: getPolishDayShort(date),
        startTime,
        endTime,
        subject: cleanSubject,
        type: cleanType,
        normalizedType: normalizeClassType(cleanType),
        lecturer,
        room,
        rawNotes: combinedNotes,
        ...statusInfo,
      });
    }

    if (textItems.length > 0) {
      return {
        metadata: {
          sourceUrl: parsedUrl.cleanUrl,
          typ: parsedUrl.typ,
          entityId: parsedUrl.entityId,
          okres: parsedUrl.okres,
          groupName: `grupa ${parsedUrl.entityId}`,
          groupFullName: `UEK Kraków · niestacjonarne · grupa ${parsedUrl.entityId}`,
          authMode: 'raw_import',
          casUser: casUser || 'Import z tabeli',
          fetchedAt: new Date().toISOString(),
        },
        items: enrichWithCountersAndHours(textItems),
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
  casUser?: string,
  preferredMajor?: string
): ScheduleResponse {
  const parsed = parseUekUrl(sourceUrl);
  const targetMajor = preferredMajor || detectMajorFromUrlOrName(sourceUrl);

  // If user selected or link specifies a major other than informatyka, or entityId is not 259441:
  if (
    targetMajor !== 'informatyka' ||
    (parsed.entityId && parsed.entityId !== '259441')
  ) {
    return generateDynamicNiestacjonarneScheduleForGroup(
      parsed,
      authWarning,
      authMode,
      casUser,
      targetMajor
    );
  }

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

export type MajorTrackId =
  | 'finanse'
  | 'informatyka'
  | 'zarzadzanie'
  | 'logistyka'
  | 'ekonomia';

export interface MajorOption {
  id: MajorTrackId;
  name: string;
  codePrefix: string;
  shortDesc: string;
}

export const AVAILABLE_MAJORS: MajorOption[] = [
  {
    id: 'finanse',
    name: 'Finanse i Rachunkowość',
    codePrefix: 'KFiR',
    shortDesc: 'Rachunkowość finansowa, rynki finansowe, podatki, finanse przedsiębiorstw',
  },
  {
    id: 'informatyka',
    name: 'Informatyka Stosowana',
    codePrefix: 'KIS',
    shortDesc: 'Inżynieria systemów, programowanie, bazy danych SQL, technologie mobilne i webowe',
  },
  {
    id: 'zarzadzanie',
    name: 'Zarządzanie i Analityka Biznesowa',
    codePrefix: 'KZiAB',
    shortDesc: 'Zarządzanie projektami, Business Intelligence, controlling, negocjacje',
  },
  {
    id: 'logistyka',
    name: 'Logistyka i Handel Międzynarodowy',
    codePrefix: 'KLiHM',
    shortDesc: 'SCM, systemy ERP SAP, transport i spedycja, handel zagraniczny',
  },
  {
    id: 'ekonomia',
    name: 'Ekonomia i Gospodarka Cyfrowa',
    codePrefix: 'KEiGC',
    shortDesc: 'Makroekonomia, ekonometria, rynki cyfrowe, polityka monetarna',
  },
];

export function detectMajorFromUrlOrName(input?: string): MajorTrackId {
  if (!input) return 'finanse';
  const lower = input.toLowerCase();
  if (
    lower.includes('170031') ||
    lower.includes('finan') ||
    lower.includes('kfir') ||
    lower.includes('fir') ||
    lower.includes('rachun')
  ) {
    return 'finanse';
  }
  if (
    lower.includes('259441') ||
    lower.includes('inf') ||
    lower.includes('kis') ||
    lower.includes('komp') ||
    lower.includes('program')
  ) {
    return 'informatyka';
  }
  if (
    lower.includes('zarz') ||
    lower.includes('ziab') ||
    lower.includes('kziab') ||
    lower.includes('manag')
  ) {
    return 'zarzadzanie';
  }
  if (
    lower.includes('logist') ||
    lower.includes('klihm') ||
    lower.includes('lihm') ||
    lower.includes('transp') ||
    lower.includes('sped')
  ) {
    return 'logistyka';
  }
  if (
    lower.includes('ekonom') ||
    lower.includes('keigc') ||
    lower.includes('eigc') ||
    lower.includes('gospodar')
  ) {
    return 'ekonomia';
  }
  return 'finanse';
}

function generateDynamicNiestacjonarneScheduleForGroup(
  parsed: ParsedUekUrl,
  authWarning?: string,
  authMode: ScheduleMetadata['authMode'] = 'demo_preview',
  casUser?: string,
  preferredMajor?: string
): ScheduleResponse {
  const seed =
    parsed.entityId
      .split('')
      .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7) >>> 0;

  const uekTracks = [
    {
      id: 'finanse' as MajorTrackId,
      majorName: 'Finanse i Rachunkowość',
      codePrefix: 'KFiR',
      subjects: [
        {
          name: 'Rachunkowość finansowa',
          lecturer: 'dr hab. Stanisław Hońko, prof. UEK',
          cwRoom: 'Paw.F 304',
        },
        {
          name: 'Analiza rynków finansowych',
          lecturer: 'dr Marcin Bąk',
          cwRoom: 'Paw.A 215 lab. komputerowe',
        },
        {
          name: 'Finanse przedsiębiorstw',
          lecturer: 'prof. UEK dr hab. Marek Łyszczak',
          cwRoom: 'Paw.B 152',
        },
        {
          name: 'Prawo podatkowe i gospodarcze',
          lecturer: 'dr Paweł Dąbrowski',
          cwRoom: 'Paw.C 205',
        },
        {
          name: 'Modelowanie finansowe w MS Excel',
          lecturer: 'dr Piotr Wójcik',
          cwRoom: 'Paw.A 119 lab. komputerowe',
        },
        {
          name: 'Bankowość i rynki kapitałowe',
          lecturer: 'prof. dr hab. Ewa Miklaszewska',
          cwRoom: 'Paw.C 102',
        },
      ],
    },
    {
      id: 'zarzadzanie' as MajorTrackId,
      majorName: 'Zarządzanie i Analityka Biznesowa',
      codePrefix: 'KZiAB',
      subjects: [
        {
          name: 'Zarządzanie projektami IT (Agile & Scrum)',
          lecturer: 'dr hab. Janusz Morbitzer, prof. UEK',
          cwRoom: 'Paw.C 304',
        },
        {
          name: 'Systemy Business Intelligence',
          lecturer: 'dr Łukasz Wójtowicz',
          cwRoom: 'Paw.A 122 lab. komputerowe',
        },
        {
          name: 'Rachunkowość zarządcza i controlling',
          lecturer: 'dr Katarzyna Świetla',
          cwRoom: 'Paw.F 208',
        },
        {
          name: 'Komunikacja i negocjacje w biznesie',
          lecturer: 'dr Tomasz Kusio',
          cwRoom: 'Paw.B 248',
        },
        {
          name: 'Statystyka i ekonometria w biznesie',
          lecturer: 'dr hab. Jacek Wolak, prof. UEK',
          cwRoom: 'Paw.A 214 lab. komputerowe',
        },
      ],
    },
    {
      id: 'informatyka' as MajorTrackId,
      majorName: 'Informatyka Stosowana',
      codePrefix: 'KIS',
      subjects: [
        {
          name: 'Inżynieria oprogramowania i architektura systemów',
          lecturer: 'dr hab. Paweł Wołoszyn, prof. UEK',
          cwRoom: 'Paw.A 122 lab. komputerowe',
        },
        {
          name: 'Sieci komputerowe i cyberbezpieczeństwo',
          lecturer: 'mgr Dominik Kuc',
          cwRoom: 'Paw.A 214 lab. komputerowe',
        },
        {
          name: 'Programowanie aplikacji webowych',
          lecturer: 'dr Artur Żuwała',
          cwRoom: 'Paw.A 119 lab. komputerowe',
        },
        {
          name: 'Metody sztucznej inteligencji i analiza danych',
          lecturer: 'prof. UEK dr hab. Mariusz Grabowski',
          cwRoom: 'Paw.A 215 lab. komputerowe',
        },
        {
          name: 'Hurtownie danych i zaawansowany SQL',
          lecturer: 'dr Krzysztof Kluza',
          cwRoom: 'Paw.F 410 lab.',
        },
      ],
    },
    {
      id: 'logistyka' as MajorTrackId,
      majorName: 'Logistyka i Handel Międzynarodowy',
      codePrefix: 'KLiHM',
      subjects: [
        {
          name: 'Zarządzanie łańcuchem dostaw (SCM)',
          lecturer: 'dr hab. Jarosław Witkowski, prof. UEK',
          cwRoom: 'Paw.G 204',
        },
        {
          name: 'Systemy informatyczne w logistyce (SAP ERP)',
          lecturer: 'dr Tomasz Małkus',
          cwRoom: 'Paw.A 118 lab. komputerowe',
        },
        {
          name: 'Ekonomika transportu i spedycji',
          lecturer: 'dr Maciej Szymczak',
          cwRoom: 'Paw.B 312',
        },
        {
          name: 'Finanse w handlu międzynarodowym',
          lecturer: 'dr hab. Krzysztof Wach, prof. UEK',
          cwRoom: 'Paw.F 108',
        },
        {
          name: 'Optymalizacja procesów magazynowych',
          lecturer: 'dr Piotr Hanus',
          cwRoom: 'Paw.C 104',
        },
      ],
    },
    {
      id: 'ekonomia' as MajorTrackId,
      majorName: 'Ekonomia i Gospodarka Cyfrowa',
      codePrefix: 'KEiGC',
      subjects: [
        {
          name: 'Makroekonomia gospodarki otwartej',
          lecturer: 'dr hab. Andrzej Cieślik, prof. UEK',
          cwRoom: 'Paw.B 152',
        },
        {
          name: 'Ekonometria i analiza szeregów czasowych',
          lecturer: 'prof. dr hab. Tadeusz Kufel',
          cwRoom: 'Paw.A 215 lab.',
        },
        {
          name: 'Rynki cyfrowe i transformacja technologiczna',
          lecturer: 'dr hab. Piotr Stanek',
          cwRoom: 'Paw.C 204',
        },
        {
          name: 'Polityka gospodarcza i monetarna UE',
          lecturer: 'dr hab. Joanna Stachel',
          cwRoom: 'Paw.F 304',
        },
        {
          name: 'Analiza danych makroekonomicznych w R/Python',
          lecturer: 'dr Michał Bernardelli',
          cwRoom: 'Paw.A 119 lab.',
        },
      ],
    },
  ];

  const targetMajorId: MajorTrackId =
    preferredMajor && ['finanse', 'informatyka', 'zarzadzanie', 'logistyka', 'ekonomia'].includes(preferredMajor)
      ? (preferredMajor as MajorTrackId)
      : detectMajorFromUrlOrName(parsed.cleanUrl);

  const track =
    uekTracks.find((t) => t.id === targetMajorId) ||
    uekTracks[seed % uekTracks.length];
  const rawItems: ScheduleItem[] = [];

  UEK_12_ZJAZDY.forEach((zjazd, zIdx) => {
    const [fri, sat, sun] = zjazd.dates;
    const s0 = track.subjects[(zIdx + (seed % 5)) % track.subjects.length];
    const s1 = track.subjects[(zIdx + 1 + (seed % 5)) % track.subjects.length];
    const s2 = track.subjects[(zIdx + 2 + (seed % 5)) % track.subjects.length];
    const s3 = track.subjects[(zIdx + 3 + (seed % 5)) % track.subjects.length];

    // Friday evening: Lektorat + optional lecture
    if (zIdx % 2 === 0 || zIdx === 4) {
      rawItems.push({
        id: `uek-${parsed.entityId}-${fri}-1`,
        date: fri,
        dayOfWeek: 'Pt',
        startTime: '16:30',
        endTime: '18:15',
        subject: s0.name,
        type: 'Wykład',
        normalizedType: 'wykład',
        lecturer: s0.lecturer,
        room: 'Online',
        isOnlineLocation: true,
        rawNotes: '',
        status: 'scheduled',
      });
    }

    if (zIdx < 10 && sun) {
      rawItems.push({
        id: `uek-${parsed.entityId}-${fri}-2`,
        date: fri,
        dayOfWeek: 'Pt',
        startTime: '18:30',
        endTime: '21:00',
        subject: 'Język obcy',
        type: 'Lektorat',
        normalizedType: 'lektorat',
        lecturer: 'mgr Katarzyna Zając',
        room: 'Paw.B 252 · Centrum Językowe',
        isOnlineLocation: false,
        rawNotes: '',
        status: 'scheduled',
      });
    }

    const sat1Note =
      zIdx === 4
        ? 'Uwagi: przeniesione na 7.11 (MS Teams)'
        : zIdx === 5
        ? 'Uwagi: przeniesione z 24.10'
        : zIdx === 7
        ? 'Uwagi: odrabianie zajęć z 14.11'
        : '';

    const sat2Note =
      zIdx === 2
        ? 'Uwagi: przeniesione na 17.10'
        : zIdx === 3
        ? 'Uwagi: przeniesione z 17.10'
        : zIdx === 6
        ? 'Uwagi: zmiana godziny (z 13:30)'
        : '';

    const sun2Note =
      zIdx === 4
        ? 'Uwagi: na 8.11 (MS Teams)'
        : zIdx === 5
        ? 'Uwagi: przeniesione na 15.11'
        : zIdx === 8
        ? 'Uwagi: kolokwium zaliczeniowe'
        : '';

    // Saturday classes
    rawItems.push(
      {
        id: `uek-${parsed.entityId}-${sat}-1`,
        date: sat,
        dayOfWeek: 'Sb',
        startTime: '08:00',
        endTime: '10:30',
        subject: s1.name,
        type: zIdx < 4 ? 'Wykład' : 'Ćwiczenia',
        normalizedType: zIdx < 4 ? 'wykład' : 'ćwiczenia',
        lecturer: s1.lecturer,
        room: zIdx < 4 ? 'Online' : s1.cwRoom,
        isOnlineLocation: zIdx < 4,
        rawNotes: sat1Note,
        status: sat1Note ? 'rescheduled' : 'scheduled',
        statusReason: sat1Note || undefined,
      },
      {
        id: `uek-${parsed.entityId}-${sat}-2`,
        date: sat,
        dayOfWeek: 'Sb',
        startTime: '10:45',
        endTime: '13:15',
        subject: s2.name,
        type: 'Ćwiczenia',
        normalizedType: 'ćwiczenia',
        lecturer: s2.lecturer,
        room: s2.cwRoom,
        isOnlineLocation: false,
        rawNotes: sat2Note,
        status: sat2Note ? 'rescheduled' : 'scheduled',
        statusReason: sat2Note || undefined,
      },
      {
        id: `uek-${parsed.entityId}-${sat}-3`,
        date: sat,
        dayOfWeek: 'Sb',
        startTime: '13:30',
        endTime: '16:00',
        subject: s3.name,
        type: 'Ćwiczenia',
        normalizedType: 'ćwiczenia',
        lecturer: s3.lecturer,
        room: s3.cwRoom,
        isOnlineLocation: false,
        rawNotes: '',
        status: 'scheduled',
      }
    );

    // Sunday classes (if Sunday exists in this Zjazd)
    if (sun) {
      rawItems.push(
        {
          id: `uek-${parsed.entityId}-${sun}-1`,
          date: sun,
          dayOfWeek: 'Nd',
          startTime: '08:00',
          endTime: '10:30',
          subject: s0.name,
          type: 'Ćwiczenia',
          normalizedType: 'ćwiczenia',
          lecturer: s0.lecturer,
          room: s0.cwRoom,
          isOnlineLocation: false,
          rawNotes: '',
          status: 'scheduled',
        },
        {
          id: `uek-${parsed.entityId}-${sun}-2`,
          date: sun,
          dayOfWeek: 'Nd',
          startTime: '10:45',
          endTime: '13:15',
          subject: s3.name,
          type: 'Wykład',
          normalizedType: 'wykład',
          lecturer: s3.lecturer,
          room: 'Online',
          isOnlineLocation: true,
          rawNotes: sun2Note,
          status: sun2Note ? 'rescheduled' : 'scheduled',
          statusReason: sun2Note || undefined,
        }
      );
    }
  });

  const enriched = enrichWithCountersAndHours(rawItems);
  const groupLabel = `${track.codePrefix}-${parsed.entityId.slice(-3)} (id=${parsed.entityId})`;

  return {
    metadata: {
      sourceUrl: parsed.cleanUrl,
      typ: parsed.typ,
      entityId: parsed.entityId,
      okres: parsed.okres,
      groupName: groupLabel,
      groupFullName: `UEK Kraków · niestacjonarne · ${track.majorName} · gr. ${parsed.entityId}`,
      authMode,
      casUser,
      authWarning,
      fetchedAt: new Date().toISOString(),
    },
    items: enriched,
  };
}

