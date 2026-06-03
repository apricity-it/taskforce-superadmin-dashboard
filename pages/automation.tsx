import { useEffect, useState, useRef } from 'react';
import { DataService, ComplianceReport } from '@/lib/dataService';
import { AIService, DailyReportData } from '@/lib/aiService';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface ReportSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  actionRequired: number;
}

export default function AutomationPage() {
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [dailyAiSummary, setDailyAiSummary] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Not Started');

  const handleDownloadPdf = () => {
    if (summaryRef.current) {
      setStatus('Downloading PDF...');
      const input = summaryRef.current;
      html2canvas(input, { scrollY: -window.scrollY }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const ratio = canvasWidth / pdfWidth;
        const imgHeight = canvasHeight / ratio;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > 0) {
          position -= pdfHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
          heightLeft -= pdfHeight;
        }
        pdf.save(`Daily_AI_Concise_Summary_${selectedDate}.pdf`);
        setStatus('PDF Downloaded. Automation Complete.');
      });
    }
  };

  const generateDailyAIAnalysis = async () => {
    if (!reportSummary) return;

    setStatus('Generating AI Summary...');
    try {
      const reportData: DailyReportData = {
        date: selectedDate,
        metrics: {
          totalUsers: 0,
          newRegistrations: 0,
          totalComplaints: reportSummary.total,
          resolvedComplaints: reportSummary.approved,
          activeFeederPoints: 0,
          completedInspections: reportSummary.approved,
        },
        performance: {
          complaintResolutionRate: reportSummary.total > 0
            ? Math.round((reportSummary.approved / reportSummary.total) * 100)
            : 0,
          userGrowth: 0,
          operationalEfficiency: 0,
        },
        rawReports: reports
      };

      const { summary } = await AIService.generateAnalysis(reportData);
      setDailyAiSummary(summary);
      setStatus('AI Summary Generated.');
    } catch (error) {
      console.error('Error generating daily AI analysis:', error);
      setStatus('Error generating AI analysis.');
    }
  };

  useEffect(() => {
    setStatus('Fetching reports...');
    const unsubscribe = DataService.onComplianceReportsChange(allReports => {
      const filteredReports = allReports.filter(report => {
        const reportDate = new Date(report.submittedAt.toDate()).toISOString().split('T')[0];
        return reportDate === selectedDate;
      });

      setReports(filteredReports);

      const summary: ReportSummary = {
        total: filteredReports.length,
        pending: filteredReports.filter(r => r.status === 'pending').length,
        approved: filteredReports.filter(r => r.status === 'approved').length,
        rejected: filteredReports.filter(r => r.status === 'rejected').length,
        actionRequired: filteredReports.filter(r => r.status === 'requires_action').length,
      };
      setReportSummary(summary);
      setStatus('Reports Fetched.');
    });

    return () => unsubscribe();
  }, [selectedDate]);

  useEffect(() => {
    if (reportSummary && reports.length > 0) {
      generateDailyAIAnalysis();
    }
  }, [reportSummary, reports]);

  useEffect(() => {
    if (dailyAiSummary) {
      // Allow time for the summary to render before downloading
      setTimeout(handleDownloadPdf, 1000);
    }
  }, [dailyAiSummary]);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Automation Status</h1>
      <p>{status}</p>
      {dailyAiSummary && (
        <div ref={summaryRef} style={{ padding: '20px', border: '1px solid #ccc', marginTop: '20px' }}>
          <h2>Concise Summary for {selectedDate}</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{dailyAiSummary}</pre>
        </div>
      )}
    </div>
  );
}
