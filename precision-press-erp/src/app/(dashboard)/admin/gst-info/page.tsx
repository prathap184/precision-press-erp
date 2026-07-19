import { adminDb } from '@/lib/firebase-admin';
import Link from 'next/link';

export default async function GstInfoPage() {
  
  let profiles: any[] = [];
  
  try {
    const snapshot = await adminDb
      .collection('profiles')
      .where('gstType', 'in', ['Regular', 'Composition'])
      .get();
      
    profiles = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        businessName: data.businessName,
        gstNumber: data.gstNumber,
        gstType: data.gstType,
        gstVerified: data.gstVerified,
        gstDetails: data.gstDetails,
        customerType: data.customerType,
        role: data.role,
        createdAt: data.createdAt,
      };
    });
    
    profiles.sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tB - tA;
    });

  } catch (error) {
    console.error('Error fetching GST info:', error);
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">GST Information Database</h1>
      <p className="text-sm text-slate-500 mb-6">List of all customers with verified GST details.</p>

      <div className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-600">
              <th className="p-4 font-semibold">Customer / Business Name</th>
              <th className="p-4 font-semibold">GST Number</th>
              <th className="p-4 font-semibold">Legal Name (from GST)</th>
              <th className="p-4 font-semibold">Status</th>
              <th className="p-4 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {profiles && profiles.length > 0 ? (
              profiles.map((profile) => (
                <tr key={profile.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="font-medium text-slate-900">{profile.businessName || profile.name}</div>
                    <div className="text-xs text-slate-500">{profile.customerType || 'Customer'}</div>
                  </td>
                  <td className="p-4 font-mono text-slate-700">{profile.gstNumber}</td>
                  <td className="p-4 text-slate-700">
                    {profile.gstDetails?.legalName || '-'}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      profile.gstDetails?.status === 'Active' ? 'bg-green-100 text-green-700' : 
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {profile.gstDetails?.status || 'Unknown'}
                    </span>
                  </td>
                  <td className="p-4">
                    <Link 
                      href={`/admin/gst-info/${profile.id}`}
                      className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold uppercase tracking-wider"
                    >
                      View Details &rarr;
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  No verified GST records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
