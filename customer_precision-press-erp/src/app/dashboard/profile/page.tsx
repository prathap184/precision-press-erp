'use client';


import React, { useEffect, useState } from 'react';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Building2,
  ArrowLeft,
  Star,
  Loader2,
  Plus,
  Trash2
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { RoleGuard } from '@/lib/role-guard';
import { useRouter } from 'next/navigation';
import { updateCustomerProfile, deleteCustomerAddress } from '@/lib/actions/users';
import { INDIAN_STATES } from '@/lib/constants';
import { toast } from 'react-hot-toast';

export default function CustomerProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    businessName: '',
    companyName: '',
    contactPerson: '',
    phone: '',
    alternateMobile: '',
    panNumber: '',
    gstType: 'Unregistered',
    gstNumber: '',
    billingAddressLine1: '',
    billingAddressLine2: '',
    billingArea: '',
    city: '',
    billingDistrict: '',
    state: '',
    billingStateCode: '',
    pincode: '',
    country: 'India',
    shippingAddressLine1: '',
    shippingAddressLine2: '',
    shippingArea: '',
    shippingCity: '',
    shippingDistrict: '',
    shippingState: '',
    shippingStateCode: '',
    shippingPincode: '',
    shippingCountry: 'India',
  });

  useEffect(() => {
    if (profile) {
      const addresses = profile.addresses || [];
      const defaultAddress = addresses.find((a: any) => a.isDefault) || addresses[0] || {};
      setFormData({
        name: profile.name || '',
        businessName: profile.businessName || '',
        companyName: profile.company_name || profile.businessName || '',
        contactPerson: profile.contact_person || profile.name || '',
        phone: profile.phone || '',
        alternateMobile: profile.alternate_mobile || '',
        panNumber: profile.pan_number || '',
        gstType: profile.gstType || 'Unregistered',
        gstNumber: profile.gstNumber || '',
        billingAddressLine1: profile.billing_address_line1 || defaultAddress.houseNumber || '',
        billingAddressLine2: profile.billing_address_line2 || defaultAddress.roadName || '',
        billingArea: profile.billing_area || '',
        city: profile.billing_city || defaultAddress.city || '',
        billingDistrict: profile.billing_district || '',
        state: profile.billing_state || defaultAddress.state || '',
        billingStateCode: profile.billing_state_code || '',
        pincode: profile.billing_pincode || defaultAddress.pincode || '',
        country: profile.billing_country || 'India',
        shippingAddressLine1: profile.shipping_address_line1 || '',
        shippingAddressLine2: profile.shipping_address_line2 || '',
        shippingArea: profile.shipping_area || '',
        shippingCity: profile.shipping_city || '',
        shippingDistrict: profile.shipping_district || '',
        shippingState: profile.shipping_state || '',
        shippingStateCode: profile.shipping_state_code || '',
        shippingPincode: profile.shipping_pincode || '',
        shippingCountry: profile.shipping_country || 'India',
      });
    }
  }, [profile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);

    try {
      const defaultAddrId = profile.defaultAddressId || Date.now().toString();
      const updatedAddress = {
        id: defaultAddrId,
        houseNumber: formData.billingAddressLine1,
        roadName: formData.billingAddressLine2,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,
        isDefault: true,
      };

      const existingAddresses = profile.addresses || [];
      const updatedAddresses = existingAddresses.some((a: any) => a.id === defaultAddrId)
        ? existingAddresses.map((a: any) => a.id === defaultAddrId ? updatedAddress : a)
        : [...existingAddresses.filter((a: any) => !a.isDefault), updatedAddress];

      const updates = {
        name: formData.name,
        businessName: formData.companyName || formData.businessName,
        company_name: formData.companyName,
        contact_person: formData.contactPerson,
        phone: formData.phone,
        alternate_mobile: formData.alternateMobile,
        pan_number: formData.panNumber,
        gstType: formData.gstType as any,
        gstNumber: formData.gstType === 'Unregistered' ? '' : formData.gstNumber,
        billing_address_line1: formData.billingAddressLine1,
        billing_address_line2: formData.billingAddressLine2,
        billing_area: formData.billingArea,
        billing_city: formData.city,
        billing_district: formData.billingDistrict,
        billing_state: formData.state,
        billing_state_code: formData.billingStateCode,
        billing_pincode: formData.pincode,
        billing_country: formData.country,
        shipping_same_as_billing: !formData.shippingAddressLine1,
        shipping_address_line1: formData.shippingAddressLine1,
        shipping_address_line2: formData.shippingAddressLine2,
        shipping_area: formData.shippingArea,
        shipping_city: formData.shippingCity,
        shipping_district: formData.shippingDistrict,
        shipping_state: formData.shippingState,
        shipping_state_code: formData.shippingStateCode,
        shipping_pincode: formData.shippingPincode,
        shipping_country: formData.shippingCountry,
        addresses: updatedAddresses,
        defaultAddressId: defaultAddrId,
        address: [formData.billingAddressLine1, formData.billingAddressLine2, formData.city, formData.state, formData.pincode].filter(Boolean).join(', '),
      };

      const result = await updateCustomerProfile(profile.uid, updates);

      if (result.success) {
        await refreshProfile();
        toast.success('Profile updated successfully!');
      } else {
        toast.error(result.error || 'Failed to update profile');
      }
    } catch (err: any) {
      console.error(err);
      toast.error('An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!profile) return;
    if (!confirm('Are you sure you want to delete this address?')) return;
    try {
      const result = await deleteCustomerAddress(profile.uid, addressId);
      if (result.success) {
        toast.success('Address deleted successfully!');
        await refreshProfile();
      } else {
        toast.error(result.error || 'Failed to delete address');
      }
    } catch (e: any) {
      toast.error('An error occurred deleting the address');
    }
  };

  const membershipTier = profile?.membership?.tier || 'STANDARD';
  const isStarred = ['GOLD', 'PLATINUM'].includes(membershipTier);

  return (
    <RoleGuard allowedRoles={['CUSTOMER']}>
      <div className="min-h-screen bg-[#f8fafd] py-8 px-4 sm:px-6 lg:px-8 font-sans">
        <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-slate-100 shadow-[0_4px_30px_rgba(0,0,0,0.02)] overflow-hidden">
          
          {/* Header Row */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <button
              onClick={() => router.push('/customer')}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors"
              title="Back"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="flex items-center gap-4">
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                title="Favorite"
              >
                <Star size={20} className={isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-slate-400'} />
              </button>

              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-[#0b57d0] hover:bg-[#0842a0] text-white rounded-lg px-6 h-11 text-sm font-medium tracking-wide shadow-sm hover:shadow transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-8 md:p-12 space-y-12">
            
            {/* Avatar Section */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="w-32 h-32 rounded-full bg-[#d3e3fd] flex items-center justify-center text-[#0b57d0] shadow-inner border border-blue-100 select-none">
                  {profile?.name ? (
                    <span className="text-4xl font-semibold font-display">
                      {profile.name[0].toUpperCase()}
                    </span>
                  ) : (
                    <User size={64} className="stroke-[1.5]" />
                  )}
                </div>
                <button
                  type="button"
                  className="absolute bottom-0 right-0 w-9 h-11 rounded-lg bg-[#0b57d0] hover:bg-[#0842a0] border-4 border-white flex items-center justify-center text-white shadow-md transition-colors"
                  title="Add profile photo"
                >
                  <Plus size={16} strokeWidth={3} />
                </button>
              </div>

              {/* Tag / Label */}
              <div className="mt-6">
                <div className="inline-flex items-center gap-1.5 bg-[#f1f3f4] border border-slate-200 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700">
                  <Star size={12} className={isStarred ? 'fill-yellow-500 text-yellow-500' : 'text-slate-400'} />
                  <span>{membershipTier} Member</span>
                </div>
              </div>
            </div>

            {/* Input Groups */}
            <div className="space-y-10 max-w-2xl mx-auto">

              {/* Group 1: Name & Business */}
              <div className="flex gap-4 md:gap-6 items-start">
                <div className="pt-3.5 text-slate-400 shrink-0">
                  <User size={20} strokeWidth={1.5} />
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="relative">
                    <input
                      type="text"
                      name="contactPerson"
                      value={formData.contactPerson}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      Contact Person
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      name="companyName"
                      value={formData.companyName}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      Company Name
                    </span>
                  </div>
                </div>
              </div>

              {/* Group 2: Company/Tax Info */}
              <div className="flex gap-4 md:gap-6 items-start">
                <div className="pt-3.5 text-slate-400 shrink-0">
                  <Building2 size={20} strokeWidth={1.5} />
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="relative">
                    <select
                      name="gstType"
                      value={formData.gstType}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3.5 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all appearance-none"
                    >
                      <option value="Unregistered">Unregistered</option>
                      <option value="Regular">Regular</option>
                      <option value="Composition">Composition</option>
                    </select>
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      GST type
                    </span>
                  </div>

                  {formData.gstType !== 'Unregistered' ? (
                    <>
                      <div className="relative">
                        <input
                          type="text"
                          name="gstNumber"
                          value={formData.gstNumber}
                          onChange={handleChange}
                          className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all uppercase"
                        />
                        <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                          GST number
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          name="panNumber"
                          value={formData.panNumber}
                          onChange={handleChange}
                          className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all uppercase"
                        />
                        <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                          PAN Number (Optional)
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        value={`₹${Math.max(0, (profile?.creditLimit || 0) - (profile?.usedCredit || 0)).toLocaleString('en-IN')}`}
                        readOnly
                        disabled
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-[15px] font-normal text-slate-400 outline-none"
                      />
                      <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-400 pointer-events-none">
                        Available Credit (Read only)
                      </span>
                    </div>
                  )}

                  {formData.gstType !== 'Unregistered' && (
                    <div className="relative md:col-span-2">
                      <input
                        type="text"
                        value={`₹${Math.max(0, (profile?.creditLimit || 0) - (profile?.usedCredit || 0)).toLocaleString('en-IN')}`}
                        readOnly
                        disabled
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-[15px] font-normal text-slate-400 outline-none"
                      />
                      <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-400 pointer-events-none">
                        Available Credit (Read only)
                      </span>
                    </div>
                  )}

                  {profile?.gstVerified && profile?.gstDetails && (
                    <div className="md:col-span-2 mt-2">
                      <details className="group bg-green-50 border border-green-200 rounded-lg p-4 cursor-pointer">
                        <summary className="text-sm font-bold text-green-800 flex justify-between items-center outline-none list-none">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            View Official GST Details
                          </div>
                          <span className="text-green-600 group-open:rotate-180 transition-transform">▼</span>
                        </summary>
                        <div className="mt-4 pt-4 border-t border-green-200 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          <div><span className="text-green-700 block text-[10px] uppercase font-bold mb-0.5">Legal Name</span> <span className="font-medium text-green-900">{profile.gstDetails.legalName}</span></div>
                          {profile.gstDetails.tradeName && <div><span className="text-green-700 block text-[10px] uppercase font-bold mb-0.5">Trade Name</span> <span className="font-medium text-green-900">{profile.gstDetails.tradeName}</span></div>}
                          <div><span className="text-green-700 block text-[10px] uppercase font-bold mb-0.5">Status</span> <span className="font-medium text-green-900">{profile.gstDetails.status}</span></div>
                          {profile.gstDetails.registrationDate && <div><span className="text-green-700 block text-[10px] uppercase font-bold mb-0.5">Registration</span> <span className="font-medium text-green-900">{profile.gstDetails.registrationDate}</span></div>}
                          {profile.gstDetails.constitution && <div><span className="text-green-700 block text-[10px] uppercase font-bold mb-0.5">Constitution</span> <span className="font-medium text-green-900">{profile.gstDetails.constitution}</span></div>}
                          {profile.gstDetails.taxpayerType && <div><span className="text-green-700 block text-[10px] uppercase font-bold mb-0.5">Taxpayer Type</span> <span className="font-medium text-green-900">{profile.gstDetails.taxpayerType}</span></div>}
                          <div className="md:col-span-2 mt-2">
                            <span className="text-green-700 block text-[10px] uppercase font-bold mb-0.5">Principal Address</span> 
                            <span className="font-medium text-green-900 leading-relaxed">{profile.gstDetails.address}</span>
                          </div>
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </div>

              {/* Group 3: Email */}
              <div className="flex gap-4 md:gap-6 items-start">
                <div className="pt-3.5 text-slate-400 shrink-0">
                  <Mail size={20} strokeWidth={1.5} />
                </div>
                <div className="flex-1 relative">
                  <input
                    type="email"
                    value={profile?.email || ''}
                    readOnly
                    disabled
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-[15px] font-normal text-slate-400 outline-none"
                  />
                  <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-400 pointer-events-none">
                    Email address (Read only)
                  </span>
                </div>
              </div>

              {/* Group 4: Phone */}
              <div className="flex gap-4 md:gap-6 items-start">
                <div className="pt-3.5 text-slate-400 shrink-0">
                  <Phone size={20} strokeWidth={1.5} />
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="relative">
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      Mobile Number
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="tel"
                      name="alternateMobile"
                      value={formData.alternateMobile}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      Alternate Mobile
                    </span>
                  </div>
                </div>
              </div>


              {/* Group 5: Address 1 */}
              <div className="flex gap-4 md:gap-6 items-start">
                <div className="pt-3.5 text-slate-400 shrink-0">
                  <MapPin size={20} strokeWidth={1.5} />
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-1 md:col-span-2">
                    <h3 className="text-sm font-bold text-slate-800 mb-2">Address 1 (Primary / Billing)</h3>
                  </div>
                  <div className="relative col-span-1 md:col-span-2">
                    <input
                      type="text"
                      name="billingAddressLine1"
                      value={formData.billingAddressLine1}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      House No.
                    </span>
                  </div>

                  <div className="relative col-span-1 md:col-span-2">
                    <input
                      type="text"
                      name="billingAddressLine2"
                      value={formData.billingAddressLine2}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      Road Name
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      name="billingArea"
                      value={formData.billingArea}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      Area / Locality
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      City
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      name="billingDistrict"
                      value={formData.billingDistrict}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      District
                    </span>
                  </div>

                  <div className="relative">
                    <select
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Select State</option>
                      {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      State
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      name="billingStateCode"
                      value={formData.billingStateCode}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      State Code
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      name="pincode"
                      value={formData.pincode}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      Pincode
                    </span>
                  </div>
                </div>
              </div>

              {/* Group 6: Address 2 */}
              <div className="flex gap-4 md:gap-6 items-start">
                <div className="pt-3.5 text-slate-400 shrink-0">
                  <MapPin size={20} strokeWidth={1.5} />
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-1 md:col-span-2">
                    <h3 className="text-sm font-bold text-slate-800 mb-2">Address 2 (Secondary / Shipping)</h3>
                  </div>
                  <div className="relative col-span-1 md:col-span-2">
                    <input
                      type="text"
                      name="shippingAddressLine1"
                      value={formData.shippingAddressLine1}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      House No.
                    </span>
                  </div>

                  <div className="relative col-span-1 md:col-span-2">
                    <input
                      type="text"
                      name="shippingAddressLine2"
                      value={formData.shippingAddressLine2}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      Road Name
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      name="shippingArea"
                      value={formData.shippingArea}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      Area / Locality
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      name="shippingCity"
                      value={formData.shippingCity}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      City
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      name="shippingDistrict"
                      value={formData.shippingDistrict}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      District
                    </span>
                  </div>

                  <div className="relative">
                    <select
                      name="shippingState"
                      value={formData.shippingState}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Select State</option>
                      {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      State
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      name="shippingStateCode"
                      value={formData.shippingStateCode}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      State Code
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      name="shippingPincode"
                      value={formData.shippingPincode}
                      onChange={handleChange}
                      className="peer w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-[15px] font-normal text-slate-800 focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0] outline-none transition-all"
                    />
                    <span className="absolute left-3 -top-2 bg-white px-1.5 text-xs font-medium text-slate-500 peer-focus:text-[#0b57d0] transition-colors pointer-events-none">
                      Pincode
                    </span>
                  </div>
                </div>
              </div>

              {/* Group 7: Additional Addresses */}
              {(() => {
                const additionalAddresses = profile?.addresses || [];

                if (additionalAddresses.length === 0) return null;

                return (
                  <div className="flex gap-4 md:gap-6 items-start mt-8 pt-8 border-t border-slate-100">
                    <div className="pt-3.5 text-slate-400 shrink-0">
                      <MapPin size={20} strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 space-y-6">
                      <div className="col-span-1 md:col-span-2">
                        <h3 className="text-sm font-bold text-slate-800 mb-2">Additional Delivery Addresses</h3>
                      </div>
                      {additionalAddresses.map((addr: any, index: number) => (
                        <div key={addr.id} className="relative p-5 border border-slate-200 rounded-xl bg-slate-50 flex justify-between items-start gap-4 shadow-sm hover:shadow-md transition-shadow">
                          <div>
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Address {index + 3}</h4>
                            <p className="text-sm text-slate-600 leading-relaxed">
                              {[
                                addr.houseNumber,
                                addr.roadName,
                              addr.area,
                              addr.city,
                              addr.district,
                              addr.state,
                              addr.stateCode ? `(${addr.stateCode})` : '',
                              addr.pincode
                            ].filter(Boolean).join(', ')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteAddress(addr.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2.5 rounded-lg transition-colors shrink-0"
                          title="Delete Address"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                );
              })()}

            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
