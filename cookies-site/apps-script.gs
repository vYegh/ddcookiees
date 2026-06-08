/**
 * Cookies by DD & Alexa — Orders backend (Google Apps Script)
 * ----------------------------------------------------------------
 * This script turns a Google Sheet into a tiny order database:
 *   • POST (action=create) → append a new order row        (called by the website order form)
 *   • GET  (no action)     → return all orders as JSON      (read by the /orders dashboard)
 *   • POST (action=status) → update one order's status      (status dropdown on the dashboard)
 *
 * SETUP: see SETUP.md. In short — paste this into script.google.com,
 * set the two CONFIG values below, Deploy as a Web App ("Anyone"),
 * then copy the deployment URL into script.js (ORDERS_ENDPOINT) and orders.js (ENDPOINT).
 */

// ====== CONFIG — EDIT THESE TWO ======
const SHEET_ID = "1NCy9vYCvMVW5pQjldyaIAUWuSV7IgPEdi1Ejyf6uL7U"; // the long id in the Sheet's URL
const SECRET   = "iW53FSjgO4c8ptJmZFkIXLQ55cYNjRQe"; // must match TOKEN in orders.js
// =====================================

const SHEET_NAME = "Orders";
const HEADERS = [
  "Timestamp", "Status", "Order Type", "Name", "Cookies",
  "Total Cookies", "Estimated Total", "Address",
  "Contact 1", "Contact 2", "Payment", "Date Needed", "Notes"
];

/* ---------- helpers ---------- */
function getSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  // make sure headers exist on a fresh/blank sheet
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- POST: create order OR update status ---------- */
function doPost(e) {
  try {
    const p = (e && e.parameter) || {};
    const sheet = getSheet_();

    // --- update an existing order's status (from the dashboard) ---
    if (p.action === "status") {
      if (p.token !== SECRET) return json_({ ok: false, error: "unauthorized" });
      const row = parseInt(p.row, 10);     // sheet row number (2-based; row 1 is headers)
      if (!row || row < 2) return json_({ ok: false, error: "bad row" });
      sheet.getRange(row, 2).setValue(p.status || "");  // column 2 = Status
      return json_({ ok: true });
    }

    // --- create a new order (from the website form) ---
    // No token required here so the public form can submit; spam is mitigated by the honeypot.
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
    const row = HEADERS.map(h => {
      if (h === "Timestamp") return now;
      if (h === "Status")    return "New";
      return p[h] || "";
    });
    sheet.appendRow(row);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------- GET: list all orders for the dashboard ---------- */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.token !== SECRET) return json_({ ok: false, error: "unauthorized" });

    const sheet = getSheet_();
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return json_({ ok: true, orders: [] });

    const head = values[0];
    const orders = [];
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (!r.join("")) continue;            // skip blank rows
      const o = { _row: i + 1 };            // sheet row number for status updates
      head.forEach((h, idx) => { o[h] = r[idx]; });
      orders.push(o);
    }
    orders.reverse();                       // newest first
    return json_({ ok: true, orders: orders });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
