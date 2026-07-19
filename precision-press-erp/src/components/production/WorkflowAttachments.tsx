'use client';

import React, { useState } from 'react';
import { ExternalLink, Loader2, Upload, Trash2 } from 'lucide-react';
import { addWorkflowAttachment, removeWorkflowAttachment } from '@/lib/workflow';
import { OrderWorkflowStep } from '@/types/workflow';
import { WorkspaceMode } from '@/lib/workspaceAccess';

interface WorkflowAttachmentsProps {
  orderId: string;
  currentStep?: OrderWorkflowStep | null;
  mode?: WorkspaceMode;
}

export function WorkflowAttachments({ orderId, currentStep, mode = 'ACTIVE' }: WorkflowAttachmentsProps) {
  const [processing, setProcessing] = useState(false);

  const handleUpload = async (file: File) => {
    if (mode === 'READ_ONLY') {
      alert('Cannot modify attachments in read-only mode.');
      return;
    }
    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('orderId', orderId);

      const res = await fetch('/api/designs/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Upload failed');
      }

      const data = await res.json();
      if (data.success) {
        await addWorkflowAttachment(orderId, data.fileUrl);
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error: any) {
      console.error('Upload failed:', error);
      alert('Error uploading file: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleRemove = async (fileUrl: string) => {
    if (mode === 'READ_ONLY') {
      alert('Cannot modify attachments in read-only mode.');
      return;
    }
    if (!confirm('Are you sure you want to remove this attachment?')) return;
    setProcessing(true);
    try {
      await removeWorkflowAttachment(orderId, fileUrl);
    } catch (error) {
      console.error('Remove failed:', error);
      alert('Error removing attachment.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Attachments & Files</h4>
        {currentStep?.attachments && currentStep.attachments.length > 0 ? (
          <ul className="space-y-2 mb-4">
            {currentStep.attachments.map((url, idx) => {
              const isImage = typeof url === 'string' && (url.startsWith('/api/designs/') || url.match(/\.(jpeg|jpg|gif|png|webp)/i));
              return (
                <li key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl gap-4">
                  <div className="flex items-center gap-3">
                    {isImage ? (
                      <div className="w-12 h-12 rounded-lg bg-white border border-slate-100 flex items-center justify-center overflow-hidden shadow-sm shrink-0">
                        <img src={url} alt="Attachment preview" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                        <span className="material-symbols-outlined text-lg">description</span>
                      </div>
                    )}
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-slate-900 hover:text-blue-600 flex items-center gap-1.5 text-xs font-bold truncate max-w-sm">
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      Attachment {idx + 1}
                    </a>
                  </div>
                  {mode !== 'READ_ONLY' && (
                    <button 
                      onClick={(e) => { e.preventDefault(); handleRemove(url); }}
                      className="p-2 text-red-400 hover:text-red-650 hover:bg-red-50 rounded-lg transition-all"
                      title="Remove attachment"
                      disabled={processing}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 mb-4">No attachments yet.</p>
        )}

        {mode !== 'READ_ONLY' ? (
          <div className="flex items-center gap-4">
            <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
              <Upload className="w-4 h-4" />
              Upload File
              <input 
                type="file" 
                className="hidden" 
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleUpload(e.target.files[0]);
                  }
                }}
                disabled={processing}
              />
            </label>
            {processing && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
          </div>
        ) : (
          <p className="text-xs font-bold text-slate-400 italic">Uploads are disabled in read-only mode.</p>
        )}
      </div>
    </div>
  );
}
