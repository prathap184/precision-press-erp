'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthService } from '@/services/auth';
import { UserRole } from '@/types/auth';
import Link from 'next/link';
import { X, Mail, Lock, User, MapPin, Hash, Phone, Building, FileText, BadgePercent, CreditCard } from 'lucide-react';
import Navbar from '@/components/landing/Navbar';
import { INDIAN_STATES } from '@/lib/constants';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const role: UserRole = 'CUSTOMER';
  
  // Customer specific states
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [alternateMobile, setAlternateMobile] = useState('');
  const [panNumber, setPanNumber] = useState('');
  
  const [billingAddressLine1, setBillingAddressLine1] = useState('');
  const [billingAddressLine2, setBillingAddressLine2] = useState('');
  const [billingArea, setBillingArea] = useState('');
  const [city, setCity] = useState('');
  const [billingDistrict, setBillingDistrict] = useState('');
  const [state, setState] = useState('');
  const [billingStateCode, setBillingStateCode] = useState('');
  const [country, setCountry] = useState('India');
  const [pincode, setPincode] = useState('');
  
  const [gstType, setGstType] = useState<'Regular' | 'Composition' | 'Unregistered'>('Unregistered');
  const [gstNumber, setGstNumber] = useState('');
  const [customerType, setCustomerType] = useState<'CASH' | 'CREDIT'>('CASH');
  const [creditLimit, setCreditLimit] = useState('');
  const [voucherType, setVoucherType] = useState<'Type 0' | 'Type 1'>('Type 0');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyingGst, setVerifyingGst] = useState(false);
  const [isGstVerified, setIsGstVerified] = useState(false);
  const [gstDetails, setGstDetails] = useState<any>(null);
  const router = useRouter();

  const handleVerifyGst = async () => {
    if (!gstNumber || gstNumber.trim().length !== 15) {
      setError('Please enter a valid 15-character GSTIN');
      return;
    }

    setVerifyingGst(true);
    setError('');
    try {
      const res = await fetch('/api/gst-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gstin: gstNumber.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify GSTIN');
      }

      // Populate form with fetched data
      setName((prev) => data.data?.legalName || data.data?.tradeName || prev);
      
      if (data.data?.address) {
        const parts = data.data.address.split(',').map((p: string) => p.trim());
        if (parts.length > 0) {
          setState((prev) => parts.find((p: string) => /karnataka|kerala|tamil/i.test(p)) || prev);
          setPincode((prev) => parts.find((p: string) => /^\d{6}$/.test(p)) || prev);
          setBillingAddressLine1(data.data.address);
        }
      }
      setGstDetails(data.data);
      setIsGstVerified(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Verification failed. Switching to Unregistered.');
      setGstType('Unregistered');
      setIsGstVerified(false);
    } finally {
      setVerifyingGst(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const payload: any = { email, password, role, name };
      
      payload.companyName = companyName || name;
      payload.contactPerson = contactPerson || name;
      payload.alternateMobile = alternateMobile;
      payload.panNumber = panNumber;
      payload.businessName = companyName || name; 
      payload.phone = phone;
      payload.billingAddressLine1 = billingAddressLine1;
      payload.billingAddressLine2 = billingAddressLine2;
      payload.billingArea = billingArea;
      payload.billingDistrict = billingDistrict;
      payload.billingStateCode = billingStateCode;
      payload.city = city;
      payload.state = state;
      payload.country = country;
      payload.pincode = pincode;
      payload.gstType = gstType;
      payload.gstNumber = gstType !== 'Unregistered' ? gstNumber : undefined;
      payload.gstVerified = gstType !== 'Unregistered' ? isGstVerified : false;
      payload.gstDetails = (gstType !== 'Unregistered' && isGstVerified) ? gstDetails : null;
      payload.customerType = customerType;
      payload.creditLimit = customerType === 'CREDIT' ? Number(creditLimit) : 0;
      payload.voucherType = voucherType;
      
      await AuthService.register(payload);
      router.push('/login');
    } catch (err: any) {
      setError(err.message || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen relative flex flex-col font-sans antialiased text-slate-800"
      style={{
        backgroundImage: 'url(/bg-forest.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Navbar */}
      <Navbar />

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4 relative z-10 py-10">
        <div className="relative w-full max-w-[400px]">
          {/* Close Button */}
          <button 
            onClick={() => router.push('/')}
            className="absolute -top-3 -right-3 w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center z-20 shadow-lg hover:bg-slate-800 transition-colors"
          >
            <X size={16} strokeWidth={3} />
          </button>

          {/* Frosted Glass Card */}
          <div className="bg-white/40 backdrop-blur-md border border-white/50 rounded-[2rem] p-10 shadow-2xl relative overflow-hidden">
            <h2 className="text-3xl font-black text-center mb-8 text-slate-900">Sign Up</h2>

            <form className="space-y-6" onSubmit={handleRegister}>
              {error && (
                <div className="bg-red-500/10 text-red-700 p-3 rounded-lg text-xs font-bold text-center">
                  {error}
                </div>
              )}

              {/* Customer Specific GST First Step */}
              <div className="space-y-4 pt-2">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider pt-2">Tax & Billing / GST</h3>

                <div className="grid grid-cols-1 gap-4">
                  <div className="relative">
                    <select
                      className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer appearance-none cursor-pointer"
                      value={gstType}
                      onChange={(e) => {
                        setGstType(e.target.value as any);
                        setIsGstVerified(false);
                      }}
                    >
                      <option value="Unregistered">Unregistered</option>
                      <option value="Regular">Regular</option>
                      <option value="Composition">Composition</option>
                    </select>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none">
                      <FileText size={18} className="text-slate-700/50 peer-focus:text-slate-900 transition-colors" />
                    </div>
                  </div>

                  {gstType !== 'Unregistered' && (
                    <div className="space-y-4">
                      <div className="relative flex gap-2 items-end">
                        <input
                          type="text"
                          className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer uppercase font-mono"
                          placeholder="Enter 15-digit GSTIN"
                          value={gstNumber}
                          onChange={(e) => {
                            setGstNumber(e.target.value.toUpperCase());
                            setIsGstVerified(false);
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleVerifyGst}
                          disabled={verifyingGst}
                          className="h-10 px-4 rounded bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs font-bold uppercase tracking-widest hover:bg-indigo-100 disabled:opacity-50 transition-colors shrink-0 mb-1"
                        >
                          {verifyingGst ? 'Verifying...' : isGstVerified ? 'Verified ✓' : 'Verify'}
                        </button>
                      </div>
                    </div>
                  )}
                  
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer uppercase font-mono"
                      placeholder="PAN Number (Optional)"
                      value={panNumber}
                      onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>

                {isGstVerified && gstDetails && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md text-xs text-green-900 space-y-1">
                    <div className="font-bold mb-2 text-green-700 pb-1 border-b border-green-200">✓ GST Verified Successfully</div>
                    <div className="grid grid-cols-1 gap-y-2">
                      <div><span className="font-semibold text-green-800 block text-[10px] uppercase tracking-wider mb-0.5">Legal Name</span> <span className="font-medium">{gstDetails.legalName}</span></div>
                      {gstDetails.tradeName && <div><span className="font-semibold text-green-800 block text-[10px] uppercase tracking-wider mb-0.5">Trade Name</span> <span className="font-medium">{gstDetails.tradeName}</span></div>}
                      <div><span className="font-semibold text-green-800 block text-[10px] uppercase tracking-wider mb-0.5">Status</span> <span className="font-medium">{gstDetails.status}</span></div>
                      {gstDetails.registrationDate && <div><span className="font-semibold text-green-800 block text-[10px] uppercase tracking-wider mb-0.5">Registration</span> <span className="font-medium">{gstDetails.registrationDate}</span></div>}
                      {gstDetails.constitution && <div><span className="font-semibold text-green-800 block text-[10px] uppercase tracking-wider mb-0.5">Constitution</span> <span className="font-medium">{gstDetails.constitution}</span></div>}
                      {gstDetails.taxpayerType && <div><span className="font-semibold text-green-800 block text-[10px] uppercase tracking-wider mb-0.5">Taxpayer Type</span> <span className="font-medium">{gstDetails.taxpayerType}</span></div>}
                      {gstDetails.jurisdictionState && <div><span className="font-semibold text-green-800 block text-[10px] uppercase tracking-wider mb-0.5">State Juris.</span> <span className="font-medium">{gstDetails.jurisdictionState}</span></div>}
                      {gstDetails.jurisdictionCenter && <div><span className="font-semibold text-green-800 block text-[10px] uppercase tracking-wider mb-0.5">Center Juris.</span> <span className="font-medium">{gstDetails.jurisdictionCenter}</span></div>}
                    </div>
                    {gstDetails.address && (
                      <div className="mt-1 pt-1 border-t border-green-200/50">
                        <span className="font-semibold text-green-800">Address:</span> 
                        <p className="mt-0.5 text-[11px] leading-tight opacity-90">{gstDetails.address}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Show remaining fields only if NOT pending GST verification */}
              {!(gstType !== 'Unregistered' && !isGstVerified) && (
                <>
                  <div className="space-y-6 pt-4 border-t border-slate-200 mt-6">
                    {/* Name / Business Name Input */}
                    <div className="relative">
                      <input
                        type="text"
                        required
                        className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                        placeholder="Company Name"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                      />
                      <Building size={18} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-700/50 peer-focus:text-slate-900 transition-colors" />
                    </div>
                    
                    <div className="relative">
                      <input
                        type="text"
                        required
                        className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                        placeholder="Contact Person Name"
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                      />
                      <User size={18} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-700/50 peer-focus:text-slate-900 transition-colors" />
                    </div>

                    {/* Email Input */}
                    <div className="relative">
                      <input
                        type="email"
                        required
                        className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <Mail size={18} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-700/50 peer-focus:text-slate-900 transition-colors" />
                    </div>

                    {/* Password Input */}
                    <div className="relative">
                      <input
                        type="password"
                        required
                        className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <Lock size={18} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-700/50 peer-focus:text-slate-900 transition-colors" />
                    </div>
                  </div>

                  {/* Customer Specific Additional Details */}
                  <div className="space-y-6 pt-4 border-t border-slate-200 mt-6">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Contact & Location</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="relative">
                        <input
                          type="text"
                          required
                          className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                          placeholder="Mobile Number"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                        <Phone size={18} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-700/50 peer-focus:text-slate-900 transition-colors" />
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                          placeholder="Alt Mobile (Optional)"
                          value={alternateMobile}
                          onChange={(e) => setAlternateMobile(e.target.value)}
                        />
                      </div>
                    </div>

                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mt-6 pt-4 border-t border-slate-200">Billing Address</h3>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="relative col-span-2">
                        <input
                          type="text"
                          className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                          placeholder="Address Line 1"
                          value={billingAddressLine1}
                          onChange={(e) => setBillingAddressLine1(e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                          placeholder="Area / Locality"
                          value={billingArea}
                          onChange={(e) => setBillingArea(e.target.value)}
                        />
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                          placeholder="PIN Code"
                          value={pincode}
                          onChange={(e) => setPincode(e.target.value)}
                        />
                        <Hash size={18} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-700/50 peer-focus:text-slate-900 transition-colors" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                          placeholder="City"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                        />
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                          placeholder="District"
                          value={billingDistrict}
                          onChange={(e) => setBillingDistrict(e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div className="relative">
                        <select
                          className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer appearance-none cursor-pointer"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                        >
                          <option value="" disabled>Select State</option>
                          {INDIAN_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                          placeholder="State Code"
                          value={billingStateCode}
                          onChange={(e) => setBillingStateCode(e.target.value)}
                        />
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full bg-transparent border-b-2 border-slate-700/20 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-600 focus:outline-none focus:border-slate-900 transition-colors peer"
                          placeholder="Country"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Register Button */}
                  <div className="pt-4 mt-6">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-slate-900 text-white rounded-lg py-3.5 text-sm font-bold shadow-lg hover:bg-slate-800 active:scale-[0.98] transition-all"
                    >
                      {loading ? 'Processing...' : 'Sign Up'}
                    </button>
                  </div>
                  
                  {/* Login Link */}
                  <div className="text-center pt-4">
                    <p className="text-xs font-bold text-slate-700">
                      Already have an account?{' '}
                      <Link href="/login" className="text-slate-900 hover:underline underline-offset-4">Sign In</Link>
                    </p>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
