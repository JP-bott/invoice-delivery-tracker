import { describe, expect, it } from 'vitest';
import {
  fileKind, outputOptions, outputName, assertSourceFile, assertOutput,
  validateSourceBytes, assertValidResult, MAX_FILE_BYTES,
} from '../../client/src/utils/documentConverterValidation.js';
const file=(name,data)=>new File([data],name);
describe('document converter session safety and format validation',()=>{
  it('accepts only supported modern formats and conversion paths',()=>{
    const pdf=file('report.pdf','%PDF-1.7\n');
    expect(fileKind(pdf)).toBe('pdf');
    expect(outputOptions(pdf)).toEqual(['docx','png','jpg']);
    expect(outputOptions(file('book.xlsx','PK'))).toEqual(['pdf']);
    expect(outputOptions(file('contract.docx','PK'))).toEqual(['pdf','png']);
    expect(()=>assertOutput(pdf,'xlsx')).toThrow(/not supported/i);
    expect(()=>assertSourceFile(file('legacy.doc','data'))).toThrow(/Only PDF/i);
  });
  it('checks file size and output filenames',()=>{
    expect(()=>assertSourceFile(file('empty.pdf',''))).toThrow(/empty/i);
    expect(()=>assertSourceFile({name:'large.pdf',size:MAX_FILE_BYTES+1,arrayBuffer:async()=>new ArrayBuffer(1)})).toThrow(/20 MB/i);
    expect(outputName(file('notes.final.pdf','%PDF-1.7'), 'docx')).toBe('notes.final_converted.docx');
  });
  it('rejects extensions that disguise different content',async()=>{
    await expect(validateSourceBytes(file('fake.pdf','not a pdf'))).rejects.toThrow(/not a valid PDF/i);
    await expect(validateSourceBytes(file('fake.docx','not an Office file'))).rejects.toThrow(/ZIP-based/i);
  });
  it('refuses corrupted conversion results',async()=>{
    await expect(assertValidResult(new Blob(['not a pdf'.repeat(20)]),'pdf')).rejects.toThrow(/PDF/i);
    await expect(assertValidResult(new Blob(['invalid zip'.repeat(20)]),'docx')).rejects.toThrow(/ZIP integrity/i);
    await expect(assertValidResult(new Blob(['invalid image'.repeat(20)]),'png')).rejects.toThrow(/PNG/i);
  });
});
