export interface UekRoomItem {
  number: string; // e.g. "252", "151", "119", "Sala F"
  code: string; // e.g. "Paw.B 252"
  floor: number; // -1, 0, 1, 2, 3, 4
  wing: 'north' | 'center' | 'south';
  side: 'west' | 'east'; // Po której stronie korytarza leży sala (do rysowania rzutu piętra jak na screenie 2)
  slotIndex: number; // Kolejność wzdłuż korytarza (0..5)
  type: 'lab' | 'lecture' | 'language' | 'seminar' | 'auditorium' | 'office' | 'storage';
  typeName: string; // np. "Sala", "Laboratorium komputerowe", "Katedra...", "Magazyn"
  fullSearchTitle: string; // np. "Pawilon B Sala lektoratowa CJ 252"
  capacity?: number;
  positionHint: string;
}

export interface UekFloorSpec {
  level: number; // -1, 0, 1, 2, 3, 4
  shortLabel: string; // "Poziom -1", "Parter", "Piętro 1", etc.
  badge: string; // "-1", "0", "1", "2", "3", "4"
  fullName: string;
  description: string;
  rooms: UekRoomItem[];
}

export interface UekPavilionSpec {
  code: string; // 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'S' | 'MAIN' | 'USTRONIE' | 'KSIEZOWKA' | 'BIBLIOTEKA' | 'OGRODNIK' | 'STROZOWKA'
  officialNumber: number; // 1..16 wg oficjalnej mapy Kampusu UEK
  shortLabel: string; // "Paw. A", "Budynek główny", "U - Ustronie", "F - Finansów", "S - Sportowy"
  circleLetter: string; // "A", "B", "C", "D", "E", "F", "G", "S", "U", "1"
  mapBadge: string; // "Paw. A"
  fullName: string;
  subtitle: string;
  description: string;
  campus: 'Rakowicka' | 'Sienkiewicza';
  availableFloors: number[]; // e.g. [-1, 0, 1, 2, 3, 4]
  totalFloors: number;
  totalRoomsCount: number;
  directionsFromGate: string;
  entranceDescription: string;
  coordinates: { lat: number; lng: number };
  entranceCoordinates: { lat: number; lng: number };
  entrances: Array<{ lat: number; lng: number; type: 'door' | 'arrow' }>;
  // Exact OpenStreetMap / Geoportal WGS84 building polygon(s)
  footprint: Array<{ lat: number; lng: number }>;
  secondaryFootprint?: Array<{ lat: number; lng: number }>;
  floors: UekFloorSpec[];
}

export const UEK_MAIN_GATE_COORDS = { lat: 50.06805, lng: 19.95365 };

// Exact green pitch (Boisko / Forum UEK nr 16) from OpenStreetMap Way 1364523622
export const UEK_GREEN_PITCH_POLYGON = [
  { lat: 50.068519, lng: 19.954739 },
  { lat: 50.068117, lng: 19.954438 },
  { lat: 50.068011, lng: 19.954799 },
  { lat: 50.068184, lng: 19.954923 },
  { lat: 50.068416, lng: 19.955091 },
];

export const UEK_CAMPUS_POIS = [
  {
    id: 'sklepik',
    label: 'Sklepik',
    type: 'shop' as const,
    lat: 50.06892,
    lng: 19.95442,
  },
  {
    id: 'bufet-c',
    label: 'Bufet / Gastro',
    type: 'food' as const,
    lat: 50.06918,
    lng: 19.95538,
  },
];

function buildFloorRooms(
  pavCode: string,
  pavName: string,
  floor: number,
  items: Array<{
    num: string;
    side: 'west' | 'east';
    slot: number;
    wing: 'north' | 'center' | 'south';
    type: UekRoomItem['type'];
    typeName: string;
    searchTitle?: string;
    cap?: number;
    hint: string;
  }>
): UekRoomItem[] {
  return items.map((it) => ({
    number: it.num,
    code: `Paw.${pavCode} ${it.num}`,
    floor,
    wing: it.wing,
    side: it.side,
    slotIndex: it.slot,
    type: it.type,
    typeName: it.typeName,
    fullSearchTitle:
      it.searchTitle || `${pavName} ${it.typeName} ${it.num}`,
    capacity: it.cap,
    positionHint: it.hint,
  }));
}

export const UEK_PAVILIONS_DATA: Record<string, UekPavilionSpec> = {
  A: {
    code: 'A',
    officialNumber: 6,
    shortLabel: 'Paw. A',
    circleLetter: 'A',
    mapBadge: 'Paw. A',
    fullName: 'Pawilon A',
    subtitle: 'Laboratoria komputerowe, sale wykładowe i katedry',
    description:
      'Główny pawilon dydaktyczno-laboratoryjny po zachodniej stronie łącznika Pawilonu C. Mieści laboratoria komputerowe (I i II piętro) oraz sale ćwiczeniowe i katedry.',
    campus: 'Rakowicka',
    availableFloors: [-1, 0, 1, 2, 3, 4],
    totalFloors: 4,
    totalRoomsCount: 48,
    directionsFromGate:
      'Od bramy głównej przy ul. Rakowickiej 27 miń Budynek Główny po lewej i idź prosto alejką ok. 90 m.',
    entranceDescription: 'Wejście od strony południowej (przy Sklepiku) lub przez łącznik Pawilonu C.',
    coordinates: { lat: 50.06919, lng: 19.95476 },
    entranceCoordinates: { lat: 50.06896, lng: 19.95458 },
    entrances: [
      { lat: 50.06895, lng: 19.95457, type: 'door' },
      { lat: 50.06914, lng: 19.95492, type: 'door' },
    ],
    // Exact OSM Way 137069010
    footprint: [
      { lat: 50.068984, lng: 19.954466 },
      { lat: 50.068922, lng: 19.954666 },
      { lat: 50.069265, lng: 19.954922 },
      { lat: 50.069358, lng: 19.954992 },
      { lat: 50.069367, lng: 19.954998 },
      { lat: 50.069429, lng: 19.954798 },
    ],
    floors: [
      {
        level: -1,
        shortLabel: 'Poziom -1',
        badge: '-1',
        fullName: 'Poziom -1 (Przyziemie)',
        description: 'Szatnie, bufet studencki, magazyny i pomieszczenia techniczne.',
        rooms: buildFloorRooms('A', 'Pawilon A', -1, [
          { num: '01', side: 'west', slot: 0, wing: 'north', type: 'storage', typeName: 'Magazyn', hint: 'Przyziemie — skrzydło północne' },
          { num: '02', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala ćwiczeniowa', cap: 28, hint: 'Przyziemie — prawa strona' },
          { num: 'Szatnia', side: 'east', slot: 3, wing: 'center', type: 'office', typeName: 'Szatnia studencka', hint: 'Przy schodach głównych' },
          { num: '03', side: 'west', slot: 4, wing: 'south', type: 'seminar', typeName: 'Sala ćwiczeniowa', cap: 30, hint: 'Przyziemie — skrzydło południowe' },
        ]),
      },
      {
        level: 0,
        shortLabel: 'Parter',
        badge: '0',
        fullName: 'Parter (poziom 0)',
        description: 'Wejście główne, portiernia, łącznik z Pawilonem C oraz sale 04–016.',
        rooms: buildFloorRooms('A', 'Pawilon A', 0, [
          { num: '014', side: 'west', slot: 0, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Północny koniec parteru' },
          { num: '012', side: 'east', slot: 0, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Północne skrzydło po prawej' },
          { num: '010', side: 'east', slot: 1, wing: 'center', type: 'lecture', typeName: 'Sala wykładowa', cap: 60, hint: 'Obok przejścia do Pawilonu C' },
          { num: '08', side: 'west', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 40, hint: 'Naprzeciwko klatki schodowej' },
          { num: '06', side: 'east', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Południowe skrzydło parteru' },
          { num: '04', side: 'west', slot: 4, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Przy wejściu południowym' },
        ]),
      },
      {
        level: 1,
        shortLabel: 'Piętro 1',
        badge: '1',
        fullName: 'I piętro (poziom 1)',
        description: 'Laboratoria komputerowe (sale 116–122) oraz sale ćwiczeniowe 105–115.',
        rooms: buildFloorRooms('A', 'Pawilon A', 1, [
          { num: '122', side: 'west', slot: 0, wing: 'north', type: 'lab', typeName: 'Lab. komputerowe', cap: 30, hint: 'Koniec północnego korytarza po lewej' },
          { num: '120', side: 'east', slot: 0, wing: 'north', type: 'lab', typeName: 'Lab. komputerowe', cap: 28, hint: 'Północne skrzydło po prawej' },
          { num: '119', side: 'west', slot: 1, wing: 'north', type: 'lab', typeName: 'Lab. komputerowe', cap: 30, hint: 'Skręć w prawo od schodów/windy — skrzydło północne' },
          { num: '118', side: 'east', slot: 1, wing: 'north', type: 'lab', typeName: 'Lab. komputerowe', cap: 28, hint: 'Naprzeciwko sali 119' },
          { num: '116', side: 'east', slot: 2, wing: 'center', type: 'lab', typeName: 'Lab. komputerowe', cap: 24, hint: 'Obok klatki schodowej i windy' },
          { num: '110', side: 'east', slot: 3, wing: 'south', type: 'lecture', typeName: 'Sala', cap: 48, hint: 'Południowe skrzydło I piętra' },
          { num: '107', side: 'west', slot: 4, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Południowy koniec korytarza' },
        ]),
      },
      {
        level: 2,
        shortLabel: 'Piętro 2',
        badge: '2',
        fullName: 'II piętro (poziom 2)',
        description: 'Pracownie komputerowe (s. 212–216), sale dydaktyczne i katedry.',
        rooms: buildFloorRooms('A', 'Pawilon A', 2, [
          { num: '220', side: 'west', slot: 0, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Północny koniec II piętra' },
          { num: '216', side: 'east', slot: 0, wing: 'north', type: 'lab', typeName: 'Lab. komputerowe', cap: 28, hint: 'Skrzydło północne po prawej' },
          { num: '214', side: 'east', slot: 1, wing: 'north', type: 'lab', typeName: 'Lab. komputerowe', cap: 30, hint: 'Skrzydło północne obok s. 216' },
          { num: '212', side: 'west', slot: 1, wing: 'center', type: 'lab', typeName: 'Lab. komputerowe', cap: 26, hint: 'Naprzeciwko s. 214' },
          { num: '210', side: 'east', slot: 2, wing: 'center', type: 'office', typeName: 'Katedra handlu i instytucji rynkowych', cap: 45, hint: 'Część centralna przy schodach' },
          { num: '208', side: 'east', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 40, hint: 'Skrzydło południowe' },
          { num: '204', side: 'west', slot: 4, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Południowy koniec II piętra' },
        ]),
      },
      {
        level: 3,
        shortLabel: 'Piętro 3',
        badge: '3',
        fullName: 'III piętro (poziom 3)',
        description: 'Sale seminaryjne 304–320 oraz katedry.',
        rooms: buildFloorRooms('A', 'Pawilon A', 3, [
          { num: '320', side: 'west', slot: 0, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 28, hint: 'Północne skrzydło' },
          { num: '316', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Północne skrzydło po prawej' },
          { num: '312', side: 'east', slot: 2, wing: 'center', type: 'lecture', typeName: 'Sala', cap: 45, hint: 'Przy klatce schodowej' },
          { num: '308', side: 'east', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Południowe skrzydło' },
          { num: '304', side: 'west', slot: 4, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Południowy koniec III piętra' },
        ]),
      },
      {
        level: 4,
        shortLabel: 'Piętro 4',
        badge: '4',
        fullName: 'IV piętro (poziom 4)',
        description: 'Sale seminaryjne i pokoje katedr 401–418.',
        rooms: buildFloorRooms('A', 'Pawilon A', 4, [
          { num: '418', side: 'west', slot: 0, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 26, hint: 'Północne skrzydło' },
          { num: '412', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Prawe skrzydło IV piętra' },
          { num: '405', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 34, hint: 'Obok windy i schodów' },
          { num: '401', side: 'west', slot: 4, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Południowe skrzydło' },
        ]),
      },
    ],
  },

  B: {
    code: 'B',
    officialNumber: 7,
    shortLabel: 'Paw. B',
    circleLetter: 'B',
    mapBadge: 'Paw. B',
    fullName: 'Pawilon B (Centrum Językowe UEK)',
    subtitle: 'Siedziba Centrum Językowego UEK (sale X40–X60, m.in. s. 151–154, s. 252)',
    description:
      'Pięciokondygnacyjny pawilon dydaktyczny równoległy do Pawilonu A, połączony z nim przewiązką Pawilonu C. Mieści Centrum Językowe UEK (lektoraty na II i III piętrze) oraz katedry.',
    campus: 'Rakowicka',
    availableFloors: [-1, 0, 1, 2, 3, 4],
    totalFloors: 4,
    totalRoomsCount: 44,
    directionsFromGate:
      'Od bramy głównej idź aleją centralną za Pawilon A — Pawilon B stoi równolegle po wschodniej stronie łącznika Pawilonu C.',
    entranceDescription: 'Wejście od strony południowo-zachodniej lub przez łącznik z Pawilonu C.',
    coordinates: { lat: 50.06896, lng: 19.95552 },
    entranceCoordinates: { lat: 50.06875, lng: 19.95533 },
    entrances: [
      { lat: 50.06875, lng: 19.95532, type: 'door' },
      { lat: 50.06911, lng: 19.95549, type: 'door' },
      { lat: 50.06905, lng: 19.95568, type: 'door' },
    ],
    // Exact OSM Way 137069020
    footprint: [
      { lat: 50.069191, lng: 19.955565 },
      { lat: 50.069089, lng: 19.955489 },
      { lat: 50.068746, lng: 19.955234 },
      { lat: 50.068711, lng: 19.95535 },
      { lat: 50.068684, lng: 19.955433 },
      { lat: 50.069055, lng: 19.955711 },
      { lat: 50.069128, lng: 19.955764 },
    ],
    floors: [
      {
        level: -1,
        shortLabel: 'Poziom -1',
        badge: '-1',
        fullName: 'Poziom -1 (Przyziemie Pawilonu B)',
        description: 'Szatnia, pomieszczenia techniczne i magazyny.',
        rooms: buildFloorRooms('B', 'Pawilon B', -1, [
          { num: '040', side: 'west', slot: 0, wing: 'north', type: 'storage', typeName: 'Magazyn', hint: 'Przyziemie północne' },
          { num: '041', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 28, hint: 'Przyziemie centralne' },
        ]),
      },
      {
        level: 0,
        shortLabel: 'Parter',
        badge: '0',
        fullName: 'Parter (poziom 0)',
        description: 'Hol wejściowy, łącznik z Pawilonem C (Sala F) oraz sale 042–056.',
        rooms: buildFloorRooms('B', 'Pawilon B', 0, [
          { num: '050', side: 'west', slot: 0, wing: 'north', type: 'storage', typeName: 'Magazyn', hint: 'Przy łączniku z Pawilonem C' },
          { num: '051', side: 'east', slot: 1, wing: 'north', type: 'lecture', typeName: 'Sala', cap: 48, hint: 'Północno-wschodnie skrzydło parteru' },
          { num: '052', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 34, hint: 'Naprzeciwko klatki schodowej i WC' },
          { num: '053', side: 'east', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 34, hint: 'Południowo-wschodnia strona korytarza' },
          { num: '045', side: 'west', slot: 4, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Przy wejściu południowym' },
        ]),
      },
      {
        level: 1,
        shortLabel: 'Piętro 1',
        badge: '1',
        fullName: 'I piętro (poziom 1) — układ dokładnie jak na rzucie wewnętrznym',
        description: 'Sale 150–154 oraz Katedra Ekonomii i Organizacji Przedsiębiorstw (167).',
        rooms: buildFloorRooms('B', 'Pawilon B', 1, [
          { num: '150', side: 'west', slot: 0, wing: 'north', type: 'storage', typeName: 'Magazyn', hint: 'Przy przejściu do Pawilonu C (obok Sali F)' },
          { num: '151', side: 'east', slot: 1, wing: 'north', type: 'lecture', typeName: 'Sala', cap: 50, hint: 'Duża sala w północno-wschodnim narożniku korytarza' },
          { num: '152', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Naprzeciwko klatki schodowej, windy i toalet' },
          { num: '153', side: 'east', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Obok sali 152 w kierunku południowym' },
          { num: '167', side: 'west', slot: 3, wing: 'south', type: 'office', typeName: 'Katedra ekonomii i organizacji przedsiębiorstw', hint: 'Po zachodniej stronie korytarza za toaletami' },
          { num: '154', side: 'east', slot: 4, wing: 'south', type: 'office', typeName: 'Katedra ekonomii i organizacji przedsiębiorstw, kierownik', hint: 'Południowa część I piętra' },
        ]),
      },
      {
        level: 2,
        shortLabel: 'Piętro 2',
        badge: '2',
        fullName: 'II piętro (poziom 2) — Centrum Językowe UEK (m.in. Sala 252)',
        description: 'Główna siedziba Centrum Językowego UEK — sale lektoratowe 248–256.',
        rooms: buildFloorRooms('B', 'Pawilon B', 2, [
          { num: '250', side: 'west', slot: 0, wing: 'north', type: 'language', typeName: 'Sala lektoratowa CJ', cap: 24, hint: 'Początek korytarza północnego przy łączniku' },
          { num: '251', side: 'east', slot: 1, wing: 'north', type: 'language', typeName: 'Sala lektoratowa CJ', cap: 36, hint: 'Północno-wschodnie skrzydło II piętra' },
          { num: '252', side: 'east', slot: 2, wing: 'center', type: 'language', typeName: 'Sala lektoratowa CJ', cap: 26, hint: 'Naprzeciwko schodów, windy i toalet (środek II piętra)' },
          { num: '253', side: 'east', slot: 3, wing: 'south', type: 'language', typeName: 'Sala lektoratowa CJ', cap: 26, hint: 'Południowo-wschodnia strona korytarza obok s. 252' },
          { num: '248', side: 'west', slot: 3, wing: 'south', type: 'office', typeName: 'Sekretariat Centrum Językowego UEK', hint: 'Po zachodniej stronie korytarza za strefą WC' },
          { num: '254', side: 'east', slot: 4, wing: 'south', type: 'language', typeName: 'Sala lektoratowa CJ', cap: 26, hint: 'Południowy koniec korytarza II piętra' },
        ]),
      },
      {
        level: 3,
        shortLabel: 'Piętro 3',
        badge: '3',
        fullName: 'III piętro (poziom 3)',
        description: 'Sale lektoratowe i ćwiczeniowe 348–356.',
        rooms: buildFloorRooms('B', 'Pawilon B', 3, [
          { num: '350', side: 'west', slot: 0, wing: 'north', type: 'language', typeName: 'Sala lektoratowa CJ', cap: 24, hint: 'Północna część III piętra' },
          { num: '351', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 40, hint: 'Północno-wschodnie skrzydło' },
          { num: '352', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Naprzeciwko schodów i windy' },
          { num: '353', side: 'east', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Obok sali 352' },
          { num: '354', side: 'east', slot: 4, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Południowe skrzydło III piętra' },
        ]),
      },
      {
        level: 4,
        shortLabel: 'Piętro 4',
        badge: '4',
        fullName: 'IV piętro (poziom 4)',
        description: 'Sale dydaktyczne i katedry 448–456 (m.in. s. 451).',
        rooms: buildFloorRooms('B', 'Pawilon B', 4, [
          { num: '450', side: 'west', slot: 0, wing: 'north', type: 'office', typeName: 'Katedra', hint: 'Północna część IV piętra' },
          { num: '451', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 38, hint: 'Północno-wschodnie skrzydło IV piętra' },
          { num: '452', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Naprzeciwko klatki schodowej i windy' },
          { num: '453', side: 'east', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Południowo-wschodnia strona' },
          { num: '455', side: 'east', slot: 4, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 28, hint: 'Południowy koniec IV piętra' },
        ]),
      },
    ],
  },

  C: {
    code: 'C',
    officialNumber: 8,
    shortLabel: 'Paw. C',
    circleLetter: 'C',
    mapBadge: 'Paw. C',
    fullName: 'Pawilon C',
    subtitle: 'Nowa Aula, Aule A–F oraz sale wykładowe (m.in. s. 304)',
    description:
      'Centralny pawilon wykładowy łączący Pawilon A i Pawilon B. Mieści Nową Aulę, Salę A–F oraz sale dydaktyczne na piętrach I–III.',
    campus: 'Rakowicka',
    availableFloors: [-1, 0, 1, 2, 3],
    totalFloors: 3,
    totalRoomsCount: 28,
    directionsFromGate:
      'Od bramy głównej idź aleją pomiędzy Pawilonem A i B — wejście do Pawilonu C znajduje się pod zadaszeniem na dziedzińcu.',
    entranceDescription: 'Wejście główne pod zadaszeniem pomiędzy Pawilonem A i B.',
    coordinates: { lat: 50.06921, lng: 19.9552 },
    entranceCoordinates: { lat: 50.06909, lng: 19.95524 },
    entrances: [
      { lat: 50.06909, lng: 19.95524, type: 'arrow' },
      { lat: 50.06916, lng: 19.95501, type: 'door' },
    ],
    // Exact OSM Way 137069024
    footprint: [
      { lat: 50.069362, lng: 19.955036 },
      { lat: 50.069265, lng: 19.954922 },
      { lat: 50.069142, lng: 19.955075 },
      { lat: 50.06909, lng: 19.955246 },
      { lat: 50.069161, lng: 19.955314 },
      { lat: 50.069089, lng: 19.955489 },
      { lat: 50.069191, lng: 19.955565 },
      { lat: 50.06944, lng: 19.95525 },
    ],
    floors: [
      {
        level: -1,
        shortLabel: 'Poziom -1',
        badge: '-1',
        fullName: 'Poziom -1 (Szatnie i Bufet)',
        description: 'Szatnia główna pod Nową Aulą oraz strefa gastronomiczna.',
        rooms: buildFloorRooms('C', 'Pawilon C', -1, [
          { num: 'Szatnia C', side: 'west', slot: 1, wing: 'center', type: 'office', typeName: 'Szatnia pod Nową Aulą', hint: 'Poziom -1' },
          { num: 'Bufet', side: 'east', slot: 2, wing: 'center', type: 'office', typeName: 'Strefa gastronomiczna', hint: 'Poziom -1 przy łączniku' },
        ]),
      },
      {
        level: 0,
        shortLabel: 'Parter',
        badge: '0',
        fullName: 'Parter (poziom 0) — Nowa Aula i Aule A–F',
        description: 'Główne aule wykładowe w łączniku pomiędzy Pawilonem A i B.',
        rooms: buildFloorRooms('C', 'Pawilon C', 0, [
          { num: 'Nowa Aula', side: 'east', slot: 0, wing: 'north', type: 'auditorium', typeName: 'Aula wykładowa', cap: 350, hint: 'Na wprost głównego wejścia do Pawilonu C' },
          { num: 'Sala A', side: 'west', slot: 1, wing: 'south', type: 'auditorium', typeName: 'Aula wykładowa', cap: 160, hint: 'Przy przejściu do Pawilonu A' },
          { num: 'Sala B', side: 'east', slot: 2, wing: 'center', type: 'auditorium', typeName: 'Aula wykładowa', cap: 140, hint: 'Środek parteru Pawilonu C' },
          { num: 'Sala C', side: 'east', slot: 3, wing: 'north', type: 'auditorium', typeName: 'Aula wykładowa', cap: 140, hint: 'W stronę Pawilonu B' },
          { num: 'Sala F', side: 'west', slot: 4, wing: 'north', type: 'auditorium', typeName: 'Aula wykładowa', cap: 110, hint: 'Łącznik bezpośrednio przy Pawilonie B' },
        ]),
      },
      {
        level: 1,
        shortLabel: 'Piętro 1',
        badge: '1',
        fullName: 'I piętro (poziom 1)',
        description: 'Sale wykładowe i ćwiczeniowe 102–112 oraz Sala F.',
        rooms: buildFloorRooms('C', 'Pawilon C', 1, [
          { num: 'Sala F', side: 'west', slot: 0, wing: 'north', type: 'lecture', typeName: 'Sala wykładowa', cap: 90, hint: 'W łączniku przy przejściu do Pawilonu B' },
          { num: '112', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Wschodnia część I piętra' },
          { num: '108', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 40, hint: 'Naprzeciwko klatki schodowej' },
          { num: '105', side: 'east', slot: 3, wing: 'center', type: 'lecture', typeName: 'Sala', cap: 70, hint: 'Środkowa część korytarza' },
          { num: '102', side: 'west', slot: 4, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Zachodnia część przy Pawilonie A' },
        ]),
      },
      {
        level: 2,
        shortLabel: 'Piętro 2',
        badge: '2',
        fullName: 'II piętro (poziom 2)',
        description: 'Sale ćwiczeniowe 202–214.',
        rooms: buildFloorRooms('C', 'Pawilon C', 2, [
          { num: '214', side: 'east', slot: 0, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Wschodnia część korytarza' },
          { num: '210', side: 'east', slot: 1, wing: 'center', type: 'lecture', typeName: 'Sala', cap: 60, hint: 'Naprzeciwko schodów głównych' },
          { num: '206', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 40, hint: 'Środek II piętra' },
          { num: '202', side: 'west', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Przy przejściu do Pawilonu A' },
        ]),
      },
      {
        level: 3,
        shortLabel: 'Piętro 3',
        badge: '3',
        fullName: 'III piętro (poziom 3) — m.in. Sala 304',
        description: 'Sale wykładowo-ćwiczeniowe 301–311.',
        rooms: buildFloorRooms('C', 'Pawilon C', 3, [
          { num: '311', side: 'east', slot: 0, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Wschodnie skrzydło III piętra' },
          { num: '308', side: 'east', slot: 1, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Obok klatki schodowej' },
          { num: '306', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Część centralna' },
          { num: '304', side: 'east', slot: 3, wing: 'south', type: 'lecture', typeName: 'Sala wykładowo-ćwiczeniowa', cap: 55, hint: 'Skręć od schodów w stronę Pawilonu A — główne drzwi po prawej' },
          { num: '301', side: 'west', slot: 4, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Zachodni koniec III piętra' },
        ]),
      },
    ],
  },

  D: {
    code: 'D',
    officialNumber: 9,
    shortLabel: 'Paw. D',
    circleLetter: 'D',
    mapBadge: 'Paw. D',
    fullName: 'Pawilon D',
    subtitle: 'Centrum Obsługi Studenta i sale dydaktyczne (pomiędzy Paw. G a Paw. A)',
    description:
      'Pawilon położony w północno-zachodniej części kampusu pomiędzy Pawilonem G, Księżówką a Pawilonem A.',
    campus: 'Rakowicka',
    availableFloors: [-1, 0, 1, 2],
    totalFloors: 2,
    totalRoomsCount: 18,
    directionsFromGate: 'Od bramy przy ul. Rakowickiej miń Księżówkę i idź prosto na północ.',
    entranceDescription: 'Wejście od strony południowo-zachodniej.',
    coordinates: { lat: 50.06945, lng: 19.95432 },
    entranceCoordinates: { lat: 50.06932, lng: 19.95402 },
    entrances: [{ lat: 50.06932, lng: 19.95402, type: 'arrow' }],
    // Exact OSM Way 1250039675
    footprint: [
      { lat: 50.069313, lng: 19.953924 },
      { lat: 50.069205, lng: 19.954274 },
      { lat: 50.069092, lng: 19.954197 },
      { lat: 50.068998, lng: 19.954386 },
      { lat: 50.069499, lng: 19.954793 },
      { lat: 50.069706, lng: 19.954204 },
    ],
    floors: [
      {
        level: -1,
        shortLabel: 'Poziom -1',
        badge: '-1',
        fullName: 'Poziom -1 (Przyziemie Pawilonu D)',
        description: 'Pomieszczenia techniczne, archiwum i szatnie.',
        rooms: buildFloorRooms('D', 'Pawilon D', -1, [
          { num: '01p', side: 'west', slot: 1, wing: 'center', type: 'storage', typeName: 'Magazyn / Przyziemie', hint: 'Poziom -1 Pawilonu D' },
        ]),
      },
      {
        level: 0,
        shortLabel: 'Parter',
        badge: '0',
        fullName: 'Parter (poziom 0)',
        description: 'Obsługa studenta i sale dydaktyczne 02–010.',
        rooms: buildFloorRooms('D', 'Pawilon D', 0, [
          { num: '010', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Północna część parteru' },
          { num: '06', side: 'east', slot: 2, wing: 'center', type: 'lecture', typeName: 'Sala', cap: 50, hint: 'Środek parteru' },
          { num: '02', side: 'west', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Przy wejściu' },
        ]),
      },
      {
        level: 1,
        shortLabel: 'Piętro 1',
        badge: '1',
        fullName: 'I piętro (poziom 1)',
        description: 'Sale ćwiczeniowe 101–109.',
        rooms: buildFloorRooms('D', 'Pawilon D', 1, [
          { num: '109', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Północne skrzydło' },
          { num: '105', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Obok schodów' },
          { num: '101', side: 'west', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Południowe skrzydło' },
        ]),
      },
      {
        level: 2,
        shortLabel: 'Piętro 2',
        badge: '2',
        fullName: 'II piętro (poziom 2)',
        description: 'Sale seminaryjne 202–210.',
        rooms: buildFloorRooms('D', 'Pawilon D', 2, [
          { num: '210', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'II piętro Pawilonu D' },
          { num: '202', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Przy klatce schodowej' },
        ]),
      },
    ],
  },

  E: {
    code: 'E',
    officialNumber: 10,
    shortLabel: 'Paw. E',
    circleLetter: 'E',
    mapBadge: 'Paw. E',
    fullName: 'Pawilon E',
    subtitle: 'Skrzydło wschodnie przy Pawilonie B (kompleks ABCE)',
    description:
      'Budynek przylegający bezpośrednio od wschodu do północnego narożnika Pawilonu B w ramach połączonego kompleksu ABCE.',
    campus: 'Rakowicka',
    availableFloors: [-1, 0, 1, 2, 3],
    totalFloors: 3,
    totalRoomsCount: 16,
    directionsFromGate: 'Idź aleją za Pawilon B — Pawilon E łączy Pawilon B z rejonem Biblioteki.',
    entranceDescription: 'Przejście z Pawilonu B lub wejście od północy.',
    coordinates: { lat: 50.06906, lng: 19.95586 },
    entranceCoordinates: { lat: 50.06909, lng: 19.95575 },
    entrances: [{ lat: 50.06909, lng: 19.95575, type: 'door' }],
    // Exact OSM Way 341533681
    footprint: [
      { lat: 50.069128, lng: 19.955764 },
      { lat: 50.069055, lng: 19.955711 },
      { lat: 50.068969, lng: 19.955987 },
      { lat: 50.069042, lng: 19.956042 },
    ],
    floors: [
      {
        level: -1,
        shortLabel: 'Poziom -1',
        badge: '-1',
        fullName: 'Poziom -1 (Przyziemie Pawilonu E)',
        description: 'Poziom podziemny połączony z kompleksem ABCE.',
        rooms: buildFloorRooms('E', 'Pawilon E', -1, [
          { num: '01p', side: 'west', slot: 1, wing: 'center', type: 'storage', typeName: 'Magazyn', hint: 'Przyziemie Pawilonu E' },
        ]),
      },
      {
        level: 0,
        shortLabel: 'Parter',
        badge: '0',
        fullName: 'Parter (poziom 0)',
        description: 'Sale seminaryjne i biura.',
        rooms: buildFloorRooms('E', 'Pawilon E', 0, [
          { num: '03', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Parter Pawilonu E' },
          { num: '01', side: 'west', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 28, hint: 'Przy łączniku z Pawilonem B' },
        ]),
      },
      {
        level: 1,
        shortLabel: 'Piętro 1',
        badge: '1',
        fullName: 'I piętro (poziom 1)',
        description: 'Sale dydaktyczne 101–106.',
        rooms: buildFloorRooms('E', 'Pawilon E', 1, [
          { num: '104', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Wschodnia część I piętra' },
          { num: '101', side: 'west', slot: 2, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Przy przejściu z Pawilonu B' },
        ]),
      },
      {
        level: 2,
        shortLabel: 'Piętro 2',
        badge: '2',
        fullName: 'II piętro (poziom 2)',
        description: 'Sale seminaryjne i katedry.',
        rooms: buildFloorRooms('E', 'Pawilon E', 2, [
          { num: '204', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 28, hint: 'II piętro Pawilonu E' },
          { num: '201', side: 'west', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 28, hint: 'Środek II piętra' },
        ]),
      },
      {
        level: 3,
        shortLabel: 'Piętro 3',
        badge: '3',
        fullName: 'III piętro (poziom 3)',
        description: 'Katedry i sale seminaryjne.',
        rooms: buildFloorRooms('E', 'Pawilon E', 3, [
          { num: '302', side: 'east', slot: 1, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 25, hint: 'III piętro Pawilonu E' },
        ]),
      },
    ],
  },

  F: {
    code: 'F',
    officialNumber: 13,
    shortLabel: 'F - Finansów',
    circleLetter: 'F',
    mapBadge: 'F - Finansów',
    fullName: 'Pawilon F (Pawilon Finansów)',
    subtitle: '7-piętrowy gmach dydaktyczno-naukowy Instytutu Finansów za Biblioteką Główną UEK',
    description:
      'Nowoczesny, 8-kondygnacyjny naziemnie (parter + 7 pięter oraz garaż podziemny -1) Pawilon Finansów (Pawilon F) położony we wschodniej części kampusu za Biblioteką Główną UEK.',
    campus: 'Rakowicka',
    availableFloors: [-1, 0, 1, 2, 3, 4, 5, 6, 7],
    totalFloors: 7,
    totalRoomsCount: 56,
    directionsFromGate:
      'Idź główną aleją na wschód za Pawilon B i Bibliotekę Główną UEK.',
    entranceDescription: 'Wejście od strony południowo-zachodniej z bezpośrednim dostępem do wind (obsługujących poziomy -1 do 7).',
    coordinates: { lat: 50.06852, lng: 19.95679 },
    entranceCoordinates: { lat: 50.06832, lng: 19.95664 },
    entrances: [{ lat: 50.06832, lng: 19.95664, type: 'door' }],
    // Exact OSM Way 162598729
    footprint: [
      { lat: 50.068376, lng: 19.956427 },
      { lat: 50.068321, lng: 19.956604 },
      { lat: 50.068287, lng: 19.956672 },
      { lat: 50.068428, lng: 19.95684 },
      { lat: 50.068697, lng: 19.957164 },
      { lat: 50.068773, lng: 19.956904 },
      { lat: 50.06851, lng: 19.95658 },
    ],
    floors: [
      {
        level: -1,
        shortLabel: 'Poziom -1',
        badge: '-1',
        fullName: 'Poziom -1 (Parking podziemny i szatnie)',
        description: 'Wielopoziomowy garaż podziemny, szatnie oraz zaplecze techniczne.',
        rooms: buildFloorRooms('F', 'Pawilon F', -1, [
          { num: '01', side: 'east', slot: 1, wing: 'center', type: 'seminar', typeName: 'Sala / Przyziemie', cap: 30, hint: 'Poziom -1 Pawilonu F' },
          { num: 'Garaż -1', side: 'west', slot: 2, wing: 'south', type: 'storage', typeName: 'Parking podziemny', hint: 'Zjazd windą na poziom -1' },
        ]),
      },
      {
        level: 0,
        shortLabel: 'Parter',
        badge: '0',
        fullName: 'Parter (poziom 0)',
        description: 'Portiernia, hol windowy, sale wykładowe i komputerowe 02–011.',
        rooms: buildFloorRooms('F', 'Pawilon F', 0, [
          { num: '011', side: 'west', slot: 0, wing: 'north', type: 'lab', typeName: 'Lab. komputerowe', cap: 30, hint: 'Północna część parteru' },
          { num: '08', side: 'east', slot: 1, wing: 'north', type: 'lecture', typeName: 'Sala wykładowa', cap: 60, hint: 'Północno-wschodnia część parteru' },
          { num: '04', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Środek parteru naprzeciwko wind' },
          { num: '02', side: 'west', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Przy wejściu głównym' },
        ]),
      },
      {
        level: 1,
        shortLabel: 'Piętro 1',
        badge: '1',
        fullName: 'I piętro (poziom 1)',
        description: 'Sale ćwiczeniowe i komputerowe 102–112.',
        rooms: buildFloorRooms('F', 'Pawilon F', 1, [
          { num: '112', side: 'west', slot: 0, wing: 'north', type: 'lab', typeName: 'Lab. komputerowe', cap: 28, hint: 'Północne skrzydło I piętra' },
          { num: '110', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Północno-wschodnie skrzydło I piętra' },
          { num: '106', side: 'east', slot: 2, wing: 'center', type: 'lecture', typeName: 'Sala', cap: 55, hint: 'Obok klatki schodowej i wind' },
          { num: '102', side: 'west', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Południowe skrzydło I piętra' },
        ]),
      },
      {
        level: 2,
        shortLabel: 'Piętro 2',
        badge: '2',
        fullName: 'II piętro (poziom 2)',
        description: 'Sale dydaktyczne i lektoratowe 201–212 (w tym Sala 210).',
        rooms: buildFloorRooms('F', 'Pawilon F', 2, [
          { num: '212', side: 'west', slot: 0, wing: 'north', type: 'language', typeName: 'Sala lektoratowa', cap: 26, hint: 'Północna część II piętra' },
          { num: '210', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', searchTitle: 'Pawilon F Sala 210', cap: 40, hint: 'Północno-wschodnie skrzydło II piętra' },
          { num: '205', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Naprzeciwko wind i schodów' },
          { num: '201', side: 'west', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Południowe skrzydło II piętra' },
        ]),
      },
      {
        level: 3,
        shortLabel: 'Piętro 3',
        badge: '3',
        fullName: 'III piętro (poziom 3)',
        description: 'Sale dydaktyczne i seminaryjne 301–312.',
        rooms: buildFloorRooms('F', 'Pawilon F', 3, [
          { num: '312', side: 'west', slot: 0, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Północna część III piętra' },
          { num: '309', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Północno-wschodnie skrzydło' },
          { num: '306', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 28, hint: 'Środek III piętra' },
          { num: '302', side: 'east', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Południowe skrzydło przy schodach' },
        ]),
      },
      {
        level: 4,
        shortLabel: 'Piętro 4',
        badge: '4',
        fullName: 'IV piętro (poziom 4) — Katedra Bankowości',
        description: 'Sale seminaryjne 401–412 oraz Katedra Bankowości i Globalnego Systemu Finansowego.',
        rooms: buildFloorRooms('F', 'Pawilon F', 4, [
          { num: '412', side: 'west', slot: 0, wing: 'north', type: 'office', typeName: 'Katedra Bankowości i Globalnego Systemu Finansowego', hint: 'Północne skrzydło IV piętra' },
          { num: '410', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Prawe skrzydło IV piętra' },
          { num: '405', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Naprzeciwko wind na IV piętrze' },
          { num: '402', side: 'west', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 28, hint: 'Południowe skrzydło IV piętra' },
        ]),
      },
      {
        level: 5,
        shortLabel: 'Piętro 5',
        badge: '5',
        fullName: 'V piętro (poziom 5) — Katedra Rachunkowości Finansowej',
        description: 'Sale warsztatowe 501–509 oraz Katedra Rachunkowości Finansowej (pok. 513).',
        rooms: buildFloorRooms('F', 'Pawilon F', 5, [
          { num: '513', side: 'west', slot: 0, wing: 'north', type: 'office', typeName: 'Katedra Rachunkowości Finansowej', hint: 'V piętro Pawilonu F — pokój 513' },
          { num: '509', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala warsztatowa', cap: 30, hint: 'Północno-wschodnie skrzydło V piętra' },
          { num: '505', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Naprzeciwko wind i klatki schodowej' },
          { num: '501', side: 'east', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 28, hint: 'Południowe skrzydło V piętra' },
        ]),
      },
      {
        level: 6,
        shortLabel: 'Piętro 6',
        badge: '6',
        fullName: 'VI piętro (poziom 6) — Katedra Rynków Finansowych i Finansów Przedsiębiorstw',
        description: 'Sekretariaty i sale seminaryjne katedr Instytutu Finansów (pok. 601–614).',
        rooms: buildFloorRooms('F', 'Pawilon F', 6, [
          { num: '614', side: 'west', slot: 0, wing: 'north', type: 'office', typeName: 'Katedra Rynków Finansowych', hint: 'VI piętro Pawilonu F' },
          { num: '610', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala seminaryjna', cap: 26, hint: 'Północno-wschodnie skrzydło VI piętra' },
          { num: '605', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala seminaryjna', cap: 28, hint: 'Środek VI piętra przy windach' },
          { num: '602', side: 'west', slot: 3, wing: 'south', type: 'office', typeName: 'Katedra Finansów Przedsiębiorstw', hint: 'VI piętro Pawilonu F — pokój 602' },
        ]),
      },
      {
        level: 7,
        shortLabel: 'Piętro 7',
        badge: '7',
        fullName: 'VII piętro (poziom 7) — Katedra Finansów Publicznych i Polityki Finansowej',
        description: 'Najwyższa kondygnacja Pawilonu Finansów — katedry i sale seminaryjne 701–712.',
        rooms: buildFloorRooms('F', 'Pawilon F', 7, [
          { num: '712', side: 'west', slot: 0, wing: 'north', type: 'office', typeName: 'Katedra Finansów i Polityki Finansowej', hint: 'VII piętro Pawilonu F' },
          { num: '707', side: 'east', slot: 1, wing: 'north', type: 'office', typeName: 'Katedra Finansów Publicznych', hint: 'VII piętro Pawilonu F — pokój 707' },
          { num: '705', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala seminaryjna', cap: 26, hint: 'Naprzeciwko wind na VII piętrze' },
          { num: '701', side: 'east', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala seminaryjna', cap: 24, hint: 'Południowe skrzydło VII piętra' },
        ]),
      },
    ],
  },

  G: {
    code: 'G',
    officialNumber: 14,
    shortLabel: 'Paw. G',
    circleLetter: 'G',
    mapBadge: 'Paw. G',
    fullName: 'Pawilon G — KSB',
    subtitle: 'Północno-zachodni pawilon przy ul. Rakowickiej (Krakowska Szkoła Biznesu)',
    description:
      'Nowoczesny budynek dydaktyczno-konferencyjny położony bezpośrednio przy ul. Rakowickiej w północno-zachodnim narożniku kampusu (obok Księżówki i Pawilonu D).',
    campus: 'Rakowicka',
    availableFloors: [-1, 0, 1, 2],
    totalFloors: 2,
    totalRoomsCount: 22,
    directionsFromGate:
      'Po wejściu od ul. Rakowickiej skręć w lewo (na północ) — Pawilon G stoi tuż za Księżówką.',
    entranceDescription: 'Wejście z podjazdem i bezpośrednim dostępem do windy od strony południowo-wschodniej.',
    coordinates: { lat: 50.06952, lng: 19.95385 },
    entranceCoordinates: { lat: 50.06942, lng: 19.95392 },
    entrances: [{ lat: 50.06942, lng: 19.95392, type: 'door' }],
    // Exact OSM Way 180796893
    footprint: [
      { lat: 50.069332, lng: 19.953678 },
      { lat: 50.069292, lng: 19.953808 },
      { lat: 50.069681, lng: 19.954099 },
      { lat: 50.06972, lng: 19.95397 },
    ],
    floors: [
      {
        level: -1,
        shortLabel: 'Poziom -1',
        badge: '-1',
        fullName: 'Poziom -1 (Przyziemie Pawilonu G)',
        description: 'Szatnia, strefa studencka i zaplecze techniczne.',
        rooms: buildFloorRooms('G', 'Pawilon G', -1, [
          { num: 'G.01', side: 'west', slot: 1, wing: 'center', type: 'seminar', typeName: 'Sala ćwiczeniowa', cap: 28, hint: 'Poziom -1 Pawilonu G' },
        ]),
      },
      {
        level: 0,
        shortLabel: 'Parter',
        badge: '0',
        fullName: 'Parter (poziom 0)',
        description: 'Sale wykładowe G.1–G.7.',
        rooms: buildFloorRooms('G', 'Pawilon G', 0, [
          { num: 'G.5', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Północna część parteru' },
          { num: 'G.3', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Środek parteru' },
          { num: 'G.1', side: 'west', slot: 3, wing: 'south', type: 'lecture', typeName: 'Sala wykładowa', cap: 60, hint: 'Przy wejściu do Pawilonu G' },
        ]),
      },
      {
        level: 1,
        shortLabel: 'Piętro 1',
        badge: '1',
        fullName: 'I piętro (poziom 1)',
        description: 'Sale dydaktyczne G.10–G.16 (w tym s. 13 z pętlą indukcyjną oraz s. 119).',
        rooms: buildFloorRooms('G', 'Pawilon G', 1, [
          { num: '119', side: 'east', slot: 0, wing: 'north', type: 'lab', typeName: 'Sala dydaktyczna', cap: 32, hint: 'Północne skrzydło I piętra' },
          { num: 'G.13', side: 'east', slot: 1, wing: 'north', type: 'lecture', typeName: 'Sala wykładowa', cap: 48, hint: 'I piętro Pawilonu G' },
          { num: 'G.12', side: 'east', slot: 2, wing: 'center', type: 'lecture', typeName: 'Sala', cap: 50, hint: 'Przy klatce schodowej i windzie' },
          { num: 'G.10', side: 'west', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 36, hint: 'Południowe skrzydło' },
        ]),
      },
      {
        level: 2,
        shortLabel: 'Piętro 2',
        badge: '2',
        fullName: 'II piętro (poziom 2 — przeszklona kondygnacja KSB)',
        description: 'Sale konferencyjne i seminaryjne Krakowskiej Szkoły Biznesu UEK.',
        rooms: buildFloorRooms('G', 'Pawilon G', 2, [
          { num: 'G.23', side: 'east', slot: 1, wing: 'center', type: 'seminar', typeName: 'Sala konferencyjna', cap: 40, hint: 'II piętro Pawilonu G' },
          { num: 'G.21', side: 'west', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Południowe skrzydło' },
        ]),
      },
    ],
  },

  MAIN: {
    code: 'MAIN',
    officialNumber: 1,
    shortLabel: 'Budynek główny',
    circleLetter: '1',
    mapBadge: 'Budynek główny',
    fullName: 'Budynek Główny UEK (nr 1)',
    subtitle: 'Historyczny gmach główny przy ul. Rakowickiej 27 (Stara Aula, Rektorat, Muzeum UEK)',
    description:
      'Zabytkowy Gmach Główny Uniwersytetu Ekonomicznego w Krakowie położony w zachodniej części kampusu przy ul. Rakowickiej 27, na zachód od zielonego boiska (Forum UEK).',
    campus: 'Rakowicka',
    availableFloors: [-1, 0, 1, 2, 3],
    totalFloors: 3,
    totalRoomsCount: 20,
    directionsFromGate:
      'Stoi bezpośrednio po lewej stronie od głównego wejścia przy ul. Rakowickiej 27.',
    entranceDescription: 'Wejścia od strony dziedzińca wschodniego oraz podjazdu głównego.',
    coordinates: { lat: 50.0685, lng: 19.95392 },
    entranceCoordinates: { lat: 50.06839, lng: 19.95412 },
    entrances: [
      { lat: 50.06844, lng: 19.95382, type: 'door' },
      { lat: 50.06836, lng: 19.95412, type: 'door' },
    ],
    // Exact OSM Way 137068988 + 341533690
    footprint: [
      { lat: 50.068877, lng: 19.954052 },
      { lat: 50.068612, lng: 19.953862 },
      { lat: 50.068494, lng: 19.9537 },
      { lat: 50.068235, lng: 19.953581 },
      { lat: 50.068142, lng: 19.953625 },
      { lat: 50.068032, lng: 19.953791 },
      { lat: 50.068192, lng: 19.953924 },
      { lat: 50.068243, lng: 19.953759 },
      { lat: 50.068444, lng: 19.953914 },
      { lat: 50.068305, lng: 19.954198 },
      { lat: 50.068405, lng: 19.954453 },
      { lat: 50.068503, lng: 19.954181 },
      { lat: 50.068516, lng: 19.953967 },
      { lat: 50.06872, lng: 19.954114 },
      { lat: 50.068668, lng: 19.954279 },
      { lat: 50.068781, lng: 19.954363 },
    ],
    floors: [
      {
        level: -1,
        shortLabel: 'Poziom -1',
        badge: '-1',
        fullName: 'Poziom -1 (Przyziemie — Muzeum UEK i Galeria)',
        description: 'Muzeum Uniwersytetu Ekonomicznego w Krakowie, szatnia i Galeria pod Schodami.',
        rooms: buildFloorRooms('MAIN', 'Budynek główny', -1, [
          { num: 'Muzeum UEK', side: 'east', slot: 1, wing: 'center', type: 'auditorium', typeName: 'Ekspozycja historyczna', hint: 'Przyziemie Budynku Głównego' },
        ]),
      },
      {
        level: 0,
        shortLabel: 'Parter',
        badge: '0',
        fullName: 'Parter (poziom 0)',
        description: 'Hol reprezentacyjny, portiernia, Dział Nauczania i administracja.',
        rooms: buildFloorRooms('MAIN', 'Budynek główny', 0, [
          { num: 'Hol Główny', side: 'east', slot: 1, wing: 'center', type: 'auditorium', typeName: 'Hol reprezentacyjny', hint: 'Na wprost wejścia głównego' },
          { num: '012', side: 'west', slot: 2, wing: 'south', type: 'office', typeName: 'Administracja / Dział Nauczania', hint: 'Parter Budynku Głównego' },
        ]),
      },
      {
        level: 1,
        shortLabel: 'Piętro 1',
        badge: '1',
        fullName: 'I piętro (poziom 1) — Stara Aula i Sala Senacka',
        description: 'Stara Aula, Sala Senacka, Gabinet Rektora.',
        rooms: buildFloorRooms('MAIN', 'Budynek główny', 1, [
          { num: 'Stara Aula', side: 'east', slot: 1, wing: 'center', type: 'auditorium', typeName: 'Aula wykładowa', cap: 250, hint: 'Główne schody reprezentacyjne na I piętro' },
          { num: 'Sala Senacka', side: 'west', slot: 2, wing: 'south', type: 'seminar', typeName: 'Sala konferencyjna', cap: 60, hint: 'Obok Starej Auli' },
        ]),
      },
      {
        level: 2,
        shortLabel: 'Piętro 2',
        badge: '2',
        fullName: 'II piętro (poziom 2)',
        description: 'Jednostki ogólnouczelniane, sale seminaryjne i katedry.',
        rooms: buildFloorRooms('MAIN', 'Budynek główny', 2, [
          { num: '201', side: 'east', slot: 2, wing: 'center', type: 'office', typeName: 'Sala seminaryjna', cap: 30, hint: 'II piętro Budynku Głównego' },
        ]),
      },
      {
        level: 3,
        shortLabel: 'Piętro 3',
        badge: '3',
        fullName: 'III piętro (poziom 3 — poddasze użytkowe)',
        description: 'Działy administracyjne i biura na najwyższej kondygnacji Gmachu Głównego.',
        rooms: buildFloorRooms('MAIN', 'Budynek główny', 3, [
          { num: '302', side: 'east', slot: 1, wing: 'center', type: 'office', typeName: 'Biura uczelniane', hint: 'III piętro Budynku Głównego' },
        ]),
      },
    ],
  },

  USTRONIE: {
    code: 'USTRONIE',
    officialNumber: 5,
    shortLabel: 'U - Ustronie',
    circleLetter: 'U',
    mapBadge: 'U - Ustronie',
    fullName: 'Pawilon Ustronie (nr 5)',
    subtitle: '5-piętrowy budynek obok boiska (Katedry, sale dydaktyczne i CWP)',
    description:
      'Sześciokondygnacyjny naziemnie (parter + 5 pięter oraz przyziemie -1) Pawilon Ustronie położony na południowy wschód od zielonego boiska sportowego, przy al. Lubomirskiego.',
    campus: 'Rakowicka',
    availableFloors: [-1, 0, 1, 2, 3, 4, 5],
    totalFloors: 5,
    totalRoomsCount: 38,
    directionsFromGate:
      'Idź aleją południową wzdłuż zielonego boiska sportowego — Pawilon Ustronie stoi bezpośrednio za boiskiem.',
    entranceDescription: 'Wejścia od strony zachodniej i wschodniej (z niebieskimi ikonami drzwi/strzałki).',
    coordinates: { lat: 50.06798, lng: 19.95548 },
    entranceCoordinates: { lat: 50.06795, lng: 19.95538 },
    entrances: [
      { lat: 50.06798, lng: 19.95535, type: 'door' },
      { lat: 50.06792, lng: 19.95561, type: 'door' },
    ],
    // Exact OSM Way 137069023
    footprint: [
      { lat: 50.068272, lng: 19.955587 },
      { lat: 50.068055, lng: 19.955428 },
      { lat: 50.06779, lng: 19.955235 },
      { lat: 50.067701, lng: 19.955352 },
      { lat: 50.06793, lng: 19.955555 },
      { lat: 50.068218, lng: 19.955764 },
    ],
    floors: [
      {
        level: -1,
        shortLabel: 'Poziom -1',
        badge: '-1',
        fullName: 'Poziom -1 (Przyziemie Pawilonu Ustronie)',
        description: 'Pomieszczenia techniczne i gospodarcze.',
        rooms: buildFloorRooms('USTRONIE', 'Ustronie', -1, [
          { num: 'U.01p', side: 'west', slot: 1, wing: 'center', type: 'storage', typeName: 'Przyziemie', hint: 'Poziom -1 Pawilonu Ustronie' },
        ]),
      },
      {
        level: 0,
        shortLabel: 'Parter',
        badge: '0',
        fullName: 'Parter (poziom 0) — Sale i Centrum Wsparcia Psychologicznego',
        description: 'Sale dydaktyczne parteru oraz Centrum Wsparcia Psychologicznego (pok. 008).',
        rooms: buildFloorRooms('USTRONIE', 'Ustronie', 0, [
          { num: '008', side: 'west', slot: 0, wing: 'north', type: 'office', typeName: 'Centrum Wsparcia Psychologicznego', hint: 'Parter Pawilonu Ustronie — pok. 008' },
          { num: 'U.04', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 32, hint: 'Północna część parteru' },
          { num: 'U.01', side: 'west', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Przy wejściu głównym' },
        ]),
      },
      {
        level: 1,
        shortLabel: 'Piętro 1',
        badge: '1',
        fullName: 'I piętro (poziom 1)',
        description: 'Sale ćwiczeniowe i seminaryjne na I piętrze.',
        rooms: buildFloorRooms('USTRONIE', 'Ustronie', 1, [
          { num: 'U.12', side: 'east', slot: 1, wing: 'north', type: 'seminar', typeName: 'Sala', cap: 30, hint: 'Północne skrzydło I piętra' },
          { num: 'U.10', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala', cap: 35, hint: 'Środek I piętra' },
        ]),
      },
      {
        level: 2,
        shortLabel: 'Piętro 2',
        badge: '2',
        fullName: 'II piętro (poziom 2) — Katedra Rachunkowości',
        description: 'Katedra Rachunkowości (s. 210) i sale seminaryjne.',
        rooms: buildFloorRooms('USTRONIE', 'Ustronie', 2, [
          { num: '210', side: 'east', slot: 1, wing: 'north', type: 'office', typeName: 'Katedra Rachunkowości', searchTitle: 'Ustronie Katedra Rachunkowości 210', hint: 'II piętro Pawilonu Ustronie' },
          { num: 'U.20', side: 'west', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala seminaryjna', cap: 28, hint: 'Środek II piętra' },
        ]),
      },
      {
        level: 3,
        shortLabel: 'Piętro 3',
        badge: '3',
        fullName: 'III piętro (poziom 3) — Katedra Handlu Zagranicznego i MSG',
        description: 'Katedra Handlu Zagranicznego oraz Katedra Międzynarodowych Stosunków Gospodarczych (pok. 304–315).',
        rooms: buildFloorRooms('USTRONIE', 'Ustronie', 3, [
          { num: '315', side: 'west', slot: 0, wing: 'north', type: 'office', typeName: 'Katedra Handlu Zagranicznego', hint: 'III piętro Pawilonu Ustronie' },
          { num: '313', side: 'east', slot: 1, wing: 'north', type: 'office', typeName: 'Katedra Międzynarodowych Stosunków Gospodarczych', hint: 'III piętro Pawilonu Ustronie' },
          { num: '312', side: 'east', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala seminaryjna', cap: 28, hint: 'Środek III piętra' },
          { num: '304', side: 'west', slot: 3, wing: 'south', type: 'seminar', typeName: 'Sala / Katedra', cap: 26, hint: 'Południowe skrzydło III piętra' },
        ]),
      },
      {
        level: 4,
        shortLabel: 'Piętro 4',
        badge: '4',
        fullName: 'IV piętro (poziom 4)',
        description: 'Sekretariaty katedr i pokoje naukowo-dydaktyczne (pok. 402–412).',
        rooms: buildFloorRooms('USTRONIE', 'Ustronie', 4, [
          { num: '408', side: 'east', slot: 1, wing: 'north', type: 'office', typeName: 'Gabinety Katedr', hint: 'IV piętro Pawilonu Ustronie' },
          { num: '404', side: 'east', slot: 2, wing: 'center', type: 'office', typeName: 'Sekretariat Katedry', hint: 'IV piętro Pawilonu Ustronie — pok. 404' },
        ]),
      },
      {
        level: 5,
        shortLabel: 'Piętro 5',
        badge: '5',
        fullName: 'V piętro (poziom 5) — Katedra Studiów Europejskich',
        description: 'Katedra Studiów Europejskich i Integracji Gospodarczej (m.in. pok. 509).',
        rooms: buildFloorRooms('USTRONIE', 'Ustronie', 5, [
          { num: '509', side: 'east', slot: 1, wing: 'north', type: 'office', typeName: 'Katedra Studiów Europejskich i Integracji Gospodarczej', hint: 'V piętro Pawilonu Ustronie — pok. 509' },
          { num: '504', side: 'west', slot: 2, wing: 'center', type: 'seminar', typeName: 'Sala seminaryjna', cap: 24, hint: 'V piętro Pawilonu Ustronie' },
        ]),
      },
    ],
  },

  BIBLIOTEKA: {
    code: 'BIBLIOTEKA',
    officialNumber: 11,
    shortLabel: 'Biblioteka',
    circleLetter: '11',
    mapBadge: 'Biblioteka',
    fullName: 'Biblioteka Główna UEK (nr 11)',
    subtitle: 'Czytelnia Główna (p. 3), Pokoje Pracy Zespołowej, Wypożyczalnia i Wydawnictwo UEK',
    description:
      'Czterokondygnacyjny gmach Biblioteki Głównej UEK (parter + 3 piętra) położony w centralno-wschodniej części kampusu pomiędzy Pawilonem B a Pawilonem Finansów (F).',
    campus: 'Rakowicka',
    availableFloors: [0, 1, 2, 3],
    totalFloors: 3,
    totalRoomsCount: 18,
    directionsFromGate: 'Idź główną aleją za Pawilon B — duży gmach Biblioteki stoi po prawej stronie.',
    entranceDescription: 'Wejście od strony północno-zachodniej.',
    coordinates: { lat: 50.0687, lng: 19.95605 },
    entranceCoordinates: { lat: 50.06885, lng: 19.95592 },
    entrances: [{ lat: 50.06885, lng: 19.95592, type: 'door' }],
    // Exact OSM Relation 16394638
    footprint: [
      { lat: 50.06855, lng: 19.955864 },
      { lat: 50.068483, lng: 19.955813 },
      { lat: 50.068508, lng: 19.955733 },
      { lat: 50.068575, lng: 19.955783 },
      { lat: 50.068599, lng: 19.955709 },
      { lat: 50.068969, lng: 19.955987 },
      { lat: 50.069046, lng: 19.956044 },
      { lat: 50.068904, lng: 19.956505 },
      { lat: 50.068456, lng: 19.956167 },
      { lat: 50.068521, lng: 19.955958 },
    ],
    floors: [
      {
        level: 0,
        shortLabel: 'Parter',
        badge: '0',
        fullName: 'Parter (poziom 0) — Wypożyczalnia',
        description: 'Wypożyczalnia, zwroty książek, szatnia i informatorium.',
        rooms: buildFloorRooms('BIBLIOTEKA', 'Biblioteka', 0, [
          { num: 'Wypożyczalnia', side: 'east', slot: 2, wing: 'center', type: 'office', typeName: 'Obsługa czytelników', cap: 50, hint: 'Parter Biblioteki' },
        ]),
      },
      {
        level: 1,
        shortLabel: 'Piętro 1',
        badge: '1',
        fullName: 'I piętro (poziom 1) — Strefa Katalogów',
        description: 'Katalogi komputerowe, stanowiska komputerowe i strefa wolnego dostępu.',
        rooms: buildFloorRooms('BIBLIOTEKA', 'Biblioteka', 1, [
          { num: '105', side: 'east', slot: 1, wing: 'center', type: 'lab', typeName: 'Strefa komputerowa i katalogi', cap: 60, hint: 'I piętro Biblioteki' },
        ]),
      },
      {
        level: 2,
        shortLabel: 'Piętro 2',
        badge: '2',
        fullName: 'II piętro (poziom 2) — Czytelnia Czasopism i Wydawnictwo UEK',
        description: 'Czytelnia czasopism, informacja naukowa oraz Wydawnictwo UEK (pok. 210).',
        rooms: buildFloorRooms('BIBLIOTEKA', 'Biblioteka', 2, [
          { num: '210', side: 'east', slot: 1, wing: 'north', type: 'office', typeName: 'Wydawnictwo Redaktor Naczelny', searchTitle: 'Biblioteka Wydawnictwo Redaktor Naczelny 210', hint: 'II piętro Biblioteki' },
          { num: 'Czytelnia Czasopism', side: 'west', slot: 2, wing: 'center', type: 'seminar', typeName: 'Strefa cichej nauki', cap: 80, hint: 'II piętro Biblioteki' },
        ]),
      },
      {
        level: 3,
        shortLabel: 'Piętro 3',
        badge: '3',
        fullName: 'III piętro (poziom 3) — Czytelnia Główna i Pokoje Pracy Zespołowej',
        description: 'Czytelnia Główna (pok. 301) oraz Pokoje Pracy Zespołowej (pok. 316, 326).',
        rooms: buildFloorRooms('BIBLIOTEKA', 'Biblioteka', 3, [
          { num: '301', side: 'east', slot: 1, wing: 'north', type: 'auditorium', typeName: 'Czytelnia Główna', cap: 150, hint: 'III piętro Biblioteki — pokój 301' },
          { num: '316', side: 'west', slot: 2, wing: 'center', type: 'seminar', typeName: 'Pokój Pracy Zespołowej', cap: 16, hint: 'III piętro Biblioteki — pok. 316' },
          { num: '326', side: 'east', slot: 3, wing: 'south', type: 'seminar', typeName: 'Pokój Pracy Zespołowej', cap: 16, hint: 'III piętro Biblioteki — pok. 326' },
        ]),
      },
    ],
  },

  S: {
    code: 'S',
    officialNumber: 12,
    shortLabel: 'S - Sportowy',
    circleLetter: 'S',
    mapBadge: 'S - Sportowy',
    fullName: 'Pawilon Dydaktyczno-Sportowy (nr 12)',
    subtitle: 'Hala sportowa, Basen UEK, siłownia i sale SWFiS',
    description:
      'Kompleks Dydaktyczno-Sportowy we wschodniej części kampusu (obok Pawilonu Ustronie i al. Lubomirskiego).',
    campus: 'Rakowicka',
    availableFloors: [-1, 0, 1, 2],
    totalFloors: 2,
    totalRoomsCount: 14,
    directionsFromGate: 'Idź aleją południową za Pawilon Ustronie.',
    entranceDescription: 'Wejście od strony północno-zachodniej.',
    coordinates: { lat: 50.06771, lng: 19.95663 },
    entranceCoordinates: { lat: 50.06798, lng: 19.95653 },
    entrances: [{ lat: 50.06798, lng: 19.95653, type: 'door' }],
    // Exact OSM Way 219443718
    footprint: [
      { lat: 50.067985, lng: 19.956532 },
      { lat: 50.067895, lng: 19.956447 },
      { lat: 50.067475, lng: 19.95652 },
      { lat: 50.067508, lng: 19.957122 },
      { lat: 50.068013, lng: 19.957056 },
    ],
    floors: [
      {
        level: -1,
        shortLabel: 'Poziom -1',
        badge: '-1',
        fullName: 'Poziom -1 (Szatnie basenowe i siłownia)',
        description: 'Szatnie krytej pływalni, siłownia i zaplecze sportowe.',
        rooms: buildFloorRooms('S', 'Pawilon S', -1, [
          { num: 'Siłownia', side: 'east', slot: 1, wing: 'center', type: 'seminar', typeName: 'Siłownia SWFiS', cap: 35, hint: 'Poziom -1 kompleksu sportowego' },
        ]),
      },
      {
        level: 0,
        shortLabel: 'Parter',
        badge: '0',
        fullName: 'Parter (poziom 0) — Hala i Basen',
        description: 'Hala widowiskowo-sportowa oraz kryta pływalnia UEK.',
        rooms: buildFloorRooms('S', 'Pawilon S', 0, [
          { num: 'Hala Sportowa', side: 'east', slot: 1, wing: 'north', type: 'auditorium', typeName: 'Główna hala SWFiS', cap: 200, hint: 'Parter kompleksu sportowego' },
          { num: 'Pływalnia', side: 'west', slot: 3, wing: 'south', type: 'seminar', typeName: 'Basen UEK', cap: 60, hint: 'Skrzydło południowe' },
        ]),
      },
      {
        level: 1,
        shortLabel: 'Piętro 1',
        badge: '1',
        fullName: 'I piętro (poziom 1)',
        description: 'Sale dydaktyczne SWFiS oraz trybuny.',
        rooms: buildFloorRooms('S', 'Pawilon S', 1, [
          { num: 'S.1', side: 'east', slot: 1, wing: 'center', type: 'seminar', typeName: 'Sala dydaktyczna SWFiS', cap: 36, hint: 'I piętro Pawilonu Sportowego' },
          { num: 'S.2', side: 'west', slot: 2, wing: 'south', type: 'seminar', typeName: 'Sala fitness / aerobik', cap: 30, hint: 'I piętro Pawilonu Sportowego' },
        ]),
      },
      {
        level: 2,
        shortLabel: 'Piętro 2',
        badge: '2',
        fullName: 'II piętro (poziom 2) — Studium Wychowania Fizycznego i Sportu',
        description: 'Sekretariat i pokoje instruktorów SWFiS UEK.',
        rooms: buildFloorRooms('S', 'Pawilon S', 2, [
          { num: 'SWFiS', side: 'east', slot: 1, wing: 'center', type: 'office', typeName: 'Sekretariat SWFiS', hint: 'II piętro Pawilonu Sportowego' },
        ]),
      },
    ],
  },

  KSIEZOWKA: {
    code: 'KSIEZOWKA',
    officialNumber: 4,
    shortLabel: 'Księżówka',
    circleLetter: '4',
    mapBadge: 'Księżówka',
    fullName: 'Pawilon Księżówka (nr 4)',
    subtitle: 'Budynek przy wejściu zachodnim obok Pawilonu A i D',
    description:
      'Historyczny budynek Księżówki położony przy wejściu zachodnim od ul. Rakowickiej, tuż przed Pawilonem A.',
    campus: 'Rakowicka',
    availableFloors: [0, 1, 2],
    totalFloors: 2,
    totalRoomsCount: 10,
    directionsFromGate: 'Przy wejściu zachodnim od ul. Rakowickiej, przed Pawilonem A.',
    entranceDescription: 'Wejście od strony południowej (z niebieską ikoną drzwi).',
    coordinates: { lat: 50.06918, lng: 19.95405 },
    entranceCoordinates: { lat: 50.06909, lng: 19.95409 },
    entrances: [{ lat: 50.06909, lng: 19.95409, type: 'door' }],
    // Exact OSM Way 234310408
    footprint: [
      { lat: 50.069277, lng: 19.953966 },
      { lat: 50.069134, lng: 19.953925 },
      { lat: 50.069082, lng: 19.954094 },
      { lat: 50.069194, lng: 19.95424 },
    ],
    floors: [
      {
        level: 0,
        shortLabel: 'Parter',
        badge: '0',
        fullName: 'Parter (poziom 0)',
        description: 'Sale seminaryjne K.1–K.4.',
        rooms: buildFloorRooms('KSIEZOWKA', 'Księżówka', 0, [
          { num: 'K.1', side: 'east', slot: 1, wing: 'center', type: 'seminar', typeName: 'Sala seminaryjna', cap: 25, hint: 'Parter Księżówki' },
          { num: 'K.2', side: 'west', slot: 2, wing: 'north', type: 'seminar', typeName: 'Sala seminaryjna', cap: 25, hint: 'Parter Księżówki' },
        ]),
      },
      {
        level: 1,
        shortLabel: 'Piętro 1',
        badge: '1',
        fullName: 'I piętro (poziom 1)',
        description: 'Sale seminaryjne na I piętrze.',
        rooms: buildFloorRooms('KSIEZOWKA', 'Księżówka', 1, [
          { num: 'K.11', side: 'east', slot: 1, wing: 'center', type: 'seminar', typeName: 'Sala seminaryjna', cap: 28, hint: 'I piętro Księżówki' },
        ]),
      },
      {
        level: 2,
        shortLabel: 'Piętro 2',
        badge: '2',
        fullName: 'II piętro (poziom 2)',
        description: 'Pokoje biurowe i dydaktyczne na II piętrze Księżówki.',
        rooms: buildFloorRooms('KSIEZOWKA', 'Księżówka', 2, [
          { num: 'K.21', side: 'east', slot: 1, wing: 'center', type: 'office', typeName: 'Sala / Biuro', cap: 20, hint: 'II piętro Księżówki' },
        ]),
      },
    ],
  },

  OGRODNIK: {
    code: 'OGRODNIK',
    officialNumber: 2,
    shortLabel: 'Dom Ogrodnika',
    circleLetter: '2',
    mapBadge: 'Dom Ogrodnika',
    fullName: 'Dom Ogrodnika (nr 2)',
    subtitle: 'Zabytkowy budynek przy bramie zachodniej od ul. Rakowickiej',
    description: 'Zabytkowy Dom Ogrodnika przy ul. Rakowickiej (na zachód od Księżówki).',
    campus: 'Rakowicka',
    availableFloors: [0, 1],
    totalFloors: 1,
    totalRoomsCount: 6,
    directionsFromGate: 'Przy samej ul. Rakowickiej obok Księżówki.',
    entranceDescription: 'Wejście od strony alejki.',
    coordinates: { lat: 50.06911, lng: 19.95347 },
    entranceCoordinates: { lat: 50.06908, lng: 19.95352 },
    entrances: [],
    // Exact OSM Way 166955405
    footprint: [
      { lat: 50.069173, lng: 19.953444 },
      { lat: 50.069082, lng: 19.953376 },
      { lat: 50.069038, lng: 19.953533 },
      { lat: 50.069121, lng: 19.953595 },
    ],
    floors: [
      {
        level: 0,
        shortLabel: 'Parter',
        badge: '0',
        fullName: 'Parter (poziom 0)',
        description: 'Pomieszczenia organizacji studenckich i administracyjne.',
        rooms: buildFloorRooms('OGRODNIK', 'Dom Ogrodnika', 0, [
          { num: 'O.1', side: 'east', slot: 1, wing: 'center', type: 'office', typeName: 'Parter Domu Ogrodnika', hint: 'Parter' },
        ]),
      },
      {
        level: 1,
        shortLabel: 'Piętro 1',
        badge: '1',
        fullName: 'I piętro (poziom 1)',
        description: 'Biura na I piętrze Domu Ogrodnika.',
        rooms: buildFloorRooms('OGRODNIK', 'Dom Ogrodnika', 1, [
          { num: 'O.11', side: 'east', slot: 1, wing: 'center', type: 'office', typeName: 'I piętro Domu Ogrodnika', hint: 'I piętro' },
        ]),
      },
    ],
  },
};

// Search across all pavilions, rooms, and departments (just like Screenshot 3: "ZNAJDŹ SWOJĄ SALĘ")
export interface CampusSearchResult {
  id: string;
  pavilionCode: string;
  pavilionLabel: string;
  roomNumber: string;
  floorLevel: number;
  titlePrefix: string; // e.g. "Pawilon F Sala" or "Ustronie Katedra Rachunkowości"
  highlightedNumber: string; // e.g. "210"
  floorSuffix: string; // e.g. "piętro 2" or "parter"
}

export function searchCampusCatalog(query: string): CampusSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: CampusSearchResult[] = [];

  for (const pav of Object.values(UEK_PAVILIONS_DATA)) {
    // Also match pavilion itself if user types "Pawilon B" or "Ustronie"
    if (
      pav.fullName.toLowerCase().includes(q) ||
      pav.shortLabel.toLowerCase().includes(q)
    ) {
      const defaultFloor = pav.floors.find((f) => f.level === 0) || pav.floors[0];
      const firstRoom = defaultFloor?.rooms[0];
      if (firstRoom) {
        results.push({
          id: `pav-${pav.code}`,
          pavilionCode: pav.code,
          pavilionLabel: pav.shortLabel,
          roomNumber: firstRoom.number,
          floorLevel: defaultFloor.level,
          titlePrefix: `${pav.fullName} — budynek dydaktyczny`,
          highlightedNumber: pav.circleLetter,
          floorSuffix: `${pav.totalRoomsCount} sal (piętra: ${pav.availableFloors.join(', ')})`,
        });
      }
    }

    for (const fl of pav.floors) {
      for (const rm of fl.rooms) {
        const hay = `${pav.fullName} ${pav.shortLabel} ${rm.typeName} ${rm.number} ${rm.code}`.toLowerCase();
        if (hay.includes(q)) {
          const floorSuffix =
            fl.level === 0
              ? 'parter'
              : fl.level === -1
              ? 'poziom -1'
              : `piętro ${fl.level}`;

          results.push({
            id: `${pav.code}-${fl.level}-${rm.number}`,
            pavilionCode: pav.code,
            pavilionLabel: pav.shortLabel,
            roomNumber: rm.number,
            floorLevel: fl.level,
            titlePrefix: `${
              pav.code.length === 1 ? `Pawilon ${pav.code}` : pav.shortLabel
            } ${rm.typeName}`,
            highlightedNumber: rm.number,
            floorSuffix,
          });
        }
      }
    }
  }

  return results.slice(0, 12);
}

export interface ParsedRoomLocation {
  pavilion: UekPavilionSpec;
  roomCode: string;
  roomNumberDisplay: string;
  floorLevel: number;
  floorLabel: string;
  floorShort: string;
  wing: 'north' | 'center' | 'south';
  wingTitle: string;
  positionHint: string;
  matchedRoomItem: UekRoomItem;
}

export function resolveRoomLocation(roomStr: string): ParsedRoomLocation {
  const clean = (roomStr || '').trim();
  const upper = clean.toUpperCase();

  let pavCode = 'A';
  const pavMatch = upper.match(/PAW(?:ILON)?\.?\s*([A-GSU])/i);
  if (pavMatch) {
    const letter = pavMatch[1].toUpperCase();
    pavCode = letter === 'U' ? 'USTRONIE' : letter;
  } else if (upper.includes('USTRONIE')) {
    pavCode = 'USTRONIE';
  } else if (upper.includes('FINANS')) {
    pavCode = 'F';
  } else if (upper.includes('KSIĘŻÓWKA') || upper.includes('KSIEZOWKA')) {
    pavCode = 'KSIEZOWKA';
  } else if (upper.includes('BIBLIOTEK')) {
    pavCode = 'BIBLIOTEKA';
  } else if (
    upper.includes('CENTRUM JĘZYKOWE') ||
    upper.includes('LEKTORAT') ||
    upper.includes('CJ')
  ) {
    pavCode = 'B';
  } else if (upper.includes('STARA AULA') || upper.includes('GŁÓWNY')) {
    pavCode = 'MAIN';
  } else if (upper.includes('NOWA AULA') || upper.includes('SALA F')) {
    pavCode = 'C';
  }

  const numMatch = clean.match(/\b(\d{1,3}[A-Za-z]?)\b/);
  let extractedNum = numMatch ? numMatch[1] : '';

  if (!extractedNum) {
    if (upper.includes('NOWA AULA')) extractedNum = 'Nowa Aula';
    else if (upper.includes('STARA AULA')) extractedNum = 'Stara Aula';
    else if (upper.includes('SALA F')) extractedNum = 'Sala F';
    else if (pavCode === 'B') extractedNum = '252';
    else extractedNum = '119';
  }

  if (!pavMatch) {
    const digitsOnly = parseInt(extractedNum.replace(/\D/g, ''), 10);
    if (!isNaN(digitsOnly)) {
      const lastTwo = digitsOnly % 100;
      if (digitsOnly >= 500 && digitsOnly <= 799) {
        pavCode = 'F';
      } else if (lastTwo >= 40 && lastTwo <= 68) {
        pavCode = 'B';
      }
    }
  }

  const pavilion = UEK_PAVILIONS_DATA[pavCode] || UEK_PAVILIONS_DATA.A;

  let floorLevel = pavCode === 'B' ? 2 : 1;
  const digitsStr = extractedNum.replace(/\D/g, '');
  if (digitsStr.length === 3) {
    const firstDigit = parseInt(digitsStr[0], 10);
    if (!isNaN(firstDigit) && pavilion.availableFloors.includes(firstDigit)) {
      floorLevel = firstDigit;
    }
  } else if (digitsStr.length === 2) {
    // In Pawilon G / Księżówka / Ustronie, 2-digit numbers starting with 1 or 2 (e.g., G.12, G.13, G.23, K.11) indicate floor 1 or 2, whereas 01..09 indicate Parter (0)
    const firstDigit = parseInt(digitsStr[0], 10);
    if (
      (pavCode === 'G' || pavCode === 'KSIEZOWKA' || pavCode === 'USTRONIE') &&
      firstDigit >= 1 &&
      pavilion.availableFloors.includes(firstDigit)
    ) {
      floorLevel = firstDigit;
    } else {
      floorLevel = 0;
    }
  } else if (digitsStr.length === 1 || extractedNum.includes('Aula')) {
    floorLevel = extractedNum === 'Stara Aula' ? 1 : 0;
  }

  const floorSpec =
    pavilion.floors.find((f) => f.level === floorLevel) || pavilion.floors[0];

  let matchedRoom = floorSpec.rooms.find(
    (r) => r.number.toUpperCase() === extractedNum.toUpperCase()
  );

  if (!matchedRoom) {
    const lastTwo =
      digitsStr.length >= 2 ? parseInt(digitsStr.slice(-2), 10) : 15;
    const wing: 'north' | 'center' | 'south' =
      pavCode === 'B'
        ? lastTwo <= 51
          ? 'north'
          : lastTwo === 52
          ? 'center'
          : 'south'
        : lastTwo >= 16
        ? 'north'
        : lastTwo >= 10
        ? 'center'
        : 'south';

    matchedRoom = {
      number: extractedNum,
      code: `Paw.${pavilion.code} ${extractedNum}`,
      floor: floorSpec.level,
      wing,
      side: lastTwo % 2 === 0 ? 'east' : 'west',
      slotIndex: 2,
      type: pavCode === 'B' ? 'language' : 'seminar',
      typeName: pavCode === 'B' ? 'Sala lektoratowa CJ' : 'Sala',
      fullSearchTitle: `${pavilion.fullName} Sala ${extractedNum}`,
      capacity: 32,
      positionHint:
        wing === 'north'
          ? 'Skrzydło północne korytarza (od schodów w stronę łącznika)'
          : wing === 'center'
          ? 'Część centralna naprzeciwko klatki schodowej i windy'
          : 'Skrzydło południowe korytarza',
    };
  }

  const wingTitle =
    matchedRoom.wing === 'north'
      ? 'Skrzydło północne'
      : matchedRoom.wing === 'south'
      ? 'Skrzydło południowe'
      : 'Część centralna (przy schodach i windzie)';

  return {
    pavilion,
    roomCode: matchedRoom.number,
    roomNumberDisplay:
      matchedRoom.number.toLowerCase().includes('sala') ||
      matchedRoom.number.toLowerCase().includes('aula')
        ? matchedRoom.number
        : `Sala ${matchedRoom.number}`,
    floorLevel: floorSpec.level,
    floorLabel: floorSpec.fullName,
    floorShort: floorSpec.shortLabel,
    wing: matchedRoom.wing,
    wingTitle,
    positionHint: matchedRoom.positionHint,
    matchedRoomItem: matchedRoom,
  };
}
