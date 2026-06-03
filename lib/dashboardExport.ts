import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ExportSheet } from './dashboardQueries'
import type { DashboardKPIs, AlertItem, TopPerformer, TeamLeaderboardEntry } from './dashboardQueries'

/**
 * Export multiple sheets as an Excel (.xlsx) file.
 */
export function exportToExcel(sheets: ExportSheet[], filename: string = 'taskforce-dashboard-report') {
  const wb = XLSX.utils.book_new()

  sheets.forEach(sheet => {
    if (sheet.data.length === 0) {
      // Add empty sheet with header
      const ws = XLSX.utils.aoa_to_sheet([['No data available']])
      XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
      return
    }
    const ws = XLSX.utils.json_to_sheet(sheet.data)

    // Auto-size columns
    const colWidths = Object.keys(sheet.data[0]).map(key => {
      const maxLen = Math.max(
        key.length,
        ...sheet.data.map(row => String(row[key] ?? '').length)
      )
      return { wch: Math.min(maxLen + 2, 40) }
    })
    ws['!cols'] = colWidths

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
  })

  const timestamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${filename}_${timestamp}.xlsx`)
}

/**
 * Export a single data array as CSV.
 */
export function exportToCSV(data: Record<string, any>[], filename: string = 'export') {
  if (!data.length) return

  const keys = Object.keys(data[0])
  const csvRows = [
    keys.join(','),
    ...data.map(row =>
      keys.map(k => {
        const val = String(row[k] ?? '')
        // Escape commas and quotes
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`
        }
        return val
      }).join(',')
    ),
  ]

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ─── PDF EXPORT ─────────────────────────────────────────────────────────────

interface PDFExportData {
  kpis: DashboardKPIs
  alerts: AlertItem[]
  teamLeaderboard: TeamLeaderboardEntry[]
  topPerformers: TopPerformer[]
  dateRange: string
  checklistFailures?: { label: string; total: number; failed: number; rate: number }[]
  slotPunctuality?: { onTime: number; late: number; missed: number; pending: number }
}

/**
 * Export a full dashboard report as a branded PDF.
 */
export function exportToPDF(data: PDFExportData, filename: string = 'taskforce-dashboard-report') {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  const contentWidth = pageWidth - margin * 2
  let y = 0

  const colors = {
    primary: [26, 115, 232] as [number, number, number],
    dark: [10, 12, 16] as [number, number, number],
    green: [40, 167, 69] as [number, number, number],
    amber: [230, 126, 34] as [number, number, number],
    red: [220, 53, 69] as [number, number, number],
    gray: [107, 122, 141] as [number, number, number],
    lightGray: [244, 246, 251] as [number, number, number],
  }

  // ── Helper: add page if needed ──
  function checkPage(needed: number) {
    if (y + needed > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage()
      y = 15
    }
  }

  // ── Helper: section title ──
  function sectionTitle(title: string) {
    checkPage(20)
    y += 6
    doc.setFillColor(...colors.primary)
    doc.rect(margin, y, 3, 8, 'F')
    doc.setTextColor(...colors.dark)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(title, margin + 6, y + 6)
    y += 14
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 1: Cover + KPIs
  // ─────────────────────────────────────────────────────────────────────────

  // Header bar
  doc.setFillColor(...colors.dark)
  doc.rect(0, 0, pageWidth, 42, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('Taskforce Command Centre', margin, 18)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Admin Dashboard Report', margin, 26)

  doc.setFontSize(8)
  doc.setTextColor(160, 170, 185)
  doc.text(`Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, margin, 34)
  doc.text(`Date range: ${data.dateRange}`, pageWidth - margin - 60, 34)

  y = 52

  // KPI summary grid
  doc.setTextColor(...colors.dark)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Key Performance Indicators', margin, y)
  y += 8

  const kpiItems = [
    { label: 'Total Reports', value: data.kpis.totalReports },
    { label: 'Pending Review', value: data.kpis.pendingReports },
    { label: 'Requires Action', value: data.kpis.requiresAction },
    { label: 'Approved', value: data.kpis.approvedReports },
    { label: 'Action Taken', value: data.kpis.actionTaken },
    { label: 'Feeder Points', value: data.kpis.totalFeederPoints },
    { label: 'Chronic Points', value: data.kpis.totalChronicPoints },
    { label: 'Active Points', value: data.kpis.activeFeederPoints + data.kpis.activeChronicPoints },
    { label: 'Shift Reports', value: data.kpis.totalShiftReports },
    { label: 'Completed Shifts', value: data.kpis.completedShifts },
    { label: 'Active Users', value: data.kpis.activeUsers },
    { label: 'Total Users', value: data.kpis.totalUsers },
    { label: 'Eliminated Points', value: data.kpis.eliminatedPoints },
    { label: 'Unassigned Points', value: data.kpis.unassignedPoints },
    { label: 'Pending Requests', value: data.kpis.pendingPointRequests + data.kpis.pendingFreqRequests + data.kpis.pendingAccessRequests },
  ]

  const colsPerRow = 5
  const boxW = (contentWidth - (colsPerRow - 1) * 3) / colsPerRow
  const boxH = 18

  kpiItems.forEach((item, i) => {
    const row = Math.floor(i / colsPerRow)
    const col = i % colsPerRow
    const bx = margin + col * (boxW + 3)
    const by = y + row * (boxH + 3)

    checkPage(boxH + 3)

    doc.setFillColor(...colors.lightGray)
    doc.roundedRect(bx, by, boxW, boxH, 2, 2, 'F')

    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...colors.gray)
    doc.text(item.label.toUpperCase(), bx + 3, by + 6)

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...colors.dark)
    doc.text(item.value.toLocaleString(), bx + 3, by + 14)
  })

  y += Math.ceil(kpiItems.length / colsPerRow) * (boxH + 3) + 4

  // ─────────────────────────────────────────────────────────────────────────
  // Alerts section
  // ─────────────────────────────────────────────────────────────────────────

  if (data.alerts.length > 0) {
    sectionTitle(`Active Alerts (${data.alerts.length})`)

    const alertColors: Record<string, [number, number, number]> = {
      critical: colors.red,
      warning: colors.amber,
      info: colors.primary,
    }

    data.alerts.forEach(alert => {
      checkPage(14)
      const ac = alertColors[alert.level] || colors.gray
      doc.setFillColor(ac[0], ac[1], ac[2])
      doc.rect(margin, y, 2, 10, 'F')

      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...colors.dark)
      doc.text(alert.title, margin + 5, y + 4)

      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...colors.gray)
      doc.text(alert.meta, margin + 5, y + 9)

      // severity badge
      doc.setFontSize(6)
      doc.setTextColor(ac[0], ac[1], ac[2])
      doc.text(alert.level.toUpperCase(), pageWidth - margin - 15, y + 5)

      y += 13
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Team leaderboard table
  // ─────────────────────────────────────────────────────────────────────────

  if (data.teamLeaderboard.length > 0) {
    sectionTitle('Team Leaderboard')

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Rank', 'Team', 'Reports', 'Approved', 'Rate']],
      body: data.teamLeaderboard.map((t, i) => [
        `#${i + 1}`,
        t.teamName,
        t.total.toLocaleString(),
        t.approved.toLocaleString(),
        `${t.approvalRate}%`,
      ]),
      headStyles: {
        fillColor: colors.dark,
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: { fontSize: 8, textColor: colors.dark },
      alternateRowStyles: { fillColor: colors.lightGray },
      columnStyles: {
        0: { cellWidth: 14 },
        4: { cellWidth: 18, halign: 'right' },
      },
    })

    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Checklist failures
  // ─────────────────────────────────────────────────────────────────────────

  if (data.checklistFailures && data.checklistFailures.length > 0) {
    sectionTitle('Checklist Failure Rates')

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Question', 'Total', 'Failed', 'Rate']],
      body: data.checklistFailures.map(c => [
        c.label,
        c.total.toLocaleString(),
        c.failed.toLocaleString(),
        `${c.rate}%`,
      ]),
      headStyles: {
        fillColor: colors.red,
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: { fontSize: 8, textColor: colors.dark },
      alternateRowStyles: { fillColor: colors.lightGray },
      columnStyles: {
        3: { cellWidth: 16, halign: 'right' },
      },
      didParseCell: (hookData) => {
        // Color-code failure rates
        if (hookData.section === 'body' && hookData.column.index === 3) {
          const rate = parseInt(String(hookData.cell.raw))
          if (rate > 70) hookData.cell.styles.textColor = colors.red
          else if (rate > 40) hookData.cell.styles.textColor = colors.amber
          else hookData.cell.styles.textColor = colors.green
        }
      },
    })

    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Top performers
  // ─────────────────────────────────────────────────────────────────────────

  if (data.topPerformers.length > 0) {
    sectionTitle('Top Performers')

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Category', 'Name', 'Value', 'Detail']],
      body: data.topPerformers.map(tp => [
        tp.metric,
        tp.name,
        String(tp.value),
        tp.sub,
      ]),
      headStyles: {
        fillColor: [212, 160, 23],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: { fontSize: 8, textColor: colors.dark },
      alternateRowStyles: { fillColor: colors.lightGray },
    })

    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Shift punctuality
  // ─────────────────────────────────────────────────────────────────────────

  if (data.slotPunctuality) {
    sectionTitle('Shift Slot Punctuality')

    const sp = data.slotPunctuality
    const total = sp.onTime + sp.late + sp.missed + sp.pending

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Status', 'Count', 'Percentage']],
      body: [
        ['On Time', sp.onTime.toLocaleString(), total > 0 ? `${Math.round((sp.onTime / total) * 100)}%` : '0%'],
        ['Late', sp.late.toLocaleString(), total > 0 ? `${Math.round((sp.late / total) * 100)}%` : '0%'],
        ['Missed', sp.missed.toLocaleString(), total > 0 ? `${Math.round((sp.missed / total) * 100)}%` : '0%'],
        ['Pending', sp.pending.toLocaleString(), total > 0 ? `${Math.round((sp.pending / total) * 100)}%` : '0%'],
      ],
      headStyles: {
        fillColor: [124, 92, 191],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: { fontSize: 8, textColor: colors.dark },
      alternateRowStyles: { fillColor: colors.lightGray },
    })

    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Requests summary
  // ─────────────────────────────────────────────────────────────────────────

  sectionTitle('Pending Requests Summary')

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Request Type', 'Pending Count']],
    body: [
      ['Feeder Point Requests', data.kpis.pendingPointRequests.toLocaleString()],
      ['Frequency Change Requests', data.kpis.pendingFreqRequests.toLocaleString()],
      ['Access Requests', data.kpis.pendingAccessRequests.toLocaleString()],
    ],
    headStyles: {
      fillColor: colors.amber,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
    },
    bodyStyles: { fontSize: 8, textColor: colors.dark },
    alternateRowStyles: { fillColor: colors.lightGray },
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Footer on all pages
  // ─────────────────────────────────────────────────────────────────────────

  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const pageH = doc.internal.pageSize.getHeight()

    doc.setDrawColor(200, 200, 200)
    doc.line(margin, pageH - 12, pageWidth - margin, pageH - 12)

    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...colors.gray)
    doc.text('Taskforce Admin Dashboard · Read Only · All data from Firebase', margin, pageH - 7)
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin - 20, pageH - 7)
  }

  // Save
  const timestamp = new Date().toISOString().slice(0, 10)
  doc.save(`${filename}_${timestamp}.pdf`)
}