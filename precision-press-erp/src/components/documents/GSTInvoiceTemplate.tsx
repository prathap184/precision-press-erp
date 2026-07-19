'use client';
import React from 'react';

export interface TaxTemplate {
  company_name: string;
  address: string;
  city: string;
  state: string;
  state_code: string;
  pincode: string;
  phone: string;
  email: string;
  website?: string;
  gstin: string;
  pan: string;
  msme_reg?: string;
  bank_name: string;
  branch: string;
  account_number: string;
  ifsc: string;
  beneficiary_name: string;
  upi_id?: string;
  logo_url?: string;
  signature_url?: string;
  seal_url?: string;
  declaration: string;
  terms: string;
  footer_text: string;
  invoice_prefix: string;
  default_gst: number;
  round_off: boolean;
  amount_in_words: boolean;
}

export interface InvoiceItem {
  sr?: number | string;
  particulars: string;
  hsn_code?: string;
  gst_percent?: number;
  width?: string | number;
  length?: string | number;
  pcs?: number;
  rate_per_sq?: number;
  qty?: number;
  unit?: string;
  sqft?: number;
  amount: number;
}

export interface DispatchDetail {
  transporter_name?: string;
  dispatch_through?: string;
  lr_number?: string;
  lr_date?: string;
  vehicle_number?: string;
  destination?: string;
  delivery_note?: string;
  delivery_note_date?: string;
}

export interface GSTInvoiceData {
  invoice_number: string;
  invoice_date: string;
  order_type?: string; // Cash / Credit
  irn?: string;
  ack_number?: string;
  ack_date?: string;
  qr_data?: string;
  // Buyer
  buyer_name: string;
  buyer_address: string;
  buyer_gstin?: string;
  buyer_state?: string;
  buyer_state_code?: string;
  buyer_place_of_supply?: string;
  buyer_phone?: string;
  // Consignee
  consignee_name: string;
  consignee_address: string;
  consignee_gstin?: string;
  consignee_state?: string;
  consignee_state_code?: string;
  consignee_place_of_supply?: string;
  consignee_phone?: string;
  // Dispatch
  dispatch?: DispatchDetail;
  // Items
  items: InvoiceItem[];
  tax_items?: {
    particulars?: string;
    taxable_value: number;
    cgst_amount?: number;
    sgst_amount?: number;
    igst_amount?: number;
    cgst_rate?: number;
    sgst_rate?: number;
    igst_rate?: number;
  }[];
  // Amounts
  taxable_value: number;
  cgst_rate?: number;
  cgst_amount?: number;
  sgst_rate?: number;
  sgst_amount?: number;
  igst_rate?: number;
  igst_amount?: number;
  round_off?: number;
  grand_total: number;
  amount_in_words?: string;
  // Meta
  parent_order_id?: string;
  buyer_order_no?: string;
  buyer_order_number?: string; // keeping for backward compatibility
  buyer_order_date?: string;
  delivery_note_number?: string;
  delivery_note_date?: string;
  mode_of_payment?: string;
}

interface GSTInvoiceTemplateProps {
  template: TaxTemplate;
  invoice: GSTInvoiceData;
  forPrint?: boolean;
}

export function numberToWordsINR(num: number): string {
  if (!num || num === 0) return 'Zero Rupees Only';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function inWords(n: number): string {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + inWords(n % 10000000) : '');
  }
  const int = Math.floor(num);
  const paise = Math.round((num - int) * 100);
  let result = inWords(int) + ' Rupees';
  if (paise > 0) result += ' and ' + inWords(paise) + ' Paise';
  return result + ' Only';
}

export default function GSTInvoiceTemplate({ template, invoice, forPrint = false }: GSTInvoiceTemplateProps) {
  const fmt = (n: number) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (v?: string) => {
    if (!v) return '';
    try { return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }); }
    catch { return v; }
  };

  const isInterState = !!(invoice.igst_amount && invoice.igst_amount > 0);
  const gstPercent = isInterState
    ? (invoice.igst_rate || 18)
    : ((invoice.cgst_rate || 9) * 2);

  const roundOff = invoice.round_off || 0;
  const emptyRows = Math.max(0, 5 - (invoice.items?.length || 0));

  return (
    <div
      id="gst-invoice"
      className={`bg-white p-6 sm:p-8 text-slate-900 ${forPrint ? '' : 'max-w-[900px] mx-auto'}`}
      style={{
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '10px',
        lineHeight: '1.3',
        color: '#000',
      }}
    >
      <style>{`
        @media print {
          @page { size: A4; margin: 8mm; }
          body { margin: 0; background: #fff; }
          .no-print { display: none !important; }
          #gst-invoice { width: 100%; }
        }
        #gst-invoice table { border-collapse: collapse; width: 100%; }
        #gst-invoice td, #gst-invoice th {
          border: 1px solid #000;
          padding: 4px 8px !important;
          vertical-align: top;
        }
        #gst-invoice .no-border { border: none !important; }
        #gst-invoice .border-t-only { border-top: 1px solid #000; border-left: none; border-right: none; border-bottom: none; }
      `}</style>

      {/* ── TITLE ROW ──────────────────────────────────────────────── */}
      <table style={{ marginBottom: 0 }}>
        <tbody>
          <tr>
            <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px', borderBottom: 'none', paddingBottom: '2px' }} colSpan={3}>
              Tax Invoice - {invoice.order_type || 'Credit'}
            </td>
            <td style={{ textAlign: 'right', fontSize: '9px', fontStyle: 'italic', borderBottom: 'none', borderLeft: 'none' }} colSpan={1}>
              (ORIGINAL FOR RECIPIENT)
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── e-Invoice / IRN row ────────────────────────────────────── */}
      <table style={{ marginBottom: 0 }}>
        <tbody>
          <tr>
            <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11px', border: 'none', paddingTop: 0 }} colSpan={4}>
              e-Invoice
            </td>
          </tr>
          <tr>
            <td style={{ fontSize: '9px', border: 'none' }}>IRN</td>
            <td style={{ fontSize: '9px', border: 'none', fontWeight: 'bold' }} colSpan={2}>{invoice.irn || '—'}</td>
            <td rowSpan={3} style={{ border: '1px solid #000', textAlign: 'center', width: '80px', padding: '4px' }}>
              {invoice.qr_data ? (
                <img src={invoice.qr_data} alt="QR" style={{ width: '70px', height: '70px' }} />
              ) : (
                <div style={{ width: '70px', height: '70px', border: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#999' }}>
                  QR CODE
                </div>
              )}
            </td>
          </tr>
          <tr>
            <td style={{ fontSize: '9px', border: 'none' }}>Ack No.</td>
            <td style={{ fontSize: '9px', border: 'none', fontWeight: 'bold' }} colSpan={2}>{invoice.ack_number || '—'}</td>
          </tr>
          <tr>
            <td style={{ fontSize: '9px', border: 'none' }}>Ack Date</td>
            <td style={{ fontSize: '9px', border: 'none', fontWeight: 'bold' }} colSpan={2}>{fmtDate(invoice.ack_date) || '—'}</td>
          </tr>
        </tbody>
      </table>

      {/* ── COMPANY + INVOICE HEADER ─────────────────────────────────── */}
      <table>
        <tbody>
          <tr>
            {/* Company block */}
            <td style={{ width: '50%', verticalAlign: 'top', padding: '6px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                {template.logo_url ? (
                  <img src={template.logo_url} alt="Logo" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                ) : (
                  /* Diamond "H" logo placeholder matching template */
                  <div style={{
                    width: '48px', height: '48px', flexShrink: 0, border: '2px solid #000',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transform: 'rotate(45deg)', marginRight: '4px'
                  }}>
                    <span style={{ transform: 'rotate(-45deg)', fontWeight: 'bold', fontSize: '18px' }}>H</span>
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '2px' }}>{template.company_name}</div>
                  <div>{template.address}</div>
                  <div>{template.city} - {template.pincode}</div>
                  <div>{template.state}, State Name : {template.state}, Code : {template.state_code}</div>
                  {template.msme_reg && <div>MSME Reg No : {template.msme_reg}</div>}
                  <div>GSTIN/UIN: {template.gstin}</div>
                  <div>PAN : {template.pan}</div>
                  <div>Phone No : {template.phone}</div>
                  <div>E-mail : {template.email}</div>
                </div>
              </div>
            </td>

            {/* Invoice meta grid */}
            <td style={{ width: '50%', padding: 0 }}>
              <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 'bold', padding: '3px 5px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Invoice No.</td>
                    <td style={{ padding: '3px 5px', fontWeight: 'bold', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>{invoice.invoice_number}</td>
                    <td style={{ fontWeight: 'bold', padding: '3px 5px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Dated</td>
                    <td style={{ padding: '3px 5px', fontWeight: 'bold', borderBottom: '1px solid #000' }}>{fmtDate(invoice.invoice_date)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Delivery Note</td>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>{invoice.dispatch?.delivery_note || ''}</td>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Mode/Terms of Payment</td>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000' }}>{invoice.mode_of_payment || ''}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Buyer's Order No.</td>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>{invoice.buyer_order_no || invoice.buyer_order_number || ''}</td>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Buyer's Order Date</td>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000' }}>{fmtDate(invoice.buyer_order_date)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Transporter</td>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>{invoice.dispatch?.transporter_name || ''}</td>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Delivery Note Date</td>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000' }}>{fmtDate(invoice.dispatch?.delivery_note_date)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Despatched through</td>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>{invoice.dispatch?.dispatch_through || ''}</td>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000', borderRight: '1px solid #000' }}>Destination</td>
                    <td style={{ padding: '3px 5px', borderBottom: '1px solid #000' }}>{invoice.dispatch?.destination || ''}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 5px', borderRight: '1px solid #000' }}>LR Number & Date</td>
                    <td style={{ padding: '3px 5px', borderRight: '1px solid #000' }}>
                      {invoice.dispatch?.lr_number ? `${invoice.dispatch.lr_number} / ${fmtDate(invoice.dispatch.lr_date)}` : ''}
                    </td>
                    <td style={{ padding: '3px 5px', borderRight: '1px solid #000' }}>Motor Vehicle No.</td>
                    <td style={{ padding: '3px 5px' }}>{invoice.dispatch?.vehicle_number || ''}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── BUYER + CONSIGNEE ─────────────────────────────────────────── */}
      <table>
        <tbody>
          <tr>
            <td style={{ width: '50%', verticalAlign: 'top', padding: '5px 8px' }}>
              <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '2px' }}>Buyer's Name &amp; Address</div>
              <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{invoice.buyer_name}</div>
              <div style={{ whiteSpace: 'pre-line' }}>{invoice.buyer_address}</div>
              {invoice.buyer_phone && <div>{invoice.buyer_phone}</div>}
              {invoice.buyer_place_of_supply && <div>Place of Supply : {invoice.buyer_place_of_supply}</div>}
              <div>GSTN No. : {invoice.buyer_gstin || 'Unregistered'}</div>
            </td>
            <td style={{ width: '50%', verticalAlign: 'top', padding: '5px 8px' }}>
              <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '2px' }}>Consignee's Name &amp; Address</div>
              <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{invoice.consignee_name}</div>
              <div style={{ whiteSpace: 'pre-line' }}>{invoice.consignee_address}</div>
              {invoice.consignee_phone && <div>{invoice.consignee_phone}</div>}
              {invoice.consignee_place_of_supply && <div>Place of Supply : {invoice.consignee_place_of_supply}</div>}
              <div>GSTN No. : {invoice.consignee_gstin || 'Unregistered'}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── ITEMS TABLE ───────────────────────────────────────────────── */}
      <table>
        <thead>
          <tr style={{ backgroundColor: '#f0f0f0' }}>
            <th style={{ width: '22px', textAlign: 'center' }}>Sr</th>
            <th>Particulars</th>
            <th style={{ width: '45px', textAlign: 'center' }}>HSN Code</th>
            <th style={{ width: '28px', textAlign: 'center' }}>GST %</th>
            <th style={{ width: '25px', textAlign: 'center' }}>W</th>
            <th style={{ width: '25px', textAlign: 'center' }}>L</th>
            <th style={{ width: '28px', textAlign: 'center' }}>Pcs</th>
            <th style={{ width: '42px', textAlign: 'center' }}>Rate/Sft</th>
            <th style={{ width: '35px', textAlign: 'center' }}>SQ.FT</th>
            <th style={{ width: '35px', textAlign: 'center' }}>Qty</th>
            <th style={{ width: '25px', textAlign: 'center' }}>UoM</th>
            <th style={{ width: '65px', textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {(invoice.items || []).map((item, i) => (
            <tr key={i}>
              <td style={{ textAlign: 'center' }}>{item.sr !== undefined ? item.sr : ''}</td>
              <td style={{ fontWeight: 'bold' }}>{item.particulars}</td>
              <td style={{ textAlign: 'center' }}>{item.hsn_code || ''}</td>
              <td style={{ textAlign: 'center' }}>{item.gst_percent !== undefined ? item.gst_percent : gstPercent}</td>
              <td style={{ textAlign: 'center' }}>{item.width ? `${item.width}` : ''}</td>
              <td style={{ textAlign: 'center' }}>{item.length ? `${item.length}` : ''}</td>
              <td style={{ textAlign: 'center' }}>{item.pcs || ''}</td>
              <td style={{ textAlign: 'center' }}>{item.rate_per_sq ? `${item.rate_per_sq}` : ''}</td>
              <td style={{ textAlign: 'center' }}>{item.sqft ? `${item.sqft}` : ''}</td>
              <td style={{ textAlign: 'center' }}>{item.qty}</td>
              <td style={{ textAlign: 'center' }}>{item.unit || 'Nos'}</td>
              <td style={{ textAlign: 'right' }}>{fmt(item.amount)} ₹</td>
            </tr>
          ))}
          {/* Empty rows */}
          {Array.from({ length: emptyRows }).map((_, i) => (
            <tr key={`e${i}`} style={{ height: '18px' }}>
              <td></td><td></td><td></td><td></td><td></td><td></td>
              <td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>
          ))}

          {/* ── TOTALS SECTION INSIDE TABLE ── */}
          <tr>
            <td colSpan={11} style={{ textAlign: 'right', fontWeight: 'bold', backgroundColor: '#f9f9f9' }}>
              Total Amount
            </td>
            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
              {fmt(invoice.grand_total)} ₹
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── AMOUNT IN WORDS + GST SUMMARY ──────────────────────────── */}
      <table>
        <tbody>
          <tr>
            <td style={{ width: '50%', verticalAlign: 'top', padding: '4px 6px' }}>
              <div>
                <span style={{ fontWeight: 'bold' }}>Amount In Words</span><br />
                <span>{invoice.amount_in_words || numberToWordsINR(invoice.grand_total)}</span>
              </div>
            </td>
            <td style={{ width: '50%', verticalAlign: 'top', padding: '4px 6px' }}>
              <span style={{ fontWeight: 'bold' }}>GST Amount In Words</span><br />
              <span>
                {isInterState
                  ? numberToWordsINR(invoice.igst_amount || 0)
                  : numberToWordsINR((invoice.cgst_amount || 0) + (invoice.sgst_amount || 0))}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── GST CALCULATION TABLE ────────────────────────────────────── */}
      <table>
        <thead>
          <tr style={{ backgroundColor: '#f0f0f0' }}>
            <th style={{ textAlign: 'left' }}>Particulars</th>
            <th style={{ textAlign: 'right' }}>Taxable Value</th>
            {isInterState ? (
              <>
                <th style={{ textAlign: 'center' }} colSpan={2}>IGST/UTGST</th>
              </>
            ) : (
              <>
                <th style={{ textAlign: 'center' }} colSpan={2}>CGST</th>
                <th style={{ textAlign: 'center' }} colSpan={2}>SGST/UTGST</th>
              </>
            )}
            <th style={{ textAlign: 'right' }}>Total Tax Amount</th>
          </tr>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th></th>
            <th></th>
            {isInterState ? (
              <>
                <th style={{ textAlign: 'center', fontWeight: 'normal' }}>Rate</th>
                <th style={{ textAlign: 'center', fontWeight: 'normal' }}>Amount</th>
              </>
            ) : (
              <>
                <th style={{ textAlign: 'center', fontWeight: 'normal' }}>Rate</th>
                <th style={{ textAlign: 'center', fontWeight: 'normal' }}>Amount</th>
                <th style={{ textAlign: 'center', fontWeight: 'normal' }}>Rate</th>
                <th style={{ textAlign: 'center', fontWeight: 'normal' }}>Amount</th>
              </>
            )}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(invoice.tax_items?.length ? invoice.tax_items : [{
            particulars: 'Total Invoice',
            taxable_value: invoice.taxable_value,
            cgst_amount: invoice.cgst_amount,
            sgst_amount: invoice.sgst_amount,
            igst_amount: invoice.igst_amount,
            cgst_rate: invoice.cgst_rate,
            sgst_rate: invoice.sgst_rate,
            igst_rate: invoice.igst_rate
          }]).map((t, i) => (
            <tr key={i}>
              <td style={{ textAlign: 'left' }}>{t.particulars}</td>
              <td style={{ textAlign: 'right' }}>{fmt(t.taxable_value)}</td>
              {isInterState ? (
                <>
                  <td style={{ textAlign: 'center' }}>{t.igst_rate || gstPercent}%</td>
                  <td style={{ textAlign: 'right' }}>{fmt(t.igst_amount || 0)}</td>
                </>
              ) : (
                <>
                  <td style={{ textAlign: 'center' }}>{t.cgst_rate || (gstPercent / 2)}%</td>
                  <td style={{ textAlign: 'right' }}>{fmt(t.cgst_amount || 0)}</td>
                  <td style={{ textAlign: 'center' }}>{t.sgst_rate || (gstPercent / 2)}%</td>
                  <td style={{ textAlign: 'right' }}>{fmt(t.sgst_amount || 0)}</td>
                </>
              )}
              <td style={{ textAlign: 'right' }}>
                {fmt(isInterState
                  ? (t.igst_amount || 0)
                  : (t.cgst_amount || 0) + (t.sgst_amount || 0))}
              </td>
            </tr>
          ))}
          <tr style={{ fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>
            <td style={{ textAlign: 'right' }}>Total:</td>
            <td style={{ textAlign: 'right' }}>{fmt(invoice.taxable_value)}</td>
            {isInterState ? (
              <>
                <td></td>
                <td style={{ textAlign: 'right' }}>{fmt(invoice.igst_amount || 0)}</td>
              </>
            ) : (
              <>
                <td></td>
                <td style={{ textAlign: 'right' }}>{fmt(invoice.cgst_amount || 0)}</td>
                <td></td>
                <td style={{ textAlign: 'right' }}>{fmt(invoice.sgst_amount || 0)}</td>
              </>
            )}
            <td style={{ textAlign: 'right' }}>
              {fmt(isInterState
                ? (invoice.igst_amount || 0)
                : (invoice.cgst_amount || 0) + (invoice.sgst_amount || 0))}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── REMARKS + BANK DETAILS ───────────────────────────────────── */}
      <table>
        <tbody>
          <tr>
            <td style={{ width: '55%', verticalAlign: 'top', padding: '5px 8px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>Remarks</div>
              <div style={{ marginBottom: '6px' }}></div>
              <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>Declaration</div>
              <div style={{ fontSize: '9px', whiteSpace: 'pre-line' }}>{template.declaration}</div>
              <div style={{ fontSize: '9px', whiteSpace: 'pre-line', marginTop: '3px' }}>{template.terms}</div>
            </td>
            <td style={{ width: '45%', verticalAlign: 'top', padding: '5px 8px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Company's Bank Details</div>
              <table style={{ border: 'none', width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ border: 'none', padding: '1px 0', width: '45%' }}>Beneficiary Name</td>
                    <td style={{ border: 'none', padding: '1px 0', fontWeight: 'bold' }}>{template.beneficiary_name}</td>
                  </tr>
                  <tr>
                    <td style={{ border: 'none', padding: '1px 0' }}>Bank Name</td>
                    <td style={{ border: 'none', padding: '1px 0', fontWeight: 'bold' }}>{template.bank_name}</td>
                  </tr>
                  <tr>
                    <td style={{ border: 'none', padding: '1px 0' }}>A/c No.</td>
                    <td style={{ border: 'none', padding: '1px 0', fontWeight: 'bold' }}>{template.account_number}</td>
                  </tr>
                  <tr>
                    <td style={{ border: 'none', padding: '1px 0' }}>IFS Code</td>
                    <td style={{ border: 'none', padding: '1px 0', fontWeight: 'bold' }}>{template.ifsc}</td>
                  </tr>
                  <tr>
                    <td style={{ border: 'none', padding: '1px 0' }}>Branch</td>
                    <td style={{ border: 'none', padding: '1px 0', fontWeight: 'bold' }}>{template.branch}</td>
                  </tr>
                  {template.upi_id && (
                    <tr>
                      <td style={{ border: 'none', padding: '1px 0' }}>UPI ID</td>
                      <td style={{ border: 'none', padding: '1px 0', fontWeight: 'bold' }}>{template.upi_id}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── SIGNATURES ───────────────────────────────────────────────── */}
      <table>
        <tbody>
          <tr>
            <td style={{ width: '50%', padding: '8px', textAlign: 'left', height: '60px', verticalAlign: 'bottom' }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: '4px', marginTop: '40px', fontWeight: 'bold' }}>
                Customer Signature and Seal with Contact Number
              </div>
            </td>
            <td style={{ width: '50%', padding: '8px', textAlign: 'right', verticalAlign: 'bottom' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <div style={{ fontStyle: 'italic', marginBottom: '4px' }}>For {template.company_name}</div>
                {template.signature_url && (
                  <img src={template.signature_url} alt="Signature" style={{ height: '36px', objectFit: 'contain', marginBottom: '4px' }} />
                )}
                {template.seal_url && (
                  <img src={template.seal_url} alt="Seal" style={{ height: '36px', objectFit: 'contain', marginBottom: '4px' }} />
                )}
                <div style={{ borderTop: '1px solid #000', paddingTop: '4px', fontWeight: 'bold' }}>
                  Authorised Signatory
                </div>
                <div style={{ fontSize: '8px', marginTop: '2px' }}>E. &amp; O.E.</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', fontSize: '9px', borderTop: '1px solid #000', paddingTop: '4px', marginTop: '2px' }}>
        {template.footer_text}
      </div>
    </div>
  );
}
