import type { SchoolClass } from '~/composables/useClasses';

export type CalendarEntryKind = 'SCHOOL_LIFE' | 'EXAM' | 'FEE_DUE';
export type SchoolEventKind = 'SCHOOL_LIFE' | 'EXAM';

export type CalendarEntry = {
    /** Identifiant de l'événement ; pour une échéance, `feeId@date`. */
    id: string;
    kind: CalendarEntryKind;
    title: string;
    date: string;
    allDay: boolean;
    startTime?: string;
    endTime?: string;
    details?: string;
    scope?: string;
    classes: Pick<SchoolClass, 'id' | 'name' | 'room'>[];
    wholeSchool: boolean;
    /** Renseigné pour un événement saisi, nul pour une échéance. */
    visibleToFamilies?: boolean;
    lastNotifiedAt?: string;
    /** Absents de la réponse quand l'appelant n'a pas le droit de lire les montants. */
    amountExpected?: number;
    amountCollected?: number;
    studentsConcerned?: number;
    studentsSettled?: number;
};

export type SchoolEventForm = {
    title: string;
    kind: SchoolEventKind;
    date: string;
    allDay: boolean;
    startTime?: string;
    endTime?: string;
    details?: string;
    wholeSchool: boolean;
    classIds: string[];
    visibleToFamilies: boolean;
};

export const ENTRY_KINDS: { value: CalendarEntryKind; label: string; tone: string }[] = [
    { value: 'SCHOOL_LIFE', label: 'Vie scolaire', tone: 'var(--brand-600)' },
    { value: 'FEE_DUE', label: 'Échéance', tone: 'var(--warning-solid)' },
    { value: 'EXAM', label: 'Examen', tone: 'var(--danger-solid)' },
];

export const MONTHS = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** Semaine commençant le lundi, comme le calendrier scolaire ivoirien. */
export const WEEK_DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function kindLabel(kind?: CalendarEntryKind | null) {
    return ENTRY_KINDS.find((k) => k.value === kind)?.label ?? '—';
}

export function kindTone(kind?: CalendarEntryKind | null) {
    return ENTRY_KINDS.find((k) => k.value === kind)?.tone ?? 'var(--text-muted)';
}

export function isoDate(date: Date) {
    // Composé à la main plutôt que via toISOString : celui-ci convertit en UTC et rend la veille
    // pour toute heure locale négative — ce qui décalerait tout le calendrier d'un jour.
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

export type MonthCell = { date: string; day: number; outside: boolean; today: boolean };

/**
 * Cellules de la grille d'un mois, semaines complètes comprises.
 *
 * Les jours des mois voisins sont rendus grisés plutôt qu'omis : une grille trouée se lit mal, et
 * un événement du 1er tombant un dimanche doit rester visible sur la dernière ligne du mois
 * précédent.
 */
export function monthCells(year: number, month: number): MonthCell[] {
    const first = new Date(year, month, 1);
    // getDay() rend 0 pour dimanche ; on décale pour une semaine commençant le lundi.
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
    const todayIso = isoDate(new Date());

    return Array.from({ length: cellCount }, (_, index) => {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
        const iso = isoDate(date);
        return {
            date: iso,
            day: date.getDate(),
            outside: date.getMonth() !== month,
            today: iso === todayIso,
        };
    });
}

/** Part réglée d'une échéance. Nulle quand rien n'est attendu — distinct de zéro pour cent. */
export function collectionRate(entry: CalendarEntry) {
    if (!entry.amountExpected || Number(entry.amountExpected) === 0) return null;
    return (Number(entry.amountCollected ?? 0) / Number(entry.amountExpected)) * 100;
}

export function useCalendar() {
    const api = useApi();

    function list(from: string, to: string) {
        return api<CalendarEntry[]>('/calendar', { query: { from, to } });
    }

    function create(body: SchoolEventForm) {
        return api<CalendarEntry>('/calendar/events', { method: 'POST', body });
    }

    function update(id: string, body: SchoolEventForm) {
        return api<CalendarEntry>(`/calendar/events/${id}`, { method: 'PUT', body });
    }

    function remove(id: string) {
        return api(`/calendar/events/${id}`, { method: 'DELETE' });
    }

    /** Envoie la notification aux familles concernées. Rend le nombre de tuteurs joints. */
    function notifyFamilies(id: string) {
        return api<{ notified: number }>(`/calendar/events/${id}/notify`, { method: 'POST' });
    }

    /** URL du fichier iCal ; le téléchargement passe par le navigateur, pas par fetch. */
    function exportUrl(from: string, to: string) {
        return `/api/v1/calendar/export?from=${from}&to=${to}`;
    }

    return { list, create, update, remove, notifyFamilies, exportUrl };
}
