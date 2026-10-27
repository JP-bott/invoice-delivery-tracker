// A browser-ready ONNX export of the official MIT-licensed ZhengPeng7/BiRefNet_lite
// checkpoint. The upstream 1024px ONNX exports exceed practical browser WASM memory;
// this 512px export preserves the original trained weights, not a different model.
// See: https://huggingface.co/studioludens/birefnet-lite-512
// Runs with Apache-2.0 Transformers.js; no paid API or image upload.
export const BIREFNET_MODEL_ID = 'studioludens/birefnet-lite-512';
export const BIREFNET_REVISION = '4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7';
export const BIREFNET_INPUT_RESOLUTION = 512;
export const BIREFNET_DEVICE = 'wasm';
export const BIREFNET_DTYPE = 'fp32'; // Stable CPU execution; fp16 is for GPU.

let loadedEngine;
let loadingPromise;
const progressListeners = new Set();

function announce(message, percent = null) {
  for (const listener of progressListeners) {
    try { listener({ message, percent }); } catch { /* UI must never stop model loading */ }
  }
}

export function modelDownloadProgress(event) {
  const status = event?.status;
  if (status === 'progress') {
    const value = Number(event?.progress);
    const percent = Number.isFinite(value) && value >= 0 && value <= 100
      ? Math.round(value) : null;
    return {message: 'Downloading photo tools…', percent};
  }
  if (status === 'initiate') return {message: 'Getting things ready…', percent:null};
  if (status === 'done') return {message: 'Almost ready…', percent:null};
  return null;
}

export async function getBiRefNetEngine(report = () => {}) {
  if (loadedEngine) {
    report({message: 'Ready to go…', percent:null});
    return loadedEngine;
  }
  progressListeners.add(report);
  if (!loadingPromise) {
    loadingPromise = (async () => {
      announce('Getting things ready…');
      const {AutoModel, AutoProcessor, env} = await import('@huggingface/transformers');
      env.allowRemoteModels = true;
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      env.useWasmCache = true;

      // Load the official-model-derived processor configuration, then the pinned ONNX.
      const processor = await AutoProcessor.from_pretrained(BIREFNET_MODEL_ID, {
        revision: BIREFNET_REVISION,
      });
      announce('Getting ready for your first photo…');
      const model = await AutoModel.from_pretrained(BIREFNET_MODEL_ID, {
        revision: BIREFNET_REVISION,
        device: BIREFNET_DEVICE, dtype: BIREFNET_DTYPE,
        progress_callback: (event) => {
          const update = modelDownloadProgress(event);
          if (update) announce(update.message, update.percent);
        },
      });
      loadedEngine = {model,processor};
      announce('Ready to go…');
      return loadedEngine;
    })().catch(error => {
      // Permit retry after network, storage, or model-initialization failures.
      loadingPromise = null;
      throw error;
    }).finally(() => progressListeners.clear());
  }
  return loadingPromise;
}

// Converts 512px single-channel model logits to an RGBA matte. The ONNX graph
// returns LOGITS, not a final normalized alpha mask. Applying sigmoid is required.
export function logitsToAlpha(logits) {
  const data=logits?.data, shape=logits?.dims;
  if(!data || !Array.isArray(shape) || shape.length<2) {
    throw new Error('BiRefNet returned an unexpected output tensor.');
  }
  const width=Number(shape.at(-1)),height=Number(shape.at(-2));
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1 ||
    width*height>4096*4096||data.length!==width*height) {
    throw new Error('BiRefNet returned an invalid segmentation mask.');
  }
  const rgba=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i++){
    const value=Number(data[i]);
    if(!Number.isFinite(value))throw new Error('BiRefNet returned non-finite alpha logits.');
    const alpha=255/(1+Math.exp(-Math.max(-40,Math.min(40,value))));
    const p=i*4;
    rgba[p]=255;rgba[p+1]=255;rgba[p+2]=255;rgba[p+3]=Math.round(alpha);
  }
  return {rgba,width,height};
}

const canvasFor=(w,h)=>{
  const canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;return canvas;
};
const pngFromCanvas=canvas=>new Promise((resolve,reject)=>{
  canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not encode transparent PNG.')),'image/png');
});

// Apply the AI mask to the original RGB data at the original resolution.
// Only the input to the model is scaled to 512px. The downloadable result is not.
export async function composeOriginalSizePng(originalFile, matte) {
  const bitmap=await createImageBitmap(originalFile);
  let source,mask;
  try {
    const {width,height}=bitmap;
    if(width*height>25_000_000)throw new Error('Image exceeds the 25 megapixel browser limit.');
    source=canvasFor(width,height);const ctx=source.getContext('2d');
    mask=canvasFor(matte.width,matte.height);
    const maskCtx=mask.getContext('2d');
    if(!ctx||!maskCtx)throw new Error('Your browser cannot allocate an image canvas.');
    ctx.drawImage(bitmap,0,0);
    maskCtx.putImageData(new ImageData(matte.rgba,matte.width,matte.height),0,0);
    ctx.globalCompositeOperation='destination-in';
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    ctx.drawImage(mask,0,0,width,height);
    ctx.globalCompositeOperation='source-over';
    return await pngFromCanvas(source);
  } finally {
    bitmap.close();if(source)source.width=source.height=0;
    if(mask)mask.width=mask.height=0;
  }
}

export async function runBiRefNet(file, report = () => {}) {
  const {model,processor} = await getBiRefNetEngine(report);
  report({message:'Preparing your photo…',percent:null});
  const {RawImage} = await import('@huggingface/transformers');
  const url=URL.createObjectURL(file);
  let image;
  try {image=await RawImage.read(url);}
  finally {URL.revokeObjectURL(url);}
  const {pixel_values} = await processor(image);
  report({message:'Removing background…',percent:null});
  // Let React paint the processing indicator before CPU-heavy inference.
  await new Promise(resolve=>setTimeout(resolve,0));
  const output=await model({input_image:pixel_values});
  const matte=logitsToAlpha(output?.logits ?? output?.output_image);
  report({message:'Finishing your photo…',percent:null});
  const blob=await composeOriginalSizePng(file,matte);
  return blob;
}
