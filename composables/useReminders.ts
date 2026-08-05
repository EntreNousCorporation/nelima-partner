export type ReminderTarget = 'LATE_30' | 'LATE_7' | 'DUE_SOON' | 'ALL_UNPAID';
export type ReminderChannel = 'PUSH' | 'SMS';

export type ReminderTargetCount = {
    target: ReminderTarget;
    label: string;
    installmentCount: number;
    familyCount: number;
    /** Tuteurs joignables : c'est ce nombre qui approche le coût d'un envoi facturé. */
    recipientCount: number;
    amountDue: number;
};

export type ReminderCampaign = {
    id: string;
    name: string;
    target: ReminderTarget;
    targetLabel: string;
    channels: ReminderChannel[];
    messageTemplate: string;
    sentAt: string;
    sentCount: number;
    /** Écartés parce que déjà relancés le jour même. */
    skippedCount: number;
    paidCount: number;
    recoveredAmount: number;
};

export const REMINDER_CHANNELS: { value: ReminderChannel; label: string; hint: string }[] = [
    { value: 'PUSH', label: 'Notification', hint: 'gratuite, dans l’application' },
    { value: 'SMS', label: 'SMS', hint: 'facturé à l’envoi' },
];

/** Gabarit proposé par défaut, repris de la maquette. */
export const DEFAULT_TEMPLATE = 'Bonjour {parent}, la scolarité de {eleve} ({classe}) d\'un montant '
    + 'de {montant} est échue depuis {retard} jours. Réglez depuis l\'application Nelima. Merci.';

export const TEMPLATE_VARIABLES = ['{parent}', '{eleve}', '{classe}', '{montant}', '{retard}'];

export function reminderChannelLabel(channel: ReminderChannel) {
    return REMINDER_CHANNELS.find((c) => c.value === channel)?.label ?? channel;
}

export function useReminders() {
    const api = useApi();

    /** Ce que chaque cible représente, à consulter avant d'envoyer. */
    function targets() {
        return api<ReminderTargetCount[]>('/reminders/targets');
    }

    function campaigns() {
        return api<ReminderCampaign[]>('/reminders/campaigns');
    }

    function send(body: {
        name: string; target: ReminderTarget; channels: ReminderChannel[]; messageTemplate: string;
    }) {
        return api<ReminderCampaign>('/reminders/campaigns', { method: 'POST', body });
    }

    return { targets, campaigns, send };
}
