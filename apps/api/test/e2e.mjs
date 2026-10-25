// End-to-end smoke test against a running API (npm run dev, then npm run test:e2e).
// Walks the main customer and staff flows and asserts on real responses.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const BASE = process.env.API_URL ?? 'http://localhost:4000/api/v1';
let passed = 0;

function client() {
  const jar = new Map();
  let token = null;
  async function call(method, path, body, headers = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (v) jar.set(k, v);
      else jar.delete(k);
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  }
  return { call, setToken: (t) => (token = t) };
}

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}\n       ${e.message}`);
    process.exitCode = 1;
  }
}

async function login(c, phone) {
  const req = await c.call('POST', '/auth/otp/request', { phone });
  assert.equal(req.status, 200, JSON.stringify(req.body));
  const ver = await c.call('POST', '/auth/otp/verify', { phone, code: req.body.devCode });
  assert.equal(ver.status, 200, JSON.stringify(ver.body));
  c.setToken(ver.body.accessToken);
  return ver.body.user;
}

const guest = client();
const customer = client();
const kitchen = client();
const manager = client();
let menu, orderId, orderToken, paymentId;

console.log(`E2E against ${BASE}`);

await step('menu lists categories with at most 12 items each', async () => {
  const r = await guest.call('GET', '/menu?branchId=br_siam');
  assert.equal(r.status, 200);
  menu = r.body;
  assert.ok(menu.categories.length >= 5);
  for (const c of menu.categories) assert.ok(c.items.length <= 12);
});

await step('item detail exposes option groups, calories and allergens', async () => {
  const r = await guest.call('GET', '/menu/items/classic-smash?branchId=br_siam');
  assert.equal(r.status, 200);
  assert.ok(r.body.optionGroups.length > 0);
  assert.ok(r.body.calories > 0);
  assert.ok(Array.isArray(r.body.allergens));
});

await step('guest cart: required options are enforced server side', async () => {
  const r = await guest.call('POST', '/carts/me/items', { menuItemId: 'mi_classic_smash', qty: 1, optionIds: [] });
  assert.equal(r.status, 201);
  assert.equal(r.body.issues[0]?.code, 'OPTION_INVALID');
  await guest.call('DELETE', '/carts/me');
});

await step('server ignores client prices and recomputes totals', async () => {
  const item = (await guest.call('GET', '/menu/items/classic-smash')).body;
  const medium = item.optionGroups.find((g) => g.name === 'ระดับความสุก').options[0].id;
  const cheese = item.optionGroups.find((g) => g.name === 'เพิ่มท็อปปิ้ง').options.find((o) => o.name === 'เพิ่มชีส').id;
  const r = await guest.call('POST', '/carts/me/items', { menuItemId: item.id, qty: 2, optionIds: [medium, cheese], priceSatang: 1 });
  assert.equal(r.status, 201);
  assert.equal(r.body.subtotalSatang, (item.priceSatang + 2000) * 2);
});

await step('within-basket recommendation suggests one missing meal part', async () => {
  const r = await guest.call('GET', '/recommendations?context=cart');
  assert.equal(r.status, 200);
  assert.equal(r.body.suggestion?.reasonCode, 'COMPLETE_MEAL_SIDE');
});

await step('promo code validation and discount', async () => {
  const bad = await guest.call('POST', '/carts/me/promo', { code: 'NOPE' });
  assert.equal(bad.body.promo.valid, false);
  const good = await guest.call('POST', '/carts/me/promo', { code: 'GRILL10' });
  assert.equal(good.body.promo.valid, true);
  assert.ok(good.body.discountSatang > 0);
});

await step('delivery requires sign-in; pickup quote returns kitchen-load ETA', async () => {
  const q = await guest.call('POST', '/carts/me/quote', { fulfillment: { type: 'PICKUP' } });
  assert.equal(q.status, 200);
  assert.ok(q.body.eta.readyAt);
  const o = await guest.call(
    'POST',
    '/orders',
    { fulfillment: { type: 'DELIVERY', lat: 13.75, lng: 100.53 }, paymentMethod: 'PROMPTPAY' },
    { 'Idempotency-Key': randomUUID() },
  );
  assert.equal(o.status, 401);
});

await step('POST /orders requires an Idempotency-Key', async () => {
  const r = await guest.call('POST', '/orders', { fulfillment: { type: 'PICKUP' }, paymentMethod: 'PROMPTPAY' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
});

await step('guest pickup order with PromptPay; same key replays the same order', async () => {
  const key = randomUUID();
  const body = { fulfillment: { type: 'PICKUP' }, paymentMethod: 'PROMPTPAY' };
  const r = await guest.call('POST', '/orders', body, { 'Idempotency-Key': key });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'PENDING_PAYMENT');
  assert.match(r.body.payment.qrPayload, /^000201010212/);
  orderId = r.body.id;
  orderToken = r.body.publicToken;
  paymentId = r.body.payment.id;
  const again = await guest.call('POST', '/orders', body, { 'Idempotency-Key': key });
  assert.equal(again.body.id, orderId);
  assert.equal(again.headers.get('idempotent-replayed'), 'true');
});

await step('webhook with a bad signature is rejected', async () => {
  const r = await guest.call(
    'POST',
    '/webhooks/payments/mockpay',
    { eventId: 'x', type: 'payment.succeeded', paymentId, amountSatang: 1 },
    { 'x-mockpay-signature': 'sha256=deadbeef' },
  );
  assert.equal(r.status, 401);
});

await step('signed webhook settles payment; order becomes PAID', async () => {
  const r = await guest.call('POST', `/dev/payments/${paymentId}/simulate`, { outcome: 'succeeded' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.webhookStatus, 200);
  const o = await guest.call('GET', `/orders/${orderId}?t=${orderToken}`);
  assert.equal(o.body.status, 'PAID');
  const replay = await guest.call('POST', `/dev/payments/${paymentId}/simulate`, { outcome: 'succeeded' });
  assert.equal(replay.body.webhookResponse.duplicate, true);
});

await step('order is hidden without its token', async () => {
  const r = await client().call('GET', `/orders/${orderId}`);
  assert.equal(r.status, 404);
});

await step('kitchen moves the order through the state machine', async () => {
  const me = await login(kitchen, '0800000004');
  assert.equal(me.role, 'KITCHEN');
  const q = await kitchen.call('GET', '/admin/kitchen/queue?branchId=br_siam');
  assert.ok(q.body.data.some((o) => o.id === orderId));
  for (const status of ['ACCEPTED', 'PREPARING', 'READY']) {
    const r = await kitchen.call('PATCH', `/admin/orders/${orderId}/status`, { status });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const skip = await kitchen.call('PATCH', `/admin/orders/${orderId}/status`, { status: 'COMPLETED' });
  assert.equal(skip.status, 403, 'kitchen cannot hand over orders');
});

await step('kitchen role cannot read sales reports', async () => {
  const r = await kitchen.call('GET', '/admin/reports/sales?branchId=br_siam');
  assert.equal(r.status, 403);
});

await step('customer: login adopts guest cart, delivery order, loyalty on completion', async () => {
  await customer.call('POST', '/carts/me/items', { menuItemId: 'mi_orange_juice', qty: 1 });
  await login(customer, '0811111111');
  const cart = await customer.call('GET', '/carts/me');
  assert.ok(
    cart.body.lines.some((l) => l.menuItemId === 'mi_orange_juice'),
    'guest cart kept after login',
  );
  const addresses = await customer.call('GET', '/me/addresses');
  const before = (await customer.call('GET', '/loyalty/me')).body.balance;
  await customer.call('POST', '/carts/me/items', { menuItemId: 'mi_fries_party', qty: 2 });
  const o = await customer.call(
    'POST',
    '/orders',
    { fulfillment: { type: 'DELIVERY', addressId: addresses.body.data[0].id }, paymentMethod: 'CARD' },
    { 'Idempotency-Key': randomUUID() },
  );
  assert.equal(o.status, 201, JSON.stringify(o.body));
  assert.ok(o.body.totals.deliverySatang > 0);
  assert.ok(o.body.payment.redirectUrl);
  await customer.call('POST', `/dev/payments/${o.body.payment.id}/simulate`, {});
  await login(manager, '0800000002');
  for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']) {
    const r = await manager.call('PATCH', `/admin/orders/${o.body.id}/status`, { status });
    assert.equal(r.status, 200, `${status}: ${JSON.stringify(r.body)}`);
  }
  const after = (await customer.call('GET', '/loyalty/me')).body.balance;
  assert.ok(after > before, `crowns ${before} -> ${after}`);
});

await step('BOM stock: selling the last wagyu switches the item off automatically', async () => {
  const levels = await manager.call('GET', '/admin/ingredients?branchId=br_siam');
  const wagyu = levels.body.data.find((i) => i.id === 'ing_wagyu_patty');
  await manager.call('POST', '/admin/stock-movements', {
    branchId: 'br_siam',
    ingredientId: 'ing_wagyu_patty',
    reason: 'ADJUST',
    quantity: 1,
  });
  const item = (await customer.call('GET', '/menu/items/mi_charcoal_wagyu')).body;
  const opt = item.optionGroups[0].options[0].id;
  await customer.call('DELETE', '/carts/me');
  await customer.call('POST', '/carts/me/items', { menuItemId: 'mi_charcoal_wagyu', qty: 1, optionIds: [opt] });
  const o = await customer.call(
    'POST',
    '/orders',
    { fulfillment: { type: 'PICKUP' }, paymentMethod: 'PROMPTPAY' },
    { 'Idempotency-Key': randomUUID() },
  );
  assert.equal(o.status, 201, JSON.stringify(o.body));
  await customer.call('POST', `/dev/payments/${o.body.payment.id}/simulate`, {});
  const m = await guest.call('GET', '/menu?branchId=br_siam');
  const card = m.body.categories.flatMap((c) => c.items).find((i) => i.id === 'mi_charcoal_wagyu');
  assert.equal(card.isAvailable, false);
  await manager.call('POST', '/admin/stock-movements', {
    branchId: 'br_siam',
    ingredientId: 'ing_wagyu_patty',
    reason: 'RECEIVE',
    quantity: wagyu.quantity + 5,
  });
  const back = await guest.call('GET', '/menu?branchId=br_siam');
  assert.equal(back.body.categories.flatMap((c) => c.items).find((i) => i.id === 'mi_charcoal_wagyu').isAvailable, true);
});

await step('customer cancel after payment refunds automatically', async () => {
  await customer.call('POST', '/carts/me/items', {
    menuItemId: 'mi_shake_cookie',
    qty: 1,
    optionIds: [(await customer.call('GET', '/menu/items/mi_shake_cookie')).body.optionGroups[0].options[0].id],
  });
  const o = await customer.call(
    'POST',
    '/orders',
    { fulfillment: { type: 'PICKUP' }, paymentMethod: 'PROMPTPAY' },
    { 'Idempotency-Key': randomUUID() },
  );
  await customer.call('POST', `/dev/payments/${o.body.payment.id}/simulate`, {});
  const c = await customer.call('POST', `/orders/${o.body.id}/cancel`);
  assert.equal(c.body.status, 'CANCELLED');
  const p = await customer.call('GET', `/payments/${o.body.payment.id}`);
  assert.equal(p.body.status, 'REFUNDED');
});

await step('Thai text to draft cart', async () => {
  const r = await guest.call('POST', '/ai/order-intent', { text: 'เอาชีสเบอร์เกอร์ 2 อัน อันนึงไม่ใส่หัวหอม เผ็ดน้อย กับน้ำส้ม 1 แก้ว' });
  assert.equal(r.status, 201);
  const burgers = r.body.lines.filter((l) => l.menuItemId === 'mi_cheeseburger');
  assert.equal(burgers.length, 2);
  assert.ok(burgers.some((b) => b.qty === 1 && b.optionNames.includes('ไม่ใส่หัวหอม')));
  assert.ok(r.body.lines.some((l) => l.menuItemId === 'mi_orange_juice'));
});

await step('reports: sales, menu engineering, forecast', async () => {
  const s = await manager.call('GET', '/admin/reports/sales?branchId=br_siam&days=14');
  assert.ok(s.body.totals.orders > 100);
  const me = await manager.call('GET', '/admin/reports/menu-engineering?branchId=br_siam');
  const classes = new Set(me.body.items.map((i) => i.class));
  assert.ok(classes.has('STAR'));
  const f = await manager.call('GET', '/admin/forecast?branchId=br_siam');
  assert.ok(f.body.expectedOrders > 0);
});

console.log(`\n${passed} passed${process.exitCode ? ', some failed' : ''}`);
