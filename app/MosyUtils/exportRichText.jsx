'use client';

// Exports a richtext field's saved HTML (the same value MosyHtmlEditor —
// ../MosyUtils/htmlEditor.jsx — reads/writes) to PDF and DOCX.
//
// Neither export pulls in a new dependency: jsPDF exists elsewhere in this
// monorepo's shared node_modules but isn't wired into this app's own
// package.json, so both exports use plain browser APIs instead —
// print-to-PDF for PDF, an HTML-as-.doc download for Word. If real binary
// .pdf/.docx output is ever needed, swap these two functions for a proper
// jsPDF/docx library call without touching any call site.

// Strips exactly the wrapper div MosyHtmlEditor's stripEditorPageWrapper
// adds around saved content, so exports render the note's own content
// only — not editor-internal chrome.
function stripEditorWrapper(html = '') {
  const openTag = '<div class="smart_editor_editor_page">';
  const closeTag = '</div>';
  const trimmed = (html || '').trim();
  if (trimmed.startsWith(openTag) && trimmed.endsWith(closeTag)) {
    return trimmed.slice(openTag.length, -closeTag.length);
  }
  return html || '';
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function safeFileBase(title = 'document') {
  return (title || 'document').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'document';
}

/**
 * Opens a print-only window holding the given HTML and triggers the
 * browser's native print dialog — "Save as PDF" is a built-in destination
 * there in every modern browser, so no PDF library is needed to get a
 * real PDF file out of this.
 */
export function exportRichTextToPdf({ title = 'Document', htmlContent = '' } = {}) {
  if (typeof window === 'undefined') return;

  const content = stripEditorWrapper(htmlContent);
  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (!printWindow) return; // popup blocked — nothing more we can do here

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; color: #1f2933; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          .export-meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
          img { max-width: 100%; }
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #ccc; padding: 6px; }
        </style>
      </head>
      <body>
          ${content}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();

  // Let the new document lay out images/fonts for a beat before print()
  // — calling it immediately can print a blank first page in some browsers.
  printWindow.onload = () => {
    printWindow.print();
  };
}

/**
 * Downloads the content as a .doc file — plain HTML saved with Word's
 * MIME type and the mso-namespaced <head> Word looks for, which Word,
 * LibreOffice, and Google Docs all open natively. Not real OOXML (.docx),
 * but any of those can re-save it as one with zero extra tooling here.
 */
export function exportRichTextToDocx({ title = 'Document', htmlContent = '', fileName } = {}) {
  if (typeof window === 'undefined') return;

  const content = stripEditorWrapper(htmlContent);
  const resolvedFileName = fileName || `${safeFileBase(title)}.doc`;

  const docHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          body { font-family: Arial, sans-serif; }
          h1 { font-size: 20px; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${content}
      </body>
    </html>
  `;

  const blob = new Blob(['﻿', docHtml], { type: 'application/msword' });
  downloadBlob(blob, resolvedFileName);
}
