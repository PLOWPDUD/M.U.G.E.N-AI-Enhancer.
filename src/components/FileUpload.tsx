import { useState, type DragEvent, type ChangeEvent } from "react";
import { Upload, FileText, X, CheckCircle2 } from "lucide-react";
import { cn } from "../lib/utils";

interface FileUploadProps {
  accept: string;
  label: string;
  file: File | null;
  onFileSelect: (file: File | null) => void;
  className?: string;
}

export function FileUpload({ accept, label, file, onFileSelect, className }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith(accept)) {
      onFileSelect(droppedFile);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg transition-colors cursor-pointer group",
        isDragging
          ? "border-emerald-500 bg-emerald-500/10"
          : file
          ? "border-emerald-500/50 bg-emerald-900/10"
          : "border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800 hover:border-zinc-500",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => document.getElementById(`file-input-${label}`)?.click()}
    >
      <input
        id={`file-input-${label}`}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
      />
      
      {file ? (
        <div className="flex flex-col items-center text-emerald-400 animate-in fade-in zoom-in duration-300">
          <CheckCircle2 className="w-8 h-8 mb-2" />
          <p className="text-sm font-medium truncate max-w-[200px]">{file.name}</p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFileSelect(null);
            }}
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center text-zinc-500 group-hover:text-zinc-300 transition-colors">
          <Upload className="w-8 h-8 mb-2" />
          <p className="text-sm font-medium">
            Upload <span className="font-mono text-emerald-500">{accept}</span>
          </p>
          <p className="text-xs mt-1 text-zinc-600">Drag & drop or click</p>
        </div>
      )}
      
      <div className="absolute top-2 left-3 text-[10px] font-mono uppercase tracking-wider text-zinc-600 bg-zinc-900/80 px-1.5 py-0.5 rounded border border-zinc-800">
        {label}
      </div>
    </div>
  );
}
