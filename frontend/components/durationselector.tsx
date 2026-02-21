"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Preset {
  label: string;
  shortLabel: string;
  seconds: number;
}

interface DurationValue {
  type: "preset" | "custom";
  seconds: number;
  endDate: Date;
  presetKey?: string;
}

interface DurationSelectorProps {
  onChange?: (value: DurationValue) => void;
  defaultPreset?: string;
}

// ─── Presets ──────────────────────────────────────────────────────────────────
const PRESETS: Preset[] = [
  { label: "1 Hour",   shortLabel: "1h",  seconds: 3_600 },
  { label: "1 Day",    shortLabel: "1d",  seconds: 86_400 },
  { label: "1 Week",   shortLabel: "1w",  seconds: 604_800 },
  { label: "1 Month",  shortLabel: "1mo", seconds: 2_592_000 },
  { label: "3 Months", shortLabel: "3mo", seconds: 7_776_000 },
  { label: "1 Year",   shortLabel: "1yr", seconds: 31_536_000 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(seconds: number): string {
  if (seconds < 3600)   return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400)  return `${Math.round(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)}d`;
  if (seconds < 2592000) return `${Math.round(seconds / 604800)}w`;
  if (seconds < 31536000) return `${Math.round(seconds / 2592000)}mo`;
  return `${(seconds / 31536000).toFixed(1)}yr`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

// ─── Stellar Glass Calendar Modal ────────────────────────────────────────────
function CalendarModal({
  value,
  minDate,
  onSelect,
  onClose,
}: {
  value: Date | null;
  minDate: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
}) {
  const today = new Date();
  const initial = value && value > minDate ? value : minDate;
  const [viewYear,  setViewYear]  = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [selected,  setSelected]  = useState<Date | null>(value && value > minDate ? value : null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay    = getFirstDayOfMonth(viewYear, viewMonth);
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) =>
    i < firstDay ? null : i - firstDay + 1
  );

  const isBefore = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    return d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
  };

  const isSelected = (day: number) =>
    selected?.getFullYear() === viewYear &&
    selected?.getMonth()    === viewMonth &&
    selected?.getDate()     === day;

  const isToday = (day: number) =>
    today.getFullYear() === viewYear &&
    today.getMonth()    === viewMonth &&
    today.getDate()     === day;

  const handleDay = (day: number) => {
    if (isBefore(day)) return;
    const d = new Date(viewYear, viewMonth, day, 23, 59, 59);
    setSelected(d);
    onSelect(d);
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
    >
      {/* Modal */}
      <div
        ref={ref}
        className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-6 w-[340px] shadow-2xl"
        style={{
          boxShadow: "0 0 0 1px rgba(34,211,238,0.12), 0 32px 64px rgba(0,0,0,0.7), 0 0 80px rgba(34,211,238,0.06)",
          animation: "modalIn 0.2s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <style>{`
          @keyframes modalIn { from { opacity:0; transform:scale(0.94) translateY(8px) } to { opacity:1; transform:scale(1) translateY(0) } }
        `}</style>

        {/* Modal header */}
        <div className="flex items-center justify-between mb-5">
          <p className="font-body text-[10px] tracking-[0.15em] text-white/40 uppercase">Select End Date</p>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-xl border border-white/10 bg-white/[0.04] text-white/40 text-xs transition hover:bg-white/[0.08] hover:text-white/70 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="h-8 w-8 rounded-xl border border-white/10 bg-white/[0.03] text-white/50 text-sm transition hover:border-cyan-400/30 hover:text-cyan-400 flex items-center justify-center"
          >
            ‹
          </button>
          <p className="font-heading text-base text-white/90">
            {MONTHS[viewMonth]} <span className="text-white/40">{viewYear}</span>
          </p>
          <button
            onClick={nextMonth}
            className="h-8 w-8 rounded-xl border border-white/10 bg-white/[0.03] text-white/50 text-sm transition hover:border-cyan-400/30 hover:text-cyan-400 flex items-center justify-center"
          >
            ›
          </button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map((d) => (
            <div key={d} className="text-center font-body text-[10px] text-white/25 py-1 tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} />;
            const disabled = isBefore(day);
            const sel      = isSelected(day);
            const tod      = isToday(day);
            return (
              <button
                key={day}
                onClick={() => handleDay(day)}
                disabled={disabled}
                className={`
                  relative h-9 w-full rounded-xl font-body text-sm transition
                  ${disabled ? "text-white/15 cursor-not-allowed" : "cursor-pointer hover:bg-white/[0.06]"}
                  ${sel ? "text-black font-bold" : disabled ? "" : "text-white/70"}
                `}
                style={sel ? {
                  background: "linear-gradient(135deg, #22d3ee, #34d399)",
                  boxShadow: "0 0 16px rgba(34,211,238,0.5)",
                } : undefined}
              >
                {tod && !sel && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-cyan-400" />
                )}
                {day}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        {selected && (
          <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between">
            <p className="font-body text-xs text-white/40">
              Selected: <span className="text-cyan-400">{formatDate(selected)}</span>
            </p>
            <button
              onClick={() => { onSelect(selected); onClose(); }}
              className="rounded-xl bg-cyan-400 px-4 py-1.5 font-body text-xs font-bold text-black transition hover:bg-cyan-300"
            >
              Confirm →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Duration Selector ────────────────────────────────────────────────────────
export function DurationSelector({ onChange, defaultPreset = "1 Month" }: DurationSelectorProps) {
  const now = new Date();
  const defaultP = PRESETS.find(p => p.label === defaultPreset) ?? PRESETS[3];

  const [activePreset, setActivePreset] = useState<string | null>(defaultP.label);
  const [customDate,   setCustomDate]   = useState<Date | null>(null);
  const [showCal,      setShowCal]      = useState(false);

  const endDate = activePreset
    ? addSeconds(now, PRESETS.find(p => p.label === activePreset)!.seconds)
    : customDate ?? now;

  const seconds = activePreset
    ? PRESETS.find(p => p.label === activePreset)!.seconds
    : customDate ? Math.floor((customDate.getTime() - now.getTime()) / 1000) : 0;

  const notifyChange = useCallback((type: "preset" | "custom", secs: number, end: Date, key?: string) => {
    onChange?.({ type, seconds: secs, endDate: end, presetKey: key });
  }, [onChange]);

  const selectPreset = (p: Preset) => {
    setActivePreset(p.label);
    setCustomDate(null);
    notifyChange("preset", p.seconds, addSeconds(now, p.seconds), p.label);
  };

  const selectCustomDate = (d: Date) => {
    setCustomDate(d);
    setActivePreset(null);
    const secs = Math.floor((d.getTime() - now.getTime()) / 1000);
    notifyChange("custom", secs, d);
  };

  // Progress arc for visual feedback
  const maxSeconds = 31_536_000; // 1 year
  const arcPct = Math.min(seconds / maxSeconds, 1);
  const r = 28, cx = 34, cy = 34, sw = 3;
  const circ = 2 * Math.PI * r;
  const dash = arcPct * circ;

  return (
    <>
      {showCal && (
        <CalendarModal
          value={customDate}
          minDate={new Date(now.getTime() + 3600 * 1000)} // min: 1 hour from now
          onSelect={selectCustomDate}
          onClose={() => setShowCal(false)}
        />
      )}

      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl md:p-8 space-y-6">

        {/* Label */}
        <div>
          <p className="font-body text-xs tracking-[0.12em] text-white/60 uppercase">Stream Duration</p>
          <h2 className="font-heading mt-2 text-2xl md:text-3xl">How long should it stream?</h2>
          <p className="font-body mt-2 text-sm text-white/50">
            Choose a preset or set a custom end date.
          </p>
        </div>

        {/* Dial + chips row */}
        <div className="flex items-start gap-6">

          {/* Glass Dial arc */}
          <div
            className="flex-shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] p-3 flex flex-col items-center gap-1"
            style={{ minWidth: 68 }}
          >
            <svg width={68} height={68} viewBox="0 0 68 68">
              <defs>
                <linearGradient id="dialGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
                <filter id="dialGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              {/* Track */}
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sw} />
              {/* Fill */}
              {arcPct > 0 && (
                <circle
                  cx={cx} cy={cy} r={r} fill="none"
                  stroke="url(#dialGrad)" strokeWidth={sw}
                  strokeDasharray={`${dash} ${circ}`}
                  strokeDashoffset={circ / 4}
                  strokeLinecap="round"
                  filter="url(#dialGlow)"
                  style={{ transition: "stroke-dasharray 0.4s cubic-bezier(0.4,0,0.2,1)" }}
                />
              )}
              {/* Center text */}
              <text x={cx} y={cy - 3} textAnchor="middle" fill="white" fontSize={11} fontWeight={700}>
                {arcPct > 0 ? formatDuration(seconds) : "—"}
              </text>
              <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={7} letterSpacing="0.08em">
                DURATION
              </text>
            </svg>
          </div>

          {/* Preset chips grid */}
          <div className="flex-1">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => {
                const isActive = activePreset === p.label;
                return (
                  <button
                    key={p.label}
                    onClick={() => selectPreset(p)}
                    className={`
                      relative rounded-2xl border px-4 py-2 font-body text-sm font-bold transition-all duration-200
                      ${isActive
                        ? "border-cyan-400/50 text-cyan-400"
                        : "border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/80 hover:bg-white/[0.05]"
                      }
                    `}
                    style={isActive ? {
                      background: "rgba(34,211,238,0.08)",
                      boxShadow: "0 0 16px rgba(34,211,238,0.2), inset 0 0 16px rgba(34,211,238,0.04)",
                    } : undefined}
                  >
                    {/* Glow ring on active */}
                    {isActive && (
                      <span
                        className="absolute inset-0 rounded-2xl"
                        style={{
                          background: "radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.15) 0%, transparent 70%)",
                          pointerEvents: "none",
                        }}
                      />
                    )}
                    <span className="relative">{p.label}</span>
                  </button>
                );
              })}

              {/* Custom date trigger */}
              <button
                onClick={() => setShowCal(true)}
                className={`
                  relative rounded-2xl border px-4 py-2 font-body text-sm font-bold transition-all duration-200
                  ${activePreset === null && customDate
                    ? "border-cyan-400/50 text-cyan-400"
                    : "border-white/10 bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/80 hover:bg-white/[0.05]"
                  }
                `}
                style={activePreset === null && customDate ? {
                  background: "rgba(34,211,238,0.08)",
                  boxShadow: "0 0 16px rgba(34,211,238,0.2), inset 0 0 16px rgba(34,211,238,0.04)",
                } : undefined}
              >
                {activePreset === null && customDate ? (
                  <span className="relative">{formatDate(customDate)}</span>
                ) : (
                  <span className="relative flex items-center gap-1.5">
                    <span className="text-white/30">⊞</span> Custom Date
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Summary bar */}
        {seconds > 0 && (
          <div
            className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 flex flex-wrap items-center justify-between gap-3"
            style={{ animation: "fadeUp 0.25s ease" }}
          >
            <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:translateY(0) } }`}</style>
            <div className="flex items-center gap-3">
              {/* Live dot */}
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
              </span>
              <div>
                <p className="font-body text-[10px] tracking-widest text-white/35 uppercase">Stream ends</p>
                <p className="font-heading text-base text-white/90">{formatDate(endDate)}</p>
              </div>
            </div>

            <div className="flex gap-6">
              <div>
                <p className="font-body text-[10px] tracking-widest text-white/35 uppercase">Duration</p>
                <p className="font-body text-sm font-bold text-cyan-400">{formatDuration(seconds)}</p>
              </div>
              <div>
                <p className="font-body text-[10px] tracking-widest text-white/35 uppercase">Type</p>
                <p className="font-body text-sm font-bold text-white/70 capitalize">
                  {activePreset ? "Preset" : "Custom"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Demo wrapper ─────────────────────────────────────────────────────────────
export default function DurationSelectorDemo() {
  const [value, setValue] = useState<DurationValue | null>(null);

  return (
    <div
      className="min-h-screen p-6 md:p-10 flex flex-col items-center justify-center gap-6"
      style={{ background: "#080d18" }}
    >
      <div className="w-full max-w-xl">
        <DurationSelector onChange={setValue} defaultPreset="1 Month" />
      </div>

      {/* Debug output */}
      {value && (
        <div className="w-full max-w-xl rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 font-body text-xs text-white/40">
          <p className="text-[10px] tracking-widest text-white/25 uppercase mb-2">onChange payload</p>
          <pre className="text-white/50 leading-relaxed">
{JSON.stringify({
  type: value.type,
  seconds: value.seconds,
  duration: formatDuration(value.seconds),
  endDate: value.endDate.toISOString(),
  presetKey: value.presetKey ?? null,
}, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Re-export types ──────────────────────────────────────────────────────────
export type { DurationValue, DurationSelectorProps };