import React from 'react';
import { format, parseISO } from 'date-fns';
import { X } from 'lucide-react';
import Link from 'next/link';

export interface TallyRow {
  id: string;
  date: string; // ISO date string
  particulars: string;
  vchType: string;
  vchNo: string;
  debit: number;
  credit: number;
}

interface TallyLedgerTemplateProps {
  title: string;
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
  rows: TallyRow[];
  onClose?: () => void;
  closeLink?: string;
}

const formatNumber = (num: number) => {
  if (!num || num === 0) return '';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const formatBalance = (num: number) => {
  const absNum = Math.abs(num);
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absNum);
  const suffix = num >= 0 ? 'Dr' : 'Cr';
  return `${formatted} ${suffix}`;
};

export function TallyLedgerTemplate({
  title,
  dateFrom,
  dateTo,
  openingBalance,
  rows,
  onClose,
  closeLink
}: TallyLedgerTemplateProps) {
  
  let currentBalance = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;

  const rowsWithBalance = rows.map((row) => {
    currentBalance = currentBalance + row.debit - row.credit;
    totalDebit += row.debit;
    totalCredit += row.credit;
    return {
      ...row,
      runningBalance: currentBalance
    };
  });

  const formattedFrom = dateFrom ? format(parseISO(dateFrom), 'd-MMM-yy') : '';
  const formattedTo = dateTo ? format(parseISO(dateTo), 'd-MMM-yy') : '';
  const dateRange = `${formattedFrom} to ${formattedTo}`;

  return (
    <div className="w-full bg-white font-sans text-[13px] border border-gray-400 shadow-sm" style={{ fontFamily: 'Arial, sans-serif' }}>
      
      {/* Tally Header */}
      <div className="flex items-center justify-between bg-[#93c5fd] px-2 py-1 border-b border-gray-400">
        <div className="font-bold text-black text-sm">Ledger Vouchers</div>
        {closeLink ? (
          <Link href={closeLink} className="text-black hover:bg-blue-400 p-0.5 cursor-pointer">
            <X size={16} strokeWidth={3} />
          </Link>
        ) : onClose ? (
          <button onClick={onClose} className="text-black hover:bg-blue-400 p-0.5 cursor-pointer">
            <X size={16} strokeWidth={3} />
          </button>
        ) : null}
      </div>

      {/* Sub Header */}
      <div className="flex justify-between items-end px-2 py-2 border-b border-gray-300 bg-white">
        <div>
          <span className="font-bold">Ledger: </span>
          <span className="font-bold text-base">{title}</span>
        </div>
        <div className="font-bold text-[12px] text-gray-800">
          {dateRange}
        </div>
      </div>

      {/* Table */}
      <div className="w-full overflow-x-auto bg-white">
        <table className="w-full min-w-[800px] border-collapse">
          <thead>
            <tr className="border-b-[1.5px] border-gray-400 text-gray-700 text-[12px]">
              <th className="py-1.5 px-2 text-left font-normal w-[80px]">Date</th>
              <th className="py-1.5 px-2 text-left font-normal">Particulars</th>
              <th className="py-1.5 px-2 text-left font-normal w-[120px]">Vch Type</th>
              <th className="py-1.5 px-2 text-left font-normal w-[100px]">Vch No.</th>
              <th className="py-1.5 px-2 text-right font-normal w-[120px]">Debit</th>
              <th className="py-1.5 px-2 text-right font-normal w-[120px]">Credit</th>
              <th className="py-1.5 px-2 text-right font-normal w-[140px]">Balance</th>
            </tr>
          </thead>
          <tbody>
            {/* Opening Balance Row */}
            <tr>
              <td className="py-1 px-2"></td>
              <td className="py-1 px-2 font-bold pl-6">Opening Balance</td>
              <td className="py-1 px-2"></td>
              <td className="py-1 px-2"></td>
              <td className="py-1 px-2 text-right"></td>
              <td className="py-1 px-2 text-right"></td>
              <td className="py-1 px-2 text-right font-bold">{formatBalance(openingBalance)}</td>
            </tr>

            {/* Data Rows */}
            {rowsWithBalance.map((row) => (
              <tr key={row.id} className="hover:bg-blue-50/50">
                <td className="py-1 px-2 align-top text-gray-800 whitespace-nowrap">
                  {format(parseISO(row.date), 'd-MMM-yy')}
                </td>
                <td className="py-1 px-2 align-top font-bold text-gray-900">
                  {row.particulars}
                </td>
                <td className="py-1 px-2 align-top text-gray-700 text-[12px]">
                  {row.vchType}
                </td>
                <td className="py-1 px-2 align-top text-gray-700 text-[12px]">
                  {row.vchNo}
                </td>
                <td className="py-1 px-2 align-top text-right text-gray-900 font-medium">
                  {formatNumber(row.debit)}
                </td>
                <td className="py-1 px-2 align-top text-right text-gray-900 font-medium">
                  {formatNumber(row.credit)}
                </td>
                <td className="py-1 px-2 align-top text-right text-gray-900 font-bold whitespace-nowrap">
                  {formatBalance(row.runningBalance)}
                </td>
              </tr>
            ))}
          </tbody>
          
          {/* Footer Rows */}
          <tfoot className="border-t-[1.5px] border-gray-400">
            <tr>
              <td colSpan={4} className="py-1.5 px-2 text-right font-normal text-gray-600">Current Total :</td>
              <td className="py-1.5 px-2 text-right font-bold">{formatNumber(totalDebit)}</td>
              <td className="py-1.5 px-2 text-right font-bold">{formatNumber(totalCredit)}</td>
              <td className="py-1.5 px-2 text-right"></td>
            </tr>
            <tr className="border-b-[1.5px] border-gray-400">
              <td colSpan={4} className="py-1.5 px-2 text-right font-bold pb-2">Closing Balance :</td>
              <td colSpan={2} className="py-1.5 px-2 text-right font-bold pb-2">
              </td>
              <td className="py-1.5 px-2 text-right font-bold pb-2">{formatBalance(currentBalance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
