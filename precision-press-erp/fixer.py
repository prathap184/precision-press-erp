import sys
content = open('src/components/acdema/ProxyOrderBuilder.tsx', 'r', encoding='utf-8').read()

diff = """  const removeRow = (id: string) => {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current));
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerForm.businessName.trim() || !newCustomerForm.email.trim()) {
      toast.error('Business Name and email are required.');
      return;
    }

    if (newCustomerForm.gstType !== 'Unregistered') {
      if (!newCustomerForm.gstNumber.trim()) {
        toast.error('GST Number is mandatory for Regular or Composition types.');
        return;
      }
      if (!newCustomerForm.gstVerified) {
        toast.error('Please verify the GST Number before creating the customer.');
        return;
      }
    }

    setCreatingCustomer(true);
    try {
      const result = await createCustomer({
        email: newCustomerForm.email.trim(),
        name: newCustomerForm.businessName.trim(), // Name field uses businessName
        businessName: newCustomerForm.businessName.trim(),
        phone: newCustomerForm.phone.trim(),
        houseNumber: newCustomerForm.houseNumber.trim(),
        roadName: newCustomerForm.roadName.trim(),
        city: newCustomerForm.city.trim(),
        state: newCustomerForm.state.trim(),
        country: newCustomerForm.country.trim(),
        pincode: newCustomerForm.pincode.trim(),
        gstType: newCustomerForm.gstType,
        gstNumber: newCustomerForm.gstType !== 'Unregistered' ? newCustomerForm.gstNumber.trim() : '',
        gstVerified: newCustomerForm.gstType !== 'Unregistered' ? newCustomerForm.gstVerified : false,
        gstDetails: (newCustomerForm.gstType !== 'Unregistered' && newCustomerForm.gstVerified) ? newCustomerForm.gstDetails : null,
        customerType: newCustomerForm.customerType,
        creditLimit: newCustomerForm.customerType === 'CREDIT' ? Number(newCustomerForm.creditLimit) || 0 : 0,
        voucherType: newCustomerForm.voucherType,
        initialBalance: 0,
        tempPassword: newCustomerForm.tempPassword.trim(),
      });

      if (!result.success || !result.uid) {
        throw new Error(result.error || 'Failed to create customer.');
      }

      const created = {
        email: newCustomerForm.email.trim(),
        password: result.password || newCustomerForm.tempPassword.trim(),
        name: newCustomerForm.businessName.trim(),
      };

      setCreatedCustomer(created);
      setShowCreateCustomer(false);
      toast.success('Customer created and credentials ready to share.');
      setSelectedCustomerId(result.uid);
      const refreshedCustomers = await getCustomers();
      setCustomers(refreshedCustomers);
      setNewCustomerForm({
        businessName: '',
        email: '',
        phone: '',
        houseNumber: '',
        roadName: '',
        city: '',
        state: '',
        country: 'India',
        pincode: '',
        gstType: 'Unregistered',
        gstNumber: '',
        gstVerified: false,
        gstDetails: null,
        customerType: 'CASH',
        creditLimit: 0,
        voucherType: 'Type 0',
        tempPassword: `PP-${Math.floor(Math.random() * 90000) + 10000}`,
      });
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Failed to create customer.');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const [addingAddress, setAddingAddress] = useState(false);

  const handleAddDeliveryAddress = async (addressData: any) => {
    if (!selectedCustomer) return false;
    setAddingAddress(true);
    try {
      const { addCustomerAddress } = await import('@/lib/actions/users');
      const result = await addCustomerAddress(selectedCustomer.uid, addressData);
      if (result.success && result.address) {
        setCustomers((prev) => prev.map(c => {
          if (c.uid === selectedCustomer.uid) {
            return {
              ...c,
              addresses: [...(c.addresses || []), result.address],
              defaultAddressId: result.address.id
            };
          }
          return c;
        }));
        
        const a = result.address;
        const cName = selectedCustomer.displayName || selectedCustomer.name;
        const cPhone = selectedCustomer.phone || '';
        const parts = [
          a.houseNumber,
          a.roadName,
          (a as any).area,
          a.city,
          (a as any).district,
          a.state,
          a.pincode
        ].filter(Boolean);
        const fullStr = `${cName} ${cPhone ? `(${cPhone})` : ''}\n${parts.join(', ')}`;
        setShippingAddress(fullStr);
        toast.success('Address added successfully');
        return true;
      } else {
        toast.error(result.error || 'Failed to add address');
        return false;
      }
    } catch (e: any) {
      toast.error(e.message || 'Error adding address');
      return false;
    } finally {
      setAddingAddress(false);
    }
  };

  const submitProxyOrder = async () => {
    setTiffError('');

    if (!selectedCustomer) {
      toast.error('Select a customer first.');
      return;
    }

    if (!rows.length) {
      toast.error('Add at least one item.');
      return;
    }

    if (deliveryType !== 'selfPickup' && !shippingAddress.trim()) {
      toast.error('Enter the shipping / delivery address.');
      return;
    }

    const resolvedRowPaths = rows.map((row) => row.tiffPath.trim());
    const invalidRowIndex = -1; // Removed extension validation
    
    if (invalidRowIndex !== -1) {
      toast.error(`Invalid file type in row ${invalidRowIndex + 1}. All files must have a valid extension.`);
      return;
    }

    await refreshAuthTokenCookie().catch(e => console.warn('Token refresh failed', e));

    setLoading(true);
    try {
      const firstProduct = products.find(p => p.id === rows[0]?.productId);
      const submissionGstRate = firstProduct?.gst_rate ? firstProduct.gst_rate / 100 : 0.18;

      const submissionIsInterstate = (() => {
        if (deliveryType === 'selfPickup') return false;
        if (!shippingAddress) return false;
        const addr = shippingAddress.trim().toLowerCase();
        if (addr.includes('karnataka')) return false;
        if (/\bka\b/.test(addr)) return false;
        return true;
      })();

      const payloadBase = {
        customerId: selectedCustomer.uid,
        customerSnapshot: {
          uid: selectedCustomer.uid,
          name: selectedCustomer.name || selectedCustomer.displayName || 'Customer',
          displayName: selectedCustomer.displayName || selectedCustomer.name || 'Customer',
          email: selectedCustomer.email,
          phone: selectedCustomer.phone,
          address: selectedCustomer.address,
        },
        deliveryChoice: deliveryType === 'selfPickup' ? 'PICKUP' as const : deliveryType === 'door' ? 'DOOR_DELIVERY' as const : deliveryType === 'courier' ? 'COURIER' as const : 'TRANSPORT' as const,
        shippingAddress: deliveryType === 'selfPickup' ? 'Self Pickup' : shippingAddress.trim(),
        items: rows.map((row) => {
          const product = products.find((item) => item.id === row.productId);
          const width = Number(row.width) || 0;
          const height = Number(row.height) || 0;
          const quantity = Number(row.quantity) || 1;
          const widthInFt = row.widthUnit === 'IN' ? width / 12 : width;
          const heightInFt = row.heightUnit === 'IN' ? height / 12 : height;
          const eyeletRate = row.eyeletType === 'METAL'
            ? product?.eyeletPricing?.metal || 0
            : row.eyeletType === 'PLASTIC'
              ? product?.eyeletPricing?.plastic || 0
              : 0;

          const effectiveTiffPath = row.tiffPath.trim();
          return {
            id: row.id,
            productId: row.productId,
            productName: row.productName || product?.name || 'Item',
            projectName: row.projectName,
            width,
            widthUnit: row.widthUnit,
            height,
            heightUnit: row.heightUnit,
            quantity,
            eyeletType: row.eyeletType,
            eyeletCount: row.eyeletType === 'NONE' ? 0 : quantity,
            rate: product?.baseRate || 0,
            eyeletRate,
            fileUrl: effectiveTiffPath,
            tiffPath: effectiveTiffPath,
            pricingSnapshot: {
              productId: row.productId,
              productName: row.productName || product?.name || 'Item',
              baseRate: product?.baseRate || 0,
              eyeletPricing: product?.eyeletPricing,
              deliveryPricing: product?.deliveryPricing,
              selectedEyeletType: row.eyeletType,
              eyeletRate,
              subTotal: calculateRowSubtotal({
                width: widthInFt,
                height: heightInFt,
                quantity,
                rate: product?.baseRate || 0,
                eyeletCount: row.eyeletType === 'NONE' ? 0 : quantity,
                eyeletRate,
              }),
              tax: (product?.gst_rate ?? 18) / 100
            },
            subTotal: calculateRowSubtotal({
              width: widthInFt,
              height: heightInFt,
              quantity,
              rate: product?.baseRate || 0,
              eyeletCount: row.eyeletType === 'NONE' ? 0 : quantity,
              eyeletRate,
            }),
          };
        }),
        grandTotal: summary.grandTotal,
        paymentMode,
        isInterstate: submissionIsInterstate,
        gstRate: submissionGstRate,
        transportCharges: summary.deliveryCharges,
        deliveryPricingSnapshot: firstProduct?.deliveryPricing,
        refOrderId: quotationId,
        tiffPath: resolvedRowPaths[0] || '',
        upiProofUrl: '',
        notes,
        referenceNumber: `${selectedCustomer.uid}-${Date.now().toString().slice(-6)}`,
        depositDate: new Date().toISOString().split('T')[0],
        voucherApplied: summary.voucherApplied,
        voucherGstDiscount: summary.voucherGstDiscount,
        acdemaJobPayloadExtra: paymentMode !== 'COD' && receiptAmount ? {
          receiptAmount,
          receiptRef,
          receiptRemarks
        } : undefined
      };

      if (mode === 'quotation') {
        const quotationPayload = {
          customerId: selectedCustomer.uid,
          customerSnapshot: payloadBase.customerSnapshot,
          preparedItems: payloadBase.items,
          grandTotal: summary.grandTotal,
          deliveryChoice: null,
          shippingAddress: null,
          transportCharges: 0,
          isInterstate: submissionIsInterstate,
          gstRate: submissionGstRate
        };
        const result = await createStandaloneQuotation(quotationPayload);
        if (!result.success) throw new Error(result.error || 'Failed to create quotation.');
        toast.success('Quotation created successfully.');
        router.push('/quotation-register');
      } else {
        const result = await createAcdemaProxyOrder(payloadBase);

        if (!result.success || (!result.orderId && !result.orderIds?.length)) {
          throw new Error(result.error || 'Failed to create proxy order.');
        }

        toast.success(`Proxy orders created successfully.`);
        const highlightIds = result.orderIds?.length ? result.orderIds.join(',') : result.orderId;
        const basePath = profile?.role === 'ACDEMA' ? '/acdema' : profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN' ? '/admin' : `/${profile?.role?.toLowerCase() || 'admin'}`;
        router.push(`${basePath}/orders?highlight=${highlightIds}`);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || `Failed to create ${mode}.`);
    } finally {
      setLoading(false);
    }
  };

  const viewModel = {
    bootstrapLoading,
    profile,
    roles,
    customerSearch,
    setCustomerSearch,
    selectedCustomerId,
    setSelectedCustomerId,
    filteredCustomers,
    selectedCustomer,
    rows,
    addRow,
    updateRow,
    removeRow,
    products,
    calculateRowSubtotal,
    paymentMode,
    setPaymentMode,
    deliveryType,
    setDeliveryType,
    shippingAddress,
    setShippingAddress,
    showCreateCustomer,
    setShowCreateCustomer,
    creatingCustomer,
    createdCustomer,
    newCustomerForm,
    setNewCustomerForm,"""

target = """  const addRow = () => {
    setRows((current) => [...current, makeRow(products[0])]);
  };"""

new_content = content.replace(target, target + "\n" + diff)
open('src/components/acdema/ProxyOrderBuilder.tsx', 'w', encoding='utf-8').write(new_content)
