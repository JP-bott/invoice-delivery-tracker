// Browser-only AI cutout utilities. Images are never transmitted to the application API.
// Uses the MIT-licensed ResizeBox browser engine and Apache-2.0 ORMBG model.
// Inference is pinned to WebAssembly to avoid a known ONNX Runtime WebGPU GatherND shader failure.
export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp';
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 25_000_000;
const accepted = new Set(['png','jpg','jpeg','webp']);
export function imageExtension(name = '') {
  return String(name).split('.').at(-1)?.toLowerCase() || '';
}
export function validateImageSelection(file) {
  if (!file || typeof file.slice !== 'function' || typeof file.arrayBuffer !== 'function') {
    throw new Error('Please select a PNG, JPEG, or WebP image.');
  }
  if (!accepted.has(imageExtension(file.name))) {
    throw new Error('Only PNG, JPG/JPEG, and WebP images are supported.');
  }
  if (!file.size) throw new Error('The selected image is empty.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('This image exceeds the 25 MB limit.');
  return true;
}
const startsWith = (bytes, signature) => signature.every((n,i)=>bytes[i]===n);
export async function inspectImage(file) {
  validateImageSelection(file);
  const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const png=startsWith(bytes,[137,80,78,71,13,10,26,10]);
  const jpeg=startsWith(bytes,[255,216,255]);
  const webp=startsWith(bytes,[82,73,70,70]) &&
    startsWith(bytes.slice(8),[87,69,66,80]);
  const ext=imageExtension(file.name);
  if (!((ext==='png' && png) || (['jpg','jpeg'].includes(ext) && jpeg) || (ext==='webp' && webp))) {
    throw new Error('File content does not match the image extension.');
  }
  let bitmap;
  try {
    bitmap=await createImageBitmap(file);
    const width=bitmap.width, height=bitmap.height;
    if (!width || !height || width*height>MAX_IMAGE_PIXELS) {
      throw new Error('Image dimensions are too large (maximum 25 megapixels).');
    }
    return {width,height};
  } catch (error) {
    if (error?.message?.includes('megapixels')) throw error;
    throw new Error('The image could not be decoded. Try a different PNG, JPG, or WebP.');
  } finally { bitmap?.close(); }
}
export function transparentFileName(name) {
  const clean=String(name||'image').replace(/\.[^.]+$/,'')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,100) || 'image';
  return `${clean}_no_background.png`;
}
export async function validateTransparentPng(blob) {
  if (!(blob instanceof Blob) || blob.size<70) throw new Error('The AI returned an empty image.');
  const sig=new Uint8Array(await blob.slice(0,29).arrayBuffer());
  if (!startsWith(sig,[137,80,78,71,13,10,26,10]) ||
      !startsWith(sig.slice(12),[73,72,68,82])) {
    throw new Error('The generated download is not a valid PNG.');
  }
  // PNG color type 6 = RGBA, 4 = grayscale+alpha. A valid alpha channel is required.
  if (sig[25]!==6 && sig[25]!==4) {
    throw new Error('The generated PNG does not support transparency.');
  }
  return blob;
}
// The BiRefNet Lite model used by the previous WebGPU-first path can trigger
// ONNX Runtime's GatherND computeSliceOffsets WGSL bug, producing hundreds
// of validation errors without a usable mask. Force the CPU/WASM provider
// rather than merely relying on model initialization fallback.
// https://github.com/microsoft/onnxruntime/issues/32731
export const BACKGROUND_REMOVAL_DEVICE = 'wasm';

export function describeRemovalProgress(event = {}) {
  const raw = Number(event.progress);
  const percent = Number.isFinite(raw) && raw >= 0
    ? Math.max(0, Math.min(100, Math.round(raw))) : null;
  const phase = String(event.phase || '');
  const messages = {
    'loading-model': 'Loading local AI model…',
    'downloading-model': 'Downloading AI model to your browser…',
    initializing: 'Starting CPU compatibility engine…',
    fallback: 'Switching to compatible CPU processing…',
    ready: 'AI model ready…',
    processing: 'Removing background and refining edges…',
  };
  return {message: event.message || messages[phase] || 'Removing background…', percent};
}

export async function cutOutBackground(file, report = () => {}) {
  await inspectImage(file);
  report({message:'Preparing reliable CPU compatibility mode…',percent:null});
  try {
    const {removeBackground} = await import('@resizebox/background-remover');
    const output = await removeBackground(file,{
      device: BACKGROUND_REMOVAL_DEVICE,
      background: 'transparent',
      onProgress: (event) => report(describeRemovalProgress(event)),
    });
    // Reject corrupted, opaque, or empty results instead of offering an invalid download.
    const png = await validateTransparentPng(output?.blob);
    return {blob:png,engine:'ORMBG',mode:'Local WebAssembly (CPU)'};
  } catch (error) {
    const message = String(error?.message || '');
    if (/fetch|download|network|model.*load/i.test(message)) {
      throw new Error('Could not load the local AI model. Check your connection and try again.');
    }
    if (/memory|allocation|wasm|out.of.memory/i.test(message)) {
      throw new Error('Your browser ran out of memory while processing. Close unused tabs or try a smaller image.');
    }
    throw new Error(message || 'Background removal could not finish. Try another image.');
  }
}
