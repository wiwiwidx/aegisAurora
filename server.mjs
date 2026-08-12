import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

const env = existsSync('.env')
  ? Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(Boolean).map((line) => line.split(/=(.*)/s).slice(0, 2)))
  : {};
const port = Number(env.PORT || 8787);
const root = join(process.cwd(), 'public');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function signedHeaders(query) {
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  const sign = createHmac('sha256', env.BYBIT_API_SECRET).update(`${timestamp}${env.BYBIT_API_KEY}${recvWindow}${query}`).digest('hex');
  return { 'X-BAPI-API-KEY': env.BYBIT_API_KEY, 'X-BAPI-TIMESTAMP': timestamp, 'X-BAPI-RECV-WINDOW': recvWindow, 'X-BAPI-SIGN': sign };
}

async function bybitResult(path, params) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`https://api.bybit.com${path}?${query}`, { headers: signedHeaders(query) });
  const payload = await response.json();
  if (payload.retCode) throw new Error(payload.retMsg || 'Bybit API error');
  return payload.result || {};
}

async function bybit(path, params) { return (await bybitResult(path, params)).list || []; }

// Public market data deliberately uses no account credentials. The chart can
// therefore be displayed even when the read-only account API is unavailable.
async function publicBybit(path, params) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`https://api.bybit.com${path}?${query}`);
  const payload = await response.json();
  if (payload.retCode) throw new Error(payload.retMsg || 'Bybit market-data error');
  return payload.result || {};
}

function number(value) { return Number(value || 0); }

function friendlyError(error) {
  const message = error?.message || 'Неизвестная ошибка';
  if (/server timestamp|recv.?window|req.?window/i.test(message)) {
    return 'Время компьютера не синхронизировано. В Windows: Date & Time → Sync now, затем перезапусти Start Server.';
  }
  return message;
}

function telegramUser(initData) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Telegram Mini App ещё не настроен на сервере');
  const params = new URLSearchParams(initData || '');
  const hash = params.get('hash');
  if (!hash) throw new Error('Открой терминал через Telegram');
  params.delete('hash');
  // Telegram requires bytewise alphabetical parameter ordering. localeCompare
  // can order underscore-containing keys differently on a Russian Windows host.
  const checkString = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(env.TELEGRAM_BOT_TOKEN).digest();
  const signature = createHmac('sha256', secret).update(checkString).digest('hex');
  if (hash.length !== signature.length || !timingSafeEqual(Buffer.from(hash), Buffer.from(signature))) throw new Error('Telegram-подпись не прошла проверку');
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > 24 * 60 * 60) throw new Error('Сессия Telegram устарела — открой Mini App заново');
  const user = JSON.parse(params.get('user') || '{}');
  if (!user.id || (env.TELEGRAM_ALLOWED_USER_ID && String(user.id) !== env.TELEGRAM_ALLOWED_USER_ID)) throw new Error('Этот Telegram-аккаунт не имеет доступа');
  return user;
}

function guardApi(request, response) {
  if (env.TELEGRAM_REQUIRE_AUTH !== '1') return true;
  // Keep the private local terminal usable on the Windows host. The public
  // Funnel request retains its ts.net Host header and must pass Telegram auth.
  const host = String(request.headers.host || '').toLowerCase().split(':')[0];
  if (host === '127.0.0.1' || host === 'localhost') return true;
  try { telegramUser(request.headers['x-telegram-init-data']); return true; }
  catch (error) {
    // Diagnostics only: never log initData, bot tokens, Bybit keys or signatures.
    console.log(`Telegram API denied: host=${request.headers.host || 'unknown'} reason=${friendlyError(error)}`);
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: friendlyError(error) }));
    return false;
  }
}

function entryPrice(order) {
  return number(order.avgPrice) || number(order.price);
}

function entryQty(order) {
  return number(order.cumExecQty) || number(order.qty);
}

function entryTime(order) {
  return number(order.createdTime) || number(order.execTime) || number(order.updatedTime);
}

function isEntryOrder(order, side) {
  return !order.reduceOnly && order.orderType === 'Limit' && order.side === side;
}

function calculate(orders, position) {
  const entries = orders.map((order) => {
    const price = entryPrice(order);
    const qty = entryQty(order);
    return { price, qty, value: price * qty, status: order.orderStatus === 'Filled' ? 'filled' : 'open', time: entryTime(order) };
  }).filter((entry) => entry.price > 0 && entry.qty > 0);
  const total = entries.reduce((sum, item) => sum + item.value, 0);
  const side = orders[0]?.side || position?.side || 'Sell';
  const stop = number(position?.stopLoss);
  const take = number(position?.takeProfit);
  const scenarios = entries.map((_, index) => {
    const slice = entries.slice(0, index + 1);
    const qty = slice.reduce((sum, item) => sum + item.qty, 0);
    const value = slice.reduce((sum, item) => sum + item.value, 0);
    const avg = qty ? value / qty : 0;
    const signed = side === 'Buy' ? 1 : -1;
    return {
      filled: index + 1, qty, value, averageEntry: avg,
      lossAtStop: stop ? (stop - avg) * qty * signed : null,
      profitAtTake: take ? (take - avg) * qty * signed : null
    };
  });
  const totalQty = entries.reduce((sum, item) => sum + item.qty, 0);
  const totalAverageEntry = totalQty ? total / totalQty : 0;
  const signed = side === 'Buy' ? 1 : -1;
  const fullRiskAtStop = stop && totalQty ? (stop - totalAverageEntry) * totalQty * signed : null;
  const filledTimes = entries.filter((item) => item.status === 'filled' && item.time > 0).map((item) => item.time);
  const openedAt = filledTimes.length ? Math.min(...filledTimes) : null;
  return { side, stop, take, fullRiskAtStop, openedAt, entries: entries.map((item) => ({ ...item, ratio: total ? item.value / total : 0 })), scenarios, position: position ? { size: number(position.size), entryPrice: number(position.avgPrice), unrealisedPnl: number(position.unrealisedPnl) } : null };
}

function dealFromOrders(symbol, side, orders, position) {
  const entries = orders
    .filter((item) => isEntryOrder(item, side))
    .sort((a, b) => side === 'Buy' ? entryPrice(b) - entryPrice(a) : entryPrice(a) - entryPrice(b));
  return { symbol, updatedAt: new Date().toISOString(), ...calculate(entries, position) };
}

function filledOrdersFromExecutions(executions, symbol, side) {
  const byOrderId = new Map();
  for (const execution of executions) {
    // Execution records for scaled orders do not always carry orderType.
    // Side is sufficient here: for an open position, fills on that same side
    // are entries; closing TP/SL fills use the opposite side.
    if (execution.symbol !== symbol || execution.side !== side || !execution.orderId) continue;
    const qty = number(execution.execQty);
    const price = number(execution.execPrice);
    if (!qty || !price) continue;
    const order = byOrderId.get(execution.orderId) || {
      orderId: execution.orderId,
      symbol,
      side,
      orderType: 'Limit',
      reduceOnly: false,
      orderStatus: 'Filled',
      qty: '0',
      cumExecQty: '0',
      avgPrice: '0',
      createdTime: execution.execTime,
      updatedTime: execution.execTime,
      _qty: 0,
      _value: 0
    };
    order._qty += qty;
    order._value += qty * price;
    order.qty = String(order._qty);
    order.cumExecQty = String(order._qty);
    order.avgPrice = String(order._value / order._qty);
    order.updatedTime = String(Math.max(number(order.updatedTime), number(execution.execTime)));
    byOrderId.set(execution.orderId, order);
  }
  return [...byOrderId.values()];
}

function filledForCurrentPosition(completed, position) {
  const positionQty = number(position?.size);
  if (!positionQty) return [];
  const selected = [];
  let collectedQty = 0;
  for (const item of [...completed].sort((a, b) =>
    (number(b.updatedTime) || number(b.createdTime)) - (number(a.updatedTime) || number(a.createdTime))
  )) {
    if (collectedQty >= positionQty * 0.999) break;
    selected.push(item);
    collectedQty += entryQty(item);
  }
  return selected;
}

function isFilledEntryOrder(item, side) {
  // Bybit's historical endpoint does not reliably include `orderType` for
  // older fills. A filled order on the position's opening side is an entry;
  // TP / SL fills are on the opposite side and reduce-only orders are never
  // part of the entry grid.
  return item.orderStatus === 'Filled'
    && item.side === side
    && !item.reduceOnly;
}

function gridHistory(openOrders, history, executions, symbol, side, position) {
  const current = openOrders.filter((item) => item.symbol === symbol && isEntryOrder(item, side));
  const historical = history.filter((item) => item.symbol === symbol && isFilledEntryOrder(item, side));
  // Order history can omit older fills; executions are the authoritative fill log.
  const completed = [...new Map([
    ...historical.map((item) => [item.orderId, item]),
    ...filledOrdersFromExecutions(executions, symbol, side).map((item) => [item.orderId, item])
  ]).values()];
  // A scale grid can fill over many minutes or hours. Pick recent entry fills
  // until their quantity reaches the current position, rather than using a
  // short timestamp window that drops earlier legs.
  const filled = filledForCurrentPosition(completed, position);
  if (!current.length) return filled;
  return [...current, ...filled].filter((item, index, all) =>
    all.findIndex((candidate) => candidate.orderId === item.orderId) === index
  );
}

function accountSummary(wallet, closedPnl = []) {
  const account = wallet?.list?.[0] || {};
  return {
    equity: number(account.totalEquity),
    usedMargin: account.totalInitialMargin === '' || account.totalInitialMargin == null ? null : number(account.totalInitialMargin),
    // Closed PnL is the realised result. Unrealised PnL stays in each deal card.
    pnl24h: closedPnl.reduce((sum, item) => sum + number(item.closedPnl), 0)
  };
}

const closedPnlCache = new Map();
let instrumentsCache = null;

async function perpetualInstruments() {
  if (instrumentsCache && Date.now() - instrumentsCache.at < 60 * 60 * 1000) return instrumentsCache.items;
  const result = await publicBybit('/v5/market/instruments-info', { category: 'linear', limit: '1000' });
  const items = (result.list || [])
    .filter((item) => item.status === 'Trading' && item.contractType === 'LinearPerpetual' && item.quoteCoin === 'USDT')
    .map((item) => ({ symbol: item.symbol, baseCoin: item.baseCoin }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  instrumentsCache = { at: Date.now(), items };
  return items;
}

async function closedPnlForPeriod(hours, end = Date.now(), explicitStart = null) {
  const start = explicitStart || end - hours * 60 * 60 * 1000;
  const key = explicitStart ? `${start}:${end}` : `${hours}:${Math.floor(end / 60_000)}`;
  const cached = closedPnlCache.get(key);
  if (cached && Date.now() - cached.at < 60_000) return cached.items;
  const maxRange = 7 * 24 * 60 * 60 * 1000;
  const requests = [];
  for (let from = start; from < end; from += maxRange) {
    requests.push(bybit('/v5/position/closed-pnl', {
      category: 'linear',
      startTime: String(from),
      endTime: String(Math.min(from + maxRange, end)),
      limit: '100'
    }));
  }
  const items = (await Promise.all(requests)).flat();
  closedPnlCache.set(key, { at: Date.now(), items });
  return items;
}

async function snapshot(symbol) {
  if (!env.BYBIT_API_KEY || !env.BYBIT_API_SECRET) return demoSnapshot(symbol);
  const [orders, positions, history, executions] = await Promise.all([
    bybit('/v5/order/realtime', { category: 'linear', symbol }),
    bybit('/v5/position/list', { category: 'linear', symbol }),
    bybit('/v5/order/history', { category: 'linear', symbol, limit: '50' }),
    bybit('/v5/execution/list', { category: 'linear', symbol, limit: '100' })
  ]);
  const position = positions.find((item) => number(item.size) > 0) || positions[0];
  const direction = position?.side || orders.find((item) => !item.reduceOnly)?.side;
  return { symbol, live: true, ...dealFromOrders(symbol, direction, gridHistory(orders, history, executions, symbol, direction, position), position) };
}

function demoSnapshot(symbol = 'ETHUSDT') {
  const orders = [
    { side: 'Sell', price: '3750', qty: '0.08' },
    { side: 'Sell', price: '3800', qty: '0.16' },
    { side: 'Sell', price: '3850', qty: '0.24' }
  ];
  return { symbol, live: false, updatedAt: new Date().toISOString(), ...calculate(orders, { side: 'Sell', stopLoss: '3900', takeProfit: '3600', size: '0', avgPrice: '0', unrealisedPnl: '0' }) };
}

async function overview(pnlHours = 24, pnlStart = null, pnlEnd = null) {
  if (!env.BYBIT_API_KEY || !env.BYBIT_API_SECRET) {
    const demo = demoSnapshot();
    return {
      live: false,
      updatedAt: demo.updatedAt,
      account: { equity: 10234.52, usedMargin: 1510.77, pnl24h: 42.8 },
      deals: [demo]
    };
  }

  const [orders, positions, wallet, closedPnl, historyPnl] = await Promise.all([
    bybit('/v5/order/realtime', { category: 'linear', settleCoin: 'USDT' }),
    bybit('/v5/position/list', { category: 'linear', settleCoin: 'USDT' }),
    bybitResult('/v5/account/wallet-balance', { accountType: 'UNIFIED' }),
    closedPnlForPeriod(pnlHours, pnlEnd || Date.now(), pnlStart),
    closedPnlForPeriod(24 * 90)
  ]);
  const activeGroups = new Map();
  const pendingGroups = new Map();
  const add = (symbol, side) => {
    if (symbol && side) activeGroups.set(`${symbol}:${side}`, { symbol, side });
  };
  positions.filter((item) => number(item.size) > 0).forEach((item) => add(item.symbol, item.side));
  orders.filter((item) => !item.reduceOnly && item.orderType === 'Limit').forEach((item) => {
    const key = `${item.symbol}:${item.side}`;
    if (!activeGroups.has(key)) pendingGroups.set(key, { symbol: item.symbol, side: item.side });
  });
  const deals = await Promise.all([...activeGroups.values()].map(async ({ symbol, side }) => {
    const position = positions.find((item) => item.symbol === symbol && item.side === side && number(item.size) > 0)
      || positions.find((item) => item.symbol === symbol && item.side === side);
    // Request a symbol-specific log: a global 50/100-row feed can omit older
    // fills from another active grid, which made BZUSDT appear as one entry.
    const [history, executions] = await Promise.all([
      bybit('/v5/order/history', { category: 'linear', symbol, limit: '100' }),
      bybit('/v5/execution/list', { category: 'linear', symbol, limit: '100' })
    ]);
    const gridOrders = gridHistory(orders, history, executions, symbol, side, position);
    return dealFromOrders(symbol, side, gridOrders, position);
  }));
  const pendingDeals = [...pendingGroups.values()].map(({ symbol, side }) =>
    dealFromOrders(symbol, side, orders.filter((item) => item.symbol === symbol && isEntryOrder(item, side)), null)
  );
  const history = historyPnl.map((item) => ({
    id: item.orderId || `${item.symbol}:${item.updatedTime}`,
    symbol: item.symbol,
    side: item.side,
    pnl: number(item.closedPnl),
    qty: number(item.qty),
    entry: number(item.avgEntryPrice),
    exit: number(item.avgExitPrice),
    closedAt: number(item.updatedTime) || number(item.createdTime)
  })).sort((a, b) => b.closedAt - a.closedAt);
  return { live: true, updatedAt: new Date().toISOString(), account: accountSummary(wallet, closedPnl), deals, pendingDeals, history };
}

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.headers.host && !url.pathname.startsWith('/api/')) console.log(`Web request: host=${request.headers.host} path=${url.pathname}`);
  if (url.pathname === '/api/overview') {
    if (!guardApi(request, response)) return;
    try {
      const requestedHours = Number(url.searchParams.get('pnlWindow'));
      const requestedStart = Number(url.searchParams.get('pnlStart'));
      const requestedEnd = Number(url.searchParams.get('pnlEnd'));
      const hasCustomRange = requestedStart > 0 && requestedEnd > requestedStart && requestedEnd <= Date.now() + 60_000;
      const pnlHours = hasCustomRange
        ? Math.ceil((requestedEnd - requestedStart) / (60 * 60 * 1000))
        : ([24, 24 * 7, 24 * 30].includes(requestedHours) ? requestedHours : 24);
      const data = await overview(pnlHours, hasCustomRange ? requestedStart : null, hasCustomRange ? requestedEnd : null);
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(data));
    } catch (error) {
      response.writeHead(502, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: friendlyError(error) }));
    }
    return;
  }
  if (url.pathname === '/api/snapshot') {
    if (!guardApi(request, response)) return;
    try {
      const symbol = (url.searchParams.get('symbol') || env.BYBIT_SYMBOL || 'ETHUSDT').toUpperCase();
      const data = await snapshot(symbol);
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(data));
    } catch (error) {
      response.writeHead(502, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: friendlyError(error) }));
    }
    return;
  }
  if (url.pathname === '/api/candles') {
    if (!guardApi(request, response)) return;
    try {
      const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
      const interval = url.searchParams.get('interval') || '60';
      if (!/^[A-Z0-9]{3,20}$/.test(symbol) || !/^(1|3|5|15|30|60|120|240|360|720|D|W|M)$/.test(interval)) {
        throw new Error('Некорректный тикер или таймфрейм');
      }
      const data = await publicBybit('/v5/market/kline', { category: 'linear', symbol, interval, limit: '160' });
      const candles = (data.list || []).map(([time, open, high, low, close, volume]) => ({
        time: number(time), open: number(open), high: number(high), low: number(low), close: number(close), volume: number(volume)
      })).reverse();
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ symbol, interval, candles }));
    } catch (error) {
      response.writeHead(502, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: friendlyError(error) }));
    }
    return;
  }
  if (url.pathname === '/api/instruments') {
    if (!guardApi(request, response)) return;
    try {
      const items = await perpetualInstruments();
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' });
      response.end(JSON.stringify({ items }));
    } catch (error) {
      response.writeHead(502, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: friendlyError(error) }));
    }
    return;
  }
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const path = join(root, file);
  if (!path.startsWith(root) || !existsSync(path)) { response.writeHead(404); response.end('Not found'); return; }
  // Telegram WebView can retain an old JS bundle for the same Mini App URL.
  // The terminal is live, so always serve fresh HTML/CSS/JS after an update.
  response.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store, max-age=0' });
  createReadStream(path).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`Sizer running at http://127.0.0.1:${port}`));
