'use client';
import { MosyImageViewer } from '../../UiControl/componentControl';
import defaultLogoAsset from '../../../img/logo/logo.png';

// Shared read-only renderer for schema fields of type 'image' | 'file'.
// Used by SmartGridPro / SmartGridInsight (same folder as the grids).
//   image or unknown extension -> MosyImageViewer thumbnail (as before)
//   known non-image (pdf, doc, xls…) -> type icon + filename, opens in a new tab

const defaultLogo = defaultLogoAsset?.src || defaultLogoAsset;
export const NON_IMG_EXT = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip|rar|7z)$/i;
export const mediaUrl = (v) => `/api/mediaroom?media=${typeof window !== 'undefined' ? window.btoa(String(v)) : ''}`;

// Base path for plain links (<a href>, window.open). Next.js only prefixes basePath on <Link>/router
// navigation and on its own assets — not on hand-built URLs — so a download link to /api/mediaroom
// has to add it itself. Resolution order: NEXT_PUBLIC_BASE_PATH (set it from next.config.js `env`),
// Next's internal __NEXT_ROUTER_BASEPATH, then '/lma' (this app's base path).
// Do NOT use mediaHref for MosyImageViewer's `media` prop — keep passing mediaUrl() there.
export const APP_BASE_PATH = (
  process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.__NEXT_ROUTER_BASEPATH ?? '/lma'
).replace(/\/+$/, '');
export const mediaHref = (v) => `${APP_BASE_PATH}${mediaUrl(v)}`;

// ── Shared validation (used by FormFields' FileInput) ──
// Schema field options (all optional):
//   accept:    '.pdf,image/*'  (same string an <input accept> takes; images default to image/*)
//   maxSizeMb: 10              (alias: maxSize)
export const DEFAULT_MAX_MB = 10;
export const acceptOf = (field) => field?.accept || (field?.type === 'image' ? 'image/*' : '');
export const maxMbOf = (field) => Number(field?.maxSizeMb ?? field?.maxSize ?? DEFAULT_MAX_MB);
export function fileProblem(field, file) {
  const accept = acceptOf(field);
  if (accept) {
    const name = String(file.name || '').toLowerCase();
    const type = String(file.type || '').toLowerCase();
    const ok = accept.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).some((rule) => {
      if (rule.startsWith('.')) return name.endsWith(rule);
      if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
      return type === rule;
    });
    if (!ok) return `${file.name || 'File'} is not an allowed type (${accept})`;
  }
  const max = maxMbOf(field);
  if (max > 0 && file.size > max * 1024 * 1024) return `${file.name || 'File'} is larger than ${max} MB`;
  return '';
}

export function iconFor(name) {
  const ext = (String(name).match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  if (ext === 'pdf') return 'file-pdf-o';
  if (ext === 'doc' || ext === 'docx') return 'file-word-o';
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'file-excel-o';
  if (ext === 'ppt' || ext === 'pptx') return 'file-powerpoint-o';
  if (ext === 'zip' || ext === 'rar' || ext === '7z') return 'file-archive-o';
  if (ext === 'txt') return 'file-text-o';
  return 'file-o';
}

export default function FileThumb({ field, value }) {
  const empty = value === null || value === undefined || value === '';
  if (empty && field.type === 'file') return null; // nothing attached: no placeholder logo for documents

  if (!empty && NON_IMG_EXT.test(String(value))) {
    const name = String(value).split('/').pop();
    return (
      <a
        href={mediaHref(value)}
        target="_blank"
        rel="noopener noreferrer"
        title={name}
        className="skip_print"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', maxWidth: 180 }}
      >
        <i className={`fa fa-${iconFor(name)}`} style={{ fontSize: 18, opacity: 0.8 }}></i>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{name}</span>
      </a>
    );
  }

  return (
    <MosyImageViewer
      media={mediaUrl(empty ? '' : value)}
      mediaRoot=""
      defaultLogo={field.defaultLogo || defaultLogo}
      imageClass={'small_thumbnail'}
    />
  );
}
