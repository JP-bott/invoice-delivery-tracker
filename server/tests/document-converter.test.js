import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  fileKind, outputOptions, outputName, assertSourceFile, assertOutput,
  validateSourceBytes, assertValidResult, MAX_FILE_BYTES,
} from '../../client/src/utils/documentConverterValidation.js';
const file=(name,data)=>new File([data],name);
describe('layout-preserving PDF to Word implementation',()=>{
  it('embeds each source PDF page as a full-page image instead of flattening text into paragraphs',()=>{
    const code=readFileSync(new URL('../../client/src/utils/documentConverterEngine.js',import.meta.url),'utf8');
    const start=code.indexOf('async function pdfToWord(');
    const end=code.indexOf('function excelText(',start);
    const section=code.slice(start,end);
    expect(section).toContain('new ImageRun(');
    expect(section).toContain('page:{');
    expect(section).toContain('margin:{top:0,right:0,bottom:0,left:0');
    expect(section).not.toContain('getTextContent()');
  });
});
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
