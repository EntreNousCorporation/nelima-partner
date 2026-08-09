export type Installment = {
    id: string;
    label?: string;
    amount: number;
    dueDate?: string;
    status: 'PENDING' | 'PAID' | 'CANCELLED';
    paidAt?: string;
    studentFee?: {
        student?: { id: string; firstName: string; lastName: string; registrationNumber: string };
        fee?: { name: string };
    };
};

export type PaymentChannel = 'ONLINE' | 'CASH' | 'CHECK' | 'BANK_TRANSFER';

export type Receipt = {
    id: string;
    number: string;
    amount: number;
    issuedAt: string;
    studentLabel?: string;
    studentRegistrationNumber?: string;
    payerLabel?: string;
    channel?: PaymentChannel;
};

export type PageOf<T> = { content: T[]; totalElements: number; totalPages: number; number: number };

/** Modes encaissables au guichet. Le paiement en ligne n'y figure pas : il ne se saisit pas. */
export const CHANNELS = [
    { value: 'CASH', label: 'Espèces' },
    { value: 'CHECK', label: 'Chèque' },
    { value: 'BANK_TRANSFER', label: 'Virement' },
];

const CHANNEL_LABELS: Record<string, string> = {
    ONLINE: 'En ligne',
    CASH: 'Espèces',
    CHECK: 'Chèque',
    BANK_TRANSFER: 'Virement',
};

export function channelLabel(channel?: string) {
    return channel ? CHANNEL_LABELS[channel] ?? channel : '—';
}

/** Heure seule : dans un journal de caisse, la date est celle de la journée en cours. */
export function formatTime(value?: string) {
    if (!value) return '—';
    return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Conservée pour les appelants existants ; la mise en forme est celle de `useMoney`. */
export function formatAmount(value?: number | string) {
    return fcfa(Number(value ?? 0));
}

export function formatDate(value?: string) {
    if (!value) return '—';
    const day = value.slice(0, 10).split('-');
    return day.length === 3 ? `${day[2]}/${day[1]}/${day[0]}` : value;
}

export function studentOf(installment: Installment) {
    const s = installment.studentFee?.student;
    if (!s) return { name: '—', matricule: '—' };
    return { name: `${s.lastName} ${s.firstName}`.trim(), matricule: s.registrationNumber };
}

export function useBilling() {
    const api = useApi();

    function installments(params: { status?: string; dueBefore?: string; studentId?: string; page?: number; size?: number }) {
        const query: Record<string, any> = { page: params.page ?? 0, size: params.size ?? 50 };
        if (params.status) query.status = params.status;
        if (params.dueBefore) query.dueBefore = params.dueBefore;
        if (params.studentId) query.studentId = params.studentId;
        return api<PageOf<Installment>>('/installments', { query });
    }

    /**
     * Encaissement au guichet : rend le reçu émis.
     *
     * Le payeur est facultatif et sert au cas où un tiers se présente au comptoir ; sans lui, le
     * reçu part au tuteur enregistré de l'élève.
     */
    function collectOffline(body: {
        installmentId: string; channel: string; reference?: string;
        payerName?: string; payerEmail?: string;
    }) {
        return api<Receipt>('/payments/offline', { method: 'POST', body });
    }

    function receipts(params: {
        page?: number; size?: number; issuedFrom?: string; issuedTo?: string;
        channel?: string; keyword?: string; studentId?: string;
    } = {}) {
        const query: Record<string, any> = { page: params.page ?? 0, size: params.size ?? 50 };
        // Bornes, mode et recherche sont posés côté serveur : filtrer la page déjà chargée
        // reviendrait à ignorer les reçus des pages suivantes tout en ayant l'air d'avoir cherché.
        if (params.issuedFrom) query.issuedFrom = params.issuedFrom;
        if (params.issuedTo) query.issuedTo = params.issuedTo;
        if (params.channel) query.channel = params.channel;
        if (params.keyword?.trim()) query.keyword = params.keyword.trim();
        if (params.studentId) query.studentId = params.studentId;
        return api<PageOf<Receipt>>('/receipts', { query });
    }

    return { installments, collectOffline, receipts };
}
