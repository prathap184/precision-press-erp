import React from 'react';
import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import Modalities from '@/components/landing/Modalities';
import FeaturedProduct from '@/components/landing/FeaturedProduct';
import TechnicalSpecs from '@/components/landing/TechnicalSpecs';
import SupportCTA from '@/components/landing/SupportCTA';
import Footer from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen font-body selection:bg-sky-400/20 selection:text-sky-100" style={{ background: 'linear-gradient(160deg, #1a0a3d 0%, #2d1b69 20%, #3b3bb5 50%, #1a56db 75%, #0c4a9e 100%)' }}>
      <Navbar />
      <main>
        <Hero />
        <Modalities />
        <FeaturedProduct />
        <TechnicalSpecs />
        <SupportCTA />
      </main>
      <Footer />
    </div>
  );
}

