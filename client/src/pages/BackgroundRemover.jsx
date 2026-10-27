import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, ImagePlus, LoaderCircle, LockKeyhole, RefreshCw, Scissors, UploadCloud, X } from 'lucide-react';
import { PageHeader } from '../components/ui.jsx';
import Modal from '../components/Modal.jsx';
import BackgroundComparison from '../components/background/BackgroundComparison.jsx';
import { inspectImage, transparentFileName, cutOutBackground } from '../utils/backgroundRemoval.js';

const readableSize=(n)=>n>=1048576?`${(n/1048576).toFixed(2)} MB`:`${(n/1024).toFixed(1)} KB`;
export default function BackgroundRemover() {
  const [file,setFile]=useState(null),[dimensions,setDimensions]=useState(null);
  const [beforeUrl,setBeforeUrl]=useState(''),[afterUrl,setAfterUrl]=useState('');
  const [result,setResult]=useState(null),[dialog,setDialog]=useState(false);
  const [successVisible,setSuccessVisible]=useState(false);
  const [busy,setBusy]=useState(false),[checking,setChecking]=useState(false);
  const [drag,setDrag]=useState(false),[error,setError]=useState('');
  const [progress,setProgress]=useState({message:'',percent:null});
  const [compare,setCompare]=useState(50);
  const picker=useRef(null),beforeRef=useRef(null),afterRef=useRef(null),generation=useRef(0),active=useRef(true);
  const downloadUrl=useRef(null),successTimer=useRef(null);
  useEffect(()=>()=>{active.current=false;generation.current++;if(beforeRef.current)URL.revokeObjectURL(beforeRef.current);if(afterRef.current)URL.revokeObjectURL(afterRef.current);if(downloadUrl.current && downloadUrl.current!==afterRef.current)URL.revokeObjectURL(downloadUrl.current);if(successTimer.current)clearTimeout(successTimer.current);},[]);
  const discardOutput=useCallback(()=>{
    if(successTimer.current)clearTimeout(successTimer.current);
    if(downloadUrl.current && downloadUrl.current!==afterRef.current)URL.revokeObjectURL(downloadUrl.current);
    if(afterRef.current)URL.revokeObjectURL(afterRef.current);
    afterRef.current=null;downloadUrl.current=null;setAfterUrl('');setResult(null);setSuccessVisible(false);
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
    setBusy(true);setError('');discardOutput();setDialog(true);setProgress({message:'Getting ready…',percent:null});
    try {
      const converted=await cutOutBackground(file,(state)=>{
        if(active.current&&id===generation.current)setProgress(state);
      });
      if(!active.current||id!==generation.current)return;
      const url=URL.createObjectURL(converted.blob);
      afterRef.current=url;downloadUrl.current=url;setAfterUrl(url);
      setResult({name:transparentFileName(file.name),size:converted.blob.size,engine:converted.engine});
      setCompare(50);setSuccessVisible(true);
      setProgress({message:'Done!',percent:null});
      successTimer.current=setTimeout(()=>{if(active.current&&id===generation.current)setSuccessVisible(false);},1250);
    } catch(e) {
      if(active.current&&id===generation.current)setError(e?.message||'Could not remove the background. Please try again.');
    } finally {if(active.current&&id===generation.current)setBusy(false);}
  };
  const download=()=>{
    if(!downloadUrl.current||!result)return;
    const link=document.createElement('a');
    link.href=downloadUrl.current;link.download=result.name;
    document.body.appendChild(link);link.click();link.remove();
  };
  const closeWorkspace=()=>{if(!busy)setDialog(false);};
  return <div className="mx-auto max-w-3xl space-y-5">
    <PageHeader title="Image Background Remover" description="Remove a photo background in a few clicks." actions={file&&<button className="btn btn-secondary" disabled={busy||checking} onClick={reset}><RefreshCw size={15}/>New image</button>}/>
        <section className="card card-pad space-y-4" aria-label="Image upload and background removal">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold text-fg">Choose a photo</h2></div>
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
            <p className="font-semibold text-fg">Drop a photo here or click to upload</p>
            <p className="mt-1 text-sm text-fg-muted">You can also paste a photo (Ctrl+V)</p>
            <p className="mt-3 text-xs text-fg-subtle">Maximum size: 25 MB</p>
          </div>
          {file&&<div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink"><ImagePlus size={19}/></span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-fg">{file.name}</p><p className="mt-0.5 text-xs text-fg-muted">{dimensions?.width} × {dimensions?.height} · {readableSize(file.size)}</p></div>
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove image" disabled={busy||checking} onClick={reset}><X size={16}/></button>
          </div>}
          {error&&<p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger-ink">{error}</p>}
          {(busy||checking)&&<p className="flex items-center gap-2 text-xs text-fg-muted" role="status" aria-live="polite">
            <LoaderCircle size={15} className="animate-spin text-brand" aria-hidden="true" />
            {checking ? 'Checking photo…' : progress.message || 'Working on your photo…'}
          </p>}
          <button type="button" className="btn btn-primary !h-11 w-full justify-center" disabled={!file||busy||checking} onClick={remove}>
            {busy?<LoaderCircle className="animate-spin" size={17}/>:<Scissors size={17}/>}
            {busy?'Working on your photo…':'Remove background'}
            {!busy&&<Sparkles size={15}/>}
          </button>
        </section>
    <p className="flex items-center justify-center gap-2 text-xs text-fg-muted">
      <LockKeyhole size={14} aria-hidden="true"/> Your photo stays private and is not saved.
    </p>
    {dialog && <Modal title="Remove background" description={busy ? "Working on your photo…" : result ? "Compare and download your photo." : "Try again when ready."}
      width="max-w-4xl" onClose={closeWorkspace} dismissOnBackdrop={!busy}
      footer={<>
        {!busy && <button type="button" className="btn btn-secondary" onClick={closeWorkspace}>Close</button>}
        {result && !busy && <button type="button" data-autofocus className="btn btn-primary" onClick={download}><Download size={16}/>Download image</button>}
      </>}>
      <BackgroundComparison originalUrl={beforeUrl} processedUrl={afterUrl} dimensions={dimensions}
        compare={compare} onCompare={setCompare} processing={busy} checking={false} progress={progress} succeeded={successVisible}/>
      {!busy && !result && error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger-ink">{error}</div>}
      {result && <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/50 p-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-fg">{result.name}</span>
          <span className="block text-xs text-fg-muted">{readableSize(result.size)} · PNG image</span>
        </span>
        <CheckCircle2 className="shrink-0 text-success-ink" size={22} aria-label="Completed"/>
      </div>}
    </Modal>}
    {result && !dialog && <button type="button" onClick={()=>setDialog(true)} className="fixed bottom-5 right-4 z-40 flex items-center gap-3 rounded-xl border border-success/30 bg-surface px-4 py-3 shadow-pop sm:right-6">
      <CheckCircle2 className="text-success-ink" size={20}/><span className="text-sm font-semibold text-fg">View your image</span><Download size={16} className="text-brand-ink"/>
    </button>}
  </div>;
}
