export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

/**
 * Normalize bank accounts from a `siteConfig/general` document, with backward
 * compatibility for the legacy single-account `bankTransfer` field.
 */
export function normalizeBankAccounts(data: unknown): BankAccount[] {
  const doc = (data ?? {}) as Record<string, unknown>;

  const list = doc.bankAccounts;
  if (Array.isArray(list) && list.length > 0) {
    return list.map((acc, i) => {
      const a = (acc ?? {}) as Record<string, unknown>;
      return {
        id: typeof a.id === 'string' && a.id ? a.id : `bank-${i}`,
        bankName: String(a.bankName ?? ''),
        accountNumber: String(a.accountNumber ?? ''),
        accountHolder: String(a.accountHolder ?? ''),
      };
    });
  }

  const legacy = doc.bankTransfer as Record<string, unknown> | undefined;
  if (legacy && (legacy.bankName || legacy.accountNumber || legacy.accountHolder)) {
    return [
      {
        id: 'bank-0',
        bankName: String(legacy.bankName ?? ''),
        accountNumber: String(legacy.accountNumber ?? ''),
        accountHolder: String(legacy.accountHolder ?? ''),
      },
    ];
  }

  return [];
}

export function newBankAccount(): BankAccount {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `bank-${Date.now()}`;
  return { id, bankName: '', accountNumber: '', accountHolder: '' };
}
