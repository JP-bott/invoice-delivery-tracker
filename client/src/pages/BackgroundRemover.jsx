import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, ImagePlus, LoaderCircle, LockKeyhole, RefreshCw, Scissors, ShieldCheck, Sparkles, UploadCloud, X } from 'lucide-react';
import { PageHeader } from '../components/ui.jsx';
import Modal from '../components/Modal.jsx';
import BackgroundComparison from '../components/background/BackgroundComparison.jsx';
import { inspectImage, transparentFileName, cutOutBackground } from '../utils/backgroundRemoval.js';

const readableSize=(n)=>n>=1048576?`${(n/1048576).toFixed(2)} MB`:`${(n/1024).toFixed(1)} KB`;
export default function BackgroundRemover() {
  const [file,setFile]=useState(null),[dimensions,setDimensions]=useState(null);
  const [beforeUrl,setBeforeUrl]=useState(''),[afterUrl,setAfterUrl]=useState('');
  const [result,setResult]=useState(null),[dialog,setDialog]=useState(false);
  const [busy,setBusy]=useState(false),[checking,setChecking]=useState(false);
  const [drag,setDrag]=useState(false),[error,setError]=useState('');
  const [progress,setProgress]=useState({message:'',percent:null});
  const [compare,setCompare]=useState(50);
  const picker=useRef(null),beforeRef=useRef(null),afterRef=useRef(null),generation=useRef(0),active=useRef(true);
  const downloadUrl=useRef(null);
  useEffect(()=>()=>{active.current=false;generation.current++;if(beforeRef.current)URL.revokeObjectURL(beforeRef.current);if(afterRef.current)URL.revokeObjectURL(afterRef.current);if(downloadUrl.current)URL.revokeObjectURL(downloadUrl.current);},[]);
  const discardOutput=useCallback(()=>{
    if(afterRef.current)URL.revokeObjectURL(afterRef.current);
    afterRef.current=null;if(downloadUrl.current)URL.revokeObjectURL(downloadUrl.current);downloadUrl.current=null;setAfterUrl('');setResult(null);setDialog(false);
  },[]);
  const select=useCallback(async (image)=>{
    if(!image||busy||checking)return;
    const id=++generation.current;
    setChecking(true);setError('');setProgress({message:'',percent:null});
    try {
      const info=await inspectImage(image);
      if(!active.current||id!==generation.current)return;
      discardOutput();
      if(beforeRef.current)URL.revokeObjectURL(beforeRef.current);
      const url=URL.createObjectURL(image);beforeRef.current=url;
      setBeforeUrl(url);setFile(image);setDimensions(info);setCompare(50);
    } catch(e) {if(id===generation.current&&active.current)setError(e.message);}
    finally {if(id===generation.current&&active.current)setChecking(false);}
  },[busy,checking,discardOutput]);
  useEffect(()=>{
    const onPaste=(event)=>{
      if(busy||checking)return;
      const image=[...(event.clipboardData?.files||[])].find((f)=>f.type.startsWith('image/'));
      if(image){event.preventDefault();select(image.name?image:new File([image],`pasted-image.${image.type==='image/jpeg'?'jpg':image.type==='image/webp'?'webp':'png'}`,{type:image.type}));}
    };
    document.addEventListener('paste',onPaste);
    return ()=>document.removeEventListener('paste',onPaste);
  },[busy,checking,select]);
  const reset=()=>{
    if(busy||checking)return;
    generation.current++;discardOutput();
    if(beforeRef.current)URL.revokeObjectURL(beforeRef.current);
    beforeRef.current=null;setBeforeUrl('');setFile(null);setDimensions(null);setError('');setCompare(50);
    if(picker.current)picker.current.value='';
  };
  const remove=async()=>{
    if(!file||busy||checking)return;
    const id=++generation.current;
    setBusy(true);setError('');discardOutput();setProgress({message:'Starting AI background removal…',percent:null});
    try {
      const converted=await cutOutBackground(file,(state)=>{
        if(active.current&&id===generation.current)setProgress(state);
      });
      if(!active.current||id!==generation.current)return;
      const url=URL.createObjectURL(converted.blob);
      afterRef.current=url;downloadUrl.current=url;setAfterUrl(url);
      setResult({name:transparentFileName(file.name),size:converted.blob.size,engine:converted.engine});
      setCompare(50);setDialog(true);
      setProgress({message:'Background successfully removed.',percent:100});
    } catch(e) {
      if(active.current&&id===generation.current)setError(e?.message||'Unable to remove the background. Try another image.');
    } finally {if(active.current&&id===generation.current)setBusy(false);}
  };
  const download=()=>{
    if(!downloadUrl.current||!result)return;
    const link=document.createElement('a');
    link.href=downloadUrl.current;link.download=result.name;
    document.body.appendChild(link);link.click();link.remove();
  };
  return <div className="mx-auto max-w-6xl space-y-5">
    <PageHeader title="Image Background Remover" description="Remove backgrounds with open-source AI. Your photos stay in your browser. BiRefNet General Lite produces a transparent PNG ready to preview and download." actions={file&&<button className="btn btn-secondary" disabled={busy||checking} onClick={reset}><RefreshCw size={15}/>New image</button>}/>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="space-y-5">
        <section className="card card-pad space-y-4" aria-label="Image upload and background removal">
          <div className="flex items-center justify-between gap-3">
            <div><p className="eyebrow">IMAGE WORKSPACE</p><h2 className="mt-1 text-base font-semibold text-fg">Upload your image</h2></div>
            <span className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-fg-muted">PNG · JPG · WebP</span>
          </div>
          <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose image" disabled={busy||checking} onChange={e=>{select(e.target.files?.[0]);e.target.value='';}}/>
          <div role="button" tabIndex={busy||checking?-1:0} aria-disabled={busy||checking}
            onClick={()=>!busy&&!checking&&picker.current?.click()}
            onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&!busy&&!checking){e.preventDefault();picker.current?.click();}}}
            onDragOver={e=>{e.preventDefault();if(!busy&&!checking)setDrag(true);}}
            onDragLeave={e=>{e.preventDefault();if(!e.currentTarget.contains(e.relatedTarget))setDrag(false);}}
            onDrop={e=>{e.preventDefault();setDrag(false);select(e.dataTransfer?.files?.[0]);}}
            className={`cursor-pointer rounded-2xl border-2 border-dashed px-5 py-9 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${drag?'border-brand bg-brand-soft':'border-line-strong bg-surface-2/40 hover:border-brand/50 hover:bg-surface-2'}`}>
            <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface text-brand"><UploadCloud size={27}/></span>
            <p className="font-semibold text-fg">Drop an image or click to browse</p>
            <p className="mt-1 text-sm text-fg-muted">You can also paste a copied image with Ctrl+V</p>
            <p className="mt-3 text-xs text-fg-subtle">Up to 25 MB and 25 megapixels</p>
          </div>
          {file&&<div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink"><ImagePlus size={19}/></span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-fg">{file.name}</p><p className="mt-0.5 text-xs text-fg-muted">{dimensions?.width} × {dimensions?.height} · {readableSize(file.size)}</p></div>
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove image" disabled={busy||checking} onClick={reset}><X size={16}/></button>
          </div>}
          {error&&<p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>}
          {(busy||checking)&&<p className="flex items-center gap-2 text-xs text-fg-muted" role="status" aria-live="polite">
            <LoaderCircle size={15} className="animate-spin text-brand" aria-hidden="true" />
            {checking ? 'Validating image…' : progress.message || 'Processing your image…'}
          </p>}
          <button type="button" className="btn btn-primary !h-11 w-full justify-center" disabled={!file||busy||checking} onClick={remove}>
            {busy?<LoaderCircle className="animate-spin" size={17}/>:<Scissors size={17}/>}
            {busy?'Removing background…':'Remove background'}
            {!busy&&<Sparkles size={15}/>}
          </button>
        </section>
        <section className="card card-pad space-y-4" aria-label="Before and after preview">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-base font-semibold text-fg">Before & after</h2><p className="mt-1 text-xs text-fg-muted">Drag the vertical divider on the image to reveal the original and transparent result.</p></div>
            {result&&<button className="btn btn-secondary" onClick={()=>setDialog(true)}><Download size={15}/>Download PNG</button>}
          </div>
          <BackgroundComparison originalUrl={beforeUrl} processedUrl={afterUrl} dimensions={dimensions}
            compare={compare} onCompare={setCompare} processing={busy} checking={checking} progress={progress}/>
        </section>
      </div>
      <aside className="space-y-4">
        <div className="card card-pad"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-success-ink"/><h3 className="font-semibold text-fg">Private processing</h3></div><p className="mt-2 text-sm leading-relaxed text-fg-muted">Images are processed on your device. No image is uploaded to the app server or stored in the invoice database.</p><p className="mt-3 flex items-center gap-2 text-xs text-fg-subtle"><LockKeyhole size={14}/>Nothing saved after this session</p></div>
        <div className="card card-pad"><div className="flex items-center gap-2"><Sparkles size={18} className="text-brand"/><h3 className="font-semibold text-fg">Open-source AI</h3></div><p className="mt-2 text-sm leading-relaxed text-fg-muted">Powered by MIT-licensed BiRefNet General Lite model weights and Apache-2.0 Transformers.js running locally in WebAssembly. The model downloads on first use and is cached in your browser. CPU inference may require substantial memory and time.</p><p className="mt-3 text-xs leading-relaxed text-fg-subtle">The output is a transparent PNG at the original image dimensions where supported. Fine hair or translucent objects may still have imperfect edges.</p></div>
      </aside>
    </div>
    {result&&dialog&&<Modal title="Your image is ready" description="Background removed successfully. Download your finished image." width="max-w-md" onClose={()=>setDialog(false)} footer={<>
      <button type="button" className="btn btn-secondary" onClick={()=>setDialog(false)}>Close</button>
      <button type="button" data-autofocus className="btn btn-primary" onClick={download}><Download size={16}/>Download file</button>
    </>}>
      <div className="flex flex-col items-center gap-3 py-2 text-center"><span className="grid h-16 w-16 place-items-center rounded-full bg-success-soft text-success-ink"><CheckCircle2 size={32}/></span><h3 className="text-base font-semibold text-fg">Your image is ready</h3></div>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3"><ImagePlus size={21} className="shrink-0 text-brand-ink"/><div className="min-w-0"><p className="break-all text-sm font-medium text-fg">{result.name}</p><p className="mt-1 text-xs text-fg-muted">{readableSize(result.size)} · Transparent PNG</p></div></div>
    </Modal>}
    {result&&!dialog&&<button type="button" onClick={()=>setDialog(true)} className="fixed bottom-5 right-4 z-40 flex items-center gap-3 rounded-xl border border-success/30 bg-surface px-4 py-3 shadow-pop sm:right-6"><CheckCircle2 className="text-success-ink" size={20}/><span className="text-sm font-semibold text-fg">PNG ready to download</span><Download size={16} className="text-brand-ink"/></button>}
  </div>;
}
