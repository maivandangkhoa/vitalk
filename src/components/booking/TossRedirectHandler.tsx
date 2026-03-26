import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useTossPayment } from '@/hooks/usePayment';

/**
 * Handles Toss payment redirect (success/fail) when returning to /book page.
 * URL format: /book?toss=success&paymentKey=...&orderId=...&amount=...&bookingId=...
 */
export default function TossRedirectHandler() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { confirmPayment } = useTossPayment();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const tossStatus = searchParams.get('toss');
  const paymentKey = searchParams.get('paymentKey');
  const orderId = searchParams.get('orderId');
  const amount = searchParams.get('amount');
  const bookingId = searchParams.get('bookingId');

  useEffect(() => {
    if (tossStatus === 'success' && paymentKey && orderId && amount && bookingId) {
      confirmPayment({
        paymentKey,
        orderId,
        amount: Number(amount),
        bookingId,
      })
        .then(() => {
          setStatus('success');
          // Clear search params
          setSearchParams({});
        })
        .catch((err) => {
          setStatus('error');
          setErrorMsg(err instanceof Error ? err.message : 'Payment confirmation failed');
        });
    } else if (tossStatus === 'fail') {
      setStatus('error');
      setErrorMsg(searchParams.get('message') || 'Payment failed');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-indigo-500" />
            <h2 className="text-xl font-bold">{t('payment.confirmingPayment')}</h2>
            <p className="mt-2 text-muted-foreground">{t('payment.pleaseWaitVerify')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8">
            <CheckCircle className="mx-auto mb-4 h-16 w-16 text-emerald-500" />
            <h2 className="text-2xl font-bold">{t('payment.paymentSuccessful')}</h2>
            <p className="mt-2 text-muted-foreground">{t('payment.lessonBookedConfirmed')}</p>
            <div className="mt-6 flex flex-col gap-2">
              <Button onClick={() => navigate('/my-bookings')}>{t('payment.viewMyBookings')}</Button>
              <Button variant="outline" onClick={() => navigate('/book')}>{t('payment.bookAnotherLesson')}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-8">
          <XCircle className="mx-auto mb-4 h-16 w-16 text-rose-500" />
          <h2 className="text-2xl font-bold">{t('payment.paymentFailed')}</h2>
          <p className="mt-2 text-muted-foreground">{errorMsg}</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => navigate('/book')}>{t('payment.tryAgain')}</Button>
            <Button variant="outline" onClick={() => navigate('/my-bookings')}>{t('payment.viewMyBookings')}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
