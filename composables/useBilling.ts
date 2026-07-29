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

export type Receipt = {
    id: string;
    number: string;
    amount: number;
    issuedAt: string;
    studentLabel?: string;
    studentRegistrationNumber?: string;
    payerLabel?: string;
};

export type PageOf<T> = { content: T[]; totalElements: number; totalPages: number; number: number };

export const CHANNELS = [
    { value: 'CASH', label: 'Espèces' },
    { value: 'CHECK', label: 'Chèque' },
    { value: 'BANK_TRANSFER', label: 'Virement' },
];

export function formatAmount(value?: number | string) {
    return Number(value ?? 0).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';
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

    /** Encaissement au guichet : rend le reçu émis. */
    function collectOffline(body: { installmentId: string; channel: string; reference?: string }) {
        return api<Receipt>('/payments/offline', { method: 'POST', body });
    }

    function receipts(page = 0, size = 50) {
        return api<PageOf<Receipt>>('/receipts', { query: { page, size } });
    }

    return { installments, collectOffline, receipts };
}
