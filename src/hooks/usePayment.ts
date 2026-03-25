import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface PaypalOrderResult {
  orderId: string;
}

interface PaymentResult {
  success: boolean;
}

export function usePaypalPayment() {
  const [loading, setLoading] = useState(false);

  const createOrder = useCallback(async (bookingId: string): Promise<string> => {
    setLoading(true);
    try {
      const fn = httpsCallable<{ bookingId: string }, PaypalOrderResult>(
        functions,
        'createPaypalOrder'
      );
      const result = await fn({ bookingId });
      return result.data.orderId;
    } finally {
      setLoading(false);
    }
  }, []);

  const captureOrder = useCallback(
    async (orderId: string, bookingId: string): Promise<boolean> => {
      setLoading(true);
      try {
        const fn = httpsCallable<
          { orderId: string; bookingId: string },
          PaymentResult
        >(functions, 'capturePaypalOrder');
        const result = await fn({ orderId, bookingId });
        return result.data.success;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { createOrder, captureOrder, loading };
}

export function useTossPayment() {
  const [loading, setLoading] = useState(false);

  const confirmPayment = useCallback(
    async (params: {
      paymentKey: string;
      orderId: string;
      amount: number;
      bookingId: string;
    }): Promise<boolean> => {
      setLoading(true);
      try {
        const fn = httpsCallable<typeof params, PaymentResult>(
          functions,
          'confirmTossPayment'
        );
        const result = await fn(params);
        return result.data.success;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { confirmPayment, loading };
}
