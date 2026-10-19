export type WriteOffStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED';

/** Passage en perte : proposé par la comptabilité, tranché par une autre personne de la direction. */
export type WriteOff = {
    id: string; installmentId: string; studentId: string; studentPhotoId?: string | null;
    studentName: string; registrationNumber: string; installmentLabel: string; dueDate?: string | null;
    amount: number; reason: string; status: WriteOffStatus; proposedBy: string; proposedAt: string;
    decidedBy?: string | null; decidedAt?: string | null; decisionNote?: string | null; decidable: boolean;
};

export const WRITE_OFF_STATUSES: Record<WriteOffStatus, { label: string; tone: 'ok' | 'warn' | 'late' | 'mute' }> = {
    PROPOSED: { label: 'À valider', tone: 'warn' },
    APPROVED: { label: 'Passée en perte', tone: 'late' },
    REJECTED: { label: 'Refusée', tone: 'mute' },
};

export function useWriteOffs() {
    const api = useApi();
    return {
        list: () => api<WriteOff[]>('/write-offs'),
        propose: (installmentId: string, reason: string) => api<WriteOff>('/write-offs', { method: 'POST', body: { installmentId, reason } }),
        approve: (id: string, note?: string) => api<WriteOff>(`/write-offs/${id}/approve`, { method: 'POST', body: { note } }),
        reject: (id: string, note: string) => api<WriteOff>(`/write-offs/${id}/reject`, { method: 'POST', body: { note } }),
    };
}
