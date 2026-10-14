"use client";
import { useRef, useState } from "react";

interface Props {
  label: string;
  hint?: string;
  multiple?: boolean;
  disabled?: boolean;
  names?: string[];
  onFiles: (files: FileList) => void;
}

/** Styled drop zone shared by Studio and the investigator. Selected files show as name chips. */
export function FileDrop({ label, hint, multiple = false, disabled = false, names = [], onFiles }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (files: FileList | null): void => {
    if (!disabled && files && files.length > 0) onFiles(files);
  };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${disabled ? "opacity-60" : ""} ${over ? "border-violet bg-violet/5" : "border-line bg-paper-2/60"}`}
    >
      <p className="font-semibold">{label}</p>
      {hint && <p className="text-sm text-ink-2 mt-1">{hint}</p>}
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="btn-ink rounded-[10px] px-4 py-2 mono text-[13px] mt-4">
        {multiple ? "Choose files" : "Choose a file"}
      </button>
      <input ref={input} type="file" accept="image/*" multiple={multiple} disabled={disabled} className="hidden" aria-label={label}
        onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      {names.length > 0 && (
        <ul className="mt-4 flex gap-2 justify-center flex-wrap" aria-label="Selected files">
          {names.map((n, i) => (
            <li key={`${n}-${i}`} className="mono text-[12px] rounded-full border border-line bg-paper px-3 py-1 max-w-[16rem] truncate">{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
