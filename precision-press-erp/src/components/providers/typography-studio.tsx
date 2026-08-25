"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Sliders, Check, X, Search, RefreshCw, Type, Monitor, Apple, Terminal } from "lucide-react";

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
  category: "Mono" | "Windows" | "Mac" | "Sans" | "Serif";
  stack: string;
  tag: string;
  googleFontName?: string;
}

const ALL_FONT_OPTIONS: FontOption[] = [
  // ══════════════════════════════════════════════════════════════
  // 1. ALL TYPES OF MONOSPACE (26+ MONO FONTS)
  // ══════════════════════════════════════════════════════════════
  {
    name: "SF Mono",
    category: "Mono",
    stack: "'SF Mono', 'SFMono-Regular', ui-monospace, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
    tag: "Apple Developer Mono",
  },
  {
    name: "JetBrains Mono",
    category: "Mono",
    stack: "'JetBrains Mono', monospace",
    tag: "IDE Precision Mono",
    googleFontName: "JetBrains+Mono",
  },
  {
    name: "Cascadia Code",
    category: "Mono",
    stack: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    tag: "Microsoft Windows Terminal",
  },
  {
    name: "Fira Code",
    category: "Mono",
    stack: "'Fira Code', monospace",
    tag: "Mozilla Industrial Mono",
    googleFontName: "Fira+Code",
  },
  {
    name: "Consolas",
    category: "Mono",
    stack: "Consolas, 'Lucida Console', Monaco, monospace",
    tag: "Windows Native Mono",
  },
  {
    name: "Roboto Mono",
    category: "Mono",
    stack: "'Roboto Mono', monospace",
    tag: "Google Modern Mono",
    googleFontName: "Roboto+Mono",
  },
  {
    name: "IBM Plex Mono",
    category: "Mono",
    stack: "'IBM Plex Mono', monospace",
    tag: "IBM Corporate Tech",
    googleFontName: "IBM+Plex+Mono",
  },
  {
    name: "Source Code Pro",
    category: "Mono",
    stack: "'Source Code Pro', monospace",
    tag: "Adobe Studio Mono",
    googleFontName: "Source+Code+Pro",
  },
  {
    name: "Inconsolata",
    category: "Mono",
    stack: "'Inconsolata', monospace",
    tag: "High-Density Readability",
    googleFontName: "Inconsolata",
  },
  {
    name: "Menlo",
    category: "Mono",
    stack: "Menlo, 'SF Mono', Monaco, monospace",
    tag: "macOS Developer Standard",
  },
  {
    name: "Monaco",
    category: "Mono",
    stack: "Monaco, Menlo, 'Courier New', monospace",
    tag: "Classic macOS Terminal",
  },
  {
    name: "Lucida Console",
    category: "Mono",
    stack: "'Lucida Console', Monaco, monospace",
    tag: "Classic Windows Mono",
  },
  {
    name: "Courier New",
    category: "Mono",
    stack: "'Courier New', Courier, monospace",
    tag: "Universal System Mono",
  },
  {
    name: "Courier Prime",
    category: "Mono",
    stack: "'Courier Prime', monospace",
    tag: "Clean Typewriter",
    googleFontName: "Courier+Prime",
  },
  {
    name: "Space Mono",
    category: "Mono",
    stack: "'Space Mono', monospace",
    tag: "Geometric Retro Mono",
    googleFontName: "Space+Mono",
  },
  {
    name: "Ubuntu Mono",
    category: "Mono",
    stack: "'Ubuntu Mono', monospace",
    tag: "Linux Terminal Standard",
    googleFontName: "Ubuntu+Mono",
  },
  {
    name: "DM Mono",
    category: "Mono",
    stack: "'DM Mono', monospace",
    tag: "Minimalist Modern Mono",
    googleFontName: "DM+Mono",
  },
  {
    name: "Overpass Mono",
    category: "Mono",
    stack: "'Overpass Mono', monospace",
    tag: "Red Hat System Mono",
    googleFontName: "Overpass+Mono",
  },
  {
    name: "PT Mono",
    category: "Mono",
    stack: "'PT Mono', monospace",
    tag: "Compact Grid Mono",
    googleFontName: "PT+Mono",
  },
  {
    name: "Share Tech Mono",
    category: "Mono",
    stack: "'Share Tech Mono', monospace",
    tag: "Military HUD Terminal",
    googleFontName: "Share+Tech+Mono",
  },
  {
    name: "Anonymous Pro",
    category: "Mono",
    stack: "'Anonymous Pro', monospace",
    tag: "Hacker Terminal Classic",
    googleFontName: "Anonymous+Pro",
  },
  {
    name: "Oxygen Mono",
    category: "Mono",
    stack: "'Oxygen Mono', monospace",
    tag: "KDE Desktop Mono",
    googleFontName: "Oxygen+Mono",
  },
  {
    name: "Nova Mono",
    category: "Mono",
    stack: "'Nova Mono', monospace",
    tag: "Modern Geometric",
    googleFontName: "Nova+Mono",
  },
  {
    name: "Cutive Mono",
    category: "Mono",
    stack: "'Cutive Mono', monospace",
    tag: "Vintage Typewriter",
    googleFontName: "Cutive+Mono",
  },
  {
    name: "VT323",
    category: "Mono",
    stack: "'VT323', monospace",
    tag: "Retro 80s Terminal",
    googleFontName: "VT323",
  },

  // ══════════════════════════════════════════════════════════════
  // 2. WINDOWS SYSTEM & ENTERPRISE FONTS
  // ══════════════════════════════════════════════════════════════
  {
    name: "Segoe UI",
    category: "Windows",
    stack: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    tag: "Windows Native Standard",
  },
  {
    name: "Calibri",
    category: "Windows",
    stack: "Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif",
    tag: "Microsoft Office Classic",
  },
  {
    name: "Arial",
    category: "Windows",
    stack: "Arial, Helvetica, sans-serif",
    tag: "Universal Clean Sans",
  },
  {
    name: "Tahoma",
    category: "Windows",
    stack: "Tahoma, Verdana, Segoe, sans-serif",
    tag: "Windows Dialog Classic",
  },
  {
    name: "Verdana",
    category: "Windows",
    stack: "Verdana, Geneva, sans-serif",
    tag: "Wide High-Legibility",
  },
  {
    name: "Trebuchet MS",
    category: "Windows",
    stack: "'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', sans-serif",
    tag: "Dynamic Clean Sans",
  },
  {
    name: "Candara",
    category: "Windows",
    stack: "Candara, Calibri, Segoe, 'Segoe UI', Optima, sans-serif",
    tag: "Fluent UI Microsoft",
  },
  {
    name: "Corbel",
    category: "Windows",
    stack: "Corbel, 'Lucida Grande', 'Lucida Sans Unicode', sans-serif",
    tag: "Microsoft Soft Sans",
  },
  {
    name: "Century Gothic",
    category: "Windows",
    stack: "'Century Gothic', AppleGothic, sans-serif",
    tag: "Geometric Clean",
  },
  {
    name: "Franklin Gothic",
    category: "Windows",
    stack: "'Franklin Gothic Medium', 'Arial Narrow Bold', Arial, sans-serif",
    tag: "Industrial News Bold",
  },
  {
    name: "Georgia",
    category: "Windows",
    stack: "Georgia, Times, 'Times New Roman', serif",
    tag: "Standard Windows Serif",
  },
  {
    name: "Times New Roman",
    category: "Windows",
    stack: "'Times New Roman', Times, serif",
    tag: "Classic Document Serif",
  },
  {
    name: "Impact",
    category: "Windows",
    stack: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
    tag: "Heavy Headline Bold",
  },

  // ══════════════════════════════════════════════════════════════
  // 3. APPLE / MAC SYSTEM FONTS
  // ══════════════════════════════════════════════════════════════
  {
    name: "SF Pro (System)",
    category: "Mac",
    stack: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
    tag: "Apple Native System UI",
  },
  {
    name: "Helvetica Neue",
    category: "Mac",
    stack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    tag: "Swiss International Style",
  },
  {
    name: "Avenir Next",
    category: "Mac",
    stack: "'Avenir Next', Avenir, 'Century Gothic', sans-serif",
    tag: "Modern Apple Geometry",
  },
  {
    name: "Optima",
    category: "Mac",
    stack: "Optima, Segoe, 'Segoe UI', Candara, Calibri, Arial, sans-serif",
    tag: "Humanist Luxury Sans",
  },
  {
    name: "Gill Sans",
    category: "Mac",
    stack: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif",
    tag: "British Design Classic",
  },
  {
    name: "Baskerville",
    category: "Mac",
    stack: "Baskerville, 'Baskerville Old Face', 'Hoefler Text', Garamond, 'Times New Roman', serif",
    tag: "Refined British Serif",
  },
  {
    name: "Didot",
    category: "Mac",
    stack: "Didot, 'Bodoni MT', 'Cinzel', serif",
    tag: "High Fashion Luxury",
  },
  {
    name: "Charter",
    category: "Mac",
    stack: "Charter, 'Bitstream Charter', Georgia, serif",
    tag: "Bitstream Editorial Serif",
  },
  {
    name: "Palatino",
    category: "Mac",
    stack: "Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif",
    tag: "Executive Renaissance Serif",
  },

  // ══════════════════════════════════════════════════════════════
  // 4. MODERN WEB & DESIGN SYSTEM SANS FONTS
  // ══════════════════════════════════════════════════════════════
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
    tag: "Modern SaaS Premium",
    googleFontName: "Plus+Jakarta+Sans",
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
    tag: "Clean Luxury Brand",
    googleFontName: "Outfit",
  },
  {
    name: "Montserrat",
    category: "Sans",
    stack: "'Montserrat', sans-serif",
    tag: "Urban Architectural",
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
    tag: "High-Tech Minimalist",
    googleFontName: "Urbanist",
  },
  {
    name: "Lexend",
    category: "Sans",
    stack: "'Lexend', sans-serif",
    tag: "Reading Speed Optimized",
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
    tag: "Classic Web Neutral",
    googleFontName: "Open+Sans",
  },
  {
    name: "Work Sans",
    category: "Sans",
    stack: "'Work Sans', sans-serif",
    tag: "Graphic Design Clean",
    googleFontName: "Work+Sans",
  },
  {
    name: "Public Sans",
    category: "Sans",
    stack: "'Public Sans', sans-serif",
    tag: "US Government Precision",
    googleFontName: "Public+Sans",
  },
  {
    name: "Roboto",
    category: "Sans",
    stack: "'Roboto', sans-serif",
    tag: "Google Android Standard",
    googleFontName: "Roboto",
  },

  // ══════════════════════════════════════════════════════════════
  // 5. EDITORIAL & SERIF FONTS
  // ══════════════════════════════════════════════════════════════
  {
    name: "Playfair Display",
    category: "Serif",
    stack: "'Playfair Display', serif",
    tag: "Vogue Luxury Editorial",
    googleFontName: "Playfair+Display",
  },
  {
    name: "Merriweather",
    category: "Serif",
    stack: "'Merriweather', serif",
    tag: "Newspaper High-Legibility",
    googleFontName: "Merriweather",
  },
  {
    name: "Lora",
    category: "Serif",
    stack: "'Lora', serif",
    tag: "Contemporary Calligraphy",
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

  const fontObj = ALL_FONT_OPTIONS.find((f) => f.name === settings.fontFamily);
  const fontStack = fontObj ? fontObj.stack : `'${settings.fontFamily}', monospace, sans-serif`;

  // Dynamically load Google Font if needed
  if (fontObj && fontObj.googleFontName) {
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
  const [customFontInput, setCustomFontInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<"ALL" | "Mono" | "Windows" | "Mac" | "Sans" | "Serif">("ALL");
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

  const handleApplyCustomFont = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFontInput.trim()) return;
    updateSetting({ fontFamily: customFontInput.trim() });
    setCustomFontInput("");
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
          className="flex items-center gap-3 rounded-full bg-slate-900/95 text-white px-5 py-3 shadow-[0_12px_45px_rgba(0,0,0,0.4)] backdrop-blur-md border border-slate-700/80 hover:bg-slate-950 hover:scale-105 transition-all duration-200 group cursor-pointer"
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
        <div className="w-[540px] max-w-[95vw] max-h-[92vh] flex flex-col rounded-3xl bg-white text-slate-900 p-6 shadow-[0_30px_70px_rgba(0,0,0,0.35)] border border-slate-200/90 backdrop-blur-3xl animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 mb-3 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-600 shadow-sm border border-blue-100">
                <Sliders size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  Typography Studio
                  <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-md font-black">
                    70+ FONTS LIVE
                  </span>
                </h3>
                <p className="text-[11px] font-medium text-slate-400">
                  Instant real-time preview across the entire website
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

          {/* Search Bar & Custom Font Name Input */}
          <div className="mb-3 space-y-2 shrink-0">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search 70+ fonts (JetBrains, SF Mono, Segoe UI, Arial, Cascadia)..."
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
            <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl overflow-x-auto">
              {[
                { id: "ALL", label: "All Fonts" },
                { id: "Mono", label: "25+ Mono", icon: Terminal },
                { id: "Windows", label: "Windows", icon: Monitor },
                { id: "Mac", label: "Apple/Mac", icon: Apple },
                { id: "Sans", label: "Sans-Serif" },
                { id: "Serif", label: "Serif" },
              ].map((cat: any) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center justify-center gap-1 ${
                    selectedCategory === cat.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font Family Selection Grid (Big Scrollable Area) */}
          <div className="mb-4 flex-1 min-h-[160px] max-h-[250px] overflow-y-auto pr-1">
            {filteredFonts.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-xs font-semibold text-slate-500 mb-2">No presets matching "{searchQuery}"</p>
                <form onSubmit={handleApplyCustomFont} className="flex gap-2 max-w-xs mx-auto">
                  <input
                    type="text"
                    placeholder="Type custom font name..."
                    value={customFontInput}
                    onChange={(e) => setCustomFontInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs border rounded-xl"
                  />
                  <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold">
                    Apply
                  </button>
                </form>
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
                      <div className="flex items-center justify-between mb-0.5">
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
          <div className="space-y-3.5 pt-3.5 border-t border-slate-100 shrink-0 bg-white">
            {/* Font Size */}
            <div>
              <div className="flex justify-between items-center mb-1">
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
                    className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all ${
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
              <div className="flex justify-between items-center mb-1">
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
                    className={`flex-1 py-1.5 rounded-xl text-[10px] font-black transition-all ${
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

            {/* Custom Font Quick Input Bar */}
            <form onSubmit={handleApplyCustomFont} className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-2xl p-1.5">
              <Type size={14} className="text-slate-400 ml-2" />
              <input
                type="text"
                placeholder="Or type any custom font name (e.g. Comic Sans MS, Monaco, Georgia)..."
                value={customFontInput}
                onChange={(e) => setCustomFontInput(e.target.value)}
                className="flex-1 bg-transparent text-xs font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-normal outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-800 transition-colors"
              >
                Apply
              </button>
            </form>

            {/* Footer Actions */}
            <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
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
