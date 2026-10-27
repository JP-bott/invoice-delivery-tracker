import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, CloudUpload, Download, File, FileImage, FileSpreadsheet, FileText, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { PageHeader } from '../components/ui.jsx';
import { ACCEPT, FILE_TYPES, MAX_FILE_BYTES, TARGET_LABELS, assertSourceFile, fileKind, outputName, outputOptions } from '../utils/documentConverterValidation.js';

const icons={pdf:FileText,docx:FileText,xlsx:FileSpreadsheet,png:FileImage,jpg:FileImage};
const notes={
 'pdf:docx':'Extracts selectable PDF text into an editable Word document. Original visual layout and graphics may differ; scanned pages require OCR.',
 'pdf:png':'Renders PDF pages as PNG images. Multiple pages download together in a ZIP archive.',
 'pdf:jpg':'Renders PDF pages as JPEG images. Multiple pages download together in a ZIP archive.',
 'xlsx:pdf':'Renders worksheet cell data as formatted PDF tables. Charts, pivot interactivity, embedded objects and complex Excel layouts are not preserved.',
 'docx:pdf':'Converts Word to a visual PDF. Layout can differ from Microsoft Word, and text in the resulting PDF is rendered as images.',
 'docx:png':'Renders Word pages as PNG images. Multiple pages download together as a ZIP archive.',
};
const fileSize=n=>n>=1048576?`${(n/1048576).toFixed(2)} MB`:`${(n/1024).toFixed(1)} KB`;
export default function DocumentConverter(){
  const [file,setFile]=useState(null),[target,setTarget]=useState('');
  const [dragging,setDragging]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const [result,setResult]=useState(null);
  const input=useRef(null),url=useRef(null);
  const revoke=()=>{if(url.current){URL.revokeObjectURL(url.current);url.current=null;}};
  useEffect(()=>()=>revoke(),[]);
  const pick=useCallback((selected)=>{
    if(!selected)return;
    try {
      const kind=assertSourceFile(selected);
      revoke();setResult(null);setFile(selected);setTarget(FILE_TYPES[kind].outputs[0]);
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
  const clear=()=>{if(busy)return;revoke();setResult(null);setFile(null);setTarget('');setError('');setMessage('');if(input.current)input.current.value='';};
  const run=async()=>{
    if(!file || !target || busy)return;
    setBusy(true);setError('');setMessage('Initializing conversion…');revoke();setResult(null);
    try{
      const {convertDocument}=await import('../utils/documentConverterEngine.js');
      const finished=await convertDocument(file,target,setMessage);
      const blob=finished.blob;
      const downloadName=outputName(file,finished.extension);
      url.current=URL.createObjectURL(blob);
      setResult({name:downloadName,size:blob.size,detail:finished.detail});
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
            {file?<div className="mt-3 grid gap-2 sm:grid-cols-2">{options.map(output=>{const Icon=icons[output]||File;return <button key={output} type="button" disabled={busy} aria-pressed={target===output} onClick={()=>{setTarget(output);setResult(null);revoke();setError('');}}
              className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${target===output?'border-brand bg-brand-soft ring-1 ring-brand/25':'border-line bg-surface hover:bg-surface-2'}`}>
              <span className="flex items-center gap-2.5"><Icon size={19} className={target===output?'text-brand-ink':'text-fg-muted'}/><span className="text-sm font-medium text-fg">{TARGET_LABELS[output]}</span></span>{target===output&&<CheckCircle2 size={16} className="text-brand-ink"/>}
            </button>})}</div>:<p className="mt-2 text-sm text-fg-muted">Select a supported document to see conversion formats.</p>}
            {file&&target&&<div className="mt-4 rounded-lg border border-line bg-surface-2/60 p-3 text-xs leading-relaxed text-fg-muted">{notes[`${kind}:${target}`]}</div>}
          </div>
          {error&&<div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger-ink">{error}</div>}
          {message&&<p aria-live="polite" className="text-sm text-fg-muted">{message}</p>}
          <button type="button" onClick={run} disabled={!file||!target||busy} className="btn btn-primary w-full justify-center !h-11">{busy?<LoaderCircle size={17} className="animate-spin"/>:<RefreshCw size={17}/>} {busy?'Converting file…':'Convert document'} {!busy&&<ArrowRight size={16}/>}</button>
        </section>
        {result&&<section className="rounded-xl border border-success/30 bg-success-soft/50 p-4" aria-live="polite">
          <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 shrink-0 text-success-ink" size={20}/>
          <div className="min-w-0 flex-1"><h3 className="font-semibold text-fg">Document ready</h3><p className="mt-1 break-words text-sm text-fg">{result.name}</p><p className="mt-1 text-xs text-fg-muted">{result.detail} · {fileSize(result.size)}</p></div></div>
          <button type="button" onClick={download} className="btn btn-primary mt-4 w-full justify-center"><Download size={16}/>Download converted file</button>
        </section>}
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
          <p className="mt-4 text-xs leading-relaxed text-fg-subtle">Old Office .doc/.xls files, image-only PDF-to-Word OCR, password-protected files, and exact reconstruction of complex layouts are not supported.</p>
        </div>
      </aside>
    </div>
  </div>;
}
