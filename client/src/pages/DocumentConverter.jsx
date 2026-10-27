import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, CloudUpload, Download, File, FileImage, FileSpreadsheet, FileText, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { PageHeader } from '../components/ui.jsx';
import Modal from '../components/Modal.jsx';
import { ACCEPT, FILE_TYPES, MAX_FILE_BYTES, TARGET_LABELS, assertSourceFile, fileKind, outputName, outputOptions } from '../utils/documentConverterValidation.js';

const icons={pdf:FileText,docx:FileText,xlsx:FileSpreadsheet,png:FileImage,jpg:FileImage};
const notes={
 'pdf:docx':'Layout-first conversion: each PDF page is embedded as a full-page image in Word, preserving visible text, tables, and graphics. The output is not text-editable. Fonts and display may still vary slightly by Word/WPS.',
 'pdf:png':'Renders PDF pages as PNG images. Multiple pages download together in a ZIP archive.',
 'pdf:jpg':'Renders PDF pages as JPEG images. Multiple pages download together in a ZIP archive.',
 'xlsx:pdf':'IMPORTANT: Exact layout preservation is unavailable for Excel-to-PDF in this browser converter. It rebuilds cell data as PDF tables, so print areas, charts, merges, widths and page breaks may differ. Do not use for documents requiring identical formatting.',
 'docx:pdf':'Visually renders Word pages into PDF. Embedded fonts, tables, headers, page breaks and spacing may differ from Microsoft Word. Use Word export or a dedicated Office renderer when identical pagination is required.',
 'docx:png':'Captures visually rendered Word pages as PNG images; font substitution or different browser pagination can affect layout. Multiple pages download as a ZIP.'
};
const fileSize=n=>n>=1048576?`${(n/1048576).toFixed(2)} MB`:`${(n/1024).toFixed(1)} KB`;
export default function DocumentConverter(){
  const [file,setFile]=useState(null),[target,setTarget]=useState('');
  const [dragging,setDragging]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const [result,setResult]=useState(null);
  const [downloadOpen,setDownloadOpen]=useState(false);
  const input=useRef(null),url=useRef(null);
  const revoke=()=>{if(url.current){URL.revokeObjectURL(url.current);url.current=null;}};
  useEffect(()=>()=>revoke(),[]);
  const pick=useCallback((selected)=>{
    if(!selected)return;
    try {
      const kind=assertSourceFile(selected);
      revoke();setResult(null);setDownloadOpen(false);setFile(selected);setTarget(FILE_TYPES[kind].outputs[0]);
      setError('');setMessage('');
    }catch(e){setError(e.message);}
  },[]);
  useEffect(()=>{
    const paste=e=>{
      if(busy)return;
      const entries=[...(e.clipboardData?.files||[])];
      if(entries.length){e.preventDefault();pick(entries[0]);}
    };
    document.addEventListener('paste',paste);
    return ()=>document.removeEventListener('paste',paste);
  },[pick,busy]);
  const clear=()=>{if(busy)return;revoke();setResult(null);setDownloadOpen(false);setFile(null);setTarget('');setError('');setMessage('');if(input.current)input.current.value='';};
  const run=async()=>{
    if(!file || !target || busy)return;
    setBusy(true);setError('');setMessage('Initializing conversion…');revoke();setResult(null);setDownloadOpen(false);
    try{
      const {convertDocument}=await import('../utils/documentConverterEngine.js');
      const finished=await convertDocument(file,target,setMessage);
      const blob=finished.blob;
      const downloadName=outputName(file,finished.extension);
      url.current=URL.createObjectURL(blob);
      setResult({name:downloadName,size:blob.size,detail:finished.detail});
      setDownloadOpen(true);
      setMessage('Conversion completed. Your download is ready.');
    }catch(e){setError(e?.message||'Conversion failed. Please check your file and retry.');setMessage('');}
    finally{setBusy(false);}
  };
  const download=()=>{
    if(!url.current || !result)return;
    const a=document.createElement('a');a.href=url.current;a.download=result.name;
    document.body.appendChild(a);a.click();a.remove();
  };
  const kind=fileKind(file),options=outputOptions(file),SourceIcon=icons[kind]||File;
  return <div className="mx-auto max-w-5xl space-y-5">
    <PageHeader title="Document Converter" description="Convert files without uploading them to your account or database. Conversion runs within this browser session."/>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-4">
        <section className="card card-pad space-y-5" aria-label="Document conversion">
          <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">STEP 01</p><h2 className="mt-1 text-base font-semibold text-fg">Choose a document</h2></div><span className="badge badge-info">20 MB limit</span></div>
          <input ref={input} type="file" accept={ACCEPT} className="sr-only" aria-label="Upload document to convert" onChange={e=>pick(e.target.files?.[0])}/>
          <div role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.current?.click();}}}
            onClick={()=>input.current?.click()}
            onDragEnter={e=>{e.preventDefault();setDragging(true);}}
            onDragOver={e=>{e.preventDefault();setDragging(true);}}
            onDragLeave={e=>{e.preventDefault();if(!e.currentTarget.contains(e.relatedTarget))setDragging(false);}}
            onDrop={e=>{e.preventDefault();setDragging(false);pick(e.dataTransfer.files?.[0]);}}
            className={`group cursor-pointer rounded-2xl border-2 border-dashed px-5 py-9 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${dragging?'border-brand bg-brand-soft':'border-line-strong bg-surface-2/40 hover:border-brand/50 hover:bg-surface-2'}`}>
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface text-brand shadow-sm"><CloudUpload size={26}/></div>
            <h3 className="font-semibold text-fg">Drop your file here</h3>
            <p className="mt-1 text-sm text-fg-muted">or click to browse, or paste a copied file (Ctrl+V)</p>
            <p className="mt-3 text-xs text-fg-subtle">PDF · DOCX · XLSX</p>
          </div>
          {file && <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 p-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink"><SourceIcon size={22}/></div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-fg" title={file.name}>{file.name}</p><p className="mt-1 text-xs text-fg-muted">{FILE_TYPES[kind]?.label} · {fileSize(file.size)}</p></div>
            <button type="button" aria-label="Remove selected document" className="btn btn-ghost btn-icon" disabled={busy} onClick={clear}><X size={17}/></button>
          </div>}
          <div className="border-t border-line pt-5">
            <p className="eyebrow">STEP 02</p><h2 className="mt-1 text-base font-semibold text-fg">Convert to</h2>
            {file?<div className="mt-3 grid gap-2 sm:grid-cols-2">{options.map(output=>{const Icon=icons[output]||File;return <button key={output} type="button" disabled={busy} aria-pressed={target===output} onClick={()=>{setTarget(output);setResult(null);setDownloadOpen(false);revoke();setError('');}}
              className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${target===output?'border-brand bg-brand-soft ring-1 ring-brand/25':'border-line bg-surface hover:bg-surface-2'}`}>
              <span className="flex items-center gap-2.5"><Icon size={19} className={target===output?'text-brand-ink':'text-fg-muted'}/><span className="text-sm font-medium text-fg">{TARGET_LABELS[output]}</span></span>{target===output&&<CheckCircle2 size={16} className="text-brand-ink"/>}
            </button>})}</div>:<p className="mt-2 text-sm text-fg-muted">Select a supported document to see conversion formats.</p>}
            {file&&target&&<div className="mt-4 rounded-lg border border-line bg-surface-2/60 p-3 text-xs leading-relaxed text-fg-muted">{notes[`${kind}:${target}`]}</div>}
          </div>
          {error&&<div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger-ink">{error}</div>}
          {message&&<p aria-live="polite" className="text-sm text-fg-muted">{message}</p>}
          <button type="button" onClick={run} disabled={!file||!target||busy} className="btn btn-primary w-full justify-center !h-11">{busy?<LoaderCircle size={17} className="animate-spin"/>:<RefreshCw size={17}/>} {busy?'Converting file…':'Convert document'} {!busy&&<ArrowRight size={16}/>}</button>
        </section>

      </div>
      <aside className="space-y-4">
        <div className="card card-pad"><div className="flex items-center gap-2"><LockKeyhole size={18} className="text-success-ink"/><h3 className="font-semibold text-fg">Private by design</h3></div>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">Documents are processed in your browser's memory. They are not sent to the application API, saved in Turso, or added to your invoice records.</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-fg-muted"><ShieldCheck size={15}/>Session-only conversion</div>
        </div>
        <div className="card card-pad"><h3 className="font-semibold text-fg">Supported conversions</h3><div className="mt-3 space-y-3 text-sm text-fg-muted">
          <p>Excel (XLSX) <span className="text-fg-subtle">→</span> PDF</p>
          <p>Word (DOCX) <span className="text-fg-subtle">→</span> PDF, PNG</p>
          <p>PDF <span className="text-fg-subtle">→</span> Word (DOCX), PNG, JPG</p></div>
          <p className="mt-4 text-xs leading-relaxed text-fg-subtle">Old Office .doc/.xls files, password-protected files, and guaranteed pixel-perfect Office conversion are not supported. PDF-to-Word is layout-first and image-based.</p>
        </div>
      </aside>
    </div>
    {/* The modal is rendered in a portal above the page immediately after success.
        Closing it does not discard the in-memory download. */}
    {result && downloadOpen && (
      <Modal
        title="Your document is ready"
        description="Conversion completed successfully. Download the file below."
        width="max-w-md"
        onClose={() => setDownloadOpen(false)}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setDownloadOpen(false)}>
            Close
          </button>
          <button type="button" data-autofocus className="btn btn-primary" onClick={download}>
            <Download size={16} aria-hidden="true" />
            Download file
          </button>
        </>}
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full border border-success/25 bg-success-soft text-success-ink">
            <CheckCircle2 size={33} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <p className="text-base font-semibold text-fg">Conversion successful</p>
          <p className="text-sm text-fg-muted">Your converted file is ready to save to your device.</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink" aria-hidden="true">
            {result.name.toLowerCase().endsWith('.zip') ? <File size={21} /> : result.name.toLowerCase().endsWith('.pdf') || result.name.toLowerCase().endsWith('.docx') ? <FileText size={21} /> : <FileImage size={21} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-all text-sm font-semibold text-fg">{result.name}</p>
            <p className="mt-1 text-xs text-fg-muted">{result.detail} · {fileSize(result.size)}</p>
          </div>
        </div>
        <p className="flex items-center justify-center gap-2 text-xs text-fg-subtle">
          <ShieldCheck size={15} aria-hidden="true" />
          This download is available only during the current browser session.
        </p>
      </Modal>
    )}
    {/* Reopen the download from anywhere on the page after dismissing the popup. */}
    {result && !downloadOpen && (
      <button type="button" onClick={() => setDownloadOpen(true)}
        className="fixed bottom-5 right-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-success/30 bg-surface px-4 py-3 text-left shadow-pop transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-brand sm:bottom-6 sm:right-6"
        aria-label="Open converted file download">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-success-soft text-success-ink">
          <CheckCircle2 size={20} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-fg">Document ready</span>
          <span className="block text-xs text-fg-muted">Tap to download</span>
        </span>
        <Download size={18} className="shrink-0 text-brand-ink" aria-hidden="true" />
      </button>
    )}
  </div>;
}
