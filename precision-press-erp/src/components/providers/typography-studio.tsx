"use client";

import React, { useState, useEffect } from "react";
import { Sliders, Check, X, Sparkles, RefreshCw } from "lucide-react";

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

const FONT_OPTIONS = [
  {
    name: "SF Mono",
    stack: "'SF Mono', 'SFMono-Regular', ui-monospace, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
    tag: "Apple Clean",
  },
  {
    name: "JetBrains Mono",
    stack: "'JetBrains Mono', monospace",
    tag: "IDE High-Precision",
  },
  {
    name: "Fira Code",
    stack: "'Fira Code', monospace",
    tag: "Clean Industrial",
  },
  {
    name: "Roboto Mono",
    stack: "'Roboto Mono', monospace",
    tag: "Google Modern",
  },
  {
    name: "IBM Plex Mono",
    stack: "'IBM Plex Mono', monospace",
    tag: "Corporate Tech",
  },
  {
    name: "Inter (Sans)",
    stack: "'Inter', system-ui, -apple-system, sans-serif",
    tag: "Modern Sans",
  },
];

const SIZE_OPTIONS = [12, 13, 14, 15, 16];

const WEIGHT_OPTIONS = [
  { label: "Regular", weight: 400 },
  { label: "Medium", weight: 500 },
  { label: "Semibold", weight: 600 },
  { label: "Bold", weight: 700 },
  { label: "Extra Bold", weight: 800 },
];

function applyTypography(settings: TypographySettings) {
  if (typeof document === "undefined") return;

  const fontObj = FONT_OPTIONS.find((f) => f.name === settings.fontFamily) || FONT_OPTIONS[0];
  const fontStack = fontObj.stack;

  let styleEl = document.getElementById("live-erp-typography") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "live-erp-typography";
    document.head.appendChild(styleEl);
  }

  styleEl.innerHTML = `
    html, body, input, select, textarea, button, table, div, span, p, a, label, th, td, h1, h2, h3, h4, h5, h6, small, caption, code {
      font-family: ${fontStack} !important;
      font-weight: ${settings.fontWeight} !important;
      letter-spacing: ${settings.letterSpacing} !important;
    }
    body {
      font-size: ${settings.fontSize}px !important;
    }
    p, span, div, a, label, td, th, input, select, textarea, button {
      font-size: ${settings.fontSize}px !important;
    }
    .text-xs, [class*="text-\\[10px\\]"], [class*="text-\\[11px\\]"], [class*="text-\\[12px\\]"], [class*="text-\\[13px\\]"], [class*="text-\\[14px\\]"] {
      font-size: ${settings.fontSize}px !important;
    }
    table, td, th {
      font-size: ${settings.fontSize}px !important;
    }
  `;
}

export function TypographyStudio() {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<TypographySettings>(DEFAULT_SETTINGS);
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

  if (!mounted) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[999999] font-sans antialiased">
      {/* Floating Trigger Pill */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded-full bg-slate-900/90 text-white px-4 py-2.5 shadow-2xl backdrop-blur-md border border-slate-700/80 hover:bg-slate-950 hover:scale-105 transition-all duration-200 group cursor-pointer"
          title="Open Live Font & Typography Studio"
        >
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-[10px] font-black text-white">
            Aa
          </span>
          <span className="text-xs font-black tracking-wider uppercase">
            Font Studio
          </span>
          <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded-md font-bold">
            {settings.fontFamily} • {settings.fontSize}px
          </span>
        </button>
      )}

      {/* Live Studio Modal / Card */}
      {isOpen && (
        <div className="w-[360px] rounded-3xl bg-white/95 text-slate-900 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.25)] border border-slate-200/80 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-blue-50 text-blue-600">
                <Sliders size={16} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  Typography Studio
                  <span className="bg-emerald-100 text-emerald-700 text-[9px] px-1.5 py-0.5 rounded-md font-black">
                    LIVE
                  </span>
                </h3>
                <p className="text-[10px] font-medium text-slate-400">
                  Instant live full-website preview
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* 1. Quick Presets */}
          <div className="mb-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
              Quick Presets
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() =>
                  updateSetting({ fontFamily: "SF Mono", fontSize: 14, fontWeight: 600 })
                }
                className="flex items-center gap-1.5 p-2 rounded-xl text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200/60 hover:bg-blue-100 transition-all text-left"
              >
                <Sparkles size={12} className="shrink-0" />
                <span>Boss: SF Mono 14px</span>
              </button>
              <button
                onClick={() =>
                  updateSetting({ fontFamily: "JetBrains Mono", fontSize: 14, fontWeight: 600 })
                }
                className="flex items-center gap-1.5 p-2 rounded-xl text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200/60 hover:bg-purple-100 transition-all text-left"
              >
                <Sparkles size={12} className="shrink-0" />
                <span>JetBrains 14px</span>
              </button>
              <button
                onClick={() =>
                  updateSetting({ fontFamily: "SF Mono", fontSize: 12, fontWeight: 600 })
                }
                className="flex items-center gap-1.5 p-2 rounded-xl text-[10px] font-bold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-all text-left"
              >
                <span>Compact 12px</span>
              </button>
              <button
                onClick={() =>
                  updateSetting({ fontFamily: "SF Mono", fontSize: 16, fontWeight: 700 })
                }
                className="flex items-center gap-1.5 p-2 rounded-xl text-[10px] font-bold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-all text-left"
              >
                <span>Large 16px Bold</span>
              </button>
            </div>
          </div>

          {/* 2. Font Family Selection */}
          <div className="mb-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
              Font Family
            </label>
            <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
              {FONT_OPTIONS.map((f) => {
                const isSelected = settings.fontFamily === f.name;
                return (
                  <button
                    key={f.name}
                    onClick={() => updateSetting({ fontFamily: f.name })}
                    className={`flex flex-col text-left p-2 rounded-xl border transition-all ${
                      isSelected
                        ? "bg-slate-900 text-white border-slate-900 shadow-md font-bold"
                        : "bg-slate-50 text-slate-700 border-slate-200/70 hover:bg-slate-100 font-semibold"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold truncate">{f.name}</span>
                      {isSelected && <Check size={12} className="text-blue-400 shrink-0 ml-1" />}
                    </div>
                    <span
                      className={`text-[8px] uppercase tracking-wider ${
                        isSelected ? "text-slate-400" : "text-slate-400"
                      }`}
                    >
                      {f.tag}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Font Size */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Font Size
              </label>
              <span className="text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                {settings.fontSize}px
              </span>
            </div>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              {SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  onClick={() => updateSetting({ fontSize: size })}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${
                    settings.fontSize === size
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Font Weight */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Weight (Boldness)
              </label>
              <span className="text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                {WEIGHT_OPTIONS.find((w) => w.weight === settings.fontWeight)?.label || settings.fontWeight}
              </span>
            </div>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              {WEIGHT_OPTIONS.map((w) => (
                <button
                  key={w.weight}
                  onClick={() => updateSetting({ fontWeight: w.weight })}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                    settings.fontWeight === w.weight
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {w.weight}
                </button>
              ))}
            </div>
          </div>

          {/* Footer Reset */}
          <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
            <button
              onClick={handleReset}
              className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-700 transition-colors"
            >
              <RefreshCw size={10} />
              Reset Default
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-xl bg-slate-900 text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider hover:bg-slate-800 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
