import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  ArrowLeft,
  ArrowUpRight,
  Compass,
  DoorOpen,
  ExternalLink,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Minus,
  Navigation,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  UEK_CAMPUS_POIS,
  UEK_GREEN_PITCH_POLYGON,
  UEK_MAIN_GATE_COORDS,
  UEK_PAVILIONS_DATA,
  UekPavilionSpec,
  UekRoomItem,
  resolveRoomLocation,
  searchCampusCatalog,
} from '../utils/uekCampusData';

export { resolveRoomLocation as parseRoomDetails };

function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function wrapSubtitleLines(text: string, maxCharsPerLine = 20): string[] {
  const clean = text.trim();
  if (!clean || clean.toLowerCase() === 'sala') return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    if (!current) {
      current = w;
    } else if ((current + ' ' + w).length <= maxCharsPerLine) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

/**
 * Orthogonal Top-Down Projection (0° tilt — straight from above!).
 * UEK Campus along ul. Rakowicka is naturally rotated by +25.59° from true North.
 * Rotating by -25.59° around the campus center aligns ul. Rakowicka vertically on the left,
 * al. Lubomirskiego horizontally at the bottom, and makes all UEK pavilions (A, B, C, D, E, F, G,
 * Budynek główny, Biblioteka, Boisko, Ustronie, Sportowy) stand straight and orthogonal (0° tilt).
 */
const CAMPUS_VIEW = {
  width: 780,
  height: 560,
  centerLat: 50.06865,
  centerLng: 19.95505,
  rotationDeg: -25.59,
  scaleX: 2.38,
  scaleY: 2.18,
  originX: 355,
  originY: 248,
  minLat: 50.0673,
  maxLat: 50.06995,
  minLng: 19.9531,
  maxLng: 19.9573,
};

const ROT_RAD = (CAMPUS_VIEW.rotationDeg * Math.PI) / 180;
const COS_ROT = Math.cos(ROT_RAD);
const SIN_ROT = Math.sin(ROT_RAD);
const METERS_PER_LAT = 111132;
const METERS_PER_LNG = 71330;

function projectLatLng(lat: number, lng: number): { x: number; y: number } {
  const eastMeters = (lng - CAMPUS_VIEW.centerLng) * METERS_PER_LNG;
  const northMeters = (lat - CAMPUS_VIEW.centerLat) * METERS_PER_LAT;

  // Rotate by -25.59° so campus buildings are aligned straight top-down (orthogonal)
  const u = eastMeters * COS_ROT + northMeters * SIN_ROT;
  const v = -eastMeters * SIN_ROT + northMeters * COS_ROT;

  const x = CAMPUS_VIEW.originX + u * CAMPUS_VIEW.scaleX;
  const y = CAMPUS_VIEW.originY - v * CAMPUS_VIEW.scaleY;

  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
  };
}

function unprojectSvgToLatLng(
  svgX: number,
  svgY: number
): { lat: number; lng: number } {
  const u = (svgX - CAMPUS_VIEW.originX) / CAMPUS_VIEW.scaleX;
  const v = (CAMPUS_VIEW.originY - svgY) / CAMPUS_VIEW.scaleY;

  // Inverse rotation (+25.59°)
  const eastMeters = u * COS_ROT - v * SIN_ROT;
  const northMeters = u * SIN_ROT + v * COS_ROT;

  return {
    lat: Number((CAMPUS_VIEW.centerLat + northMeters / METERS_PER_LAT).toFixed(6)),
    lng: Number((CAMPUS_VIEW.centerLng + eastMeters / METERS_PER_LNG).toFixed(6)),
  };
}

function toSvgPolygonPoints(coords: Array<{ lat: number; lng: number }>): string {
  return coords
    .map((c) => {
      const pt = projectLatLng(c.lat, c.lng);
      return `${pt.x},${pt.y}`;
    })
    .join(' ');
}

const CONTEXT_BUILDINGS_POLYGONS: Array<Array<{ lat: number; lng: number }>> = [
  [
    { lat: 50.06972, lng: 19.95519 },
    { lat: 50.06949, lng: 19.95534 },
    { lat: 50.06987, lng: 19.95562 },
    { lat: 50.06995, lng: 19.95536 },
  ],
  [
    { lat: 50.06958, lng: 19.95562 },
    { lat: 50.06936, lng: 19.95577 },
    { lat: 50.06974, lng: 19.95605 },
    { lat: 50.06982, lng: 19.95579 },
  ],
  [
    { lat: 50.06941, lng: 19.956 },
    { lat: 50.06925, lng: 19.95615 },
    { lat: 50.06962, lng: 19.95642 },
    { lat: 50.06969, lng: 19.9562 },
  ],
];

const AccurateGoogleMapOverlays: React.FC<{
  activePavilion: UekPavilionSpec;
  gpsCoords: { lat: number; lng: number };
  onSelectPavilion: (code: string) => void;
}> = ({ activePavilion, gpsCoords, onSelectPavilion }) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  interface MapOverlayHandle {
    setMap: (m: unknown) => void;
  }
  const polygonsRef = useRef<MapOverlayHandle[]>([]);

  useEffect(() => {
    if (!map) return;
    map.panTo(activePavilion.coordinates);
    map.setZoom(18);
    map.setTilt(0);
    map.setHeading(0);
  }, [map, activePavilion]);

  useEffect(() => {
    if (!map || !mapsLib) return;
    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current = [];

    Object.values(UEK_PAVILIONS_DATA).forEach((pav) => {
      const isSelected = pav.code === activePavilion.code;
      const poly = new mapsLib.Polygon({
        paths: pav.footprint,
        strokeColor: isSelected ? '#4338CA' : '#52525B',
        strokeOpacity: 1,
        strokeWeight: isSelected ? 3.5 : 2,
        fillColor: isSelected ? '#4338CA' : '#D6D3C9',
        fillOpacity: isSelected ? 0.35 : 0.65,
        clickable: true,
        map,
        zIndex: isSelected ? 10 : 3,
      });
      poly.addListener('click', () => onSelectPavilion(pav.code));
      polygonsRef.current.push(poly);
    });

    // Dashed walking polyline on Google Maps from GPS marker to selected building
    const routeLine = new mapsLib.Polyline({
      path: [gpsCoords, activePavilion.entranceCoordinates],
      strokeOpacity: 0,
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            strokeColor: '#4338CA',
            scale: 3.5,
          },
          offset: '0',
          repeat: '16px',
        },
      ],
      map,
      zIndex: 25,
    });
    polygonsRef.current.push(routeLine);

    return () => {
      polygonsRef.current.forEach((p) => p.setMap(null));
      polygonsRef.current = [];
    };
  }, [map, mapsLib, activePavilion, gpsCoords, onSelectPavilion]);

  return null;
};

interface CampusMapModalProps {
  roomString: string | null;
  subjectName?: string;
  onClose: () => void;
  isDark: boolean;
  accentColor: string;
}

export const CampusMapModal: React.FC<CampusMapModalProps> = ({
  roomString,
  subjectName,
  onClose,
  isDark,
}) => {
  const [activeRoomQuery, setActiveRoomQuery] = useState<string>(
    roomString || 'Paw.B 252'
  );
  useEffect(() => {
    if (roomString) setActiveRoomQuery(roomString);
  }, [roomString]);

  const parsed = useMemo(
    () => resolveRoomLocation(activeRoomQuery),
    [activeRoomQuery]
  );

  const [viewMode, setViewMode] = useState<'campus' | 'indoor' | 'official'>(
    'campus'
  );
  const [officialSubTab, setOfficialSubTab] = useState<'poster' | 'google'>(
    'poster'
  );

  const [searchInput, setSearchInput] = useState<string>('');
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);

  const [selectedPavilionCode, setSelectedPavilionCode] = useState<string>(
    parsed.pavilion.code
  );
  const [selectedFloor, setSelectedFloor] = useState<number>(parsed.floorLevel);
  const [selectedRoomNumber, setSelectedRoomNumber] = useState<string>(
    parsed.roomCode
  );

  // Interactive Zoom & Pan state (supports + / - buttons, mouse wheel, touch drag, and 2-finger pinch-to-zoom!)
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const isDraggingRef = useRef<boolean>(false);
  const dragMovedRef = useRef<boolean>(false);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);

  const resetZoomAndPan = () => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleZoomBy = (delta: number) => {
    setZoomScale((prev) => {
      const next = Math.min(4, Math.max(1, Number((prev + delta).toFixed(2))));
      if (next === 1) {
        setPanOffset({ x: 0, y: 0 });
      }
      return next;
    });
  };

  useEffect(() => {
    resetZoomAndPan();
  }, [viewMode]);

  useEffect(() => {
    setSelectedPavilionCode(parsed.pavilion.code);
    setSelectedFloor(parsed.floorLevel);
    setSelectedRoomNumber(parsed.roomCode);
  }, [parsed]);

  const activePavilion =
    UEK_PAVILIONS_DATA[selectedPavilionCode] || parsed.pavilion;

  const currentFloorSpec =
    activePavilion.floors.find((f) => f.level === selectedFloor) ||
    activePavilion.floors.find((f) => f.level === 1) ||
    activePavilion.floors[0];

  const indoorRoomsList: UekRoomItem[] = useMemo(() => {
    const base = [...currentFloorSpec.rooms];
    if (
      activePavilion.code === parsed.pavilion.code &&
      currentFloorSpec.level === parsed.floorLevel
    ) {
      const exists = base.some(
        (r) =>
          r.number.toUpperCase() === parsed.matchedRoomItem.number.toUpperCase()
      );
      if (!exists) {
        base.push(parsed.matchedRoomItem);
      }
    }
    return base;
  }, [currentFloorSpec, activePavilion.code, parsed]);

  const searchResults = useMemo(() => {
    const q = searchInput.trim() || (isSearchFocused ? parsed.roomCode : '');
    return searchCampusCatalog(q);
  }, [searchInput, isSearchFocused, parsed.roomCode]);

  // Live GPS tracking + optional user-placed or simulated campus GPS pin
  const [gpsStatus, setGpsStatus] = useState<
    'idle' | 'locating' | 'active' | 'denied'
  >('idle');
  const [userCoords, setUserCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [customCampusGpsCoords, setCustomCampusGpsCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [isSimulatingWalk, setIsSimulatingWalk] = useState<boolean>(false);

  useEffect(() => {
    if (!roomString) return;
    if (!('geolocation' in navigator)) {
      setGpsStatus('denied');
      return;
    }
    setGpsStatus('locating');
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 10),
        });
        setGpsStatus('active');
      },
      () => setGpsStatus('denied'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [roomString]);

  const handleLocateMe = () => {
    setIsSimulatingWalk(false);
    setCustomCampusGpsCoords(null);
    if (!('geolocation' in navigator)) {
      setGpsStatus('denied');
      return;
    }
    setGpsStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 10),
        });
        setGpsStatus('active');
      },
      () => setGpsStatus('denied'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  };

  // Optional 1-click GPS walk simulation so user can see how the marker moves even when testing from home
  useEffect(() => {
    if (!isSimulatingWalk) return;
    const startLat = 50.06808;
    const startLng = 19.95375;
    const targetLat = activePavilion.entranceCoordinates.lat;
    const targetLng = activePavilion.entranceCoordinates.lng;
    let step = 0;
    const totalSteps = 45;

    const timer = window.setInterval(() => {
      step += 1;
      const t = Math.min(1, step / totalSteps);
      setCustomCampusGpsCoords({
        lat: Number((startLat + (targetLat - startLat) * t).toFixed(6)),
        lng: Number((startLng + (targetLng - startLng) * t).toFixed(6)),
      });
      if (step >= totalSteps) {
        setIsSimulatingWalk(false);
      }
    }, 120);

    return () => window.clearInterval(timer);
  }, [isSimulatingWalk, activePavilion.entranceCoordinates.lat, activePavilion.entranceCoordinates.lng]);

  const [mapsApiKey, setMapsApiKey] = useState<string>(
    () => import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  useEffect(() => {
    if (mapsApiKey) return;
    fetch('/api/maps-config')
      .then((r) => r.json())
      .then((d) => {
        if (d?.apiKey) setMapsApiKey(d.apiKey);
      })
      .catch(() => {});
  }, [mapsApiKey]);

  if (!roomString) return null;

  /**
   * Unified GPS Marker position on the Campus Map:
   * 1. If the user clicked on the map or started walk simulation (`customCampusGpsCoords`), use that.
   * 2. Else if their live phone GPS (`userCoords`) is inside the UEK campus area, use their exact live
   *    GPS coordinates (`userCoords.lat, userCoords.lng`) — it moves in real time as they walk!
   * 3. Else if their live GPS is active outside the campus (e.g., walking from Dworzec Główny or testing at home),
   *    clamp their real GPS coordinates toward the campus border in the direction they are coming from,
   *    so the marker responds to their real direction and connects to the target building.
   */
  const isRealGpsInsideCampus = Boolean(
    userCoords &&
      userCoords.lat >= CAMPUS_VIEW.minLat &&
      userCoords.lat <= CAMPUS_VIEW.maxLat &&
      userCoords.lng >= CAMPUS_VIEW.minLng &&
      userCoords.lng <= CAMPUS_VIEW.maxLng
  );

  const effectiveGpsCoords: { lat: number; lng: number } = (() => {
    if (customCampusGpsCoords) return customCampusGpsCoords;
    if (isRealGpsInsideCampus && userCoords) {
      return { lat: userCoords.lat, lng: userCoords.lng };
    }
    if (userCoords) {
      // Clamp real GPS direction onto the campus perimeter walkway so it reflects real GPS direction
      const dLat = userCoords.lat - CAMPUS_VIEW.centerLat;
      const dLng = userCoords.lng - CAMPUS_VIEW.centerLng;
      const angle = Math.atan2(dLat, dLng);
      return {
        lat: Number((CAMPUS_VIEW.centerLat + Math.sin(angle) * 0.00065).toFixed(6)),
        lng: Number((CAMPUS_VIEW.centerLng + Math.cos(angle) * 0.00095).toFixed(6)),
      };
    }
    return { lat: 50.06872, lng: 19.95448 };
  })();

  const gpsMarkerSvg = projectLatLng(
    effectiveGpsCoords.lat,
    effectiveGpsCoords.lng
  );

  const activeEntranceSvg = projectLatLng(
    activePavilion.entranceCoordinates.lat,
    activePavilion.entranceCoordinates.lng
  );
  const activeBuildingCenterSvg = projectLatLng(
    activePavilion.coordinates.lat,
    activePavilion.coordinates.lng
  );

  // Walking distance from the visible GPS marker on the map to the selected building entrance
  const mapRouteDistanceMeters = calculateDistanceMeters(
    effectiveGpsCoords.lat,
    effectiveGpsCoords.lng,
    activePavilion.entranceCoordinates.lat,
    activePavilion.entranceCoordinates.lng
  );
  const mapRouteWalkMins = Math.max(1, Math.round(mapRouteDistanceMeters / 75));

  // Real GPS distance (if user is away from campus)
  const gpsDistanceInfo = (() => {
    const source = customCampusGpsCoords || userCoords || UEK_MAIN_GATE_COORDS;
    const dist = calculateDistanceMeters(
      source.lat,
      source.lng,
      activePavilion.coordinates.lat,
      activePavilion.coordinates.lng
    );
    return {
      distMeters: dist,
      label: dist < 1000 ? `${dist} m` : `${(dist / 1000).toFixed(1)} km`,
      mins: Math.max(1, Math.round(dist / 75)),
    };
  })();

  const googleMapsExternalUrl = `https://www.google.com/maps/dir/?api=1&destination=${activePavilion.coordinates.lat},${activePavilion.coordinates.lng}&travelmode=walking`;

  const westCorridorRooms = indoorRoomsList.filter((r) => r.side === 'west');
  const eastCorridorRooms = indoorRoomsList.filter((r) => r.side === 'east');

  // Pointer & Touch handlers for smooth Pan & Pinch-to-Zoom on mobile and desktop
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    dragMovedRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: panOffset.x,
      panY: panOffset.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      dragMovedRef.current = true;
    }
    setPanOffset({
      x: Math.max(
        -320 * zoomScale,
        Math.min(320 * zoomScale, dragStartRef.current.panX + dx)
      ),
      y: Math.max(
        -260 * zoomScale,
        Math.min(260 * zoomScale, dragStartRef.current.panY + dy)
      ),
    });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartScaleRef.current = zoomScale;
      isDraggingRef.current = false;
    } else if (e.touches.length === 1) {
      isDraggingRef.current = true;
      dragMovedRef.current = false;
      dragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        panX: panOffset.x,
        panY: panOffset.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartDistRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchStartDistRef.current;
      const nextScale = Math.min(
        4,
        Math.max(1, Number((pinchStartScaleRef.current * ratio).toFixed(2)))
      );
      setZoomScale(nextScale);
    } else if (e.touches.length === 1 && isDraggingRef.current) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        dragMovedRef.current = true;
      }
      setPanOffset({
        x: Math.max(
          -320 * zoomScale,
          Math.min(320 * zoomScale, dragStartRef.current.panX + dx)
        ),
        y: Math.max(
          -260 * zoomScale,
          Math.min(260 * zoomScale, dragStartRef.current.panY + dy)
        ),
      });
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    pinchStartDistRef.current = null;
  };

  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if (viewMode === 'official' && officialSubTab === 'google') return;
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    handleZoomBy(delta);
  };

  // Allow clicking on campus walkways/background to relocate the GPS start marker if desired
  const handleCampusSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragMovedRef.current) return;
    const target = e.target as SVGElement;
    if (target.dataset.mapBg !== 'true') return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const transformed = pt.matrixTransform(ctm.inverse());
    const coords = unprojectSvgToLatLng(transformed.x, transformed.y);
    setCustomCampusGpsCoords(coords);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-1.5 sm:p-4 bg-black/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campus-map-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full max-w-5xl h-[94vh] sm:h-[90vh] max-h-[820px] rounded-[24px] sm:rounded-[28px] border shadow-2xl overflow-hidden flex flex-col ${
          isDark
            ? 'bg-[#101520] border-white/15 text-[#F5F5F7]'
            : 'bg-white border-slate-200 text-[#1D1D1F]'
        }`}
      >
        {/* =====================================================================
            1. MOBILE & DESKTOP OPTIMIZED HEADER (Zero mid-word cuts, single-line tabs!)
           ===================================================================== */}
        <div className="px-3.5 sm:px-5 pt-3 pb-2.5 border-b border-slate-200 dark:border-white/10 shrink-0 space-y-2">
          {/* Top Row: Target Class Pill on Left + Prominent "✕ Zamknij" Button on Right */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-[11px] font-extrabold truncate">
                ★ Twoja sala: {parsed.pavilion.shortLabel} ·{' '}
                {parsed.roomNumberDisplay} ({parsed.floorShort})
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-xs shadow-md shadow-rose-500/25 border border-rose-400/40 flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
              aria-label="Zamknij mapę"
            >
              <X className="w-4 h-4 stroke-[2.75]" />
              <span>Zamknij</span>
            </button>
          </div>

          {/* Second Row: Clean Building & Floor Title */}
          <div className="flex items-baseline justify-between gap-2">
            <h2
              id="campus-map-title"
              className="text-sm sm:text-lg font-black tracking-tight leading-snug"
            >
              {activePavilion.fullName}{' '}
              <span className="text-[#6366F1] font-extrabold">
                · {currentFloorSpec.shortLabel}
              </span>
              {subjectName && (
                <span className="text-xs font-semibold text-slate-400 hidden sm:inline">
                  {' '}
                  — {subjectName}
                </span>
              )}
            </h2>
            {zoomScale > 1 && (
              <span className="text-[11px] font-bold text-indigo-400 shrink-0">
                Powiększenie: {Math.round(zoomScale * 100)}%
              </span>
            )}
          </div>

          {/* Third Row: Search Input + Single-Line 3-Column Mode Switcher */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 relative">
            {/* Search Input */}
            <div className="relative flex-1 min-w-0">
              <div className="bg-white dark:bg-[#1A2130] rounded-full border-2 border-[#4338CA] px-3 py-1.5 flex items-center gap-2 shadow-sm">
                {isSearchFocused ? (
                  <button
                    type="button"
                    onClick={() => setIsSearchFocused(false)}
                    className="text-slate-600 dark:text-slate-300 hover:text-slate-950"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                ) : (
                  <MapPin className="w-4 h-4 text-[#4338CA] shrink-0" />
                )}

                <input
                  type="text"
                  value={searchInput}
                  onFocus={() => setIsSearchFocused(true)}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    setIsSearchFocused(true);
                  }}
                  placeholder="Wyszukaj salę lub pawilon (np. 252, 210, 119)..."
                  className="w-full bg-transparent text-xs sm:text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                />

                {(searchInput || isSearchFocused) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setIsSearchFocused(false);
                    }}
                    className="w-5 h-5 rounded-full bg-slate-200 dark:bg-white/15 flex items-center justify-center text-slate-700 dark:text-slate-200 text-[10px] font-bold shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Search Dropdown */}
              {isSearchFocused && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[280px] overflow-y-auto">
                  <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
                    <span>
                      Znalezione sale i katedry ({searchResults.length})
                    </span>
                    <span>Kliknij, aby otworzyć</span>
                  </div>
                  {searchResults.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {searchResults.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedPavilionCode(item.pavilionCode);
                            setSelectedFloor(item.floorLevel);
                            setSelectedRoomNumber(item.roomNumber);
                            setActiveRoomQuery(
                              `Paw.${item.pavilionCode} ${item.roomNumber}`
                            );
                            setIsSearchFocused(false);
                            setViewMode('indoor');
                          }}
                          className="w-full px-3.5 py-2.5 text-left hover:bg-indigo-50/80 flex items-center gap-3 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-700">
                            <MapPin className="w-4 h-4" />
                          </div>
                          <div className="text-xs sm:text-sm text-slate-800 leading-snug">
                            <span>{item.titlePrefix} </span>
                            <strong className="text-[#4338CA] font-extrabold">
                              {item.highlightedNumber}
                            </strong>
                            <span className="text-slate-500">
                              , {item.floorSuffix}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-500">
                      Brak wyników dla „{searchInput}”. Wpisz np.{' '}
                      <strong>252</strong>, <strong>210</strong>,{' '}
                      <strong>119</strong> lub <strong>151</strong>.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Single-Line 3-Column Mode Tabs */}
            <div className="grid grid-cols-3 sm:inline-flex rounded-xl bg-slate-100 dark:bg-white/10 p-1 border border-slate-200 dark:border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setViewMode('campus');
                  setIsSearchFocused(false);
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap transition-all flex items-center justify-center gap-1.5 ${
                  viewMode === 'campus'
                    ? 'bg-[#4338CA] text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Compass className="w-3.5 h-3.5 shrink-0" />
                <span>Kampus</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewMode('indoor');
                  setIsSearchFocused(false);
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap transition-all flex items-center justify-center gap-1.5 ${
                  viewMode === 'indoor'
                    ? 'bg-[#4338CA] text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <DoorOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Wnętrze ({currentFloorSpec.badge})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewMode('official');
                  setIsSearchFocused(false);
                }}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap transition-all flex items-center justify-center gap-1.5 ${
                  viewMode === 'official'
                    ? 'bg-[#4338CA] text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Mapa 1–16</span>
              </button>
            </div>
          </div>
        </div>

        {/* =====================================================================
            2. INTERACTIVE TOP-DOWN (0° ORTHOGONAL) MAP VIEWPORT
           ===================================================================== */}
        <div
          className={`relative flex-1 min-h-0 w-full bg-[#EFEFEF] text-slate-900 overflow-hidden select-none ${
            viewMode !== 'official' || officialSubTab === 'poster'
              ? 'cursor-grab active:cursor-grabbing touch-none'
              : ''
          }`}
          onClick={() => {
            if (isSearchFocused) setIsSearchFocused(false);
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheelZoom}
        >
          {/* =====================================================================
              MODE 1: STRAIGHT TOP-DOWN CAMPUS MAP ("WIDOK Z GÓRY") + GPS -> BUILDING ROUTE
             ===================================================================== */}
          {viewMode === 'campus' && (
            <div className="w-full h-full relative overflow-hidden">
              {/* Top-Left Hint Badge showing GPS -> Target Building status + Live Walk Preview */}
              <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center gap-1.5 pointer-events-none">
                <div className="px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-md border border-indigo-200 shadow-sm flex items-center gap-1.5 text-[11px] font-extrabold text-slate-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB] ring-4 ring-blue-500/20 animate-pulse inline-block" />
                  <span>
                    {gpsStatus === 'active' ? 'GPS na żywo' : 'Trasa z GPS'} →{' '}
                    <strong className="text-[#4338CA]">
                      {activePavilion.shortLabel}
                    </strong>{' '}
                    ({mapRouteDistanceMeters} m · ~{mapRouteWalkMins} min)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSimulatingWalk((prev) => !prev)}
                  className="pointer-events-auto px-2.5 py-1 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[10px] font-extrabold shadow-sm transition-colors cursor-pointer"
                >
                  {isSimulatingWalk ? '⏹ Zatrzymaj test' : '▶ Symuluj spacer GPS'}
                </button>
              </div>

              <div
                className="w-full h-full transition-transform duration-75 ease-out origin-center"
                style={{
                  transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale})`,
                }}
              >
                <svg
                  viewBox={`0 0 ${CAMPUS_VIEW.width} ${CAMPUS_VIEW.height}`}
                  preserveAspectRatio="xMidYMid meet"
                  className="w-full h-full block"
                  role="img"
                  aria-label="Mapa kampusu Uniwersytetu Ekonomicznego w Krakowie — widok prosto z góry"
                  onClick={handleCampusSvgClick}
                >
                  <rect
                    x="0"
                    y="0"
                    width={CAMPUS_VIEW.width}
                    height={CAMPUS_VIEW.height}
                    fill="#F1F2F4"
                    data-map-bg="true"
                  />

                  {/* Straight Orthogonal Streets & Campus Walkways (0° top-down grid) */}
                  <g
                    stroke="#FFFFFF"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    data-map-bg="true"
                  >
                    {/* ul. Rakowicka — vertical street on the left */}
                    <line
                      x1="102"
                      y1="0"
                      x2="102"
                      y2="560"
                      strokeWidth="34"
                      data-map-bg="true"
                    />
                    {/* al. Aleksandra Lubomirskiego — horizontal street at the bottom */}
                    <line
                      x1="0"
                      y1="522"
                      x2="780"
                      y2="522"
                      strokeWidth="28"
                      data-map-bg="true"
                    />
                    {/* Horizontal campus avenues */}
                    <line
                      x1="102"
                      y1="105"
                      x2="650"
                      y2="105"
                      strokeWidth="12"
                      data-map-bg="true"
                    />
                    <line
                      x1="102"
                      y1="230"
                      x2="680"
                      y2="230"
                      strokeWidth="15"
                      data-map-bg="true"
                    />
                    <line
                      x1="102"
                      y1="305"
                      x2="680"
                      y2="305"
                      strokeWidth="14"
                      data-map-bg="true"
                    />
                    <line
                      x1="102"
                      y1="428"
                      x2="680"
                      y2="428"
                      strokeWidth="12"
                      data-map-bg="true"
                    />
                    {/* Vertical campus walkways between pavilions */}
                    <line
                      x1="215"
                      y1="60"
                      x2="215"
                      y2="430"
                      strokeWidth="12"
                      data-map-bg="true"
                    />
                    <line
                      x1="312"
                      y1="95"
                      x2="312"
                      y2="495"
                      strokeWidth="13"
                      data-map-bg="true"
                    />
                    <line
                      x1="435"
                      y1="105"
                      x2="435"
                      y2="520"
                      strokeWidth="13"
                      data-map-bg="true"
                    />
                    <line
                      x1="575"
                      y1="140"
                      x2="575"
                      y2="520"
                      strokeWidth="12"
                      data-map-bg="true"
                    />
                  </g>

                  {/* Orthogonal Street Labels */}
                  <text
                    x="390"
                    y="542"
                    textAnchor="middle"
                    fill="#71717A"
                    fontSize="11"
                    fontWeight="700"
                  >
                    al. Aleksandra Lubomirskiego
                  </text>
                  <text
                    x="80"
                    y="280"
                    textAnchor="middle"
                    fill="#71717A"
                    fontSize="11"
                    fontWeight="700"
                    transform="rotate(-90, 80, 280)"
                  >
                    ul. Rakowicka
                  </text>

                  {/* Neighboring context buildings at top */}
                  {CONTEXT_BUILDINGS_POLYGONS.map((poly, idx) => (
                    <polygon
                      key={idx}
                      points={toSvgPolygonPoints(poly)}
                      fill="#E2E4E8"
                    />
                  ))}

                  {/* Green Sports Pitch (Boisko) — now straight & orthogonal! */}
                  <polygon
                    points={toSvgPolygonPoints(UEK_GREEN_PITCH_POLYGON)}
                    fill="#6EE7B7"
                    stroke="#059669"
                    strokeWidth="2"
                  />
                  {(() => {
                    const pitchCenter = projectLatLng(50.06826, 19.95476);
                    return (
                      <g
                        transform={`translate(${pitchCenter.x}, ${pitchCenter.y})`}
                      >
                        <circle
                          r="8"
                          fill="#3F3F46"
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                        />
                        <text
                          x="0"
                          y="3"
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="8"
                          fontWeight="900"
                        >
                          ⚽
                        </text>
                      </g>
                    );
                  })()}

                  {/* Building Polygons (Straight Top-Down!) */}
                  {Object.values(UEK_PAVILIONS_DATA).map((pav) => {
                    const isSelected = pav.code === activePavilion.code;
                    const isTarget = pav.code === parsed.pavilion.code;

                    return (
                      <g
                        key={`poly-${pav.code}`}
                        onClick={() => {
                          if (dragMovedRef.current) return;
                          setSelectedPavilionCode(pav.code);
                          if (pav.code === parsed.pavilion.code) {
                            setSelectedFloor(parsed.floorLevel);
                          } else if (
                            !pav.availableFloors.includes(selectedFloor)
                          ) {
                            setSelectedFloor(pav.availableFloors[0] ?? 0);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <polygon
                          points={toSvgPolygonPoints(pav.footprint)}
                          fill={
                            isSelected
                              ? '#C7D2FE'
                              : isTarget
                              ? '#A7F3D0'
                              : '#D6D3C9'
                          }
                          stroke={
                            isSelected
                              ? '#4338CA'
                              : isTarget
                              ? '#059669'
                              : '#52525B'
                          }
                          strokeWidth={isSelected ? 3.2 : 2}
                        />
                      </g>
                    );
                  })}

                  {/* =====================================================================
                      DASHED ROUTE LINE FROM USER'S GPS MARKER DIRECTLY TO SELECTED BUILDING
                     ===================================================================== */}
                  {(() => {
                    const midX = (gpsMarkerSvg.x + activeEntranceSvg.x) / 2;
                    const midY = (gpsMarkerSvg.y + activeEntranceSvg.y) / 2;
                    const pathD = `M ${gpsMarkerSvg.x} ${gpsMarkerSvg.y} L ${activeEntranceSvg.x} ${activeEntranceSvg.y} L ${activeBuildingCenterSvg.x} ${activeBuildingCenterSvg.y}`;

                    return (
                      <g className="pointer-events-none">
                        {/* White outer halo for maximum contrast */}
                        <path
                          d={pathD}
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth="7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity="0.9"
                        />
                        {/* Prominent Indigo Dashed Line from GPS marker to building */}
                        <path
                          d={pathD}
                          fill="none"
                          stroke="#4338CA"
                          strokeWidth="4"
                          strokeDasharray="8 6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {/* Distance & walking time badge in the middle of the dashed route */}
                        {mapRouteDistanceMeters > 8 && (
                          <g transform={`translate(${midX}, ${midY})`}>
                            <rect
                              x="-34"
                              y="-10"
                              width="68"
                              height="20"
                              rx="10"
                              fill="#4338CA"
                              stroke="#FFFFFF"
                              strokeWidth="1.8"
                            />
                            <text
                              x="0"
                              y="3.5"
                              textAnchor="middle"
                              fill="#FFFFFF"
                              fontSize="9.5"
                              fontWeight="800"
                            >
                              🚶 {mapRouteDistanceMeters} m
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })()}

                  {/* Blue Circular Entrance Icons */}
                  {Object.values(UEK_PAVILIONS_DATA).map((pav) =>
                    pav.entrances.map((ent, idx) => {
                      const pt = projectLatLng(ent.lat, ent.lng);
                      const isTargetEntrance =
                        pav.code === activePavilion.code && idx === 0;
                      return (
                        <g
                          key={`ent-${pav.code}-${idx}`}
                          transform={`translate(${pt.x}, ${pt.y})`}
                          onClick={() => {
                            if (dragMovedRef.current) return;
                            setSelectedPavilionCode(pav.code);
                            setViewMode('indoor');
                          }}
                          className="cursor-pointer"
                        >
                          <circle
                            r={isTargetEntrance ? '10.5' : '8.5'}
                            fill={isTargetEntrance ? '#2563EB' : '#3730A3'}
                            stroke="#FFFFFF"
                            strokeWidth="2"
                          />
                          {ent.type === 'arrow' || zoomScale >= 1.6 ? (
                            <text
                              x="0"
                              y="3.5"
                              textAnchor="middle"
                              fill="#FFFFFF"
                              fontSize="10"
                              fontWeight="900"
                            >
                              ↗
                            </text>
                          ) : (
                            <rect
                              x="-3"
                              y="-4"
                              width="6"
                              height="8"
                              rx="1"
                              fill="none"
                              stroke="#FFFFFF"
                              strokeWidth="1.5"
                            />
                          )}
                        </g>
                      );
                    })
                  )}

                  {/* Orange POI Pins */}
                  {UEK_CAMPUS_POIS.map((poi) => {
                    const pt = projectLatLng(poi.lat, poi.lng);
                    return (
                      <g
                        key={poi.id}
                        transform={`translate(${pt.x}, ${pt.y})`}
                      >
                        <path
                          d="M 0 0 C -8 -8 -12 -14 -12 -20 A 12 12 0 1 1 12 -20 C 12 -14 8 -8 0 0 Z"
                          fill="#FFFFFF"
                          stroke="#EA580C"
                          strokeWidth="2"
                        />
                        <text
                          x="0"
                          y="-16"
                          textAnchor="middle"
                          fill="#EA580C"
                          fontSize="10"
                          fontWeight="900"
                        >
                          {poi.type === 'shop' ? '🏪' : '🍴'}
                        </text>
                        <text
                          x="15"
                          y="-15"
                          fill="#EA580C"
                          fontSize="10.5"
                          fontWeight="800"
                        >
                          {poi.label}
                        </text>
                      </g>
                    );
                  })}

                  {/* Building Badges (Pill badges at 1x, Teardrop A/B/C/D at >=1.7x zoom) */}
                  {Object.values(UEK_PAVILIONS_DATA).map((pav) => {
                    const pt = projectLatLng(
                      pav.coordinates.lat,
                      pav.coordinates.lng
                    );
                    const isSelected = pav.code === activePavilion.code;
                    const isTarget = pav.code === parsed.pavilion.code;

                    if (zoomScale >= 1.7 && pav.circleLetter.length === 1) {
                      return (
                        <g
                          key={`label-${pav.code}`}
                          transform={`translate(${pt.x}, ${pt.y})`}
                          onClick={() => {
                            if (dragMovedRef.current) return;
                            setSelectedPavilionCode(pav.code);
                            setViewMode('indoor');
                          }}
                          className="cursor-pointer"
                        >
                          <path
                            d="M 0 6 C -12 -6 -20 -16 -20 -26 A 20 20 0 1 1 20 -26 C 20 -16 12 -6 0 6 Z"
                            fill={isSelected ? '#4338CA' : '#1E1B2E'}
                            stroke={isSelected ? '#10B981' : '#4338CA'}
                            strokeWidth="2"
                          />
                          <text
                            x="0"
                            y="-19"
                            textAnchor="middle"
                            fill="#FFFFFF"
                            fontSize="18"
                            fontWeight="900"
                          >
                            {pav.circleLetter}
                          </text>
                        </g>
                      );
                    }

                    const badgeWidth = Math.max(
                      56,
                      pav.shortLabel.length * 6.8 + 18
                    );

                    return (
                      <g
                        key={`label-${pav.code}`}
                        transform={`translate(${pt.x}, ${pt.y - 6})`}
                        onClick={() => {
                          if (dragMovedRef.current) return;
                          setSelectedPavilionCode(pav.code);
                        }}
                        onDoubleClick={() => {
                          setSelectedPavilionCode(pav.code);
                          setViewMode('indoor');
                        }}
                        className="cursor-pointer"
                      >
                        <polygon
                          points="-5,8 5,8 0,14"
                          fill={
                            isSelected
                              ? '#4338CA'
                              : isTarget
                              ? '#059669'
                              : '#1E1B2E'
                          }
                        />
                        <rect
                          x={-badgeWidth / 2}
                          y="-14"
                          width={badgeWidth}
                          height="23"
                          rx="11.5"
                          fill={
                            isSelected
                              ? '#4338CA'
                              : isTarget
                              ? '#059669'
                              : '#1E1B2E'
                          }
                          stroke={
                            isSelected || isTarget ? '#FFFFFF' : '#4338CA'
                          }
                          strokeWidth={isSelected || isTarget ? '2' : '1.2'}
                        />
                        <text
                          x="0"
                          y="1.5"
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="10.5"
                          fontWeight="800"
                        >
                          {pav.shortLabel}
                        </text>
                      </g>
                    );
                  })}

                  {/* =====================================================================
                      USER'S LIVE / INTERACTIVE GPS MARKER ("TY (GPS)") — START OF DASHED LINE
                     ===================================================================== */}
                  <g
                    transform={`translate(${gpsMarkerSvg.x}, ${gpsMarkerSvg.y})`}
                    className="cursor-pointer"
                  >
                    <circle
                      r="20"
                      fill="rgba(37, 99, 235, 0.22)"
                      className="animate-pulse"
                    />
                    <circle r="12" fill="rgba(67, 56, 202, 0.28)" />
                    <circle
                      r="7.5"
                      fill="#2563EB"
                      stroke="#FFFFFF"
                      strokeWidth="3"
                    />
                    {/* Clear "Ty (GPS)" badge above the user's location marker */}
                    <g transform="translate(0, -21)">
                      <rect
                        x="-32"
                        y="-10"
                        width="64"
                        height="18"
                        rx="9"
                        fill="#2563EB"
                        stroke="#FFFFFF"
                        strokeWidth="1.5"
                      />
                      <text
                        x="0"
                        y="2.5"
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize="9.5"
                        fontWeight="900"
                      >
                        📍 Ty (GPS)
                      </text>
                    </g>
                  </g>
                </svg>
              </div>

              {/* Clean, Non-Truncated Bottom Floating Card on Campus View */}
              <div className="absolute bottom-3 left-3 right-16 z-20 max-w-md bg-white/95 backdrop-blur-md rounded-2xl px-3.5 py-2.5 shadow-xl border border-slate-200 flex items-center justify-between gap-2.5 pointer-events-auto">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-black text-[#4338CA]">
                      {activePavilion.shortLabel}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500">
                      · Piętra: {activePavilion.availableFloors[0]} do{' '}
                      {
                        activePavilion.availableFloors[
                          activePavilion.availableFloors.length - 1
                        ]
                      }{' '}
                      ({activePavilion.totalRoomsCount} sal)
                    </span>
                  </div>
                  <p className="text-xs font-extrabold text-slate-800 truncate">
                    {activePavilion.code === parsed.pavilion.code
                      ? `Twoja: ${parsed.roomNumberDisplay} (${parsed.floorShort})`
                      : `Trasa z GPS: ${mapRouteDistanceMeters} m (~${mapRouteWalkMins} min)`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setViewMode('indoor')}
                  className="px-3 py-2 rounded-xl bg-[#4338CA] hover:bg-[#3730A3] text-white text-xs font-extrabold shrink-0 flex items-center gap-1 shadow-md transition-colors cursor-pointer"
                >
                  <span>Zobacz środek</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* =====================================================================
              MODE 2: STRAIGHT TOP-DOWN INDOOR FLOOR MAP ("WIDOK Z GÓRY" — 0° TILT!)
             ===================================================================== */}
          {viewMode === 'indoor' && (
            <div className="w-full h-full relative bg-[#ECEEF1] overflow-hidden">
              {/* Top-Left Floating Quick Pavilion Switcher */}
              <div className="absolute top-3 left-3 right-16 z-20 flex items-center gap-1.5 overflow-x-auto no-scrollbar pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setViewMode('campus')}
                  className="px-2.5 py-1 rounded-full bg-[#1E1B2E] hover:bg-[#2D2A42] text-white text-xs font-extrabold shadow-md border border-[#4338CA] flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Kampus</span>
                </button>

                {(
                  [
                    'A',
                    'B',
                    'C',
                    'D',
                    'E',
                    'F',
                    'G',
                    'USTRONIE',
                    'BIBLIOTEKA',
                    'MAIN',
                    'S',
                  ] as const
                ).map((code) => {
                  const isAct = activePavilion.code === code;
                  const pav = UEK_PAVILIONS_DATA[code];
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        setSelectedPavilionCode(code);
                        if (
                          pav &&
                          !pav.availableFloors.includes(selectedFloor)
                        ) {
                          setSelectedFloor(
                            pav.availableFloors.includes(1)
                              ? 1
                              : pav.availableFloors[0]
                          );
                        }
                      }}
                      className={`px-2.5 py-1 rounded-full text-xs font-extrabold shadow-sm border transition-all shrink-0 cursor-pointer ${
                        isAct
                          ? 'bg-[#4338CA] text-white border-[#4338CA]'
                          : 'bg-white/90 text-slate-800 border-slate-300 hover:bg-white'
                      }`}
                    >
                      {pav ? pav.shortLabel : `Paw. ${code}`}
                    </button>
                  );
                })}
              </div>

              <div
                className="w-full h-full transition-transform duration-75 ease-out origin-center"
                style={{
                  transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale})`,
                }}
              >
                <svg
                  viewBox="0 0 780 560"
                  preserveAspectRatio="xMidYMid meet"
                  className="w-full h-full block"
                  role="img"
                  aria-label={`Plan piętra ${currentFloorSpec.badge} wewnątrz budynku ${activePavilion.fullName} — widok prosto z góry`}
                >
                  <rect x="0" y="0" width="780" height="560" fill="#ECEEF1" />

                  {/* Straight Orthogonal Walkway Outside Building */}
                  <line
                    x1="0"
                    y1="72"
                    x2="780"
                    y2="72"
                    stroke="#FFFFFF"
                    strokeWidth="36"
                  />

                  {/* STRAIGHT TOP-DOWN (0° ORTHOGONAL) BUILDING FLOOR PLAN */}
                  <g transform="translate(30, 22)">
                    {/* Top-Left Connector Wing (Sala F / Łącznik Pawilonu C) */}
                    <g
                      onClick={() => {
                        if (dragMovedRef.current) return;
                        setSelectedPavilionCode('C');
                        setSelectedRoomNumber('Sala F');
                      }}
                      className="cursor-pointer"
                    >
                      <rect
                        x="45"
                        y="18"
                        width="175"
                        height="82"
                        fill="#F5D5AE"
                        stroke="#57534E"
                        strokeWidth="3"
                      />
                      <text
                        x="132"
                        y="56"
                        textAnchor="middle"
                        fill="#1E293B"
                        fontSize="14"
                        fontWeight="800"
                      >
                        Sala F
                      </text>
                      <text
                        x="132"
                        y="73"
                        textAnchor="middle"
                        fill="#57534E"
                        fontSize="11"
                        fontWeight="600"
                      >
                        Łącznik Paw. C
                      </text>
                    </g>

                    {/* Main Building Exterior Shell (Straight 0° Top-Down) */}
                    <rect
                      x="220"
                      y="18"
                      width="360"
                      height="440"
                      fill="#F7F5F0"
                      stroke="#57534E"
                      strokeWidth="4"
                    />

                    {/* Central Corridor Spine */}
                    <rect
                      x="360"
                      y="18"
                      width="62"
                      height="440"
                      fill="#F7F5F0"
                    />
                    <text
                      x="391"
                      y="250"
                      textAnchor="middle"
                      fill="#94A3B8"
                      fontSize="10"
                      fontWeight="800"
                      letterSpacing="2"
                      transform="rotate(-90, 391, 250)"
                    >
                      KORYTARZ ({currentFloorSpec.shortLabel.toUpperCase()})
                    </text>

                    {/* Top-West Room */}
                    {(() => {
                      const rm =
                        westCorridorRooms[0] ||
                        ({
                          number: `${
                            currentFloorSpec.level > 0
                              ? currentFloorSpec.level
                              : '0'
                          }50`,
                          typeName: 'Magazyn',
                        } as UekRoomItem);
                      const isTarget =
                        rm.number.toUpperCase() ===
                        selectedRoomNumber.toUpperCase();
                      const isClassRoom =
                        activePavilion.code === parsed.pavilion.code &&
                        currentFloorSpec.level === parsed.floorLevel &&
                        rm.number.toUpperCase() ===
                          parsed.roomCode.toUpperCase();

                      return (
                        <g
                          onClick={() => {
                            if (dragMovedRef.current) return;
                            setSelectedRoomNumber(rm.number);
                          }}
                          className="cursor-pointer"
                        >
                          <rect
                            x="220"
                            y="18"
                            width="140"
                            height="82"
                            fill={
                              isClassRoom
                                ? '#6EE7B7'
                                : isTarget
                                ? '#C7D2FE'
                                : '#EFECE6'
                            }
                            stroke={
                              isClassRoom
                                ? '#059669'
                                : isTarget
                                ? '#4338CA'
                                : '#57534E'
                            }
                            strokeWidth={isClassRoom || isTarget ? '4' : '2.5'}
                          />
                          <text
                            x="290"
                            y="56"
                            textAnchor="middle"
                            fill="#1E293B"
                            fontSize="13.5"
                            fontWeight="800"
                          >
                            {rm.typeName === 'Magazyn'
                              ? `Magazyn ${rm.number}`
                              : `Sala ${rm.number}`}
                          </text>
                          {rm.typeName !== 'Magazyn' &&
                            rm.typeName !== 'Sala' && (
                              <text
                                x="290"
                                y="72"
                                textAnchor="middle"
                                fill="#475569"
                                fontSize="10.5"
                                fontWeight="600"
                              >
                                {rm.typeName}
                              </text>
                            )}
                        </g>
                      );
                    })()}

                    {/* GREEN STAIRCASE & ELEVATOR ZONE (Straight 0° Top-Down) */}
                    <g>
                      <rect
                        x="220"
                        y="100"
                        width="140"
                        height="92"
                        fill="#86EFAC"
                        stroke="#16A34A"
                        strokeWidth="3"
                      />
                      {/* Left Elevator */}
                      <g transform="translate(248, 128)">
                        <rect
                          x="-15"
                          y="-15"
                          width="30"
                          height="30"
                          rx="7"
                          fill="#16A34A"
                          stroke="#FFFFFF"
                          strokeWidth="2"
                        />
                        <text
                          x="0"
                          y="5"
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="12"
                          fontWeight="900"
                        >
                          🛗
                        </text>
                      </g>

                      {/* Center Stairs */}
                      <g transform="translate(292, 146)">
                        <rect
                          x="-17"
                          y="-17"
                          width="34"
                          height="34"
                          rx="8"
                          fill="#16A34A"
                          stroke="#FFFFFF"
                          strokeWidth="2"
                        />
                        <path
                          d="M -8 6 L -3 6 L -3 1 L 3 1 L 3 -5 L 8 -5"
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </g>

                      {/* Right Elevator */}
                      <g transform="translate(336, 164)">
                        <rect
                          x="-15"
                          y="-15"
                          width="30"
                          height="30"
                          rx="7"
                          fill="#16A34A"
                          stroke="#FFFFFF"
                          strokeWidth="2"
                        />
                        <text
                          x="0"
                          y="5"
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="12"
                          fontWeight="900"
                        >
                          🛗
                        </text>
                      </g>
                    </g>

                    {/* LIGHT-BLUE RESTROOMS ZONE (Straight 0° Top-Down) */}
                    <g>
                      <rect
                        x="220"
                        y="192"
                        width="140"
                        height="120"
                        fill="#BAE6FD"
                        stroke="#0284C7"
                        strokeWidth="2.5"
                      />
                      <line
                        x1="220"
                        y1="252"
                        x2="360"
                        y2="252"
                        stroke="#0284C7"
                        strokeWidth="2"
                      />
                      <g transform="translate(290, 222)">
                        <rect
                          x="-14"
                          y="-14"
                          width="28"
                          height="28"
                          rx="6"
                          fill="#38BDF8"
                          stroke="#FFFFFF"
                          strokeWidth="2"
                        />
                        <text
                          x="0"
                          y="5"
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="14"
                          fontWeight="900"
                        >
                          🚺
                        </text>
                      </g>
                      <g transform="translate(290, 282)">
                        <rect
                          x="-14"
                          y="-14"
                          width="28"
                          height="28"
                          rx="6"
                          fill="#38BDF8"
                          stroke="#FFFFFF"
                          strokeWidth="2"
                        />
                        <text
                          x="0"
                          y="5"
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="14"
                          fontWeight="900"
                        >
                          🚹
                        </text>
                      </g>
                    </g>

                    {/* Bottom-West Room */}
                    {(() => {
                      const rm =
                        westCorridorRooms[1] ||
                        westCorridorRooms[0] ||
                        indoorRoomsList[indoorRoomsList.length - 1];
                      if (!rm) return null;
                      const isTarget =
                        rm.number.toUpperCase() ===
                        selectedRoomNumber.toUpperCase();
                      const isClassRoom =
                        activePavilion.code === parsed.pavilion.code &&
                        currentFloorSpec.level === parsed.floorLevel &&
                        rm.number.toUpperCase() ===
                          parsed.roomCode.toUpperCase();
                      const lines = wrapSubtitleLines(rm.typeName, 18);

                      return (
                        <g
                          onClick={() => {
                            if (dragMovedRef.current) return;
                            setSelectedRoomNumber(rm.number);
                          }}
                          className="cursor-pointer"
                        >
                          <rect
                            x="220"
                            y="312"
                            width="140"
                            height="146"
                            fill={
                              isClassRoom
                                ? '#6EE7B7'
                                : isTarget
                                ? '#C7D2FE'
                                : '#F5D5AE'
                            }
                            stroke={
                              isClassRoom
                                ? '#059669'
                                : isTarget
                                ? '#4338CA'
                                : '#57534E'
                            }
                            strokeWidth={isClassRoom || isTarget ? '4' : '2.5'}
                          />
                          <g transform="translate(290, 385)">
                            {lines.map((ln, i) => (
                              <text
                                key={i}
                                x="0"
                                y={-14 + i * 13}
                                textAnchor="middle"
                                fill="#334155"
                                fontSize="10.5"
                                fontWeight="700"
                              >
                                {ln}
                              </text>
                            ))}
                            <text
                              x="0"
                              y={lines.length > 0 ? lines.length * 13 : 4}
                              textAnchor="middle"
                              fill="#0F172A"
                              fontSize="14"
                              fontWeight="900"
                            >
                              {rm.number.toLowerCase().includes('sala')
                                ? rm.number
                                : `pok. ${rm.number}`}
                            </text>
                          </g>
                        </g>
                      );
                    })()}

                    {/* EAST SIDE CLASSROOMS ALONG THE CORRIDOR (Straight 0° Top-Down) */}
                    {(() => {
                      const roomsToRender = (
                        eastCorridorRooms.length > 0
                          ? eastCorridorRooms
                          : indoorRoomsList
                      ).slice(0, 4);

                      // Find which slot is selected to draw the indoor dashed route line to it
                      const activeIdx = Math.max(
                        0,
                        roomsToRender.findIndex(
                          (r) =>
                            r.number.toUpperCase() ===
                            selectedRoomNumber.toUpperCase()
                        )
                      );
                      const targetDoorY = 18 + activeIdx * 110 + 55;

                      return (
                        <>
                          {roomsToRender.map((rm, idx) => {
                            const topY = 18 + idx * 110;
                            const boxH = 110;
                            const isTarget =
                              rm.number.toUpperCase() ===
                              selectedRoomNumber.toUpperCase();
                            const isClassRoom =
                              activePavilion.code === parsed.pavilion.code &&
                              currentFloorSpec.level === parsed.floorLevel &&
                              rm.number.toUpperCase() ===
                                parsed.roomCode.toUpperCase();

                            const mainTitle =
                              rm.number.toLowerCase().includes('sala') ||
                              rm.number.toLowerCase().includes('aula')
                                ? rm.number
                                : `Sala ${rm.number}`;

                            const subLabel =
                              rm.typeName === 'Sala'
                                ? rm.capacity
                                  ? `Sala dydaktyczna · ${rm.capacity} os.`
                                  : 'Sala dydaktyczna'
                                : rm.typeName;
                            const subLines = wrapSubtitleLines(subLabel, 22);

                            return (
                              <g
                                key={rm.code}
                                onClick={() => {
                                  if (dragMovedRef.current) return;
                                  setSelectedRoomNumber(rm.number);
                                }}
                                className="cursor-pointer"
                              >
                                <rect
                                  x="422"
                                  y={topY}
                                  width="158"
                                  height={boxH}
                                  fill={
                                    isClassRoom
                                      ? '#6EE7B7'
                                      : isTarget
                                      ? '#C7D2FE'
                                      : '#F5D5AE'
                                  }
                                  stroke={
                                    isClassRoom
                                      ? '#059669'
                                      : isTarget
                                      ? '#4338CA'
                                      : '#57534E'
                                  }
                                  strokeWidth={
                                    isClassRoom || isTarget ? '4' : '2.5'
                                  }
                                />

                                <g
                                  transform={`translate(501, ${
                                    topY + boxH / 2
                                  })`}
                                >
                                  {(isClassRoom || isTarget) && (
                                    <>
                                      <rect
                                        x="-52"
                                        y="-32"
                                        width="104"
                                        height="18"
                                        rx="9"
                                        fill={
                                          isClassRoom ? '#059669' : '#4338CA'
                                        }
                                      />
                                      <text
                                        x="0"
                                        y="-20"
                                        textAnchor="middle"
                                        fill="#FFFFFF"
                                        fontSize="9"
                                        fontWeight="900"
                                      >
                                        {isClassRoom
                                          ? '★ TWOJA SALA'
                                          : 'WYBRANA SALA'}
                                      </text>
                                    </>
                                  )}
                                  <text
                                    x="0"
                                    y="2"
                                    textAnchor="middle"
                                    fill="#0F172A"
                                    fontSize="15"
                                    fontWeight="900"
                                  >
                                    {mainTitle}
                                  </text>
                                  {subLines.map((ln, i) => (
                                    <text
                                      key={i}
                                      x="0"
                                      y={17 + i * 12}
                                      textAnchor="middle"
                                      fill="#475569"
                                      fontSize="10.5"
                                      fontWeight="600"
                                    >
                                      {ln}
                                    </text>
                                  ))}
                                </g>
                              </g>
                            );
                          })}

                          {/* Dashed walking route from Stairs/Elevator across corridor to Selected Room */}
                          <path
                            d={`M 352 146 L 391 146 L 391 ${targetDoorY} L 422 ${targetDoorY}`}
                            fill="none"
                            stroke="#4338CA"
                            strokeWidth="3.5"
                            strokeDasharray="6 4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle
                            cx="422"
                            cy={targetDoorY}
                            r="5"
                            fill="#4338CA"
                            stroke="#FFFFFF"
                            strokeWidth="2"
                          />
                        </>
                      );
                    })()}
                  </g>
                </svg>
              </div>

              {/* BOTTOM FLOOR SWITCHER BAR: Dynamically supports up to Piętro 7 (Pawilon F) & Piętro 5 (Ustronie)! */}
              <div className="absolute bottom-3 left-3 right-16 z-30 flex items-center justify-center pointer-events-none">
                <div className="bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-slate-300 inline-flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar max-w-full pointer-events-auto">
                  {Array.from(
                    {
                      length:
                        Math.max(4, ...activePavilion.availableFloors) + 2,
                    },
                    (_, idx) => idx - 1
                  ).map((flNum) => {
                    const isAvailable =
                      activePavilion.availableFloors.includes(flNum);
                    const isSelected = currentFloorSpec.level === flNum;
                    const isTargetClassFloor =
                      activePavilion.code === parsed.pavilion.code &&
                      parsed.floorLevel === flNum;

                    return (
                      <button
                        key={flNum}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => setSelectedFloor(flNum)}
                        className={`relative w-9 sm:w-11 h-9 sm:h-10 shrink-0 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center cursor-pointer ${
                          !isAvailable
                            ? 'opacity-30 cursor-not-allowed bg-slate-100 text-slate-400'
                            : isSelected
                            ? 'bg-[#262626] text-white shadow-md scale-105'
                            : 'bg-[#F3F4F6] hover:bg-slate-200 text-slate-900'
                        }`}
                      >
                        <span>{flNum}</span>
                        {isTargetClassFloor && (
                          <span
                            className={`w-2 h-2 rounded-full absolute top-1 right-1 ${
                              isSelected ? 'bg-emerald-400' : 'bg-emerald-500'
                            }`}
                            title="Piętro Twoich zajęć"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              MODE 3: OFICJALNA MAPA KAMPUSU UEK 1–16 (Plakat + Legenda + Google Maps)
             ===================================================================== */}
          {viewMode === 'official' && (
            <div className="w-full h-full grid grid-cols-1 md:grid-cols-12 bg-[#6999A5] text-white overflow-hidden">
              <div className="md:col-span-5 p-3.5 sm:p-4 bg-[#5B8C98] overflow-y-auto space-y-2 h-full">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/20">
                  <div>
                    <h3 className="text-sm sm:text-base font-black tracking-wide uppercase">
                      KAMPUS UEK (1–16)
                    </h3>
                    <p className="text-[11px] text-white/85">
                      Kliknij budynek, aby zobaczyć jego piętra i sale
                    </p>
                  </div>
                  <div className="inline-flex rounded-lg bg-black/20 p-0.5 text-[11px] font-bold shrink-0">
                    <button
                      type="button"
                      onClick={() => setOfficialSubTab('poster')}
                      className={`px-2 py-1 rounded-md cursor-pointer ${
                        officialSubTab === 'poster'
                          ? 'bg-white text-slate-900'
                          : 'text-white'
                      }`}
                    >
                      Plakat
                    </button>
                    <button
                      type="button"
                      onClick={() => setOfficialSubTab('google')}
                      className={`px-2 py-1 rounded-md cursor-pointer ${
                        officialSubTab === 'google'
                          ? 'bg-white text-slate-900'
                          : 'text-white'
                      }`}
                    >
                      Google
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  {[
                    {
                      num: 1,
                      code: 'MAIN',
                      name: 'Budynek Główny / Main Building',
                    },
                    {
                      num: 2,
                      code: 'OGRODNIK',
                      name: 'Dom Ogrodnika / Gardener’s House',
                    },
                    {
                      num: 4,
                      code: 'KSIEZOWKA',
                      name: 'Księżówka / Priest’s House',
                    },
                    {
                      num: 5,
                      code: 'USTRONIE',
                      name: 'Ustronie / Ustronie Building',
                    },
                    { num: 6, code: 'A', name: 'Pawilon A / Building A' },
                    {
                      num: 7,
                      code: 'B',
                      name: 'Pawilon B / Building B (CJ UEK)',
                    },
                    { num: 8, code: 'C', name: 'Pawilon C / Building C' },
                    { num: 9, code: 'D', name: 'Pawilon D / Building D' },
                    { num: 10, code: 'E', name: 'Pawilon E / Building E' },
                    {
                      num: 11,
                      code: 'BIBLIOTEKA',
                      name: 'Biblioteka Główna / Main Library',
                    },
                    {
                      num: 12,
                      code: 'S',
                      name: 'Pawilon Dydaktyczno-Sportowy (S)',
                    },
                    {
                      num: 13,
                      code: 'F',
                      name: 'Pawilon Finansów / Finance Building (F)',
                    },
                    {
                      num: 14,
                      code: 'G',
                      name: 'Pawilon G – KSB / Building G – KSB',
                    },
                  ].map((b) => {
                    const isActive = activePavilion.code === b.code;
                    return (
                      <button
                        key={b.num}
                        type="button"
                        onClick={() => {
                          setSelectedPavilionCode(b.code);
                          setViewMode('indoor');
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#F59E0B] text-slate-950 shadow-md font-black'
                            : 'bg-white/10 hover:bg-white/20 text-white'
                        }`}
                      >
                        <span className="w-5 h-5 rounded-full bg-white text-slate-900 font-black text-[11px] flex items-center justify-center shrink-0">
                          {b.num}
                        </span>
                        <span className="truncate">{b.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="md:col-span-7 h-full bg-[#6999A5] flex items-center justify-center overflow-hidden p-2">
                {officialSubTab === 'poster' ? (
                  <div
                    className="w-full h-full flex items-center justify-center transition-transform duration-75 ease-out"
                    style={{
                      transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale})`,
                    }}
                  >
                    <img
                      src="/assets/aistudio/image_8cdac505.png"
                      alt="Oficjalna mapa Kampusu Uniwersytetu Ekonomicznego w Krakowie"
                      className="max-h-full max-w-full object-contain rounded-xl shadow-lg pointer-events-none"
                    />
                  </div>
                ) : mapsApiKey ? (
                  <APIProvider apiKey={mapsApiKey} language="pl" region="PL">
                    <GoogleMap
                      mapId="DEMO_MAP_ID"
                      defaultCenter={activePavilion.coordinates}
                      defaultZoom={18}
                      defaultTilt={0}
                      defaultHeading={0}
                      mapTypeId="roadmap"
                      gestureHandling="greedy"
                      disableDefaultUI={false}
                      internalUsageAttributionIds={[
                        'gmp_mcp_codeassist_v1_aistudio',
                      ]}
                    >
                      <AccurateGoogleMapOverlays
                        activePavilion={activePavilion}
                        gpsCoords={effectiveGpsCoords}
                        onSelectPavilion={(code) => {
                          setSelectedPavilionCode(code);
                        }}
                      />
                      <AdvancedMarker
                        position={effectiveGpsCoords}
                        zIndex={35}
                      >
                        <div className="px-2.5 py-1 rounded-full bg-[#2563EB] text-white text-[11px] font-black border-2 border-white shadow-lg flex items-center gap-1">
                          <Navigation className="w-3 h-3" />
                          <span>Ty (GPS)</span>
                        </div>
                      </AdvancedMarker>
                      <AdvancedMarker
                        position={activePavilion.coordinates}
                        zIndex={40}
                      >
                        <div className="px-3 py-1.5 rounded-full bg-[#1E1B2E] text-white text-xs font-black border-2 border-white shadow-xl">
                          {activePavilion.shortLabel}
                        </div>
                      </AdvancedMarker>
                    </GoogleMap>
                  </APIProvider>
                ) : (
                  <div className="text-xs p-6">Ładowanie mapy...</div>
                )}
              </div>
            </div>
          )}

          {/* =====================================================================
              FLOATING RIGHT-SIDE ZOOM (+ / - / Reset) & GPS CONTROLS
             ===================================================================== */}
          <div
            className="absolute bottom-3 right-3 z-30 flex flex-col items-center gap-2 pointer-events-auto"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {/* Zoom Controls Stack (+ / - / Reset) */}
            <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 p-1 flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => handleZoomBy(0.45)}
                disabled={zoomScale >= 4}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-[#4338CA] text-slate-800 hover:text-white disabled:opacity-40 flex items-center justify-center transition-colors cursor-pointer"
                title="Przybliż mapę (+)"
                aria-label="Przybliż mapę"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
              </button>

              {zoomScale > 1 && (
                <button
                  type="button"
                  onClick={resetZoomAndPan}
                  className="w-9 h-7 rounded-lg bg-amber-500/15 hover:bg-amber-500 text-amber-700 hover:text-white text-[10px] font-black flex items-center justify-center transition-colors cursor-pointer"
                  title="Resetuj powiększenie (1:1)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => handleZoomBy(-0.45)}
                disabled={zoomScale <= 1}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-[#4338CA] text-slate-800 hover:text-white disabled:opacity-40 flex items-center justify-center transition-colors cursor-pointer"
                title="Oddal mapę (-)"
                aria-label="Oddal mapę"
              >
                <Minus className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Circular Indigo GPS Locate Button */}
            <button
              type="button"
              onClick={handleLocateMe}
              className="w-11 h-11 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-xl flex items-center justify-center transition-transform active:scale-95 cursor-pointer border-2 border-white"
              title="Zlokalizuj mnie przez GPS"
            >
              <LocateFixed className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* =====================================================================
            3. MOBILE-FRIENDLY FOOTER: Clean Room Pills + Navigation Button
           ===================================================================== */}
        <div
          className={`px-3.5 sm:px-5 py-2.5 border-t shrink-0 flex flex-wrap items-center justify-between gap-2 text-xs ${
            isDark
              ? 'bg-[#0D111A] border-white/10 text-slate-300'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full">
            <span className="font-bold text-slate-400 shrink-0">
              Piętro {currentFloorSpec.badge}:
            </span>
            {indoorRoomsList.map((rm) => {
              const isSelected =
                rm.number.toUpperCase() === selectedRoomNumber.toUpperCase();
              const isTargetClass =
                activePavilion.code === parsed.pavilion.code &&
                currentFloorSpec.level === parsed.floorLevel &&
                rm.number.toUpperCase() === parsed.roomCode.toUpperCase();

              return (
                <button
                  key={rm.code}
                  type="button"
                  onClick={() => {
                    setSelectedRoomNumber(rm.number);
                    setViewMode('indoor');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-extrabold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                    isTargetClass
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : isSelected
                      ? 'bg-[#4338CA] text-white'
                      : isDark
                      ? 'bg-white/10 text-slate-200 hover:bg-white/15'
                      : 'bg-white border border-slate-200 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  {rm.number.toLowerCase().includes('sala') ||
                  rm.number.toLowerCase().includes('aula')
                    ? rm.number
                    : `s. ${rm.number}`}
                  {isTargetClass ? ' ★' : ''}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0">
            <span className="text-emerald-400 font-bold text-[11px]">
              {gpsStatus === 'active' && !isRealGpsInsideCampus
                ? `Na kampusie: ${mapRouteDistanceMeters} m do ${activePavilion.shortLabel} (poza kampusem: ${gpsDistanceInfo.label})`
                : `Trasa GPS → ${activePavilion.shortLabel}: ${mapRouteDistanceMeters} m (~${mapRouteWalkMins} min pieszo)`}
            </span>
            <a
              href={googleMapsExternalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto px-3 py-1.5 rounded-xl bg-[#4338CA] hover:bg-[#3730A3] text-white font-bold inline-flex items-center gap-1.5 transition-colors shrink-0"
            >
              <span>Trasa Google Maps</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
