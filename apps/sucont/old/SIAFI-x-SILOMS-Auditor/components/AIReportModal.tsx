
import React from 'react';
import { X, FileText, Download, Copy, Check, Loader2, Sparkles, FileDown, Table } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface AIReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: string;
  isLoading: boolean;
}

export const AIReportModal: React.FC<AIReportModalProps> = ({ isOpen, onClose, report, isLoading }) => {
  const [copied, setCopied] = React.useState(false);
  const [googleTokens, setGoogleTokens] = React.useState<any>(null);
  const [isExporting, setIsExporting] = React.useState(false);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setGoogleTokens(event.data.tokens);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!isOpen) return null;

  const handleExportGoogleDocs = async () => {
    if (!googleTokens) {
      try {
        const response = await fetch('/api/auth/google/url');
        const { url } = await response.json();
        window.open(url, 'google_auth_popup', 'width=600,height=700');
        return;
      } catch (error) {
        console.error("Erro ao obter URL de autenticação:", error);
        alert("Erro ao iniciar autenticação com Google.");
        return;
      }
    }

    setIsExporting(true);
    try {
      const response = await fetch('/api/export/google-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report,
          tokens: googleTokens,
          title: `Relatório de Auditoria IA - ${new Date().toLocaleDateString('pt-BR')}`
        })
      });

      const result = await response.json();
      if (result.success) {
        window.open(result.url, '_blank');
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("Erro ao exportar:", error);
      alert("Erro ao exportar para Google Docs: " + error.message);
      if (error.message?.includes('invalid_grant') || error.message?.includes('token')) {
        setGoogleTokens(null); // Reset tokens if they are invalid
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxLineWidth = pageWidth - margin * 2;
    const pageHeight = doc.internal.pageSize.getHeight();

    // --- PDF STYLING ---
    const colors = {
      primary: [30, 58, 138], // Navy Blue
      text: [31, 41, 55],    // Slate 800
      muted: [107, 114, 128], // Slate 500
      line: [229, 231, 235]  // Slate 200
    };

    // Header Background
    doc.setFillColor(248, 250, 252); // Slate 50
    doc.rect(0, 0, pageWidth, 45, 'F');
    
    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.text('Nota Analítica Estratégica', margin, 22);
    
    doc.setFontSize(12);
    doc.text('Auditoria de Conciliação SIAFI x SILOMS', margin, 30);
    
    // Meta Info
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2]);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, 38);
    doc.text(`Comando da Aeronáutica - Setorial de Contabilidade`, pageWidth - margin, 38, { align: 'right' });
    
    doc.setDrawColor(colors.line[0], colors.line[1], colors.line[2]);
    doc.line(margin, 45, pageWidth - margin, 45);

    let cursorY = 55;
    const lines = report.split('\n');
    let tableRows: string[][] = [];
    let inTable = false;

    const renderTable = () => {
      if (tableRows.length > 0) {
        autoTable(doc, {
          startY: cursorY,
          head: [tableRows[0]],
          body: tableRows.slice(1),
          margin: { left: margin, right: margin },
          styles: { fontSize: 8, cellPadding: 2, font: 'helvetica' },
          headStyles: { fillColor: colors.primary as [number, number, number] },
          theme: 'striped',
          didDrawPage: (data) => {
            cursorY = data.cursor?.y || cursorY;
          }
        });
        cursorY = (doc as any).lastAutoTable.finalY + 10;
        tableRows = [];
        inTable = false;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      let text = lines[i].trim();
      
      // Handle page breaks for non-table content
      if (!inTable && cursorY > pageHeight - 25) {
        doc.addPage();
        cursorY = 25;
      }

      // Detect Table
      if (text.includes('|')) {
        if (text.includes('---')) continue; // Skip separator line
        const cells = text.split('|').map(c => c.trim().replace(/\*\*/g, '')).filter(c => c !== '');
        if (cells.length > 0) {
          tableRows.push(cells);
          inTable = true;
          continue;
        }
      } else if (inTable) {
        renderTable();
      }

      if (!text) {
        cursorY += 4;
        continue;
      }

      // --- MARKDOWN PARSING ---
      
      // H1 (#)
      if (text.startsWith('# ')) {
        cursorY += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
        doc.text(text.replace('# ', ''), margin, cursorY);
        cursorY += 4;
        doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
        doc.setLineWidth(0.5);
        doc.line(margin, cursorY, pageWidth - margin, cursorY);
        cursorY += 8;
      } 
      // H2 (##)
      else if (text.startsWith('## ')) {
        cursorY += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
        doc.text(text.replace('## ', ''), margin, cursorY);
        cursorY += 3;
        doc.setDrawColor(colors.line[0], colors.line[1], colors.line[2]);
        doc.setLineWidth(0.2);
        doc.line(margin, cursorY, pageWidth - margin, cursorY);
        cursorY += 8;
      }
      // H3 (###)
      else if (text.startsWith('### ')) {
        cursorY += 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
        doc.text(text.replace('### ', ''), margin, cursorY);
        cursorY += 7;
      }
      // H4 (####)
      else if (text.startsWith('#### ')) {
        cursorY += 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
        doc.text(text.replace('#### ', ''), margin, cursorY);
        cursorY += 6;
      }
      // H5 (#####)
      else if (text.startsWith('##### ')) {
        cursorY += 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
        doc.text(text.replace('##### ', ''), margin, cursorY);
        cursorY += 6;
      }
      // List Items
      else if (text.startsWith('- ') || text.startsWith('* ')) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
        
        const bulletText = '• ' + text.substring(2).replace(/\*\*/g, '');
        const splitLines = doc.splitTextToSize(bulletText, maxLineWidth - 5);
        
        splitLines.forEach((sl: string, idx: number) => {
          if (cursorY > pageHeight - 20) { doc.addPage(); cursorY = 25; }
          doc.text(sl, margin + (idx === 0 ? 0 : 4), cursorY);
          cursorY += 6;
        });
      }
      // Normal Paragraph
      else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
        
        // Detect if line is bold
        if (text.startsWith('**') && text.endsWith('**')) {
          doc.setFont('helvetica', 'bold');
          text = text.replace(/\*\*/g, '');
        } else {
          text = text.replace(/\*\*/g, '');
        }

        const splitLines = doc.splitTextToSize(text, maxLineWidth);
        splitLines.forEach((sl: string) => {
          if (cursorY > pageHeight - 20) { doc.addPage(); cursorY = 25; }
          doc.text(sl, margin, cursorY);
          cursorY += 6;
        });
      }
    }

    // Final table check
    if (inTable) renderTable();

    // Footer with page numbers
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2]);
      doc.text(
        `Página ${i} de ${totalPages} - Documento de Uso Interno (Comando da Aeronáutica)`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    }

    doc.save(`Nota_Analitica_Auditoria_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleDownloadExcel = () => {
    const workbook = XLSX.utils.book_new();
    const lines = report.split('\n');
    const data: any[][] = [];
    
    // Header
    data.push(['RELATÓRIO DE AUDITORIA ESTRATÉGICA - SIAFI x SILOMS']);
    data.push([`Gerado em: ${new Date().toLocaleString('pt-BR')}`]);
    data.push(['']);
    
    let inTable = false;
    let tableHeader: string[] = [];
    
    lines.forEach(line => {
      let text = line.trim();
      if (!text) {
        data.push(['']);
        return;
      }
      
      // Handle Tables
      if (text.includes('|')) {
        if (text.includes('---')) return;
        const cells = text.split('|').map(c => c.trim().replace(/\*\*/g, '')).filter(c => c !== '');
        if (cells.length > 0) {
          data.push(cells);
        }
        return;
      }
      
      // Headers
      if (text.startsWith('# ')) {
        data.push([text.replace('# ', '').toUpperCase()]);
      } else if (text.startsWith('## ')) {
        data.push(['', text.replace('## ', '').toUpperCase()]);
      } else if (text.startsWith('### ')) {
        data.push(['', '', text.replace('### ', '')]);
      } else if (text.startsWith('#### ')) {
        data.push(['', '', '', text.replace('#### ', '')]);
      }
      // List items
      else if (text.startsWith('- ') || text.startsWith('* ')) {
        data.push(['', '', '• ' + text.substring(2).replace(/\*\*/g, '')]);
      }
      // Normal text
      else {
        data.push(['', '', text.replace(/\*\*/g, '')]);
      }
    });
    
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    
    // Basic styling (column widths)
    const wscols = [
      { wch: 10 }, { wch: 15 }, { wch: 60 }, { wch: 20 }, { wch: 20 }, { wch: 20 }
    ];
    worksheet['!cols'] = wscols;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório');
    XLSX.writeFile(workbook, `Relatorio_Auditoria_IA_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Relatório de Auditoria com IA</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Análise automatizada de divergências SIAFI x SILOMS</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4 py-20">
              <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
              <div className="text-center">
                <p className="text-lg font-medium text-slate-900 dark:text-white">Gerando Análise Estratégica...</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">O analista de dados IA está processando as divergências das unidades.</p>
              </div>
            </div>
          ) : (
            <div className="prose dark:prose-invert max-w-none">
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && (
          <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/50">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiado!' : 'Copiar Texto'}
            </button>
            <button
              onClick={handleExportGoogleDocs}
              disabled={isExporting}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all
                ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4 text-blue-500" />}
              {googleTokens ? 'Exportar para Docs' : 'Conectar Google Docs'}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              <Download className="w-4 h-4" />
              PDF
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-all shadow-lg shadow-indigo-900/20"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
