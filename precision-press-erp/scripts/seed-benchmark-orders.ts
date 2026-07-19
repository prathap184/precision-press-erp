import { adminDb as db } from '../src/lib/firebase-admin';

async function seedOrders(count: number) {
  console.log(`Seeding ${count} test orders...`);
  const batch = db.batch();
  let added = 0;

  for (let i = 0; i < count; i++) {
    const orderId = `TEST-${Date.now()}-${i}`;
    const orderRef = db.collection('orders').doc(orderId);
    
    batch.set(orderRef, {
      id: orderId,
      status: i % 5 === 0 ? 'PENDING' : i % 3 === 0 ? 'PRINTING' : 'COMPLETED',
      customer: {
        id: 'cust-123',
        name: `Test Customer ${i}`,
      },
      items: [
        {
          id: `item-${i}-1`,
          productName: 'Solvent Flex',
          qty: 10,
          totalPrice: 500
        }
      ],
      totalAmount: 500,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    added++;
    if (added % 400 === 0) {
      await batch.commit();
      console.log(`Committed ${added} orders...`);
    }
  }
  
  if (added % 400 !== 0) {
    await batch.commit();
  }
  console.log(`Successfully seeded ${count} orders.`);
}

async function run() {
  await seedOrders(50);
  await seedOrders(150); // total 200
  await seedOrders(300); // total 500
  await seedOrders(500); // total 1000
  process.exit(0);
}

run().catch(console.error);
