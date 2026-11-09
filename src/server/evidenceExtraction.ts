

import { EVIDENCE_MIME_BY_EXTENSION, MAX_EVIDENCE_FILE_BYTES, validateEvidenceReview, type EvidenceReview } from '../utils/evidenceAttachments.ts';

export interface EvidenceUpload {
  base64Data: string;
  mimeType: string;
  fileName: string;
}

/** Revalidate untrusted browser input before it ever reaches a remote model. */
export function validateEvidenceUploadPayload(input: unknown): EvidenceUpload {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('附件请求不是有效对象');
  const raw = input as Record<string, unknown>;
  const {base64Data,mimeType,fileName} = raw;
  if (typeof fileName !== 'string' || fileName.length < 1 || fileName.length > 160 ||
      /[\/\\\u0000-\u001f]/.test(fileName) || typeof mimeType !== 'string' ||
      typeof base64Data !== 'string' || base64Data.length < 12 ||
      base64Data.length > Math.ceil(MAX_EVIDENCE_FILE_BYTES / 3) * 4 + 8 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64Data)) {
    throw new Error('文件名称、编码或大小无效；单个证据附件限 8MB。');
  }
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  if (EVIDENCE_MIME_BY_EXTENSION[extension] !== mimeType) throw new Error('附件格式与文件名不匹配。');
  const bytes = Buffer.from(base64Data,'base64');
  if (!bytes.length || bytes.length > MAX_EVIDENCE_FILE_BYTES ||
      bytes.toString('base64') !== base64Data) throw new Error('附件数据无效或超出大小限制。');
  const validSignature = mimeType === 'application/pdf'
    ? bytes.subarray(0,5).toString('latin1') === '%PDF-'
    : mimeType === 'image/png'
      ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : mimeType === 'image/jpeg'
        ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : mimeType === 'image/webp'
          ? bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP'
          : false;
  if (!validSignature) throw new Error('文件内容与声明的 PDF / 图片格式不匹配。');
  return {base64Data,mimeType,fileName};
}

export function parseEvidenceAIResponse(raw: string): EvidenceReview {
  const parsed: unknown = JSON.parse(raw);
  return validateEvidenceReview(parsed);
}
