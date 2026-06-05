import { useEffect, useMemo, useState, useCallback } from 'react'
import Head from 'next/head'
import {
  Activity, BarChart3, Camera, CheckCircle, Clock, Download, Eye,
  Loader2, Percent, RefreshCcw, Sparkles, X, ZoomIn, AlertTriangle,
  TrendingUp, TrendingDown, Award, Filter, Zap, Shield,
  MessageSquare, Send, FileText, ChevronDown,
} from 'lucide-react'
import { DataService, ComplianceReport } from '@/lib/dataService'
import { AIService } from '@/lib/aiService'
import { useTheme } from '@/contexts/ThemeContext'
import { getTokens } from '@/lib/dashboardTheme'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────
type FeederInsight = {
  key: string; fpId?: string; name: string
  totalReports: number; approved: number; rejected: number; pending: number
  photos: number; yesAnswers: number; noAnswers: number
  latestDate: Date | null; improvementPct: number; transformScore: number
  aiConfirmed: number; aiFlagged: number; shareOfTotal: number
  rationale: string; improvementNotes: string[]
  beforeImages: string[]; afterImages: string[]
  beforeDate: Date | null; afterDate: Date | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toInput = (d: Date) => { const c = new Date(d); c.setHours(0,0,0,0); return c.toISOString().slice(0,10) }

const nd = (v: any): Date | null => {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v.toDate === 'function') return v.toDate()
  if (typeof v._seconds === 'number') return new Date(v._seconds * 1000)
  if (typeof v === 'string') { const d = new Date(v); return isNaN(d.getTime()) ? null : d }
  return null
}
const resolveDate = (r: any): Date | null =>
  nd(r.submittedAt) || nd(r.updatedAt) || nd(r.createdAt) || nd(r.tripDate) || null

const fmtDate = (d: Date | null) => d ? d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const fmtDT   = (v: any) => { const d = nd(v); return d ? d.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—' }
const toFolder = (d: Date) => { const c=new Date(d); c.setHours(0,0,0,0); return c.toISOString().slice(0,10) }

const YES = new Set(['yes','y','true','1'])
const NO  = new Set(['no','n','false','0'])

// KEY FIX: answers stored as numbered root keys OR answers[]
function getAnswers(r: any): any[] {
  if (Array.isArray(r.answers) && r.answers.length > 0) return r.answers
  const out: any[] = []; let i = 0
  while (r[String(i)] !== undefined) { out.push(r[String(i)]); i++ }
  return out
}

// Only return https:// photos — skip local: cache paths
function getPhotos(r: any): string[] {
  const answers = getAnswers(r)
  const ans = answers.flatMap((a: any) => (a.photos||[]).filter((p: string) => p?.startsWith('https://')))
  const att = (r.attachments||[]).filter((a: any) => a.type==='photo' && a.url?.startsWith('https://')).map((a: any) => a.url)
  return [...ans, ...att]
}

const cleanText = (v: any) => v ? String(v).replace(/[^\x09\x0A\x0D\x20-\x7E]/g,'').replace(/\s+/g,' ').trim() : ''

const sanitize = (v: string, fb='report') => (v||'').trim().replace(/\s+/g,'-').replace(/[^a-zA-Z0-9-_]/g,'').slice(0,80) || fb

const inferExt = (url: string, def='bin') => {
  try { const p=new URL(url).pathname.split('.'); const e=p.pop(); if(e&&e.length<=5) return e.toLowerCase() } catch {}
  return def
}

const REPORTS_START = new Date('2024-09-15T00:00:00')
const ZIP_SPLIT_BYTES = 800 * 1024 * 1024 // 800 MB

// ─── Fast loader ──────────────────────────────────────────────────────────────
async function loadReports(startDate: Date, endDate: Date): Promise<any[]> {
  const s = toInput(startDate), e = toInput(endDate)
  const q = query(collection(db,'complianceReports'), where('tripDate','>=',s), where('tripDate','<=',e), limit(2000))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ─── Build insights ───────────────────────────────────────────────────────────
function buildInsights(reports: any[], fpFilter: string, hidden: Set<string>): {
  insights: FeederInsight[]; flaggedMap: Map<string, any[]>
} {
  const map = new Map<string, any>()
  const flaggedMap = new Map<string, any[]>()

  reports.forEach(r => {
    const key = r.feederPointId || r.feederPointName || r.id
    if (!map.has(key)) map.set(key, {
      key, fpId: r.feederPointId, name: r.feederPointName || 'Unspecified',
      totalReports:0, approved:0, rejected:0, pending:0,
      photos:0, yesAnswers:0, noAnswers:0, latestDate:null,
      aiConfirmed:0, aiFlagged:0,
      beforeImages:[], afterImages:[], beforeDate:null, afterDate:null,
    })
    const e = map.get(key)!
    e.totalReports++
    if (r.status==='approved') e.approved++
    else if (r.status==='rejected') e.rejected++
    else e.pending++

    const answers = getAnswers(r)
    let yc=0, nc=0, pc=0
    answers.forEach((a: any) => {
      const raw = (a.answer||'').toString().trim().toLowerCase()
      if (YES.has(raw)) { e.yesAnswers++; yc++ }
      if (NO.has(raw))  { e.noAnswers++;  nc++ }
      const ap = (a.photos||[]).filter((p: string) => p?.startsWith('https://'))
      e.photos += ap.length; pc += ap.length
    })
    const attPhotos = (r.attachments||[]).filter((a: any) => a.type==='photo' && a.url?.startsWith('https://'))
    e.photos += attPhotos.length; pc += attPhotos.length

    const allPhotos = getPhotos(r)
    const sd = (yc+nc) ? yc/(yc+nc) : 0.5
    const conf = sd*0.7 + (pc>0?0.1:0)
    if (conf>=0.55) e.aiConfirmed++
    else if (conf<=0.35 && r.status!=='approved') {
      e.aiFlagged++
      if (!flaggedMap.has(key)) flaggedMap.set(key,[])
      flaggedMap.get(key)!.push(r)
    }

    const d = resolveDate(r)
    if (d && (!e.latestDate || d > e.latestDate)) e.latestDate = d
    if (d && allPhotos.length > 0) {
      if (!e.beforeDate || d < e.beforeDate) { e.beforeDate=d; e.beforeImages=allPhotos.slice(0,6) }
      if (!e.afterDate  || d > e.afterDate)  { e.afterDate=d;  e.afterImages=allPhotos.slice(0,6) }
    }
  })

  const total = reports.length || 1
  const result: FeederInsight[] = []
  map.forEach(e => {
    if (hidden.has(e.key)) return
    const ar = e.totalReports ? e.approved/e.totalReports : 0
    const sd = (e.yesAnswers+e.noAnswers) ? e.yesAnswers/(e.yesAnswers+e.noAnswers) : 0.5
    const blended = ar*0.6 + sd*0.3 + (e.photos>0?0.1:0)
    const improvePct = Math.min(100,Math.max(0,Math.round(blended*100)))
    const photoImpact = Math.min(20,Math.log10(e.photos+1)*15)
    const base = improvePct + photoImpact - e.aiFlagged*5 - e.rejected*2 - e.pending
    const cleanSweep = improvePct>=90 && e.aiFlagged===0 && e.rejected===0 && e.pending===0
    const transformScore = cleanSweep ? 100 : Math.max(0,Math.min(95,Math.round(base)))
    const shareOfTotal = Math.round((e.totalReports/total)*100)
    const notes = [
      `Approval rate: ${Math.round(ar*100)}% of ${e.totalReports} reports approved.`,
      (e.yesAnswers+e.noAnswers)>0 ? `Answers: ${e.yesAnswers} positive, ${e.noAnswers} negative (${Math.round(sd*100)}% positive).` : 'No yes/no answers.',
      e.photos>0 ? `${e.photos} photo${e.photos!==1?'s':''} submitted as evidence.` : 'No https photos — local cache photos excluded.',
      e.aiFlagged>0 ? `${e.aiFlagged} report${e.aiFlagged!==1?'s':''} AI-flagged for human review.` : 'No AI flags.',
    ]
    const rationale = [
      `${e.totalReports} reports, ${Math.round(ar*100)}% approved.`,
      e.photos>0 ? `${e.photos} photos.` : '',
      (e.yesAnswers+e.noAnswers)>0 ? `${e.yesAnswers} yes/${e.noAnswers} no.` : '',
      e.aiFlagged>0 ? `${e.aiFlagged} flagged.` : '',
      e.rejected>0 ? `${e.rejected} rejected.` : '',
    ].filter(Boolean).join(' ')
    result.push({...e, improvementPct:improvePct, transformScore, aiConfirmed:Math.max(e.aiConfirmed,e.totalReports-e.aiFlagged), shareOfTotal, rationale, improvementNotes:notes})
  })

  let filtered = result
  if (fpFilter==='top') filtered = result.filter(i=>i.improvementPct>=70)
  else if (fpFilter==='needs_attention') filtered = result.filter(i=>i.improvementPct<40||i.aiFlagged>0||i.rejected>i.approved)
  return { insights: filtered.sort((a,b)=>b.transformScore-a.transformScore||b.improvementPct-a.improvementPct), flaggedMap }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
      style={{background:`${color}18`,border:`1px solid ${color}30`,color}}>{label}</span>
  )
}

function KpiCard({ label, value, sub, icon: Icon, color, T }: any) {
  return (
    <div className="rounded-2xl p-4" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{color:T.textMuted}}>{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{background:`${color}15`}}>
          <Icon className="h-4 w-4" style={{color}}/>
        </div>
      </div>
      <p className="text-2xl font-black" style={{color,fontFamily:"'JetBrains Mono',monospace"}}>{value}</p>
      {sub && <p className="text-[10px] mt-1" style={{color:T.textMuted}}>{sub}</p>}
    </div>
  )
}

function ScoreBar({ pct, T }: { pct: number; T: any }) {
  const color = pct>=70?T.green:pct>=40?T.amber:T.red
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{background:T.gridLine,minWidth:60}}>
        <div className="h-full rounded-full" style={{width:`${pct}%`,background:color}}/>
      </div>
      <span className="text-xs font-bold w-8 text-right" style={{color}}>{pct}%</span>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function ImprovementSummaryPage() {
  const { theme } = useTheme(); const dark = theme==='dark'; const T = getTokens(dark)

  const [reports,       setReports]       = useState<any[]>([])
  const [loading,       setLoading]       = useState(false)
  const [startInput,    setStartInput]    = useState(() => { const d=new Date(); d.setDate(d.getDate()-30); return toInput(d) })
  const [endInput,      setEndInput]      = useState(() => toInput(new Date()))
  const [quickRange,    setQuickRange]    = useState<'7d'|'30d'|'90d'|'all'|'custom'>('30d')
  const [fpFilter,      setFpFilter]      = useState<'all'|'top'|'needs_attention'>('all')
  const [hidden,        setHidden]        = useState<Set<string>>(new Set())
  const [expandedRat,   setExpandedRat]   = useState<Record<string,boolean>>({})

  // modals
  const [reviewKey,     setReviewKey]     = useState<string|null>(null)
  const [reviewQueue,   setReviewQueue]   = useState<any[]>([])
  const [updatingId,    setUpdatingId]    = useState<string|null>(null)
  const [selImage,      setSelImage]      = useState<string|null>(null)
  const [transformView, setTransformView] = useState<any>(null)
  const [improveModal,  setImproveModal]  = useState<any>(null)

  // AI Analysis
  const [aiModal,       setAiModal]       = useState<{key:string;name:string}|null>(null)
  const [aiLoading,     setAiLoading]     = useState(false)
  const [aiResult,      setAiResult]      = useState<string|null>(null)
  const [aiError,       setAiError]       = useState<string|null>(null)

  // WhatsApp
  const [waModal,       setWaModal]       = useState<{key:string;name:string}|null>(null)
  const [waLoading,     setWaLoading]     = useState(false)
  const [waReport,      setWaReport]      = useState<string|null>(null)

  // ZIP
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [zipStatus,      setZipStatus]      = useState<string|null>(null)

  // date validation
  const { startDate, endDate, dateError } = useMemo(() => {
    if (!startInput||!endInput) return {startDate:null,endDate:null,dateError:'Select both dates.'}
    const s=new Date(startInput); s.setHours(0,0,0,0)
    const e=new Date(endInput);   e.setHours(23,59,59,999)
    if (isNaN(s.getTime())||isNaN(e.getTime())) return {startDate:null,endDate:null,dateError:'Invalid dates.'}
    if (s>e) return {startDate:null,endDate:null,dateError:'Start must be before end.'}
    return {startDate:s,endDate:e,dateError:null}
  },[startInput,endInput])

  const load = useCallback(async () => {
    if (!startDate||!endDate||dateError) return
    setLoading(true)
    try { const r=await loadReports(startDate,endDate); setReports(r) }
    catch(e) { console.error(e) }
    finally { setLoading(false) }
  },[startDate,endDate,dateError])

  useEffect(() => { load() },[startDate,endDate])

  const applyQuick = (range:'7d'|'30d'|'90d'|'all') => {
    const today=new Date(); const end=toInput(today); const d=new Date()
    if (range==='all') { setStartInput('2000-01-01'); setEndInput(end) }
    else { d.setDate(d.getDate()-(range==='7d'?7:range==='30d'?30:90)); setStartInput(toInput(d)); setEndInput(end) }
    setQuickRange(range)
  }

  // derived
  const { insights, flaggedMap } = useMemo(() => buildInsights(reports, fpFilter, hidden), [reports, fpFilter, hidden])

  const agg = useMemo(() => {
    let photos=0, questions=0, earliest:Date|null=null, latest:Date|null=null
    reports.forEach(r => {
      questions += getAnswers(r).length
      photos += getPhotos(r).length
      const d=resolveDate(r)
      if (d) { if (!earliest||d<earliest) earliest=d; if (!latest||d>latest) latest=d }
    })
    return { photos, questions, total:reports.length, earliest, latest }
  }, [reports])

  const summaryTitle = useMemo(() => {
    if (dateError) return 'Fix date range to view insights.'
    if (!reports.length) return 'No reports in this range.'
    return `Impact: ${fmtDate(startDate)} → ${fmtDate(endDate)}`
  },[dateError, reports.length, startDate, endDate])

  // Review
  const handleReviewOpen = (key: string) => {
    setReviewKey(key)
    setReviewQueue((flaggedMap.get(key)||[]).sort((a,b)=>(resolveDate(b)?.getTime()||0)-(resolveDate(a)?.getTime()||0)))
  }
  const handleReviewUpdate = async (id: string, status: 'approved'|'rejected') => {
    setUpdatingId(id)
    try {
      await DataService.updateComplianceReportStatus(id, status)
      setReports(prev=>prev.map(r=>r.id===id?{...r,status}:r))
      setReviewQueue(prev=>prev.filter(r=>r.id!==id))
    } catch(e) { console.error(e); alert('Update failed.') }
    finally { setUpdatingId(null) }
  }

  // AI Analysis
  const handleGenerateAI = useCallback(async (insight: FeederInsight) => {
    setAiModal({key:insight.key,name:insight.name})
    setAiLoading(true); setAiResult(null); setAiError(null)
    try {
      const fpReports = reports.filter(r=>(r.feederPointId||r.feederPointName||r.id)===insight.key)
      const { summary: aiText } = await AIService.generateAnalysis({
        date: startInput || new Date().toISOString(),
        metrics: {
          totalUsers: new Set(fpReports.map((r:any)=>r.userId||r.userName)).size,
          newRegistrations: 0,
          totalComplaints: insight.totalReports,
          resolvedComplaints: insight.approved,
          activeFeederPoints: 1,
          completedInspections: insight.totalReports,
        },
        performance: {
          complaintResolutionRate: Math.round(insight.improvementPct),
          userGrowth: 0,
          operationalEfficiency: insight.totalReports ? Math.round((insight.approved+insight.pending)/insight.totalReports*100) : 0,
        },
        rawReports: fpReports,
      })
      setAiResult(aiText?.trim() || 'No summary generated.')
    } catch(e) {
      console.error(e)
      setAiError('AI analysis failed. Please try again.')
    } finally {
      setAiLoading(false)
    }
  }, [reports, startInput])

  // WhatsApp short report
  const handleGenerateWhatsApp = useCallback((insight: FeederInsight) => {
    setWaModal({key:insight.key,name:insight.name})
    setWaLoading(true); setWaReport(null)
    try {
      const fpReports = reports.filter(r=>(r.feederPointId||r.feederPointName||r.id)===insight.key)
      const approvalPct = Math.round(insight.improvementPct)
      const slotRate = insight.totalReports ? Math.round(insight.approved/insight.totalReports*100) : 0
      const yesRate = (insight.yesAnswers+insight.noAnswers) > 0 ? Math.round(insight.yesAnswers/(insight.yesAnswers+insight.noAnswers)*100) : 0
      const latestD = insight.latestDate ? fmtDate(insight.latestDate) : '—'
      const statusEmoji = approvalPct >= 70 ? '✅' : approvalPct >= 40 ? '⚠️' : '🔴'

      const lines = [
        `*📍 Feeder Point Report*`,
        `*${insight.name}*`,
        `📅 Period: ${fmtDate(startDate)} → ${fmtDate(endDate)}`,
        ``,
        `*📊 Summary*`,
        `${statusEmoji} Improvement Score: *${approvalPct}%*`,
        `🏆 Transform Score: *${insight.transformScore}/100*`,
        ``,
        `*📋 Reports (${insight.totalReports} total)*`,
        `✅ Approved: ${insight.approved}`,
        `⏳ Pending: ${insight.pending}`,
        `❌ Rejected: ${insight.rejected}`,
        ``,
        `*📸 Evidence*`,
        `🖼️ Photos submitted: ${insight.photos}`,
        `👍 Positive answers: ${yesRate}% (${insight.yesAnswers} yes / ${insight.noAnswers} no)`,
        ``,
        `*🤖 AI Checks*`,
        `✔️ AI confirmed: ${insight.aiConfirmed} reports`,
        insight.aiFlagged > 0 ? `⚠️ Flagged for review: ${insight.aiFlagged} reports` : `✔️ No flags raised`,
        ``,
        `*📅 Latest Activity:* ${latestD}`,
        ``,
        `_Generated by Taskforce Dashboard_`,
      ]
      setWaReport(lines.join('\n'))
    } catch(e) { console.error(e) }
    finally { setWaLoading(false) }
  }, [reports, startDate, endDate])

  const handleOpenWhatsApp = (text: string) => {
    const encoded = encodeURIComponent(text)
    window.open(`https://wa.me/?text=${encoded}`, '_blank')
  }

  // Excel export
  const handleExcelExport = () => {
    const rows = insights.map((i,idx)=>({
      'Rank': idx+1, 'Feeder Point': i.name, 'Total Reports': i.totalReports,
      'Approved': i.approved, 'Rejected': i.rejected, 'Pending': i.pending,
      'Photos': i.photos, '% of Total': `${i.shareOfTotal}%`,
      'Transform Score': i.transformScore, 'Improvement %': `${i.improvementPct}%`,
      'AI Confirmed': i.aiConfirmed, 'AI Flagged': i.aiFlagged,
      'Latest Date': fmtDate(i.latestDate), 'Rationale': i.rationale,
    }))
    const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'Improvement Summary')
    const url=URL.createObjectURL(new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
    const a=document.createElement('a'); a.href=url; a.download=`ImprovementSummary_${startInput}_to_${endInput}.xlsx`; a.click(); URL.revokeObjectURL(url)
  }

  // Full evidence ZIP (day-wise, PDF + photos + TXT per report, splits at 800MB)
  const handleZipDownload = async () => {
    if (dateError || reports.length===0) { alert('Fix date range first.'); return }
    const effStart = new Date(Math.max((startDate||new Date()).getTime(), REPORTS_START.getTime()))
    const effEnd   = endDate || new Date()
    effStart.setHours(0,0,0,0); effEnd.setHours(23,59,59,999)
    const label = `${toFolder(effStart)}-to-${toFolder(effEnd)}`
    if (!confirm(`Export evidence ZIP for ${reports.length} reports (${label})?`)) return
    const rootName = prompt('Folder name inside ZIP:', `evidence-${label}`) 
    if (rootName===null) return

    setDownloadingZip(true); setZipStatus('Collecting reports…')
    const datedReports = reports.map(r=>({r, d:resolveDate(r)})).filter(x=>x.d&&x.d>=effStart&&x.d<=effEnd).sort((a,b)=>(a.d?.getTime()||0)-(b.d?.getTime()||0))
    if (!datedReports.length) { alert('No reports in range.'); setDownloadingZip(false); setZipStatus(null); return }

    try {
      const { default: JSZip } = await import('jszip')
      const { jsPDF } = await import('jspdf')
      const enc = new TextEncoder()
      const make = () => { const z=new JSZip(); return {z, root:z.folder(sanitize(rootName||`evidence-${label}`))!} }
      let partNum=1, curSize=0, {z,root} = make()
      const cache = new Map<string,ArrayBuffer>()

      const flush = async () => {
        if (curSize===0) return
        const name = partNum===1?`${sanitize(rootName||label)}_${label}.zip`:`${sanitize(rootName||label)}_${label}_part${partNum}.zip`
        setZipStatus(`Compressing ${name}…`)
        const blob = await z.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}})
        const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href)
        partNum++; curSize=0; const n=make(); z=n.z; root=n.root
      }

      const fetchAsset = async (url: string): Promise<{ok:boolean;buf:ArrayBuffer|null;err:string}> => {
        if (!url) return {ok:false,buf:null,err:'no url'}
        if (cache.has(url)) return {ok:true,buf:cache.get(url)!,err:''}
        // Try proxied, then direct, then canvas fallback
        const candidates = [`/api/image-proxy?url=${encodeURIComponent(url.trim())}`, url]
        for (const c of candidates) {
          try { const res=await fetch(c,{cache:'no-store',referrerPolicy:'no-referrer'}); if (res.ok) { const buf=await res.arrayBuffer(); cache.set(url,buf); return {ok:true,buf,err:''} } } catch {}
        }
        // canvas fallback
        try {
          const buf = await new Promise<ArrayBuffer>((resolve,reject) => {
            const img=new Image(); img.crossOrigin='anonymous'
            img.onload=()=>{ const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; const ctx=c.getContext('2d')!; ctx.drawImage(img,0,0); c.toBlob(b=>b?resolve(b.arrayBuffer().then(x=>x)):reject('no blob'),'image/jpeg',0.85) }
            img.onerror=()=>reject('load failed'); img.src=url
          }); cache.set(url,buf); return {ok:true,buf,err:''}
        } catch(e) { return {ok:false,buf:null,err:String(e)} }
      }

      let proc=0
      for (const {r,d} of datedReports) {
        if (!d) continue
        proc++; setZipStatus(`Report ${proc}/${datedReports.length} — ${toFolder(d)}`)
        if (curSize>=ZIP_SPLIT_BYTES) await flush()

        const dayFolder = root.folder(toFolder(d))!
        const fpSlug = sanitize(r.feederPointName||'fp')
        const folder = dayFolder.folder(`${fpSlug}_trip${r.tripNumber||'?'}_${sanitize(r.id||'id').slice(-8)}`)!
        const photos = folder.folder('photos')!
        const answerLines: string[] = []
        const answers = getAnswers(r)
        const pdfPhotos: {url:string;label:string}[] = []

        for (let ai=0; ai<answers.length; ai++) {
          const a=answers[ai]
          const q=cleanText(a.description||a.questionId||`Q${ai+1}`)
          const ans=cleanText(a.answer)||'N/A'
          answerLines.push(`${ai+1}. ${q}: ${ans}${a.notes?` (${a.notes})`:''}`)
          const aPhotos = (a.photos||[]).filter((p:string)=>p?.startsWith('https://'))
          for (let pi=0; pi<aPhotos.length; pi++) {
            const url=aPhotos[pi]; const ext=inferExt(url,'jpg')
            const fn=`a${ai+1}_p${pi+1}.${ext}`
            pdfPhotos.push({url,label:`Q${ai+1} photo ${pi+1}`})
            const {ok,buf} = await fetchAsset(url)
            if (ok&&buf) { photos.file(fn,buf); curSize+=buf.byteLength }
          }
        }
        ;(r.attachments||[]).filter((a:any)=>a.type==='photo'&&a.url?.startsWith('https://')).forEach((a:any)=>{
          pdfPhotos.push({url:a.url,label:a.filename||'attachment'})
        })

        const narrative = [
          `Report ID: ${r.id}`, `Feeder Point: ${r.feederPointName||'N/A'}`,
          `Employee: ${r.userName||r.submittedBy||'?'}`, `Trip: ${r.tripNumber||'?'}`,
          `Date: ${toFolder(d)}`, `Status: ${r.status||'?'}`,
          '', 'Answers:', ...answerLines,
          '', `Exported: ${new Date().toLocaleString()}`,
        ].join('\n')

        const reportJson = JSON.stringify(r, null, 2)
        folder.file('report.json', reportJson); curSize += enc.encode(reportJson).length
        folder.file('report.txt',  narrative);   curSize += enc.encode(narrative).length

        // PDF with photos
        try {
          const doc = new jsPDF({unit:'pt',format:'a4'})
          const M=40, W=doc.internal.pageSize.getWidth()-M*2, LH=16, PH=doc.internal.pageSize.getHeight()
          let y=M; doc.setFontSize(12)
          doc.splitTextToSize(`${r.feederPointName||'Feeder Point'} | Trip ${r.tripNumber||'?'} | ${toFolder(d)}`,W).forEach((l:string)=>{doc.text(l,M,y);y+=LH})
          y+=6; doc.setFontSize(10)
          doc.splitTextToSize(narrative,W).forEach((l:string)=>{if(y>PH-M){doc.addPage();y=M} doc.text(l,M,y);y+=LH})
          const limitedPhotos=pdfPhotos.slice(0,10)
          if (limitedPhotos.length>0) { doc.addPage(); y=M; doc.setFontSize(11); doc.text('Photos',M,y); y+=20 }
          for (const ph of limitedPhotos) {
            const {ok,buf} = await fetchAsset(ph.url)
            if (!ok||!buf) continue
            try {
              const blob=new Blob([buf],{type:'image/*'}); const oUrl=URL.createObjectURL(blob)
              const dataUrl = await new Promise<string>((res,rej)=>{
                const img=new Image(); img.crossOrigin='anonymous'; img.onload=()=>{
                  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height
                  const ctx=c.getContext('2d')!; ctx.drawImage(img,0,0); res(c.toDataURL('image/jpeg',0.8))
                }; img.onerror=rej; img.src=oUrl
              }); URL.revokeObjectURL(oUrl)
              const iH=Math.min(240,PH-M*2-20)
              if (y+iH>PH-M) { doc.addPage(); y=M }
              doc.setFontSize(9); doc.text(ph.label,M,y); y+=12
              doc.addImage(dataUrl,'JPEG',M,y,W,iH,undefined,'FAST'); y+=iH+16
            } catch {}
          }
          const pdfBuf = doc.output('arraybuffer')
          folder.file('report.pdf', pdfBuf); curSize += pdfBuf.byteLength
        } catch {}
      }
      await flush()
      setZipStatus('Done!')
    } catch(e) { console.error(e); alert('ZIP failed. Try a smaller date range.') }
    finally { setTimeout(()=>setZipStatus(null),3000); setDownloadingZip(false) }
  }

  const inputSt = { background:T.surface, border:`1px solid ${T.cardBorder}`, color:T.textPrimary, borderRadius:10, padding:'7px 12px', fontSize:13, outline:'none' }
  const scColor = (s: string) => ({approved:T.green,rejected:T.red,pending:T.amber,requires_action:T.purple}[s]??T.textMuted)

  return (
    <>
      <Head><title>Improvement Summary | Taskforce</title></Head>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{background:T.accentDim,border:`1px solid ${T.accentBorder}`}}>
              <TrendingUp className="h-6 w-6" style={{color:T.accent}}/>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight" style={{color:T.textPrimary}}>Improvement & Evidence</h1>
              <p className="text-sm" style={{color:T.textMuted}}>Date-filtered rollup of submissions, photos, and AI-style improvement insights</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleExcelExport} disabled={insights.length===0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
                style={{background:T.green,color:'#fff',border:'none',cursor:'pointer'}}>
                <Download className="h-3.5 w-3.5"/> Excel Export
              </button>
              <button onClick={handleZipDownload} disabled={downloadingZip||reports.length===0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
                style={{background:T.accentDim,border:`1px solid ${T.accentBorder}`,color:T.accent,cursor:'pointer'}}>
                {downloadingZip?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Download className="h-3.5 w-3.5"/>}
                {downloadingZip ? zipStatus||'…' : 'Evidence ZIP'}
              </button>
            </div>
            <p className="text-[10px] text-right max-w-xs" style={{color:T.textMuted}}>
              ZIP exports day-wise folders with JSON + TXT + PDF per report. Photos only for https:// URLs (not local device cache). Auto-splits at 800MB.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="rounded-2xl p-4 space-y-3" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{color:T.textMuted}}>Quick Range</p>
              <div className="flex gap-1.5">
                {(['7d','30d','90d','all'] as const).map(r=>(
                  <button key={r} onClick={()=>applyQuick(r)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{background:quickRange===r?`${T.accent}15`:T.surface,color:quickRange===r?T.accent:T.textSecondary,border:`1px solid ${quickRange===r?T.accentBorder:T.cardBorder}`,cursor:'pointer'}}>
                    {r==='all'?'All time':r==='7d'?'7 days':r==='30d'?'30 days':'90 days'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{color:T.textMuted}}>Start</p>
              <input type="date" value={startInput} max={endInput} onChange={e=>{setStartInput(e.target.value);setQuickRange('custom')}} style={inputSt}/>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{color:T.textMuted}}>End</p>
              <input type="date" value={endInput} min={startInput} onChange={e=>{setEndInput(e.target.value);setQuickRange('custom')}} style={inputSt}/>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{color:T.textMuted}}>Filter</p>
              <select value={fpFilter} onChange={e=>setFpFilter(e.target.value as any)} style={{...inputSt,cursor:'pointer'}}>
                <option value="all">All points</option>
                <option value="top">Top performers (≥70%)</option>
                <option value="needs_attention">Needs attention (&lt;40% or flagged)</option>
              </select>
            </div>
            <button onClick={load} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold"
              style={{background:T.surface,border:`1px solid ${T.cardBorder}`,color:T.textSecondary,cursor:'pointer'}}>
              <RefreshCcw className="h-3.5 w-3.5"/> Refresh
            </button>
          </div>
          {dateError && <p className="text-xs flex items-center gap-1 font-semibold" style={{color:T.red}}><AlertTriangle className="h-3.5 w-3.5"/>{dateError}</p>}
          <div className="flex items-center gap-2 text-xs pt-1" style={{borderTop:`1px solid ${T.gridLine}`,color:T.textMuted}}>
            <Sparkles className="h-3.5 w-3.5" style={{color:T.accent}}/>
            Score = 60% approval rate + 30% yes/no answer sentiment + 10% photo evidence bonus
          </div>
        </div>

        {/* KPIs */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-t-transparent"
              style={{borderColor:`${T.accent}30`,borderTopColor:T.accent}}/>
            <p className="text-sm font-semibold" style={{color:T.textSecondary}}>Loading improvement summary…</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiCard label="Reports"        value={agg.total}     sub={`${fmtDate(agg.earliest)} → ${fmtDate(agg.latest)}`}  icon={Activity}    color={T.accent}  T={T}/>
              <KpiCard label="Photos (https)" value={agg.photos}    sub="Local cache photos excluded"                           icon={Camera}      color={T.purple}  T={T}/>
              <KpiCard label="Questions"      value={agg.questions} sub="Total answers recorded"                                icon={CheckCircle} color={T.green}   T={T}/>
              <KpiCard label="Feeder Points"  value={insights.length} sub={`${fpFilter==='all'?'all':fpFilter} view`}           icon={Zap}         color={T.accent}  T={T}/>
              <KpiCard label="AI Flagged"     value={insights.reduce((a,i)=>a+i.aiFlagged,0)} sub="Need human review"          icon={AlertTriangle} color={T.red}   T={T}/>
            </div>

            {/* Summary title */}
            <div className="rounded-2xl px-5 py-3 flex items-center gap-3" style={{background:T.accentDim,border:`1px solid ${T.accentBorder}`}}>
              <TrendingUp className="h-5 w-5 flex-shrink-0" style={{color:T.accent}}/>
              <div>
                <p className="text-sm font-bold" style={{color:T.textPrimary}}>{summaryTitle}</p>
                <p className="text-xs" style={{color:T.textMuted}}>Blended approval rate, answer sentiment (yes/no), and photo evidence per feeder point</p>
              </div>
            </div>

            {/* Insights table */}
            <div className="rounded-2xl overflow-hidden" style={{background:T.card,border:`1px solid ${T.cardBorder}`}}>
              <div className="px-5 py-4 flex items-center justify-between" style={{borderBottom:`1px solid ${T.cardBorder}`}}>
                <div>
                  <h2 className="text-base font-bold" style={{color:T.textPrimary}}>Feeder Point Insights</h2>
                  <p className="text-xs mt-0.5" style={{color:T.textMuted}}>Sorted by transformation score — highest means best combined evidence + approval</p>
                </div>
                <SBadge label={`${insights.length} points`} color={T.accent}/>
              </div>

              {insights.length===0 ? (
                <div className="flex flex-col items-center py-16 gap-2">
                  <BarChart3 className="h-10 w-10 opacity-20" style={{color:T.accent}}/>
                  <p className="text-sm" style={{color:T.textMuted}}>No reports in this date range.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full" style={{fontSize:12}}>
                    <thead>
                      <tr style={{background:T.surface,borderBottom:`1px solid ${T.cardBorder}`}}>
                        {['#','Feeder Point','Reports','Photos','% of Total','Transform','Improvement %','AI Checks','Rationale','Latest','Actions'].map(h=>(
                          <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap" style={{fontSize:10,color:T.accent}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {insights.map((ins, idx) => {
                        const needsAttn = ins.improvementPct<40||ins.aiFlagged>0||ins.rejected>ins.approved
                        return (
                          <tr key={ins.key}
                            style={{borderBottom:`1px solid ${T.gridLine}`,background:needsAttn?`${T.red}05`:'transparent'}}
                            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=needsAttn?`${T.red}08`:T.surface}
                            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=needsAttn?`${T.red}05`:'transparent'}>
                            <td className="px-4 py-3 font-semibold" style={{color:T.textMuted}}>{idx+1}</td>
                            <td className="px-4 py-3">
                              <p className="font-semibold" style={{color:T.textPrimary}}>{ins.name}</p>
                              <p className="text-[10px] font-mono" style={{color:T.textMuted}}>{ins.key.slice(-14)}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-bold" style={{color:T.textPrimary}}>{ins.totalReports}</p>
                              <p className="text-[10px]" style={{color:T.textMuted}}>
                                <span style={{color:T.green}}>{ins.approved}✓</span>
                                {' '}<span style={{color:T.amber}}>{ins.pending}⏳</span>
                                {' '}<span style={{color:T.red}}>{ins.rejected}✗</span>
                              </p>
                            </td>
                            <td className="px-4 py-3 font-bold" style={{color:T.purple,fontFamily:"'JetBrains Mono',monospace"}}>{ins.photos}</td>
                            <td className="px-4 py-3" style={{color:T.textSecondary}}>{ins.shareOfTotal}%</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{background:`${T.green}15`,color:T.green}}>{ins.transformScore}/100</span>
                            </td>
                            <td className="px-4 py-3 min-w-[130px]">
                              <button onClick={()=>setImproveModal({name:ins.name,pct:ins.improvementPct,notes:ins.improvementNotes})} className="w-full text-left">
                                <ScoreBar pct={ins.improvementPct} T={T}/>
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-[10px]" style={{color:T.green}}>{ins.aiConfirmed} confirmed</p>
                              <p className="text-[10px]" style={{color:T.red}}>{ins.aiFlagged} flagged</p>
                            </td>
                            <td className="px-4 py-3 max-w-[200px]">
                              <p className="text-[11px] leading-relaxed" style={{color:T.textSecondary}}>
                                {expandedRat[ins.key] ? ins.rationale : `${ins.rationale.slice(0,100)}${ins.rationale.length>100?'…':''}`}
                              </p>
                              {ins.rationale.length>100 && (
                                <button onClick={()=>setExpandedRat(p=>({...p,[ins.key]:!p[ins.key]}))}
                                  style={{color:T.accent,background:'none',border:'none',cursor:'pointer',padding:0,fontSize:10,fontWeight:700}}>
                                  {expandedRat[ins.key]?'Less':'More'}
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-[11px]" style={{color:T.textSecondary}}>{fmtDate(ins.latestDate)}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1.5">
                                <button onClick={()=>handleReviewOpen(ins.key)} disabled={ins.aiFlagged===0}
                                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold disabled:opacity-30"
                                  style={{background:T.accentDim,color:T.accent,border:'none',cursor:ins.aiFlagged>0?'pointer':'not-allowed'}}>
                                  <Eye className="h-3 w-3"/> Review ({ins.aiFlagged})
                                </button>
                                <button
                                  onClick={()=>setTransformView({name:ins.name,before:ins.beforeImages,after:ins.afterImages,beforeDate:ins.beforeDate,afterDate:ins.afterDate})}
                                  disabled={ins.beforeImages.length===0&&ins.afterImages.length===0}
                                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold disabled:opacity-30"
                                  style={{background:`${T.green}12`,color:T.green,border:'none',cursor:'pointer'}}>
                                  <Sparkles className="h-3 w-3"/> Before/After
                                </button>
                                <button onClick={()=>handleGenerateAI(ins)}
                                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold"
                                  style={{background:`${T.purple}12`,color:T.purple,border:'none',cursor:'pointer'}}>
                                  <FileText className="h-3 w-3"/> AI Analysis
                                </button>
                                <button onClick={()=>handleGenerateWhatsApp(ins)}
                                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold"
                                  style={{background:`${T.green}12`,color:T.green,border:'none',cursor:'pointer'}}>
                                  <MessageSquare className="h-3 w-3"/> WhatsApp
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Scoring explanation footer */}
              <div className="px-5 py-3" style={{borderTop:`1px solid ${T.gridLine}`}}>
                <div className="flex items-start gap-2">
                  <BarChart3 className="h-4 w-4 flex-shrink-0 mt-0.5" style={{color:T.accent}}/>
                  <p className="text-[10px]" style={{color:T.textMuted}}>
                    <strong style={{color:T.textSecondary}}>Improvement %:</strong> Approval rate (60%) + yes÷(yes+no) answer sentiment (30%) + photo bonus if any https:// photos exist (10%).
                    {' '}<strong style={{color:T.textSecondary}}>Transform Score:</strong> Improvement minus penalties for AI flags (−5) and rejections (−2) plus photo volume factor.
                    {' '}<strong style={{color:T.textSecondary}}>AI Flagged:</strong> Reports where answer sentiment confidence ≤35% and not yet approved — need human review.
                    {' '}<strong style={{color:T.textSecondary}}>Photos:</strong> Only https:// Firebase Storage URLs counted — local device cache paths (local:file:///) are excluded.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Improvement % Modal ── */}
        {improveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{background:'rgba(0,0,0,0.65)',backdropFilter:'blur(6px)'}}
            onClick={()=>setImproveModal(null)}>
            <div className="w-full max-w-md rounded-2xl shadow-2xl p-5"
              style={{background:T.card,border:`1px solid ${T.cardBorder}`}}
              onClick={e=>e.stopPropagation()}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{color:T.textMuted}}>Why this score</p>
                  <h3 className="text-base font-bold" style={{color:T.textPrimary}}>{improveModal.name}: {improveModal.pct}%</h3>
                </div>
                <button onClick={()=>setImproveModal(null)} className="flex items-center justify-center w-7 h-7 rounded-xl"
                  style={{background:T.surface,border:`1px solid ${T.cardBorder}`,color:T.textSecondary,cursor:'pointer'}}>
                  <X className="h-4 w-4"/>
                </button>
              </div>
              <div className="mb-4"><ScoreBar pct={improveModal.pct} T={T}/></div>
              <ul className="space-y-2">
                {improveModal.notes.map((n: string, i: number)=>(
                  <li key={i} className="flex items-start gap-2 text-sm" style={{color:T.textSecondary}}>
                    <span className="mt-0.5">•</span>{n}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ── AI Flagged Review Modal ── */}
        {reviewKey && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
            style={{background:'rgba(0,0,0,0.65)',backdropFilter:'blur(6px)'}}
            onClick={()=>{setReviewKey(null);setReviewQueue([])}}>
            <div className="w-full max-w-3xl my-8 rounded-2xl shadow-2xl overflow-hidden"
              style={{background:T.card,border:`1px solid ${T.cardBorder}`}}
              onClick={e=>e.stopPropagation()}>
              <div className="px-5 py-4 flex items-center justify-between" style={{borderBottom:`1px solid ${T.cardBorder}`}}>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{color:T.red}}>AI Flagged Review</p>
                  <h3 className="text-base font-bold" style={{color:T.textPrimary}}>{reviewKey}</h3>
                  <p className="text-xs" style={{color:T.textMuted}}>Low confidence reports — approve or reject to clear flags</p>
                </div>
                <button onClick={()=>{setReviewKey(null);setReviewQueue([])}} className="flex items-center justify-center w-8 h-8 rounded-xl"
                  style={{background:T.surface,border:`1px solid ${T.cardBorder}`,color:T.textSecondary,cursor:'pointer'}}>
                  <X className="h-4 w-4"/>
                </button>
              </div>
              <div className="p-5 space-y-3 overflow-y-auto" style={{maxHeight:600}}>
                {reviewQueue.length===0
                  ? <p className="text-sm text-center py-8" style={{color:T.textMuted}}>No flagged reports remaining.</p>
                  : reviewQueue.map(r => {
                    const answers = getAnswers(r); const photos = getPhotos(r)
                    return (
                      <div key={r.id} className="rounded-xl p-4" style={{background:T.surface,border:`1px solid ${T.cardBorder}`}}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <p className="font-semibold text-sm" style={{color:T.textPrimary}}>{r.feederPointName||'?'}</p>
                            <p className="text-[10px]" style={{color:T.textMuted}}>
                              {r.id.slice(-12)} · {fmtDT(resolveDate(r))} · {r.userName||r.submittedBy||'?'}
                            </p>
                            <div className="mt-1"><SBadge label={r.status||'pending'} color={scColor(r.status||'pending')}/></div>
                            {r.status==='approved' && <p className="text-[10px] mt-1" style={{color:T.amber}}>Previously approved — AI suggests re-check</p>}
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button onClick={()=>handleReviewUpdate(r.id,'approved')} disabled={updatingId===r.id}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-50"
                              style={{background:T.green,color:'#fff',border:'none',cursor:'pointer'}}>
                              {updatingId===r.id?'…':'Approve'}
                            </button>
                            <button onClick={()=>handleReviewUpdate(r.id,'rejected')} disabled={updatingId===r.id}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-50"
                              style={{background:T.red,color:'#fff',border:'none',cursor:'pointer'}}>
                              {updatingId===r.id?'…':'Reject'}
                            </button>
                          </div>
                        </div>
                        {answers.length>0 && (
                          <div className="space-y-1.5 mb-2">
                            {answers.map((a: any, i: number) => {
                              const ac=(a.answer||'').toString()
                              const acColor=YES.has(ac.toLowerCase())?T.green:NO.has(ac.toLowerCase())?T.red:T.textSecondary
                              const aPhotos=(a.photos||[]).filter((p:string)=>p?.startsWith('https://'))
                              return (
                                <div key={i} className="rounded-lg p-2" style={{background:T.card,border:`1px solid ${T.gridLine}`}}>
                                  <p className="text-xs font-semibold" style={{color:T.textPrimary}}>{a.description||a.questionId||`Q${i+1}`}</p>
                                  <p className="text-xs mt-0.5"><span style={{color:T.textMuted}}>Answer: </span><span style={{color:acColor}}>{ac||'?'}</span></p>
                                  {aPhotos.length>0&&(
                                    <div className="grid grid-cols-4 gap-1 mt-1.5">
                                      {aPhotos.map((u: string, pi: number)=>(
                                        <button key={pi} onClick={()=>setSelImage(u)} className="rounded-lg overflow-hidden"
                                          style={{border:`1px solid ${T.cardBorder}`,cursor:'pointer',padding:0,background:'none'}}>
                                          <img src={u} alt="" className="h-14 w-full object-cover"/>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {photos.length>0&&(
                          <div className="grid grid-cols-4 gap-1">
                            {photos.map((u: string, i: number)=>(
                              <button key={i} onClick={()=>setSelImage(u)} className="rounded-lg overflow-hidden group relative"
                                style={{border:`1px solid ${T.cardBorder}`,cursor:'pointer',padding:0,background:'none'}}>
                                <img src={u} alt="" className="h-16 w-full object-cover"/>
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                  <ZoomIn className="h-3 w-3 text-white opacity-0 group-hover:opacity-100 transition-opacity"/>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                }
              </div>
            </div>
          </div>
        )}

        {/* ── Before/After Transformation Modal ── */}
        {transformView && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
            style={{background:'rgba(0,0,0,0.65)',backdropFilter:'blur(6px)'}}
            onClick={()=>setTransformView(null)}>
            <div className="w-full max-w-4xl my-8 rounded-2xl shadow-2xl overflow-hidden"
              style={{background:T.card,border:`1px solid ${T.cardBorder}`}}
              onClick={e=>e.stopPropagation()}>
              <div className="px-5 py-4 flex items-center justify-between" style={{borderBottom:`1px solid ${T.cardBorder}`}}>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{color:T.textMuted}}>Transformation View</p>
                  <h3 className="text-base font-bold" style={{color:T.textPrimary}}>{transformView.name}</h3>
                  <p className="text-xs" style={{color:T.textMuted}}>Earliest vs latest https:// photos to show how the site changed over time</p>
                </div>
                <button onClick={()=>setTransformView(null)} className="flex items-center justify-center w-8 h-8 rounded-xl"
                  style={{background:T.surface,border:`1px solid ${T.cardBorder}`,color:T.textSecondary,cursor:'pointer'}}>
                  <X className="h-4 w-4"/>
                </button>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                {[{label:'Before',color:T.amber,imgs:transformView.before,date:transformView.beforeDate},
                  {label:'After', color:T.green, imgs:transformView.after, date:transformView.afterDate}].map(p=>(
                  <div key={p.label} className="rounded-xl p-3" style={{background:T.surface,border:`1px solid ${T.cardBorder}`}}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold" style={{color:p.color}}>{p.label}</p>
                      <p className="text-xs" style={{color:T.textMuted}}>{fmtDate(p.date)}</p>
                    </div>
                    {p.imgs.length===0
                      ? <p className="text-xs py-6 text-center" style={{color:T.textMuted}}>No https:// photos found for this period.</p>
                      : <div className="grid grid-cols-3 gap-1.5">
                          {p.imgs.map((u: string, i: number)=>(
                            <button key={i} onClick={()=>setSelImage(u)} className="rounded-xl overflow-hidden group relative"
                              style={{border:`1px solid ${T.cardBorder}`,cursor:'pointer',padding:0,background:'none'}}>
                              <img src={u} alt="" className="h-28 w-full object-cover"/>
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity"/>
                              </div>
                            </button>
                          ))}
                        </div>
                    }
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── AI Analysis Modal ── */}
        {aiModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
            style={{background:'rgba(0,0,0,0.65)',backdropFilter:'blur(6px)'}}
            onClick={()=>{setAiModal(null);setAiResult(null);setAiError(null)}}>
            <div className="w-full max-w-2xl my-8 rounded-2xl shadow-2xl overflow-hidden"
              style={{background:T.card,border:`1px solid ${T.cardBorder}`}}
              onClick={e=>e.stopPropagation()}>
              <div className="px-5 py-4 flex items-center justify-between" style={{borderBottom:`1px solid ${T.cardBorder}`}}>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{background:`${T.purple}15`}}>
                    <FileText className="h-4 w-4" style={{color:T.purple}}/>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{color:T.textMuted}}>AI Analysis</p>
                    <h3 className="text-base font-bold" style={{color:T.textPrimary}}>{aiModal.name}</h3>
                  </div>
                </div>
                <button onClick={()=>{setAiModal(null);setAiResult(null);setAiError(null)}}
                  className="flex items-center justify-center w-8 h-8 rounded-xl"
                  style={{background:T.surface,border:`1px solid ${T.cardBorder}`,color:T.textSecondary,cursor:'pointer'}}>
                  <X className="h-4 w-4"/>
                </button>
              </div>
              <div className="p-5">
                {aiLoading ? (
                  <div className="flex items-center justify-center py-12 gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-t-transparent"
                      style={{borderColor:`${T.purple}30`,borderTopColor:T.purple}}/>
                    <p className="text-sm font-semibold" style={{color:T.textSecondary}}>Generating AI analysis…</p>
                  </div>
                ) : aiError ? (
                  <div className="rounded-xl px-4 py-3 flex items-center gap-2" style={{background:`${T.red}10`,border:`1px solid ${T.red}30`}}>
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{color:T.red}}/>
                    <p className="text-sm" style={{color:T.red}}>{aiError}</p>
                  </div>
                ) : aiResult ? (
                  <div className="space-y-4">
                    <div className="rounded-xl p-4" style={{background:T.surface,border:`1px solid ${T.cardBorder}`}}>
                      <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{color:T.purple}}>Analysis Report</p>
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed" style={{color:T.textSecondary,fontFamily:'inherit'}}>{aiResult}</pre>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={()=>{const blob=new Blob([aiResult],{type:'text/plain'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=`AI_Analysis_${sanitize(aiModal.name)}.txt`;a.click();URL.revokeObjectURL(u)}}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{background:T.green,color:'#fff',border:'none',cursor:'pointer'}}>
                        <Download className="h-3.5 w-3.5"/> Download TXT
                      </button>
                      <button onClick={()=>navigator.clipboard.writeText(aiResult).then(()=>alert('Copied to clipboard!'))}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{background:T.accentDim,border:`1px solid ${T.accentBorder}`,color:T.accent,cursor:'pointer'}}>
                        <FileText className="h-3.5 w-3.5"/> Copy Text
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* ── WhatsApp Report Modal ── */}
        {waModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
            style={{background:'rgba(0,0,0,0.65)',backdropFilter:'blur(6px)'}}
            onClick={()=>{setWaModal(null);setWaReport(null)}}>
            <div className="w-full max-w-lg my-8 rounded-2xl shadow-2xl overflow-hidden"
              style={{background:T.card,border:`1px solid ${T.cardBorder}`}}
              onClick={e=>e.stopPropagation()}>
              <div className="px-5 py-4 flex items-center justify-between" style={{borderBottom:`1px solid ${T.cardBorder}`}}>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{background:'#25D36615'}}>
                    <MessageSquare className="h-4 w-4" style={{color:'#25D366'}}/>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{color:T.textMuted}}>WhatsApp Report</p>
                    <h3 className="text-base font-bold" style={{color:T.textPrimary}}>{waModal.name}</h3>
                  </div>
                </div>
                <button onClick={()=>{setWaModal(null);setWaReport(null)}}
                  className="flex items-center justify-center w-8 h-8 rounded-xl"
                  style={{background:T.surface,border:`1px solid ${T.cardBorder}`,color:T.textSecondary,cursor:'pointer'}}>
                  <X className="h-4 w-4"/>
                </button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs" style={{color:T.textMuted}}>
                  Short formatted report ready to share on WhatsApp. Click "Send on WhatsApp" to open the app with the message pre-filled.
                </p>
                {waReport && (
                  <>
                    <div className="rounded-xl p-4 max-h-80 overflow-y-auto"
                      style={{background:T.surface,border:`1px solid ${T.cardBorder}`,fontFamily:'monospace'}}>
                      <pre className="whitespace-pre-wrap text-xs leading-relaxed" style={{color:T.textPrimary}}>
                        {waReport}
                      </pre>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={()=>handleOpenWhatsApp(waReport)}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold"
                        style={{background:'#25D366',color:'#fff',border:'none',cursor:'pointer'}}>
                        <Send className="h-4 w-4"/> Send on WhatsApp
                      </button>
                      <button onClick={()=>navigator.clipboard.writeText(waReport).then(()=>alert('Copied!'))}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold"
                        style={{background:T.accentDim,border:`1px solid ${T.accentBorder}`,color:T.accent,cursor:'pointer'}}>
                        <FileText className="h-3.5 w-3.5"/> Copy
                      </button>
                    </div>
                    <p className="text-[10px]" style={{color:T.textMuted}}>
                      WhatsApp formatting: *bold*, _italic_ — renders correctly in WhatsApp. The link opens wa.me which works on both mobile and desktop.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Lightbox ── */}
        {selImage && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{background:'rgba(0,0,0,0.92)'}} onClick={()=>setSelImage(null)}>
            <button onClick={()=>setSelImage(null)} className="absolute top-6 right-6 flex items-center justify-center w-10 h-10 rounded-full"
              style={{background:'rgba(255,255,255,0.15)',border:'none',cursor:'pointer',color:'#fff'}}>
              <X className="h-5 w-5"/>
            </button>
            <img src={selImage} alt="Preview" className="max-h-[88vh] max-w-[95vw] object-contain rounded-xl shadow-2xl" onClick={e=>e.stopPropagation()}/>
          </div>
        )}

      </div>
    </>
  )
}