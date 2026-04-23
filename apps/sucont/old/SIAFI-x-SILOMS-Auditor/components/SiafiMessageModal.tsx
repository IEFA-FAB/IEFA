
import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Calendar, Hash, MessageSquareText } from 'lucide-react';
import { FinancialRecord, TimeFilter } from '../types';
import { generateMessage } from '../services/dataProcessor';

interface SiafiMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: FinancialRecord | null;
  history?: FinancialRecord[]; 
  context?: 'RANKING' | 'HEATMAP'; // Added context
  timeFilter?: TimeFilter;
}

export const SiafiMessageModal: React.FC<SiafiMessageModalProps> = ({ 
  isOpen, 
  onClose, 
  record, 
  history, 
  context = 'HEATMAP',
  timeFilter = 'MENSAL'
}) => {
  const [msgNumber, setMsgNumber] = useState('XXX');
  const [deadline, setDeadline] = useState('');
  const [copied, setCopied] = useState(false);
  const [editedMessage, setEditedMessage] = useState('');

  useEffect(() => {
    if (isOpen && record) {
      // Set default deadline to 3 days from now
      const date = new Date();
      date.setDate(date.getDate() + 3);
      const defaultDeadline = date.toLocaleDateString('pt-BR');
      setDeadline(defaultDeadline);
      setCopied(false);
      
      // Initialize message
      const initialMsg = generateMessage(context as 'RANKING' | 'HEATMAP', record, 'XXX', defaultDeadline, history, timeFilter);
      setEditedMessage(initialMsg);
    }
  }, [isOpen, record, context, history, timeFilter]);

  // Update message when parameters change, but only if we have a record
  useEffect(() => {
    if (isOpen && record) {
      const newMsg = generateMessage(context as 'RANKING' | 'HEATMAP', record, msgNumber, deadline, history, timeFilter);
      setEditedMessage(newMsg);
    }
  }, [msgNumber, deadline]);

  if (!isOpen || !record) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(editedMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-[90vw] h-[85vh] bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-[#0f172a]">
          <div className="flex items-center gap-3">
            <MessageSquareText className="w-6 h-6 text-blue-600 dark:text-blue-500" />
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">
              Gerar Mensagem SIAFI: <span className="text-blue-600 dark:text-blue-400">{record.ug}</span>
            </h2>
            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-lg uppercase tracking-wide">
                {context === 'RANKING' ? 'Modelo Comparativo' : 'Modelo Evolutivo'}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Configuration */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-[#1e293b]">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">NR MENSAGEM</label>
            <input 
              type="text" 
              value={msgNumber}
              onChange={(e) => setMsgNumber(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#020617] border border-slate-300 dark:border-slate-600 rounded-lg py-3 px-4 text-base text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-slate-400 dark:placeholder-slate-600"
              placeholder="XXX"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">PRAZO (DATA LIMITE)</label>
            <input 
              type="text" 
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#020617] border border-slate-300 dark:border-slate-600 rounded-lg py-3 px-4 text-base text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-slate-400 dark:placeholder-slate-600"
              placeholder="DD/MM/AAAA"
            />
          </div>
        </div>

        {/* Preview Container */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-[#0f172a] mx-6 mb-0 rounded-t-xl border-t border-x border-slate-200 dark:border-slate-700">
          
          {/* Preview Header Bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50">
             <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pré-visualização da Mensagem</span>
             <span className="text-[10px] font-bold bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-500/20 uppercase">
               Formato Texto Simples
             </span>
          </div>

          {/* Text Area */}
          <div className="flex-1 p-0 overflow-hidden">
            <textarea 
              value={editedMessage}
              onChange={(e) => setEditedMessage(e.target.value)}
              className="w-full h-full p-6 bg-transparent font-mono text-sm text-slate-800 dark:text-slate-300 whitespace-pre-wrap leading-relaxed outline-none resize-none custom-scrollbar overflow-y-auto box-border"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-white dark:bg-[#1e293b] border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <span className="text-xs text-slate-500">
            Copie e cole este texto diretamente no sistema de mensageria SIAFI.
          </span>
          
          <div className="flex items-center justify-end gap-3">
            <button 
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={handleCopy}
              className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-lg transition-all shadow-lg
                ${copied 
                  ? 'bg-emerald-600 text-white shadow-emerald-900/20 hover:bg-emerald-500' 
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20'
                }
              `}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
