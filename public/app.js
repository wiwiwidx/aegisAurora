const $ = (selector) => document.querySelector(selector);
const formatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const priceFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 5 });
const quantityFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 8 });
const money = (value) => value == null ? '—' : formatter.format(value);
const quantity = (value) => value == null ? '—' : quantityFormatter.format(value);
const price = (value) => value ? priceFormatter.format(value) : '—';
const usd = (value) => value == null ? '—' : `$${money(Math.abs(value))}`;
const signedUsd = (value) => value == null ? '—' : `${value >= 0 ? '+' : '−'}${usd(value)}`;
const dateTime = (value) => value ? `${new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(Number(value)))} UTC` : '—';
const pnlWindowKey = 'bybit-sizer:pnl-window';
let pnlWindow = Number(localStorage.getItem(pnlWindowKey)) || 24;
const pnlRangeKey = 'bybit-sizer:pnl-range';
let pnlRange = JSON.parse(localStorage.getItem(pnlRangeKey) || 'null');
let activeTab = 'active';
const toLocalInput = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date - offset).toISOString().slice(0, 16);
};
const planKey = (deal, kind) => `bybit-sizer:${deal.symbol}:${deal.side}:${kind}`;
const readPlan = (deal, kind) => localStorage.getItem(planKey(deal, kind)) ?? '';
const parsePrice = (value) => {
  const parsed = Number(String(value).replace(/[\s\u00a0]/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const planInput = (deal, kind, label, placeholder) => `<label><span>${label}</span><input class="plan-input" data-symbol="${deal.symbol}" data-side="${deal.side}" data-kind="${kind}" inputmode="decimal" placeholder="${placeholder}" value="${readPlan(deal, kind)}"></label>`;

function dealCard(deal, expandedDeals) {
  const isLong = deal.side === 'Buy';
  const planStop = parsePrice(readPlan(deal, 'stop'));
  const planTake = parsePrice(readPlan(deal, 'take'));
  const stop = planStop ?? deal.stop ?? null;
  const take = planTake ?? deal.take ?? null;
  const sign = isLong ? 1 : -1;
  const entries = deal.entries;
  const totalQty = entries.reduce((sum, entry) => sum + entry.qty, 0);
  const totalValue = entries.reduce((sum, entry) => sum + entry.value, 0);
  const totalAverage = totalQty ? totalValue / totalQty : 0;
  const fullRisk = stop && totalQty ? (stop - totalAverage) * totalQty * sign : null;
  const fullProfit = take && totalQty ? (take - totalAverage) * totalQty * sign : null;
  const fullRr = fullRisk != null && fullProfit != null && fullRisk < 0
    ? `${money(fullProfit / Math.abs(fullRisk))}R`
    : '—';
  const currentProfit = take && deal.position?.size ? (take - deal.position.entryPrice) * deal.position.size * sign : null;
  const currentPnl = deal.position?.unrealisedPnl ?? null;
  const entriesRows = entries.length ? entries.map((entry, index) => `<tr><td>${index + 1}</td><td>${entry.status === 'filled' ? '<b class="profit">Исполнен</b>' : '<b>Ожидает</b>'}</td><td>${price(entry.price)}</td><td>${usd(entry.value)}</td><td>${quantity(entry.qty)}</td><td>${money(entry.ratio * 100)}%</td></tr>`).join('') : '<tr><td colspan="6">Нет входных лимиток</td></tr>';
  const scenarioRows = deal.scenarios.length ? deal.scenarios.map((item) => {
    const profit = take ? (take - item.averageEntry) * item.qty * sign : null;
    const filled = Array.from({ length: item.filled }, (_, index) => index + 1).join('+');
    return `<tr><td>${item.filled}</td><td>${filled}</td><td>${price(item.averageEntry)}</td><td>${usd(item.value)}</td><td class="profit">${signedUsd(profit)}</td></tr>`;
  }).join('') : '<tr><td colspan="5">Пока нет сценариев</td></tr>';
  const id = `${deal.symbol}:${deal.side}`;
  return `<details class="trade ${isLong ? 'long' : 'short'}" data-deal="${id}"${expandedDeals.has(id) ? ' open' : ''}><summary class="trade-summary"><div class="symbol"><h2><a href="https://www.bybitglobal.com/ru-RU/trade/usdt/${deal.symbol}" target="_blank" rel="noopener" title="Открыть ${deal.symbol} в Bybit Global">${deal.symbol}</a></h2><span>${isLong ? 'LONG' : 'SHORT'}</span></div><div class="trade-summary-data"><div class="full-metrics"><span>Объём <b>${usd(totalValue)}</b></span><span>Full Risk <b class="loss">${signedUsd(fullRisk)}</b></span><span>Full TP <b class="profit">${signedUsd(fullProfit)}</b></span><span>Full RR <b>${fullRr}</b></span></div><div class="pnl-metric">PnL now <b class="${currentPnl >= 0 ? 'profit' : 'loss'}">${signedUsd(currentPnl)}</b></div></div><div class="trade-dates"><span>Открыта <b>${dateTime(deal.openedAt)}</b></span><span>Закрыта <b>—</b></span></div><i>⌄</i></summary><div class="trade-details"><div class="trade-main"><section class="levels-form"><div class="form-title">Тестовые уровни · только расчёт</div>${planInput(deal, 'stop', 'Тест SL', 'Введи цену')}${planInput(deal, 'take', 'Тест TP', 'Введи цену')}<div class="actual-row"><span>Bybit SL</span><b>${price(deal.stop)}</b></div><div class="actual-row"><span>Bybit TP</span><b>${price(deal.take)}</b></div></section><section class="trade-result"><div><span>Объём</span><b>${usd(totalValue)}</b></div><div><span>AVG сетки</span><b>${price(totalAverage)}</b></div><div><span>Full Risk</span><b class="loss">${signedUsd(fullRisk)}</b></div><div><span>Full TP</span><b class="profit">${signedUsd(fullProfit)}</b></div><div><span>Full RR</span><b>${fullRr}</b></div><div><span>Current TP</span><b class="profit">${signedUsd(currentProfit)}</b></div></section></div><section class="table-block"><h3>Входы</h3><table><thead><tr><th>Order</th><th>Статус</th><th>Entry</th><th>Size $</th><th>Qty</th><th>Ratio</th></tr></thead><tbody>${entriesRows}</tbody></table></section><section class="table-block"><h3>Сценарии</h3><table><thead><tr><th>Scenario</th><th>Filled</th><th>Avg entry</th><th>Total size $</th><th>Profit at TP</th></tr></thead><tbody>${scenarioRows}</tbody></table></section></div></details>`;
}
function render(data) {
  const expandedDeals = new Set([...document.querySelectorAll('.trade[open]')].map((item) => item.dataset.deal));
  $('#mode').textContent = data.live ? 'LIVE' : 'ДЕМО';
  $('#mode').className = data.live ? 'live' : '';
  const pendingDeals = data.pendingDeals || [];
  const history = data.history || [];
  $('#hint').textContent = activeTab === 'active' ? `Сделки (${data.deals.length})` : activeTab === 'pending' ? `Ожидающие лимитки (${pendingDeals.length})` : `История сделок (${history.length})`;
  const pnl24h = data.account.pnl24h;
  const custom = pnlWindow === -1;
  $('#account').innerHTML = `<span>Общий баланс <b>${usd(data.account.equity)}</b></span><span>Используется в сделках <b>${usd(data.account.usedMargin)}</b></span><span class="account-pnl">PnL за <select class="pnl-window" aria-label="Период PnL"><option value="24"${pnlWindow === 24 ? ' selected' : ''}>24ч</option><option value="168"${pnlWindow === 168 ? ' selected' : ''}>7д</option><option value="720"${pnlWindow === 720 ? ' selected' : ''}>30д</option><option value="-1"${custom ? ' selected' : ''}>свой период</option></select>${custom ? ` <label class="pnl-range">с <input class="pnl-start" type="datetime-local" value="${toLocalInput(pnlRange?.start)}"> по <input class="pnl-end" type="datetime-local" value="${toLocalInput(pnlRange?.end)}"></label>` : ''} <b class="${pnl24h >= 0 ? 'profit' : 'loss'}">${signedUsd(pnl24h)}</b></span>`;
  const tabs = `<nav class="workspace-tabs"><button data-tab="pending" class="${activeTab === 'pending' ? 'active' : ''}">Ожидающие лимитки <b>${pendingDeals.length}</b></button><button data-tab="active" class="${activeTab === 'active' ? 'active' : ''}">Сделки <b>${data.deals.length}</b></button><button data-tab="history" class="${activeTab === 'history' ? 'active' : ''}">История сделок <b>${history.length}</b></button></nav>`;
  const activeView = data.deals.length ? data.deals.map((deal) => dealCard(deal, expandedDeals)).join('') : '<section class="empty">Нет активных сделок</section>';
  const pendingView = pendingDeals.length ? pendingDeals.map((deal) => dealCard(deal, expandedDeals)).join('') : '<section class="empty">Нет ожидающих лимиток</section>';
  const historyView = history.length ? `<section class="history-table"><table><thead><tr><th>Инструмент</th><th>Направление</th><th>Вход</th><th>Выход</th><th>Qty</th><th>PnL</th><th>Закрыта</th></tr></thead><tbody>${history.map((item) => `<tr><td>${item.symbol}</td><td>${item.side === 'Buy' ? 'LONG' : 'SHORT'}</td><td>${price(item.entry)}</td><td>${price(item.exit)}</td><td>${quantity(item.qty)}</td><td class="${item.pnl >= 0 ? 'profit' : 'loss'}">${signedUsd(item.pnl)}</td><td>${dateTime(item.closedAt)}</td></tr>`).join('')}</tbody></table></section>` : '<section class="empty">Закрытых сделок пока нет</section>';
  $('#app').innerHTML = `${tabs}${activeTab === 'pending' ? pendingView : activeTab === 'history' ? historyView : activeView}`;
}
async function load() { try { const params = new URLSearchParams({ pnlWindow: String(pnlWindow) }); if (pnlWindow === -1 && pnlRange?.start && pnlRange?.end) { params.set('pnlStart', String(pnlRange.start)); params.set('pnlEnd', String(pnlRange.end)); } const response = await fetch(`/api/overview?${params}`); const data = await response.json(); if (data.error) throw new Error(data.error); render(data); } catch (error) { $('#hint').textContent = `Не удалось получить данные: ${error.message}`; } }
$('#refresh').onclick = load;
document.addEventListener('change', (event) => {
  if (event.target.matches('.pnl-window')) {
    pnlWindow = Number(event.target.value);
    if (pnlWindow === -1 && !pnlRange) {
      const now = Date.now();
      pnlRange = { start: now - 24 * 60 * 60 * 1000, end: now };
    }
    localStorage.setItem(pnlWindowKey, String(pnlWindow));
    localStorage.setItem(pnlRangeKey, JSON.stringify(pnlRange));
    load();
    return;
  }
  if (event.target.matches('.pnl-start, .pnl-end')) {
    const start = new Date($('.pnl-start').value).getTime();
    const end = new Date($('.pnl-end').value).getTime();
    if (start > 0 && end > start && end <= Date.now() + 60_000) {
      pnlRange = { start, end };
      localStorage.setItem(pnlRangeKey, JSON.stringify(pnlRange));
      load();
    }
    return;
  }
  if (!event.target.matches('.plan-input')) return;
  const { symbol, side, kind } = event.target.dataset;
  const value = event.target.value.trim();
  const key = `bybit-sizer:${symbol}:${side}:${kind}`;
  if (value) localStorage.setItem(key, value); else localStorage.removeItem(key);
  load();
});
document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]');
  if (!tab) return;
  activeTab = tab.dataset.tab;
  load();
});
load(); setInterval(load, 5000);
