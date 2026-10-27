import { MAX_PAGES, assertOutput, validateSourceBytes, assertValidResult } from './documentConverterValidation.js';

const mime = {
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png', jpg: 'image/jpeg', zip: 'application/zip',
};
const ensurePages = (n) => {
  if (!n || n > MAX_PAGES) throw new Error(`This document has ${n} pages. The session limit is ${MAX_PAGES} pages.`);
};
const canvasBlob = (canvas, format, quality = 0.9) => new Promise((resolve, reject) => {
  canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Could not encode the rendered image.')),
    format === 'jpg' ? 'image/jpeg' : 'image/png', quality);
});
const toBlob = (data, type) => data instanceof Blob ? data : new Blob([data], {type: mime[type]});
const valid = async (blob, format) => {
  await assertValidResult(blob, format);
  return blob;
};

// PDF.js with a worker emitted from exactly the same dependency version.
// The worker asset is hosted on our own Vercel deployment, not fetched from a CDN.
async function loadPdf(file) {
  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true });
  const pdf = await task.promise;
  try { ensurePages(pdf.numPages); }
  catch (err) { await pdf.destroy(); throw err; }
  return pdf;
}

async function pdfToImages(file, extension, progress) {
  const pdf = await loadPdf(file);
  const images = [];
  const {default: JSZip} = await import('jszip');
  const archive = new JSZip();
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      progress(`Rendering PDF page ${i} of ${pdf.numPages}`);
      const page = await pdf.getPage(i);
      const original = page.getViewport({scale: 1});
      // Keep each canvas within a practical browser memory allocation.
      const scale = Math.min(2, 4096 / Math.max(original.width,original.height),
        Math.sqrt(10_000_000 / (original.width * original.height)));
      const viewport = page.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Canvas is unavailable in this browser.');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({canvasContext: ctx, viewport, canvas}).promise;
      const blob = await valid(await canvasBlob(canvas, extension),extension);
      page.cleanup();
      canvas.width = canvas.height = 0;
      images.push(blob);
      if (pdf.numPages > 1) archive.file(`page-${String(i).padStart(3, '0')}.${extension}`, blob);
    }
  } finally { await pdf.destroy(); }
  if (images.length === 1) return {blob: images[0], extension, detail: '1 image'};
  const zipped = await archive.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
  return {blob:await valid(zipped,'zip'),extension:'zip',detail:`${images.length} images in ZIP`};
}

// A PDF does not contain Word document structure. Reconstruct selectable text,
// preserving page divisions, but not guaranteeing the original placement/graphics.
// Scanned PDFs are explicitly rejected rather than yielding an empty DOCX.
async function pdfToWord(file, progress) {
  const pdf = await loadPdf(file);
  const {Document, Paragraph, TextRun, PageBreak, Packer} = await import('docx');
  const paragraphs = [];
  let characterCount = 0;
  try {
    for(let number=1;number<=pdf.numPages;number++){
      progress(`Extracting editable text, page ${number} of ${pdf.numPages}`);
      const page=await pdf.getPage(number);
      const {items}=await page.getTextContent();
      const lines = new Map();
      for(const item of items) {
        const str = item.str || '';
        if(!str.trim()) continue;
        const y=Math.round(item.transform[5] / 3) * 3;
        if(!lines.has(y)) lines.set(y,[]);
        lines.get(y).push({x:item.transform[4],str});
        characterCount+=str.trim().length;
      }
      if(number>1) paragraphs.push(new Paragraph({children:[new PageBreak()]}));
      for(const [y,words] of [...lines].sort((a,b)=>b[0]-a[0])){
        words.sort((a,b)=>a.x-b.x);
        let line='', right=-Infinity;
        for(const word of words){
          if(line && word.x > right+2) line+=' ';
          line+=word.str;
          right=word.x+word.str.length*3;
        }
        paragraphs.push(new Paragraph({children:[new TextRun(line.trim())],spacing:{after:75}}));
      }
      page.cleanup();
    }
  } finally { await pdf.destroy(); }
  if(!characterCount) throw new Error('No selectable text found. Scanned/image-only PDFs need OCR, which is not included.');
  const word=new Document({sections:[{properties:{},children:paragraphs}]});
  const blob=await Packer.toBlob(word);
  return {blob:await valid(blob,'docx'),extension:'docx',detail:'Editable text extracted from PDF'};
}

function excelText(cell) {
  const value=cell?.value;
  if(value==null) return '';
  if(value instanceof Date) return value.toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'});
  if(typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((x)=>x.text||'').join('');
    if ('result' in value && value.result != null) return String(value.result);
    if ('formula' in value) return `=${value.formula} (not calculated)`;
    if ('text' in value) return String(value.text);
  }
  return String(value);
}
async function excelToPdf(file, progress){
  progress('Reading Excel workbook');
  const [excelModule, jspdfModule, tableModule]=await Promise.all([
    import('exceljs'),import('jspdf'),import('jspdf-autotable'),
  ]);
  const ExcelJS=excelModule.default ?? excelModule;
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const tabs=workbook.worksheets;
  if(!tabs.length)throw new Error('The Excel workbook contains no worksheets.');
  if(tabs.length>40)throw new Error('This workbook contains more than 40 worksheets.');
  const {jsPDF}=jspdfModule;
  const {autoTable}=tableModule;
  const pdf=new jsPDF({orientation:'landscape',unit:'pt',format:'a4',compress:true});
  const width=pdf.internal.pageSize.getWidth();
  let totalRows=0, populated=0;
  for(const [index,tab] of tabs.entries()){
    progress(`Converting worksheet ${index+1} of ${tabs.length}: ${tab.name}`);
    if(index)pdf.addPage('a4','landscape');
    pdf.setFillColor(25,48,78);pdf.rect(0,0,width,55,'F');
    pdf.setTextColor(255,255,255);pdf.setFont('helvetica','bold');pdf.setFontSize(16);
    pdf.text(tab.name.slice(0,75),28,35);
    let columnCount=0;
    tab.eachRow({includeEmpty:false}, (row) => {
      for(let n=row.cellCount;n>columnCount;n--) {columnCount=n;break;}
    });
    if(columnCount>45)throw new Error(`Worksheet "${tab.name}" exceeds the 45-column browser conversion limit.`);
    if(!columnCount){pdf.setTextColor(80,95,110);pdf.text('Empty worksheet',28,100);continue;}
    const body=[];
    tab.eachRow({includeEmpty:false},(row)=>{
      const cells=Array.from({length:columnCount},(_,i)=>excelText(row.getCell(i+1)));
      if(cells.some((s)=>s!=='')) body.push(cells);
    });
    totalRows+=body.length;
    if(totalRows>25000)throw new Error('Excel conversion exceeds the 25,000 populated-row session limit.');
    if(!body.length){pdf.setTextColor(80,95,110);pdf.text('Empty worksheet',28,100);continue;}
    populated++;
    const head=body.shift();
    autoTable(pdf,{
      head:[head],body,margin:{left:25,right:25,top:70,bottom:35},
      startY:70,theme:'grid',horizontalPageBreak:true,
      styles:{font:'helvetica',fontSize:8,cellPadding:4,overflow:'linebreak',textColor:[37,51,66],lineColor:[226,232,240],lineWidth:.35},
      headStyles:{fillColor:[48,84,133],textColor:255,fontStyle:'bold'},
      alternateRowStyles:{fillColor:[245,248,252]},
    });
  }
  if(!populated && totalRows===0)throw new Error('The workbook contains no cell data.');
  const pages=pdf.getNumberOfPages();
  ensurePages(pages);
  for(let p=1;p<=pages;p++){
    pdf.setPage(p);pdf.setTextColor(104,119,135);pdf.setFontSize(8);
    pdf.text(`Page ${p} / ${pages}`,width-62,pdf.internal.pageSize.getHeight()-15);
  }
  const blob=pdf.output('blob');
  return {blob:await valid(blob,'pdf'),extension:'pdf',detail:`${pages} PDF pages`};
}

// Word is rendered to browser DOM then printed as page images into a valid PDF.
// Text remains visually readable, but converted PDF text is rasterized.
async function wordPages(file,progress){
  progress('Rendering Word pages locally');
  const {renderAsync}=await import('docx-preview');
  const host=document.createElement('div');
  host.setAttribute('data-session-converter','');
  Object.assign(host.style,{
    position:'fixed',left:'0px',top:'0px',width:'920px',background:'#fff',
    zIndex:'-100000',pointerEvents:'none',overflow:'visible',
  });
  document.body.appendChild(host);
  try{
    await renderAsync(file,host,null,{
      breakPages:true,useBase64URL:true,ignoreLastRenderedPageBreak:false,
      renderHeaders:true,renderFooters:true,
    });
    // Embedded Word assets may need a rendering frame before capture.
    await new Promise((done)=>requestAnimationFrame(()=>requestAnimationFrame(done)));
    const pages=[...host.querySelectorAll('section.docx')];
    if(!pages.length)throw new Error('No readable Word document pages could be rendered.');
    ensurePages(pages.length);
    const {default: html2canvas}=await import('html2canvas');
    const result=[];
    for(const [i,page] of pages.entries()){
      progress(`Rendering Word page ${i+1} of ${pages.length}`);
      const width=Math.ceil(page.getBoundingClientRect().width),height=Math.ceil(page.getBoundingClientRect().height);
      if(!width || !height)throw new Error('Word page dimensions are invalid.');
      const scale=Math.min(1.7, 4096/Math.max(width,height),Math.sqrt(10_000_000/(width*height)));
      const canvas=await html2canvas(page,{
        scale,backgroundColor:'#ffffff',useCORS:false,allowTaint:false,logging:false,
        imageTimeout:10000,
      });
      result.push(canvas);
    }
    return result;
  } finally { host.remove(); }
}
async function wordToFile(file,target,progress){
  const pages=await wordPages(file,progress);
  try {
    if(target==='pdf'){
      const {jsPDF}=await import('jspdf');
      let pdf=null;
      for(const [index,canvas] of pages.entries()){
        const w=canvas.width*72/96,h=canvas.height*72/96;
        if(!pdf)pdf=new jsPDF({unit:'pt',format:[w,h],orientation:w>h?'landscape':'portrait',compress:true});
        else pdf.addPage([w,h],w>h?'landscape':'portrait');
        pdf.addImage(canvas.toDataURL('image/jpeg',.88),'JPEG',0,0,w,h);
        canvas.width=canvas.height=0;
      }
      return {blob:await valid(pdf.output('blob'),'pdf'),extension:'pdf',detail:`${pages.length} pages (visual rendering)`};
    }
    const {default: JSZip}=await import('jszip');
    const zip=new JSZip();
    const out=[];
    for(const [i,canvas] of pages.entries()){
      const blob=await valid(await canvasBlob(canvas,'png'),'png');
      out.push(blob);
      if(pages.length>1)zip.file(`page-${String(i+1).padStart(3,'0')}.png`,blob);
      canvas.width=canvas.height=0;
    }
    if(out.length===1)return {blob:out[0],extension:'png',detail:'1 image'};
    return {blob:await valid(await zip.generateAsync({type:'blob',compression:'DEFLATE'}),'zip'),extension:'zip',detail:`${out.length} pages in ZIP`};
  } finally { for(const canvas of pages){canvas.width=canvas.height=0;} }
}

export async function convertDocument(file,target,onProgress=()=>{}) {
  assertOutput(file,target);
  const kind=await validateSourceBytes(file);
  onProgress('File validated. Preparing converter');
  if(kind==='pdf' && target==='docx') return pdfToWord(file,onProgress);
  if(kind==='pdf' && ['png','jpg'].includes(target))return pdfToImages(file,target,onProgress);
  if(kind==='xlsx' && target==='pdf')return excelToPdf(file,onProgress);
  if(kind==='docx' && ['pdf','png'].includes(target))return wordToFile(file,target,onProgress);
  throw new Error('Unsupported document conversion.');
}
