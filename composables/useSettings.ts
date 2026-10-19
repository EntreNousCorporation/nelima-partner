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
    /** Lien public du logo, servi par storage.nelima.ci. */
    logo?: string | null;
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
    /** Nouveau logo, en base64 brut (sans le préfixe `data:`). */
    coverImage?: { name: string; base64: string; extension: string };
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

/**
 * Année scolaire de la plateforme, vue par l'école : ses trimestres et son état y sont propres.
 *
 * `active` désigne l'année en cours (la même pour toutes les écoles) ; `consulted`, celle que
 * l'utilisateur a choisi d'afficher.
 */
export type AcademicYear = {
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    active: boolean;
    consulted: boolean;
    status?: 'OPEN' | 'CLOSED' | null;
    periods: AcademicPeriod[];
};

export type AcademicPeriodForm = { label: string; startDate: string; endDate: string };

/** Où en est la clôture d'une année dans l'école. */
export type YearClosure = {
    academicYearId: string;
    label: string;
    status: 'OPEN' | 'CLOSED';
    closedAt?: string | null;
    closedBy?: string | null;
    current: boolean;
    closable: boolean;
    blocker?: string | null;
    pendingCount: number;
    pendingAmount: number;
    paymentsInProgress: number;
    outstanding: { studentId: string; studentName: string; registrationNumber: string; installmentCount: number; amount: number }[];
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

    /** Les trimestres de l'école pour une année : ses dates à elle. */
    function definePeriods(id: string, periods: AcademicPeriodForm[]) {
        return api<AcademicYear>(`/academic-years/${id}/periods`, { method: 'PUT', body: periods });
    }

    function closure(id: string) {
        return api<YearClosure>(`/academic-years/${id}/closure`);
    }

    /** Clôture l'année dans l'école : refusé tant que tout n'est pas encaissé. */
    function closeYear(id: string) {
        return api<YearClosure>(`/academic-years/${id}/close`, { method: 'POST' });
    }

    /** L'année que l'utilisateur consulte ; sans identifiant, retour à l'année en cours. */
    function consult(id?: string) {
        return api('/academic-years/consulted', { method: 'PUT', query: id ? { academicYearId: id } : {} });
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
        years, definePeriods, consult, closure, closeYear,
        notifications, setNotification,
        audit,
    };
}
