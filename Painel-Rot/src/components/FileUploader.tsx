
import React, { useRef, useState } from 'react';
import { Upload, FileUp, X, Loader2 } from 'lucide-react';

interface FileUploaderProps {
  onFileLoaded: (buffer: ArrayBuffer, fileName: string) => void;
}

const FileUploader = ({ onFileLoaded }: FileUploaderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.dat')) {
      alert('Por favor, envie um arquivo .dat da Wabtec.');
      return;
    }

    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result instanceof ArrayBuffer) {
        onFileLoaded(e.target.result, file.name);
      }
      setIsLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div 
      className={`relative group transition-all h-full ${isLoading ? 'pointer-events-none' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      <input 
        type="file" 
        ref={fileInputRef}
        className="hidden" 
        accept=".dat"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      
      <button 
        onClick={() => fileInputRef.current?.click()}
        className={`w-full h-full flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-[2rem] transition-all
          ${isDragging 
            ? 'bg-blue-600/10 border-blue-500 scale-[0.98]' 
            : 'bg-slate-900/40 border-white/5 hover:border-white/10 hover:bg-white/5'
          }
        `}
      >
        {isLoading ? (
          <div className="flex flex-col items-center animate-pulse">
            <Loader2 className="animate-spin text-blue-500 mb-4" size={48} />
            <p className="text-sm font-bold text-slate-300">Analisando Telemetria...</p>
          </div>
        ) : (
          <>
            <div className={`p-4 rounded-2xl mb-4 transition-all ${isDragging ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 group-hover:text-blue-400 group-hover:bg-blue-500/10'}`}>
              <Upload size={32} />
            </div>
            <h3 className="font-bold text-slate-200 mb-1">Carregar Novo R.O.T.</h3>
            <p className="text-xs text-slate-500 font-medium">Arraste o arquivo .dat ou clique para buscar</p>
          </>
        )}
      </button>
    </div>
  );
};

export default FileUploader;
