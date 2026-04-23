import React, { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, X, CheckCircle, AlertCircle } from 'lucide-react';

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => void;
  isDarkMode: boolean;
}

export const FileUploadModal: React.FC<FileUploadModalProps> = ({ isOpen, onClose, onUpload, isDarkMode }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setUploadStatus('error');
      setTimeout(() => setUploadStatus('idle'), 3000);
      return;
    }

    setUploadStatus('processing');
    // Simulate a brief delay for UX before passing to parent
    setTimeout(() => {
      onUpload(file);
      setUploadStatus('success');
      setTimeout(() => {
        onClose();
        setUploadStatus('idle');
      }, 1000);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`relative w-full max-w-2xl border rounded-2xl shadow-2xl overflow-hidden p-8 text-center ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
        
        <button 
          onClick={onClose}
          className={`absolute top-4 right-4 p-2 transition-colors ${isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <X className="w-6 h-6" />
        </button>

        <div className="mb-6 flex flex-col items-center">
          <div className="p-4 bg-blue-600/20 rounded-full mb-4">
             <FileSpreadsheet className="w-10 h-10 text-blue-400" />
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Relatório de Evolução</h2>
          <p className={`max-w-md mx-auto ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Carregue o arquivo Excel contendo a evolução mensal das diferenças. 
            O sistema identifica automaticamente os grupos (BMP, CONSUMO, INTANGÍVEL).
          </p>
        </div>

        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-xl p-12 transition-all cursor-pointer group
            ${isDragging 
              ? 'border-blue-500 bg-blue-500/10' 
              : isDarkMode 
                ? 'border-slate-600 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800'
                : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100'
            }
          `}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xlsx, .xls"
            className="hidden"
          />

          {uploadStatus === 'processing' && (
             <div className="flex flex-col items-center animate-pulse">
                <FileSpreadsheet className="w-12 h-12 text-blue-400 mb-4" />
                <p className="text-blue-400 font-medium">Lendo arquivo...</p>
             </div>
          )}

          {uploadStatus === 'success' && (
             <div className="flex flex-col items-center animate-pulse">
                <CheckCircle className="w-12 h-12 text-emerald-500 mb-4" />
                <p className="text-emerald-400 font-medium">Processado com sucesso!</p>
             </div>
          )}

           {uploadStatus === 'error' && (
             <div className="flex flex-col items-center">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <p className="text-red-400 font-medium">Formato inválido. Use .xlsx ou .xls</p>
             </div>
          )}

          {uploadStatus === 'idle' && (
            <div className="flex flex-col items-center">
              <UploadCloud className={`w-12 h-12 mb-4 transition-colors ${isDragging ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <p className={`text-lg font-medium mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Clique para enviar ou arraste
              </p>
              <p className="text-sm text-slate-500">XLSX ou XLS</p>
            </div>
          )}
        </div>

        <div className={`mt-6 text-xs ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
          Suporte para grandes volumes de dados (80+ UGs)
        </div>
      </div>
    </div>
  );
};