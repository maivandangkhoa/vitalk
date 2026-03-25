import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { toast } from 'sonner';
import { usePaypalPayment } from '@/hooks/usePayment';

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

  return (
    <PayPalButtons
      style={{ layout: 'vertical', shape: 'rect', label: 'pay' }}
      createOrder={async () => {
        try {
          const orderId = await createOrder(bookingId);
          return orderId;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to create order';
          onError(msg);
          throw err;
        }
      }}
      onApprove={async (data) => {
        try {
          await captureOrder(data.orderID, bookingId);
          onSuccess();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Payment capture failed';
          onError(msg);
        }
      }}
      onError={(err) => {
        toast.error('PayPal error');
        onError(String(err));
      }}
      onCancel={() => {
        toast.info('Payment cancelled');
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
  if (!PAYPAL_CLIENT_ID || PAYPAL_CLIENT_ID === 'your_paypal_client_id') {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-center text-sm text-muted-foreground">
        <p>PayPal is not configured yet.</p>
        <p className="mt-1 text-xs">Set VITE_PAYPAL_CLIENT_ID in .env</p>
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
          Pay <span className="font-mono">${amount}</span> {currency} with PayPal
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
