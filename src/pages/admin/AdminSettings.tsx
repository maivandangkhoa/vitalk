import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Save, Loader2, CreditCard, Building2, Landmark, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AnimatedSection } from '@/components/shared/motion';

interface SiteConfig {
  paypal: { email: string };
  toss: { merchantId: string };
  bankTransfer: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
  cancellationPolicy: string;
}

const DEFAULT_CONFIG: SiteConfig = {
  paypal: { email: '' },
  toss: { merchantId: '' },
  bankTransfer: {
    bankName: 'Shinhan Bank',
    accountNumber: '',
    accountHolder: '',
  },
  cancellationPolicy: '',
};

export default function AdminSettings() {
  const { t } = useTranslation('admin');
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'siteConfig', 'general'));
        if (snap.exists()) {
          setConfig({ ...DEFAULT_CONFIG, ...snap.data() } as SiteConfig);
        }
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'siteConfig', 'general'), {
        ...config,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success(t('settings.saved'));
    } catch {
      toast.error(t('settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div>
      <AnimatedSection className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.settings')}</h1>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {t('settings.save')}
        </Button>
      </AnimatedSection>

      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h3 className="flex items-center gap-2 font-semibold"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50"><CreditCard className="h-4 w-4 text-indigo-500" /></div>{t('settings.paypal')}</h3>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('settings.paypalEmail')}</label>
              <input
                value={config.paypal.email}
                onChange={(e) => setConfig((c) => ({ ...c, paypal: { email: e.target.value } }))}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="your@paypal.com"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <h3 className="flex items-center gap-2 font-semibold"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50"><Building2 className="h-4 w-4 text-purple-500" /></div>{t('settings.tossPayments')}</h3>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('settings.merchantId')}</label>
              <input
                value={config.toss.merchantId}
                onChange={(e) => setConfig((c) => ({ ...c, toss: { merchantId: e.target.value } }))}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <h3 className="flex items-center gap-2 font-semibold"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50"><Landmark className="h-4 w-4 text-emerald-500" /></div>{t('settings.bankTransfer')}</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">{t('settings.bankName')}</label>
                <input
                  value={config.bankTransfer.bankName}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      bankTransfer: { ...c.bankTransfer, bankName: e.target.value },
                    }))
                  }
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('settings.accountNumber')}</label>
                <input
                  value={config.bankTransfer.accountNumber}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      bankTransfer: { ...c.bankTransfer, accountNumber: e.target.value },
                    }))
                  }
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('settings.accountHolder')}</label>
                <input
                  value={config.bankTransfer.accountHolder}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      bankTransfer: { ...c.bankTransfer, accountHolder: e.target.value },
                    }))
                  }
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <h3 className="flex items-center gap-2 font-semibold"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50"><FileText className="h-4 w-4 text-amber-500" /></div>{t('settings.cancellationPolicy')}</h3>
            <textarea
              value={config.cancellationPolicy}
              onChange={(e) => setConfig((c) => ({ ...c, cancellationPolicy: e.target.value }))}
              rows={4}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              placeholder={t('settings.cancellationPolicyPlaceholder')}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
