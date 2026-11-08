import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  isDark: boolean;
  accentColor: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  isDark,
  accentColor,
}) => {
  const { isInstallable, isInstalled, isIOS, isInAppBrowser, install } =
    usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuideModal(true);
      }
    } else {
      setShowGuideModal(true);
    }
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Dodaj Plan UEK na ekran telefonu"
        title="Dodaj ikonę Plan UEK bezpośrednio na ekran główny telefonu"
        style={
          isInstallable
            ? {
                backgroundColor: `${accentColor}22`,
                borderColor: `${accentColor}65`,
                color: isDark ? '#FFFFFF' : accentColor,
              }
            : undefined
        }
        className={`h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-full flex items-center gap-1.5 border text-[11px] sm:text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
          isInstallable
            ? 'shadow-xs'
            : isDark
            ? 'bg-white/6 hover:bg-white/12 border-white/12 text-sky-300'
            : 'bg-white/90 hover:bg-white border-slate-200/90 shadow-xs text-sky-700'
        }`}
      >
        <Smartphone className="w-3.5 h-3.5 shrink-0" />
        <span>Na ekran</span>
      </button>

      {showGuideModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-2.5 sm:p-4 bg-black/65 backdrop-blur-sm overflow-y-auto"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowGuideModal(false);
            }}
          >
            <div
              className={`w-full max-w-md rounded-[26px] sm:rounded-[28px] p-4 sm:p-6 border shadow-2xl my-auto max-h-[90dvh] overflow-y-auto gpu-scroll-container ${
                isDark
                  ? 'bg-[#151923] border-white/12 text-[#F5F5F7]'
                  : 'bg-white border-slate-200 text-[#1D1D1F]'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-slate-200/70 dark:border-white/10">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    style={{ backgroundColor: accentColor }}
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
                  >
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold leading-tight truncate">
                      Dodaj Plan UEK na ekran telefonu
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Ikona na pulpicie telefonu · pełny ekran · działa offline
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 flex items-center justify-center shrink-0"
                  aria-label="Zamknij"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs leading-relaxed">
                {/* 1-Click Native Install if browser prompt is ready */}
                {isInstallable && (
                  <div
                    style={{
                      backgroundColor: `${accentColor}18`,
                      borderColor: `${accentColor}50`,
                    }}
                    className="p-3.5 rounded-2xl border space-y-2.5"
                  >
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <Sparkles
                        style={{ color: accentColor }}
                        className="w-4 h-4 shrink-0"
                      />
                      <span>Szybka instalacja jednym kliknięciem</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300">
                      Twoja przeglądarka obsługuje bezpośrednie dodanie aplikacji
                      Plan UEK na pulpit telefonu:
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await install();
                        if (ok) setShowGuideModal(false);
                      }}
                      style={{ backgroundColor: accentColor }}
                      className="w-full py-2.5 px-4 rounded-xl font-bold text-white shadow-md flex items-center justify-center gap-2 hover:opacity-95"
                    >
                      <Download className="w-4 h-4" />
                      <span>Zainstaluj Plan UEK na pulpicie</span>
                    </button>
                  </div>
                )}

                {/* Warning if opened inside Messenger / Instagram WebView */}
                {isInAppBrowser && (
                  <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-900 dark:text-amber-200 space-y-2.5">
                    <p className="font-bold flex items-center gap-1.5">
                      <ExternalLink className="w-4 h-4 shrink-0 text-amber-500" />
                      <span>Otwierasz link w komunikatorze (Messenger)</span>
                    </p>
                    <p>
                      Wbudowana przeglądarka Messengera blokuje dodawanie ikon na
                      pulpit. Kliknij przycisk poniżej lub w menu{' '}
                      <strong>⋯ w prawym górnym rogu</strong> wybierz{' '}
                      <strong>„↗ Otwórz w przeglądarce”</strong>:
                    </p>
                    {!isIOS && typeof window !== 'undefined' && (
                      <a
                        href={`intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(
                          window.location.href
                        )};end`}
                        className="w-full py-2.5 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition-colors"
                      >
                        <ExternalLink className="w-4 h-4 shrink-0" />
                        <span>Przejdź od razu do Chrome (1 kliknięciem)</span>
                      </a>
                    )}
                  </div>
                )}

                {/* Step-by-step for Android (Chrome) */}
                {!isIOS && (
                  <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/25 space-y-2">
                    <p className="font-bold text-sm text-sky-600 dark:text-sky-300 flex items-center gap-1.5">
                      <span>🤖 Android (przeglądarka Chrome):</span>
                    </p>
                    <ol className="space-y-2 text-slate-700 dark:text-slate-200">
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                          1
                        </span>
                        <span>
                          Kliknij ikonę menu{' '}
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/80 dark:bg-white/10 font-bold">
                            <MoreVertical className="w-3.5 h-3.5 inline" /> (trzy
                            kropki)
                          </span>{' '}
                          w prawym górnym rogu Chrome.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                          2
                        </span>
                        <span>
                          Wybierz z listy{' '}
                          <strong>„Dodaj do ekranu głównego”</strong> (lub{' '}
                          <strong>„Zainstaluj aplikację”</strong>).
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-300 font-bold flex items-center justify-center shrink-0 text-[11px]">
                          3
                        </span>
                        <span>
                          Potwierdź przyciskiem <strong>Zainstaluj / Dodaj</strong>
                          . Ikona <strong>Plan UEK</strong> pojawi się na ekranie
                          telefonu!
                        </span>
                      </li>
                    </ol>
                    <p className="text-[11px] opacity-80 pt-1 border-t border-sky-500/20">
                      💡 <strong>Wskazówka:</strong> Jeśli masz już na telefonie
                      zainstalowany wcześniej plik <code>.apk</code> z
                      PWABuilder, w menu Chrome zobaczysz napis{' '}
                      <em>„Otwórz w aplikacji Plan UEK”</em> (ponieważ aplikacja
                      jest już na Twoim telefonie).
                    </p>
                  </div>
                )}

                {/* Step-by-step for iPhone / iPad (Safari) */}
                <div
                  className={`p-3.5 rounded-2xl border space-y-2 ${
                    isIOS
                      ? 'bg-sky-500/10 border-sky-500/25'
                      : 'bg-slate-500/10 border-slate-500/20'
                  }`}
                >
                  <p
                    className={`font-bold text-sm flex items-center gap-1.5 ${
                      isIOS
                        ? 'text-sky-600 dark:text-sky-300'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <span>🍎 iPhone / iPad (Safari):</span>
                  </p>
                  <ol className="space-y-2 text-slate-700 dark:text-slate-200">
                    <li className="flex items-center gap-1.5 flex-wrap">
                      <span>1. Stuknij ikonę</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/80 dark:bg-white/10 font-semibold">
                        <Share className="w-3.5 h-3.5 text-[#007AFF]" />
                        Udostępnij
                      </span>
                      <span>na pasku przeglądarki Safari.</span>
                    </li>
                    <li className="flex items-center gap-1.5 flex-wrap">
                      <span>2. Przewiń w dół i wybierz</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/80 dark:bg-white/10 font-semibold">
                        <PlusSquare className="w-3.5 h-3.5 text-[#007AFF]" />
                        Do ekranu początkowego
                      </span>
                      <span>.</span>
                    </li>
                    <li>
                      3. Stuknij <strong>Dodaj</strong> w prawym górnym rogu —
                      gotowe!
                    </li>
                  </ol>
                </div>

                {/* Offline info */}
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-800 dark:text-emerald-300 flex items-center gap-2.5">
                  <WifiOff className="w-4 h-4 shrink-0" />
                  <span>
                    Po dodaniu na ekran główny plan otwiera się jednym
                    stuknięciem na pełnym ekranie (bez paska adresu) i działa
                    nawet offline bez internetu.
                  </span>
                </div>
              </div>

              {/* Bottom buttons */}
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-colors ${
                    copiedLink
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : isDark
                      ? 'bg-white/8 hover:bg-white/14 border-white/15 text-slate-200'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
                  }`}
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Skopiowano link!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Kopiuj link dla grupy</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  style={{ backgroundColor: accentColor }}
                  className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold text-white shadow-sm hover:opacity-95 transition-opacity"
                >
                  Gotowe
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-amber-500/95 backdrop-blur-md px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg border border-white/20">
      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
      <span>Tryb offline — wyświetlono zapisany plan zajęć</span>
    </div>
  );
};
