import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Globe,
  GraduationCap,
  Info,
  Link2,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import {
  DEFAULT_LANGUAGE_UEK_URL,
  DEFAULT_UEK_URL,
  MajorTrackId,
  detectMajorFromUrlOrName,
  getLanguageProfileForUrl,
  parseUekUrl,
} from '../utils/uekParser';

interface CasAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUrl: string;
  onUpdateUrl: (newUrl: string) => void;
  selectedMajor: MajorTrackId;
  onSelectMajor: (major: MajorTrackId) => void;
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
    major?: MajorTrackId;
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
  selectedMajor,
  onSelectMajor,
  languageUrl,
  onUpdateLanguageConfig,
  customLangRoom,
  customLangLecturer,
  authMode,
  onLoginSubmit,
  onResetToDefaultSchedule,
}) => {
  const [activeTab, setActiveTab] = useState<'link' | 'real_import'>('link');
  const [linkValue, setLinkValue] = useState<string>(currentUrl);
  const [isLinkFocused, setIsLinkFocused] = useState<boolean>(false);

  const [activeMajor, setActiveMajor] = useState<MajorTrackId>(selectedMajor);

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

  useEffect(() => {
    if (isOpen) {
      setLinkValue(currentUrl);
      setActiveMajor(selectedMajor);
      setLangLinkValue(languageUrl);
      setRoomInput(customLangRoom);
      setLecturerInput(customLangLecturer);
      setStatusMessage(null);
    }
  }, [isOpen, currentUrl, selectedMajor, languageUrl, customLangRoom, customLangLecturer]);

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
        const cleaned = text.trim();
        setLinkValue(cleaned);
        const autoDetected = detectMajorFromUrlOrName(cleaned);
        if (autoDetected) {
          setActiveMajor(autoDetected);
        }
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

  const handlePasteRawFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setRawText(text.trim());
        setStatusMessage(null);
      }
    } catch {
      // ignore
    }
  };

  const handleFetchFromLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalidLink) {
      setStatusMessage({
        type: 'error',
        text: 'Nieprawidłowy adres planu UEK. Upewnij się, że link zawiera parametr id=... z planzajec.uek.krakow.pl.',
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
    const resolvedMajor = detectMajorFromUrlOrName(targetUrl) || activeMajor || 'finanse';

    onSelectMajor(resolvedMajor);
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
        major: resolvedMajor,
        rememberForAutoSync: true,
      });

      onUpdateUrl(targetUrl);

      if (res.ok) {
        setStatusMessage({
          type: 'success',
          text: `Zastosowano plan zajęć (gr. ${parsed.entityId}).`,
        });
        setTimeout(() => {
          onClose();
        }, 350);
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Nie udało się zaktualizować planu.',
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
        text: 'Wklej skopiowane dane (tabelę ze strony UEK, XML, JSON lub plik .ics) albo upuść plik .ics.',
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const targetUrl = isEmpty ? DEFAULT_UEK_URL : parsed.cleanUrl;
      const targetLangUrl = isLangEmpty ? '' : parsedLang.cleanUrl;

      onSelectMajor(activeMajor);
      onUpdateLanguageConfig({
        languageUrl: targetLangUrl,
        customLangRoom: roomInput.trim(),
        customLangLecturer: lecturerInput.trim(),
      });

      const res = await onLoginSubmit({
        url: targetUrl,
        rawXmlOrHtml: rawText.trim(),
        major: activeMajor,
        rememberForAutoSync: false,
      });

      if (res.ok) {
        onUpdateUrl(targetUrl);
        setStatusMessage({
          type: 'success',
          text: 'Pomyślnie wczytano oficjalne zajęcia z UEK!',
        });
        setTimeout(() => {
          onClose();
        }, 350);
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
      const targetUrl = isEmpty ? DEFAULT_UEK_URL : parsed.cleanUrl;
      onSelectMajor(activeMajor);

      const res = await onLoginSubmit({
        url: targetUrl,
        rawXmlOrHtml: content,
        major: activeMajor,
        rememberForAutoSync: false,
      });
      setIsSubmitting(false);
      if (res.ok) {
        onUpdateUrl(targetUrl);
        setStatusMessage({
          type: 'success',
          text: `Wczytano plan z pliku ${file.name}!`,
        });
        setTimeout(() => {
          onClose();
        }, 350);
      } else {
        setStatusMessage({
          type: 'error',
          text:
            res.error ||
            `Plik ${file.name} został wczytany do pola — kliknij „Wczytaj”.`,
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-uek-title"
    >
      <div className="w-full max-w-[580px] rounded-[28px] bg-[#161920]/95 border border-white/12 p-6 sm:p-7 text-[#F5F5F7] shadow-2xl my-auto max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2
              id="import-uek-title"
              className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2"
            >
              <GraduationCap className="w-6 h-6 text-[#2B8CFF]" />
              <span>Plan zajęć UEK</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Wklej link do planu lub wczytaj oficjalny plik z uczelni
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
            aria-label="Zamknij"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-black/40 border border-white/10 mb-5">
          <button
            type="button"
            onClick={() => {
              setActiveTab('link');
              setStatusMessage(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'link'
                ? 'bg-white/15 text-white shadow-sm border border-white/15'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Link do planu grupy</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('real_import');
              setStatusMessage(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'real_import'
                ? 'bg-[#1D74F5] text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Oficjalny plik / Tabela UEK</span>
          </button>
        </div>

        {activeTab === 'link' ? (
          <form onSubmit={handleFetchFromLink}>
            {/* Link do planu grupy */}
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Link do planu grupy (z planzajec.uek.krakow.pl):
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
                    const auto = detectMajorFromUrlOrName(e.target.value);
                    if (auto) setActiveMajor(auto);
                    setStatusMessage(null);
                  }}
                  placeholder="https://planzajec.uek.krakow.pl/index.php?typ=G&id=170031&okres=3"
                  className="flex-1 min-w-0 bg-transparent text-[15px] text-white placeholder:text-slate-500 focus:outline-none truncate"
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
                      Wklej pełny link z planzajec.uek.krakow.pl zawierający parametr id=...
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
                    np. https://planzajec.uek.krakow.pl/index.php?typ=G&amp;id=170031&amp;okres=3
                  </p>
                )}
              </div>
            </div>

            {/* Opcjonalny lektorat */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-400">
                  Lektorat / Język obcy (opcjonalnie)
                </label>
                <button
                  type="button"
                  onClick={() => setShowLangCustomFields(!showLangCustomFields)}
                  className="text-[11px] font-medium text-[#2B8CFF] hover:underline"
                >
                  {showLangCustomFields ? 'Ukryj edycję' : 'Zmień salę / lektora'}
                </button>
              </div>

              <div
                className={`h-[48px] rounded-2xl bg-[#0D1016] px-3.5 flex items-center gap-3 border transition-all ${
                  isInvalidLangLink
                    ? 'border-rose-500'
                    : isLangFocused || isValidLangLink
                    ? 'border-[#1D74F5]'
                    : 'border-white/12'
                }`}
              >
                <Globe className="w-4 h-4 text-[#F59E0B] shrink-0" />
                <input
                  type="text"
                  value={langLinkValue}
                  onFocus={() => setIsLangFocused(true)}
                  onBlur={() => setIsLangFocused(false)}
                  onChange={(e) => {
                    setLangLinkValue(e.target.value);
                    setStatusMessage(null);
                  }}
                  placeholder="Link do grupy językowej, np. ...?typ=G&id=153591&okres=3"
                  className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none truncate"
                />
                {isLangEmpty ? (
                  <button
                    type="button"
                    onClick={handlePasteLangFromClipboard}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-white/10 text-slate-200 hover:text-white shrink-0"
                  >
                    Wklej
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setLangLinkValue('')}
                    className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {showLangCustomFields && (
                <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-2xl bg-black/30 border border-white/8">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Sala (np. Paw.B 252 / Online)
                    </label>
                    <input
                      type="text"
                      value={roomInput}
                      onChange={(e) => setRoomInput(e.target.value)}
                      placeholder={langProfile?.room || 'Paw.B 252 · Centrum Językowe'}
                      className="w-full h-[38px] px-3 rounded-xl bg-[#0D1016] border border-white/12 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#1D74F5]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Lektor / Prowadzący
                    </label>
                    <input
                      type="text"
                      value={lecturerInput}
                      onChange={(e) => setLecturerInput(e.target.value)}
                      placeholder={langProfile?.lecturer || 'mgr Katarzyna Zając'}
                      className="w-full h-[38px] px-3 rounded-xl bg-[#0D1016] border border-white/12 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#1D74F5]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Primary Action Button */}
            <div className="flex items-center gap-2.5">
              <button
                type="submit"
                disabled={isSubmitting}
                style={{ backgroundColor: 'var(--apple-accent, #1D74F5)' }}
                className="flex-1 h-[48px] rounded-2xl font-semibold text-sm text-white shadow-lg hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Pobieranie i ustawianie planu...</span>
                  </>
                ) : (
                  <span>Pobierz i zastosuj plan</span>
                )}
              </button>

              <a
                href={isEmpty ? DEFAULT_UEK_URL : parsed.cleanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-[48px] px-4 rounded-2xl bg-white/8 hover:bg-white/14 border border-white/12 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <span>Otwórz na UEK</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Info notice about official import */}
            <div className="mt-4 p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">Chcesz 100% oficjalny plan ze swoimi salami?</p>
                <p className="text-[11px] text-blue-300 mt-0.5">
                  Serwery UEK wymagają logowania studenta, więc zewnętrzne aplikacje nie mogą go pobrać automatycznie. Przejdź do zakładki <strong>„Oficjalny plik / Tabela UEK”</strong> i wrzuć wyeksportowany z UEK plik <code>.ics</code>.
                </p>
              </div>
            </div>

            {/* CAS direct login (advanced) */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#2B8CFF] hover:underline"
              >
                <span>Opcjonalnie: logowanie CAS UEK (indeks + hasło)</span>
                <ChevronRight
                  className={`w-3.5 h-3.5 transition-transform ${
                    showAdvanced ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {showAdvanced && (
                <div className="mt-2.5 space-y-2.5 p-3.5 rounded-2xl bg-black/30 border border-white/8 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">
                      Login CAS UEK (np. s234567)
                    </label>
                    <input
                      type="text"
                      value={casIndex}
                      onChange={(e) => setCasIndex(e.target.value)}
                      placeholder="s..."
                      className="w-full h-[40px] px-3 rounded-xl bg-[#0D1016] border border-white/12 text-white placeholder:text-slate-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Hasło CAS UEK</label>
                    <input
                      type="password"
                      value={casPassword}
                      onChange={(e) => setCasPassword(e.target.value)}
                      placeholder="Hasło uczelniane"
                      className="w-full h-[40px] px-3 rounded-xl bg-[#0D1016] border border-white/12 text-white placeholder:text-slate-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </form>
        ) : (
          /* Tab 2: 100% PRAWDZIWY PLAN Z UEK */
          <div>
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 mb-4 text-xs text-emerald-200">
              <p className="font-bold text-white text-sm mb-1 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Pobierz 100% oficjalny plan zajęć ze swoimi salami:</span>
              </p>
              <ol className="list-decimal list-inside space-y-1 mt-2 text-slate-300">
                <li>
                  Kliknij{' '}
                  <a
                    href={isEmpty ? DEFAULT_UEK_URL : parsed.cleanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#5AC8FA] underline font-semibold"
                  >
                    Otwórz plan na UEK ↗
                  </a>{' '}
                  i zaloguj się swoim indeksem.
                </li>
                <li>
                  Na stronie planu kliknij <strong>„Eksportuj do .ics”</strong> lub zaznacz tabelę (<code>Ctrl+A</code>, <code>Ctrl+C</code>).
                </li>
                <li>Upuść pobrany plik lub wklej treść poniżej.</li>
              </ol>
            </div>

            {/* Dropzone */}
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
              className={`rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-[#2B8CFF] bg-[#1D74F5]/20 shadow-lg'
                  : 'border-[#1D74F5]/50 bg-[#0E1626]/70 hover:bg-[#0E1626] hover:border-[#2B8CFF]'
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
              <Upload className="w-8 h-8 mx-auto text-[#2B8CFF] mb-2" />
              <p className="text-sm font-bold text-white">
                Upuść tutaj plik .ics z planu UEK
              </p>
              <p className="text-xs text-slate-400 mt-1">
                albo kliknij, aby wybrać z telefonu / dysku (.ics, .xml, .html)
              </p>
            </div>

            {/* Raw textarea */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-400">
                  ...albo wklej skopiowaną treść (tabela, JSON lub .ics):
                </label>
                <button
                  type="button"
                  onClick={handlePasteRawFromClipboard}
                  className="text-xs text-[#2B8CFF] hover:underline"
                >
                  Wklej ze schowka
                </button>
              </div>
              <textarea
                rows={3}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Wklej skopiowaną tabelę z planzajec.uek.krakow.pl lub zawartość pliku .ics..."
                className="w-full p-3.5 rounded-2xl bg-[#0D1016] border border-white/12 font-mono text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#1D74F5]"
              />
            </div>

            {/* Action buttons */}
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleLoadManualData}
                disabled={isSubmitting}
                style={{ backgroundColor: 'var(--apple-accent, #1D74F5)' }}
                className="px-6 py-2.5 rounded-2xl text-xs font-bold text-white hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Wczytywanie...</span>
                  </>
                ) : (
                  <span>Wczytaj oficjalny plan UEK</span>
                )}
              </button>

              <button
                type="button"
                onClick={copyBookmarkletCode}
                className="px-4 py-2.5 rounded-2xl text-xs font-medium bg-white/8 hover:bg-white/14 border border-white/12 text-slate-200 transition-colors"
              >
                Kopiuj skrypt 1-klik
              </button>

              <a
                href={isEmpty ? DEFAULT_UEK_URL : parsed.cleanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-2xl text-xs font-semibold bg-white/8 hover:bg-white/14 border border-white/12 text-slate-200 flex items-center gap-1.5 transition-colors"
              >
                <span>Otwórz plan na UEK ↗</span>
              </a>
            </div>
          </div>
        )}

        {/* Status message */}
        {statusMessage && (
          <div
            className={`mt-4 p-3.5 rounded-2xl text-xs flex items-center gap-2.5 ${
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

        {/* Footer actions */}
        <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onResetToDefaultSchedule();
              onClose();
            }}
            className="text-xs text-slate-400 hover:text-white transition-colors underline"
          >
            Przywróć domyślny plan (Informatyka Stosowana)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
};
