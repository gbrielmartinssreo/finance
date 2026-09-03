/**
 * COFRE — API da planilha
 * Cole este código no Apps Script da sua planilha
 *
 * Estrutura da planilha: uma aba chamada "dados" com as colunas:
 * A: user_id | B: key | C: value (JSON como texto) | D: updated_at
 * (o código cria essa aba sozinho se ela não existir)
 */

const SHEET_NAME = "dados";

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

function doGet(e) {
  const action = e.parameter.action;
  const userId = e.parameter.user;
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
