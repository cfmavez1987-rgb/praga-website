import { after, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const projectId = 'praga-store';
let testEnv;

function product(overrides = {}) {
  return {
    id: 1,
    name: 'Pilsner Urquell',
    price: 850,
    price15: 1200,
    price2: 1500,
    unit: 'л',
    category: 'Пиво',
    desc: 'Классический чешский пильзнер.',
    tag: 'Хит',
    emoji: '🍺',
    image: '',
    active: true,
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function order(overrides = {}) {
  return {
    customerName: 'Тестовый клиент',
    phone: '+7 702 061-57-22',
    comment: '',
    items: [{ productId: 1, quantity: 2, size: 1.5 }],
    status: 'new',
    clientOrderId: 'test-order-id-1234567890',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function createOrder(db, value = order()) {
  return setDoc(doc(db, 'orders', value.clientOrderId), value);
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (let id = 1; id <= 10; id += 1) {
      await setDoc(doc(db, 'products', String(id)), {
        ...product({ id }),
        updatedAt: new Date(),
      });
    }
    const snack = product({ id: 11, category: 'Снеки' });
    delete snack.price15;
    delete snack.price2;
    await setDoc(doc(db, 'products', '11'), {
      ...snack,
      updatedAt: new Date(),
    });
    await setDoc(doc(db, 'products', '12'), {
      ...product({ id: 12, active: false }),
      updatedAt: new Date(),
    });
    const beerWithoutLargeSize = product({ id: 13 });
    delete beerWithoutLargeSize.price2;
    await setDoc(doc(db, 'products', '13'), {
      ...beerWithoutLargeSize,
      updatedAt: new Date(),
    });
    await setDoc(doc(db, 'publicSettings', 'store'), {
      whatsapp: '77020615722',
      updatedAt: new Date(),
    });
    await setDoc(doc(db, 'admins', 'admin-user'), { enabled: true });
    await setDoc(doc(db, 'admins', 'disabled-admin'), { enabled: false });
    await setDoc(doc(db, 'orders', 'existing-order'), {
      ...order(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('public users can read and list products', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, 'products', '1')));
  await assertSucceeds(getDocs(collection(db, 'products')));
});

test('public users can get only the public store settings document', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, 'publicSettings', 'store')));
  await assertFails(getDocs(collection(db, 'publicSettings')));
  await assertFails(getDoc(doc(db, 'publicSettings', 'other')));
});

test('public and ordinary authenticated users cannot mutate products or settings', async () => {
  for (const context of [
    testEnv.unauthenticatedContext(),
    testEnv.authenticatedContext('ordinary-user'),
    testEnv.authenticatedContext('disabled-admin'),
  ]) {
    const db = context.firestore();
    await assertFails(setDoc(doc(db, 'products', '2'), product({ id: 2 })));
    await assertFails(updateDoc(doc(db, 'products', '1'), { price: 1, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, 'products', '1')));
    await assertFails(setDoc(doc(db, 'publicSettings', 'store'), {
      whatsapp: '77000000000',
      updatedAt: serverTimestamp(),
    }));
  }
});

test('anonymous customer can create a valid order but cannot read or change orders', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(createOrder(db, order()));
  await assertFails(getDoc(doc(db, 'orders', 'existing-order')));
  await assertFails(getDocs(collection(db, 'orders')));
  await assertFails(updateDoc(doc(db, 'orders', 'existing-order'), {
    status: 'completed',
    updatedAt: serverTimestamp(),
  }));
  await assertFails(deleteDoc(doc(db, 'orders', 'existing-order')));
});


test('order items must reference active products with a supported size', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertSucceeds(createOrder(db, order({
    clientOrderId: 'valid-snack-order-123456',
    items: [{ productId: 11, quantity: 1, size: 0 }],
  })));

  for (const value of [
    order({ clientOrderId: 'missing-product-123456', items: [{ productId: 999, quantity: 1, size: 1 }] }),
    order({ clientOrderId: 'inactive-product-123456', items: [{ productId: 12, quantity: 1, size: 1 }] }),
    order({ clientOrderId: 'snack-wrong-size-123456', items: [{ productId: 11, quantity: 1, size: 2 }] }),
    order({ clientOrderId: 'beer-missing-size-123456', items: [{ productId: 13, quantity: 1, size: 2 }] }),
  ]) {
    await assertFails(createOrder(db, value));
  }
});

test('order document ID enforces idempotent creation', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  const value = order({ clientOrderId: 'idempotent-order-123456' });
  await assertSucceeds(createOrder(db, value));
  await assertFails(createOrder(db, value));
  await assertFails(setDoc(doc(db, 'orders', 'different-order-id-123456'), order({
    clientOrderId: 'claimed-order-id-123456',
  })));
});

test('order creation rejects extra, privileged, malformed, and oversized data', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  const invalidOrders = [
    order({ total: 1 }),
    order({ price: 1 }),
    order({ status: 'completed' }),
    order({ customerName: 'A' }),
    order({ phone: 'bad' }),
    order({ comment: 'x'.repeat(501) }),
    order({ clientOrderId: 'short' }),
    order({ items: [] }),
    order({ items: Array.from({ length: 11 }, () => ({ productId: 1, quantity: 1, size: 0 })) }),
    order({ items: [{ productId: 0, quantity: 1, size: 0 }] }),
    order({ items: [{ productId: 1, quantity: 0, size: 0 }] }),
    order({ items: [{ productId: 1, quantity: 51, size: 0 }] }),
    order({ items: [{ productId: 1, quantity: 1, size: 3 }] }),
    order({ items: [{ productId: 1, quantity: 1, size: 0, price: 1 }] }),
    order({ createdAt: new Date('2000-01-01') }),
  ];

  for (const value of invalidOrders) {
    await assertFails(createOrder(db, value));
  }
});

test('all ten supported order items are validated', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  const validItems = Array.from({ length: 10 }, (_, index) => ({
    productId: index + 1,
    quantity: 1,
    size: index % 2 === 0 ? 1 : 2,
  }));
  await assertSucceeds(createOrder(db, order({ items: validItems })));

  for (let index = 0; index < validItems.length; index += 1) {
    const invalidItems = validItems.map((item) => ({ ...item }));
    invalidItems[index].quantity = 0;
    await assertFails(createOrder(db, order({
      clientOrderId: `invalid-position-${index}-123456`,
      items: invalidItems,
    })));
  }
});

test('authenticated users without an enabled allowlist entry have no admin access', async () => {
  const db = testEnv.authenticatedContext('ordinary-user').firestore();
  await assertFails(getDocs(collection(db, 'orders')));
  await assertFails(setDoc(doc(db, 'products', '2'), product({ id: 2 })));
  await assertFails(getDoc(doc(db, 'admins', 'ordinary-user')));
});

test('allowlisted admin can manage products, settings, and orders', async () => {
  const db = testEnv.authenticatedContext('admin-user').firestore();
  await assertSucceeds(getDocs(collection(db, 'orders')));
  await assertSucceeds(setDoc(doc(db, 'products', '2'), product({ id: 2 })));
  await assertSucceeds(updateDoc(doc(db, 'products', '2'), {
    price: 900,
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(setDoc(doc(db, 'publicSettings', 'store'), {
    whatsapp: '77020615722',
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(db, 'orders', 'existing-order'), {
    status: 'preparing',
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(deleteDoc(doc(db, 'products', '2')));
});

test('admin cannot alter immutable order data or use an unknown status', async () => {
  const db = testEnv.authenticatedContext('admin-user').firestore();
  await assertFails(updateDoc(doc(db, 'orders', 'existing-order'), {
    customerName: 'Changed',
    status: 'preparing',
    updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(db, 'orders', 'existing-order'), {
    status: 'invalid',
    updatedAt: serverTimestamp(),
  }));
});

test('admin allowlist, legacy shop data, and unknown collections are client-inaccessible', async () => {
  for (const context of [
    testEnv.unauthenticatedContext(),
    testEnv.authenticatedContext('admin-user'),
  ]) {
    const db = context.firestore();
    await assertFails(getDoc(doc(db, 'admins', 'admin-user')));
    await assertFails(getDoc(doc(db, 'shop', 'settings')));
    await assertFails(setDoc(doc(db, 'shop', 'product_1'), { id: 1 }));
    await assertFails(getDoc(doc(db, 'unknown', 'document')));
  }
});
