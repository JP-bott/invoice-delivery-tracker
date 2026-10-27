import {describe,it,expect} from 'vitest';
import {BACKGROUND_CHOICES, DEFAULT_CUTOUT_OPTIONS, normaliseOptions, fileNameForBackground, subjectBounds} from '../../client/src/utils/backgroundEditor.js';

describe('background studio edit model',()=>{
  it('sets defaults for transparent PNG exports and retains all backgrounds',()=>{
    expect(DEFAULT_CUTOUT_OPTIONS.background).toBe('transparent');
    expect(DEFAULT_CUTOUT_OPTIONS.format).toBe('png');
    expect(BACKGROUND_CHOICES.map(c=>c.id)).toContain('blur');
    expect(BACKGROUND_CHOICES.map(c=>c.id)).toContain('custom');
  });
  it('clamps edge tuning values and rejects invalid colors',()=>{
    const a=normaliseOptions({cleanup:999,feather:-9,color:'url(javascript:evil)',background:'invalid',format:'gif'});
    expect(a.cleanup).toBe(40);expect(a.feather).toBe(0);
    expect(a.color).toBe('#ffffff');expect(a.background).toBe('transparent');expect(a.format).toBe('png');
  });
  it('builds filename from sanitized original file name',()=>{
    expect(fileNameForBackground('profile.jpg',{format:'jpg'})).toBe('profile_edited.jpg');
    expect(fileNameForBackground('photo:sample.png',{format:'png'})).toBe('photo_sample_edited.png');
  });
  it('auto-crops to nontransparent pixels with padding',()=>{
    const d=new Uint8ClampedArray(10*10*4);
    for(let y=3;y<7;y++) for(let x=2;x<6;x++)d[(y*10+x)*4+3]=255;
    const b=subjectBounds({data:d},10,10,0);
    expect(b).toEqual({x:2,y:3,width:4,height:4});
    expect(subjectBounds({data:new Uint8ClampedArray(400)},10,10)).toEqual({x:0,y:0,width:10,height:10});
  });
});
