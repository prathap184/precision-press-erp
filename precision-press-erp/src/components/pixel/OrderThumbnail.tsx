"use client";

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

const CATEGORY_IMAGES: Record<string, string> = {
  'solvent': '/images/categories/solvent.png',
  'solvent-print': '/images/categories/solvent.png',
  'eco-solvent': '/images/categories/eco-solvent.png',
  'eco-solvent-print': '/images/categories/eco-solvent.png',
  'uv-roll': '/images/categories/uv-roll.png',
  'uv-roll-print': '/images/categories/uv-roll.png',
  'uv-print-roll': '/images/categories/uv-roll.png',
  'uv-flat': '/images/categories/uv-flat.png',
  'uv-flat-print': '/images/categories/uv-flat.png',
  'uv-print-flat': '/images/categories/uv-flat.png',
  'digital': '/images/categories/digital.png',
  'digital-print': '/images/categories/digital.png',
  'id-cards': '/images/categories/id-cards.png',
  'id-card': '/images/categories/id-cards.png'
};

interface OrderThumbnailProps {
  orderId?: string;
  order?: any;
  size?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}

export const OrderThumbnail = ({ 
  order, 
  size = 'md',
  className = "" 
}: OrderThumbnailProps) => {
  const directThumbnail = order?.thumbnailUrl;
  
  const dims = {
    sm: 'w-14 h-14 rounded-xl',
    md: 'w-20 h-20 rounded-2xl',
    lg: 'w-32 h-32 rounded-[2rem]',
    full: 'w-full h-full rounded-[2.5rem]'
  }[size];

  // Determine category for fallback
  const categoryRaw = (order as any)?.category || 'solvent';
  const normalizedCategory = String(categoryRaw).toLowerCase().trim().replace(/[\s_/.]+/g, '-');
  
  // Since we are not fetching the `items` subcollection for the thumbnail to avoid heavy queries in Pixel Marketing,
  // we just use the directThumbnail if available, otherwise the category image.
  const displayImage = directThumbnail || CATEGORY_IMAGES[normalizedCategory] || CATEGORY_IMAGES['solvent'] || '/images/categories/solvent.png';
  const isDesignByUs = displayImage === 'DESIGN_BY_US' || 
    (typeof displayImage === 'string' && displayImage.endsWith('DESIGN_BY_US')) || 
    order?.workflow?.customerDesignUrl === 'DESIGN_BY_US';

  if (isDesignByUs) {
    return (
      <div className={`relative overflow-hidden border border-indigo-100 bg-gradient-to-br from-indigo-50 to-indigo-100 flex flex-col items-center justify-center text-indigo-600 shadow-sm ${dims} ${className}`}>
        <span className="material-symbols-outlined text-indigo-500 text-2xl animate-pulse">palette</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-indigo-700 mt-1 select-none">Design</span>
      </div>
    );
  }

  return (
    <div className={`relative group overflow-hidden border border-slate-100 shadow-sm transition-transform duration-500 hover:scale-110 ${dims} ${className}`}>
      <img 
        src={displayImage} 
        alt="Preview" 
        className="w-full h-full object-cover transition-transform duration-700 group-hover:rotate-3"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          if (!target.src.includes('solvent.png')) {
            target.src = '/images/categories/solvent.png';
          }
        }}
      />
    </div>
  );
};
