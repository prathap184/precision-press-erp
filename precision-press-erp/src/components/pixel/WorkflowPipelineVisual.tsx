"use client";

import React from "react";
import { Check, Play, AlertCircle, Clock, Lock, ChevronRight, ExternalLink } from "lucide-react";

export function WorkflowPipelineVisual({
  snapshot,
  orderId,
  className = "",
  detailed = false,
}: any) {
  if (!snapshot || !snapshot.steps || snapshot.steps.length === 0) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <span className="text-[9px] font-bold text-slate-400 italic">No Pipeline</span>
      </div>
    );
  }

  const isAdmin = true; // Read-only view for Pixel Marketing

  let stepsToRender = snapshot.steps.map((step: any, index: number) => ({
    ...step,
    originalIndex: index,
    isCurrent: index === snapshot.currentStepIndex,
    isCompleted: index < snapshot.currentStepIndex,
  }));

  if (stepsToRender.length === 0) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <span className="text-[9px] font-bold text-slate-400 italic">No Stages for Assigned Roles</span>
      </div>
    );
  }

  const renderDetailedStep = (step: any, isLast: boolean) => {
    let statusColor = "bg-slate-100 border-slate-200 text-slate-400";
    let icon = <Lock size={12} />;
    let statusText = "PENDING";
    let dotColor = "bg-slate-300";

    if (step.isCompleted || step.status === "COMPLETED") {
      statusColor = "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm";
      icon = <Check size={12} className="text-emerald-500" />;
      statusText = "VERIFIED";
      dotColor = "bg-emerald-500";
    } else if (step.isCurrent) {
      statusColor = "bg-white border-blue-300 text-blue-700 shadow-md ring-2 ring-blue-500/20";
      icon = <Play size={12} className="text-blue-500" />;
      statusText = "ACTIVE";
      dotColor = "bg-blue-500 animate-pulse";
    } else if (step.status === "REJECTED") {
      statusColor = "bg-red-50 border-red-200 text-red-700 shadow-sm";
      icon = <AlertCircle size={12} className="text-red-500" />;
      statusText = "REJECTED";
      dotColor = "bg-red-500";
    }

    return (
      <div key={step.id || step.originalIndex} className="flex items-center group relative min-w-[140px]">
        <div className="flex flex-col gap-1.5 w-full relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${dotColor}`} />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {step.label || step.name || step.role}
            </span>
          </div>

          <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${statusColor} transition-all duration-300`}>
            <div className="flex items-center gap-1.5">
              {icon}
              <span className="text-[10px] font-bold uppercase tracking-widest">{statusText}</span>
            </div>
          </div>
        </div>

        {!isLast && (
          <div className="flex-1 mx-2 relative z-0 flex items-center justify-center min-w-[20px]">
            <div className={`h-[2px] w-full ${step.isCompleted ? "bg-emerald-400" : "bg-slate-200"} transition-colors duration-500`} />
            <ChevronRight size={14} className={`absolute text-${step.isCompleted ? "emerald-500" : "slate-300"} bg-white rounded-full p-0.5`} />
          </div>
        )}
      </div>
    );
  };

  const renderCompactStep = (step: any, isLast: boolean) => {
    let statusColor = "bg-slate-100 border-slate-200 text-slate-400";
    let icon = <Lock size={10} strokeWidth={3} />;

    if (step.isCompleted || step.status === "COMPLETED") {
      statusColor = "bg-emerald-50 border-emerald-200 text-emerald-600 shadow-sm";
      icon = <Check size={10} strokeWidth={3} />;
    } else if (step.isCurrent) {
      statusColor = "bg-white border-blue-400 text-blue-600 shadow-md ring-2 ring-blue-500/20";
      icon = <Play size={10} className="ml-0.5" strokeWidth={3} />;
    }

    return (
      <div key={step.id || step.originalIndex} className="flex items-center group relative cursor-default">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${statusColor} transition-all duration-300`}>
          {icon}
          <span className="text-[9px] font-bold uppercase tracking-tight whitespace-nowrap">
            {step.label || step.name || step.role}
          </span>
        </div>
        {!isLast && (
          <div className="flex-1 mx-1.5 relative flex items-center justify-center min-w-[12px]">
            <ChevronRight size={10} className={`text-${step.isCompleted ? "emerald-400" : "slate-300"}`} strokeWidth={3} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`flex items-center ${detailed ? "gap-0 overflow-x-auto pb-4 pt-2 px-2 snap-x" : "gap-0 flex-nowrap min-w-max"} ${className}`}>
      {stepsToRender.map((step: any, idx: number) =>
        detailed
          ? renderDetailedStep(step, idx === stepsToRender.length - 1)
          : renderCompactStep(step, idx === stepsToRender.length - 1)
      )}
    </div>
  );
}
