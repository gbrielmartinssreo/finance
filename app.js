/* ====== CONFIGURAÇÃO — cole aqui a URL do seu Apps Script implantado ====== */
const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbzcD1meqgasrh2Ahj_ReRFwpdEkh_XGlutT_7BHVP97xwRZDZKmPQJtzvQ7S6i6-fBo/exec";
/* =========================================================================== */

const sheetsConfigured = SHEETS_API_URL.startsWith("http");

/* Identificador fixo da sua "conta" — o mesmo em todos os aparelhos garante que
   celular, computador etc. todos leiam e escrevam os MESMOS dados na planilha.
   Troque o texto abaixo por qualquer palavra/código só seu (ex: "familia-silva-2026"). */
const USER_ID = "meu-cofre-pessoal";

// Camada de armazenamento: usa a planilha (via Apps Script) se configurada, senão cai para localStorage (só neste navegador)
const store = {
  async get(key){
    if(sheetsConfigured){
      const url = `${SHEETS_API_URL}?action=get&user=${encodeURIComponent(USER_ID)}&key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if(!res.ok) throw new Error('Falha ao ler da planilha');
      const json = await res.json();
      return json.value !== undefined ? json.value : null;
    } else {
      const v = localStorage.getItem('cofre_'+key);
      return v ? JSON.parse(v) : null;
    }
  },
  async set(key, value){
    if(sheetsConfigured){
      const res = await fetch(SHEETS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS
        body: JSON.stringify({ action:'set', user: USER_ID, key, value })
      });
      if(!res.ok) throw new Error('Falha ao salvar na planilha');
    } else {
      localStorage.setItem('cofre_'+key, JSON.stringify(value));
    }
  }
};

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const fmt = n => (n<0?'-':'') + 'R$ ' + Math.abs(n).toLocaleString('pt-BR',{minimumFractionDigits:2, maximumFractionDigits:2});
const fmtShort = n => (n<0?'-':'') + 'R$ ' + Math.abs(n).toLocaleString('pt-BR',{maximumFractionDigits:0});

let state = { transactions: [], assets: [], investPct: 50, monthStartingBalances: {} };
let currentMonthOffset = 0; // 0 = current month

function showToast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}

async function loadState(){
  if(sheetsConfigured){ showToast('Conectando à planilha...'); }
  try{ state.transactions = await store.get('transactions') || []; }
  catch(e){ console.error(e); state.transactions = []; showToast('Erro ao carregar (veja configuração)'); }
  try{ state.assets = await store.get('assets') || []; }
  catch(e){ state.assets = []; }
  try{ state.investPct = await store.get('investPct'); if(state.investPct==null) state.investPct = 50; }
  catch(e){ state.investPct = 50; }
  try{ state.monthStartingBalances = await store.get('monthStartingBalances') || {}; }
  catch(e){ state.monthStartingBalances = {}; }
  await autoCascadeBalances();
  render();
}
async function saveTransactions(){
  try{ await store.set('transactions', state.transactions); }
  catch(e){ console.error(e); showToast('Erro ao salvar'); }
  // Cascade balances after saving transactions
  await autoCascadeBalances();
}
async function saveAssets(){
  try{ await store.set('assets', state.assets); }
  catch(e){ console.error(e); showToast('Erro ao salvar'); }
}
async function saveInvestPct(){
  try{ await store.set('investPct', state.investPct); }catch(e){}
}

// ---- Tabs ----
$$('.tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    $$('.tab').forEach(t=>t.classList.remove('active'));
    $$('.view').forEach(v=>v.classList.remove('active'));
    tab.classList.add('active');
    $('#view-'+tab.dataset.view).classList.add('active');
    render();
  });
});

// ---- Transaction form ----
let txType = 'income';
$('#typeSeg').addEventListener('click', e=>{
  const btn = e.target.closest('button'); if(!btn) return;
  txType = btn.dataset.type;
  $$('#typeSeg button').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
});
$('#txData').valueAsDate = new Date();

$('#txForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const tx = {
    id: Date.now().toString(),
    type: txType,
    desc: $('#txDesc').value.trim(),
    valor: parseFloat($('#txValor').value),
    data: $('#txData').value,
    cat: $('#txCat').value
  };
  if(!tx.desc || isNaN(tx.valor)) return;
  state.transactions.unshift(tx);
  await saveTransactions();
  $('#txForm').reset();
  $('#txData').valueAsDate = new Date();
  showToast('Lançamento adicionado');
  render();
});

async function deleteTx(id){
  state.transactions = state.transactions.filter(t=>t.id!==id);
  await saveTransactions();
  render();
}

// ---- Asset form ----
$('#assetForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const asset = {
    id: Date.now().toString(),
    nome: $('#aNome').value.trim(),
    ticker: $('#aTicker').value.trim().toUpperCase(),
    qtd: parseFloat($('#aQtd').value),
    precoCompra: parseFloat($('#aPrecoCompra').value),
    precoAtual: parseFloat($('#aPrecoAtual').value)
  };
  if(!asset.nome || isNaN(asset.qtd)) return;
  state.assets.push(asset);
  await saveAssets();
  $('#assetForm').reset();
  showToast('Ativo adicionado');
  render();
});

async function deleteAsset(id){
  state.assets = state.assets.filter(a=>a.id!==id);
  await saveAssets();
  render();
}

// ---- Month helpers ----
function monthKey(offset){
  const d = new Date();
  d.setMonth(d.getMonth()+offset);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function monthLabel(offset){
  const d = new Date();
  d.setMonth(d.getMonth()+offset);
  return d.toLocaleDateString('pt-BR',{month:'long', year:'numeric'});
}
function txMonthKey(tx){ return tx.data.slice(0,7); }

function getAllMonthKeys(){
  const keys = new Set(state.transactions.map(txMonthKey));
  return [...keys].sort();
}

function monthTotals(key){
  const txs = state.transactions.filter(t=>txMonthKey(t)===key);
  const income = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.valor,0);
  const expense = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.valor,0);
  const startingBalance = state.monthStartingBalances[key] || 0;
  return {income, expense, balance: startingBalance + income - expense, txs, startingBalance};
}

// Cascade final balance of a month to the next month's starting balance
async function cascadeBalance(key){
  const {balance} = monthTotals(key);
  const [y, m] = key.split('-').map(Number);
  const nextDate = new Date(y, m, 1); // next month
  const nextKey = nextDate.getFullYear()+'-'+String(nextDate.getMonth()+1).padStart(2,'0');

  // Only cascade if next month doesn't have a starting balance yet
  if(!state.monthStartingBalances[nextKey]){
    state.monthStartingBalances[nextKey] = balance;
    await store.set('monthStartingBalances', state.monthStartingBalances);
  }
}

// Auto-cascade for all months up to current when loading
async function autoCascadeBalances(){
  const keys = getAllMonthKeys();
  const thisKey = monthKey(0);
  const pastKeys = keys.filter(k => k <= thisKey).sort();

  for(const k of pastKeys){
    await cascadeBalance(k);
  }
}

// ---- Render ----
function render(){
  renderRecent();
  renderMonth();
  renderForecast();
  renderInvest();
}

function renderRecent(){
  const list = state.transactions.slice(0,8);
  const el = $('#recentList');
  if(!list.length){ el.innerHTML = '<div class="empty">Nenhum lançamento ainda.</div>'; return; }
  el.innerHTML = list.map(t=>`
    <div class="tx">
      <div>
        <div class="desc">${escapeHtml(t.desc)}</div>
        <div class="cat">${t.cat} · ${formatDate(t.data)}</div>
      </div>
      <div style="display:flex;align-items:center;">
        <div class="amt ${t.type}">${t.type==='income'?'+':'-'} ${fmt(t.valor)}</div>
        <div class="del" onclick="deleteTx('${t.id}')">✕</div>
      </div>
    </div>`).join('');
}

function renderMonth(){
  const key = monthKey(currentMonthOffset);
  $('#mLabel').textContent = capitalize(monthLabel(currentMonthOffset));
  const {income, expense, balance, txs} = monthTotals(key);
  const balEl = $('#mBalance');
  balEl.textContent = fmt(balance);
  balEl.className = 'num ' + (balance>=0?'pos':'neg');
  $('#mIncome').textContent = fmtShort(income);
  $('#mExpense').textContent = fmtShort(expense);
  $('#mRate').textContent = income>0 ? Math.round((balance/income)*100)+'%' : '—';

  // categories
  const cats = {};
  txs.filter(t=>t.type==='expense').forEach(t=>{ cats[t.cat] = (cats[t.cat]||0)+t.valor; });
  const catEl = $('#catBars');
  const entries = Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  if(!entries.length){ catEl.innerHTML = '<div class="empty">Sem gastos neste mês.</div>'; }
  else{
    const max = entries[0][1];
    catEl.innerHTML = entries.map(([cat,val])=>`
      <div class="bar-row">
        <div class="top"><span>${cat}</span><span>${fmt(val)}</span></div>
        <div class="bar-bg"><div class="bar-fill" style="width:${(val/max*100).toFixed(0)}%"></div></div>
      </div>`).join('');
  }

  const listEl = $('#mList');
  if(!txs.length){ listEl.innerHTML = '<div class="empty">Nada por aqui ainda.</div>'; }
  else{
    listEl.innerHTML = txs.map(t=>`
      <div class="tx">
        <div>
          <div class="desc">${escapeHtml(t.desc)}</div>
          <div class="cat">${t.cat} · ${formatDate(t.data)}</div>
        </div>
        <div style="display:flex;align-items:center;">
          <div class="amt ${t.type}">${t.type==='income'?'+':'-'} ${fmt(t.valor)}</div>
          <div class="del" onclick="deleteTx('${t.id}')">✕</div>
        </div>
      </div>`).join('');
  }
}

$('#mPrev').addEventListener('click', ()=>{ currentMonthOffset--; renderMonth(); });
$('#mNext').addEventListener('click', ()=>{ if(currentMonthOffset<0){ currentMonthOffset++; renderMonth(); } });

function renderForecast(){
  const keys = getAllMonthKeys();
  const thisKey = monthKey(0);
  const pastKeys = keys.filter(k=>k<=thisKey); // include months up to now
  let avgIncome=0, avgExpense=0;
  if(pastKeys.length){
    const totals = pastKeys.map(monthTotals);
    avgIncome = totals.reduce((s,t)=>s+t.income,0)/totals.length;
    avgExpense = totals.reduce((s,t)=>s+t.expense,0)/totals.length;
  }
  const free = avgIncome - avgExpense;
  $('#pIncome').textContent = pastKeys.length? fmtShort(avgIncome) : '—';
  $('#pExpense').textContent = pastKeys.length? fmtShort(avgExpense) : '—';
  $('#pFree').textContent = pastKeys.length? fmtShort(free) : '—';

  const pct = state.investPct;
  $('#investPct').value = pct;
  $('#pctLabel').textContent = pct+'%';
  const investAmt = Math.max(free,0) * (pct/100);
  const reserveAmt = Math.max(free,0) - investAmt;
  $('#pInvest').textContent = pastKeys.length? fmtShort(investAmt) : '—';
  $('#pReserve').textContent = pastKeys.length? fmtShort(reserveAmt) : '—';

  const histEl = $('#histList');
  if(!keys.length){ histEl.innerHTML = '<div class="empty">Registre alguns meses para ver o histórico.</div>'; }
  else{
    const sorted = [...keys].sort().reverse().slice(0,6);
    histEl.innerHTML = sorted.map(k=>{
      const t = monthTotals(k);
      const [y,m] = k.split('-');
      const label = capitalize(new Date(y, m-1, 1).toLocaleDateString('pt-BR',{month:'long', year:'numeric'}));
      return `<div class="tx">
        <div class="desc">${label}</div>
        <div class="amt ${t.balance>=0?'income':'expense'}">${fmt(t.balance)}</div>
      </div>`;
    }).join('');
  }
}

$('#investPct').addEventListener('input', async e=>{
  state.investPct = parseInt(e.target.value);
  $('#pctLabel').textContent = state.investPct+'%';
  await saveInvestPct();
  renderForecast();
});

function renderInvest(){
  let totalInvested=0, totalCurrent=0;
  const el = $('#assetList');
  if(!state.assets.length){
    el.innerHTML = '<div class="empty">Nenhum ativo cadastrado ainda.</div>';
  } else {
    el.innerHTML = state.assets.map(a=>{
      const investedVal = a.qtd*a.precoCompra;
      const currentVal = a.qtd*a.precoAtual;
      totalInvested += investedVal; totalCurrent += currentVal;
      const pnl = currentVal-investedVal;
      const pnlPct = investedVal? (pnl/investedVal*100) : 0;
      return `<div class="asset">
        <div class="head">
          <div><span class="name">${escapeHtml(a.nome)}</span> <span class="ticker">${a.ticker}</span></div>
          <div class="del" onclick="deleteAsset('${a.id}')">✕</div>
        </div>
        <div class="pnl ${pnl>=0?'pos':'neg'}">${pnl>=0?'+':''}${fmt(pnl)} (${pnl>=0?'+':''}${pnlPct.toFixed(1)}%)</div>
        <div class="meta">
          <span>Qtd: ${a.qtd}</span>
          <span>Investido: ${fmt(investedVal)}</span>
          <span>Atual: ${fmt(currentVal)}</span>
        </div>
      </div>`;
    }).join('');
  }
  $('#totalInvested').textContent = fmt(totalCurrent);
  const totalPnl = totalCurrent-totalInvested;
  const pnlPctTotal = totalInvested? (totalPnl/totalInvested*100):0;
  const pnlEl = $('#totalPnl');
  pnlEl.textContent = state.assets.length ? `${totalPnl>=0?'+':''}${fmt(totalPnl)} (${totalPnl>=0?'+':''}${pnlPctTotal.toFixed(1)}%)` : '—';
  pnlEl.style.color = totalPnl>=0 ? 'var(--green)' : 'var(--red)';
}

function escapeHtml(s){ return s.replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function formatDate(d){ const [y,m,day]=d.split('-'); return `${day}/${m}`; }
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

if(!sheetsConfigured){ document.getElementById('configWarning').style.display = 'block'; }
loadState();
