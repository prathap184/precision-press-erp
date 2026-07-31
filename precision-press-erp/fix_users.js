const fs = require('fs');
let content = fs.readFileSync('src/lib/actions/users.ts', 'utf8');

// Replace all profiles with contact
content = content.replace(/adminDb\.collection\('profiles'\)/g, "adminDb.collection('contact')");

// 1. In createCustomer
content = content.replace(
  /const profile: UserProfile = {[\s\S]*?transaction\.set\(profileRef, profile\);/m,
  `const profile: any = {
        id: userRecord.uid,
        email: data.email,
        name: data.name,
        business_name: data.businessName || data.name,
        type: 'customer',
        customer_type: data.customerType,
        credit_limit: data.creditLimit,
        used_credit: data.initialBalance || 0,
        status: 'ACTIVE',
        phone: data.phone,
        billing_state: data.state,
        billing_country: data.country,
        billing_pincode: data.pincode,
        gst_type: data.gstType,
        gst_number: data.gstNumber,
        gst_verified: data.gstVerified,
        gst_details: data.gstDetails,
        voucher_type: data.voucherType,
        addresses,
        created_at: new Date().toISOString(),
        billing_address_line1: data.houseNumber || '',
        billing_address_line2: data.roadName || data.address || '',
        billing_city: data.city || '',
      };

      transaction.set(profileRef, profile);`
);

// 2. In updateCustomerProfile
content = content.replace(
  /const updates = {[\s\S]*?await adminDb\.collection\('contact'\)\.doc\(uid\)\.update\(updates\);/m,
  `const updates: any = {
      name,
      business_name: businessName,
      type: role === 'CUSTOMER' ? 'customer' : (role === 'SUPPLIER' ? 'supplier' : 'both'),
      customer_type: customerType,
      credit_limit: creditLimit,
      used_credit: usedCredit,
      status,
      phone,
      gst_type: gstType,
      gst_number: gstNumber,
      gst_verified: gstVerified,
      voucher_type: voucherType,
      addresses,
      billing_address_line1,
      billing_address_line2,
      billing_area,
      billing_city,
      billing_district,
      billing_state,
      billing_state_code,
      billing_pincode,
      billing_country,
      shipping_same_as_billing,
      shipping_address_line1,
      shipping_address_line2,
      shipping_area,
      shipping_city,
      shipping_district,
      shipping_state,
      shipping_state_code,
      shipping_pincode,
      shipping_country
    };

    Object.keys(updates).forEach((key) => {
      if (updates[key] === undefined) delete updates[key];
    });

    await adminDb.collection('contact').doc(uid).update(updates);`
);

// 3. adjustCustomerCredit
content = content.replace(
  /transaction\.update\(profileRef, { usedCredit: newUsedCredit }\);/g,
  "transaction.update(profileRef, { used_credit: newUsedCredit });"
).replace(
  /const newUsedCredit = type === 'DEBIT' \s*\n\s*\? \(profile\.usedCredit \|\| 0\) \+ amount \s*\n\s*: \(profile\.usedCredit \|\| 0\) - amount;/m,
  `const usedCredit = (profile as any).used_credit || profile.usedCredit || 0;
    const newUsedCredit = type === 'DEBIT' ? usedCredit + amount : usedCredit - amount;`
);

// 4. addCustomerAddress and deleteCustomerAddress
content = content.replace(
  /const updates: Partial<UserProfile> = {/g,
  "const updates: any = {"
);

// 5. updateCustomerCreditLimit
content = content.replace(
  /await profileRef\.update\({\n\s*creditLimit: newLimit,\n\s*customerType: newLimit > 0 \? 'CREDIT' : profile\.customerType\n\s*}\);/m,
  `await profileRef.update({
      credit_limit: newLimit,
      customer_type: newLimit > 0 ? 'CREDIT' : ((profile as any).customer_type || profile.customerType)
    });`
).replace(
  /const oldLimit = profile\.creditLimit \|\| 0;/g,
  "const oldLimit = (profile as any).credit_limit || profile.creditLimit || 0;"
);

// 6. getCustomers
content = content.replace(
  /export async function getCustomers\(\) {[\s\S]*?return \[\];\n  }\n}/m,
  `export async function getCustomers() {
  try {
    const snap = await adminDb.collection('contact').get();
    
    return snap.docs
      .map((doc: any) => {
        const data = serializeFirestoreData(doc.data());
        return {
          id: doc.id,
          uid: doc.id,
          name: data.name || 'Unknown',
          displayName: data.name || 'Unknown',
          businessName: data.business_name || data.name || 'Unknown',
          email: data.email || '',
          phone: data.phone || '',
          role: 'CUSTOMER',
          customerType: (data.payment_terms_days && data.payment_terms_days > 0) ? 'CREDIT' : 'CASH',
          creditLimit: data.credit_limit || (data.payment_terms_days > 0 ? 999999 : 0),
          ...data,
        } as UserProfile;
      })
      .filter((c: any) => c.type === 'customer' || c.type === 'both' || !c.type);
  } catch (error: any) {
    console.error('getCustomers error:', error);
    return [];
  }
}`
);

// 7. getSuppliers
content = content.replace(
  /export async function getSuppliers\(\) {[\s\S]*?return \[\];\n  }\n}/m,
  `export async function getSuppliers() {
  try {
    const snap = await adminDb.collection('contact').get();
    
    return snap.docs
      .map((doc: any) => {
        const data = serializeFirestoreData(doc.data());
        return {
          id: doc.id,
          uid: doc.id,
          name: data.name || 'Unknown',
          displayName: data.name || 'Unknown',
          businessName: data.business_name || data.name || 'Unknown',
          email: data.email || '',
          phone: data.phone || '',
          role: 'SUPPLIER',
          ...data,
        } as UserProfile;
      })
      .filter((c: any) => c.type === 'supplier' || c.type === 'both');
  } catch (error: any) {
    console.error('getSuppliers error:', error);
    return [];
  }
}`
);

fs.writeFileSync('src/lib/actions/users.ts', content);
