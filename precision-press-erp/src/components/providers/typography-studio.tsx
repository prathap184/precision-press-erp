"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Sliders, Check, X, Search, RefreshCw, Layers } from "lucide-react";

export interface TypographySettings {
  fontFamily: string;
  fontSize: number; // in px, e.g. 14
  fontWeight: number; // e.g. 600
  letterSpacing: string;
}

const DEFAULT_SETTINGS: TypographySettings = {
  fontFamily: "SF Mono",
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: "-0.01em",
};

export interface FontOption {
  name: string;
  category: "Mono" | "Sans" | "Serif" | "Display";
  stack: string;
  tag: string;
  googleFontName?: string;
}

const ALL_FONT_OPTIONS: FontOption[] = [
  // ─── MONOSPACE FONTS ───
  {
    name: "SF Mono",
    category: "Mono",
    stack: "'SF Mono', 'SFMono-Regular', ui-monospace, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
    tag: "Apple Clean",
  },
  {
    name: "JetBrains Mono",
    category: "Mono",
    stack: "'JetBrains Mono', monospace",
    tag: "IDE Precision",
    googleFontName: "JetBrains+Mono",
  },
  {
    name: "Fira Code",
    category: "Mono",
    stack: "'Fira Code', monospace",
    tag: "Industrial Code",
    googleFontName: "Fira+Code",
  },
  {
    name: "Roboto Mono",
    category: "Mono",
    stack: "'Roboto Mono', monospace",
    tag: "Google Modern",
    googleFontName: "Roboto+Mono",
  },
  {
    name: "IBM Plex Mono",
    category: "Mono",
    stack: "'IBM Plex Mono', monospace",
    tag: "Corporate Tech",
    googleFontName: "IBM+Plex+Mono",
  },
  {
    name: "Source Code Pro",
    category: "Mono",
    stack: "'Source Code Pro', monospace",
    tag: "Adobe Studio",
    googleFontName: "Source+Code+Pro",
  },
  {
    name: "Inconsolata",
    category: "Mono",
    stack: "'Inconsolata', monospace",
    tag: "High Legibility",
    googleFontName: "Inconsolata",
  },
  {
    name: "Space Mono",
    category: "Mono",
    stack: "'Space Mono', monospace",
    tag: "Geometric Retro",
    googleFontName: "Space+Mono",
  },
  {
    name: "Ubuntu Mono",
    category: "Mono",
    stack: "'Ubuntu Mono', monospace",
    tag: "Linux Terminal",
    googleFontName: "Ubuntu+Mono",
  },
  {
    name: "DM Mono",
    category: "Mono",
    stack: "'DM Mono', monospace",
    tag: "Modern Minimal",
    googleFontName: "DM+Mono",
  },
  {
    name: "Overpass Mono",
    category: "Mono",
    stack: "'Overpass Mono', monospace",
    tag: "Red Hat System",
    googleFontName: "Overpass+Mono",
  },
  {
    name: "PT Mono",
    category: "Mono",
    stack: "'PT Mono', monospace",
    tag: "Compact Grid",
    googleFontName: "PT+Mono",
  },
  {
    name: "Share Tech Mono",
    category: "Mono",
    stack: "'Share Tech Mono', monospace",
    tag: "Military HUD",
    googleFontName: "Share+Tech+Mono",
  },
  {
    name: "Courier Prime",
    category: "Mono",
    stack: "'Courier Prime', monospace",
    tag: "Classic Typewriter",
    googleFontName: "Courier+Prime",
  },
  {
    name: "Anonymous Pro",
    category: "Mono",
    stack: "'Anonymous Pro', monospace",
    tag: "Hacker Terminal",
    googleFontName: "Anonymous+Pro",
  },
  {
    name: "Consolas",
    category: "Mono",
    stack: "Consolas, 'Lucida Console', Monaco, monospace",
    tag: "Windows Native",
  },

  // ─── SANS-SERIF MODERN FONTS ───
  {
    name: "Inter",
    category: "Sans",
    stack: "'Inter', system-ui, -apple-system, sans-serif",
    tag: "Silicon Valley Standard",
    googleFontName: "Inter",
  },
  {
    name: "Plus Jakarta Sans",
    category: "Sans",
    stack: "'Plus Jakarta Sans', sans-serif",
    tag: "SaaS Premium",
    googleFontName: "Plus+Jakarta+Sans",
  },
  {
    name: "Geist",
    category: "Sans",
    stack: "'Geist', system-ui, sans-serif",
    tag: "Vercel Modern",
  },
  {
    name: "Poppins",
    category: "Sans",
    stack: "'Poppins', sans-serif",
    tag: "Geometric Rounded",
    googleFontName: "Poppins",
  },
  {
    name: "Outfit",
    category: "Sans",
    stack: "'Outfit', sans-serif",
    tag: "Clean Luxury",
    googleFontName: "Outfit",
  },
  {
    name: "Montserrat",
    category: "Sans",
    stack: "'Montserrat', sans-serif",
    tag: "Bold Modern",
    googleFontName: "Montserrat",
  },
  {
    name: "Manrope",
    category: "Sans",
    stack: "'Manrope', sans-serif",
    tag: "Fintech Precision",
    googleFontName: "Manrope",
  },
  {
    name: "Urbanist",
    category: "Sans",
    stack: "'Urbanist', sans-serif",
    tag: "High Fashion",
    googleFontName: "Urbanist",
  },
  {
    name: "Lexend",
    category: "Sans",
    stack: "'Lexend', sans-serif",
    tag: "Fast Readability",
    googleFontName: "Lexend",
  },
  {
    name: "Space Grotesk",
    category: "Sans",
    stack: "'Space Grotesk', sans-serif",
    tag: "Tech Brutalism",
    googleFontName: "Space+Grotesk",
  },
  {
    name: "DM Sans",
    category: "Sans",
    stack: "'DM Sans', sans-serif",
    tag: "Clean Corporate",
    googleFontName: "DM+Sans",
  },
  {
    name: "Nunito Sans",
    category: "Sans",
    stack: "'Nunito Sans', sans-serif",
    tag: "Soft & Readable",
    googleFontName: "Nunito+Sans",
  },
  {
    name: "Open Sans",
    category: "Sans",
    stack: "'Open Sans', sans-serif",
    tag: "Classic Web",
    googleFontName: "Open+Sans",
  },
  {
    name: "Work Sans",
    category: "Sans",
    stack: "'Work Sans', sans-serif",
    tag: "Clean Typography",
    googleFontName: "Work+Sans",
  },
  {
    name: "Public Sans",
    category: "Sans",
    stack: "'Public Sans', sans-serif",
    tag: "Government Precision",
    googleFontName: "Public+Sans",
  },
  {
    name: "Roboto",
    category: "Sans",
    stack: "'Roboto', sans-serif",
    tag: "Android Standard",
    googleFontName: "Roboto",
  },

  // ─── SERIF & EDITORIAL ───
  {
    name: "Playfair Display",
    category: "Serif",
    stack: "'Playfair Display', serif",
    tag: "Luxury Editorial",
    googleFontName: "Playfair+Display",
  },
  {
    name: "Merriweather",
    category: "Serif",
    stack: "'Merriweather', serif",
    tag: "Newspaper Classic",
    googleFontName: "Merriweather",
  },
  {
    name: "Lora",
    category: "Serif",
    stack: "'Lora', serif",
    tag: "Elegant Calligraphy",
    googleFontName: "Lora",
  },
  {
    name: "Cinzel",
    category: "Serif",
    stack: "'Cinzel', serif",
    tag: "Roman Monumental",
    googleFontName: "Cinzel",
  },
];

const SIZE_OPTIONS = [12, 13, 14, 15, 16, 17, 18];

const WEIGHT_OPTIONS = [
  { label: "Regular", weight: 400 },
  { label: "Medium", weight: 500 },
  { label: "Semibold", weight: 600 },
  { label: "Bold", weight: 700 },
  { label: "Extra Bold", weight: 800 },
];

function applyTypography(settings: TypographySettings) {
  if (typeof document === "undefined") return;

  const fontObj = ALL_FONT_OPTIONS.find((f) => f.name === settings.fontFamily) || ALL_FONT_OPTIONS[0];
  const fontStack = fontObj.stack;

  // Dynamically load Google Font if needed
  if (fontObj.googleFontName) {
    const linkId = `google-font-${fontObj.googleFontName.replace(/\+/g, "-")}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${fontObj.googleFontName}:wght@400;500;600;700;800;900&display=swap`;
      document.head.appendChild(link);
    }
  }

  // 1. Set CSS root variables directly on root
  document.documentElement.style.setProperty("--app-font-family", fontStack);
  document.documentElement.style.setProperty("--app-font-size", `${settings.fontSize}px`);
  document.documentElement.style.setProperty("--app-font-weight", `${settings.fontWeight}`);
  document.documentElement.style.setProperty("--app-letter-spacing", settings.letterSpacing || "-0.01em");

  // 2. High-specificity stylesheet injection
  let styleEl = document.getElementById("live-erp-typography") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "live-erp-typography";
    document.head.appendChild(styleEl);
  }

  styleEl.innerHTML = `
    :root {
      --app-font-family: ${fontStack};
      --app-font-size: ${settings.fontSize}px;
      --app-font-weight: ${settings.fontWeight};
    }
    * {
      font-family: ${fontStack} !important;
    }
    html, body, input, select, textarea, button, table, div, span, p, a, label, th, td, h1, h2, h3, h4, h5, h6, small, caption, code, b, strong {
      font-family: ${fontStack} !important;
      font-weight: ${settings.fontWeight} !important;
      letter-spacing: ${settings.letterSpacing || "-0.01em"} !important;
    }
    body, p, span, div, a, label, td, th, input, select, textarea, button {
      font-size: ${settings.fontSize}px !important;
      font-weight: ${settings.fontWeight} !important;
    }
    .font-normal, .font-medium, .font-semibold, .font-bold, .font-extrabold, .font-black, [class*="font-"] {
      font-weight: ${settings.fontWeight} !important;
    }
    .text-xs, .text-sm, .text-base, [class*="text-"] {
      font-size: ${settings.fontSize}px !important;
    }
    table, td, th {
      font-size: ${settings.fontSize}px !important;
      font-weight: ${settings.fontWeight} !important;
    }
  `;
}

export function TypographyStudio() {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<TypographySettings>(DEFAULT_SETTINGS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<"ALL" | "Mono" | "Sans" | "Serif">("ALL");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("erp_typography_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        setSettings(parsed);
        applyTypography(parsed);
        return;
      }
    } catch {}
    applyTypography(DEFAULT_SETTINGS);
  }, []);

  const updateSetting = (patch: Partial<TypographySettings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    applyTypography(updated);
    try {
      localStorage.setItem("erp_typography_settings", JSON.stringify(updated));
    } catch {}
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    applyTypography(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem("erp_typography_settings");
    } catch {}
  };

  // Filtered fonts based on search & category
  const filteredFonts = useMemo(() => {
    return ALL_FONT_OPTIONS.filter((f) => {
      const matchesCategory = selectedCategory === "ALL" || f.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        f.name.toLowerCase().includes(q) ||
        f.tag.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  if (!mounted) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[999999] font-sans antialiased">
      {/* Floating Trigger Pill */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2.5 rounded-full bg-slate-900/95 text-white px-5 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-md border border-slate-700/80 hover:bg-slate-950 hover:scale-105 transition-all duration-200 group cursor-pointer"
          title="Open Live Font & Typography Studio"
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-xs font-black text-white shadow-sm">
            Aa
          </span>
          <div className="text-left">
            <span className="text-xs font-black tracking-wider uppercase block leading-tight">
              Font Studio
            </span>
            <span className="text-[10px] text-blue-300 font-bold">
              {settings.fontFamily} • {settings.fontSize}px • {settings.fontWeight}
            </span>
          </div>
        </button>
      )}

      {/* Large Studio Window (Big Box & Searchable) */}
      {isOpen && (
        <div className="w-[500px] max-w-[95vw] max-h-[90vh] flex flex-col rounded-3xl bg-white text-slate-900 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.3)] border border-slate-200/90 backdrop-blur-3xl animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-600 shadow-sm border border-blue-100">
                <Sliders size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  Typography Studio
                  <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-md font-black">
                    LIVE
                  </span>
                </h3>
                <p className="text-[11px] font-medium text-slate-400">
                  Search & preview 35+ typography styles across the entire website
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-2xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Search Bar & Category Filter */}
          <div className="mb-4 space-y-2 shrink-0">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by font name (e.g. JetBrains, SF Mono, Inter, Fira)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl">
              {(["ALL", "Mono", "Sans", "Serif"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    selectedCategory === cat
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {cat === "ALL" ? "All Fonts" : `${cat}space`}
                </button>
              ))}
            </div>
          </div>

          {/* Font Family Selection Grid (Big Scrollable Area) */}
          <div className="mb-5 flex-1 min-h-[160px] max-h-[260px] overflow-y-auto pr-1">
            {filteredFonts.length === 0 ? (
              <div className="p-8 text-center text-xs font-semibold text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                No fonts matching "{searchQuery}". Try another name!
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredFonts.map((f) => {
                  const isSelected = settings.fontFamily === f.name;
                  return (
                    <button
                      key={f.name}
                      onClick={() => updateSetting({ fontFamily: f.name })}
                      className={`flex flex-col text-left p-3 rounded-2xl border transition-all ${
                        isSelected
                          ? "bg-slate-900 text-white border-slate-900 shadow-lg ring-2 ring-blue-500/50 font-bold scale-[1.01]"
                          : "bg-slate-50 text-slate-700 border-slate-200/80 hover:bg-slate-100/90 font-semibold"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-black truncate">{f.name}</span>
                        {isSelected ? (
                          <Check size={14} className="text-blue-400 shrink-0 ml-1" />
                        ) : (
                          <span className="text-[8px] font-bold text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded-md">
                            {f.category}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[9px] uppercase tracking-wider truncate ${
                          isSelected ? "text-blue-200" : "text-slate-400"
                        }`}
                      >
                        {f.tag}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Size & Weight Controls (Bottom Area) */}
          <div className="space-y-4 pt-4 border-t border-slate-100 shrink-0 bg-white">
            {/* Font Size */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Font Size
                </label>
                <span className="text-xs font-black text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-100">
                  {settings.fontSize}px
                </span>
              </div>
              <div className="flex gap-1.5 bg-slate-100 p-1.5 rounded-2xl">
                {SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    onClick={() => updateSetting({ fontSize: size })}
                    className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
                      settings.fontSize === size
                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                        : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Weight */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Weight (Boldness)
                </label>
                <span className="text-xs font-black text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-100">
                  {WEIGHT_OPTIONS.find((w) => w.weight === settings.fontWeight)?.label || settings.fontWeight} ({settings.fontWeight})
                </span>
              </div>
              <div className="flex gap-1.5 bg-slate-100 p-1.5 rounded-2xl">
                {WEIGHT_OPTIONS.map((w) => (
                  <button
                    key={w.weight}
                    onClick={() => updateSetting({ fontWeight: w.weight })}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all ${
                      settings.fontWeight === w.weight
                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                        : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
                    }`}
                  >
                    {w.weight}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-700 transition-colors"
              >
                <RefreshCw size={12} />
                Reset (SF Mono 14px Semibold)
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-2xl bg-slate-900 text-white px-5 py-2 text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-colors shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
