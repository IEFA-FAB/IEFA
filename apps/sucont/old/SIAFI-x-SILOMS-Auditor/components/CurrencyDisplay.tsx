import React from 'react';

interface CurrencyDisplayProps {
  value: number;
  className?: string;
  isCompact?: boolean;
}

export const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({ value, className = '', isCompact = false }) => {
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  // Split into integer and decimal parts
  const parts = formatted.split(',');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  return (
    <span className={`font-bold tracking-tight ${className}`}>
      {integerPart}
      <span className="text-[0.7em]">,{decimalPart}</span>
    </span>
  );
};
