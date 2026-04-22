import React, { useRef, useState } from 'react';
import { File as FileIcon, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface UploaderProps {
  label: string;
  accept: string;
  multiple?: boolean;
  onUpload: (files: File[]) => void;
  files: File[];
  onRemove: (index: number) => void;
  helperText?: string;
}

export function Uploader({ label, accept, multiple = false, onUpload, files, onRemove, helperText }: UploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      const validFiles = droppedFiles.filter((f) => 
        accept.includes('*/*') ||
        accept.includes(f.type) || 
        accept.split(',').some(ext => f.name.toLowerCase().endsWith(ext.trim().replace('*/*','')))
      );
      if (validFiles.length) {
        onUpload(multiple ? validFiles : [validFiles[0]]);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      onUpload(multiple ? selectedFiles : [selectedFiles[0]]);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-col space-y-3 mb-6">
      <div className="flex items-center justify-between">
        <label className="text-[12px] uppercase text-text-dim tracking-[1.5px] font-sans flex items-center gap-2 m-0 font-bold">
          {label}
        </label>
        {files.length > 0 && !multiple && (
          <span className="text-[10px] text-accent font-medium bg-accent-dim px-2 py-0.5 rounded border border-accent tracking-wide uppercase">
            Carregado
          </span>
        )}
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="p-[10px] rounded-[6px] bg-card-base border border-border-subtle text-[13px] relative flex justify-between items-center group">
               <div className="flex-1 overflow-hidden pr-3">
                 <div className="truncate text-text-main">{file.name}</div>
                 <div className="text-[11px] text-text-dim mt-1 font-mono uppercase">
                   CARREGADO • {(file.size / 1024 / 1024).toFixed(2)} MB
                 </div>
               </div>
               <button
                 onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                 className="p-1.5 text-text-dim hover:text-red-400 hover:bg-black/20 rounded-md transition-colors border border-transparent hover:border-red-400/20"
                 title="Remover"
               >
                 <X className="w-4 h-4" />
               </button>
            </div>
          ))}
        </div>
      )}

      {(!files.length || multiple) && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "mt-auto border border-dashed rounded-[8px] p-6 text-center text-[13px] transition-colors cursor-pointer flex flex-col items-center justify-center",
            isDragging ? "border-accent bg-accent-dim text-accent" : "border-border-subtle text-text-dim bg-card-base hover:border-text-dim"
          )}
        >
          <span className="opacity-80">+ Arraste os arquivos aqui ou clique para enviar</span>
          <span className="font-mono text-[10px] mt-2 opacity-60 uppercase">{helperText || `Suporta ${accept}`}</span>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={handleChange}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}
