import { adminDb } from '@/lib/firebase-admin';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function GstDetailsPage({ params }: { params: { uid: string } }) {
  
  let profile: any = null;
  try {
    const snap = await adminDb.collection('profiles').doc(params.uid).get();
    if (snap.exists) {
      profile = snap.data();
    }
  } catch (error) {
    console.error('Error fetching profile:', error);
  }

  if (!profile) {
    return notFound();
  }

  const details = profile.gstDetails;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">GST Verification Profile</h1>
          <p className="text-sm text-slate-500">Government Record for {profile.businessName || profile.name}</p>
        </div>
        <Link 
          href="/admin/gst-info" 
          className="text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50"
        >
          &larr; Back to List
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Basic Info Column */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2 mb-4">Account Overview</h2>
            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">Business Name</div>
                <div className="font-semibold text-slate-800">{profile.businessName || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Contact Name</div>
                <div className="font-semibold text-slate-800">{profile.name}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Email</div>
                <div className="text-sm text-slate-700">{profile.email}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Customer Type</div>
                <div className="inline-flex px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-bold">
                  {profile.customerType || 'CASH'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* GST Details Column */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-4">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Official GST Record
              </h2>
              <div className="text-xs font-mono text-slate-500">
                GSTIN: <span className="font-bold text-slate-800">{profile.gstNumber}</span>
              </div>
            </div>

            {!profile.gstVerified || !details ? (
              <div className="p-8 text-center text-slate-500 bg-slate-50 rounded border border-slate-100">
                No GST verification details available for this account.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-y-6 gap-x-8">
                <div className="col-span-2">
                  <div className="text-xs text-slate-500 mb-1">Legal Name</div>
                  <div className="font-bold text-lg text-slate-900">{details.legalName || '-'}</div>
                </div>

                <div className="col-span-2">
                  <div className="text-xs text-slate-500 mb-1">Trade Name</div>
                  <div className="font-semibold text-slate-800">{details.tradeName || '-'}</div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 mb-1">GST Status</div>
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      details.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                    {details.status || 'Unknown'}
                  </span>
                </div>

                <div>
                  <div className="text-xs text-slate-500 mb-1">Registration Date</div>
                  <div className="font-medium text-slate-800">{details.registrationDate || '-'}</div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 mb-1">Business Constitution</div>
                  <div className="font-medium text-slate-800">{details.constitution || '-'}</div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 mb-1">Taxpayer Type</div>
                  <div className="font-medium text-slate-800">{details.taxpayerType || '-'}</div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 mb-1">State Jurisdiction</div>
                  <div className="text-sm text-slate-700">{details.jurisdictionState || '-'}</div>
                </div>

                <div>
                  <div className="text-xs text-slate-500 mb-1">Center Jurisdiction</div>
                  <div className="text-sm text-slate-700">{details.jurisdictionCenter || '-'}</div>
                </div>

                <div className="col-span-2 bg-slate-50 p-4 rounded border border-slate-100 mt-2">
                  <div className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">Principal Place of Business</div>
                  <p className="text-sm text-slate-800 leading-relaxed">
                    {details.address || 'Address details not available.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
