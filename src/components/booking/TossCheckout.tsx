import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useTossPayment } from '@/hooks/usePayment';
import { useCurrencySettings } from '@/hooks/useCurrency';
import { formatPrice } from '@/lib/currency';

const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY || '';
const TOSS_SDK_URL = 'https://js.tosspayments.com/v2/standard';

interface TossCheckoutProps {
  bookingId: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  orderName: string;
  onSuccess: () => void;
  onError: (error: string) => void;
}

export default function TossCheckout({
  bookingId,
  amount,
  customerName,
  customerEmail,
  orderName,
  onSuccess,
  onError,
}: TossCheckoutProps) {
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [paying, setPaying] = useState(false);
  const tossPaymentsRef = useRef<unknown>(null);
  const { confirmPayment } = useTossPayment();
  const { t } = useTranslation('common');
  const { config } = useCurrencySettings();

  const krwRate = config.exchangeRates['KRW'] ?? 1350;
  const krwAmount = Math.round(amount * krwRate);

  // Load Toss SDK
  useEffect(() => {
    if (!TOSS_CLIENT_KEY || TOSS_CLIENT_KEY === 'your_toss_client_key') return;

    const existing = document.querySelector(`script[src="${TOSS_SDK_URL}"]`);
    if (existing) {
      setSdkLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = TOSS_SDK_URL;
    script.onload = () => setSdkLoaded(true);
    script.onerror = () => toast.error(t('payment.tossLoadFailed'));
    document.head.appendChild(script);
  }, []);

  // Initialize TossPayments
  useEffect(() => {
    if (!sdkLoaded || !TOSS_CLIENT_KEY) return;

    const win = window as unknown as Record<string, unknown>;
    if (typeof win.TossPayments === 'function') {
      const TossPayments = win.TossPayments as (clientKey: string) => unknown;
      tossPaymentsRef.current = TossPayments(TOSS_CLIENT_KEY);
    }
  }, [sdkLoaded]);

  if (!TOSS_CLIENT_KEY || TOSS_CLIENT_KEY === 'your_toss_client_key') {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-center text-sm text-muted-foreground">
        <p>{t('payment.tossNotConfigured')}</p>
        <p className="mt-1 text-xs">{t('payment.tossSetEnv')}</p>
      </div>
    );
  }

  const handlePayment = async () => {
    const tp = tossPaymentsRef.current as {
      requestPayment: (
        method: string,
        params: Record<string, unknown>
      ) => Promise<{ paymentKey: string; orderId: string; amount: number }>;
    } | null;

    if (!tp) {
      toast.error(t('payment.tossNotReady'));
      return;
    }

    setPaying(true);
    try {
      const orderId = `vitalk_${bookingId}_${Date.now()}`;

      const result = await tp.requestPayment('CARD', {
        amount: krwAmount,
        orderId,
        orderName,
        customerName,
        customerEmail,
        successUrl: `${window.location.origin}/book?toss=success&bookingId=${bookingId}`,
        failUrl: `${window.location.origin}/book?toss=fail&bookingId=${bookingId}`,
      });

      if (result) {
        await confirmPayment({
          paymentKey: result.paymentKey,
          orderId: result.orderId,
          amount: result.amount,
          bookingId,
        });
        onSuccess();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment failed';
      if (!msg.includes('cancelled') && !msg.includes('PAY_PROCESS_CANCELED')) {
        onError(msg);
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        {formatPrice(krwAmount, 'KRW')} ({formatPrice(amount, 'USD')})
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        {t('payment.tossHelperText')}
      </p>
      <Button
        onClick={handlePayment}
        disabled={paying || !sdkLoaded}
        className="w-full bg-indigo-500 hover:bg-indigo-600"
      >
        {paying ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <CreditCard className="mr-2 h-4 w-4" />
        )}
        {paying ? t('payment.processing') : `Toss ${formatPrice(krwAmount, 'KRW')}`}
      </Button>
    </div>
  );
}
