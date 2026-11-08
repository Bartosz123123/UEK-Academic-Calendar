import React, { useState } from 'react';
import {
  ArrowRightLeft,
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  GraduationCap,
  MapPin,
  RotateCcw,
  User,
  Video,
  X,
} from 'lucide-react';
import { ClassStatus, CustomStatusOverride, ScheduleItem } from '../types/schedule';

interface ClassInspectorModalProps {
  item: ScheduleItem | null;
  onClose: () => void;
  onSaveOverride: (itemId: string, override: CustomStatusOverride) => void;
  onClearOverride: (itemId: string) => void;
}

const STATUS_OPTIONS: Array<{
  value: ClassStatus;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
}> = [
  {
    value: 'scheduled',
    label: 'Planowe',
    desc: 'Zajęcia odbywają się zgodnie z harmonogramem',
    icon: CheckCircle2,
    activeClass:
      'bg-emerald-500/15 border-emerald-500/40 text-emerald-900 dark:text-emerald-200',
  },
  {
    value: 'cancelled',
    label: 'Odwołane',
    desc: 'Zajęcia nie odbędą się w tym terminie',
    icon: Ban,
    activeClass: 'bg-rose-500/15 border-rose-500/40 text-rose-900 dark:text-rose-200',
  },
  {
    value: 'rescheduled',
    label: 'Przeniesione',
    desc: 'Zmiana daty, godziny lub terminu odrabiania',
    icon: ArrowRightLeft,
    activeClass:
      'bg-amber-500/15 border-amber-500/40 text-amber-900 dark:text-amber-200',
  },
  {
    value: 'room_changed',
    label: 'Zmiana sali',
    desc: 'Zajęcia przeniesione do innego pawilonu lub sali',
    icon: MapPin,
    activeClass:
      'bg-purple-500/15 border-purple-500/40 text-purple-900 dark:text-purple-200',
  },
  {
    value: 'online',
    label: 'Zdalnie (Teams)',
    desc: 'Realizacja na platformie MS Teams / e-Uczelnia',
    icon: Video,
    activeClass: 'bg-sky-500/15 border-sky-500/40 text-sky-900 dark:text-sky-200',
  },
  {
    value: 'exam',
    label: 'Kolokwium / Egzamin',
    desc: 'Zaliczenie, kolokwium lub egzamin końcowy',
    icon: GraduationCap,
    activeClass:
      'bg-indigo-500/15 border-indigo-500/40 text-indigo-900 dark:text-indigo-200',
  },
];

export const ClassInspectorModal: React.FC<ClassInspectorModalProps> = ({
  item,
  onClose,
  onSaveOverride,
  onClearOverride,
}) => {
  if (!item) return null;

  return (
    <ClassInspectorForm
      key={item.id}
      item={item}
      onClose={onClose}
      onSaveOverride={onSaveOverride}
      onClearOverride={onClearOverride}
    />
  );
};

const ClassInspectorForm: React.FC<{
  item: ScheduleItem;
  onClose: () => void;
  onSaveOverride: (itemId: string, override: CustomStatusOverride) => void;
  onClearOverride: (itemId: string) => void;
}> = ({ item, onClose, onSaveOverride, onClearOverride }) => {
  const [status, setStatus] = useState<ClassStatus>(item.status);
  const [statusReason, setStatusReason] = useState(item.statusReason || '');
  const [rescheduledToDate, setRescheduledToDate] = useState(
    item.rescheduledToDate || item.date
  );
  const [rescheduledToTime, setRescheduledToTime] = useState(
    item.rescheduledToTime || item.startTime
  );
  const [rescheduledToRoom, setRescheduledToRoom] = useState(
    item.rescheduledToRoom || item.room
  );
  const [previousRoom, setPreviousRoom] = useState(item.previousRoom || item.room);
  const [userNote, setUserNote] = useState(item.userNote || '');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    let computedReason = statusReason.trim();
    if (!computedReason) {
      if (status === 'cancelled') {
        computedReason = 'Zajęcia odwołane';
      } else if (status === 'rescheduled') {
        computedReason = `Przeniesione na ${rescheduledToDate} godz. ${rescheduledToTime} (${rescheduledToRoom})`;
      } else if (status === 'room_changed') {
        computedReason = `Zmiana sali z ${previousRoom} na ${rescheduledToRoom}`;
      } else if (status === 'online') {
        computedReason = 'Zajęcia zdalne (MS Teams / e-Uczelnia)';
      } else if (status === 'exam') {
        computedReason = 'Kolokwium / Zaliczenie';
      }
    }

    onSaveOverride(item.id, {
      status,
      statusReason: computedReason || undefined,
      rescheduledToDate: status === 'rescheduled' ? rescheduledToDate : undefined,
      rescheduledToTime: status === 'rescheduled' ? rescheduledToTime : undefined,
      rescheduledToRoom:
        status === 'rescheduled' || status === 'room_changed'
          ? rescheduledToRoom
          : undefined,
      previousRoom: status === 'room_changed' ? previousRoom : undefined,
      userNote: userNote.trim() || undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspector-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-[28px] bg-white/95 dark:bg-[#161922]/95 border border-slate-200/90 dark:border-white/12 p-5 sm:p-6 text-slate-900 dark:text-[#F5F5F7] shadow-2xl my-auto max-h-[90vh] overflow-y-auto backdrop-blur-2xl">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-slate-200/80 dark:border-white/10">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span className="font-medium">{item.date}</span>
              <span aria-hidden="true">·</span>
              <span>{item.dayOfWeek}</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {item.startTime} – {item.endTime}
              </span>
              <span aria-hidden="true">·</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-[11px] font-medium">
                {item.type}
              </span>
            </div>
            <h2
              id="inspector-modal-title"
              className="text-lg sm:text-xl font-bold tracking-tight mt-1.5 text-slate-900 dark:text-white break-words"
            >
              {item.subject}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors shrink-0"
            aria-label="Zamknij szczegóły zajęć"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary details */}
        <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 flex items-center gap-2.5">
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Prowadzący</p>
              <p className="font-semibold text-slate-900 dark:text-white truncate">
                {item.lecturer || 'Brak danych'}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 flex items-center gap-2.5">
            <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Sala / Miejsce</p>
              <p className="font-semibold text-slate-900 dark:text-white truncate">
                {item.room}
              </p>
            </div>
          </div>
        </div>

        {item.rawNotes && (
          <div className="mt-2.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs">
            <p className="text-amber-800 dark:text-amber-300 font-semibold mb-0.5">
              Uwagi z systemu UEK:
            </p>
            <p className="font-medium text-amber-900 dark:text-amber-100">
              {item.rawNotes}
            </p>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Oznaczenie statusu zajęć (Apple Status Tag)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? opt.activeClass
                        : 'bg-slate-50 dark:bg-white/5 border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate leading-tight">{opt.label}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {status === 'rescheduled' && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-amber-900 dark:text-amber-200 mb-1">
                  Nowa data zjazdu
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={rescheduledToDate}
                    onChange={(e) => setRescheduledToDate(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 rounded-xl bg-white dark:bg-slate-900 border border-amber-500/30 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-amber-900 dark:text-amber-200 mb-1">
                  Nowa godzina
                </label>
                <div className="relative">
                  <Clock className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="time"
                    value={rescheduledToTime}
                    onChange={(e) => setRescheduledToTime(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 rounded-xl bg-white dark:bg-slate-900 border border-amber-500/30 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-amber-900 dark:text-amber-200 mb-1">
                  Nowa sala
                </label>
                <input
                  type="text"
                  value={rescheduledToRoom}
                  onChange={(e) => setRescheduledToRoom(e.target.value)}
                  placeholder="np. Paw. C 304"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-amber-500/30 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {status === 'room_changed' && (
            <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/25 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-purple-900 dark:text-purple-200 mb-1">
                  Poprzednia sala
                </label>
                <input
                  type="text"
                  value={previousRoom}
                  onChange={(e) => setPreviousRoom(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-purple-500/30 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-purple-900 dark:text-purple-200 mb-1">
                  Nowa sala docelowa
                </label>
                <input
                  type="text"
                  value={rescheduledToRoom}
                  onChange={(e) => setRescheduledToRoom(e.target.value)}
                  placeholder="np. Paw. G 412"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-purple-500/30 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Powód / opis zmiany (wyświetlany na kafelku zajęć)
            </label>
            <input
              type="text"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="np. Zajęcia odwołane przez prowadzącego / Przeniesione na kolejny zjazd"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-300/80 dark:border-white/15 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Własna notatka studencka (np. zakres materiału, link do MS Teams)
            </label>
            <textarea
              rows={2}
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              placeholder="Dodaj prywatną notatkę do tych zajęć..."
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-300/80 dark:border-white/15 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
            />
          </div>

          {/* Modal Footer with responsive buttons */}
          <div className="pt-3 border-t border-slate-200/70 dark:border-white/10 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {item.isCustomModified ? (
              <button
                type="button"
                onClick={() => {
                  onClearOverride(item.id);
                  onClose();
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Przywróć oryginał z UEK</span>
              </button>
            ) : (
              <div className="hidden sm:block" />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-300 transition-colors"
              >
                Anuluj
              </button>
              <button
                type="submit"
                style={{ backgroundColor: 'var(--apple-accent, #007AFF)' }}
                className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm hover:opacity-95 transition-opacity"
              >
                Zapisz oznaczenie
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
