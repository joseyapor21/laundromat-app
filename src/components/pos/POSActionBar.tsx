'use client';

import React from 'react';

interface POSActionBarProps {
  onCreateOrder: () => void;
  onPrintReceipt: () => void;
  onClear: () => void;
  onExit: () => void;
  loading: boolean;
  canCreate: boolean;
  canPrint: boolean;
  totalPrice: number;
}

export default function POSActionBar({
  onCreateOrder,
  onPrintReceipt,
  onClear,
  onExit,
  loading,
  canCreate,
  canPrint,
  totalPrice,
}: POSActionBarProps) {
  return (
    <div className="h-[80px] bg-white border-t-2 border-gray-200 px-4 flex items-center gap-3">
      {/* Create Order - Large Green Button */}
      <button
        onClick={onCreateOrder}
        disabled={loading || !canCreate}
        className="flex-[2] h-[60px] px-6 bg-green-600 text-white font-bold text-lg rounded-xl hover:bg-green-700 active:scale-[0.98] transition-transform touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {loading ? 'Creating...' : `Create Order${totalPrice > 0 ? ` - $${totalPrice.toFixed(2)}` : ''}`}
      </button>

      {/* Print Receipt */}
      <button
        onClick={onPrintReceipt}
        disabled={!canPrint}
        className="h-[60px] px-6 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-transform touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        Print
      </button>

      {/* Clear */}
      <button
        onClick={onClear}
        className="h-[60px] px-6 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 active:scale-[0.98] transition-transform touch-manipulation flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Clear
      </button>

      {/* Exit POS Mode */}
      <button
        onClick={onExit}
        className="h-[60px] px-6 bg-gray-600 text-white font-semibold rounded-xl hover:bg-gray-700 active:scale-[0.98] transition-transform touch-manipulation flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
        Exit
      </button>
    </div>
  );
}
