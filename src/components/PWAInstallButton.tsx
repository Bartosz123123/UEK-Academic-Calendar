import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, PlusSquare, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  isDark: boolean;
  accentColor: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  isDark,
  accentColor,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Zainstaluj aplikację na telefonie"
        title="Dodaj aplikację Plan UEK do ekranu głównego (działa też offline)"
        className={`h-10 px-3 rounded-full flex items-center gap-1.5 border text-xs font-semibold transition-colors ${
          isDark
            ? 'bg-white/6 hover:bg-white/12 border-white/12 text-sky-300'
            : 'bg-white/90 hover:bg-white border-slate-200/90 shadow-xs text-sky-700'
        }`}
      >
        <Smartphone className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">Aplikacja</span>
      </button>

      {showGuideModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-md overflow-y-auto"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowGuideModal(false);
            }}
          >
            <div
              className={`w-full max-w-md rounded-[28px] p-5 sm:p-6 border shadow-2xl my-auto ${
                isDark
                  ? 'bg-[#161922]/96 border-white/12 text-[#F5F5F7]'
                  : 'bg-white/96 border-slate-200 text-[#1D1D1F]'
              }`}
            >
            <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-slate-200/70 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <div
                  style={{ backgroundColor: accentColor }}
                  className="w-9 h-9 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0"
                >
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold leading-tight">
                    Aplikacja na telefon (Offline)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Pełny ekran w stylu iOS i dostęp bez internetu
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
              {isIOS ? (
                <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/25 space-y-2">
                  <p className="font-bold text-sm text-sky-600 dark:text-sky-300">
                    iPhone / iPad (Safari):
                  </p>
                  <ol className="space-y-2 text-slate-700 dark:text-slate-200">
                    <li className="flex items-center gap-1.5 flex-wrap">
                      <span>1. Stuknij przycisk</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/80 dark:bg-white/10 font-semibold">
                        <Share className="w-3.5 h-3.5 text-[#007AFF]" />
                        Udostępnij
                      </span>
                      <span>na dolnym pasku Safari.</span>
                    </li>
                    <li className="flex items-center gap-1.5 flex-wrap">
                      <span>2. Wybierz z listy</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/80 dark:bg-white/10 font-semibold">
                        <PlusSquare className="w-3.5 h-3.5 text-[#007AFF]" />
                        Do ekranu początkowego
                      </span>
                      <span>.</span>
                    </li>
                    <li>
                      3. Stuknij <strong>Dodaj</strong> w prawym górnym rogu.
                    </li>
                  </ol>
                </div>
              ) : (
                <>
                  <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/25 space-y-1.5">
                    <p className="font-bold text-sky-600 dark:text-sky-300">
                      Android (Chrome):
                    </p>
                    <p className="text-slate-700 dark:text-slate-200">
                      Kliknij menu <strong>⋮ (trzy kropki)</strong> w prawym górnym rogu przeglądarki i wybierz <strong>„Zainstaluj aplikację”</strong> lub <strong>„Dodaj do ekranu głównego”</strong>.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-500/10 border border-slate-500/20 space-y-1.5">
                    <p className="font-bold text-slate-800 dark:text-slate-200">
                      iPhone / iOS (Safari):
                    </p>
                    <p className="text-slate-700 dark:text-slate-300">
                      Stuknij ikonę <strong>Udostępnij</strong> na dolnym pasku Safari, a następnie wybierz <strong>„Do ekranu początkowego”</strong>.
                    </p>
                  </div>
                </>
              )}

              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-800 dark:text-emerald-300 flex items-center gap-2.5">
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>
                  Twój plan zajęć i wszystkie oznaczenia zapisują się automatycznie w pamięci telefonu — aplikacja działa nawet w pociągu i w budynkach bez zasięgu.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              style={{ backgroundColor: accentColor }}
              className="mt-5 w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-sm hover:opacity-95 transition-opacity"
            >
              Rozumiem
            </button>
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
