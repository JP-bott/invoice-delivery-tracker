import { useEffect, useRef, useState } from 'react';
import { Download, Eraser, Paintbrush, RotateCcw, Undo2, WandSparkles } from 'lucide-react';
import { DEFAULT_CUTOUT_OPTIONS, BACKGROUND_CHOICES, fileNameForBackground, renderBackgroundEdit } from '../../utils/backgroundEditor.js';
import { validateTransparentPng } from '../../utils/backgroundRemoval.js';

const sizeText=n=>n>=1048576?`${(n/1048576).toFixed(2)} MB`:`${Math.ceil(n/1024)} KB`;
export default function BackgroundStudio({original,cutout,originalName,onDownloadReady}) {
  const [options,setOptions]=useState({...DEFAULT_CUTOUT_OPTIONS});
  const [strokes,setStrokes]=useState([]);
  const [mode,setMode]=useState('erase'),[size,setSize]=useState(34);
  const [preview,setPreview]=useState(''),[working,setWorking]=useState(false),[error,setError]=useState('');
  const previewRef=useRef(null),currentRef=useRef(null),canvasRef=useRef(null),revision=useRef(0),drawing=useRef(null);
  useEffect(()=>()=>{revision.current++;if(previewRef.current)URL.revokeObjectURL(previewRef.current);},[]);
  useEffect(()=>{
    const generation=++revision.current;
    const task=setTimeout(async()=>{
      try {
        const canvas=await renderBackgroundEdit(original,cutout,options,strokes,{preview:true,maxSide:1100});
        if(generation!==revision.current){canvas.width=canvas.height=0;return;}
        const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Cannot preview image')),'image/png'));
        canvas.width=canvas.height=0;
        if(generation!==revision.current)return;
        const url=URL.createObjectURL(blob);
        if(previewRef.current)URL.revokeObjectURL(previewRef.current);
        previewRef.current=url;setPreview(url);setError('');
      } catch(e){if(generation===revision.current)setError(e.message);}
    },120);
    return ()=>{clearTimeout(task);revision.current++;};
  },[original,cutout,options,strokes]);
  const patch=(value)=>setOptions(prev=>({...prev,...value}));
  const point=(event)=>{
    const rect=canvasRef.current.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),
      y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
  };
  const start=(event)=>{
    if(working||!preview)return;
    event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current={mode,size,points:[point(event)]};
  };
  const move=(event)=>{
    if(!drawing.current)return;
    drawing.current.points.push(point(event));
  };
  const stop=(event)=>{
    if(!drawing.current)return;
    drawing.current.points.push(point(event));
    setStrokes(old=>[...old,drawing.current]);drawing.current=null;
  };
  const download=async()=>{
    if(working)return;
    setWorking(true);setError('');
    try {
      const blob=await renderBackgroundEdit(original,cutout,options,strokes);
      if(options.format==='png')await validateTransparentPng(blob);
      else {
        const bytes=new Uint8Array(await blob.slice(0,3).arrayBuffer());
        if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new Error('Invalid JPG export.');
      }
      const name=fileNameForBackground(originalName,options);
      onDownloadReady({blob,name,detail:`Edited ${options.format.toUpperCase()} · ${sizeText(blob.size)}`});
    }catch(e){setError(e.message);}finally{setWorking(false);}
  };
  return <section className="card card-pad space-y-4" aria-label="Background editor">
    <div className="flex items-center justify-between gap-3">
      <div><p className="eyebrow">CREATIVE STUDIO</p><h2 className="mt-1 text-base font-semibold text-fg">Refine your cutout</h2><p className="mt-1 text-xs text-fg-muted">Edit edges and choose your background. Original-resolution export.</p></div>
      <button type="button" className="btn btn-ghost" onClick={()=>{setStrokes([]);setOptions({...DEFAULT_CUTOUT_OPTIONS});}} disabled={working}><RotateCcw size={15}/>Reset</button>
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_250px]">
      <div className="space-y-3">
        <div ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}
          className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line touch-none"
          aria-label="Paint on the image to manually erase or restore portions of the subject" role="img"
          style={{backgroundColor:'#fff',backgroundImage:'linear-gradient(45deg,#ddd 25%,transparent 25%),linear-gradient(-45deg,#ddd 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ddd 75%),linear-gradient(-45deg,transparent 75%,#ddd 75%)',backgroundSize:'20px 20px',backgroundPosition:'0 0,0 10px,10px -10px,-10px 0'}}>
          {preview?<img src={preview} alt="Edited cutout preview" className="pointer-events-none h-full w-full object-fill"/>:<div className="grid h-full place-items-center text-sm text-fg-muted">Preparing preview…</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`btn ${mode==='erase'?'btn-primary':'btn-secondary'}`} onClick={()=>setMode('erase')}><Eraser size={15}/>Erase</button>
          <button type="button" className={`btn ${mode==='restore'?'btn-primary':'btn-secondary'}`} onClick={()=>setMode('restore')}><Paintbrush size={15}/>Restore</button>
          <button type="button" className="btn btn-ghost" onClick={()=>setStrokes(old=>old.slice(0,-1))} disabled={!strokes.length}><Undo2 size={15}/>Undo</button>
        </div>
        <label className="block text-xs text-fg-muted">Brush size: {size}<input type="range" min="3" max="120" value={size} onChange={e=>setSize(+e.target.value)} className="mt-2 w-full accent-indigo-600"/></label>
      </div>
      <div className="space-y-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Background</p>
          <div className="mt-2 grid grid-cols-2 gap-2">{BACKGROUND_CHOICES.map(item=><button type="button" key={item.id} aria-pressed={options.background===item.id}
            onClick={()=>patch({background:item.id})} className={`rounded-lg border p-2 text-xs font-medium ${options.background===item.id?'border-brand bg-brand-soft text-brand-ink':'border-line bg-surface-2 text-fg-muted'}`}>{item.label}</button>)}</div>
          {options.background==='custom'&&<label className="mt-2 flex items-center gap-2 text-xs text-fg-muted">Background color<input type="color" value={options.color} onChange={e=>patch({color:e.target.value})}/></label>}
        </div>
        <label className="block text-xs text-fg-muted">Edge cleanup · {options.cleanup}%<input type="range" min="0" max="40" value={options.cleanup} onChange={e=>patch({cleanup:+e.target.value})} className="mt-2 w-full accent-indigo-600"/></label>
        <label className="block text-xs text-fg-muted">Edge feather · {options.feather}px<input type="range" min="0" max="8" value={options.feather} onChange={e=>patch({feather:+e.target.value})} className="mt-2 w-full accent-indigo-600"/></label>
        <label className="flex items-center gap-2 text-xs text-fg-muted"><input type="checkbox" checked={options.shadow} onChange={e=>patch({shadow:e.target.checked})}/>Subtle subject shadow</label>
        <label className="flex items-center gap-2 text-xs text-fg-muted"><input type="checkbox" checked={options.autoCrop} onChange={e=>patch({autoCrop:e.target.checked})}/>Auto-crop empty borders</label>
        <div><p className="mb-2 text-xs font-semibold uppercase text-fg-muted">Export format</p><div className="flex gap-2">{['png','jpg'].map(f=><button key={f} type="button" aria-pressed={options.format===f} className={`btn ${options.format===f?'btn-primary':'btn-secondary'}`} onClick={()=>patch({format:f})}>{f.toUpperCase()}</button>)}</div><p className="mt-1 text-xs text-fg-subtle">JPG uses a solid background; PNG supports transparency.</p></div>
      </div>
    </div>
    {error&&<p role="alert" className="text-sm text-danger-ink">{error}</p>}
    <button type="button" className="btn btn-primary w-full justify-center !h-11" onClick={download} disabled={working}>
      {working?<WandSparkles className="animate-pulse" size={16}/>:<Download size={16}/>}
      {working?'Rendering full-resolution image…':'Export edited image'}
    </button>
  </section>;
}
