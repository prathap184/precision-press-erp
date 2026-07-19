// @ts-nocheck
/**
 * Design Workspace Database Service
 * Handles all read/write operations for design_revisions, design_proofs, design_comments tables.
 * Uses Supabase directly (not through the Firestore shim) since these are new dedicated tables.
 */

import { supabaseAdmin } from './supabase-admin';
import { DesignRevision, ItemDesignProof, DesignComment, ItemDesignWorkspace } from '@/types/models';

// ─── Revisions ────────────────────────────────────────────────────────────────

export async function addDesignRevision(
  data: Omit<DesignRevision, 'id' | 'uploadedAt'>
): Promise<DesignRevision> {
  const { data: row, error } = await supabaseAdmin
    .from('design_revisions')
    .insert({
      order_id: data.orderId,
      item_id: data.itemId,
      version: data.version,
      url: data.url,
      cloudinary_public_id: data.cloudinaryPublicId,
      cloudinary_folder: data.cloudinaryFolder,
      uploaded_by: data.uploadedBy,
      uploaded_by_name: data.uploadedByName,
      notes: data.notes,
      revision_type: data.revisionType,
      upload_stats: data.uploadStats || {},
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add design revision: ${error.message}`);
  return mapRevisionRow(row);
}

export async function getDesignRevisions(
  orderId: string,
  itemId: string
): Promise<DesignRevision[]> {
  const { data, error } = await supabaseAdmin
    .from('design_revisions')
    .select('*')
    .eq('order_id', orderId)
    .eq('item_id', itemId)
    .order('version', { ascending: true });

  if (error) throw new Error(`Failed to get design revisions: ${error.message}`);
  return (data || []).map(mapRevisionRow);
}

export async function getLatestRevisionVersion(
  orderId: string,
  itemId: string
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('design_revisions')
    .select('version')
    .eq('order_id', orderId)
    .eq('item_id', itemId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return 0;
  return data.version;
}

function mapRevisionRow(row: any): DesignRevision {
  return {
    id: row.id,
    orderId: row.order_id,
    itemId: row.item_id,
    version: row.version,
    url: row.url,
    cloudinaryPublicId: row.cloudinary_public_id || '',
    cloudinaryFolder: row.cloudinary_folder || '',
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name || '',
    uploadedAt: row.uploaded_at,
    notes: row.notes,
    revisionType: row.revision_type,
    uploadStats: row.upload_stats,
  };
}

// ─── Proofs ───────────────────────────────────────────────────────────────────

export async function addDesignProof(
  data: Omit<ItemDesignProof, 'id' | 'sentAt' | 'customerResponse'>
): Promise<ItemDesignProof> {
  const { data: row, error } = await supabaseAdmin
    .from('design_proofs')
    .insert({
      order_id: data.orderId,
      item_id: data.itemId,
      version: data.version,
      revision_version: data.revisionVersion,
      url: data.url,
      cloudinary_public_id: data.cloudinaryPublicId,
      sent_by: data.sentBy,
      sent_by_name: data.sentByName,
      customer_response: 'PENDING',
      notes: data.notes,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add design proof: ${error.message}`);
  return mapProofRow(row);
}

export async function getDesignProofs(
  orderId: string,
  itemId: string
): Promise<ItemDesignProof[]> {
  const { data, error } = await supabaseAdmin
    .from('design_proofs')
    .select('*')
    .eq('order_id', orderId)
    .eq('item_id', itemId)
    .order('version', { ascending: true });

  if (error) throw new Error(`Failed to get design proofs: ${error.message}`);
  return (data || []).map(mapProofRow);
}

export async function respondToProof(
  proofId: string,
  response: 'APPROVED' | 'REJECTED',
  rejectionReason?: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('design_proofs')
    .update({
      customer_response: response,
      response_at: new Date().toISOString(),
      rejection_reason: rejectionReason || null,
    })
    .eq('id', proofId);

  if (error) throw new Error(`Failed to update proof response: ${error.message}`);
}

export async function getLatestProofVersion(
  orderId: string,
  itemId: string
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('design_proofs')
    .select('version')
    .eq('order_id', orderId)
    .eq('item_id', itemId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return 0;
  return data.version;
}

function mapProofRow(row: any): ItemDesignProof {
  return {
    id: row.id,
    orderId: row.order_id,
    itemId: row.item_id,
    version: row.version,
    revisionVersion: row.revision_version,
    url: row.url,
    cloudinaryPublicId: row.cloudinary_public_id || '',
    sentAt: row.sent_at,
    sentBy: row.sent_by,
    sentByName: row.sent_by_name || '',
    customerResponse: row.customer_response,
    responseAt: row.response_at,
    rejectionReason: row.rejection_reason,
    notes: row.notes,
  };
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function addDesignComment(
  data: Omit<DesignComment, 'id' | 'createdAt'>
): Promise<DesignComment> {
  const { data: row, error } = await supabaseAdmin
    .from('design_comments')
    .insert({
      order_id: data.orderId,
      item_id: data.itemId,
      message: data.message,
      author_id: data.authorId,
      author_name: data.authorName,
      author_role: data.authorRole,
      attachment_url: data.attachmentUrl || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add design comment: ${error.message}`);
  return mapCommentRow(row);
}

export async function getDesignComments(
  orderId: string,
  itemId: string
): Promise<DesignComment[]> {
  const { data, error } = await supabaseAdmin
    .from('design_comments')
    .select('*')
    .eq('order_id', orderId)
    .eq('item_id', itemId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to get design comments: ${error.message}`);
  return (data || []).map(mapCommentRow);
}

function mapCommentRow(row: any): DesignComment {
  return {
    id: row.id,
    orderId: row.order_id,
    itemId: row.item_id,
    message: row.message,
    authorId: row.author_id,
    authorName: row.author_name || '',
    authorRole: row.author_role || '',
    createdAt: row.created_at,
    attachmentUrl: row.attachment_url,
  };
}
