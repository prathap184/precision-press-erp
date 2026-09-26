import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full text-center space-y-4 bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Page Not Found</h2>
        <p className="text-sm text-slate-500">
          The requested page could not be found or has moved.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
