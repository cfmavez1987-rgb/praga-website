import process from 'node:process';
import {
  applicationDefault,
  deleteApp,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore';

const expectedProjectId = 'praga-store';
const apply = process.argv.includes('--apply');
const projectArg = process.argv.find((value) => value.startsWith('--project='));
const projectId = projectArg ? projectArg.split('=', 2)[1] : expectedProjectId;
const environmentProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;

if (projectId !== expectedProjectId) {
  throw new Error(`Refusing to migrate unexpected project: ${projectId}`);
}
if (environmentProject && environmentProject !== expectedProjectId) {
  throw new Error(`Credential environment points to ${environmentProject}, expected ${expectedProjectId}`);
}

const app = initializeApp({
  credential: applicationDefault(),
  projectId,
});
const db = getFirestore(app);
const stats = { products: 0, orders: 0, settings: 0, skipped: 0, errors: 0 };
const pendingWrites = [];
const queuedPaths = new Set();

function isValidPrice(value) {
  return Number.isFinite(value) && value >= 0 && value <= 10000000;
}

function requiredPrice(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    throw new Error('Missing product price');
  }
  const number = Number(value);
  if (!isValidPrice(number)) throw new Error('Invalid product price');
  return number;
}

function optionalPrice(value) {
  const number = Number(value);
  return isValidPrice(number) && number > 0 ? number : undefined;
}

function normalizeProduct(source) {
  const id = Number(source.id);
  const product = {
    id,
    name: String(source.name || '').slice(0, 120),
    price: requiredPrice(source.price),
    unit: String(source.unit || 'шт').slice(0, 20),
    category: String(source.category || 'Другое').slice(0, 80),
    desc: String(source.desc || '').slice(0, 1000),
    tag: String(source.tag || '').slice(0, 80),
    emoji: String(source.emoji || '🍺').slice(0, 16),
    image: String(source.image || '').slice(0, 700000),
    active: source.active !== false,
    updatedAt: FieldValue.serverTimestamp(),
  };
  const price15 = optionalPrice(source.price15);
  const price2 = optionalPrice(source.price2);
  if (price15 !== undefined) product.price15 = price15;
  if (price2 !== undefined) product.price2 = price2;

  if (
    !Number.isInteger(id)
    || id <= 0
    || !product.name
    || !isValidPrice(product.price)
    || !product.unit
    || !product.category
  ) {
    throw new Error(`Invalid product ${JSON.stringify(source.id)}`);
  }
  return product;
}

function timestampFromLegacy(value) {
  if (value instanceof Timestamp) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Timestamp.now() : Timestamp.fromDate(parsed);
}

function safeLegacyId(value, index) {
  const raw = String(value ?? index).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 50);
  return `legacy-${raw || index}`;
}

async function queueCreate(ref, data, kind) {
  if (queuedPaths.has(ref.path)) {
    stats.errors += 1;
    console.error(`ERROR ${ref.path}: duplicate migration target`);
    return;
  }
  const existing = await ref.get();
  if (existing.exists) {
    stats.skipped += 1;
    console.log(`SKIP ${ref.path}: destination exists`);
    return;
  }
  queuedPaths.add(ref.path);
  console.log(`${apply ? 'WRITE' : 'WOULD WRITE'} ${ref.path}`);
  stats[kind] += 1;
  if (apply) pendingWrites.push({ ref, data });
}

async function flushWrites() {
  for (let offset = 0; offset < pendingWrites.length; offset += 400) {
    const batch = db.batch();
    for (const { ref, data } of pendingWrites.slice(offset, offset + 400)) {
      batch.create(ref, data);
    }
    await batch.commit();
  }
}

async function migrate() {
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} migration for Firebase project ${projectId}`);
  if (!apply) console.log('No writes will be made. Pass --apply only after backup and review.');

  const legacySnapshot = await db.collection('shop').get();
  const legacyById = new Map(legacySnapshot.docs.map((document) => [document.id, document.data()]));
  let productSources = legacySnapshot.docs
    .filter((document) => document.id.startsWith('product_'))
    .map((document) => document.data());

  if (productSources.length === 0) {
    const aggregateProducts = legacyById.get('products');
    if (aggregateProducts && Array.isArray(aggregateProducts.items)) {
      productSources = aggregateProducts.items;
    }
  }

  const normalizedProducts = [];
  for (const source of productSources) {
    try {
      const product = normalizeProduct(source);
      normalizedProducts.push(product);
      await queueCreate(db.collection('products').doc(String(product.id)), product, 'products');
    } catch (error) {
      stats.errors += 1;
      console.error(`PRODUCT ERROR: ${error.message}`);
    }
  }

  const productsByName = new Map(normalizedProducts.map((product) => [product.name, product]));
  const legacyOrders = legacyById.get('orders');
  const orderSources = legacyOrders && Array.isArray(legacyOrders.items) ? legacyOrders.items : [];
  const allowedStatuses = new Set(['new', 'preparing', 'ready', 'completed']);

  for (let index = 0; index < orderSources.length; index += 1) {
    const source = orderSources[index];
    try {
      const items = (Array.isArray(source.items) ? source.items : []).map((item) => {
        const product = productsByName.get(item.name);
        if (!product) throw new Error(`Unknown product in order: ${item.name}`);
        const quantity = Number(item.qty);
        const size = Number(item.size || 0);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50 || ![0, 1, 1.5, 2].includes(size)) {
          throw new Error('Invalid order item quantity or size');
        }
        return { productId: product.id, quantity, size };
      });
      if (items.length < 1 || items.length > 10) throw new Error('Order must contain 1–10 items');

      const legacyId = safeLegacyId(source.id, index);
      const createdAt = timestampFromLegacy(source.date);
      const customerName = String(source.name || '').slice(0, 100);
      const phone = String(source.phone || '').slice(0, 24);
      const order = {
        customerName,
        phone,
        comment: String(source.comment || '').slice(0, 500),
        items,
        status: allowedStatuses.has(source.status) ? source.status : 'new',
        clientOrderId: `${legacyId}-migrated`.slice(0, 80),
        createdAt,
        updatedAt: createdAt,
      };
      if (customerName.length < 2 || !/^[0-9+() -]{7,24}$/.test(phone)) {
        throw new Error('Invalid customer name or phone');
      }
      await queueCreate(db.collection('orders').doc(legacyId), order, 'orders');
    } catch (error) {
      stats.errors += 1;
      console.error(`ORDER ${source.id ?? index} ERROR: ${error.message}`);
    }
  }

  const legacySettings = legacyById.get('settings');
  if (legacySettings && legacySettings.whatsapp) {
    const whatsapp = String(legacySettings.whatsapp).replace(/\D/g, '');
    if (/^[0-9]{10,15}$/.test(whatsapp)) {
      await queueCreate(db.collection('publicSettings').doc('store'), {
        whatsapp,
        updatedAt: FieldValue.serverTimestamp(),
      }, 'settings');
    } else {
      stats.errors += 1;
      console.error('SETTINGS ERROR: invalid WhatsApp number');
    }
  }

  await flushWrites();
  console.log(JSON.stringify(stats, null, 2));
  if (stats.errors > 0) process.exitCode = 1;
}

try {
  await migrate();
} finally {
  await Promise.all(getApps().map(deleteApp));
}
