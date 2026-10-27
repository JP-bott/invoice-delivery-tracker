import { describe, it, expect } from 'vitest';
import { imageExtension, transparentFileName, validateImageSelection, validateTransparentPng, describeRemovalProgress, BACKGROUND_REMOVAL_DEVICE, MAX_IMAGE_BYTES } from '../../client/src/utils/backgroundRemoval.js';

describe('image background remover input and output safety', () => {
  it('accepts PNG JPEG and WebP names', () => {
    expect(imageExtension('photo.PNG')).toBe('png');
    expect(validateImageSelection(new File(['image'],'photo.jpg'))).toBe(true);
    expect(validateImageSelection(new File(['image'],'photo.webp'))).toBe(true);
  });
  it('rejects unsupported files and oversized photos', () => {
    expect(() => validateImageSelection(new File(['test'],'a.svg'))).toThrow(/Only PNG/);
    expect(() => validateImageSelection(new File([], 'a.png'))).toThrow(/empty/);
    expect(() => validateImageSelection({name:'a.png',size:MAX_IMAGE_BYTES+1,slice(){},arrayBuffer(){}})).toThrow(/25 MB/);
  });
  it('locks inference to WASM so the broken WebGPU shader is not invoked', () => {
    expect(BACKGROUND_REMOVAL_DEVICE).toBe('wasm');
    expect(describeRemovalProgress({message:'Running BiRefNet',percent:35})).toEqual({
      message:'Running BiRefNet',percent:35,
    });
    expect(describeRemovalProgress({message:'Segmenting image'}).percent).toBeNull();
    expect(describeRemovalProgress({percent:180}).percent).toBeNull();
  });
  it('normalizes download filenames', () => {
    expect(transparentFileName('photo.2026.jpg')).toBe('photo.2026_no_background.png');
  });
  it('rejects invalid or opaque PNG output', async () => {
    await expect(validateTransparentPng(new Blob(['corrupt'.repeat(30)]))).rejects.toThrow(/valid PNG/);
    const bytes=new Uint8Array(100);
    bytes.set([137,80,78,71,13,10,26,10],0);
    bytes.set([73,72,68,82],12);
    bytes[25]=2;
    await expect(validateTransparentPng(new Blob([bytes]))).rejects.toThrow(/transparency/);
    bytes[25]=6;
    await expect(validateTransparentPng(new Blob([bytes]))).resolves.toBeInstanceOf(Blob);
  });
});
