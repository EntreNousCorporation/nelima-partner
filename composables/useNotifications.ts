/**
 * Fil de notifications de l'école.
 *
 * Le serveur ne stocke rien : chaque élément est déduit d'un fait daté qui existe déjà. L'état
 * « lu » tient en une date posée sur le compte, et ouvrir le panneau la déplace.
 */

export type NotificationKind = 'ACTIVITY_REQUEST' | 'PAYMENT_TO_RECONCILE' | 'INSTALLMENT_OVERDUE';

export type AppNotification = {
    id: string;
    kind: NotificationKind;
    title: string;
    detail?: string;
    occurredAt: string;
    link: string;
    unread: boolean;
};

/** Symbole et teinte par nature : la cloche se parcourt du regard, pas en lisant. */
export const NOTIFICATION_KINDS: Record<NotificationKind, { icon: string; tone: string }> = {
    ACTIVITY_REQUEST: { icon: 'ball', tone: 'var(--purple)' },
    PAYMENT_TO_RECONCILE: { icon: 'alert', tone: 'var(--danger)' },
    INSTALLMENT_OVERDUE: { icon: 'clock', tone: 'var(--warning)' },
};

export function notificationIcon(kind: NotificationKind) {
    return NOTIFICATION_KINDS[kind]?.icon ?? 'bell';
}

export function notificationTone(kind: NotificationKind) {
    return NOTIFICATION_KINDS[kind]?.tone ?? 'var(--text-muted)';
}

/** Ancienneté en clair. « Il y a 3 j » se lit plus vite qu'une date à recomposer. */
export function sinceLabel(iso: string) {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `il y a ${hours} h`;
    const days = Math.round(hours / 24);
    return `il y a ${days} j`;
}

export function useNotifications() {
    const api = useApi();

    function feed() {
        return api<AppNotification[]>('/notifications');
    }

    function markSeen() {
        return api('/notifications/seen', { method: 'POST' });
    }

    return { feed, markSeen };
}
