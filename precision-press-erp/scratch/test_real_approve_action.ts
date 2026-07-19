require('dotenv').config({ path: '.env.local' });
const { Module } = require('module');

// ─── Mock next/headers and next/cache before importing payments ───
const originalRequire = Module.prototype.require;
Module.prototype.require = function (path) {
  if (path === 'next/headers') {
    return {
      cookies: () => ({
        get: (name) => {
          if (name === 'token') {
            return { value: 'dummy-token' };
          }
          return null;
        }
      })
    };
  }
  if (path === 'next/cache') {
    return {
      revalidatePath: (p) => {
        console.log(`[Mock RevalidatePath] ${p}`);
      }
    };
  }
  return originalRequire.apply(this, arguments);
};

// Now import the admin module and mock verifyIdToken
const admin = require('../src/lib/firebase-admin');
admin.adminAuth.verifyIdToken = async (token) => {
  console.log('[Mocked verifyIdToken] Returning Accountant profile');
  return {
    uid: 'cae05ea5-f577-402b-9db1-9aa9d838ea44', // accountant user ID
    email: 'accountant@gmail.com',
    name: 'accountant',
    role: 'ACCOUNTANT',
    roles: ['ACCOUNTANT']
  };
};

async function main() {
  try {
    // Now import approvePayment
    const { approvePayment } = require('../src/lib/actions/payments');

    const paymentId = 'PAY-35709141';
    console.log(`Calling approvePayment('${paymentId}')...`);
    const res = await approvePayment(paymentId);
    console.log('Result:', res);

  } catch (err) {
    console.error('Error in test script:', err);
  }
}

main();
