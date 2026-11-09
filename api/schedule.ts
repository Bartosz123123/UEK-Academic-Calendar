import http from 'http';
import https from 'https';

type ClassStatus =
  | 'scheduled'
  | 'cancelled'
  | 'rescheduled'
  | 'room_changed'
  | 'online'
  | 'exam';

type NormalizedClassType =
  | 'wykład'
  | 'ćwiczenia'
  | 'lektorat'
  | 'seminarium'
  | 'laboratorium'
  | 'egzamin'
  | 'inne';

interface ScheduleItem {
  id: string;
  date: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subject: string;
  type: string;
  normalizedType: NormalizedClassType;
  counterLabel?: string;
  dydacticHours?: number;
  lecturer: string;
  lecturerId?: string;
  room: string;
  onlineUrl?: string;
  isOnlineLocation?: boolean;
  rawNotes: string;
  status: ClassStatus;
  statusReason?: string;
}

interface ScheduleMetadata {
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

interface ScheduleResponse {
  metadata: ScheduleMetadata;
  items: ScheduleItem[];
  sessionCookie?: string;
  requiresCasAuth?: boolean;
}

interface SafeHttpResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  cookies: string[];
  body: string;
}

const DEFAULT_UEK_URL =
  'https://planzajec.uek.krakow.pl/index.php?typ=G&id=259441&okres=3';

function parseUekUrl(rawInput: string) {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return {
      cleanUrl: DEFAULT_UEK_URL,
      xmlUrl: `${DEFAULT_UEK_URL}&xml`,
      typ: 'G' as const,
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

function getPolishDayShort(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const map = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
  return map[d.getDay()] || 'Pt';
}

function normalizeClassType(rawType: string): NormalizedClassType {
  const lower = rawType.toLowerCase();
  if (lower.includes('wykład') || lower.includes('wyklad')) return 'wykład';
  if (
    lower.includes('lektorat') ||
    lower.includes('język') ||
    lower.includes('jezyk')
  )
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

function getDisplayCategoryLabel(norm: NormalizedClassType): string {
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

function extractCleanTypeAndNotes(
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

  const subjUwagiMatch = cleanSubject.match(
    /^(.*?)\s*\b(uwagi\s*:?\s*[\s\S]+)$/i
  );
  if (subjUwagiMatch && subjUwagiMatch[1].trim().length > 2) {
    cleanSubject = subjUwagiMatch[1].trim();
    noteParts.push(subjUwagiMatch[2].trim());
  }

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

function detectStatusFromFields(
  typeStr: string,
  roomStr: string,
  notesStr: string,
  rowClassStr = '',
  subjectStr = ''
): {
  status: ClassStatus;
  statusReason?: string;
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

function extractXmlTag(
  block: string,
  tag: string,
  preserveLinks = false
): string {
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

function cleanRoomAndLink(rawRoom: string): {
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

function mergeScheduleNotes(
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

function parseUekXmlOrHtml(
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

  // 1. XML parsing (<plan-zajec ...>)
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
      const rawSubject =
        extractXmlTag(block, 'przedmiot') || 'Zajęcia dydaktyczne';
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
          typ:
            (typMatch?.[1]?.toUpperCase() as 'G' | 'N' | 'S') || parsedUrl.typ,
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

  // 2. HTML table parsing
  if (trimmed.includes('<table') && trimmed.includes('<tr')) {
    const items: ScheduleItem[] = [];
    const trRegex = /<tr([^>]*)>([\s\S]*?)<\/tr>/gi;
    let trMatch: RegExpExecArray | null;
    let idx = 0;

    const headingMatch =
      trimmed.match(
        /<div[^>]*class=["'][^"']*grupa[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
      ) || trimmed.match(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/i);
    const extractedHeading = headingMatch
      ? decodeHtmlEntities(
          headingMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
        )
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

        const combinedTimeParts = (tds[1] || '').match(
          /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/
        );
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
          const timeParts = timeRange.match(
            /(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/
          );
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

  return null;
}

function safeHttpRequest(
  urlStr: string,
  options: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {}
): Promise<SafeHttpResponse> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch (err) {
      return reject(err);
    }

    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const method = options.method || 'GET';
    const timeoutMs = options.timeoutMs ?? 7000;

    const reqHeaders: Record<string, string> = {
      Connection: 'close',
      ...(options.headers || {}),
    };

    if (options.body) {
      reqHeaders['Content-Length'] = String(Buffer.byteLength(options.body));
    }

    const req = lib.request(
      parsed,
      {
        method,
        headers: reqHeaders,
        agent: isHttps
          ? new https.Agent({ keepAlive: false, timeout: timeoutMs })
          : new http.Agent({ keepAlive: false, timeout: timeoutMs }),
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          const rawSetCookie = res.headers['set-cookie'] || [];
          const cookieList = (
            Array.isArray(rawSetCookie) ? rawSetCookie : [rawSetCookie]
          )
            .map((c) => String(c).split(';')[0].trim())
            .filter(Boolean);

          const rawBuf = Buffer.concat(chunks);
          const contentType = String(
            res.headers['content-type'] || ''
          ).toLowerCase();
          let bodyStr = rawBuf.toString('utf-8');
          if (
            contentType.includes('iso-8859-2') ||
            bodyStr.includes('encoding="ISO-8859-2"') ||
            bodyStr.includes('charset=iso-8859-2')
          ) {
            try {
              bodyStr = new TextDecoder('iso-8859-2').decode(rawBuf);
            } catch {
              // fallback to utf-8
            }
          }

          resolve({
            status: res.statusCode || 200,
            headers: res.headers,
            cookies: cookieList,
            body: bodyStr,
          });
        });
        res.on('error', reject);
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function mergeCookieJar(existing: Record<string, string>, newCookies: string[]) {
  for (const c of newCookies) {
    const eqIdx = c.indexOf('=');
    if (eqIdx > 0) {
      const name = c.slice(0, eqIdx).trim();
      const val = c.slice(eqIdx + 1).trim();
      existing[name] = val;
    }
  }
}

function serializeCookieJar(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function performUekCasLoginAndFetch(
  xmlTargetUrl: string,
  htmlTargetUrl: string,
  username: string,
  password: string
): Promise<{
  xmlBody: string;
  htmlBody: string;
  sessionCookie?: string;
  casError?: string;
  networkClosed?: boolean;
}> {
  const casCookies: Record<string, string> = {};
  const planCookies: Record<string, string> = {};
  const userAgent =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

  try {
    let casLoginUrl = `https://logowanie.uek.krakow.pl/cas/login?service=${encodeURIComponent(
      xmlTargetUrl
    )}`;
    try {
      const initPlanRes = await safeHttpRequest(xmlTargetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/xml,text/xml,text/html,*/*;q=0.9',
        },
      });
      mergeCookieJar(planCookies, initPlanRes.cookies);
      const initLocRaw = initPlanRes.headers['location'];
      const initLoc = Array.isArray(initLocRaw) ? initLocRaw[0] : initLocRaw;
      if (initLoc && initLoc.includes('logowanie.uek.krakow.pl')) {
        casLoginUrl = initLoc.startsWith('http')
          ? initLoc
          : new URL(initLoc, 'https://logowanie.uek.krakow.pl').toString();
      } else if (
        initPlanRes.status === 200 &&
        (initPlanRes.body.includes('<plan-zajec') ||
          initPlanRes.body.includes('<table'))
      ) {
        return {
          xmlBody: initPlanRes.body,
          htmlBody: '',
          sessionCookie: serializeCookieJar(planCookies),
        };
      }
    } catch {
      // Proceed with default casLoginUrl
    }

    const getRes = await safeHttpRequest(casLoginUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    mergeCookieJar(casCookies, getRes.cookies);
    const loginHtml = getRes.body;

    const execMatch =
      loginHtml.match(/name=["']execution["'][^>]*value=["']([^"']+)["']/i) ||
      loginHtml.match(/value=["']([^"']+)["'][^>]*name=["']execution["']/i);

    if (!execMatch) {
      return {
        xmlBody: '',
        htmlBody: '',
        networkClosed: true,
        casError: 'Nie udało się pobrać tokenu autoryzacji z serwera CAS UEK.',
      };
    }

    const executionToken = execMatch[1];

    const formParams = new URLSearchParams();
    formParams.set('username', username.trim());
    formParams.set('password', password);
    formParams.set('execution', executionToken);
    formParams.set('_eventId', 'submit');
    formParams.set('geolocation', '');
    formParams.set('deviceFingerprint', '2849104721');

    const postRes = await safeHttpRequest(casLoginUrl, {
      method: 'POST',
      headers: {
        'User-Agent': userAgent,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: serializeCookieJar(casCookies),
        Origin: 'https://logowanie.uek.krakow.pl',
        Referer: casLoginUrl,
      },
      body: formParams.toString(),
    });

    mergeCookieJar(casCookies, postRes.cookies);

    const rawLoc = postRes.headers['location'];
    let redirectLocation = Array.isArray(rawLoc) ? rawLoc[0] : rawLoc;

    if (!redirectLocation && postRes.body) {
      const jsRedirectMatch =
        postRes.body.match(
          /window\.location(?:\.href)?\s*=\s*["']([^"']+ticket=[^"']+)["']/i
        ) ||
        postRes.body.match(/url=([^"'\s>]+ticket=[^"'\s>]+)/i) ||
        postRes.body.match(/href=["']([^"']+ticket=ST-[^"']+)["']/i);
      if (jsRedirectMatch) {
        redirectLocation = jsRedirectMatch[1];
      }
    }

    if (!redirectLocation) {
      const errorHtml = postRes.body || '';
      if (
        errorHtml.includes('Invalid credentials') ||
        errorHtml.includes('Nieprawidłowe') ||
        errorHtml.includes('badCredentials') ||
        errorHtml.includes('authenticationFailure') ||
        errorHtml.includes('id="loginForm"')
      ) {
        return {
          xmlBody: '',
          htmlBody: '',
          casError:
            'Serwer CAS UEK odrzucił logowanie — sprawdź swój identyfikator (login/nr albumu) oraz hasło.',
        };
      }
      return {
        xmlBody: '',
        htmlBody: '',
        networkClosed: true,
      };
    }

    let currentUrl = redirectLocation.startsWith('http')
      ? redirectLocation
      : new URL(redirectLocation, 'https://logowanie.uek.krakow.pl').toString();

    let landedBody = '';

    for (let hop = 0; hop < 6; hop++) {
      const isCasHost = currentUrl.includes('logowanie.uek.krakow.pl');
      const activeJar = isCasHost ? casCookies : planCookies;

      const hopRes = await safeHttpRequest(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          Cookie: serializeCookieJar(activeJar),
          Accept: 'application/xml,text/xml,text/html,*/*;q=0.9',
        },
      });

      if (isCasHost) {
        mergeCookieJar(casCookies, hopRes.cookies);
      } else {
        mergeCookieJar(planCookies, hopRes.cookies);
      }

      const nextRaw = hopRes.headers['location'];
      const nextLoc = Array.isArray(nextRaw) ? nextRaw[0] : nextRaw;
      if (
        nextLoc &&
        (hopRes.status === 301 ||
          hopRes.status === 302 ||
          hopRes.status === 303 ||
          hopRes.status === 307)
      ) {
        currentUrl = nextLoc.startsWith('http')
          ? nextLoc
          : new URL(nextLoc, currentUrl).toString();
        continue;
      }

      landedBody = hopRes.body;
      break;
    }

    const phpSessId = planCookies['PHPSESSID']
      ? `PHPSESSID=${planCookies['PHPSESSID']}`
      : serializeCookieJar(planCookies);

    let xmlBody = landedBody.includes('<plan-zajec') ? landedBody : '';
    let htmlBody = landedBody.includes('<table') ? landedBody : '';

    if (phpSessId) {
      if (!xmlBody) {
        try {
          const xmlRes = await safeHttpRequest(xmlTargetUrl, {
            method: 'GET',
            headers: {
              'User-Agent': userAgent,
              Cookie: phpSessId,
              Accept: 'application/xml,text/xml,*/*;q=0.9',
            },
          });
          if (xmlRes.body.includes('<plan-zajec')) {
            xmlBody = xmlRes.body;
          }
        } catch {
          // ignore
        }
      }
      if (!htmlBody) {
        try {
          const htmlRes = await safeHttpRequest(htmlTargetUrl, {
            method: 'GET',
            headers: {
              'User-Agent': userAgent,
              Cookie: phpSessId,
              Accept: 'text/html,*/*;q=0.9',
            },
          });
          if (htmlRes.body.includes('<table')) {
            htmlBody = htmlRes.body;
          }
        } catch {
          // ignore
        }
      }
    }

    return {
      xmlBody,
      htmlBody,
      sessionCookie: phpSessId,
    };
  } catch {
    return {
      xmlBody: '',
      htmlBody: '',
      networkClosed: true,
    };
  }
}

export default async function handler(req: any, res: any) {
  try {
    const bodyObj =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : req.body || {};

    const {
      url = DEFAULT_UEK_URL,
      username,
      password,
      sessionCookie,
      rawXmlOrHtml,
    } = bodyObj;

    const parsedUrl = parseUekUrl(url);

    if (
      rawXmlOrHtml &&
      typeof rawXmlOrHtml === 'string' &&
      rawXmlOrHtml.trim().length > 20
    ) {
      const parsedDirect = parseUekXmlOrHtml(
        rawXmlOrHtml,
        parsedUrl.cleanUrl,
        'raw_import',
        username || 'Import bezpośredni'
      );
      if (parsedDirect) {
        return res.status(200).json(parsedDirect);
      }
      return res.status(400).json({
        error:
          'Wklejone dane nie zawierają prawidłowej tabeli planu zajęć UEK ani struktury XML.',
      });
    }

    const effectiveCookie =
      (sessionCookie &&
        typeof sessionCookie === 'string' &&
        sessionCookie.trim()) ||
      process.env.UEK_SESSION_COOKIE ||
      process.env.UEK_PHPSESSID ||
      '';
    const effectiveUsername =
      (username && typeof username === 'string' && username.trim()) ||
      process.env.UEK_CAS_USERNAME ||
      '';
    const effectivePassword =
      (password && typeof password === 'string' && password) ||
      process.env.UEK_CAS_PASSWORD ||
      '';

    if (effectiveCookie) {
      const formattedCookie = effectiveCookie.includes('=')
        ? effectiveCookie.trim()
        : `PHPSESSID=${effectiveCookie.trim()}`;

      let xmlParsed = null;
      let htmlParsed = null;

      try {
        const xmlResp = await safeHttpRequest(parsedUrl.xmlUrl, {
          headers: {
            Cookie: formattedCookie,
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15',
          },
        });
        xmlParsed = parseUekXmlOrHtml(
          xmlResp.body,
          parsedUrl.cleanUrl,
          'cookie_session',
          effectiveUsername || 'Sesja CAS'
        );
      } catch {
        // continue
      }

      try {
        const htmlResp = await safeHttpRequest(parsedUrl.cleanUrl, {
          headers: {
            Cookie: formattedCookie,
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15',
          },
        });
        htmlParsed = parseUekXmlOrHtml(
          htmlResp.body,
          parsedUrl.cleanUrl,
          'cookie_session',
          effectiveUsername || 'Sesja CAS'
        );
      } catch {
        // continue
      }

      const finalSchedule =
        xmlParsed && htmlParsed
          ? mergeScheduleNotes(xmlParsed, htmlParsed)
          : xmlParsed || htmlParsed;

      if (finalSchedule) {
        return res.status(200).json({
          ...finalSchedule,
          sessionCookie: formattedCookie,
        });
      }
    }

    if (effectiveUsername && effectivePassword) {
      const attempt = await performUekCasLoginAndFetch(
        parsedUrl.xmlUrl,
        parsedUrl.cleanUrl,
        effectiveUsername,
        effectivePassword
      );

      const xmlParsed = attempt.xmlBody
        ? parseUekXmlOrHtml(
            attempt.xmlBody,
            parsedUrl.cleanUrl,
            'cas_authenticated',
            effectiveUsername
          )
        : null;

      const htmlParsed = attempt.htmlBody
        ? parseUekXmlOrHtml(
            attempt.htmlBody,
            parsedUrl.cleanUrl,
            'cas_authenticated',
            effectiveUsername
          )
        : null;

      const finalSchedule =
        xmlParsed && htmlParsed
          ? mergeScheduleNotes(xmlParsed, htmlParsed)
          : xmlParsed || htmlParsed;

      if (finalSchedule) {
        return res.status(200).json({
          ...finalSchedule,
          sessionCookie: attempt.sessionCookie,
        });
      }

      if (attempt.casError) {
        return res.status(401).json({
          error: attempt.casError,
          requiresCasAuth: true,
        });
      }
    }

    for (const candidateUrl of [parsedUrl.xmlUrl, parsedUrl.cleanUrl]) {
      try {
        const directRes = await safeHttpRequest(candidateUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15',
          },
        });
        const parsedLive = parseUekXmlOrHtml(
          directRes.body,
          parsedUrl.cleanUrl,
          'cas_authenticated'
        );
        if (parsedLive) {
          return res.status(200).json(parsedLive);
        }
      } catch {
        // continue
      }
    }

    return res.status(200).json({
      requiresCasAuth: true,
      entityId: parsedUrl.entityId,
      cleanUrl: parsedUrl.cleanUrl,
    });
  } catch {
    return res.status(200).json({
      requiresCasAuth: true,
    });
  }
}
