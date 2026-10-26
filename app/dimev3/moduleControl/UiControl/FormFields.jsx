'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { LiveSearchDropdown, MosyImageViewer, SmartDropdown } from '../../UiControl/componentControl';
import defaultLogoAsset from '../../../img/logo/logo.png'; // same fallback the legacy profile pages used — adjust path/asset if this module wants a different one
import { mosyGetData, mosyFormatDateOnly, mosyFormatDateTime } from '../../../MosyUtils/hiveUtils';
import MosyHtmlEditor from '../../../MosyUtils/htmlEditor';
import { MosyAlertCard, closeMosyModal } from '../../../MosyUtils/ActionModals';
import { NON_IMG_EXT, mediaUrl, mediaHref, iconFor, acceptOf, maxMbOf, fileProblem } from './FileThumb';

const defaultLogo = defaultLogoAsset.src || defaultLogoAsset; // Next.js static image imports are objects ({src, width, height, ...}), not plain URL strings — MosyImageViewer needs the string, same as legacy's logo.src

// FormFields — one small component per field.type. Every input carries the
// "dyn-input" class, which FormLayout.jsx styles to match the target look
// (rounded-lg, thin gray border, gray placeholder). Swapping the visual
// theme means editing the CSS in FormLayout.jsx — never these components.
export function HiddenInput() {
  return null;
}
HiddenInput.selfLabeled = true; // no <label> wrapper
HiddenInput.hiddenField = true; // tells FieldRenderer to skip the grid cell entirely


export function TextInput({ field, value, setValue, readOnly, row }) {
  const inputType = field.type === 'number' || field.type === 'money' ? 'number'
    : field.type === 'date' ? 'date'
    : field.type === 'email' ? 'email'
    : field.type === 'tel' ? 'tel'
    : 'text';
  return (
    <input
      type={inputType}
      className="dyn-input"
      placeholder={field.placeholder || `Enter ${field.label?.toLowerCase() || ''}`}
      value={value ?? ''}
      readOnly={readOnly}
      disabled={readOnly}
      onChange={(e) => {
        setValue(field.key, e.target.value);
        // Optional schema hook: field.onValueChange(newValue, row) -> { otherKey: val }
        if (typeof field.onValueChange === 'function') {
          const patch = field.onValueChange(e.target.value, row, setValue) || {};
          Object.entries(patch).forEach(([key, val]) => setValue(key, val));
        }
      }}
    />
  );
}

// Deliberately its own component rather than another TextInput branch —
// unlike number/email/tel, a password needs local UI state (the
// show/hide toggle) and different read-only behavior. Read-only never
// echoes the real value back into the DOM as plaintext (a saved hash or
// a value pulled from `row` has no business being visible/inspectable) —
// it shows fixed masking dots instead, same spirit as DateInput's
// locked-field treatment but without leaking the underlying value.
export function PasswordInput({ field, value, setValue, readOnly }) {
  const [visible, setVisible] = useState(false);

  if (readOnly) {
    return <div className="dyn-input dyn-input-static dyn-password-static">••••••••</div>;
  }

  return (
    <div className="dyn-password-wrap">
      <input
        type={visible ? 'text' : 'password'}
        className="dyn-input"
        placeholder={field.placeholder || `Enter ${field.label?.toLowerCase() || ''}`}
        value={value ?? ''}
        // 'new-password' (not 'current-password') is the safer default —
        // it stops browsers from silently offering to autofill an
        // existing saved login password into what's usually a create/set
        // field. Schemas for an actual login form should pass
        // field.autoComplete: 'current-password' explicitly.
        autoComplete={field.autoComplete || 'new-password'}
        onChange={(e) => setValue(field.key, e.target.value)}
      />
      <button
        type="button"
        className="dyn-password-toggle"
        onClick={() => setVisible((v) => !v)}
        // Keyboard users tab through form fields, not decoration —
        // this button only exists for mouse/touch convenience.
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        <i className={`fa ${visible ? 'fa-eye-slash' : 'fa-eye'}`}></i>
      </button>
    </div>
  );
}


export function TextareaInput({ field, value, setValue, readOnly }) {
  return (
    <textarea
      className="dyn-input dyn-textarea"
      placeholder={field.placeholder || `${field.label || ''} (optional)`}
      value={value ?? ''}
      readOnly={readOnly}
      disabled={readOnly}
      onChange={(e) => setValue(field.key, e.target.value)}
    />
  );
}

export function BooleanInput({ field, value, setValue, readOnly }) {
  return (
    <input
      type="checkbox"
      className="dyn-checkbox"
      checked={!!value}
      disabled={readOnly}
      onChange={(e) => setValue(field.key, e.target.checked)}
    />
  );
}

export function SelectInput({ field, value, setValue, readOnly }) {
  return (
    <select className="dyn-input dyn-select" value={value ?? ''} disabled={readOnly} onChange={(e) => setValue(field.key, e.target.value)}>
      <option value="">{field.placeholder || `Select ${field.label || ''}`}</option>
      {field.options?.map((opt, idx) => <option key={`${opt}-${idx}`} value={opt}>{opt}</option>)}
    </select>
  );
}

// Fetches DISTINCT values of one column from the API to build its own option list.// Thin adapter: schema fields describe themselves as { key, endpoint,
// groupByField, ... } (the DynamicForm/schema.js vocabulary); SmartDropdown
// wants { apiEndpoint, idField, labelField, inputName, onSelect,
// defaultValue } (its own, older vocabulary). This function's only job is
// translating one into the other — SmartDropdown owns all the actual
// fetch/select/"Add new" logic now, GroupedSelectInput no longer does.
 
export function GroupedSelectInput({ field, value, setValue, readOnly }) {
  return (
    <SmartDropdown
      apiEndpoint={field.endpoint}
      idField={field.idField || 'primkey'}
      labelField={field.key}
      inputName={field.key}
      label={field.label}
      defaultValue={value ?? ''}
      onSelect={(val) => setValue(field.key, val)}
      readOnly={readOnly}
    />
  );
}
GroupedSelectInput.selfLabeled = true; // SmartDropdown renders its own <label> — FieldRenderer/DynamicForm should skip theirs


export function DateInput({ field, value, setValue, readOnly }) {
  const isLocked = readOnly || field.computed;
  const today = new Date().toISOString().split('T')[0];
  const sanitized = mosyFormatDateOnly(value);

  // Auto-populate: an empty date field never submits blank — seed it with
  // today the moment it mounts. Runs for locked fields too, since those
  // still need a real value even though the user never touches them.
  useEffect(() => {
    if (!value) setValue(field.key, today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLocked) {
    // Computed or read-only get identical treatment: no editable picker,
    // just the date shown as plain text.
    return <div className="dyn-input dyn-input-static">{sanitized || today}</div>;
  }

  return (
    <input
      type="date"
      className="dyn-input"
      value={sanitized || today}
      onChange={(e) => setValue(field.key, e.target.value)}
    />
  );
}

export function DateTimeInput({ field, value, setValue, readOnly }) {
  const isLocked = readOnly || field.computed;
  const now = new Date().toISOString().slice(0, 16);
  const sanitized = mosyFormatDateTime(value);

  useEffect(() => {
    if (!value) setValue(field.key, now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLocked) {
    return <div className="dyn-input dyn-input-static">{sanitized || now}</div>;
  }

  return (
    <input
      type="datetime-local"
      className="dyn-input"
      value={sanitized || now}
      onChange={(e) => setValue(field.key, e.target.value)}
    />
  );
}


export function LiveSearchInput({ field, value, setValue, readOnly, row }) {
  const [justPickedLabel, setJustPickedLabel] = useState(null);
  const currentLabel = justPickedLabel ?? row?.[field.labelKey];

  const defaultValue = useMemo(
    () => (value != null ? { [field.valueField]: value, [field.displayField]: currentLabel ?? '' } : null),
    [value, currentLabel, field.valueField, field.displayField]
  );

  // onFullSelect is a pure packaging function: (item) -> { key: value, ... }.
  // It doesn't touch setValue itself — it just decides what this
  // selection should mean for the rest of the form. Applying that to
  // form state is this component's job, same as it already does for its
  // own field via onSelect below.
  const handleSelectFull = (item) => {
    setJustPickedLabel(item[field.displayField] ?? null);
  
    if (typeof field.onFullSelect === 'function') {
      const patch = field.onFullSelect(item, row, setValue) || {};
      Object.entries(patch).forEach(([key, val]) => setValue(key, val));
    }
  };

  return (
    <LiveSearchDropdown
      apiEndpoint={field.endpoint}
      tblName={field.searchTable || field.key}
      parentTable={field.parentTable || field.key}
      inputName={field.labelKey || field.displayField}
      hiddenInputName={field.key}
      label={field.label}
      displayField={field.displayField}
      valueField={field.valueField}
      defaultValue={defaultValue}
      defaultColSize={field.colSpan}
      onSelect={(id) => setValue(field.key, id)}
      onSelectFull={handleSelectFull}
      customDisplay={field.customDisplay}
      mosyFilterOptions={field.mosyFilterOptions}
    />
  );
}
LiveSearchInput.selfLabeled = true;

export function RichTextInput({ field, value, setValue, readOnly, row }) {
  if (readOnly) {
    return <div className="dyn-input dyn-input-static" dangerouslySetInnerHTML={{ __html: value || '' }} />;
  }
  // SunEditor (MosyHtmlEditor) is an uncontrolled, dynamically-imported
  // (ssr: false) editor — it only reads `value` once, at mount, via
  // defaultValue. The record's real value usually arrives asynchronously
  // AFTER this field first mounts (useEntityFormController's fetch), so
  // without a remount the editor is stuck showing whatever it had (often
  // blank) at first paint — hence needing a manual page refresh (or two,
  // depending on fetch timing) to see the loaded content. Keying on the
  // row's identity forces a fresh mount — and a fresh defaultValue — the
  // moment the real record data lands, same fix QuotationlistProfile.jsx
  // applies inline with its own `key={reload-${primkey}}`.
  return (
    <MosyHtmlEditor
      key={row?.primkey ?? 'new'}
      field={field.key}
      value={value ?? ''}
      onChange={(html) => setValue(field.key, html)}
    />
  );
}

// FileInput — serves BOTH `type: 'image'` and `type: 'file'` schema fields.
// Value contract is unchanged: selecting a file puts the File object itself
// into form.values via setValue, so EntityDataEngine detects it and switches
// that request to multipart/form-data. A saved record's value is the stored
// path string.
//
// Schema options (all optional):
//   accept:     '.pdf,image/*'   -> allowed types (images default to image/*)
//   maxSizeMb:  10               -> larger files are rejected with a message
//   imageClass: 'product_image'  -> class on the preview image
//
// Ways to attach: Choose File button · drag a file onto the box · click the
// box and Ctrl+V a screenshot / copied file. Open and Remove buttons appear
// once something is attached.
export function FileInput({ field, value, setValue, readOnly }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const isFile = typeof File !== 'undefined' && value instanceof File;
  const empty = value === null || value === undefined || value === '';
  const accept = acceptOf(field);
  const maxMb = maxMbOf(field);

  const name = empty ? '' : isFile ? value.name : String(value).split('/').pop();
  // Image if: a picked File with an image/* type, or a saved path that isn't a known document extension.
  const isImg = !empty && (isFile ? /^image\//.test(value.type) : !NON_IMG_EXT.test(String(value)));

  useEffect(() => {
    if (!isFile || !/^image\//.test(value.type)) { setPreviewUrl(null); return undefined; }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value, isFile]);

  const attach = (fileList) => {
    const file = Array.from(fileList || [])[0];
    if (!file || readOnly) return;
    const problem = fileProblem(field, file);
    if (problem) { setError(problem); return; }
    setError('');
    setValue(field.key, file);
  };

  const handleFileChange = (e) => {
    attach(e.target.files);
    e.target.value = ''; // allow re-picking the same file after a remove
  };

  const open = () => {
    if (empty) return;
    if (!isFile) { window.open(mediaHref(value), '_blank', 'noopener,noreferrer'); return; }
    const url = previewUrl || URL.createObjectURL(value);
    window.open(url, '_blank', 'noopener,noreferrer');
    if (!previewUrl) setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const remove = () => {
    const label = field.type === 'image' ? 'image' : 'file';
    MosyAlertCard({
      icon: 'trash',
      yesColor: 'danger',
      message: `Remove this ${label}${name ? ` (${name})` : ''}? ${isFile ? '' : 'The change is applied when you save.'}`.trim(),
      autoDismissOnClick: false,
      onYes: () => { closeMosyModal('modal1'); setError(''); setValue(field.key, ''); },
      onNo: () => closeMosyModal('modal1'),
    });
  };

  const imgClass = field.imageClass || 'product_image';

  return (
    <div
      className={`dyn-file-field ${dragging ? 'is-drag' : ''} ${readOnly ? 'is-readonly' : ''}`}
      tabIndex={readOnly ? -1 : 0}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
      onPaste={(e) => {
        const files = e.clipboardData?.files;
        if (!readOnly && files && files.length) { e.preventDefault(); attach(files); }
      }}
      onDragOver={(e) => { if (!readOnly && e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { if (readOnly) return; e.preventDefault(); setDragging(false); attach(e.dataTransfer.files); }}
    >
      <div className="dyn-file-preview" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
        {empty ? (
          field.type === 'image' ? (
            <MosyImageViewer media={mediaUrl('')} mediaRoot="" defaultLogo={field.defaultLogo || defaultLogo} imageClass={imgClass} />
          ) : (
            <div className="dyn-file-empty">
              <i className="fa fa-cloud-upload"></i>
              <span>{readOnly ? 'No file attached' : 'Drag & drop, paste, or choose a file'}</span>
            </div>
          )
        ) : isImg ? (
          // Just picked, not saved yet — show the local file directly rather than
          // round-tripping through the media endpoint, which doesn't have it yet.
          isFile && previewUrl ? (
            <img src={previewUrl} className={imgClass} alt={field.label} />
          ) : (
            <MosyImageViewer media={mediaUrl(value)} mediaRoot="" defaultLogo={field.defaultLogo || defaultLogo} imageClass={imgClass} />
          )
        ) : (
          <div className="dyn-file-doc" title={name}>
            <i className={`fa fa-${iconFor(name)}`}></i>
            <span>{name}</span>
          </div>
        )}
      </div>

      {isFile && <div className="dyn-file-newtag"><i className="fa fa-circle"></i> New file — not saved yet</div>}

      <div className="dyn-file-actions" style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>
        {!readOnly && (
          <label className="dyn-upload-btn">
            <i className="fa fa-upload"></i> {empty ? 'Choose File' : 'Change File'}
            <input type="file" accept={accept || undefined} style={{ display: 'none' }} onChange={handleFileChange} />
          </label>
        )}
        {!empty && (
          <button type="button" className="dyn-upload-btn dyn-upload-btn-ghost" onClick={open}>
            <i className="fa fa-external-link"></i> Open
          </button>
        )}
        {!empty && !readOnly && (
          <button type="button" className="dyn-upload-btn dyn-upload-btn-ghost dyn-upload-btn-danger" onClick={remove}>
            <i className="fa fa-times"></i> Remove
          </button>
        )}
      </div>

      {!readOnly && (accept || maxMb > 0) && (
        <div className="dyn-file-hint">{[accept && `Allowed: ${accept}`, maxMb > 0 && `max ${maxMb} MB`].filter(Boolean).join(' · ')}</div>
      )}
      {error && <div className="dyn-error text-left">{error}</div>}
    </div>
  );
}

// Back-compat alias: anything importing ImageInput keeps working.
export const ImageInput = FileInput;

export const FIELD_COMPONENTS = {
  text: TextInput, tel: TextInput, email: TextInput, number: TextInput, money: TextInput,
  password: PasswordInput,
  date: DateInput,
  datetime: DateTimeInput,
  textarea: TextareaInput,
  boolean: BooleanInput,
  select: SelectInput,
  groupedSelect: GroupedSelectInput,
  liveSearch: LiveSearchInput,
  richtext: RichTextInput,
  image: FileInput,
  file: FileInput, // was missing: type:'file' fell back to TextInput and showed as a text box
  hidden: HiddenInput,
};