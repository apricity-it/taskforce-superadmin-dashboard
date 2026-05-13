/**
 * ExcelExports.tsx
 *
 * Drop this file into:  components/ExcelExports.tsx
 *
 * Usage inside your dashboard (SimpleDashboard.tsx / index.tsx):
 * ──────────────────────────────────────────────────────────────
 *  1.  Add the import at the top:
 *        import ExcelExports from '@/components/ExcelExports'
 *
 *  2.  Paste this block just before the closing </div> of the main white card
 *      (right after the last <HR /> and Quick Actions section):
 *
 *        <HR />
 *        <div className="p-5">
 *          <CardHeader
 *            icon={FileText}
 *            iconBg="bg-gradient-to-br from-teal-600 to-blue-600"
 *            iconColor="text-white"
 *            solid
 *            title="Export to Excel"
 *            sub="Download feederpoint & trip data as .xlsx"
 *          />
 *          <ExcelExports />
 *        </div>
 *
 *  3.  Make sure FileText is already imported from lucide-react — it is,
 *      per your existing dashboard code.
 *
 * Dependencies:
 *   npm install xlsx
 *   (xlsx is already bundled in your .next/static/chunks — just add to package.json)
 */

import { useState, useCallback } from 'react'
import { DataService, ComplianceReport, FeederPoint, User } from '@/lib/dataService'
import { Download, Calendar, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import * as XLSX from 'xlsx'

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Firestore timestamp | Date | string  →  JS Date | null */
function toDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value?.toDate === 'function') return value.toDate()
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000)
  if (typeof value === 'string') {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

/** Format JS Date → DD/MM/YYYY */
function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** Format JS Date → HH:MM */
function fmtTime(d: Date | null): string {
  if (!d) return '—'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** YYYY-MM-DD string → start-of-day Date */
function startOf(dateStr: string): Date {
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  return d
}

/** YYYY-MM-DD string → end-of-day Date */
function endOf(dateStr: string): Date {
  const d = new Date(dateStr)
  d.setHours(23, 59, 59, 999)
  return d
}

// ─── Excel styling helpers (openpyxl-style via SheetJS cell styles) ───────────

const TEAL   = '0F766E'
const NAVY   = '1E3A8A'
const GREEN  = '15803D'
const RED    = '991B1B'
const WHITE  = 'FFFFFF'
const LIGHT_GRAY = 'F8FAFC'
const AMBER  = 'B45309'

interface CellStyle {
  font?: { bold?: boolean; color?: { rgb: string }; sz?: number; name?: string }
  fill?: { fgColor: { rgb: string }; patternType: string }
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean }
  border?: {
    top?: { style: string; color: { rgb: string } }
    bottom?: { style: string; color: { rgb: string } }
    left?: { style: string; color: { rgb: string } }
    right?: { style: string; color: { rgb: string } }
  }
}

function headerStyle(bgHex: string): CellStyle {
  const border = { style: 'thin', color: { rgb: 'CCCCCC' } }
  return {
    font: { bold: true, color: { rgb: WHITE }, sz: 10, name: 'Arial' },
    fill: { fgColor: { rgb: bgHex }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: { top: border, bottom: border, left: border, right: border },
  }
}

function cellStyle(zebra: boolean, align: 'left' | 'center' | 'right' = 'left'): CellStyle {
  const border = { style: 'thin', color: { rgb: 'E2E8F0' } }
  return {
    font: { sz: 9, name: 'Arial', color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: zebra ? LIGHT_GRAY : WHITE }, patternType: 'solid' },
    alignment: { horizontal: align, vertical: 'center' },
    border: { top: border, bottom: border, left: border, right: border },
  }
}

function statusStyle(status: string, zebra: boolean): CellStyle {
  const base = cellStyle(zebra, 'center')
  const colors: Record<string, { bg: string; fg: string }> = {
    'Completed':           { bg: 'DCFCE7', fg: '15803D' },
    'Partially Completed': { bg: 'FEF9C3', fg: '854D0E' },
    'Not Started':         { bg: 'FEE2E2', fg: '991B1B' },
    'Active':              { bg: 'DCFCE7', fg: '15803D' },
    'Inactive':            { bg: 'FEE2E2', fg: '991B1B' },
  }
  const c = colors[status]
  if (c) {
    return {
      ...base,
      font: { ...base.font, bold: true, color: { rgb: c.fg } },
      fill: { fgColor: { rgb: c.bg }, patternType: 'solid' },
    }
  }
  return base
}

/** Apply styles to every cell in a worksheet */
function applyStyles(
  ws: XLSX.WorkSheet,
  headers: string[],
  rows: Record<string, any>[],
  headerBg: string,
  statusCol?: string,
) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

  // Header row
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[addr]) continue
    ws[addr].s = headerStyle(headerBg)
  }

  // Data rows
  for (let r = 1; r <= range.e.r; r++) {
    const zebra = r % 2 === 0
    const rowData = rows[r - 1] || {}
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      if (!ws[addr]) continue
      const key = headers[c]
      const val = rowData[key]

      if (key === statusCol) {
        ws[addr].s = statusStyle(String(val ?? ''), zebra)
      } else if (key === 'S.No') {
        ws[addr].s = cellStyle(zebra, 'center')
      } else {
        ws[addr].s = cellStyle(zebra)
      }
    }
  }
}

/** Auto-fit column widths */
function autoWidth(ws: XLSX.WorkSheet, headers: string[], rows: Record<string, any>[]) {
  ws['!cols'] = headers.map(h => {
    const max = Math.max(h.length, ...rows.map(r => String(r[h] ?? '').length))
    return { wch: Math.min(max + 3, 42) }
  })
}

/** Freeze top row */
function freezeTop(ws: XLSX.WorkSheet) {
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }
}

// ─── Export 1: Trip Reports ────────────────────────────────────────────────────

async function buildTripReportsWorkbook(
  startStr: string,
  endStr: string,
): Promise<XLSX.WorkBook> {
  const start = startOf(startStr)
  const end   = endOf(endStr)

  // Fetch all data in parallel
  const [allReports, allFeederPoints, allUsers] = await Promise.all([
    DataService.getAllComplianceReports(),
    DataService.getAllFeederPoints(),
    DataService.getAllUsers(),
  ])

  // Build lookup maps
  const fpMap = new Map<string, FeederPoint>()
  allFeederPoints.forEach(fp => {
    fpMap.set(fp.id, fp)
    fpMap.set(fp.name, fp) // fallback by name
  })

  const userMap = new Map<string, User>()
  allUsers.forEach(u => userMap.set(u.id, u))

  // Filter to date range
  const inRange = allReports.filter(r => {
    const d = toDate(r.submittedAt) ?? toDate(r.createdAt)
    return d && d >= start && d <= end
  })

  // Group: date → feederPointId → trip1/2/3
  type DayFpKey = string // `${YYYY-MM-DD}||${fpId}`
  const grouped = new Map<DayFpKey, {
    date: Date
    fp: FeederPoint | undefined
    fpName: string
    assignedTo: string
    trips: (ComplianceReport | null)[]
  }>()

  inRange.forEach(r => {
    const date = toDate(r.submittedAt) ?? toDate(r.createdAt)
    if (!date) return

    const yyyy = date.getFullYear()
    const mm   = String(date.getMonth() + 1).padStart(2, '0')
    const dd   = String(date.getDate()).padStart(2, '0')
    const dateKey = `${yyyy}-${mm}-${dd}`

    const fpId   = r.feederPointId || r.feederPointName || 'unknown'
    const key: DayFpKey = `${dateKey}||${fpId}`

    if (!grouped.has(key)) {
      const fp = fpMap.get(r.feederPointId) ?? fpMap.get(r.feederPointName)
      const assignedUser = fp?.assignedUserId ? userMap.get(fp.assignedUserId) : null
      const assignedTo =
        assignedUser?.name ??
        r.userName ??
        (r.userId ? userMap.get(r.userId)?.name : null) ??
        '—'

      grouped.set(key, {
        date,
        fp,
        fpName: r.feederPointName || fp?.name || fpId,
        assignedTo,
        trips: [null, null, null],
      })
    }

    const entry = grouped.get(key)!
    const tripNum = r.tripNumber // 1 | 2 | 3
    if (tripNum >= 1 && tripNum <= 3) {
      entry.trips[tripNum - 1] = r
    }
  })

  // Sort by date then feederpoint name
  const sorted = Array.from(grouped.values()).sort((a, b) => {
    const dt = a.date.getTime() - b.date.getTime()
    return dt !== 0 ? dt : a.fpName.localeCompare(b.fpName)
  })

  // Build rows
  const headers = [
    'S.No',
    'Date (DD/MM/YYYY)',
    'Feederpoint',
    'Assigned To',
    'Trip 1 (Submission Time)',
    'Trip 2 (Submission Time)',
    'Trip 3 (Submission Time)',
    'Status',
  ]

  const rows: Record<string, string | number>[] = sorted.map((entry, i) => {
    const t1 = entry.trips[0] ? toDate(entry.trips[0].submittedAt) : null
    const t2 = entry.trips[1] ? toDate(entry.trips[1].submittedAt) : null
    const t3 = entry.trips[2] ? toDate(entry.trips[2].submittedAt) : null

    const completed = [t1, t2, t3].filter(Boolean).length
    const status =
      completed === 3 ? 'Completed' :
      completed === 0 ? 'Not Started' :
      'Partially Completed'

    return {
      'S.No':                      i + 1,
      'Date (DD/MM/YYYY)':         fmtDate(entry.date),
      'Feederpoint':               entry.fpName,
      'Assigned To':               entry.assignedTo,
      'Trip 1 (Submission Time)':  fmtTime(t1),
      'Trip 2 (Submission Time)':  fmtTime(t2),
      'Trip 3 (Submission Time)':  fmtTime(t3),
      'Status':                    status,
    }
  })

  const wb = XLSX.utils.book_new()

  // ── Main sheet
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}], { header: headers })
  autoWidth(ws, headers, rows)
  freezeTop(ws)
  ws['!rows'] = [{ hpt: 30 }] // taller header row
  applyStyles(ws, headers, rows, TEAL, 'Status')
  XLSX.utils.book_append_sheet(wb, ws, 'Trip Reports')

  // ── Summary sheet
  const total      = rows.length
  const completed  = rows.filter(r => r['Status'] === 'Completed').length
  const partial    = rows.filter(r => r['Status'] === 'Partially Completed').length
  const notStarted = rows.filter(r => r['Status'] === 'Not Started').length

  const summaryHeaders = ['Metric', 'Value']
  const summaryRows = [
    { Metric: 'Date Range',              Value: `${fmtDate(start)} → ${fmtDate(end)}` },
    { Metric: 'Total Feederpoint-Days',  Value: total },
    { Metric: 'Completed',               Value: completed },
    { Metric: 'Partially Completed',     Value: partial },
    { Metric: 'Not Started',             Value: notStarted },
    { Metric: 'Completion Rate',         Value: total ? `${Math.round((completed / total) * 100)}%` : '—' },
  ]

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows, { header: summaryHeaders })
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 30 }]
  wsSummary['!rows'] = [{ hpt: 28 }]
  freezeTop(wsSummary)
  applyStyles(wsSummary, summaryHeaders, summaryRows, GREEN)
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  return wb
}

// ─── Export 2: Feederpoint Status ─────────────────────────────────────────────

async function buildFeederStatusWorkbook(): Promise<XLSX.WorkBook> {
  const [allFeederPoints, allReports, allUsers] = await Promise.all([
    DataService.getAllFeederPoints(),
    DataService.getAllComplianceReports(),
    DataService.getAllUsers(),
  ])

  const userMap = new Map<string, User>()
  allUsers.forEach(u => userMap.set(u.id, u))

  // Latest report date per feederpoint
  const latestReport = new Map<string, Date>()
  const reportCount  = new Map<string, number>()

  allReports.forEach(r => {
    const fpId = r.feederPointId || r.feederPointName || ''
    if (!fpId) return
    const d = toDate(r.submittedAt) ?? toDate(r.createdAt)
    if (!d) return
    if (!latestReport.has(fpId) || d > latestReport.get(fpId)!) {
      latestReport.set(fpId, d)
    }
    reportCount.set(fpId, (reportCount.get(fpId) ?? 0) + 1)
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const headers = [
    'S.No',
    'Feederpoint Name',
    'Type',
    'Assigned To',
    'Total Reports',
    'Last Report Date',
    'Days Since Last Report',
    'Activity Status',
  ]

  const allRows: Record<string, string | number>[] = allFeederPoints
    .filter(fp => !fp.isEliminated)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((fp, i) => {
      const assignedUser = fp.assignedUserId ? userMap.get(fp.assignedUserId) : null
      const assignedTo   = assignedUser?.name ?? '—'

      const fpId        = fp.id || fp.name
      const lastDate    = latestReport.get(fpId) ?? latestReport.get(fp.name) ?? null
      const count       = (reportCount.get(fpId) ?? 0) + (reportCount.get(fp.name) ?? 0)

      const daysSince = lastDate
        ? Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
        : 999

      // Active = has received a report in the last 3 days
      const isActive = daysSince <= 3 && lastDate !== null

      return {
        'S.No':                    i + 1,
        'Feederpoint Name':        fp.name,
        'Type':                    fp.type === 'chronic' ? 'Chronic' : 'Feeder',
        'Assigned To':             assignedTo,
        'Total Reports':           count,
        'Last Report Date':        fmtDate(lastDate),
        'Days Since Last Report':  lastDate ? daysSince : '—',
        'Activity Status':         isActive ? 'Active' : 'Inactive',
      }
    })

  const activeRows   = allRows.filter(r => r['Activity Status'] === 'Active')
  const inactiveRows = allRows.filter(r => r['Activity Status'] === 'Inactive')

  const wb = XLSX.utils.book_new()

  function makeSheet(
    rows: Record<string, string | number>[],
    hdrBg: string,
    sheetName: string,
  ) {
    const numbered = rows.map((r, i) => ({ ...r, 'S.No': i + 1 }))
    const ws = XLSX.utils.json_to_sheet(numbered.length ? numbered : [{}], { header: headers })
    autoWidth(ws, headers, numbered)
    freezeTop(ws)
    ws['!rows'] = [{ hpt: 30 }]
    applyStyles(ws, headers, numbered, hdrBg, 'Activity Status')
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  makeSheet(allRows,      NAVY,  'All Feederpoints')
  makeSheet(activeRows,   GREEN, 'Active')
  makeSheet(inactiveRows, RED,   'Inactive')

  // Summary sheet
  const summaryHeaders = ['Metric', 'Count']
  const summaryRows = [
    { Metric: 'Total Feederpoints',  Count: allRows.length },
    { Metric: 'Active',              Count: activeRows.length },
    { Metric: 'Inactive',            Count: inactiveRows.length },
    { Metric: 'Activity Rate',       Count: allRows.length ? `${Math.round((activeRows.length / allRows.length) * 100)}%` : '—' },
    { Metric: 'Generated On',        Count: fmtDate(new Date()) },
  ]
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows, { header: summaryHeaders })
  wsSummary['!cols'] = [{ wch: 26 }, { wch: 20 }]
  wsSummary['!rows'] = [{ hpt: 28 }]
  freezeTop(wsSummary)
  applyStyles(wsSummary, summaryHeaders, summaryRows, AMBER)
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  return wb
}

// ─── UI sub-components ────────────────────────────────────────────────────────

type Status = 'idle' | 'loading' | 'done' | 'error'

function ExportCard({
  title,
  description,
  accentColor,
  badgeLabel,
  columnTags,
  children,
  onDownload,
  fileName,
}: {
  title: string
  description: string
  accentColor: string
  badgeLabel: string
  columnTags: { label: string; color: string }[]
  children?: React.ReactNode
  onDownload: () => Promise<void>
  fileName: string
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [msg, setMsg] = useState('')

  const handle = useCallback(async () => {
    setStatus('loading')
    setMsg('')
    try {
      await onDownload()
      setStatus('done')
      setMsg(`✓ Downloaded: ${fileName}`)
      setTimeout(() => setStatus('idle'), 5000)
    } catch (e: any) {
      setStatus('error')
      setMsg(e?.message ?? 'Download failed. Please try again.')
    }
  }, [onDownload, fileName])

  const isLoading = status === 'loading'

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      {/* header stripe */}
      <div className={`h-1 w-full ${accentColor}`} />

      <div className="p-4">
        {/* title row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[13px] font-semibold text-gray-800">{title}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{description}</p>
          </div>
          <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50
                           px-2.5 py-0.5 text-[10px] font-semibold text-gray-500">
            {badgeLabel}
          </span>
        </div>

        {/* extra UI (date pickers etc.) */}
        {children}

        {/* column preview */}
        <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Columns in this export
          </p>
          <div className="flex flex-wrap gap-1.5">
            {columnTags.map(t => (
              <span key={t.label}
                className="rounded-md px-2 py-0.5 text-[10px] font-medium"
                style={{ background: t.color + '22', color: t.color }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>

        {/* feedback */}
        {status === 'done' && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-100
                          bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            {msg}
          </div>
        )}
        {status === 'error' && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-100
                          bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {msg}
          </div>
        )}

        {/* download button */}
        <button
          onClick={handle}
          disabled={isLoading}
          className={`flex w-full items-center justify-center gap-2 rounded-xl
                      py-2.5 text-[12px] font-semibold text-white transition-all
                      active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed
                      ${accentColor.replace('bg-gradient-to-r', 'bg-gradient-to-br')}`}
        >
          {isLoading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Download className="h-4 w-4" />}
          {isLoading ? 'Generating Excel…' : `Download ${title} (.xlsx)`}
        </button>
      </div>
    </div>
  )
}

// ─── Main exported component ──────────────────────────────────────────────────

export default function ExcelExports() {
  const [e1Start, setE1Start] = useState('')
  const [e1End,   setE1End]   = useState('')
  const [e1Err,   setE1Err]   = useState('')

  const handleTripDownload = useCallback(async () => {
    setE1Err('')
    if (!e1Start || !e1End) {
      const err = 'Please select both From and To dates.'
      setE1Err(err)
      throw new Error(err)
    }
    if (new Date(e1Start) > new Date(e1End)) {
      const err = '"From" date must be before "To" date.'
      setE1Err(err)
      throw new Error(err)
    }
    const wb = await buildTripReportsWorkbook(e1Start, e1End)
    XLSX.writeFile(wb, `Trip_Reports_${e1Start}_to_${e1End}.xlsx`)
  }, [e1Start, e1End])

  const handleStatusDownload = useCallback(async () => {
    const wb = await buildFeederStatusWorkbook()
    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `Feederpoint_Status_${today}.xlsx`)
  }, [])

  const tripFileName    = e1Start && e1End ? `Trip_Reports_${e1Start}_to_${e1End}.xlsx` : 'Trip_Reports.xlsx'
  const statusFileName  = `Feederpoint_Status_${new Date().toISOString().slice(0, 10)}.xlsx`

  const tripCols = [
    { label: 'S.No',             color: '#0c4a6e' },
    { label: 'Date (DD/MM/YYYY)',color: '#0c4a6e' },
    { label: 'Feederpoint',      color: '#0c4a6e' },
    { label: 'Assigned To',      color: '#0c4a6e' },
    { label: 'Trip 1 (Time)',    color: '#713f12' },
    { label: 'Trip 2 (Time)',    color: '#713f12' },
    { label: 'Trip 3 (Time)',    color: '#713f12' },
    { label: 'Status',           color: '#831843' },
  ]

  const statusCols = [
    { label: 'S.No',                   color: '#0c4a6e' },
    { label: 'Feederpoint Name',       color: '#0c4a6e' },
    { label: 'Type',                   color: '#0c4a6e' },
    { label: 'Assigned To',            color: '#0c4a6e' },
    { label: 'Total Reports',          color: '#14532d' },
    { label: 'Last Report Date',       color: '#14532d' },
    { label: 'Days Since Last Report', color: '#14532d' },
    { label: 'Activity Status',        color: '#831843' },
  ]

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">

      {/* ── Export 1: Trip Reports ── */}
      <ExportCard
        title="Trip Reports"
        description="Daily feederpoint trip submission log with status"
        accentColor="bg-gradient-to-r from-teal-500 to-emerald-500"
        badgeLabel="Export 1 · 2 sheets"
        columnTags={tripCols}
        onDownload={handleTripDownload}
        fileName={tripFileName}
      >
        {/* Date range pickers */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase
                               tracking-wide text-gray-400">
              <Calendar className="mr-1 inline h-3 w-3" />From
            </label>
            <input
              type="date"
              value={e1Start}
              onChange={e => { setE1Start(e.target.value); setE1Err('') }}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5
                         text-[11px] text-gray-700 focus:border-teal-400 focus:outline-none
                         focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase
                               tracking-wide text-gray-400">
              To
            </label>
            <input
              type="date"
              value={e1End}
              onChange={e => { setE1End(e.target.value); setE1Err('') }}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5
                         text-[11px] text-gray-700 focus:border-teal-400 focus:outline-none
                         focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        </div>
        {e1Err && (
          <p className="mb-2 flex items-center gap-1.5 rounded-lg border border-amber-100
                        bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
            <AlertCircle className="h-3 w-3 shrink-0" />{e1Err}
          </p>
        )}
      </ExportCard>

      {/* ── Export 2: Feederpoint Status ── */}
      <ExportCard
        title="Feederpoint Status"
        description="All feederpoints — active vs inactive with assignment info"
        accentColor="bg-gradient-to-r from-blue-600 to-indigo-600"
        badgeLabel="Export 2 · 4 sheets"
        columnTags={statusCols}
        onDownload={handleStatusDownload}
        fileName={statusFileName}
      >
        {/* Info box */}
        <div className="mb-3 flex flex-wrap gap-3 rounded-lg border border-blue-100
                        bg-blue-50/60 px-3 py-2">
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-blue-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
            Active = report within last 3 days
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-blue-700">
            <span className="h-2 w-2 rounded-full bg-red-400 inline-block" />
            Inactive = no recent report
          </span>
        </div>
        <div className="mb-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          <p className="text-[10px] text-gray-500">
            Sheets: <span className="font-semibold text-gray-700">All Feederpoints</span>
            {' · '}<span className="font-semibold text-emerald-700">Active</span>
            {' · '}<span className="font-semibold text-red-600">Inactive</span>
            {' · '}<span className="font-semibold text-amber-700">Summary</span>
          </p>
        </div>
      </ExportCard>

    </div>
  )
}