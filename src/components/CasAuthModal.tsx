import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Globe,
  Link2,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  DEFAULT_LANGUAGE_UEK_URL,
  DEFAULT_UEK_URL,
  getLanguageProfileForUrl,
  parseUekUrl,
} from '../utils/uekParser';

interface CasAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUrl: string;
  onUpdateUrl: (newUrl: string) => void;
  languageUrl: string;
  onUpdateLanguageConfig: (config: {
    languageUrl: string;
    customLangRoom: string;
    customLangLecturer: string;
  }) => void;
  customLangRoom: string;
  customLangLecturer: string;
  authMode: 'cas_authenticated' | 'cookie_session' | 'raw_import' | 'demo_preview';
  casUser?: string;
  onLoginSubmit: (payload: {
    url?: string;
    languageUrl?: string;
    username?: string;
    password?: string;
    sessionCookie?: string;
    rawXmlOrHtml?: string;
    rememberForAutoSync: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  onResetToDefaultSchedule: () => void;
}

const BOOKMARKLET_CODE = `javascript:(function(){try{var rows=Array.from(document.querySelectorAll('table tr')).slice(1).map(function(tr){var td=Array.from(tr.querySelectorAll('td')).map(function(c){return c.innerText.trim()});return td.length>=5?{termin:td[0],dzien:td[1],od:(td[2].match(/\\d{2}:\\d{2}/g)||[])[0]||'',do:(td[2].match(/\\d{2}:\\d{2}/g)||[])[1]||'',przedmiot:td[3],forma:td[4],nauczyciel:td[5]||'',sala:td[6]||'',uwagi:td[7]||''}:null}).filter(Boolean);var json=JSON.stringify(rows.length?rows:document.documentElement.outerHTML);navigator.clipboard.writeText(json).then(function(){alert('Skopiowano plan UEK ('+rows.length+' zajęć)! Wróć do aplikacji i wklej w polu tekstowym.')})}catch(e){alert('Skopiuj kod strony ręcznie (Ctrl+A, Ctrl+C)')}})();`;

export const CasAuthModal: React.FC<CasAuthModalProps> = ({
  isOpen,
  onClose,
  currentUrl,
  onUpdateUrl,
  languageUrl,
  onUpdateLanguageConfig,
  customLangRoom,
  customLangLecturer,
  onLoginSubmit,
  onResetToDefaultSchedule,
}) => {
  const [linkValue, setLinkValue] = useState<string>(currentUrl);
  const [isLinkFocused, setIsLinkFocused] = useState<boolean>(false);

  const [langLinkValue, setLangLinkValue] = useState<string>(languageUrl);
  const [isLangFocused, setIsLangFocused] = useState<boolean>(false);
  const [showLangCustomFields, setShowLangCustomFields] =
    useState<boolean>(false);
  const [roomInput, setRoomInput] = useState<string>(customLangRoom);
  const [lecturerInput, setLecturerInput] =
    useState<string>(customLangLecturer);

  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [proxyUrl, setProxyUrl] = useState<string>('');
  const [casIndex, setCasIndex] = useState<string>('');
  const [casPassword, setCasPassword] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const trimmedLink = linkValue.trim();
  const parsed = parseUekUrl(trimmedLink);
  const isEmpty = trimmedLink.length === 0;
  const isValidLink = !isEmpty && parsed.isValid;
  const isInvalidLink = !isEmpty && !parsed.isValid;

  const trimmedLangLink = langLinkValue.trim();
  const parsedLang = parseUekUrl(trimmedLangLink);
  const isLangEmpty = trimmedLangLink.length === 0;
  const isValidLangLink = !isLangEmpty && parsedLang.isValid;
  const isInvalidLangLink = !isLangEmpty && !parsedLang.isValid;
  const langProfile = getLanguageProfileForUrl(
    isValidLangLink ? parsedLang.cleanUrl : ''
  );

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setLinkValue(text.trim());
        setStatusMessage(null);
      }
    } catch {
      setLinkValue(DEFAULT_UEK_URL);
    }
  };

  const handlePasteLangFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setLangLinkValue(text.trim());
        setStatusMessage(null);
      }
    } catch {
      setLangLinkValue(DEFAULT_LANGUAGE_UEK_URL);
    }
  };

  const handleFetchFromLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalidLink) {
      setStatusMessage({
        type: 'error',
        text: 'Nieprawidłowy główny adres planu UEK. Upewnij się, że link zawiera parametr id=... z planzajec.uek.krakow.pl.',
      });
      return;
    }

    if (isInvalidLangLink) {
      setStatusMessage({
        type: 'error',
        text: 'Nieprawidłowy adres planu języka obcego. Upewnij się, że link zawiera parametr id=...',
      });
      return;
    }

    const targetUrl = isEmpty ? DEFAULT_UEK_URL : parsed.cleanUrl;
    const targetLangUrl = isLangEmpty ? '' : parsedLang.cleanUrl;

    onUpdateUrl(targetUrl);
    onUpdateLanguageConfig({
      languageUrl: targetLangUrl,
      customLangRoom: roomInput.trim(),
      customLangLecturer: lecturerInput.trim(),
    });

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await onLoginSubmit({
        url: targetUrl,
        languageUrl: targetLangUrl || undefined,
        username: casIndex.trim() || undefined,
        password: casPassword || undefined,
        sessionCookie: proxyUrl.trim() || undefined,
        rememberForAutoSync: true,
      });

      if (res.ok) {
        setStatusMessage({
          type: 'success',
          text: `Zaktualizowano plan główny (id=${parsed.entityId}) ${
            targetLangUrl ? `oraz lektorat (id=${parsedLang.entityId})` : ''
          }.`,
        });
        setTimeout(() => {
          onClose();
        }, 350);
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Nie udało się pobrać planu z podanego linku.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoadManualData = async () => {
    if (!rawText.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Wklej skopiowane dane (JSON, XML, HTML lub zawartość pliku .ics) albo upuść plik .ics powyżej.',
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      onUpdateLanguageConfig({
        languageUrl: isLangEmpty ? '' : parsedLang.cleanUrl,
        customLangRoom: roomInput.trim(),
        customLangLecturer: lecturerInput.trim(),
      });

      const res = await onLoginSubmit({
        url: isEmpty ? DEFAULT_UEK_URL : parsed.cleanUrl,
        rawXmlOrHtml: rawText.trim(),
        rememberForAutoSync: false,
      });
      if (res.ok) {
        onClose();
      } else {
        setStatusMessage({
          type: 'error',
          text:
            res.error ||
            'Nie udało się rozpoznać wklejonych danych planu zajęć.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    try {
      const content = await file.text();
      setRawText(content);
      setIsSubmitting(true);
      const res = await onLoginSubmit({
        url: isEmpty ? DEFAULT_UEK_URL : parsed.cleanUrl,
        rawXmlOrHtml: content,
        rememberForAutoSync: false,
      });
      setIsSubmitting(false);
      if (res.ok) {
        onClose();
      } else {
        setStatusMessage({
          type: 'error',
          text:
            res.error ||
            `Plik ${file.name} został wczytany do pola tekstowego — kliknij „Wczytaj”.`,
        });
      }
    } catch {
      setIsSubmitting(false);
      setStatusMessage({
        type: 'error',
        text: 'Nie udało się odczytać wybranego pliku.',
      });
    }
  };

  const copyBookmarkletCode = async () => {
    try {
      await navigator.clipboard.writeText(BOOKMARKLET_CODE);
      setStatusMessage({
        type: 'success',
        text: 'Skopiowano kod skryptozakładki do schowka!',
      });
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-uek-title"
    >
      <div className="w-full max-w-[560px] rounded-[28px] bg-[#161920]/95 border border-white/12 p-6 sm:p-7 text-[#F5F5F7] shadow-2xl my-auto max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-4 mb-5">
          <h2
            id="import-uek-title"
            className="text-xl sm:text-2xl font-bold tracking-tight text-white"
          >
            Import planu z UEK
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
            aria-label="Zamknij"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleFetchFromLink}>
          {/* 1. Główny link do planu kierunku */}
          <label className="block text-xs font-medium text-slate-400 mb-2">
            Link do planu głównego (kierunek / grupa dziekańska)
          </label>

          <div
            className={`h-[52px] rounded-2xl bg-[#0D1016] px-3.5 flex items-center gap-3 border transition-all ${
              isInvalidLink
                ? 'border-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.22)]'
                : isLinkFocused || isValidLink
                ? 'border-[#1D74F5] shadow-[0_0_0_3px_rgba(29,116,245,0.25)]'
                : 'border-white/12'
            }`}
          >
            <Link2
              className={`w-5 h-5 shrink-0 ${
                isInvalidLink
                  ? 'text-rose-500'
                  : isLinkFocused || isValidLink
                  ? 'text-[#2B8CFF]'
                  : 'text-slate-400'
              }`}
            />

            <input
              type="text"
              value={linkValue}
              onFocus={() => setIsLinkFocused(true)}
              onBlur={() => setIsLinkFocused(false)}
              onChange={(e) => {
                setLinkValue(e.target.value);
                setStatusMessage(null);
              }}
              placeholder="Wklej link do planu głównego"
              className="flex-1 min-w-0 bg-transparent text-[16px] text-white placeholder:text-slate-500 focus:outline-none truncate"
            />

            {isEmpty ? (
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                style={{ backgroundColor: 'var(--apple-accent, #1D74F5)' }}
                className="px-4 py-1.5 rounded-xl text-sm font-semibold text-white hover:opacity-95 transition-opacity shrink-0"
              >
                Wklej
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setLinkValue('');
                  setStatusMessage(null);
                }}
                aria-label="Wyczyść link główny"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="mt-1.5 min-h-[18px]">
            {isInvalidLink ? (
              <p className="text-xs text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Nieprawidłowy adres. Wklej link z planzajec.uek.krakow.pl zawierający id=...
                </span>
              </p>
            ) : isValidLink ? (
              <p className="text-xs text-[#5AC8FA] font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Rozpoznano: grupa {parsed.entityId} · okres {parsed.okres}
                </span>
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                Adres swojego planu z planzajec.uek.krakow.pl, np. .../index.php?typ=G&amp;id=259441&amp;okres=3
              </p>
            )}
          </div>

          {/* 2. Drugi input: Link do języka obcego (Lektorat CJ UEK, np. id=153591&okres=3) */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-slate-400">
                Link do języka obcego (Lektorat CJ UEK — sala i prowadzący)
              </label>
              <button
                type="button"
                onClick={() => setShowLangCustomFields(!showLangCustomFields)}
                className="text-[11px] font-medium text-[#2B8CFF] hover:underline"
              >
                {showLangCustomFields ? 'Ukryj edycję sali' : 'Zmień ręcznie salę / lektora'}
              </button>
            </div>

            <div
              className={`h-[52px] rounded-2xl bg-[#0D1016] px-3.5 flex items-center gap-3 border transition-all ${
                isInvalidLangLink
                  ? 'border-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.22)]'
                  : isLangFocused || isValidLangLink
                  ? 'border-[#1D74F5] shadow-[0_0_0_3px_rgba(29,116,245,0.25)]'
                  : 'border-white/12'
              }`}
            >
              <Globe
                className={`w-5 h-5 shrink-0 ${
                  isInvalidLangLink
                    ? 'text-rose-500'
                    : isLangFocused || isValidLangLink
                    ? 'text-[#F59E0B]'
                    : 'text-slate-400'
                }`}
              />

              <input
                type="text"
                value={langLinkValue}
                onFocus={() => setIsLangFocused(true)}
                onBlur={() => setIsLangFocused(false)}
                onChange={(e) => {
                  setLangLinkValue(e.target.value);
                  setStatusMessage(null);
                }}
                placeholder="Wklej link do lektoratu, np. ...?typ=G&id=153591&okres=3"
                className="flex-1 min-w-0 bg-transparent text-[16px] text-white placeholder:text-slate-500 focus:outline-none truncate"
              />

              {isLangEmpty ? (
                <button
                  type="button"
                  onClick={handlePasteLangFromClipboard}
                  style={{ backgroundColor: 'var(--apple-accent, #1D74F5)' }}
                  className="px-4 py-1.5 rounded-xl text-sm font-semibold text-white hover:opacity-95 transition-opacity shrink-0"
                >
                  Wklej
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setLangLinkValue('');
                    setStatusMessage(null);
                  }}
                  aria-label="Wyczyść link do języka obcego"
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="mt-1.5 min-h-[18px] flex items-center justify-between gap-2">
              {isInvalidLangLink ? (
                <p className="text-xs text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Nieprawidłowy link do grupy językowej.</span>
                </p>
              ) : isValidLangLink ? (
                <p className="text-xs text-[#FBBF24] font-medium flex items-center gap-1.5 truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    Rozpoznano lektorat: grupa {parsedLang.entityId} · okres{' '}
                    {parsedLang.okres} ·{' '}
                    {roomInput.trim() || langProfile?.room || 'Centrum Językowe'}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-slate-400">
                  Opcjonalny link do grupy językowej (np. id=153591&amp;okres=3), aby wyświetlać salę z angielskiego
                </p>
              )}

              {!isLangEmpty && isValidLangLink && (
                <a
                  href={parsedLang.cleanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-slate-400 hover:text-white inline-flex items-center gap-1 shrink-0"
                >
                  <span>UEK</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {showLangCustomFields && (
              <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3.5 rounded-2xl bg-black/30 border border-white/8">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Sala z języka obcego (np. Paw.B 252 / Online)
                  </label>
                  <input
                    type="text"
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value)}
                    placeholder={langProfile?.room || 'Paw.B 252 · Centrum Językowe'}
                    className="w-full h-[42px] px-3 rounded-xl bg-[#0D1016] border border-white/12 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#1D74F5]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Lektor / Prowadzący z angielskiego
                  </label>
                  <input
                    type="text"
                    value={lecturerInput}
                    onChange={(e) => setLecturerInput(e.target.value)}
                    placeholder={langProfile?.lecturer || 'mgr Katarzyna Zając'}
                    className="w-full h-[42px] px-3 rounded-xl bg-[#0D1016] border border-white/12 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#1D74F5]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Primary Action Row: Pobierz plan + Otwórz na UEK */}
          <div className="mt-4 flex items-center gap-2.5">
            <button
              type="submit"
              disabled={isSubmitting}
              style={{ backgroundColor: 'var(--apple-accent, #1D74F5)' }}
              className="flex-1 h-[46px] rounded-2xl font-semibold text-sm text-white shadow-lg hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Pobieranie planu...</span>
                </>
              ) : (
                <span>Pobierz plan</span>
              )}
            </button>

            <a
              href={isEmpty ? DEFAULT_UEK_URL : parsed.cleanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-[46px] px-4 rounded-2xl bg-white/8 hover:bg-white/14 border border-white/12 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Otwórz na UEK</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Expandable Advanced CAS Login / Proxy Section */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#2B8CFF] hover:underline"
            >
              <span>Zaawansowane: własny serwer pośredniczący i logowanie CAS</span>
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform ${
                  showAdvanced ? 'rotate-90' : ''
                }`}
              />
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3 p-4 rounded-2xl bg-black/30 border border-white/8">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                    Indeks / Login CAS UEK (logowanie.uek.krakow.pl)
                  </label>
                  <input
                    type="text"
                    value={casIndex}
                    onChange={(e) => setCasIndex(e.target.value)}
                    placeholder="np. s234567"
                    className="w-full h-[46px] px-3.5 rounded-xl bg-[#0D1016] border border-white/12 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#1D74F5] focus:shadow-[0_0_0_3px_rgba(29,116,245,0.25)] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                    Hasło CAS UEK
                  </label>
                  <input
                    type="password"
                    value={casPassword}
                    onChange={(e) => setCasPassword(e.target.value)}
                    placeholder="Hasło do konta uczelnianego CAS"
                    className="w-full h-[46px] px-3.5 rounded-xl bg-[#0D1016] border border-white/12 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#1D74F5] focus:shadow-[0_0_0_3px_rgba(29,116,245,0.25)] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
                    Ciasteczko sesji PHPSESSID lub własny serwer pośredniczący (opcjonalnie)
                  </label>
                  <input
                    type="text"
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                    placeholder="np. PHPSESSID=a1b2c3d4..."
                    className="w-full h-[46px] px-3.5 rounded-xl bg-[#0D1016] border border-white/12 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-[#1D74F5] focus:shadow-[0_0_0_3px_rgba(29,116,245,0.25)] transition-all"
                  />
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Divider: ALBO RĘCZNIE */}
        <div className="mt-6 pt-5 border-t border-white/10">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            ALBO RĘCZNIE
          </p>
          <p className="text-xs text-slate-300 leading-relaxed">
            UEK blokuje boty i wymaga logowania, a strona w przeglądarce nie może sama się tam zalogować ani pobrać danych z innej domeny. Logujesz się więc sam na stronie UEK (indeks + hasło), a plan przenosisz tu jednym kliknięciem. Hasło nie trafia na tę stronę.
          </p>

          <ol className="mt-3 space-y-1.5 text-xs text-slate-300 list-decimal list-inside">
            <li>
              Dodaj zakładkę: przeciągnij{' '}
              <a
                href={BOOKMARKLET_CODE}
                onClick={(e) => e.preventDefault()}
                className="text-[#2B8CFF] underline font-medium"
                title="Przeciągnij ten link na pasek zakładek przeglądarki"
              >
                ⬇ Pobierz plan UEK
              </a>{' '}
              na pasek zakładek albo{' '}
              <button
                type="button"
                onClick={copyBookmarkletCode}
                className="text-[#2B8CFF] underline font-medium"
              >
                skopiuj jej kod
              </button>
              .
            </li>
            <li>
              Otwórz{' '}
              <a
                href={isEmpty ? DEFAULT_UEK_URL : parsed.cleanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#2B8CFF] underline font-medium"
              >
                swój plan
              </a>{' '}
              i zaloguj się.
            </li>
            <li>Kliknij zakładkę i wklej wynik poniżej.</li>
          </ol>

          {/* Dashed .ics Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileUpload(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`mt-4 rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-[#2B8CFF] bg-[#1D74F5]/15'
                : 'border-[#1D74F5]/50 bg-[#0E1626]/60 hover:bg-[#0E1626]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".ics,.xml,.html,.json,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
            <p className="text-sm font-bold text-white">Upuść tutaj plik .ics</p>
            <p className="text-xs text-slate-400 mt-1">
              albo kliknij, aby wybrać go z dysku (.ics, .xml, .html)
            </p>
          </div>

          {/* Raw paste textarea */}
          <textarea
            rows={3}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="...albo wklej skopiowane dane (JSON, tekst z tabeli lub treść pliku .ics)"
            className="mt-3 w-full p-3.5 rounded-2xl bg-[#0D1016] border border-white/12 font-mono text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#1D74F5]"
          />

          {statusMessage && (
            <div
              className={`mt-3 p-3 rounded-xl text-xs flex items-center gap-2 ${
                statusMessage.type === 'error'
                  ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                  : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              }`}
            >
              {statusMessage.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Bottom buttons */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleLoadManualData}
              style={{ backgroundColor: 'var(--apple-accent, #1D74F5)' }}
              className="px-5 py-2 rounded-full text-xs font-semibold text-white hover:opacity-95 transition-opacity"
            >
              Wczytaj
            </button>
            <button
              type="button"
              onClick={() => {
                onResetToDefaultSchedule();
                onClose();
              }}
              className="px-4 py-2 rounded-full text-xs font-medium bg-white/8 hover:bg-white/14 border border-white/12 text-slate-200 transition-colors"
            >
              Przywróć plan z pliku
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-medium bg-white/8 hover:bg-white/14 border border-white/12 text-slate-200 transition-colors"
            >
              Zamknij
            </button>
          </div>

          <p className="mt-3 text-[11px] text-slate-500">
            Parser rozpoznaje pola heurystycznie (XML, tabela HTML UEK, JSON oraz pliki kalendarza .ics).
          </p>
        </div>
      </div>
    </div>
  );
};
