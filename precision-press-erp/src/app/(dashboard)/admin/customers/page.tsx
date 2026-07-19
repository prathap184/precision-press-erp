import React from 'react';
import { getCustomers } from '@/lib/actions/users';
import { updateCustomerCreditLimit } from '@/lib/actions/users';
import CustomerManagement from '@/components/admin/CustomerManagement';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Customer Management | Admin Dashboard',
};

export default function CustomersPage() {
  return (
    <CustomerManagement 
      getCustomers={async () => {
        'use server';
        return getCustomers();
      }}
      updateCustomerCreditLimit={async (uid, limit) => {
        'use server';
        return updateCustomerCreditLimit(uid, limit);
      }}
    />
  );
}
