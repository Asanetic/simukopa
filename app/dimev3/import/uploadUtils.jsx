import { MosyNotify } from "../../MosyUtils/ActionModals";
import { mosyPostData } from "../../MosyUtils/hiveUtils";

export async function mosyCsvFileImport({endpoint, csvData,colsArray}) {
    if (!csvData.length) return;
  
    //console.log(`mosyCsvFileImport ${endpoint}`)

    MosyNotify({message : "Uploading...", icon : "upload", addTimer : false})

    let result;
    try {
        result = await mosyPostData({url:endpoint, data: {csvData : csvData, colsArray : colsArray}})
    } catch (err) {
        result = { status: "error", message: err?.message || "Network error" }
    }

    if (result?.status == "success") {

        MosyNotify({message :"Data imported successfully", icon : "check-circle", addTimer : false})

    } else {

        MosyNotify({message : "Upload failed: " + (result?.message || "Unknown error"), icon : "times-circle", addTimer : false})

    }
  }


  /**
 * Generate a downloadable CSV template from a column array
 * @param {Array<string>} colsArray - List of column names
 * @param {string} fileName - Name for the downloaded file
 */
// export function generateCsvTemplate(colsArray = [], fileName = "template.csv") {
//     if (!Array.isArray(colsArray) || colsArray.length === 0) {
//       console.error("No columns provided for CSV template");
//       return;
//     }
  
//     // Step 1: Create CSV header row
//     const csvHeader = colsArray.join(",") + "\n";
  
//     // Step 2: Create a Blob
//     const blob = new Blob([csvHeader], { type: "text/csv;charset=utf-8;" });
  
//     // Step 3: Create a download link
//     const link = document.createElement("a");
//     const url = URL.createObjectURL(blob);
//     link.href = url;
//     link.download = fileName;
  
//     // Step 4: Trigger download
//     document.body.appendChild(link);
//     link.click();
  
//     // Step 5: Cleanup
//     document.body.removeChild(link);
//     URL.revokeObjectURL(url);
//   }
  
  
//const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;
// Quote a cell only when needed (comma, quote or line break inside it)
/** Quote-aware CSV parser: commas/newlines inside "quoted" cells stay in the cell; "" is an escaped quote. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", inQuotes = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(cell.trim()); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell.trim()); rows.push(row); }

  return rows.filter((r) => r.some((v) => v !== ""));
}

const csvCell = (v) => {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
export function generateCsvTemplate(colsArray = [], fileName = "template.csv", noteText = "") {
  if (!Array.isArray(colsArray) || colsArray.length === 0) {
    console.error("No columns provided for CSV template");
    return;
  }

  // Row 1: headers
  let csv = colsArray.join(",") + "\n";

  // Row 2 (optional): explanation in the first cell, padded so the row has the same column count
  if (noteText) {
    csv += [csvCell(noteText), ...colsArray.slice(1).map(() => "")].join(",") + "\n";
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
