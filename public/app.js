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
let lastData = null;
const gridKey = 'bybit-sizer:grid-plan';
const defaultGridPlan = { symbol: 'BTCUSDT', side: 'Sell', low: '', high: '', value: '100', orders: '5', stop: '', take: '', priceShape: 'equal', valueShape: 'ascending' };
let gridPlan = { ...defaultGridPlan, ...JSON.parse(localStorage.getItem(gridKey) || '{}') };
let chartInterval = '60';
let chartTarget = 'low';
let chartRequest = 0;
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

function makeGrid(plan) {
  const low = parsePrice(plan.low), high = parsePrice(plan.high), total = parsePrice(plan.value);
  const stop = parsePrice(plan.stop), take = parsePrice(plan.take);
  const count = Math.max(2, Math.min(20, Math.floor(Number(plan.orders) || 0)));
  if (!low || !high || !total || low >= high) return { rows: [], total, stop, take };
  const position = (index) => {
    const t = index / (count - 1);
    return plan.priceShape === 'ascending' ? t * t : plan.priceShape === 'descending' ? 1 - (1 - t) * (1 - t) : t;
  };
  const raw = Array.from({ length: count }, (_, index) => plan.valueShape === 'ascending' ? index + 1 : plan.valueShape === 'descending' ? count - index : 1);
  const sum = raw.reduce((a, b) => a + b, 0);
  const rows = raw.map((weight, index) => {
    const entry = low + (high - low) * position(index);
    const value = total * weight / sum;
    return { index: index + 1, entry, value, qty: value / entry };
  });
  const qty = rows.reduce((sum, row) => sum + row.qty, 0);
  const average = total / qty, signed = plan.side === 'Buy' ? 1 : -1;
  const risk = stop ? (stop - average) * qty * signed : null;
  const profit = take ? (take - average) * qty * signed : null;
  return { rows, total, stop, take, qty, average, risk, profit, rr: risk < 0 && profit != null ? profit / Math.abs(risk) : null };
}

function plannerView() {
  const grid = makeGrid(gridPlan);
  const input = (key, label, type = 'text') => `<label><span>${label}</span><input data-grid="${key}" class="plan-input" type="${type}" inputmode="decimal" value="${gridPlan[key]}"></label>`;
  const select = (key, label, values) => `<label><span>${label}</span><select data-grid="${key}" class="plan-input">${values.map(([value, title]) => `<option value="${value}"${gridPlan[key] === value ? ' selected' : ''}>${title}</option>`).join('')}</select></label>`;
  const rows = grid.rows.length ? grid.rows.map((row) => `<tr><td>${row.index}</td><td>${price(row.entry)}</td><td>${usd(row.value)}</td><td>${quantity(row.qty)}</td><td>${money(row.value / grid.total * 100)}%</td></tr>`).join('') : '<tr><td colspan="5">Задай диапазон, стоимость и количество ордеров</td></tr>';
  const chartTools = [['low', 'Нижняя граница'], ['high', 'Верхняя граница'], ['stop', 'SL'], ['take', 'TP']]
    .map(([key, label]) => `<button class="chart-tool ${chartTarget === key ? 'active' : ''}" data-chart-target="${key}">${label}</button>`).join('');
  return `<section class="grid-planner"><div class="planner-head"><div><p class="eyebrow">ПЛАН · ТОЛЬКО РАСЧЁТ</p><h2>Масштабируемый ордер</h2></div><span>Ничего не отправляется на Bybit</span></div><div class="chart-workspace"><section class="chart-panel"><div class="chart-toolbar"><b>${gridPlan.symbol || 'BTCUSDT'}</b><div class="timeframes">${[['5','5m'],['15','15m'],['60','1h'],['240','4h'],['D','1D']].map(([value,label]) => `<button data-interval="${value}" class="${chartInterval === value ? 'active' : ''}">${label}</button>`).join('')}</div></div><div class="chart-tools"><span>Кликни по графику:</span>${chartTools}</div><div id="trade-chart" class="trade-chart"><span>Загрузка графика…</span></div></section><section class="levels-form grid-form"><div class="form-title">Параметры сетки</div>${input('symbol', 'Тикер')}${select('side', 'Направление', [['Sell', 'SHORT'], ['Buy', 'LONG']])}${input('low', 'Нижняя цена')}${input('high', 'Верхняя цена')}${input('value', 'Стоимость, USDT')}${input('orders', 'Количество ордеров', 'number')}${select('priceShape', 'Price', [['equal', 'Ровная'], ['ascending', 'Восходящая'], ['descending', 'Нисходящая']])}${select('valueShape', 'Value', [['equal', 'Ровный'], ['ascending', 'Восходящий'], ['descending', 'Нисходящий']])}${input('stop', 'Stop Loss')}${input('take', 'Take Profit')}</section></div><section class="grid-result"><div><span>Объём</span><b>${usd(grid.total)}</b></div><div><span>AVG entry</span><b>${price(grid.average)}</b></div><div><span>Full Risk</span><b class="loss">${signedUsd(grid.risk)}</b></div><div><span>Full TP</span><b class="profit">${signedUsd(grid.profit)}</b></div><div><span>Full RR</span><b>${grid.rr != null ? `${money(grid.rr)}R` : '—'}</b></div><div><span>Qty</span><b>${quantity(grid.qty)}</b></div></section><section class="table-block"><h3>Предпросмотр сетки · ${gridPlan.symbol || 'тикер'}</h3><table><thead><tr><th>Order</th><th>Entry</th><th>Value</th><th>Qty</th><th>Доля</th></tr></thead><tbody>${rows}</tbody></table></section></section>`;
}

function chartSvg(candles) {
  const width = 1000, height = 430, pad = { top: 20, right: 72, bottom: 24, left: 10 };
  const all = candles.flatMap((candle) => [candle.high, candle.low]);
  [gridPlan.low, gridPlan.high, gridPlan.stop, gridPlan.take].map(parsePrice).filter(Boolean).forEach((value) => all.push(value));
  const min = Math.min(...all), max = Math.max(...all), range = Math.max(max - min, max * 0.002);
  const y = (value) => pad.top + (max - value) / range * (height - pad.top - pad.bottom);
  const x = (index) => pad.left + (index + .5) * (width - pad.left - pad.right) / candles.length;
  const step = (width - pad.left - pad.right) / candles.length, bodyWidth = Math.max(1, step * .62);
  const candlesSvg = candles.map((candle, index) => {
    const up = candle.close >= candle.open, color = up ? '#44d19b' : '#ff7586';
    const top = y(Math.max(candle.open, candle.close)), bottom = y(Math.min(candle.open, candle.close));
    return `<line x1="${x(index)}" x2="${x(index)}" y1="${y(candle.high)}" y2="${y(candle.low)}" stroke="${color}"/><rect x="${x(index)-bodyWidth/2}" y="${top}" width="${bodyWidth}" height="${Math.max(1,bottom-top)}" fill="${color}"/>`;
  }).join('');
  const grid = makeGrid(gridPlan);
  const line = (value, label, color, dash = '') => value ? `<g><line x1="${pad.left}" x2="${width-pad.right}" y1="${y(value)}" y2="${y(value)}" stroke="${color}" stroke-width="1.5" ${dash ? `stroke-dasharray="${dash}"` : ''}/><text x="${width-pad.right+5}" y="${y(value)+4}" fill="${color}" font-size="12">${label} ${price(value)}</text></g>` : '';
  const orders = grid.rows.map((row, index) => line(row.entry, `#${index + 1}`, '#f6c24c', '5 4')).join('');
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="График цены">${candlesSvg}${orders}${line(parsePrice(gridPlan.low),'LOW','#7fb3ff')}${line(parsePrice(gridPlan.high),'HIGH','#7fb3ff')}${line(parsePrice(gridPlan.stop),'SL','#ff7586')}${line(parsePrice(gridPlan.take),'TP','#44d19b')}<rect class="chart-hit" data-chart-min="${min}" data-chart-max="${max}" x="${pad.left}" y="${pad.top}" width="${width-pad.left-pad.right}" height="${height-pad.top-pad.bottom}" fill="transparent"/></svg>`;
}

async function loadChart() {
  const holder = $('#trade-chart');
  if (!holder) return;
  const request = ++chartRequest;
  const symbol = (gridPlan.symbol || 'BTCUSDT').toUpperCase();
  holder.innerHTML = '<span>Загрузка графика…</span>';
  try {
    const response = await fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${chartInterval}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    if (request !== chartRequest || !$('#trade-chart')) return;
    holder.innerHTML = chartSvg(data.candles);
  } catch (error) { holder.innerHTML = `<span>Не удалось загрузить график: ${error.message}</span>`; }
}

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
  lastData = data;
  const expandedDeals = new Set([...document.querySelectorAll('.trade[open]')].map((item) => item.dataset.deal));
  $('#mode').textContent = data.live ? 'LIVE' : 'ДЕМО';
  $('#mode').className = data.live ? 'live' : '';
  const pendingDeals = data.pendingDeals || [];
  const history = data.history || [];
  $('#hint').textContent = activeTab === 'active' ? `Сделки (${data.deals.length})` : activeTab === 'pending' ? `Ожидающие лимитки (${pendingDeals.length})` : activeTab === 'history' ? `История сделок (${history.length})` : 'Конструктор новой сетки';
  const pnl24h = data.account.pnl24h;
  const custom = pnlWindow === -1;
  $('#account').innerHTML = `<span>Общий баланс <b>${usd(data.account.equity)}</b></span><span>Используется в сделках <b>${usd(data.account.usedMargin)}</b></span><span class="account-pnl">PnL за <select class="pnl-window" aria-label="Период PnL"><option value="24"${pnlWindow === 24 ? ' selected' : ''}>24ч</option><option value="168"${pnlWindow === 168 ? ' selected' : ''}>7д</option><option value="720"${pnlWindow === 720 ? ' selected' : ''}>30д</option><option value="-1"${custom ? ' selected' : ''}>свой период</option></select>${custom ? ` <label class="pnl-range">с <input class="pnl-start" type="datetime-local" value="${toLocalInput(pnlRange?.start)}"> по <input class="pnl-end" type="datetime-local" value="${toLocalInput(pnlRange?.end)}"></label>` : ''} <b class="${pnl24h >= 0 ? 'profit' : 'loss'}">${signedUsd(pnl24h)}</b></span>`;
  const tabs = `<nav class="workspace-tabs"><button data-tab="planner" class="${activeTab === 'planner' ? 'active' : ''}">Новая сетка</button><button data-tab="pending" class="${activeTab === 'pending' ? 'active' : ''}">Ожидающие лимитки <b>${pendingDeals.length}</b></button><button data-tab="active" class="${activeTab === 'active' ? 'active' : ''}">Сделки <b>${data.deals.length}</b></button><button data-tab="history" class="${activeTab === 'history' ? 'active' : ''}">История сделок <b>${history.length}</b></button></nav>`;
  const activeView = data.deals.length ? data.deals.map((deal) => dealCard(deal, expandedDeals)).join('') : '<section class="empty">Нет активных сделок</section>';
  const pendingView = pendingDeals.length ? pendingDeals.map((deal) => dealCard(deal, expandedDeals)).join('') : '<section class="empty">Нет ожидающих лимиток</section>';
  const historyView = history.length ? `<section class="history-table"><table><thead><tr><th>Инструмент</th><th>Направление</th><th>Вход</th><th>Выход</th><th>Qty</th><th>PnL</th><th>Закрыта</th></tr></thead><tbody>${history.map((item) => `<tr><td>${item.symbol}</td><td>${item.side === 'Buy' ? 'LONG' : 'SHORT'}</td><td>${price(item.entry)}</td><td>${price(item.exit)}</td><td>${quantity(item.qty)}</td><td class="${item.pnl >= 0 ? 'profit' : 'loss'}">${signedUsd(item.pnl)}</td><td>${dateTime(item.closedAt)}</td></tr>`).join('')}</tbody></table></section>` : '<section class="empty">Закрытых сделок пока нет</section>';
  $('#app').innerHTML = `${tabs}${activeTab === 'planner' ? plannerView() : activeTab === 'pending' ? pendingView : activeTab === 'history' ? historyView : activeView}`;
  if (activeTab === 'planner') loadChart();
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
  if (event.target.matches('[data-grid]')) {
    gridPlan[event.target.dataset.grid] = event.target.value;
    localStorage.setItem(gridKey, JSON.stringify(gridPlan));
    if (lastData) render(lastData);
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
  const interval = event.target.closest('[data-interval]');
  if (interval) { chartInterval = interval.dataset.interval; if (lastData) render(lastData); return; }
  const target = event.target.closest('[data-chart-target]');
  if (target) { chartTarget = target.dataset.chartTarget; if (lastData) render(lastData); return; }
  const hit = event.target.closest('.chart-hit');
  if (hit) {
    const rect = hit.ownerSVGElement.getBoundingClientRect();
    const max = Number(hit.dataset.chartMax), min = Number(hit.dataset.chartMin);
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    gridPlan[chartTarget] = String(max - y * (max - min));
    localStorage.setItem(gridKey, JSON.stringify(gridPlan));
    if (lastData) render(lastData);
    return;
  }
  const tab = event.target.closest('[data-tab]');
  if (!tab) return;
  activeTab = tab.dataset.tab;
  load();
});
document.addEventListener('input', (event) => {
  if (!event.target.matches('[data-grid]')) return;
  gridPlan[event.target.dataset.grid] = event.target.value;
  localStorage.setItem(gridKey, JSON.stringify(gridPlan));
  if (lastData) render(lastData);
});
load(); setInterval(load, 5000);
