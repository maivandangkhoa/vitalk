import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { usePaypalPayment } from '@/hooks/usePayment';
import { formatPrice, type SupportedCurrency } from '@/lib/currency';

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID || '';

interface PaypalCheckoutProps {
  bookingId: string;
  amount: number;
  currency: string;
  onSuccess: () => void;
  onError: (error: string) => void;
}

function PaypalButtonWrapper({
  bookingId,
  onSuccess,
  onError,
}: Omit<PaypalCheckoutProps, 'amount' | 'currency'>) {
  const { createOrder, captureOrder } = usePaypalPayment();
  const { t } = useTranslation('common');

  return (
    <PayPalButtons
      style={{ layout: 'vertical', shape: 'rect', label: 'pay' }}
      createOrder={async () => {
        try {
          const orderId = await createOrder(bookingId);
          return orderId;
        } catch (err) {
          const msg = err instanceof Error ? err.message : t('payment.createOrderFailed');
          onError(msg);
          throw err;
        }
      }}
      onApprove={async (data) => {
        try {
          await captureOrder(data.orderID, bookingId);
          onSuccess();
        } catch (err) {
          const msg = err instanceof Error ? err.message : t('payment.capturePaymentFailed');
          onError(msg);
        }
      }}
      onError={(err) => {
        toast.error(t('payment.paypalError'));
        onError(String(err));
      }}
      onCancel={() => {
        toast.info(t('payment.paymentCancelled'));
      }}
    />
  );
}

export default function PaypalCheckout({
  bookingId,
  amount,
  currency,
  onSuccess,
  onError,
}: PaypalCheckoutProps) {
  const { t } = useTranslation('common');

  if (!PAYPAL_CLIENT_ID || PAYPAL_CLIENT_ID === 'your_paypal_client_id') {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-center text-sm text-muted-foreground">
        <p>{t('payment.paypalNotConfigured')}</p>
        <p className="mt-1 text-xs">{t('payment.paypalSetEnv')}</p>
      </div>
    );
  }

  return (
    <PayPalScriptProvider
      options={{
        clientId: PAYPAL_CLIENT_ID,
        currency: currency.toUpperCase(),
        intent: 'capture',
      }}
    >
      <div className="min-h-[120px]">
        <p className="mb-3 text-sm text-muted-foreground">
          {formatPrice(amount, (currency || 'USD') as SupportedCurrency)} — PayPal
        </p>
        <PaypalButtonWrapper
          bookingId={bookingId}
          onSuccess={onSuccess}
          onError={onError}
        />
      </div>
    </PayPalScriptProvider>
  );
}
