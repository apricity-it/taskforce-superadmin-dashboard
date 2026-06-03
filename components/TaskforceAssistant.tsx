/**
 * Vani — Taskforce AI Assistant
 * ================================
 * Features:
 *  - "Vani" wake word activates voice mode automatically
 *  - OpenAI GPT-4o for answers (text + voice)
 *  - Live Taskforce MCP data context (read-only)
 *  - Voice input via Web Speech API (SpeechRecognition)
 *  - Voice reply via Web Speech Synthesis API
 *  - Excel export via xlsx (already in your bundle)
 *  - PDF export via jsPDF (install: npm install jspdf)
 *  - Floating bubble bottom-right on every page
 *
 * SETUP:
 *  1. npm install jspdf                          (PDF export)
 *  2. Add to .env.local:
 *       OPENAI_API_KEY=sk-...
 *  3. Add to pages/_app.tsx:
 *       import TaskforceAssistant from '@/components/TaskforceAssistant'
 *       // Inside return: <TaskforceAssistant />
 *  4. Done. Works on Chrome, Edge, Safari.
 *
 * LIVE DATA:
 *  - On open, Vani fetches a fresh snapshot from your Taskforce MCP API
 *  - Injected as system-level context into every GPT-4o request
 *  - Read-only: Vani never writes to Firestore
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

// Full snapshot shape — mirrors pages/api/taskforce-snapshot.ts exactly
interface TaskforceSnapshot {
    // Feeder Points
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
    // Compliance Reports
    pendingReports: number;
    approvedReports: number;
    rejectedReports: number;
    requiresActionReports: number;
    actionTakenReports: number;
    totalComplianceReports: number;
    // Shift Reports
    inProgressShifts: number;
    completedShifts: number;
    // Requests
    pendingFeederPointRequests: number;
    pendingFrequencyRequests: number;
    pendingAccessRequests: number;
    // Teams
    totalTeams: number;
    teams: Array<{ name: string; memberCount: number; feederPointCount: number }>;
    // Zones
    zones: string[];
    // Users
    totalActiveUsers: number;
    usersByRole: Record<string, number>;
    // Meta
    fetchedAt: string;
    fetchDurationMs: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WAKE_WORD = 'vaani';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o';

// ─── Live Data Fetcher — hits /api/taskforce-snapshot (MCP-backed) ────────────

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

    const noData = !snapshot;

    const zoneBreakdown = snapshot
        ? Object.entries(snapshot.feederPointsByZone)
            .map(([z, c]) => `${z}: ${c}`)
            .join(', ') || 'N/A'
        : 'N/A';

    const teamBreakdown = snapshot
        ? snapshot.teams
            .map((t) => `${t.name} (${t.memberCount} members, ${t.feederPointCount} points)`)
            .join(' | ') || 'N/A'
        : 'N/A';

    const roleBreakdown = snapshot
        ? Object.entries(snapshot.usersByRole)
            .map(([r, c]) => `${r}: ${c}`)
            .join(', ') || 'N/A'
        : 'N/A';

    return `You are Vani, the intelligent AI assistant for the Taskforce web application — a field inspection and compliance management system used by Pune Municipal Corporation (PMC).

You can answer questions about ALL of the following:
- Feeder points (locations, assignments, zones, type, status, eliminated)
- Chronic inspection points and shift reports
- Compliance reports (pending, approved, rejected, requires_action, action_taken)
- Shift reports (in_progress, completed)
- Teams and field workers
- Feeder point requests, frequency change requests, access requests
- Zones, wards, kothis, geographic coverage
- Active users by role

${noData
            ? '⚠️ Live database snapshot could not be loaded. Answer from general Taskforce knowledge.'
            : `LIVE DATABASE SNAPSHOT — fetched: ${snapshot.fetchedAt} (in ${snapshot.fetchDurationMs}ms)

FEEDER POINTS:
- Total: ${snapshot.totalFeederPoints} | Active: ${snapshot.activeFeederPoints} | Maintenance: ${snapshot.maintenanceFeederPoints} | Inactive: ${snapshot.inactiveFeederPoints}
- Regular (trip-based): ${snapshot.regularFeederPoints} | Chronic (shift-based): ${snapshot.chronicPoints}
- Eliminated: ${snapshot.eliminatedPoints}
- By zone: ${zoneBreakdown}
- Sample names: ${snapshot.feederPointNames.slice(0, 10).join(', ')}

COMPLIANCE REPORTS:
- Total: ${snapshot.totalComplianceReports} | Pending: ${snapshot.pendingReports} | Approved: ${snapshot.approvedReports}
- Rejected: ${snapshot.rejectedReports} | Requires action: ${snapshot.requiresActionReports} | Action taken: ${snapshot.actionTakenReports}

SHIFT REPORTS:
- In progress: ${snapshot.inProgressShifts} | Completed: ${snapshot.completedShifts}

PENDING REQUESTS:
- New feeder point requests: ${snapshot.pendingFeederPointRequests}
- Frequency change requests: ${snapshot.pendingFrequencyRequests}
- Access requests: ${snapshot.pendingAccessRequests}

TEAMS (${snapshot.totalTeams} total):
${teamBreakdown}

ZONES: ${snapshot.zones.join(', ')}

USERS: ${snapshot.totalActiveUsers} active | By role: ${roleBreakdown}`
        }

BEHAVIOR RULES:
- Use ONLY numbers from the snapshot above — never invent figures
- Be concise: 2–4 sentences for simple questions, up to 8 for complex
- When asked to export say "I'll prepare that download for you right now!"
- Always end with one useful follow-up suggestion
- Today: ${today}
- For voice: keep answers under 3 sentences
- You are Vani — professional, friendly, sharp
`;
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
        ['Pending Reports', snapshot.pendingReports],
        ['', ''],
        ['ZONES', snapshot.zones.join(', ')],
        ['TEAMS', snapshot.teams.join(', ')],
        ['', ''],
        ['SAMPLE FEEDER POINTS', ''],
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
    // Dynamic import so jsPDF is only loaded when needed
    const { default: jsPDF } = await import('jspdf').catch(() => {
        alert('PDF export requires jsPDF. Run: npm install jspdf');
        return { default: null };
    });
    if (!jsPDF) return;

    const doc = new jsPDF();
    const now = snapshot.fetchedAt;

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Taskforce Dashboard Report', 20, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(`Generated: ${now}`, 20, 28);
    doc.setTextColor(0);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 20, 42);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const rows = [
        ['Total Feeder Points', String(snapshot.totalFeederPoints)],
        ['Active Points', String(snapshot.activeFeederPoints)],
        ['Chronic Points', String(snapshot.chronicPoints)],
        ['Eliminated Points', String(snapshot.eliminatedPoints)],
        ['Pending Reports', String(snapshot.pendingReports) + '+'],
        ['Zones', snapshot.zones.join(', ')],
        ['Teams', snapshot.teams.join(', ')],
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
    const [isVoiceMode, setIsVoiceMode] = useState(false);  // activated by wake word
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [wakeWordActive, setWakeWordActive] = useState(false);
    const [snapshot, setSnapshot] = useState<TaskforceSnapshot | null>(null);
    const [hasUnread, setHasUnread] = useState(true);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const wakeRecognitionRef = useRef<SpeechRecognition | null>(null);
    const synthRef = useRef<SpeechSynthesis | null>(null);
    const conversationRef = useRef<{ role: string; content: string }[]>([]);

    const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

    // ── Fetch live snapshot on mount ──────────────────────────────────────────

    useEffect(() => {
        fetchTaskforceSnapshot().then(setSnapshot);
    }, []);

    // ── Speech synthesis init ──────────────────────────────────────────────────

    useEffect(() => {
        if (typeof window !== 'undefined') {
            synthRef.current = window.speechSynthesis;
        }
    }, []);

    // ── Auto-scroll ────────────────────────────────────────────────────────────

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Wake word listener — always on in background ───────────────────────────

    const startWakeWordListener = useCallback(() => {
        const SpeechRec =
            (window as Window & typeof globalThis & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
            (window as Window & typeof globalThis & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

        if (!SpeechRec) return;

        const rec = new SpeechRec();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-IN';

        rec.onresult = (e: SpeechRecognitionEvent) => {
            const transcript = Array.from(e.results)
                .map((r) => r[0].transcript.toLowerCase())
                .join(' ');

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

        rec.onerror = () => {
            // Silently restart on error
            setTimeout(() => startWakeWordListener(), 2000);
        };

        rec.onend = () => {
            // Restart wake word listener continuously
            if (!isRecording) {
                setTimeout(() => startWakeWordListener(), 500);
            }
        };

        wakeRecognitionRef.current = rec;
        try {
            rec.start();
        } catch (_) {
            // Browser may block mic before user interaction; try after first click
        }
    }, [isRecording]);

    useEffect(() => {
        // Start wake word listener after a short delay (needs user gesture on some browsers)
        const timer = setTimeout(() => startWakeWordListener(), 1500);
        return () => clearTimeout(timer);
    }, [startWakeWordListener]);

    // ── Speak text via browser TTS ─────────────────────────────────────────────

    const speakText = useCallback((text: string) => {
        if (!synthRef.current) return;
        synthRef.current.cancel();

        // Strip markdown
        const clean = text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#+\s/g, '');
        const utt = new SpeechSynthesisUtterance(clean);
        utt.lang = 'en-IN';
        utt.rate = 1.05;
        utt.pitch = 1;

        // Pick a nicer voice if available
        const voices = synthRef.current.getVoices();
        const preferred = voices.find(
            (v) =>
                v.lang.startsWith('en') &&
                (v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Google'))
        );
        if (preferred) utt.voice = preferred;

        utt.onstart = () => setIsSpeaking(true);
        utt.onend = () => {
            setIsSpeaking(false);
            if (isVoiceMode) {
                // After Vani speaks, automatically start listening again
                setTimeout(() => startMainRecording(true), 600);
            }
        };

        synthRef.current.speak(utt);
    }, [isVoiceMode]);

    // ── OpenAI GPT-4o call ─────────────────────────────────────────────────────

    const askOpenAI = useCallback(
        async (userText: string, isVoice = false) => {
            if (!OPENAI_KEY) {
                addMessage(
                    'assistant',
                    '⚠️ OpenAI API key missing. Add OPENAI_API_KEY to your .env.local file.',
                    false
                );
                return;
            }

            const systemPrompt = snapshot ? buildSystemPrompt(snapshot) : 'You are Vani, the Taskforce AI assistant.';
            conversationRef.current.push({ role: 'user', content: userText });

            setIsLoading(true);

            try {
                const response = await fetch(OPENAI_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${OPENAI_KEY}`,
                    },
                    body: JSON.stringify({
                        model: OPENAI_MODEL,
                        max_tokens: 400,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            ...conversationRef.current.slice(-10), // last 10 turns for context
                        ],
                    }),
                });

                if (!response.ok) {
                    throw new Error(`OpenAI error ${response.status}`);
                }

                const data = await response.json();
                const reply: string = data.choices?.[0]?.message?.content || 'Sorry, I could not get a response.';

                conversationRef.current.push({ role: 'assistant', content: reply });
                addMessage('assistant', reply, false);

                if (isVoice || isVoiceMode) {
                    speakText(reply);
                }
            } catch (err) {
                const errMsg = `⚠️ Could not reach OpenAI. Check your API key and network. (${String(err)})`;
                addMessage('assistant', errMsg, false);
            } finally {
                setIsLoading(false);
            }
        },
        [snapshot, OPENAI_KEY, isVoiceMode, speakText]
    );

    // ── Add message helper ─────────────────────────────────────────────────────

    const addMessage = (role: 'user' | 'assistant', text: string, isVoice = false) => {
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
    };

    // ── Send text message ──────────────────────────────────────────────────────

    const sendMessage = useCallback(async () => {
        const text = inputText.trim();
        if (!text || isLoading) return;

        // Handle export commands directly
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
        await askOpenAI(text, false);
    }, [inputText, isLoading, snapshot, askOpenAI]);

    // ── Start main voice recording ─────────────────────────────────────────────

    const startMainRecording = useCallback(
        (autoSend = false) => {
            const SpeechRec =
                (window as Window & typeof globalThis & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
                (window as Window & typeof globalThis & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

            if (!SpeechRec) return;

            wakeRecognitionRef.current?.stop();

            const rec = new SpeechRec();
            rec.lang = 'en-IN';
            rec.continuous = false;
            rec.interimResults = true;

            rec.onresult = (e: SpeechRecognitionEvent) => {
                const transcript = Array.from(e.results)
                    .map((r) => r[0].transcript)
                    .join('');
                setInputText(transcript);

                if (e.results[e.results.length - 1].isFinal) {
                    if (autoSend && transcript.trim()) {
                        setIsRecording(false);
                        rec.stop();
                        addMessage('user', transcript.trim(), true);
                        askOpenAI(transcript.trim(), true);
                    }
                }
            };

            rec.onerror = () => {
                setIsRecording(false);
                startWakeWordListener();
            };

            rec.onend = () => {
                setIsRecording(false);
                if (!isSpeaking && !autoSend) startWakeWordListener();
            };

            recognitionRef.current = rec;
            setIsRecording(true);
            rec.start();
        },
        [askOpenAI, isSpeaking, startWakeWordListener]
    );

    const stopRecording = useCallback(() => {
        recognitionRef.current?.stop();
        setIsRecording(false);
    }, []);

    // ── Toggle panel ───────────────────────────────────────────────────────────

    const handleOpen = useCallback(() => {
        setIsOpen(true);
        setHasUnread(false);
        // Resume mic for wake word
        startWakeWordListener();
        if (messages.length === 0) {
            addMessage(
                'assistant',
                `Hello! I'm **Vani**, your Taskforce AI assistant.\n\nI have live access to your ${snapshot?.totalFeederPoints ?? '72'} feeder points and chronic points, compliance reports, teams, and more.\n\nYou can also say **"Hello Vani"** anytime to activate me by voice! 🎤`,
                false
            );
        }
    }, [messages.length, snapshot, startWakeWordListener]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        stopRecording();
        setIsVoiceMode(false);
        synthRef.current?.cancel();
        setIsSpeaking(false);
    }, [stopRecording]);

    // ── Quick chips ────────────────────────────────────────────────────────────

    const quickChips = [
        { label: '📋 Pending reports', q: 'How many pending compliance reports are there?' },
        { label: '📍 Feeder points', q: 'Give me a summary of all feeder points' },
        { label: '⚠️ Issues today', q: 'Are there any issues or requires_action reports?' },
        { label: '⬇️ Export Excel', q: 'download excel' },
        { label: '📄 Export PDF', q: 'download pdf' },
    ];

    const handleChip = (q: string) => {
        setInputText(q);
        setTimeout(() => {
            if (q === 'download excel') {
                addMessage('user', q, false);
                addMessage('assistant', 'Generating your Excel report...', false);
                if (snapshot) exportToExcel(snapshot);
            } else if (q === 'download pdf') {
                addMessage('user', q, false);
                addMessage('assistant', 'Generating your PDF report...', false);
                if (snapshot) exportToPDF(snapshot);
            } else {
                addMessage('user', q, false);
                askOpenAI(q, false);
            }
            setInputText('');
        }, 50);
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <>
            {/* Floating Bubble Button */}
            <button
                onClick={isOpen ? handleClose : handleOpen}
                aria-label={isOpen ? 'Close Vani assistant' : 'Open Vani assistant'}
                style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    width: '88px',
                    height: '88px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: 0,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
                }}
            >
                <img
                    src="/assets/vani.png"
                    alt="Vani Assistant"
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '50%',
                        transform: 'scale(1.42)',
                        filter: 'drop-shadow(0 0 12px rgba(80,180,255,0.6))',
                    }}
                />

                {hasUnread && !isOpen && (
                    <span
                        style={{
                            position: 'absolute',
                            top: '-2px',
                            right: '-2px',
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            background: '#E24B4A',
                            border: '2px solid #fff',
                            fontSize: '9px',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                        }}
                    >
                        1
                    </span>
                )}
            </button>

            {/* Label tooltip */}
            {!isOpen && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: '42px',
                        right: '105px',
                        background: '#fff',
                        border: '1px solid #ddd',
                        borderRadius: '14px',
                        padding: '10px 16px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#333',
                        whiteSpace: 'nowrap',
                        zIndex: 9998,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        height: '44px',
                    }}
                >
                    Say "Hello Vani" or click to chat
                </div>
            )}

            {/* Chat Panel */}
            {isOpen && (
                <div
                    role="dialog"
                    aria-label="Vani AI Assistant"
                    style={{
                        position: 'fixed',
                        bottom: '92px',
                        right: '24px',
                        width: '370px',
                        height: '520px',
                        background: '#fff',
                        border: '0.5px solid #ddd',
                        borderRadius: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        zIndex: 9998,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                        fontFamily: "'DM Sans', -apple-system, sans-serif",
                    }}
                >
                    {/* Header */}
                    <div
                        style={{
                            background: '#1D9E75',
                            padding: '14px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            flexShrink: 0,
                        }}
                    >
                        <div
                            style={{
                                width: '42px',
                                height: '42px',
                                minWidth: '42px',
                                minHeight: '42px',
                                borderRadius: '50%',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(255,255,255,0.12)',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
                            }}
                        >
                            <img
                                src="/assets/vani.png"
                                alt="Vani"
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    borderRadius: '50%',
                                    transform: 'scale(1.42)',
                                    filter: 'drop-shadow(0 0 8px rgba(80,180,255,0.55))',
                                }}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px', letterSpacing: '0.3px' }}>
                                Vani
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span
                                    style={{
                                        width: '6px',
                                        height: '6px',
                                        borderRadius: '50%',
                                        background: '#9FE1CB',
                                        display: 'inline-block',
                                        animation: 'pulse 2s infinite',
                                    }}
                                />
                                {isSpeaking ? 'Speaking...' : isRecording ? 'Listening...' : 'Live · Taskforce AI'}
                            </div>
                        </div>
                        {isSpeaking && (
                            <button
                                onClick={() => { synthRef.current?.cancel(); setIsSpeaking(false); }}
                                style={{
                                    background: 'rgba(255,255,255,0.15)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '11px',
                                    padding: '4px 8px',
                                    cursor: 'pointer',
                                }}
                            >
                                🔇 Stop
                            </button>
                        )}
                        <button
                            onClick={handleClose}
                            aria-label="Close"
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'rgba(255,255,255,0.8)',
                                cursor: 'pointer',
                                fontSize: '18px',
                                padding: '4px',
                                borderRadius: '6px',
                            }}
                        >
                            ✕
                        </button>
                    </div>

                    {/* Quick chips */}
                    {messages.length <= 1 && (
                        <div
                            style={{
                                padding: '8px 12px 0',
                                display: 'flex',
                                gap: '6px',
                                overflowX: 'auto',
                                flexShrink: 0,
                                scrollbarWidth: 'none',
                            }}
                        >
                            {quickChips.map((chip) => (
                                <button
                                    key={chip.q}
                                    onClick={() => handleChip(chip.q)}
                                    style={{
                                        whiteSpace: 'nowrap',
                                        fontSize: '11px',
                                        padding: '5px 10px',
                                        borderRadius: '20px',
                                        border: '0.5px solid #ddd',
                                        background: '#f5f5f5',
                                        color: '#555',
                                        cursor: 'pointer',
                                        flexShrink: 0,
                                    }}
                                >
                                    {chip.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Messages */}
                    <div
                        style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                        }}
                    >
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    maxWidth: '85%',
                                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                }}
                            >
                                <div
                                    style={{
                                        padding: '9px 13px',
                                        borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                        fontSize: '13px',
                                        lineHeight: 1.55,
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
                                {/* Read aloud button for assistant messages */}
                                {msg.role === 'assistant' && (
                                    <button
                                        onClick={() => speakText(msg.text)}
                                        style={{
                                            marginTop: '4px',
                                            fontSize: '10px',
                                            padding: '3px 8px',
                                            borderRadius: '12px',
                                            border: '0.5px solid #1D9E75',
                                            background: '#E1F5EE',
                                            color: '#0F6E56',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        🔊 Read aloud
                                    </button>
                                )}
                            </div>
                        ))}

                        {/* Typing indicator */}
                        {isLoading && (
                            <div style={{ display: 'flex', gap: '4px', padding: '10px 14px', alignSelf: 'flex-start' }}>
                                {[0, 200, 400].map((delay) => (
                                    <span
                                        key={delay}
                                        style={{
                                            width: '7px',
                                            height: '7px',
                                            borderRadius: '50%',
                                            background: '#1D9E75',
                                            display: 'inline-block',
                                            animation: `bounce 1.2s ${delay}ms infinite`,
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Bar */}
                    <div
                        style={{
                            padding: '10px 12px',
                            borderTop: '0.5px solid #eee',
                            display: 'flex',
                            alignItems: 'flex-end',
                            gap: '8px',
                            flexShrink: 0,
                            background: '#fff',
                        }}
                    >
                        <div
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                background: '#f5f5f5',
                                border: '0.5px solid #ddd',
                                borderRadius: '20px',
                                padding: '0 10px',
                                gap: '6px',
                                minHeight: '38px',
                            }}
                        >
                            <textarea
                                ref={inputRef}
                                value={inputText}
                                onChange={(e) => {
                                    setInputText(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage();
                                    }
                                }}
                                placeholder="Ask Vani anything..."
                                rows={1}
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    background: 'transparent',
                                    outline: 'none',
                                    fontSize: '13px',
                                    resize: 'none',
                                    padding: '8px 0',
                                    maxHeight: '80px',
                                    lineHeight: 1.4,
                                    fontFamily: 'inherit',
                                    color: '#222',
                                }}
                            />
                            {/* Voice button */}
                            <button
                                onClick={isRecording ? stopRecording : () => startMainRecording(false)}
                                aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '18px',
                                    padding: '0',
                                    color: isRecording ? '#E24B4A' : '#999',
                                    animation: isRecording ? 'voicePulse 1s infinite' : 'none',
                                    flexShrink: 0,
                                }}
                            >
                                🎤
                            </button>
                        </div>

                        {/* Send button */}
                        <button
                            onClick={sendMessage}
                            disabled={!inputText.trim() || isLoading}
                            aria-label="Send message"
                            style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '50%',
                                background: inputText.trim() && !isLoading ? '#1D9E75' : '#ccc',
                                border: 'none',
                                cursor: inputText.trim() && !isLoading ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '16px',
                                flexShrink: 0,
                                transition: 'background 0.15s',
                            }}
                        >
                            ➤
                        </button>
                    </div>

                    <div
                        style={{
                            textAlign: 'center',
                            fontSize: '10px',
                            color: '#bbb',
                            paddingBottom: '8px',
                            flexShrink: 0,
                        }}
                    >
                        Say "Hello Vani" anytime · Voice replies on · Excel & PDF export ready
                    </div>
                </div>
            )}

            {/* Global keyframe styles */}
            <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:0.6} 30%{transform:translateY(-5px);opacity:1} }
        @keyframes voicePulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.25)} }
      `}</style>
        </>
    );
}