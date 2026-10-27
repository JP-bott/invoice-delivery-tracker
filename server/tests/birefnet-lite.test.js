import {describe,it,expect} from 'vitest';
import {BIREFNET_MODEL_ID,BIREFNET_REVISION,BIREFNET_DEVICE,BIREFNET_DTYPE,
  BIREFNET_INPUT_RESOLUTION,logitsToAlpha,modelDownloadProgress} from '../../client/src/utils/birefnetLite.js';
import {BACKGROUND_REMOVAL_DEVICE,describeRemovalProgress} from '../../client/src/utils/backgroundRemoval.js';

describe('BiRefNet General Lite official-weight browser integration',()=>{
  it('pins official-derived Lite ONNX checkpoint to WASM with fp32 weights',()=>{
    expect(BIREFNET_MODEL_ID).toBe('studioludens/birefnet-lite-512');
    expect(BIREFNET_REVISION).toMatch(/^[a-f0-9]{40}$/);
    expect(BIREFNET_INPUT_RESOLUTION).toBe(512);
    expect(BIREFNET_DEVICE).toBe('wasm');
    expect(BIREFNET_DTYPE).toBe('fp32');
    expect(BACKGROUND_REMOVAL_DEVICE).toBe('wasm');
  });
  it('applies sigmoid to logits to create a real four-channel alpha mask',()=>{
    const m=logitsToAlpha({data:new Float32Array([-12,0,12,0]),dims:[1,1,2,2]});
    expect(m.width).toBe(2);expect(m.height).toBe(2);
    expect(m.rgba.length).toBe(16);
    expect(m.rgba[3]).toBeLessThan(1);
    expect(m.rgba[7]).toBeCloseTo(128,0);
    expect(m.rgba[11]).toBeGreaterThan(254);
    expect(m.rgba[0]).toBe(255);expect(m.rgba[4]).toBe(255);
  });
  it('rejects invalid mask dimensions and non-finite scores',()=>{
    expect(()=>logitsToAlpha({data:new Float32Array([1]),dims:[1,1,2,2]})).toThrow(/invalid segmentation mask/i);
    expect(()=>logitsToAlpha({data:[NaN],dims:[1,1,1,1]})).toThrow(/non-finite/i);
  });
  it('never fabricates a progress value for download or processing',()=>{
    expect(modelDownloadProgress({status:'initiate'}).percent).toBeNull();
    expect(modelDownloadProgress({status:'progress',progress:37.7}).percent).toBe(38);
    expect(describeRemovalProgress({message:'Processing'})).toEqual({message:'Processing',percent:null});
  });
});
