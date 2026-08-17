import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ReactQueryProvider } from "@/components/providers/query-provider";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});



export const metadata: Metadata = {
  title: "The PIXEL MARKETING | Industrial Online Printing System",
  description: "Setting the global benchmark for industrial online printing systems.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Roboto:wght@300;400;500;700;900&display=swap" 
          rel="stylesheet" 
        />
        <link 
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body className="antialiased font-sans bg-slate-50 text-slate-900 overflow-x-hidden">
        <ReactQueryProvider>
          <AuthProvider>
            <Toaster position="top-right" richColors closeButton />
            <Suspense fallback={null}>
              {children}
            </Suspense>
          </AuthProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
