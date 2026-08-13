/**
 * Réglages de l'établissement : identité, année scolaire, notifications, journal d'audit.
 *
 * Trois sections de la maquette n'y figurent pas, et l'absence est délibérée. Les moyens de
 * paiement et le taux de commission sont pilotés par YPYit, non par l'école. Les utilisateurs se
 * gèrent depuis Personnel → Accès au portail, et deux endroits pour ouvrir un accès finiraient par
 * diverger. L'abonnement relève de la facturation d'YPYit.
 */

export type EstablishmentContact = {
    id: string;
    type: 'EMAIL' | 'PHONE_NUMBER';
    value: string;
    isPrimary: boolean;
};

export type Establishment = {
    id: string;
    name: string;
    shortName?: string;
    accreditationNumber?: string;
    webSite?: string;
    /** L'adresse se lit imbriquée mais s'écrit à plat, en `addressName`. */
    address?: { id?: string; name?: string };
    contacts: EstablishmentContact[];
};

/**
 * Modification partielle : les champs omis gardent leur valeur.
 *
 * <p>Les contacts s'écrivent en revanche <strong>en entier</strong>, et avec leur `id` : c'est lui
 * qui distingue une mise à jour d'une création, la contrainte d'unicité applicative refusant le
 * doublon. Ils étaient jusqu'ici en lecture seule dans le portail — l'école lisait ses propres
 * coordonnées sans pouvoir les corriger, alors que le back-office, lui, les modifiait.
 */
export type EstablishmentUpdateForm = {
    name: string;
    shortName?: string;
    accreditationNumber?: string;
    webSite?: string;
    addressName?: string;
    contacts?: { id?: string; type: 'EMAIL' | 'PHONE_NUMBER'; value: string; isPrimary?: boolean }[];
};

/** Le contact principal d'un type, tel qu'il est enregistré — `id` compris. */
export function primaryContact(establishment: Establishment | null, type: 'EMAIL' | 'PHONE_NUMBER') {
    const matching = (establishment?.contacts ?? []).filter((contact) => contact.type === type);
    return matching.find((contact) => contact.isPrimary) ?? matching[0];
}

/** Premier contact du type demandé, le principal d'abord. */
export function contactOf(establishment: Establishment | null, type: 'EMAIL' | 'PHONE_NUMBER') {
    const matching = (establishment?.contacts ?? []).filter((contact) => contact.type === type);
    return (matching.find((contact) => contact.isPrimary) ?? matching[0])?.value;
}

export type AcademicPeriod = {
    id?: string;
    label: string;
    startDate: string;
    endDate: string;
    position?: number;
};

export type AcademicYear = {
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    active: boolean;
    periods: AcademicPeriod[];
};

export type AcademicYearForm = {
    label: string;
    startDate: string;
    endDate: string;
    active: boolean;
    periods: { label: string; startDate: string; endDate: string }[];
};

export type NotificationEvent = 'RECEIPT_ISSUED' | 'INSTALLMENT_DUE_SOON' | 'INSTALLMENT_OVERDUE';
export type NotificationChannel = 'PUSH' | 'EMAIL' | 'SMS';

export type ChannelSetting = {
    channel: NotificationChannel;
    enabled: boolean;
    /** Canal que l'école ne peut pas couper : montré coché et inactif, avec sa raison. */
    locked: boolean;
    lockedReason?: string;
};

export type NotificationPreference = {
    event: NotificationEvent;
    channels: ChannelSetting[];
};

export type AuditAction =
    | 'PAYMENT_COLLECTED'
    | 'FEE_SCHEDULE_DEFINED'
    | 'FEE_LEVEL_DETACHED'
    | 'ACCOUNTING_EXPORTED'
    | 'REMINDER_CAMPAIGN_SENT'
    | 'PORTAL_ACCESS_GRANTED'
    | 'PORTAL_ACCESS_REVOKED';

export type AuditEvent = {
    id: string;
    action: AuditAction;
    occurredAt: string;
    actorId?: string;
    actorName?: string;
    target?: string;
    details?: string;
};

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
    RECEIPT_ISSUED: 'Reçu de paiement',
    INSTALLMENT_DUE_SOON: 'Échéance à venir',
    INSTALLMENT_OVERDUE: 'Retard de paiement',
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
    PUSH: 'Notification',
    EMAIL: 'E-mail',
    SMS: 'SMS',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
    PAYMENT_COLLECTED: 'Encaissement au guichet',
    FEE_LEVEL_DETACHED: 'Niveau retiré d\'un frais',
    FEE_SCHEDULE_DEFINED: 'Échéancier redéfini',
    ACCOUNTING_EXPORTED: 'Export comptable',
    REMINDER_CAMPAIGN_SENT: 'Campagne de relance',
    PORTAL_ACCESS_GRANTED: 'Accès au portail ouvert',
    PORTAL_ACCESS_REVOKED: 'Accès au portail fermé',
};

/** Les trois canaux affichés dans l'ordre de la maquette, sur toute la matrice. */
export const NOTIFICATION_CHANNELS: NotificationChannel[] = ['SMS', 'EMAIL', 'PUSH'];

export function auditActionLabel(action?: AuditAction | null) {
    return action ? AUDIT_ACTION_LABELS[action] ?? action : '—';
}

export function useSettings() {
    const api = useApi();

    /* ---- Identité ---- */

    function establishment(id: string) {
        return api<Establishment>(`/establishments/${id}`);
    }

    function updateEstablishment(id: string, body: EstablishmentUpdateForm) {
        return api<Establishment>(`/establishments/${id}`, { method: 'PUT', body });
    }

    /* ---- Année scolaire ---- */

    function years() {
        return api<AcademicYear[]>('/academic-years');
    }

    function createYear(body: AcademicYearForm) {
        return api<AcademicYear>('/academic-years', { method: 'POST', body });
    }

    function updateYear(id: string, body: AcademicYearForm) {
        return api<AcademicYear>(`/academic-years/${id}`, { method: 'PUT', body });
    }

    function removeYear(id: string) {
        return api(`/academic-years/${id}`, { method: 'DELETE' });
    }

    /* ---- Notifications ---- */

    function notifications() {
        return api<NotificationPreference[]>('/notification-preferences');
    }

    function setNotification(body: {
        event: NotificationEvent;
        channel: NotificationChannel;
        enabled: boolean;
    }) {
        return api<NotificationPreference[]>('/notification-preferences', { method: 'PUT', body });
    }

    /* ---- Journal d'audit ---- */

    function audit(from: string, to: string, actorId?: string) {
        return api<AuditEvent[]>('/audit', { query: { from, to, actorId: actorId || undefined } });
    }

    return {
        establishment, updateEstablishment,
        years, createYear, updateYear, removeYear,
        notifications, setNotification,
        audit,
    };
}
