const fs = require('fs');

const original = fs.readFileSync('src/components/dashboard/OrderBuilder.tsx', 'utf8');

const searchStr = 'className="max-w-[1600px] mx-auto pb-20 space-y-16 p-4"';
let startIndex = original.indexOf(searchStr);
if (startIndex !== -1) {
    startIndex = original.lastIndexOf('  return (', startIndex);
}
if (startIndex === -1) {
    console.error("Could not find start index");
    process.exit(1);
}

// We will replace everything from startIndex to the end of the file.
const codeBefore = original.substring(0, startIndex);

const newJSX = `  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const productImages = useMemo(() => {
    return rows
      .flatMap(r => {
        const p = availableProducts.find(prod => prod.id === r.productId);
        if (!p) return [];
        if (p.media?.images?.length) return p.media.images;
        if ((p as any).image) return [(p as any).image];
        return [];
      })
      .filter(Boolean) as string[];
  }, [rows, availableProducts]);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [productImages.length]);

  useEffect(() => {
    if (productImages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % productImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [productImages.length]);

  const currentImage = productImages.length > 0 ? productImages[currentImageIndex % productImages.length] : null;

  return (
    <div className="font-sans text-slate-800 bg-[#d4d4d8] -m-4 p-4 lg:-m-6 lg:p-6 relative z-10 min-h-[calc(100vh-4rem)] rounded-xl lg:rounded-2xl">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>
        <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-blue-400/40 blur-[140px] pointer-events-none animate-pulse"></div>
        <div className="absolute -bottom-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-fuchsia-400/40 blur-[140px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-[20%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-cyan-400/30 blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="relative z-10 w-full">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold font-black tracking-tight text-slate-900">Order Terminal</h1>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">Hindustan Enterprises</p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <div className="relative flex h-64 w-full flex-col items-center justify-center overflow-hidden rounded-[2rem] bg-white/40 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
                {currentImage ? (
                  <img
                    src={currentImage}
                    alt="Product visualization"
                    className="h-full w-full object-contain transition-opacity duration-500"
                    key={currentImage}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <p className="text-sm font-medium uppercase tracking-widest opacity-50">Select items to preview</p>
                  </div>
                )}
                {productImages.length > 1 && (
                  <div className="absolute bottom-4 flex gap-1.5">
                    {productImages.map((_, idx) => (
                      <div
                        key={idx}
                        className={\`h-1.5 rounded-full transition-all duration-300 \${idx === currentImageIndex ? 'w-6 bg-slate-800' : 'w-1.5 bg-slate-300'}\`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-9">
              <div className="grid gap-6 md:grid-cols-2 h-full">
                {isStaff ? (
                  <div className="relative z-50 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Customer Proxy</h3>
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-1 rounded-md">Staff Mode</span>
                    </div>
                    <div className="relative mb-4">
                      <div className="flex h-12 w-full items-center rounded-xl bg-slate-50 px-4 transition-all border border-slate-200 focus-within:border-slate-400">
                        <Search size={16} className="text-slate-400 mr-2" />
                        <input
                          value={customerSearch}
                          placeholder="Search directory..."
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          className="h-full w-full border-0 focus:ring-0 p-0 bg-transparent text-sm font-bold text-slate-800 outline-none placeholder-slate-400"
                        />
                      </div>
                    </div>
                    <div className="mb-4">
                      <select 
                        className="w-full h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 appearance-none"
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                      >
                        <option value="">-- Choose Customer --</option>
                        {customers
                          .filter(c => 
                            c.name?.toLowerCase().includes(customerSearch.toLowerCase()) || 
                            c.businessName?.toLowerCase().includes(customerSearch.toLowerCase()) ||
                            c.phone?.includes(customerSearch)
                          )
                          .map(c => (
                            <option key={c.uid} value={c.uid}>
                                {c.businessName || c.name} ({c.customerType})
                            </option>
                          ))}
                      </select>
                    </div>
                    {selectedCustomerId && (
                      <div className="mt-auto rounded-xl bg-blue-50 p-3 text-xs font-medium text-blue-800 border border-blue-200">
                        Acting on behalf of: <strong>{customers.find(c => c.uid === selectedCustomerId)?.displayName || customers.find(c => c.uid === selectedCustomerId)?.name}</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative z-40 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
                     <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Account Details</h3>
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-black text-lg">
                           {profile?.name?.charAt(0)}
                        </div>
                        <div>
                           <p className="text-lg font-bold text-slate-800">{profile?.name}</p>
                           <p className="text-xs text-slate-500">{profile?.email}</p>
                           <p className="text-[10px] font-black uppercase text-blue-500 mt-1">{profile?.customerType} Account</p>
                        </div>
                     </div>
                  </div>
                )}

                <div className="relative z-30 rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 h-full flex flex-col">
                  <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Logistics</h3>
                  <div className="flex gap-2 mb-4">
                    {[
                      { id: 'selfPickup', label: 'PICKUP' },
                      { id: 'door', label: 'DOOR' },
                      { id: 'courier', label: 'COURIER' },
                      { id: 'transport', label: 'TRANSPORT' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setDeliveryType(opt.id as any)}
                        className={\`flex-1 rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest transition-all \${
                          deliveryType === opt.id ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }\`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {deliveryType !== 'selfPickup' && (
                    <div className="mt-auto space-y-2">
                       <textarea 
                          ref={shippingAddressRef}
                          value={shippingAddress} 
                          onChange={(e) => setShippingAddress(e.target.value)}
                          className={\`w-full bg-slate-50 border rounded-xl p-3 text-sm h-20 outline-none focus:border-slate-400 font-medium resize-none transition-all \${validationErrors.shippingAddress ? 'border-red-400 bg-red-50' : 'border-slate-200'}\`}
                          placeholder="Street Address, Landmark, City, State, PIN CODE..."
                        />
                        {!isStaff && profile?.address && shippingAddress !== profile.address && (
                          <button 
                            onClick={() => setShippingAddress(profile.address || '')}
                            className="text-[10px] font-black text-blue-600 hover:underline uppercase tracking-tighter"
                          >
                            + Use Profile Address
                          </button>
                        )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="w-full">
            <div className="relative z-10 w-full rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60 flex flex-col">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Order Items</h3>
                <button onClick={addRow} className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800 transition-colors">
                  <Plus size={12} /> Add Row
                </button>
              </div>

              <div className="flex-1 overflow-visible">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <th className="py-3 px-2 w-8 text-center">#</th>
                      <th className="py-3 px-2">Name of Item</th>
                      <th className="py-3 px-2">Project</th>
                      <th className="py-3 px-2 text-center">GST%</th>
                      <th className="py-3 px-2">Width</th>
                      <th className="py-3 px-2">Length</th>
                      <th className="py-3 px-2 text-center">Sq.Ft.</th>
                      <th className="py-3 px-2">Qty</th>
                      <th className="py-3 px-2">Rate/Sft</th>
                      <th className="py-3 px-2 text-center">Rate Per</th>
                      <th className="py-3 px-2">Finish</th>
                      <th className="py-3 px-2">File Upload *</th>
                      <th className="py-3 px-2 text-right">Amount</th>
                      <th className="py-3 px-2 text-center">×</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, index) => {
                      const product = availableProducts.find(item => item.id === row.productId);
                      const w = Number(row.width) || 0;
                      const h = Number(row.height) || 0;
                      const q = Number(row.quantity) || 0;
                      const wFt = row.widthUnit === 'IN' ? w / 12 : w;
                      const hFt = row.heightUnit === 'IN' ? h / 12 : h;
                      const sqft = wFt * hFt;
                      const eyeletRate = row.eyeletType === 'METAL' ? product?.eyeletPricing?.metal || 0 : row.eyeletType === 'PLASTIC' ? product?.eyeletPricing?.plastic || 0 : 0;
                      const amount = calculateRowSubtotal({
                        width: wFt, height: hFt, quantity: q, rate: product?.baseRate || 0,
                        eyeletCount: row.eyeletType === 'NONE' ? 0 : q, eyeletRate,
                      });
                      const gstRate = product?.taxRate || 18;

                      return (
                        <tr key={row.id} className="group transition-colors hover:bg-slate-50/50">
                          <td className="py-3 px-2 text-center text-xs font-bold text-slate-400 tabular-nums">{index + 1}</td>
                          <td className="py-3 px-2 tabular-nums">
                            {(() => {
                              const selProd = availableProducts.find(p => p.id === row.productId);
                              const isOpen = openRowId === row.id;
                              const qTerm = searchQuery.trim().toLowerCase();
                              const matched = qTerm ? availableProducts.filter(p => p.name.toLowerCase().includes(qTerm) || p.id.toString().toLowerCase().includes(qTerm)) : availableProducts;

                              return (
                                <div id={\`error-row-\${row.id}-product\`} className="relative w-full min-w-[140px]">
                                  <div className={\`flex h-10 w-full items-center rounded-lg bg-slate-50 px-3 border \${validationErrors[\`row-\${row.id}-product\`] ? 'border-red-400' : 'border-slate-200'}\`}>
                                    <input
                                      value={isOpen ? searchQuery : (selProd?.name ?? '')}
                                      placeholder="Select item..."
                                      onChange={(e) => { setOpenRowId(row.id); setSearchQuery(e.target.value); }}
                                      onFocus={() => { setOpenRowId(row.id); setSearchQuery(''); }}
                                      onBlur={() => setTimeout(() => { setOpenRowId(null); setSearchQuery(''); }, 160)}
                                      className="w-full border-0 bg-transparent p-0 text-xs font-bold text-slate-800 outline-none focus:ring-0"
                                    />
                                    <ChevronDown size={14} className="text-slate-400" />
                                  </div>
                                  {isOpen && (
                                    <div className="absolute left-0 top-full mt-1 w-[260px] z-[9999] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                                      {matched.slice(0, 50).map(p => (
                                        <div 
                                          key={p.id} 
                                          onMouseDown={(e) => { e.preventDefault(); updateRow(row.id, { productId: p.id }); setOpenRowId(null); setSearchQuery(''); }} 
                                          className="cursor-pointer border-b border-slate-50 p-3 hover:bg-slate-50 text-xs font-bold text-slate-700 flex justify-between items-center transition-colors"
                                        >
                                          <span className="truncate pr-2">{p.name}</span>
                                          <span className="text-[9px] font-black tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md flex-shrink-0">{p.id}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-2 tabular-nums">
                            <input value={row.projectName || ''} onChange={(e) => updateRow(row.id, { projectName: e.target.value })} className={\`h-10 w-full min-w-[80px] rounded-lg border \${validationErrors[\`row-\${index}-project\`] ? 'border-red-400 bg-red-50 text-red-900' : 'border-slate-200 bg-slate-50 text-slate-800'} px-3 text-xs font-bold outline-none placeholder:text-slate-300\`} placeholder="Project" />
                          </td>
                          <td className="py-3 px-2 text-center text-xs font-bold text-slate-600 tabular-nums">{gstRate}%</td>
                          <td className="py-3 px-2 tabular-nums">
                            <div className="flex h-10 w-[80px] items-center rounded-lg border border-slate-200 bg-slate-50 px-1 overflow-hidden">
                              <input id={\`error-row-\${row.id}-width\`} type="number" value={row.width ?? ''} onChange={(e) => updateRow(row.id, { width: parseFloat(e.target.value) || undefined })} className={\`w-full border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0 \${validationErrors[\`row-\${row.id}-width\`] ? 'text-red-600 placeholder-red-300' : ''}\`} placeholder="W" />
                              <select value={row.widthUnit} onChange={(e) => updateRow(row.id, { widthUnit: e.target.value as any })} className="border-0 bg-transparent p-0 text-[10px] font-black text-slate-400 outline-none focus:ring-0 appearance-none"><option value="FT">ft</option><option value="IN">in</option></select>
                            </div>
                          </td>
                          <td className="py-3 px-2 tabular-nums">
                            <div className="flex h-10 w-[80px] items-center rounded-lg border border-slate-200 bg-slate-50 px-1 overflow-hidden">
                              <input id={\`error-row-\${row.id}-height\`} type="number" value={row.height ?? ''} onChange={(e) => updateRow(row.id, { height: parseFloat(e.target.value) || undefined })} className={\`w-full border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0 \${validationErrors[\`row-\${row.id}-height\`] ? 'text-red-600 placeholder-red-300' : ''}\`} placeholder="H" />
                              <select value={row.heightUnit} onChange={(e) => updateRow(row.id, { heightUnit: e.target.value as any })} className="border-0 bg-transparent p-0 text-[10px] font-black text-slate-400 outline-none focus:ring-0 appearance-none"><option value="FT">ft</option><option value="IN">in</option></select>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center text-xs font-bold text-slate-600 tabular-nums">
                            {sqft > 0 ? sqft.toFixed(2) : '—'}
                          </td>
                          <td className="py-3 px-2 tabular-nums">
                            <input id={\`error-row-\${row.id}-quantity\`} type="number" value={row.quantity} onChange={(e) => updateRow(row.id, { quantity: parseInt(e.target.value) || 1 })} className={\`h-10 w-16 rounded-lg border bg-slate-50 text-center text-xs font-bold text-slate-800 outline-none \${validationErrors[\`row-\${row.id}-quantity\`] ? 'border-red-400' : 'border-slate-200'}\`} placeholder="Qty" />
                          </td>
                          <td className="py-3 px-2 text-xs font-bold text-slate-600 tabular-nums">
                            {product?.baseRate?.toFixed(2) || '—'}
                          </td>
                          <td className="py-3 px-2 text-center text-xs font-bold text-slate-700 tabular-nums">
                            {product?.baseRate ? (sqft * product.baseRate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                          </td>
                          <td className="py-3 px-2 tabular-nums">
                            <div className="flex flex-col gap-1">
                              <select value={row.eyeletType} onChange={(e) => updateRow(row.id, { eyeletType: e.target.value as any })} className="h-8 w-full min-w-[80px] rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-700 outline-none">
                                <option value="NONE">None</option>
                                <option value="METAL">Metal</option>
                                <option value="PLASTIC">Plastic</option>
                              </select>
                              {row.eyeletType !== 'NONE' && (
                                <input type="number" value={row.eyeletCount} onChange={(e) => updateRow(row.id, { eyeletCount: parseInt(e.target.value) || 0 })} className="h-6 w-full rounded border border-slate-200 bg-slate-50 px-2 text-[10px] font-bold text-slate-700 outline-none" placeholder="Count" title="Eyelet Count" />
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-2 tabular-nums w-[180px]">
                            <div className="flex flex-col gap-1 w-[180px]">
                              {row.designByUs ? (
                                <div className="h-10 w-full rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-[9px] font-black text-blue-600 uppercase tracking-widest px-2 text-center leading-tight">
                                  Design Service
                                </div>
                              ) : row.uploading ? (
                                <div className="h-10 w-full rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                  <Loader2 size={14} className="animate-spin mr-1" /> Compressing...
                                </div>
                              ) : (
                                <div className="flex gap-1 items-center">
                                  {row.driveLink.startsWith('/api/designs/') ? (
                                    <div className="h-10 flex-1 rounded-lg border border-green-200 bg-green-50 flex flex-col justify-center px-2 relative overflow-hidden group">
                                      <span className="text-[9px] font-black text-green-700 uppercase tracking-widest truncate">{row.uploadStats?.filename || 'Uploaded File'}</span>
                                      <span className="text-[8px] text-green-600 truncate">{row.uploadStats?.compressedSize || ''}</span>
                                      <button onClick={() => updateRow(row.id, { driveLink: '' })} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 bg-white rounded shadow-sm text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50">×</button>
                                    </div>
                                  ) : (
                                    <>
                                      <input
                                        id={\`error-row-\${row.id}-file\`}
                                        type="url"
                                        value={row.driveLink}
                                        onChange={(e) => updateRow(row.id, { driveLink: e.target.value })}
                                        placeholder="G-Drive Link..."
                                        className={\`h-10 flex-1 rounded-lg border px-2 text-xs font-bold outline-none placeholder:text-slate-300 w-full \${validationErrors[\`row-\${index}-file\`] ? 'border-red-400 bg-red-50 text-red-600' : row.driveLink.includes('drive.google.com') ? 'border-green-400 bg-green-50 text-green-900' : 'border-slate-200 bg-slate-50 text-slate-800'}\`}
                                      />
                                      <label className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 cursor-pointer transition-colors" title="Direct Upload">
                                        <Upload size={14} />
                                        <input type="file" accept="image/*,application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(row.id, file); }} className="hidden" />
                                      </label>
                                    </>
                                  )}
                                </div>
                              )}
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" checked={row.designByUs} onChange={(e) => updateRow(row.id, { designByUs: e.target.checked, driveLink: e.target.checked ? '' : row.driveLink })} className="rounded-[4px] border-slate-300 text-blue-600 w-3 h-3" />
                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Design for me</span>
                              </label>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right text-sm font-black text-slate-900 tabular-nums">
                            {amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-2 text-center tabular-nums">
                            <button onClick={() => removeRow(row.id)} className="rounded-lg bg-rose-50 p-2 text-rose-500 hover:bg-rose-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"><Trash2 size={16} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5 lg:col-start-8">
              <div className="rounded-[2rem] bg-white/50 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl border border-white/60">
                <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Payment Terminal</h3>
                
                <div className="flex gap-2 mb-6">
                  {['CASH', 'CREDIT'].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setPaymentMethod(opt as any)}
                      className={\`flex-1 rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all \${
                        paymentMethod === opt 
                          ? 'bg-slate-900 text-white shadow-md' 
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }\`}
                    >
                      {opt === 'CASH' ? 'CASH / UPI' : 'CREDIT ACCOUNT'}
                    </button>
                  ))}
                </div>

                {paymentMethod === 'CREDIT' && profile?.customerType === 'CASH' && (
                  <p className="text-[9px] text-amber-600 font-bold uppercase tracking-widest bg-amber-50 p-3 rounded-xl border border-amber-100 mb-4">
                    ⚠️ Note: Your account is set to CASH mode. Selecting CREDIT may require manual approval.
                  </p>
                )}

                <div className="mb-6">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Special Notes</label>
                  <textarea 
                    value={notes} onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs h-16 outline-none focus:border-slate-400 font-bold resize-none"
                    placeholder="Specific color needs, hardware requirements..."
                  />
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-sm font-semibold text-slate-500">
                    <span>Base Value</span>
                    <span>Rs. {summary.baseTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-slate-500">
                    <span>Finish (Eyelets)</span>
                    <span>Rs. {summary.eyeletsTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-slate-500">
                    <span>Logistics</span>
                    <span>Rs. {summary.deliveryCharges.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-slate-500">
                    <span>GST 18%</span>
                    <span>Rs. {summary.gstAmount.toLocaleString()}</span>
                  </div>
                  
                  <div className="my-2 border-t border-slate-200" />
                  <div className="flex justify-between text-2xl font-black text-slate-900">
                    <span>Grand Total</span>
                    <span>Rs. {summary.grandTotal.toLocaleString()}</span>
                  </div>
                </div>

                {paymentMethod === 'CREDIT' && (
                  <div className="mb-4">
                    {(() => {
                      const target = isStaff ? customers.find(c => c.uid === selectedCustomerId) : profile;
                      if (!target) return null;
                      const available = target.creditLimit - target.usedCredit;
                      const isExceeded = summary.grandTotal > available;
                      return (
                        <div className={\`p-3 rounded-xl border \${isExceeded ? 'bg-red-50 border-red-200 text-red-600' : 'bg-blue-50 border-blue-200 text-blue-600'}\`}>
                          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest mb-1">
                            <span>Available Credit</span>
                            <span>₹{available.toLocaleString()}</span>
                          </div>
                          {isExceeded && (
                            <p className="text-[9px] font-bold text-red-500 uppercase tracking-tight mt-1">
                              Exceeds credit limit by ₹{(summary.grandTotal - available).toLocaleString()}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="mb-4">
                  <label className="flex items-start gap-3 cursor-pointer group hover:bg-white/50 p-2 rounded-xl transition-all">
                    <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 rounded-[4px] border-slate-300 text-emerald-500 w-4 h-4 shadow-sm" />
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-snug group-hover:text-slate-800 transition-all">Confirm dimensions match industrial specs & artwork is final.</span>
                  </label>
                  {validationErrors.terms && <p className="text-[9px] text-red-500 font-bold uppercase tracking-widest mt-1 ml-7">Acceptance Required</p>}
                </div>

                {!acceptTerms && (
                  <p className="text-[9px] text-amber-500 font-black uppercase tracking-widest text-center mb-3">
                    ⚠ Tick confirmation checkbox to enable
                  </p>
                )}
                {acceptTerms && summary.grandTotal === 0 && (
                  <p className="text-[9px] text-amber-500 font-black uppercase tracking-widest text-center mb-3">
                    ⚠ Enter Width, Height & Quantity
                  </p>
                )}

                <button
                  onClick={handleSubmitOrder}
                  disabled={loading || summary.grandTotal === 0 || !acceptTerms || (paymentMethod === 'CREDIT' && summary.grandTotal > ((isStaff ? customers.find(c => c.uid === selectedCustomerId) : profile)?.creditLimit || 0) - ((isStaff ? customers.find(c => c.uid === selectedCustomerId) : profile)?.usedCredit || 0))}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-[#00bfa5] text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-[#00bfa5]/30 hover:bg-[#00a892] disabled:opacity-50 disabled:grayscale transition-all"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                  Send Order
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
`;

const finalCode = codeBefore + newJSX;
fs.writeFileSync('src/components/dashboard/OrderBuilder.tsx', finalCode);
console.log("Successfully replaced the JSX block.");
