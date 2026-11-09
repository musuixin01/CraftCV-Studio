/** Client-only, opt-in extraction of DOCX/PDF resume text. No network or model calls. */
export interface ExtractedResumeText {
  format: 'docx'|'pdf';
  text: string;
  pages: number;
  warnings: string[];
  /** Numbered plain-text lines for explicit review and correction. */
  lines: string[];
}
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PAGES = 35;
const MAX_CHARS = 130_000;

function normalizeLines(raw: string): string[] {
  return raw.replace(/\u0000/g,'').replace(/\r\n?/g,'\n').split('\n')
    .map((line)=>line.replace(/[\t \u00a0]+/g,' ').trim())
    .filter(Boolean).slice(0,4200);
}
type PdfItem = { str?: string; transform?: number[]; width?: number; hasEOL?: boolean };
function pdfPageLines(items: PdfItem[], pageWidth: number): {lines:string[];columns:boolean} {
  const positioned=items.filter((it)=>it.str?.trim()&&it.transform?.length===6)
    .map((it)=>({text:it.str!.trim(),x:it.transform![4],y:it.transform![5],
      width:Math.max(0,it.width??0),eol:!!it.hasEOL}))
    .filter((it)=>Number.isFinite(it.x)&&Number.isFinite(it.y));
  if(!positioned.length)return {lines:[],columns:false};
  // Detect two separate text bodies, not merely two-column tables or date labels.
  const left=positioned.filter((it)=>it.x<pageWidth*.42);
  const right=positioned.filter((it)=>it.x>pageWidth*.56);
  const likelyColumns=left.length>25&&right.length>25 &&
    left.length/positioned.length>.30&&right.length/positioned.length>.25;
  function layout(rows:typeof positioned):string[] {
    const sorted=[...rows].sort((a,b)=>b.y-a.y || a.x-b.x);
    const lines:{y:number;parts:typeof positioned}[]=[];
    for(const item of sorted){
      const last=lines[lines.length-1];
      if(last&&Math.abs(last.y-item.y)<=2.6)last.parts.push(item);
      else lines.push({y:item.y,parts:[item]});
    }
    return lines.map((line)=>{
      const parts=line.parts.sort((a,b)=>a.x-b.x);
      return parts.map((it,index)=>{
        if(index===0)return it.text;
        const prev=parts[index-1];
        const gap=it.x-(prev.x+prev.width);
        const join=/[a-z\d]$/i.test(prev.text)&&/^[a-z\d]/i.test(it.text);
        return (gap>4||join?' ':'')+it.text;
      }).join('').trim();
    }).filter(Boolean);
  }
  if(!likelyColumns)return {lines:layout(positioned),columns:false};
  const median=pageWidth*.50;
  const full=positioned.filter((it)=>it.x<=median&&it.x+it.width>median);
  // Strong page-spanning headers first, then each column independently.
  const boundary=full.length?Math.max(...full.map((it)=>it.y)):Infinity;
  const top=positioned.filter((it)=>it.y>=boundary);
  const rest=positioned.filter((it)=>it.y<boundary);
  const a=rest.filter((it)=>it.x<median);
  const b=rest.filter((it)=>it.x>=median);
  return {lines:[...layout(top),...layout(a),...layout(b)],columns:true};
}
export async function extractLocalResumeText(file:File):Promise<ExtractedResumeText> {
  const lower=file.name.toLocaleLowerCase();
  const format=lower.endsWith('.docx')?'docx':lower.endsWith('.pdf')?'pdf':null;
  if(!format)throw new Error('请选择 .docx 或 .pdf 文件；旧版 .doc 请先在 Word 中另存为 DOCX。');
  if(file.size<=0||file.size>MAX_BYTES)
    throw new Error('文件为空或超过 12 MB 限制。请先在本地精简后重试。');
  const input=new Uint8Array(await file.arrayBuffer());
  if(format==='docx' && !(input[0]===0x50&&input[1]===0x4b))
    throw new Error('DOCX 文件签名不符合 ZIP/OOXML 格式，请确认不是已损坏或改扩展名的文件。');
  if(format==='pdf' && new TextDecoder('ascii').decode(input.slice(0,5))!=='%PDF-')
    throw new Error('PDF 文件签名无效，请重新导出后选择文件。');
  const warnings:string[]=[];
  let text='';
  let pages=1;
  if(format==='docx'){
    // extractRawText does not interpret or render embedded images, HTML, links, or macros.
    const mammoth=await import('mammoth');
    const {value,messages}=await mammoth.extractRawText({arrayBuffer:input.buffer});
    text=value??'';
    for(const message of messages??[]){
      if(message.type==='warning')warnings.push('Word 解析提示：'+String(message.message).slice(0,170));
    }
    warnings.push('Word 复杂表格、浮动文本框或分栏可能改变读取顺序，请对照原稿逐条确认。');
  }else{
    // Lazy-load PDF.js only while the user imports a PDF.
    const pdfjs=await import('pdfjs-dist');
    const worker=(await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc=worker;
    const assetBase=import.meta.env.BASE_URL+'vendor/pdfjs/';
    const task=pdfjs.getDocument({data:input,useSystemFonts:true,
      cMapUrl:assetBase+'cmaps/',cMapPacked:true,
      standardFontDataUrl:assetBase+'standard_fonts/',
      disableAutoFetch:true,disableStream:true});
    let doc:Awaited<typeof task.promise>|null=null;
    try{
      doc=await task.promise;
      pages=doc.numPages;
      if(pages>MAX_PAGES)throw new Error('PDF 超过 35 页，请先选取相关的简历页后再导入。');
      const collected:string[]=[];
      for(let index=1;index<=pages;index++){
        const page=await doc.getPage(index);
        const content=await page.getTextContent();
        const {lines,columns}=pdfPageLines(content.items as PdfItem[],page.view[2]-page.view[0]);
        if(columns)warnings.push('第 '+index+' 页疑似双栏：已按左、右列分段，但仍需核对阅读顺序。');
        collected.push(...lines);
        page.cleanup();
      }
      text=collected.join('\n');
    }finally{
      await task.destroy();
    }
    if(text.replace(/\s/g,'').length<Math.max(45,pages*24))
      throw new Error('PDF 文字层不可用或内容过少，可能是扫描件。未启用云端 OCR，也没有猜测任何内容；请使用可复制文字的 PDF、DOCX 或人工录入。');
  }
  if(text.length>MAX_CHARS){
    warnings.push('原稿文字过长，已限制为前 130000 字；如存在遗漏请拆分导入。');
    text=text.slice(0,MAX_CHARS);
  }
  const lines=normalizeLines(text);
  if(!lines.length)throw new Error('没有提取到可用文字。请检查原稿是否损坏或主要由图片组成。');
  return {format,text:lines.join('\n'),pages,warnings,lines};
}
