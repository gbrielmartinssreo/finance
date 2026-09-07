/**
 * COFRE — API da planilha
 * Cole este código no Apps Script da sua planilha (veja o guia GUIA-DEPLOY.md).
 *
 * Aba "dados" (key/value genérico, continua igual — usada por investPct, monthStartingBalances etc.):
 * A: user_id | B: key | C: value (JSON como texto) | D: updated_at
 *
 * Aba "transactions" (NOVA — uma linha por transação, sem limite de tamanho de célula):
 * A: user_id | B: id | C: type | D: valor | E: data | F: cat | G: desc | H: updated_at
 * (o código cria as duas abas sozinho se não existirem)
 */

const SHEET_NAME = "dados";
const TX_SHEET_NAME = "transactions";
const TX_HEADERS = ["user_id", "id", "type", "valor", "data", "cat", "desc", "updated_at"];

// ---------- aba "dados" (key/value genérico) ----------

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["user_id", "key", "value", "updated_at"]);
  }
  return sheet;
}

function findRow_(sheet, userId, key) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId && data[i][1] === key) {
      return i + 1; // linha real na planilha (1-indexado)
    }
  }
  return -1;
}

// ---------- aba "transactions" (uma linha por transação) ----------

function getTxSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TX_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TX_SHEET_NAME);
    sheet.appendRow(TX_HEADERS);
  }
  return sheet;
}

function findTxRow_(sheet, userId, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId && String(data[i][1]) === String(id)) {
      return i + 1;
    }
  }
  return -1;
}

function addTransaction_(userId, tx) {
  const sheet = getTxSheet_();
  const now = new Date().toISOString();
  const row = findTxRow_(sheet, userId, tx.id);

  const values = [
    userId,
    tx.id,
    tx.type || "",
    tx.valor,
    tx.data || "",
    tx.cat || "",
    tx.desc || "",
    now
  ];

  if (row === -1) {
    sheet.appendRow(values);
  } else {
    // já existe uma transação com esse id -> atualiza a linha (upsert)
    sheet.getRange(row, 1, 1, TX_HEADERS.length).setValues([values]);
  }
}

function deleteTransaction_(userId, id) {
  const sheet = getTxSheet_();
  const row = findTxRow_(sheet, userId, id);
  if (row !== -1) {
    sheet.deleteRow(row);
    return true;
  }
  return false;
}

function getTransactions_(userId) {
  const sheet = getTxSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, TX_HEADERS.length).getValues();
  return data
    .filter(r => r[0] === userId)
    .map(r => ({
      id: r[1],
      type: r[2],
      valor: r[3],
      data: r[4],
      cat: r[5],
      desc: r[6],
      updated_at: r[7]
    }));
}

// ---------- roteamento HTTP ----------

function doGet(e) {
  const action = e.parameter.action;
  const userId = e.parameter.user;

  if (action === "getTransactions") {
    if (!userId) return jsonOutput_({ error: "parâmetros inválidos" });
    return jsonOutput_({ value: getTransactions_(userId) });
  }

  const key = e.parameter.key;
  if (action !== "get" || !userId || !key) {
    return jsonOutput_({ error: "parâmetros inválidos" });
  }

  const sheet = getSheet_();
  const row = findRow_(sheet, userId, key);
  if (row === -1) {
    return jsonOutput_({ value: null });
  }
  const rawValue = sheet.getRange(row, 3).getValue();
  let value;
  try { value = JSON.parse(rawValue); } catch (err) { value = rawValue; }
  return jsonOutput_({ value: value });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput_({ error: "corpo inválido" });
  }

  const action = body.action;
  const userId = body.user;

  if (action === "addTransaction") {
    if (!userId || !body.transaction || !body.transaction.id) {
      return jsonOutput_({ error: "parâmetros inválidos" });
    }
    addTransaction_(userId, body.transaction);
    return jsonOutput_({ ok: true });
  }

  if (action === "deleteTransaction") {
    if (!userId || !body.id) {
      return jsonOutput_({ error: "parâmetros inválidos" });
    }
    const removed = deleteTransaction_(userId, body.id);
    return jsonOutput_({ ok: removed });
  }

  // fallback: comportamento antigo de key/value genérico (investPct, monthStartingBalances, etc.)
  const key = body.key;
  const value = body.value;

  if (action !== "set" || !userId || !key) {
    return jsonOutput_({ error: "parâmetros inválidos" });
  }

  const sheet = getSheet_();
  const row = findRow_(sheet, userId, key);
  const valueStr = JSON.stringify(value);
  const now = new Date().toISOString();

  if (row === -1) {
    sheet.appendRow([userId, key, valueStr, now]);
  } else {
    sheet.getRange(row, 3).setValue(valueStr);
    sheet.getRange(row, 4).setValue(now);
  }

  return jsonOutput_({ ok: true });
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- migração única do JSON antigo (roda manual pelo editor do Apps Script) ----------

function migrateExistingTransactions() {
  const dataSheet = getSheet_();
  const data = dataSheet.getDataRange().getValues();

  let migrated = 0;

  for (let i = 1; i < data.length; i++) {
    const userId = data[i][0];
    const key = data[i][1];
    if (key !== "transactions") continue;

    let list;
    try {
      list = JSON.parse(data[i][2]);
    } catch (err) {
      continue;
    }
    if (!Array.isArray(list)) continue;

    list.forEach(tx => {
      addTransaction_(userId, tx);
      migrated++;
    });
  }

  Logger.log("Transações migradas: " + migrated);
  Logger.log("Confira a aba '" + TX_SHEET_NAME + "'. Depois de validar, apague manualmente a linha key=transactions na aba '" + SHEET_NAME + "'.");
}
