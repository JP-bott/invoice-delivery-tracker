// File format validation lives outside React so it is testable.
// Conversion happens entirely on this browser. Nothing is sent to /api or the database.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PAGES = 60;
export const FILE_TYPES = {
  pdf: { label: 'PDF document', extensions: ['pdf'], mime: 'application/pdf', outputs: ['docx', 'png', 'jpg'] },
  docx: { label: 'Word document', extensions: ['docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', outputs: ['pdf', 'png'] },
  xlsx: { label: 'Excel workbook', extensions: ['xlsx'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', outputs: ['pdf'] },
};
export const TARGET_LABELS = { pdf: 'PDF document', docx: 'Word document', png: 'PNG images', jpg: 'JPG images' };
export const ACCEPT = '.pdf,.docx,.xlsx';
export const extensionOf = (name = '') => String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
export const fileKind = (file) => {
  const ext = extensionOf(file?.name);
  return FILE_TYPES[ext] ? ext : null;
};
export const outputOptions = (file) => FILE_TYPES[fileKind(file)]?.outputs || [];
export const cleanBaseName = (name) => String(name || 'document').replace(/\.[^.]+$/, '')
  .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 100) || 'document';
export const outputName = (file, ext) => `${cleanBaseName(file.name)}_converted.${ext}`;
export function assertSourceFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Select or paste a valid file.');
  const type = fileKind(file);
  if (!type) throw new Error('Only PDF, DOCX, and XLSX files are supported. Old .doc and .xls files are not supported.');
  if (!file.size) throw new Error('This file is empty.');
  if (file.size > MAX_FILE_BYTES) throw new Error('This file is over the 20 MB session limit.');
  return type;
}
export function assertOutput(file, format) {
  const type = assertSourceFile(file);
  if (!FILE_TYPES[type].outputs.includes(format)) throw new Error('This conversion is not supported.');
}
export async function validateSourceBytes(file) {
  const kind = assertSourceFile(file);
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (kind === 'pdf') {
    if (String.fromCharCode(...header.slice(0,5)) !== '%PDF-') throw new Error('This is not a valid PDF file.');
  } else {
    if (header[0] !== 0x50 || header[1] !== 0x4b) throw new Error('The Office file is not a valid ZIP-based document.');
    const { default: JSZip } = await import('jszip');
    let archive;
    try { archive = await JSZip.loadAsync(file); } catch { throw new Error('The uploaded Office document is damaged or unreadable.'); }
    const required = kind === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
    if (!archive.file(required)) throw new Error(`The selected file is not a valid ${kind.toUpperCase()} document.`);
  }
  return kind;
}
export async function assertValidResult(blob, format) {
  if (!(blob instanceof Blob) || blob.size < 50) throw new Error('Conversion produced an empty or invalid file.');
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (format === 'pdf' && String.fromCharCode(...bytes.slice(0,5)) !== '%PDF-') throw new Error('The generated PDF could not be validated.');
  if (['docx','zip'].includes(format)) {
    const { default: JSZip } = await import('jszip');
    let archive;
    try { archive = await JSZip.loadAsync(blob, { checkCRC32: true }); } catch { throw new Error('The generated download failed its ZIP integrity check.'); }
    if (format === 'docx' && !archive.file('word/document.xml')) throw new Error('The generated Word file is incomplete.');
    if (format === 'zip' && !Object.keys(archive.files).some((name) => /\.(png|jpe?g)$/i.test(name))) throw new Error('The image archive contains no images.');
  }
  if (format === 'png' && !(bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71)) throw new Error('The generated PNG is invalid.');
  if (format === 'jpg' && !(bytes[0]===0xff && bytes[1]===0xd8)) throw new Error('The generated JPEG is invalid.');
  return blob;
}
