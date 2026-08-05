import type { PaymentChannel } from '~/composables/useBilling';

export type PaymentIntentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export type Transaction = {
    id: string;
    /** Nulle pour un encaissement au guichet : il ne passe pas par l'agrégateur. */
    reference?: string;
    createdAt: string;
    settledAt?: string;
    status: PaymentIntentStatus;
    channel: PaymentChannel;
    providerType?: string;
    studentLabel: string;
    studentRegistrationNumber?: string;
    installmentLabel?: string;
    payerName?: string;
    amountSchool: number;
    amountCommission: number;
    /** Un reçu existe. Une opération réussie sans reçu est à réconcilier. */
    reconciled: boolean;
    receiptNumber?: string;
};

export type TransactionSummary = {
    collectedNet: number;
    transactionCount: number;
    toReconcile: number;
    awaitingProvider: number;
    commissionCollected: number;
};

export const TRANSACTION_STATUSES: { value: PaymentIntentStatus; label: string; tone: string }[] = [
    { value: 'SUCCEEDED', label: 'Encaissée', tone: 'var(--brand-600)' },
    { value: 'PENDING', label: 'En attente', tone: 'var(--warning-solid)' },
    { value: 'FAILED', label: 'Échouée', tone: 'var(--danger-solid)' },
    { value: 'CANCELLED', label: 'Annulée', tone: 'var(--text-faint)' },
];

export function transactionStatusLabel(status?: PaymentIntentStatus | null) {
    return TRANSACTION_STATUSES.find((s) => s.value === status)?.label ?? '—';
}

export function transactionStatusTone(status?: PaymentIntentStatus | null) {
    return TRANSACTION_STATUSES.find((s) => s.value === status)?.tone ?? 'var(--text-muted)';
}

/** Le moyen d'entrée : l'agrégateur en ligne, ou le mode d'encaissement au guichet. */
export function paymentMeanLabel(transaction: Transaction) {
    if (transaction.channel === 'ONLINE') {
        return transaction.providerType ?? 'En ligne';
    }
    return { CASH: 'Espèces', CHECK: 'Chèque', BANK_TRANSFER: 'Virement' }[transaction.channel]
        ?? 'Guichet';
}

export function useTransactions() {
    const api = useApi();

    function list(from: string, to: string) {
        return api<Transaction[]>('/payments/transactions', { query: { from, to } });
    }

    function summary(from: string, to: string) {
        return api<TransactionSummary>('/payments/transactions/summary', { query: { from, to } });
    }

    return { list, summary };
}
