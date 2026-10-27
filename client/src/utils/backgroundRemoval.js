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
// Prefer the pinned official-model-derived BiRefNet General Lite 512 ONNX
// with reliable CPU/WASM execution (avoids earlier WebGPU WGSL shader errors).
export const BACKGROUND_REMOVAL_DEVICE = 'wasm';

export function describeRemovalProgress(event = {}) {
  return {
    message: String(event.message || 'Removing background…'),
    percent: Number.isFinite(event.percent) && event.percent >= 0 && event.percent <= 100
      ? event.percent : null,
  };
}

export async function cutOutBackground(file, report = () => {}) {
  await inspectImage(file);
  report({message:'Getting ready…',percent:null});
  try {
    const {runBiRefNet} = await import('./birefnetLite.js');
    const blob = await runBiRefNet(file, state => report(describeRemovalProgress(state)));
    const png = await validateTransparentPng(blob);
    return {blob:png,engine:'BiRefNet General Lite',mode:'Local WebAssembly'};
  } catch (error) {
    const message = String(error?.message || '');
    if (/fetch|download|network|failed to load model/i.test(message)) {
      throw new Error('Could not load the photo tool. Check your connection and try again.');
    }
    if (/memory|alloc|wasm|out.of.memory/i.test(message)) {
      throw new Error('Not enough memory to finish. Try a smaller photo or close other tabs.');
    }
    // Keep technical runtime errors out of the user-facing interface.
    throw new Error('Could not remove the background. Please try another photo.');
  }
}
