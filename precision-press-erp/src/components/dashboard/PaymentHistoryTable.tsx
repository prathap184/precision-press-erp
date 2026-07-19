'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from '@/lib/supabase-firestore-shim';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PaymentRow {
  id: string;
  paymentMode: string;
  amount: number;
  depositRefNo: string;
  depositDate: string;
  depositBank: string;
  branchName: string;
  ourBankAccount: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string | Date | { seconds?: number; nanoseconds?: number } | null;
  orderId: string;
}

// ─── Bank account display labels (same as in the page) ─────────────────────────
const BANK_LABELS: Record<string, string> = {
  ICICI_001:  '(Current) ICICI BANK\nA/C No: 035905003208',
  SBI_001:    '(Savings) SBI\nA/C No: 5678901234567',
  HDFC_001:   '(Current) HDFC BANK\nA/C No: 9012345678901',
  KOTAK_001:  '(Current) KOTAK MAHINDRA BANK\nA/C No: 3456789012345',
};

const MODE_LABELS: Record<string, string> = {
  ONLINE_TRANSFER: 'Online Transfer',
  UPI:             'Online Transfer',
  CASH_DEPOSIT:    'Cash Deposit',
  CHEQUE:          'Cheque Deposit',
  NEFT:            'Online Transfer',
  RTGS:            'Online Transfer',
};

// ─── Status cell — text-only, colour-coded ────────────────────────────────────
function StatusCell({ status }: { status: string }) {
  if (status === 'APPROVED') return <span style={{ color: '#16a34a', fontWeight: 700 }}>Approved</span>;
  if (status === 'REJECTED') return <span style={{ color: '#dc2626', fontWeight: 700 }}>Rejected</span>;
  return <span style={{ color: '#d97706', fontWeight: 700 }}>Pending</span>;
}

// ─── Amount formatter ─────────────────────────────────────────────────────────
const fmtAmt = (n: number) =>
  Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Date formatter: YYYY-MM-DD ───────────────────────────────────────────────
const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().split('T')[0];
};

// ─── Main component ─────────────────────────────────────────────────────────────
export function PaymentHistoryTable({ filterOrderId }: { filterOrderId?: string }) {
  const { profile } = useAuth();
  const uid = profile?.uid;

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const lastFetch = useRef<number>(0);

  useEffect(() => {
    if (!uid) return;

    // 30-second client-side stale cache
    const now = Date.now();
    if (now - lastFetch.current < 30_000 && payments.length > 0) return;

    setIsLoading(true);
    setError(null);

    const constraints = [
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(50),
    ];
    // We no longer unshift orderId filter as per user request to show ALL history.

    getDocs(query(collection(db, 'payments'), ...constraints))
      .then(snap => {
        setPayments(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PaymentRow, 'id'>) })) as PaymentRow[]);
        lastFetch.current = Date.now();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, filterOrderId]);

  /* ── ERP Base Styles ──────────────────────────────────────────────────────── */
  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
    fontFamily: '"Courier New", Courier, monospace',
    tableLayout: 'fixed',
  };

  const thStyle: React.CSSProperties = {
    backgroundColor: '#d1d5db',
    border: '1px solid #9ca3af',
    padding: '5px 8px',
    textAlign: 'left',
    fontWeight: 700,
    fontFamily: 'Arial, sans-serif',
    fontSize: '11px',
    color: '#111827',
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
  };

  const tdStyle: React.CSSProperties = {
    border: '1px solid #d1d5db',
    padding: '4px 8px',
    verticalAlign: 'top',
    color: '#111827',
    lineHeight: '1.4',
  };

  const tdRightStyle: React.CSSProperties = {
    ...tdStyle,
    textAlign: 'right',
    fontFamily: '"Courier New", Courier, monospace',
  };

  const idLinkStyle: React.CSSProperties = {
    color: '#1d4ed8',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontWeight: 600,
  };

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>

      {/* ── Section header — ERP style ── */}
      <div style={{
        background: '#1e3a5f',
        color: '#ffffff',
        padding: '6px 12px',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.5px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>ALL PAYMENT REQUEST HISTORY (Across All Orders)</span>
        {filterOrderId && (
          <span style={{ fontSize: '10px', opacity: 0.8 }}>
            Viewing at Order: {filterOrderId}
          </span>
        )}
      </div>

      {/* ── Toolbar ── */}
      <div style={{
        background: '#f3f4f6',
        border: '1px solid #d1d5db',
        borderTop: 'none',
        padding: '4px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        fontSize: '11px',
        color: '#374151',
      }}>
        <span>Total Records: <strong>{payments.length}</strong></span>
        <span>|</span>
        <span>Approved: <strong style={{ color: '#16a34a' }}>
          {payments.filter(p => p.status === 'APPROVED').length}
        </strong></span>
        <span>|</span>
        <span>Pending: <strong style={{ color: '#d97706' }}>
          {payments.filter(p => p.status === 'PENDING').length}
        </strong></span>
        <span>|</span>
        <span>Total Approved Amount: <strong>
          ₹{fmtAmt(payments.filter(p => p.status === 'APPROVED').reduce((s, p) => s + p.amount, 0))}
        </strong></span>
      </div>

      {/* ── Scrollable table wrapper ── */}
      <div style={{
        overflowX: 'auto',
        overflowY: 'auto',
        maxHeight: '460px',
        border: '1px solid #9ca3af',
        borderTop: 'none',
        background: '#ffffff',
      }}>
        {isLoading ? (
          <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#6b7280' }}>
            Loading payment records...
          </div>
        ) : error ? (
          <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#dc2626' }}>
            Error loading records. Please refresh.
          </div>
        ) : payments.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#6b7280', fontStyle: 'italic' }}>
            No payment records found.
          </div>
        ) : (
          <table style={tableStyle}>
            <colgroup>
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '85px' }} />
            </colgroup>

            {/* ── Sticky header ── */}
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={thStyle}>Request ID</th>
                <th style={thStyle}>Order ID</th>
                <th style={thStyle}>Payment Mode</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Deposit Amount</th>
                <th style={thStyle}>Deposit No</th>
                <th style={thStyle}>Deposit Date</th>
                <th style={thStyle}>Deposit Bank</th>
                <th style={thStyle}>OPS Bank Account</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>

            <tbody>
              {payments.map((p, idx) => {
                const bankLabel = p.ourBankAccount ? (BANK_LABELS[p.ourBankAccount] ?? p.ourBankAccount) : '—';
                const bankLines = String(bankLabel).split('\n');
                const bankDisplay = (
                  <div>
                    {bankLines.map((line, i) => (
                      <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {line}
                      </div>
                    ))}
                  </div>
                );

                const depositBankFull = [p.depositBank, p.branchName]
                  .filter(Boolean)
                  .join(' [')
                  .replace(/(\[.+)$/, '$1]')
                  .toLowerCase();

                const rowBg = idx % 2 === 0 ? '#ffffff' : '#f9fafb';

                return (
                  <tr key={p.id} style={{ background: rowBg }}>
                    {/* 1. Request ID */}
                    <td style={tdStyle}>
                      <span style={idLinkStyle}>{p.id}</span>
                    </td>

                    {/* 1b. Order ID */}
                    <td style={tdStyle}>
                      <span style={{ ...idLinkStyle, color: '#4b5563' }}>{p.orderId}</span>
                    </td>

                    {/* 2. Payment Mode */}
                    <td style={tdStyle}>
                      {MODE_LABELS[p.paymentMode] ?? p.paymentMode}
                    </td>

                    {/* 3. Deposit Amount — right aligned */}
                    <td style={tdRightStyle}>
                      {fmtAmt(p.amount)}
                    </td>

                    {/* 4. Deposit No */}
                    <td style={tdStyle}>
                      {p.depositRefNo || <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>

                    {/* 5. Deposit Date YYYY-MM-DD */}
                    <td style={tdStyle}>
                      {fmtDate(p.depositDate)}
                    </td>

                    {/* 6. Deposit Bank */}
                    <td style={{ ...tdStyle, textTransform: 'lowercase', wordBreak: 'break-word' }}>
                      {depositBankFull}
                    </td>

                    {/* 7. OPS Bank Account — multi-line */}
                    <td style={{ ...tdStyle, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                      {bankDisplay}
                    </td>

                    {/* 8. Status — text only, colored */}
                    <td style={tdStyle}>
                      <StatusCell status={p.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* ── Footer totals row ── */}
            <tfoot>
              <tr style={{ backgroundColor: '#e5e7eb' }}>
                <td colSpan={3} style={{ ...tdStyle, fontWeight: 700, textAlign: 'right', fontFamily: 'Arial, sans-serif' }}>
                  TOTAL (APPROVED):
                </td>
                <td style={{ ...tdRightStyle, fontWeight: 700, borderTop: '2px solid #374151' }}>
                  {fmtAmt(payments.filter(p => p.status === 'APPROVED').reduce((s, p) => s + p.amount, 0))}
                </td>
                <td colSpan={5} style={tdStyle} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* ── Record count footer ── */}
      <div style={{
        background: '#f3f4f6',
        border: '1px solid #d1d5db',
        borderTop: 'none',
        padding: '3px 8px',
        fontSize: '10px',
        color: '#6b7280',
        textAlign: 'right',
      }}>
        Showing {payments.length} of up to 50 records · Latest first
      </div>
    </div>
  );
}

