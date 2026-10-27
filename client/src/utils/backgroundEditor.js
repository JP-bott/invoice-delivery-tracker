// Pixel-preserving post-processing for ORMBG. Uses its alpha matte but retains
// the ORIGINAL image's RGB pixels and original dimensions for high-resolution exports.
// No images or edits leave the browser.
export const DEFAULT_CUTOUT_OPTIONS = Object.freeze({
  background: 'transparent', color: '#f4f7fb', format: 'png',
  cleanup: 0, feather: 0, shadow: false, autoCrop: false,
});
export const BACKGROUND_CHOICES = [
  {id:'transparent',label:'Transparent'},
  {id:'white',label:'White'},
  {id:'black',label:'Black'},
  {id:'studio',label:'Studio gradient'},
  {id:'blue',label:'Sky blue'},
  {id:'blur',label:'Blur original'},
  {id:'custom',label:'Custom'},
];
export const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
export const safeColor = (color) => /^#[0-9a-f]{6}$/i.test(String(color)) ? color : '#ffffff';
export const normaliseOptions = (value={}) => ({
  ...DEFAULT_CUTOUT_OPTIONS,...value,
  cleanup: clamp(Number(value.cleanup ?? 0)||0,0,40),
  feather: clamp(Number(value.feather ?? 0)||0,0,8),
  background: BACKGROUND_CHOICES.some(x=>x.id===value.background) ? value.background : 'transparent',
  color: safeColor(value.color),
  format: value.format==='jpg'?'jpg':'png',
});
export function fileNameForBackground(name, options=DEFAULT_CUTOUT_OPTIONS) {
  const base=String(name||'image').replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,90) || 'image';
  const ext=options.format==='jpg'?'jpg':'png';
  return `${base}_edited.${ext}`;
}
const canvas = (w,h) => {
  const c=document.createElement('canvas'); c.width=w;c.height=h;return c;
};
const context = (c) => {
  const ctx=c.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('Canvas editing is unavailable in this browser.');
  return ctx;
};
function line(ctx,stroke,w,h) {
  const points=stroke.points||[];
  if(!points.length)return;
  const radius=Math.max(1,(clamp(Number(stroke.size)||20,2,120)/1000)*Math.min(w,h));
  ctx.save();
  ctx.globalCompositeOperation=stroke.mode==='restore'?'source-over':'destination-out';
  ctx.strokeStyle='rgba(255,255,255,1)';
  ctx.fillStyle='rgba(255,255,255,1)';
  ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=radius;
  ctx.beginPath();
  points.forEach((p,i)=>{
    const x=clamp(p.x,0,1)*w,y=clamp(p.y,0,1)*h;
    if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  });
  if(points.length===1){const p=points[0];ctx.arc(clamp(p.x,0,1)*w,clamp(p.y,0,1)*h,radius/2,0,2*Math.PI);ctx.fill();}
  else ctx.stroke();
  ctx.restore();
}
export function subjectBounds(imageData,w,h,padding=0.07) {
  const d=imageData.data;let minX=w,minY=h,maxX=-1,maxY=-1;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    if(d[(y*w+x)*4+3]<25)continue;
    if(x<minX)minX=x;if(x>maxX)maxX=x;
    if(y<minY)minY=y;if(y>maxY)maxY=y;
  }
  if(maxX<0)return {x:0,y:0,width:w,height:h};
  const pad=Math.ceil(Math.max(maxX-minX+1,maxY-minY+1)*padding);
  const x=clamp(minX-pad,0,w-1),y=clamp(minY-pad,0,h-1);
  return {x,y,width:Math.min(w-x,maxX+pad+1-x),height:Math.min(h-y,maxY+pad+1-y)};
}
function paintBackground(ctx,opt,w,h,original) {
  if(opt.background==='transparent' && opt.format!=='jpg')return;
  if(opt.background==='blur'){
    ctx.save();ctx.filter=`blur(${Math.max(12,Math.round(Math.min(w,h)*.025))}px)`;
    const bleed=Math.max(30,Math.round(Math.min(w,h)*.06));
    ctx.drawImage(original,-bleed,-bleed,w+bleed*2,h+bleed*2);ctx.restore();return;
  }
  if(opt.background==='studio'){
    const gradient=ctx.createLinearGradient(0,0,w,h);
    gradient.addColorStop(0,'#e5effb');gradient.addColorStop(.55,'#f7f9fc');gradient.addColorStop(1,'#ccd9e7');
    ctx.fillStyle=gradient;
  }else{
    const colors={white:'#ffffff',black:'#141c2c',blue:'#dceeff',custom:opt.color,transparent:'#ffffff'};
    ctx.fillStyle=colors[opt.background]||'#ffffff';
  }
  ctx.fillRect(0,0,w,h);
}
export async function renderBackgroundEdit(sourceBlob,cutoutBlob,options={},strokes=[],config={}) {
  if(!sourceBlob||!cutoutBlob)throw new Error('Missing original image or AI cutout.');
  const opt=normaliseOptions(options);
  const [source,cutout]=await Promise.all([createImageBitmap(sourceBlob),createImageBitmap(cutoutBlob)]);
  let subject,matte,original;
  try{
    const scale=config.maxSide?Math.min(1,config.maxSide/Math.max(source.width,source.height)):1;
    const w=Math.max(1,Math.round(source.width*scale));
    const h=Math.max(1,Math.round(source.height*scale));
    if(w*h>25_000_000)throw new Error('Edited image exceeds the 25 megapixel export limit.');
    original=canvas(w,h);context(original).drawImage(source,0,0,w,h);
    // Extract alpha from AI cutout. The subject color will come from original RGB,
    // which avoids generation/downsampling artifacts inside opaque subject regions.
    const raw=canvas(w,h);const rawCtx=context(raw);
    rawCtx.drawImage(cutout,0,0,w,h);
    const pixels=rawCtx.getImageData(0,0,w,h),data=pixels.data;
    const shift=opt.cleanup/100;
    for(let i=0;i<data.length;i+=4){
      const a=data[i+3]/255;
      data[i]=255;data[i+1]=255;data[i+2]=255;
      data[i+3]=Math.round(clamp((a-shift)/(1-shift),0,1)*255);
    }
    rawCtx.putImageData(pixels,0,0);
    matte=canvas(w,h);const mc=context(matte);
    if(opt.feather>0){mc.filter=`blur(${Math.max(.2,opt.feather*scale)}px)`;}
    mc.drawImage(raw,0,0);mc.filter='none';
    raw.width=raw.height=0;
    for(const stroke of strokes)line(mc,stroke,w,h);
    subject=canvas(w,h);const sc=context(subject);
    sc.drawImage(original,0,0);
    sc.globalCompositeOperation='destination-in';
    sc.drawImage(matte,0,0);
    sc.globalCompositeOperation='source-over';
    const canCrop=Boolean(opt.autoCrop)&&!config.preview;
    const crop=canCrop?subjectBounds(sc.getImageData(0,0,w,h),w,h):
      {x:0,y:0,width:w,height:h};
    const output=canvas(crop.width,crop.height);
    const ctx=context(output);
    // Background compositing uses exactly the same crop as the subject, so
    // custom and blurred backgrounds stay aligned after subject cropping.
    if(opt.background!=='transparent'||opt.format==='jpg'){
      const bg=canvas(w,h);paintBackground(context(bg),opt,w,h,original);
      ctx.drawImage(bg,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);
      bg.width=bg.height=0;
    }
    if(opt.shadow){
      ctx.save();ctx.shadowColor='rgba(20,32,54,0.28)';
      ctx.shadowBlur=Math.round(Math.min(w,h)*.018);
      ctx.shadowOffsetY=Math.round(Math.min(w,h)*.012);
      ctx.drawImage(subject,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);
      ctx.restore();
    }else ctx.drawImage(subject,crop.x,crop.y,crop.width,crop.height,0,0,crop.width,crop.height);
    if(config.preview) return output;
    const mime=opt.format==='jpg'?'image/jpeg':'image/png';
    const blob=await new Promise((resolve,reject)=>
      output.toBlob(b=>b?resolve(b):reject(new Error('Could not encode the edited image.')),mime,opt.format==='jpg'?.94:undefined));
    output.width=output.height=0;
    return blob;
  }finally{
    source.close();cutout.close();
    if(subject)subject.width=subject.height=0;
    if(matte)matte.width=matte.height=0;
    if(original)original.width=original.height=0;
  }
}
