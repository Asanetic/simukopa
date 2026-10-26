"use client";
import React, { useState, useMemo, useRef } from "react";

import { generateCsvTemplate, mosyCsvFileImport, parseCsv } from './uploadUtils'

const NOTE_MARKER = "#NOTE:";
const SCI_NOTATION = /^\d+(\.\d+)?e\+\d+$/i;   // Excel-mangled numbers, e.g. 2.547E+11
const MAX_BYTES = 10 * 1024 * 1024;            // 10 MB

const toLabel = (k) => String(k).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const formatSize = (b) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

export default function ImportCSVComponent({
  title = "Import CSV data",
  subtitle = "Upload and validate your records before importing.",
  section = "Data management",   // breadcrumb root
  endpoint,
  templateName = "octane_sales_template.csv",
  colsArray,
  idKey = "record_id",   // real DB key of the record id column
  idAlias = "",          // friendly CSV header for it (schema.excel_import_record_id_alias)
}) {
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [validated, setValidated] = useState(false);
  const [status, setStatus] = useState("idle");   // idle | uploading | done
  const [dragOver, setDragOver] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // search state (filters the preview only; import still sends every loaded row)
  const [searchTerm, setSearchTerm] = useState("");
  const [searchCol, setSearchCol] = useState("all");
  const [dupsOnly, setDupsOnly] = useState(false);

  function resetSearch() {
    setSearchTerm("");
    setSearchCol("all");
    setDupsOnly(false);
    setCurrentPage(1);
  }

  function resetParsed() {
    setCsvData([]);
    setCsvHeaders([]);
    setValidated(false);
    setStatus("idle");
    resetSearch();
  }

  function selectFile(f) {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      setFileError("Only .csv files are supported.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileError(`File is too large (${formatSize(f.size)}). Maximum is 10 MB.`);
      return;
    }
    setFileError("");
    setFile(f);
    resetParsed();
  }

  function handleClear() {
    setFile(null);
    setFileError("");
    resetParsed();
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    selectFile(e.dataTransfer.files?.[0]);
  }

  async function handleValidate() {
    if (!file) return;

    const text = await file.text();
    const noteRe = new RegExp(`^${NOTE_MARKER}`, "i");
    const rows = parseCsv(text).filter((r) => !noteRe.test(r[0] || ""));   // skip template note row

    if (rows.length === 0) {
      setFileError("The file has no usable rows.");
      return;
    }
    setFileError("");

    // alias header (e.g. "organisers_identifier") -> real key (e.g. "organiser_id")
    const headerRow = rows[0]
      .map((h) => (idAlias && h === idAlias ? idKey : h));

    const data = rows.slice(1).map((values) => {
      const obj = {};
      headerRow.forEach((key, i) => (obj[key] = values[i] || ""));
      return obj;
    });

    setCsvHeaders(headerRow);
    setCsvData(data);
    setValidated(true);
    setStatus("idle");
    resetSearch();
  }

  // duplicate record ids inside the file (blanks are fine, the server generates those)
  const duplicateIds = useMemo(() => {
    const seen = new Set();
    const dups = new Set();
    csvData.forEach((row) => {
      const id = String(row[idKey] ?? "").trim();
      if (!id) return;
      if (seen.has(id)) dups.add(id);
      else seen.add(id);
    });
    return dups;
  }, [csvData, idKey]);

  // columns holding Excel scientific-notation values (digits already lost in the file)
  const sciCols = useMemo(() => {
    const cols = new Set();
    csvData.forEach((row) =>
      Object.entries(row).forEach(([k, v]) => {
        if (SCI_NOTATION.test(String(v ?? "").trim())) cols.add(k);
      })
    );
    return [...cols];
  }, [csvData]);

  const headerLabel = (h) => toLabel(h === idKey && idAlias ? idAlias : h);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return csvData
      .map((row, originalIndex) => ({ row, originalIndex }))
      .filter(({ row }) => {
        if (dupsOnly && !duplicateIds.has(String(row[idKey] ?? "").trim())) return false;
        if (!q) return true;
        const cells = searchCol === "all" ? Object.values(row) : [row[searchCol]];
        return cells.some((v) => String(v ?? "").toLowerCase().includes(q));
      });
  }, [csvData, searchTerm, searchCol, dupsOnly, duplicateIds, idKey]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = filteredRows.slice(startIndex, startIndex + rowsPerPage);
  const showingFrom = filteredRows.length ? startIndex + 1 : 0;
  const showingTo = Math.min(startIndex + rowsPerPage, filteredRows.length);

  const isFiltered = searchTerm !== "" || searchCol !== "all" || dupsOnly;
  const hasData = csvData.length > 0;
  const hasIssues = duplicateIds.size > 0;
  const canImport = validated && hasData && !hasIssues && status === "idle";

  function getPaginationButtons() {
    const pages = [];
    const delta = 2;
    const left = Math.max(2, currentPage - delta);
    const right = Math.min(totalPages - 1, currentPage + delta);

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (left > 2) pages.push("...");
      for (let i = left; i <= right; i++) pages.push(i);
      if (right < totalPages - 1) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }

  async function uploadFile() {
    if (!canImport) return;
    setStatus("uploading");
    const ok = await mosyCsvFileImport({ endpoint, csvData, colsArray });
    // lock after success so a second click can't insert everything again; a failure allows retry
    setStatus(ok === false ? "idle" : "done");
  }

  function handleDownloadTemplate() {
    const headers = colsArray.map((k) => (k === idKey && idAlias ? idAlias : k));
    const idNote = `${NOTE_MARKER} ${idAlias || idKey} = a unique value to identify this record and its related data in the system, e.g. account_number or registration number. Leave blank to auto-generate. Delete this row before uploading.`;
    generateCsvTemplate(headers, templateName, idNote);
  }

  const dupList = [...duplicateIds];
  const dupText = dupList.slice(0, 5).join(", ") + (dupList.length > 5 ? ` and ${dupList.length - 5} more` : "");

  function renderCell(h, v) {
    const val = v ?? "";
    if (h.toLowerCase() === "status" && val) {
      const good = /^(active|confirmed|paid|success|open)$/i.test(val);
      return <span className={`imp-pill ${good ? "" : "muted"}`}>{toLabel(val)}</span>;
    }
    return val;
  }

  return (
    <div className="imp-wrap">
      <style>{`
        .imp-wrap { --imp-green: #1a7f4b; --imp-green-dark: #146339; --imp-green-soft: #e8f5ee; color: #111827; }
        .imp-crumb { font-size: .8rem; color: #6b7280; }
        .imp-crumb .cur { color: var(--imp-green); }
        .imp-title { font-size: 1.6rem; font-weight: 700; margin: .2rem 0 .1rem; }
        .imp-sub { color: #6b7280; margin-bottom: 1rem; }
        .imp-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
        .imp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 768px) { .imp-grid { grid-template-columns: 1fr; } }
        .imp-drop { border: 2px dashed #cbd5e1; border-radius: 10px; min-height: 150px; display: flex; flex-direction: column;
          align-items: center; justify-content: center; text-align: center; cursor: pointer; background: #fafbfc; padding: 16px; transition: .15s; }
        .imp-drop.over { border-color: var(--imp-green); background: #f0fdf4; }
        .imp-drop-icon { width: 42px; height: 42px; border-radius: 10px; background: var(--imp-green-soft); color: var(--imp-green);
          display: flex; align-items: center; justify-content: center; font-size: 1.2rem; margin-bottom: 10px; }
        .imp-browse { color: var(--imp-green); font-weight: 600; }
        .imp-hint { font-size: .75rem; color: #6b7280; margin-top: 4px; }
        .imp-right { display: flex; flex-direction: column; gap: 12px; justify-content: center; }
        .imp-file { display: flex; align-items: center; gap: 12px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; min-height: 58px; }
        .imp-file-icon { width: 34px; height: 34px; border-radius: 8px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; color: #4b5563; }
        .imp-file-name { font-weight: 600; font-size: .9rem; word-break: break-all; }
        .imp-file-meta { font-size: .75rem; color: #6b7280; }
        .imp-file-empty { color: #9ca3af; font-size: .9rem; }
        .imp-x { background: none; border: 0; color: #6b7280; cursor: pointer; padding: 4px 6px; }
        .imp-actions { display: grid; grid-template-columns: 1.1fr 1.1fr .8fr; gap: 8px; }
        @media (max-width: 520px) { .imp-actions { grid-template-columns: 1fr; } }
        .imp-btn { border: 1px solid #d1d5db; background: #fff; color: #111827; border-radius: 8px; padding: 9px 12px; font-weight: 600;
          font-size: .88rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .imp-btn:hover:not(:disabled) { background: #f9fafb; }
        .imp-btn:disabled { opacity: .5; cursor: not-allowed; }
        .imp-btn.primary { background: var(--imp-green); border-color: var(--imp-green); color: #fff; }
        .imp-btn.primary:hover:not(:disabled) { background: var(--imp-green-dark); }
        .imp-alert { display: flex; align-items: center; gap: 10px; border-radius: 10px; padding: 11px 14px; margin-bottom: 14px; font-size: .9rem; }
        .imp-alert .ico { width: 22px; height: 22px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: .7rem; flex: none; }
        .imp-alert.err { background: #fdecee; border: 1px solid #f5c2c7; color: #7f1d1d; }
        .imp-alert.err .ico { background: #dc2626; }
        .imp-alert.warn { background: #fff7e6; border: 1px solid #fde1a6; color: #7a4b00; }
        .imp-alert.warn .ico { background: #d97706; }
        .imp-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .imp-head h5 { margin: 0; font-weight: 700; font-size: 1.05rem; }
        .imp-badge { background: #eef2f7; color: #374151; border-radius: 999px; padding: 2px 10px; font-size: .75rem; font-weight: 600; margin-left: 8px; }
        .imp-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .imp-tools input[type=search], .imp-tools select { border: 1px solid #d1d5db; border-radius: 8px; padding: 6px 10px; font-size: .82rem; background: #fff; }
        .imp-tools input[type=search] { min-width: 210px; }
        .imp-tools label { margin: 0; font-size: .8rem; color: #4b5563; display: inline-flex; align-items: center; gap: 6px; }
        .imp-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: .85rem; }
        .imp-table th { background: #f3f4f6; color: #374151; font-weight: 600; font-size: .78rem; padding: 10px 12px; white-space: nowrap; text-align: left; }
        .imp-table th:first-child { border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
        .imp-table th:last-child { border-top-right-radius: 8px; border-bottom-right-radius: 8px; }
        .imp-table td { padding: 11px 12px; border-bottom: 1px solid #eef0f3; }
        .imp-table tr.dup td { background: #fff1f2; }
        .imp-pill { display: inline-flex; align-items: center; gap: 6px; background: #dcfce7; color: #166534; border-radius: 999px; padding: 2px 10px; font-size: .72rem; font-weight: 600; }
        .imp-pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .imp-pill.muted { background: #f3f4f6; color: #4b5563; }
        .imp-foot { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-top: 12px; }
        .imp-foot small { color: #6b7280; }
        .imp-pager { display: flex; gap: 6px; }
        .imp-page { min-width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e5e7eb; background: #fff; color: #374151; cursor: pointer; font-size: .82rem; }
        .imp-page.active { background: var(--imp-green); border-color: var(--imp-green); color: #fff; font-weight: 600; }
        .imp-page:disabled { opacity: .45; cursor: not-allowed; }
        .imp-empty { text-align: center; color: #6b7280; padding: 22px 0; }
      `}</style>

      {/* header */}
      <div className="imp-crumb">{section} / <span className="cur">{title.trim()}</span></div>
      <h1 className="imp-title">{title.trim()}</h1>
      <div className="imp-sub">{subtitle}</div>

      {/* upload card */}
      <div className="imp-card">
        <div className="imp-grid">
          <div
            className={`imp-drop ${dragOver ? "over" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <div className="imp-drop-icon"><i className="fa fa-cloud-upload"></i></div>
            <div>Drop your CSV file here or <span className="imp-browse">browse</span></div>
            <div className="imp-hint">CSV files only · Maximum 10 MB</div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={(e) => selectFile(e.target.files?.[0])}
            />
          </div>

          <div className="imp-right">
            <div className="imp-file">
              {file ? (
                <>
                  <div className="imp-file-icon"><i className="fa fa-file-text-o"></i></div>
                  <div style={{ flex: 1 }}>
                    <div className="imp-file-name">{file.name}</div>
                    <div className="imp-file-meta">
                      {validated ? `${csvData.length} rows · ` : ""}{formatSize(file.size)}
                    </div>
                  </div>
                  {validated && (
                    <i
                      className={`fa ${hasIssues ? "fa-exclamation-circle text-danger" : "fa-check-circle"}`}
                      style={{ fontSize: "1.3rem", color: hasIssues ? undefined : "var(--imp-green)" }}
                    ></i>
                  )}
                  <button className="imp-x" onClick={handleClear} title="Remove file"><i className="fa fa-times"></i></button>
                </>
              ) : (
                <span className="imp-file-empty">No file selected</span>
              )}
            </div>

            <div className="imp-actions">
              {!validated ? (
                <button className="imp-btn primary" onClick={handleValidate} disabled={!file}>
                  <i className="fa fa-check"></i> Validate file
                </button>
              ) : (
                <button className="imp-btn primary" onClick={uploadFile} disabled={!canImport}>
                  <i className={`fa ${status === "uploading" ? "fa-spinner fa-spin" : status === "done" ? "fa-check" : "fa-upload"}`}></i>
                  {status === "uploading" ? "Importing..." : status === "done" ? "Imported" : `Import ${csvData.length} rows`}
                </button>
              )}
              <button className="imp-btn" onClick={handleDownloadTemplate}>
                <i className="fa fa-download"></i> Download template
              </button>
              <button className="imp-btn" onClick={handleClear}>
                <i className="fa fa-trash-o"></i> Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* alerts */}
      {fileError && (
        <div className="imp-alert err"><span className="ico"><i className="fa fa-exclamation"></i></span><span>{fileError}</span></div>
      )}
      {hasIssues && (
        <div className="imp-alert err">
          <span className="ico"><i className="fa fa-exclamation"></i></span>
          <span>
            Duplicate {(idAlias || idKey).replace(/_/g, " ")} found: <strong>{dupText}</strong>. Resolve {dupList.length === 1 ? "this duplicate" : "these duplicates"} before importing.
          </span>
        </div>
      )}
      {sciCols.length > 0 && (
        <div className="imp-alert warn">
          <span className="ico"><i className="fa fa-exclamation"></i></span>
          <span>
            Column{sciCols.length > 1 ? "s" : ""} <strong>{sciCols.map(toLabel).join(", ")}</strong> contain values like 2.547E+11. Excel shortened these numbers when the file was saved, so the original digits are lost. Format the column as Text in Excel and re-save the CSV.
          </span>
        </div>
      )}

      {/* preview card */}
      {hasData && (
        <div className="imp-card">
          <div className="imp-head">
            <h5>Data preview <span className="imp-badge">{csvData.length} rows</span></h5>
            <div className="imp-tools">
              <input
                type="search"
                placeholder="Search loaded rows..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              />
              <select value={searchCol} onChange={(e) => { setSearchCol(e.target.value); setCurrentPage(1); }}>
                <option value="all">All columns</option>
                {csvHeaders.map((h) => (
                  <option key={h} value={h}>{headerLabel(h)}</option>
                ))}
              </select>
              {hasIssues && (
                <label>
                  <input type="checkbox" checked={dupsOnly} onChange={(e) => { setDupsOnly(e.target.checked); setCurrentPage(1); }} />
                  Duplicates only
                </label>
              )}
              <label>
                Rows per page:
                <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
                  {[5, 10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              {isFiltered && <button className="imp-btn" style={{ padding: "5px 10px" }} onClick={resetSearch}>Reset</button>}
            </div>
          </div>

          <div className="table-responsive">
            <table className="imp-table">
              <thead>
                <tr>
                  <th>#</th>
                  {csvHeaders.map((h, i) => <th key={i}>{headerLabel(h)}</th>)}
                </tr>
              </thead>
              <tbody>
                {currentRows.length === 0 && (
                  <tr><td colSpan={csvHeaders.length + 1}><div className="imp-empty">No rows match your search.</div></td></tr>
                )}
                {currentRows.map(({ row, originalIndex }) => {
                  const isDup = duplicateIds.has(String(row[idKey] ?? "").trim());
                  return (
                    <tr key={originalIndex} className={isDup ? "dup" : ""}>
                      <td>{originalIndex + 1}</td>
                      {csvHeaders.map((h, i) => <td key={i}>{renderCell(h, row[h])}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="imp-foot">
            <small>
              Showing {showingFrom} to {showingTo} of {filteredRows.length} rows
              {filteredRows.length !== csvData.length && ` (filtered from ${csvData.length})`}
            </small>
            <div className="imp-pager">
              <button className="imp-page" disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>
                <i className="fa fa-chevron-left"></i>
              </button>
              {getPaginationButtons().map((p, i) =>
                p === "..." ? (
                  <span key={i} className="imp-page" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", border: 0 }}>…</span>
                ) : (
                  <button key={i} className={`imp-page ${p === currentPage ? "active" : ""}`} onClick={() => setCurrentPage(p)}>{p}</button>
                )
              )}
              <button className="imp-page" disabled={currentPage === totalPages} onClick={() => setCurrentPage(currentPage + 1)}>
                <i className="fa fa-chevron-right"></i>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}