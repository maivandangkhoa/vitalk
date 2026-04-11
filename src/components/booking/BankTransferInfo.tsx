import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatPrice, type SupportedCurrency } from '@/lib/currency';

interface BankTransferInfoProps {
  bookingId: string;
  amount: number;
  currency: string;
}

// Bank info - will come from siteConfig/general in Firestore later
const BANK_INFO = {
  bankName: 'Shinhan Bank (신한은행)',
  accountNumber: '110-XXX-XXXXXX',
  accountHolder: 'Nguyen (윈)',
};

export default function BankTransferInfo({
  bookingId,
  amount,
  currency,
}: BankTransferInfoProps) {
  const { t } = useTranslation('booking');
  const { t: tc } = useTranslation('common');
  const [copied, setCopied] = useState('');

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied!`);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('payment.bankNote')}</p>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <InfoRow
            label={t('payment.bankName')}
            value={BANK_INFO.bankName}
            copied={copied}
            onCopy={copyToClipboard}
          />
          <InfoRow
            label={t('payment.accountNumber')}
            value={BANK_INFO.accountNumber}
            copied={copied}
            onCopy={copyToClipboard}
          />
          <InfoRow
            label={t('payment.accountHolder')}
            value={BANK_INFO.accountHolder}
            copied={copied}
            onCopy={copyToClipboard}
          />
          <InfoRow
            label={t('payment.reference')}
            value={`HAVI${Array.from(bookingId.substring(0, 4)).map(c => c.charCodeAt(0) % 10).join('')}`}
            copied={copied}
            onCopy={copyToClipboard}
          />

          <div className="flex items-center justify-between border-t pt-3">
            <span className="font-medium">{t('payment.total')}</span>
            <span className="font-mono text-lg font-bold">{formatPrice(amount, (currency || 'USD') as SupportedCurrency)}</span>
          </div>
        </CardContent>
      </Card>

      <Badge variant="outline" className="w-full justify-center rounded-xl border-amber-200 bg-amber-50 py-2 text-amber-600">
        {tc('payment.confirmedAfterVerification')}
      </Badge>
    </div>
  );
}

function InfoRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: string;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
      <button
        onClick={() => onCopy(value, label)}
        className="rounded-xl p-1.5 text-muted-foreground transition-all duration-200 hover:bg-indigo-50 hover:text-indigo-500"
      >
        {copied === label ? (
          <CheckCircle className="h-4 w-4 text-emerald-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
