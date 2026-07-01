'use client'
// GlobalFilterBar.tsx — unified date range + all filters in one bar
// Replaces both DateRangeBar and FilterBar
// Usage: <GlobalFilterBar filters={filters} onChange={setFilters} zones={zones} wards={wards} dark={dark} />

import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { Calendar, ChevronDown, X, SlidersHorizontal } from 'lucide-react'
import { getTokens } from '@/lib/dashboardTheme'
import { type DashboardFilters } from '@/components/dashboard'

// ── Date helpers ─────────────────────────────────────────────────────────────
function toISO(d: Date) { return d.toISOString().slice(0, 10) }
function daysAgo(n: number) { return toISO(new Date(Date.now() - n * 86_400_000)) }
function todayISO() { return toISO(new Date()) }
function ytdStart() { return `${new Date().getFullYear()}-01-01` }

type Preset = '1D' | '7D' | '30D' | '90D' | 'YTD' | 'CUSTOM'

const PRESETS: { id: Preset; label: string; from: () => string; to: () => string }[] = [
  { id: '1D',     label: 'Today',        from: todayISO,          to: todayISO },
  { id: '7D',     label: '7 days',       from: () => daysAgo(6),  to: todayISO },
  { id: '30D',    label: '30 days',      from: () => daysAgo(29), to: todayISO },
  { id: '90D',    label: '90 days',      from: () => daysAgo(89), to: todayISO },
  { id: 'CUSTOM', label: 'Custom',       from: () => '',          to: () => '' },
]

const QUICK_CUSTOMS = [
  { label: '14 days', from: daysAgo(13) },
  { label: '60 days', from: daysAgo(59) },
  { label: '6 months', from: daysAgo(179) },
]

function detectPreset(from: string, to: string): Preset {
  const today = todayISO()
  if (to !== today) return 'CUSTOM'
  if (from === today) return '1D'
  if (from === daysAgo(6)) return '7D'
  if (from === daysAgo(29)) return '30D'
  if (from === daysAgo(89)) return '90D'
  return 'CUSTOM'
}

function formatRange(from: string, to: string): string {
  const fmt = (s: string) => {
    if (!s) return ''
    return new Date(s + 'T00:00:00Z').toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    })
  }
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`
}

function daysDiff(from: string, to: string) {
  if (!from || !to) return 0
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1
}

// ── Props ────────────────────────────────────────────────────────────────────
interface GlobalFilterBarProps {
  filters: DashboardFilters
  onChange: (f: DashboardFilters) => void
  zones: { id: string; name: string }[]
  wards: { id: string; name: string }[]
  dark: boolean
}

export default function GlobalFilterBar({ filters, onChange, zones, wards, dark }: GlobalFilterBarProps) {
  const T = getTokens(dark)
  const [dateOpen, setDateOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [tempFrom, setTempFrom] = useState(filters.dateFrom)
  const [tempTo, setTempTo] = useState(filters.dateTo)
  const dateRef = useRef<HTMLDivElement>(null)
  const filtersRef = useRef<HTMLDivElement>(null)

  const activePreset = detectPreset(filters.dateFrom, filters.dateTo)
  const days = daysDiff(filters.dateFrom, filters.dateTo)
  const activeFilterCount = [filters.zoneId, filters.wardId, filters.status, filters.pointType].filter(Boolean).length

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) setDateOpen(false)
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setFiltersOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function applyPreset(preset: typeof PRESETS[number]) {
    if (preset.id === 'CUSTOM') {
      setTempFrom(filters.dateFrom)
      setTempTo(filters.dateTo)
      setDateOpen(true)
      return
    }
    onChange({ ...filters, dateFrom: preset.from(), dateTo: preset.to() })
    setDateOpen(false)
  }

  function applyCustom() {
    if (tempFrom && tempTo && tempFrom <= tempTo) {
      onChange({ ...filters, dateFrom: tempFrom, dateTo: tempTo })
      setDateOpen(false)
    }
  }

  function setFilter(key: keyof DashboardFilters, value: string) {
    onChange({ ...filters, [key]: value })
  }

  function clearFilters() {
    onChange({ ...filters, zoneId: '', wardId: '', status: '', pointType: '' })
  }

  const selectStyle: CSSProperties = {
    background: dark ? T.card : '#fff',
    border: `1px solid ${T.cardBorder}`,
    borderRadius: 8,
    padding: '7px 10px',
    color: T.textPrimary,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    outline: 'none',
    cursor: 'pointer',
    colorScheme: dark ? 'dark' : 'light',
    minWidth: 130,
  }

  return (
    <div
      className="flex items-center gap-2 flex-wrap rounded-2xl px-3 py-2"
      style={{ background: T.surface, border: `1px solid ${T.cardBorder}` }}
    >

      {/* ── DATE RANGE SECTION ── */}
      <div ref={dateRef} className="relative flex items-center gap-1.5 flex-wrap">

        {/* Current range display button */}
        <button
          onClick={() => { setDateOpen(o => !o); setFiltersOpen(false) }}
          className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all"
          style={{
            background: dateOpen ? T.accentDim : 'transparent',
            border: `1px solid ${dateOpen ? T.accentBorder : 'transparent'}`,
            color: T.textPrimary,
            cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" style={{ color: T.accent }} />
          <span>{formatRange(filters.dateFrom, filters.dateTo)}</span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
            style={{ background: T.accentDim, color: T.accent }}
          >
            {days}d
          </span>
          <ChevronDown
            className="h-3 w-3 transition-transform"
            style={{ color: T.textMuted, transform: dateOpen ? 'rotate(180deg)' : 'none' }}
          />
        </button>

        {/* Preset pills */}
        <div className="flex items-center gap-1">
          {PRESETS.map(preset => {
            const isActive = activePreset === preset.id
            return (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95"
                style={{
                  background: isActive ? T.accent : 'transparent',
                  color: isActive ? '#fff' : T.textSecondary,
                  border: `1px solid ${isActive ? T.accent : T.cardBorder}`,
                  cursor: 'pointer',
                }}
              >
                {preset.label}
              </button>
            )
          })}
        </div>

        {/* Date picker dropdown */}
        {dateOpen && (
          <div
            className="absolute left-0 top-full mt-2 z-50 rounded-2xl shadow-2xl p-4"
            style={{ background: T.card, border: `1px solid ${T.cardBorder}`, minWidth: 300 }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold" style={{ color: T.textPrimary }}>Custom date range</p>
              <button
                onClick={() => setDateOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-lg"
                style={{ background: T.surface, color: T.textMuted, border: `1px solid ${T.cardBorder}`, cursor: 'pointer' }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>From</label>
                <input
                  type="date"
                  value={tempFrom}
                  max={tempTo || todayISO()}
                  onChange={e => setTempFrom(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-xs outline-none"
                  style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>To</label>
                <input
                  type="date"
                  value={tempTo}
                  min={tempFrom}
                  max={todayISO()}
                  onChange={e => setTempTo(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-xs outline-none"
                  style={{ background: T.surface, border: `1px solid ${T.cardBorder}`, color: T.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
              {QUICK_CUSTOMS.map(s => (
                <button
                  key={s.label}
                  onClick={() => { setTempFrom(s.from); setTempTo(todayISO()) }}
                  className="rounded-full px-2.5 py-1 text-[10px] font-semibold transition"
                  style={{ background: T.surface, color: T.textSecondary, border: `1px solid ${T.cardBorder}`, cursor: 'pointer' }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setDateOpen(false)}
                className="flex-1 rounded-xl px-4 py-2 text-xs font-semibold"
                style={{ background: T.surface, color: T.textSecondary, border: `1px solid ${T.cardBorder}`, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={applyCustom}
                disabled={!tempFrom || !tempTo || tempFrom > tempTo}
                className="flex-1 rounded-xl px-4 py-2 text-xs font-semibold active:scale-95 disabled:opacity-40"
                style={{ background: T.accent, color: '#fff', border: 'none', cursor: !tempFrom || !tempTo || tempFrom > tempTo ? 'not-allowed' : 'pointer' }}
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── DIVIDER ── */}
      <div className="h-6 w-px mx-1 flex-shrink-0" style={{ background: T.cardBorder }} />

      {/* ── FILTERS SECTION ── */}
      <div ref={filtersRef} className="relative flex items-center gap-1.5">

        {/* Filters toggle button */}
        <button
          onClick={() => { setFiltersOpen(o => !o); setDateOpen(false) }}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-all"
          style={{
            background: filtersOpen || activeFilterCount > 0 ? T.accentDim : 'transparent',
            border: `1px solid ${filtersOpen || activeFilterCount > 0 ? T.accentBorder : T.cardBorder}`,
            color: activeFilterCount > 0 ? T.accent : T.textSecondary,
            cursor: 'pointer',
          }}
        >
          <SlidersHorizontal className="h-3 w-3" />
          Filters
          {activeFilterCount > 0 && (
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black"
              style={{ background: T.accent, color: '#fff' }}
            >
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className="h-3 w-3 transition-transform"
            style={{ color: T.textMuted, transform: filtersOpen ? 'rotate(180deg)' : 'none' }}
          />
        </button>

        {/* Active filter chips — shown inline when filters are set */}
        {activeFilterCount > 0 && !filtersOpen && (
          <div className="flex items-center gap-1 flex-wrap">
            {filters.zoneId && zones.find(z => z.id === filters.zoneId) && (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: T.accentDim, color: T.accent, border: `1px solid ${T.accentBorder}` }}
              >
                {zones.find(z => z.id === filters.zoneId)?.name}
                <button onClick={() => setFilter('zoneId', '')} style={{ cursor: 'pointer', display: 'flex' }}>
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {filters.wardId && wards.find(w => w.id === filters.wardId) && (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: T.accentDim, color: T.accent, border: `1px solid ${T.accentBorder}` }}
              >
                {wards.find(w => w.id === filters.wardId)?.name}
                <button onClick={() => setFilter('wardId', '')} style={{ cursor: 'pointer', display: 'flex' }}>
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {filters.status && (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: T.accentDim, color: T.accent, border: `1px solid ${T.accentBorder}` }}
              >
                {filters.status.replace('_', ' ')}
                <button onClick={() => setFilter('status', '')} style={{ cursor: 'pointer', display: 'flex' }}>
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {filters.pointType && (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: T.accentDim, color: T.accent, border: `1px solid ${T.accentBorder}` }}
              >
                {filters.pointType}
                <button onClick={() => setFilter('pointType', '')} style={{ cursor: 'pointer', display: 'flex' }}>
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            <button
              onClick={clearFilters}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full transition hover:opacity-70"
              style={{ color: T.textMuted, cursor: 'pointer', border: `1px solid ${T.cardBorder}` }}
            >
              Clear all
            </button>
          </div>
        )}

        {/* Filters dropdown */}
        {filtersOpen && (
          <div
            className="absolute left-0 top-full mt-2 z-50 rounded-2xl shadow-2xl p-4"
            style={{ background: T.card, border: `1px solid ${T.cardBorder}`, minWidth: 340 }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold" style={{ color: T.textPrimary }}>Filter data</p>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="text-[10px] font-semibold px-2 py-1 rounded-lg transition hover:opacity-70"
                  style={{ color: T.textMuted, cursor: 'pointer', border: `1px solid ${T.cardBorder}` }}
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
             <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>Zone</label>
                <select
                  style={selectStyle}
                  className="w-full"
                  value={filters.zoneId}
                  onChange={e => setFilter('zoneId', e.target.value)}
                >
                  <option value="">All zones</option>
                  {[...zones].sort((a, b) => a.name.localeCompare(b.name)).map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>Ward</label>
                <select
                  style={selectStyle}
                  className="w-full"
                  value={filters.wardId}
                  onChange={e => setFilter('wardId', e.target.value)}
                >
                  <option value="">All wards</option>
                  {[...wards].sort((a, b) => a.name.localeCompare(b.name)).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>Status</label>
                <select
                  style={selectStyle}
                  className="w-full"
                  value={filters.status}
                  onChange={e => setFilter('status', e.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="requires_action">Requires action</option>
                  <option value="action_taken">Action taken</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>Point type</label>
                <select
                  style={selectStyle}
                  className="w-full"
                  value={filters.pointType}
                  onChange={e => setFilter('pointType', e.target.value)}
                >
                  <option value="">All types</option>
                  <option value="feeder">Feeder</option>
                  <option value="chronic">Chronic</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => setFiltersOpen(false)}
              className="w-full mt-3 rounded-xl py-2 text-xs font-semibold transition active:scale-95"
              style={{ background: T.accent, color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Apply filters
            </button>
          </div>
        )}
      </div>
    </div>
  )
}