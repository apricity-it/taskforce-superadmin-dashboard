/**
 * Vani — Taskforce AI Assistant (Gemini Edition)
 * ================================================
 * Features:
 *  - Gemini 1.5 Pro as the AI backend (replaces OpenAI)
 *  - Full offline fallback — 7 query types work with NO API key
 *  - "Hello Vani" wake word activates voice mode
 *  - Voice input via Web Speech API
 *  - Voice reply via Web Speech Synthesis
 *  - Live Taskforce MCP data context (read-only)
 *  - Excel export via xlsx
 *  - PDF export via jsPDF
 *  - Floating bubble bottom-right on every page
 *
 * SETUP (3 steps):
 *  1. Add to .env.local:
 *       NEXT_PUBLIC_GEMINI_API_KEY=AIza...
 *  2. npm install jspdf   (for PDF export)
 *  3. Import in pages/_app.tsx:
 *       import TaskforceAssistant from '@/components/TaskforceAssistant'
 *       // Inside JSX return: <TaskforceAssistant />
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isVoice?: boolean;
  timestamp: Date;
}

interface TaskforceSnapshot {
  totalFeederPoints: number;
  activeFeederPoints: number;
  maintenanceFeederPoints: number;
  inactiveFeederPoints: number;
  chronicPoints: number;
  regularFeederPoints: number;
  eliminatedPoints: number;
  feederPointNames: string[];
  feederPointsByZone: Record<string, number>;
  feederPointsByTeam: Record<string, number>;
  pendingReports: number;
  approvedReports: number;
  rejectedReports: number;
  requiresActionReports: number;
  actionTakenReports: number;
  totalComplianceReports: number;
  inProgressShifts: number;
  completedShifts: number;
  pendingFeederPointRequests: number;
  pendingFrequencyRequests: number;
  pendingAccessRequests: number;
  totalTeams: number;
  teams: Array<{ name: string; memberCount: number; feederPointCount: number }>;
  zones: string[];
  totalActiveUsers: number;
  usersByRole: Record<string, number>;
  fetchedAt: string;
  fetchDurationMs: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WAKE_WORD = 'vaani';
const GEMINI_MODEL = 'gemini-1.5-pro';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ─── Offline Fallback Responses ───────────────────────────────────────────────

const OFFLINE_RESPONSES: Record<string, string> = {
  work_summary: `📊 May 2025 — Field Work Summary

Overall performance across 3 tracked field workers:

1. Abhishek Raju Gaikwad
   • 3-trip completions: 18/31 days (58%)
   • Active on: 1–6, 8–10, 12–13, 15, 17–19, 22–24 May
   • Avg. feeder points/active day: 4.5
   • Missing 3 trips: 13 days (7, 11, 14, 16, 20–21, 25–31 May)

2. Tejaswini Mahadev Sable
   • 3-trip completions: 17/31 days (55%)
   • Active on: 1–2, 5–9, 12–15, 23, 25, 27–28, 30–31 May
   • Avg. feeder points/active day: 4.7
   • Missing 3 trips: 14 days (3–4, 10–11, 16–22, 24, 26, 29 May)

3. Satyam Mahadev Kamble
   • 3-trip completions: 16/31 days (52%)
   • Active on: 1, 3–9, 12–15, 18–19, 21–22 May
   • Avg. feeder points/active day: 6.9 ← highest volume per day
   • Missing 3 trips: 15 days (2, 10–11, 16–17, 20, 23–31 May)
   • ⚠️ No activity at all in last 9 days of May (23–31)

💡 Suggestion: Ask "chronic point inspection summary" to review shift coverage during the inactive period.`,

  pending: `📋 Compliance Reports — Pending

As of the latest snapshot:
• Total compliance reports: 200+
• Pending (awaiting supervisor review): 200+
• These are field inspection submissions not yet reviewed

Common reasons reports stay pending:
– Supervisor backlog during high-volume periods
– Reports submitted outside working hours
– Awaiting GPS/photo verification

💡 Suggestion: Ask "action required" to see reports flagged for field follow-up.`,

  approved: `✅ Approved Compliance Reports

Approved reports are field submissions reviewed and signed off by supervisors.

Report flow in Taskforce:
  Submitted → Pending → Approved ✅
                      → Rejected ❌
                      → Requires Action 🔔 → Action Taken ✔️

• Zone 1 (Bhawanipeth/Kasbapeth): active approval workflows
• Zone 5 (Viman Nagar/Bibvewadi): active approval workflows
• Live count: reconnect Gemini API or MCP for real-time figures

💡 Suggestion: Ask "work summary" for field worker performance breakdown.`,

  action_required: `🔔 Reports — Requires Action & Action Taken

"Requires Action" = supervisor flagged an issue needing field follow-up
"Action Taken" = field worker has resolved the flagged issue

Common reasons for "requires action" flag:
  – Feeder point photo unclear or missing
  – Trip not completed at correct GPS location
  – Chronic point shift not logged properly
  – Discrepancy between GPS location and reported feeder point
  – Incomplete inspection data

Workers to check:
  • All 3 workers had reduced activity May 23–31
  • Satyam had zero activity May 23–31 — any shift reports from that week should be audited

💡 Suggestion: Ask "shift summary" to check chronic point shift coverage.`,

  zone_wise: `📍 Zone-wise Feeder Point Summary

Taskforce operates across 2 active zones:

🟢 Zone 1 — Bhawanipeth / Kasbapeth Area
  Teams: Bhawanipeth (11 members), Kasbapeth (9 members)
  Regular feeder points:
    • Sapika Fidder Point Bhavani Peth
    • Ramoshi Gate Feeder Point
    • KEM Feeder Point
    • Market Yard
    • Bank of Baroda / Bank of Maharashtra
    • Sujay Garden, Harka Nagar FP
    • Juna Motor Stand FP, Pangul Ali FP
    • Burudi Pull FP, Palkhi Chouk FP
  Chronic points: Durga Mata Mandir, Zercon, Sanjay Park Back Side

🔵 Zone 5 — Viman Nagar / Bibvewadi Area
  Teams: Viman Nagar team, Bibvewadi team
  Chronic points: Sakore Nagar, Yamuna Nagar, Mhada Colony, Lunkad Daffodils

📊 Totals:
  • Active feeder points: 72
  • Eliminated points: 18
  • Chronic points: 10 (shift-based)

💡 Suggestion: Ask "chronic point inspection summary" for chronic point details.`,

  shift_summary: `🔄 Shift Report Summary

Shift reports cover chronic inspection points — these use a shift-based model, not the standard 3-trip model.

Chronic points on shift rotation (10 total across Zone 1 & Zone 5):
  Zone 1: Durga Mata Mandir, Zercon, Sanjay Park Back Side
  Zone 5: Sakore Nagar, Yamuna Nagar, Mhada Colony, Lunkad Daffodils
  + 3 more chronic points on record

Shift status:
  • In Progress: active during working hours
  • Completed: shift closed with full inspection log

Worker shift note:
  • Satyam Mahadev Kamble covers 6.9 avg feeder points/day — likely handling chronic point shifts alongside regular trips
  • All 3 workers show reduced/zero activity May 23–31 — shift coverage in this period needs audit

💡 Suggestion: Ask "work summary" to see exact active days per worker.`,

  chronic: `⚠️ Chronic Point Inspection Summary

Chronic points are persistent problem locations requiring dedicated shift-based inspection (not 3-trip model).

📍 All 10 Chronic Points:

Zone 1 — Bhawanipeth/Kasbapeth:
  1. Durga Mata Mandir Chronic Point
  2. Zercon Chronic Point
  3. Sanjay Park Back Side Chronic Point

Zone 5 — Viman Nagar/Bibvewadi:
  4. Sakore Nagar Chronic Point
  5. Yamuna Nagar Chronic Point
  6. Mhada Colony Chronic Point
  7. Lunkad Daffodils Chronic Point
  8–10. (3 additional chronic points on record)

Inspection model:
  • Chronic points → shift reports (not trip completion)
  • Assigned to a team for ongoing monitoring
  • Continuous coverage required, not 3-trip based

🔴 Risk flag: With all 3 workers inactive May 23–31, chronic point shift coverage during that week should be urgently audited.

💡 Suggestion: Ask "zone wise summary" to see which team covers which chronic points.`,
};

function classifyOffline(text: string): string | null {
  const q = text.toLowerCase().trim();
  if (q.includes('work') || q.includes('performance') || q.includes('summary') ||
      q.includes('abhishek') || q.includes('tejaswini') || q.includes('satyam') ||
      q.includes('trip') || q.includes('worker')) return 'work_summary';
  if (q.includes('approved')) return 'approved';
  if (q.includes('action') || q.includes('require') || q.includes('flag')) return 'action_required';
  if (q.includes('pending') || q.includes('report') || q.includes('compliance')) return 'pending';
  if (q.includes('zone') || q.includes('location') || q.includes('area') || q.includes('bhawani') || q.includes('viman')) return 'zone_wise';
  if (q.includes('shift')) return 'shift_summary';
  if (q.includes('chronic') || q.includes('inspection')) return 'chronic';
  return null;
}

// ─── Live Data Fetcher ────────────────────────────────────────────────────────

async function fetchTaskforceSnapshot(): Promise<TaskforceSnapshot | null> {
  try {
    const res = await fetch('/api/taskforce-snapshot', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as TaskforceSnapshot;
  } catch (err) {
    console.warn('[Vani] Could not load live snapshot:', err);
    return null;
  }
}

// ─── System Prompt Builder ────────────────────────────────────────────────────

function buildSystemPrompt(snapshot: TaskforceSnapshot | null): string {
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const zoneBreakdown = snapshot
    ? Object.entries(snapshot.feederPointsByZone ?? {}).map(([z, c]) => `${z}: ${c}`).join(', ') || 'N/A'
    : 'N/A';

  const teamBreakdown = snapshot
    ? (snapshot.teams ?? []).map((t) => `${t.name} (${t.memberCount} members, ${t.feederPointCount} FPs)`).join(' | ') || 'N/A'
    : 'N/A';

  const roleBreakdown = snapshot
    ? Object.entries(snapshot.usersByRole ?? {}).map(([r, c]) => `${r}: ${c}`).join(', ') || 'N/A'
    : 'N/A';

  return `You are Vani, the intelligent AI assistant for Taskforce — a field inspection and compliance management system used by Pune Municipal Corporation (PMC).

You answer questions about: feeder points, chronic inspection points, compliance reports, shift reports, teams, field workers, requests, zones, and active users.

${!snapshot
    ? '⚠️ Live database snapshot unavailable. Answer from general Taskforce knowledge only.'
    : `LIVE DATABASE SNAPSHOT (fetched: ${snapshot.fetchedAt}, ${snapshot.fetchDurationMs}ms)

FEEDER POINTS:
- Total: ${snapshot.totalFeederPoints} | Active: ${snapshot.activeFeederPoints} | Maintenance: ${snapshot.maintenanceFeederPoints} | Inactive: ${snapshot.inactiveFeederPoints}
- Regular (trip-based): ${snapshot.regularFeederPoints} | Chronic (shift-based): ${snapshot.chronicPoints} | Eliminated: ${snapshot.eliminatedPoints}
- By zone: ${zoneBreakdown}
- Sample names: ${snapshot.feederPointNames.slice(0, 10).join(', ')}

COMPLIANCE REPORTS:
- Total: ${snapshot.totalComplianceReports} | Pending: ${snapshot.pendingReports} | Approved: ${snapshot.approvedReports}
- Rejected: ${snapshot.rejectedReports} | Requires action: ${snapshot.requiresActionReports} | Action taken: ${snapshot.actionTakenReports}

SHIFT REPORTS: In progress: ${snapshot.inProgressShifts} | Completed: ${snapshot.completedShifts}

PENDING REQUESTS: New FP: ${snapshot.pendingFeederPointRequests} | Frequency change: ${snapshot.pendingFrequencyRequests} | Access: ${snapshot.pendingAccessRequests}

TEAMS (${snapshot.totalTeams} total): ${teamBreakdown}

ZONES: ${snapshot.zones.join(', ')}

USERS: ${snapshot.totalActiveUsers} active | By role: ${roleBreakdown}`
  }

FIELD WORKER DATA (May 2025):
- Abhishek Raju Gaikwad: 18/31 days with 3 trips (58%), avg 4.5 FP/day, missing trips on 13 days (7,11,14,16,20-21,25-31 May)
- Tejaswini Mahadev Sable: 17/31 days with 3 trips (55%), avg 4.7 FP/day, missing trips on 14 days (3-4,10-11,16-22,24,26,29 May)
- Satyam Mahadev Kamble: 16/31 days with 3 trips (52%), avg 6.9 FP/day (highest), missing trips on 15 days (2,10-11,16-17,20,23-31 May), no activity last week of May

BEHAVIOR RULES:
- Use ONLY numbers from the snapshot above — never invent figures
- Be concise: 2–4 sentences for simple queries, up to 8 for complex
- For voice: keep answers under 3 sentences
- When asked to export, say "I'll prepare that download for you right now!"
- Always end with one useful follow-up suggestion
- Today: ${today}
- You are Vani — professional, friendly, sharp`;
}

// ─── Excel Export ─────────────────────────────────────────────────────────────

function exportToExcel(snapshot: TaskforceSnapshot) {
  const summaryData = [
    ['Taskforce Dashboard Export', ''],
    ['Generated At', snapshot.fetchedAt],
    ['', ''],
    ['FEEDER POINT SUMMARY', ''],
    ['Total Feeder Points', snapshot.totalFeederPoints],
    ['Active Points', snapshot.activeFeederPoints],
    ['Chronic Points', snapshot.chronicPoints],
    ['Eliminated Points', snapshot.eliminatedPoints],
    ['', ''],
    ['COMPLIANCE REPORTS', ''],
    ['Total Reports', snapshot.totalComplianceReports],
    ['Pending', snapshot.pendingReports],
    ['Approved', snapshot.approvedReports],
    ['Rejected', snapshot.rejectedReports],
    ['Requires Action', snapshot.requiresActionReports],
    ['Action Taken', snapshot.actionTakenReports],
    ['', ''],
    ['ZONES', snapshot.zones.join(', ')],
    ['', ''],
    ['FEEDER POINTS (sample)', ''],
    ...snapshot.feederPointNames.map((name) => [name, 'Active']),
  ];

  const ws = XLSX.utils.aoa_to_sheet(summaryData);
  ws['!cols'] = [{ wch: 40 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dashboard Summary');

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `taskforce-report-${date}.xlsx`);
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

async function exportToPDF(snapshot: TaskforceSnapshot) {
  const { default: jsPDF } = await import('jspdf').catch(() => {
    alert('PDF export requires jsPDF. Run: npm install jspdf');
    return { default: null as unknown as typeof import('jspdf').default };
  });
  if (!jsPDF) return;

  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Taskforce Dashboard Report', 20, 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(`Generated: ${snapshot.fetchedAt}`, 20, 28);
  doc.setTextColor(0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Feeder Points', 20, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);

  const rows = [
    ['Total Feeder Points', String(snapshot.totalFeederPoints)],
    ['Active Points', String(snapshot.activeFeederPoints)],
    ['Chronic Points', String(snapshot.chronicPoints)],
    ['Eliminated Points', String(snapshot.eliminatedPoints)],
    ['Pending Reports', String(snapshot.pendingReports)],
    ['Zones', snapshot.zones.join(', ')],
  ];

  let y = 50;
  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label + ':', 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 90, y);
    y += 8;
  });

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Feeder Points (sample)', 20, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  snapshot.feederPointNames.slice(0, 12).forEach((name) => {
    doc.text(`• ${name}`, 24, y);
    y += 7;
  });

  const date = new Date().toISOString().slice(0, 10);
  doc.save(`taskforce-report-${date}.pdf`);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TaskforceAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [wakeWordActive, setWakeWordActive] = useState(false);
  const [snapshot, setSnapshot] = useState<TaskforceSnapshot | null>(null);
  const [hasUnread, setHasUnread] = useState(true);
  const [apiMode, setApiMode] = useState<'gemini' | 'offline'>('offline');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wakeRecognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const conversationRef = useRef<{ role: string; content: string }[]>([]);

  // Read Gemini key from environment (NEXT_PUBLIC_ prefix makes it available client-side)
  const GEMINI_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

  // ── Fetch live snapshot on mount ────────────────────────────────────────────

  useEffect(() => {
    fetchTaskforceSnapshot().then(setSnapshot);
    if (GEMINI_KEY) setApiMode('gemini');
  }, [GEMINI_KEY]);

  // ── Speech synthesis init ────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Speak text via browser TTS ───────────────────────────────────────────────

  const speakText = useCallback((text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const clean = text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#+\s/g, '').replace(/•/g, '');
    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = 'en-IN';
    utt.rate = 1.05;
    utt.pitch = 1;
    const voices = synthRef.current.getVoices();
    const preferred = voices.find(
      (v) => v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Google'))
    );
    if (preferred) utt.voice = preferred;
    utt.onstart = () => setIsSpeaking(true);
    utt.onend = () => {
      setIsSpeaking(false);
      if (isVoiceMode) setTimeout(() => startMainRecording(true), 600);
    };
    synthRef.current.speak(utt);
  }, [isVoiceMode]);

  // ── Add message helper ───────────────────────────────────────────────────────

  const addMessage = useCallback((role: 'user' | 'assistant', text: string, isVoice = false) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        role,
        text,
        isVoice,
        timestamp: new Date(),
      },
    ]);
  }, []);

  // ── Gemini API call ──────────────────────────────────────────────────────────

  const askGemini = useCallback(
    async (userText: string, isVoice = false) => {
      const systemPrompt = buildSystemPrompt(snapshot);
      conversationRef.current.push({ role: 'user', content: userText });
      setIsLoading(true);

      // Build Gemini contents array (alternating user/model turns)
      const contents = [
        // Inject system prompt as first user turn
        { role: 'user', parts: [{ text: systemPrompt + '\n\nUser: ' + userText }] },
      ];

      // Add prior conversation (last 8 turns)
      const history = conversationRef.current.slice(-9, -1);
      const geminiHistory = history.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

      const finalContents = geminiHistory.length > 0
        ? [contents[0], ...geminiHistory, { role: 'user', parts: [{ text: userText }] }]
        : contents;

      // Detect key type: AIzaSy = API key, AQ. = OAuth Bearer token
      const isOAuthToken = GEMINI_KEY.startsWith('AQ.');
      const fetchUrl = isOAuthToken ? GEMINI_API_URL : `${GEMINI_API_URL}?key=${GEMINI_KEY}`;
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isOAuthToken) authHeaders['Authorization'] = `Bearer ${GEMINI_KEY}`;

      try {
        const response = await fetch(fetchUrl, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            contents: finalContents,
            generationConfig: {
              maxOutputTokens: 600,
              temperature: 0.4,
              topP: 0.9,
            },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            ],
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(`Gemini error ${response.status}: ${JSON.stringify(errData)}`);
        }

        const data = await response.json();
        const reply: string =
          data?.candidates?.[0]?.content?.parts?.[0]?.text ||
          'Sorry, I could not get a response from Gemini.';

        conversationRef.current.push({ role: 'assistant', content: reply });
        addMessage('assistant', reply, false);
        if (isVoice || isVoiceMode) speakText(reply);
      } catch (err) {
        console.error('[Vani] Gemini error:', err);
        // Graceful fallback to offline mode
        const offlineKey = classifyOffline(userText);
        if (offlineKey && OFFLINE_RESPONSES[offlineKey]) {
          const offlineReply = OFFLINE_RESPONSES[offlineKey] + '\n\n_(Gemini unavailable — showing offline data)_';
          addMessage('assistant', offlineReply, false);
          if (isVoice || isVoiceMode) speakText(offlineReply);
        } else {
          addMessage('assistant', `⚠️ Gemini API error. Check your API key in .env.local.\n\nError: ${String(err)}\n\nTip: Try "work summary", "pending reports", or "zone wise" for offline answers.`, false);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [snapshot, GEMINI_KEY, isVoiceMode, speakText, addMessage]
  );

  // ── Offline handler ──────────────────────────────────────────────────────────

  const askOffline = useCallback(
    (userText: string, isVoice = false) => {
      const key = classifyOffline(userText);
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
        if (key && OFFLINE_RESPONSES[key]) {
          addMessage('assistant', OFFLINE_RESPONSES[key], false);
          if (isVoice || isVoiceMode) speakText(OFFLINE_RESPONSES[key]);
        } else {
          const helpMsg = `I'm Vani in offline mode. I can answer:\n\n• "work summary" — May 2025 worker performance\n• "pending reports" — compliance report status\n• "approved reports" — approved submissions\n• "action required" — flagged reports\n• "zone wise summary" — Zone 1 & Zone 5 breakdown\n• "shift summary" — chronic point shifts\n• "chronic point inspection" — chronic point details\n\nAdd your Gemini API key to .env.local for full AI responses!`;
          addMessage('assistant', helpMsg, false);
          if (isVoice || isVoiceMode) speakText(helpMsg);
        }
      }, 600);
    },
    [isVoiceMode, speakText, addMessage]
  );

  // ── Main ask dispatcher ──────────────────────────────────────────────────────

  const ask = useCallback(
    (userText: string, isVoice = false) => {
      if (apiMode === 'gemini' && GEMINI_KEY) {
        askGemini(userText, isVoice);
      } else {
        askOffline(userText, isVoice);
      }
    },
    [apiMode, GEMINI_KEY, askGemini, askOffline]
  );

  // ── Send text message ────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    if (text.toLowerCase().includes('excel') || text.toLowerCase().includes('download excel')) {
      addMessage('user', text, false);
      addMessage('assistant', 'Generating your Excel report now...', false);
      if (snapshot) exportToExcel(snapshot);
      setInputText('');
      return;
    }

    if (text.toLowerCase().includes('pdf') || text.toLowerCase().includes('download pdf')) {
      addMessage('user', text, false);
      addMessage('assistant', 'Generating your PDF report now...', false);
      if (snapshot) exportToPDF(snapshot);
      setInputText('');
      return;
    }

    addMessage('user', text, false);
    setInputText('');
    ask(text, false);
  }, [inputText, isLoading, snapshot, ask, addMessage]);

  // ── Wake word listener ───────────────────────────────────────────────────────

  const startWakeWordListener = useCallback(() => {
    const SpeechRec =
      (window as typeof window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRec) return;

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-IN';

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript.toLowerCase()).join(' ');
      if (transcript.includes(WAKE_WORD)) {
        rec.stop();
        setIsOpen(true);
        setIsVoiceMode(true);
        setWakeWordActive(true);
        setTimeout(() => {
          speakText("Hello! I'm Vani. How can I help you with Taskforce today?");
          setWakeWordActive(false);
          startMainRecording(true);
        }, 400);
      }
    };

    rec.onerror = () => setTimeout(() => startWakeWordListener(), 2000);
    rec.onend = () => { if (!isRecording) setTimeout(() => startWakeWordListener(), 500); };

    wakeRecognitionRef.current = rec;
    try { rec.start(); } catch (_) { /* blocked before user gesture */ }
  }, [isRecording, speakText]);

  useEffect(() => {
    const timer = setTimeout(() => startWakeWordListener(), 1500);
    return () => clearTimeout(timer);
  }, [startWakeWordListener]);

  // ── Start main voice recording ───────────────────────────────────────────────

  const startMainRecording = useCallback(
    (autoSend = false) => {
      const SpeechRec =
        (window as typeof window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
        (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
      if (!SpeechRec) return;

      wakeRecognitionRef.current?.stop();

      const rec = new SpeechRec();
      rec.lang = 'en-IN';
      rec.continuous = false;
      rec.interimResults = true;

      rec.onresult = (e: SpeechRecognitionEvent) => {
        const transcript = Array.from(e.results).map((r) => r[0].transcript).join('');
        setInputText(transcript);
        if (e.results[e.results.length - 1].isFinal && autoSend && transcript.trim()) {
          setIsRecording(false);
          rec.stop();
          addMessage('user', transcript.trim(), true);
          ask(transcript.trim(), true);
        }
      };

      rec.onerror = () => { setIsRecording(false); startWakeWordListener(); };
      rec.onend = () => { setIsRecording(false); if (!isSpeaking && !autoSend) startWakeWordListener(); };

      recognitionRef.current = rec;
      setIsRecording(true);
      rec.start();
    },
    [ask, isSpeaking, startWakeWordListener, addMessage]
  );

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

  // ── Toggle panel ─────────────────────────────────────────────────────────────

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setHasUnread(false);
    startWakeWordListener();
    if (messages.length === 0) {
      const modeLabel = GEMINI_KEY ? '**Gemini 1.5 Pro** powered' : '**offline mode**';
      addMessage(
        'assistant',
        `Hello! I'm **Vani**, your Taskforce AI assistant.\n\nRunning in ${modeLabel}. I have access to your ${snapshot?.totalFeederPoints ?? '72'} feeder points, compliance reports, teams, and May 2025 field worker data.\n\nSay **"Hello Vani"** anytime to activate by voice! 🎤`,
        false
      );
    }
  }, [messages.length, snapshot, startWakeWordListener, GEMINI_KEY, addMessage]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    stopRecording();
    setIsVoiceMode(false);
    synthRef.current?.cancel();
    setIsSpeaking(false);
  }, [stopRecording]);

  // ── Quick chips ───────────────────────────────────────────────────────────────

  const quickChips = [
    { label: '📊 Work summary', q: 'work summary' },
    { label: '📋 Pending reports', q: 'pending reports' },
    { label: '📍 Zone wise', q: 'zone wise summary' },
    { label: '🔄 Shift summary', q: 'shift summary' },
    { label: '⚠️ Chronic points', q: 'chronic point inspection summary' },
    { label: '⬇️ Excel', q: 'download excel' },
    { label: '📄 PDF', q: 'download pdf' },
  ];

  const handleChip = (q: string) => {
    if (q === 'download excel') {
      addMessage('user', q, false);
      addMessage('assistant', 'Generating your Excel report...', false);
      if (snapshot) exportToExcel(snapshot);
      return;
    }
    if (q === 'download pdf') {
      addMessage('user', q, false);
      addMessage('assistant', 'Generating your PDF report...', false);
      if (snapshot) exportToPDF(snapshot);
      return;
    }
    addMessage('user', q, false);
    ask(q, false);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating Bubble */}
      <button
        onClick={isOpen ? handleClose : handleOpen}
        aria-label={isOpen ? 'Close Vani' : 'Open Vani'}
        style={{
          position: 'fixed', bottom: '24px', right: '24px',
          width: '88px', height: '88px', borderRadius: '50%',
          overflow: 'hidden', border: 'none', background: 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 9999, padding: 0,
          boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
        }}
      >
        <img
          src="/assets/vani.png"
          alt="Vani Assistant"
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            borderRadius: '50%', transform: 'scale(1.42)',
            filter: 'drop-shadow(0 0 12px rgba(80,180,255,0.6))',
          }}
        />
        {hasUnread && !isOpen && (
          <span style={{
            position: 'absolute', top: '-2px', right: '-2px',
            width: '16px', height: '16px', borderRadius: '50%',
            background: '#E24B4A', border: '2px solid #fff',
            fontSize: '9px', color: '#fff', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontWeight: 700,
          }}>1</span>
        )}
      </button>

      {/* Tooltip */}
      {!isOpen && (
        <div style={{
          position: 'fixed', bottom: '42px', right: '105px',
          background: '#fff', border: '1px solid #ddd', borderRadius: '14px',
          padding: '10px 16px', fontSize: '14px', fontWeight: 500,
          color: '#333', whiteSpace: 'nowrap', zIndex: 9998,
          boxShadow: '0 4px 14px rgba(0,0,0,0.12)', pointerEvents: 'none',
          display: 'flex', alignItems: 'center', height: '44px',
        }}>
          Say "Hello Vani" or click to chat
        </div>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Vani AI Assistant"
          style={{
            position: 'fixed', bottom: '92px', right: '24px',
            width: '375px', height: '540px',
            background: '#fff', border: '0.5px solid #ddd',
            borderRadius: '20px', display: 'flex', flexDirection: 'column',
            overflow: 'hidden', zIndex: 9998,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            fontFamily: "'DM Sans', -apple-system, sans-serif",
          }}
        >
          {/* Header */}
          <div style={{
            background: '#1D9E75', padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
          }}>
            <div style={{
              width: '42px', height: '42px', minWidth: '42px',
              borderRadius: '50%', overflow: 'hidden',
              background: 'rgba(255,255,255,0.12)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
            }}>
              <img
                src="/assets/vani.png"
                alt="Vani"
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  borderRadius: '50%', transform: 'scale(1.42)',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>Vani</div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: '#9FE1CB', display: 'inline-block',
                  animation: 'pulse 2s infinite',
                }} />
                {isSpeaking ? 'Speaking...' : isRecording ? 'Listening...' : apiMode === 'gemini' ? 'Live · Gemini 1.5 Pro' : 'Offline mode'}
              </div>
            </div>

            {/* API mode badge */}
            <span style={{
              fontSize: '10px', padding: '3px 7px', borderRadius: '10px',
              background: apiMode === 'gemini' ? 'rgba(255,255,255,0.2)' : 'rgba(255,200,0,0.25)',
              color: '#fff', fontWeight: 600,
            }}>
              {apiMode === 'gemini' ? '⚡ Gemini' : '📦 Offline'}
            </span>

            {isSpeaking && (
              <button
                onClick={() => { synthRef.current?.cancel(); setIsSpeaking(false); }}
                style={{
                  background: 'rgba(255,255,255,0.15)', border: 'none',
                  borderRadius: '8px', color: '#fff', fontSize: '11px',
                  padding: '4px 8px', cursor: 'pointer',
                }}
              >🔇 Stop</button>
            )}

            <button
              onClick={handleClose}
              aria-label="Close"
              style={{
                background: 'none', border: 'none',
                color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                fontSize: '18px', padding: '4px', borderRadius: '6px',
              }}
            >✕</button>
          </div>

          {/* Quick chips */}
          {messages.length <= 1 && (
            <div style={{
              padding: '8px 12px 0', display: 'flex', gap: '6px',
              overflowX: 'auto', flexShrink: 0, scrollbarWidth: 'none',
            }}>
              {quickChips.map((chip) => (
                <button
                  key={chip.q}
                  onClick={() => handleChip(chip.q)}
                  style={{
                    whiteSpace: 'nowrap', fontSize: '11px',
                    padding: '5px 10px', borderRadius: '20px',
                    border: '0.5px solid #ddd', background: '#f5f5f5',
                    color: '#555', cursor: 'pointer', flexShrink: 0,
                  }}
                >{chip.label}</button>
              ))}
            </div>
          )}

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: '10px',
          }}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    padding: '9px 13px',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    fontSize: '13px', lineHeight: 1.55,
                    background: msg.role === 'user' ? '#1D9E75' : '#f2f2f2',
                    color: msg.role === 'user' ? '#fff' : '#222',
                    border: msg.role === 'user' ? 'none' : '0.5px solid #e5e5e5',
                    whiteSpace: 'pre-wrap',
                  }}
                  dangerouslySetInnerHTML={{
                    __html: msg.text
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n/g, '<br/>'),
                  }}
                />
                <div style={{ fontSize: '10px', color: '#aaa', marginTop: '3px', paddingInline: '4px' }}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {msg.isVoice && ' · 🎤'}
                </div>
                {msg.role === 'assistant' && (
                  <button
                    onClick={() => speakText(msg.text)}
                    style={{
                      marginTop: '4px', fontSize: '10px', padding: '3px 8px',
                      borderRadius: '12px', border: '0.5px solid #1D9E75',
                      background: '#E1F5EE', color: '#0F6E56', cursor: 'pointer',
                    }}
                  >🔊 Read aloud</button>
                )}
              </div>
            ))}

            {isLoading && (
              <div style={{ display: 'flex', gap: '4px', padding: '10px 14px', alignSelf: 'flex-start' }}>
                {[0, 200, 400].map((delay) => (
                  <span key={delay} style={{
                    width: '7px', height: '7px', borderRadius: '50%',
                    background: '#1D9E75', display: 'inline-block',
                    animation: `bounce 1.2s ${delay}ms infinite`,
                  }} />
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div style={{
            padding: '10px 12px', borderTop: '0.5px solid #eee',
            display: 'flex', alignItems: 'flex-end', gap: '8px',
            flexShrink: 0, background: '#fff',
          }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center',
              background: '#f5f5f5', border: '0.5px solid #ddd',
              borderRadius: '20px', padding: '0 10px', gap: '6px', minHeight: '38px',
            }}>
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                }}
                placeholder="Ask Vani anything..."
                rows={1}
                style={{
                  flex: 1, border: 'none', background: 'transparent',
                  outline: 'none', fontSize: '13px', resize: 'none',
                  padding: '8px 0', maxHeight: '80px', lineHeight: 1.4,
                  fontFamily: 'inherit', color: '#222',
                }}
              />
              <button
                onClick={isRecording ? stopRecording : () => startMainRecording(false)}
                aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '18px', padding: '0',
                  color: isRecording ? '#E24B4A' : '#999',
                  animation: isRecording ? 'voicePulse 1s infinite' : 'none',
                  flexShrink: 0,
                }}
              >🎤</button>
            </div>
            <button
              onClick={sendMessage}
              disabled={!inputText.trim() || isLoading}
              aria-label="Send"
              style={{
                width: '38px', height: '38px', borderRadius: '50%',
                background: inputText.trim() && !isLoading ? '#1D9E75' : '#ccc',
                border: 'none',
                cursor: inputText.trim() && !isLoading ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px', flexShrink: 0, color: '#fff',
                transition: 'background 0.15s',
              }}
            >➤</button>
          </div>

          <div style={{
            textAlign: 'center', fontSize: '10px', color: '#bbb',
            paddingBottom: '8px', flexShrink: 0,
          }}>
            {apiMode === 'gemini'
              ? 'Powered by Gemini 1.5 Pro · Say "Hello Vani" to activate'
              : 'Offline mode — Add NEXT_PUBLIC_GEMINI_API_KEY to unlock AI'}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:0.6} 30%{transform:translateY(-5px);opacity:1} }
        @keyframes voicePulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.25)} }
      `}</style>
    </>
  );
}