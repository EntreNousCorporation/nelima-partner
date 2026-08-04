import type { SchoolClass } from '~/composables/useClasses';

export type ActivityKind = 'SPORT' | 'ARTS' | 'LANGUAGE' | 'TUTORING';
export type ActivityStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED';
export type EnrollmentStatus = 'ENROLLED' | 'WAITLISTED' | 'CANCELLED';
export type EnrollmentSource = 'SCHOOL' | 'PARENT';

export type Activity = {
    id: string;
    name: string;
    kind: ActivityKind;
    place?: string;
    /** Nom anglais du jour, tel que `java.time.DayOfWeek` le rend : MONDAY, TUESDAY… */
    dayOfWeek?: string;
    startTime?: string;
    endTime?: string;
    periodLabel?: string;
    capacity: number;
    status: ActivityStatus;
    coachId?: string;
    coachName?: string;
    openToAll: boolean;
    eligibleClasses: Pick<SchoolClass, 'id' | 'name' | 'room'>[];
    /** Nul pour une activité gratuite. */
    price?: number;
    feeId?: string;
    enrolledCount: number;
    waitlistedCount: number;
    remainingSeats: number;
    expectedRevenue?: number;
};

export type ActivityEnrollment = {
    id: string;
    status: EnrollmentStatus;
    source: EnrollmentSource;
    requestedAt: string;
    activityId: string;
    activityName: string;
    studentId: string;
    studentFirstName: string;
    studentLastName: string;
    studentRegistrationNumber?: string;
    className?: string;
    /** Nul en liste d'attente ou pour une activité gratuite. */
    amountDue?: number;
    /** Vrai dès qu'une tranche est réglée : l'inscription ne peut plus être annulée. */
    partiallyPaid: boolean;
};

export type ActivityForm = {
    name: string;
    kind: ActivityKind;
    place?: string;
    dayOfWeek?: string;
    startTime?: string;
    endTime?: string;
    periodLabel?: string;
    capacity: number | string;
    status?: ActivityStatus;
    coachId?: string;
    price?: number | string;
};

export const ACTIVITY_KINDS: { value: ActivityKind; label: string }[] = [
    { value: 'SPORT', label: 'Sport' },
    { value: 'ARTS', label: 'Art & culture' },
    { value: 'LANGUAGE', label: 'Langue' },
    { value: 'TUTORING', label: 'Soutien scolaire' },
];

export const ACTIVITY_STATUSES: { value: ActivityStatus; label: string }[] = [
    { value: 'DRAFT', label: 'Brouillon' },
    { value: 'ACTIVE', label: 'Ouverte' },
    { value: 'SUSPENDED', label: 'Suspendue' },
];

/** Jours ouvrés de l'école. Le dimanche n'accueille pas d'activité extra-scolaire ici. */
export const WEEK_DAYS: { value: string; label: string }[] = [
    { value: 'MONDAY', label: 'Lundi' },
    { value: 'TUESDAY', label: 'Mardi' },
    { value: 'WEDNESDAY', label: 'Mercredi' },
    { value: 'THURSDAY', label: 'Jeudi' },
    { value: 'FRIDAY', label: 'Vendredi' },
    { value: 'SATURDAY', label: 'Samedi' },
];

export function kindLabel(kind?: ActivityKind | null) {
    return ACTIVITY_KINDS.find((k) => k.value === kind)?.label ?? '—';
}

export function statusLabel(status?: ActivityStatus | null) {
    return ACTIVITY_STATUSES.find((s) => s.value === status)?.label ?? '—';
}

export function dayLabel(day?: string | null) {
    return WEEK_DAYS.find((d) => d.value === day)?.label ?? '—';
}

/** « Lundi · 16:00 – 17:30 », ou ce qu'on en sait. */
export function slotLabel(activity: Activity) {
    const hours = [activity.startTime, activity.endTime]
        .filter(Boolean)
        .map((time) => (time as string).slice(0, 5))
        .join(' – ');
    return [activity.dayOfWeek ? dayLabel(activity.dayOfWeek) : null, hours || null]
        .filter(Boolean).join(' · ') || 'Créneau à fixer';
}

/** Part des places occupées. Une activité sans capacité ne se compare à rien. */
export function fillingRate(activity: Activity) {
    if (!activity.capacity) return 0;
    return (activity.enrolledCount / activity.capacity) * 100;
}

export function useActivities() {
    const api = useApi();

    function list() {
        return api<Activity[]>('/activities');
    }

    function findById(id: string) {
        return api<Activity>(`/activities/${id}`);
    }

    function create(body: ActivityForm) {
        return api<Activity>('/activities', { method: 'POST', body });
    }

    function update(id: string, body: ActivityForm) {
        return api<Activity>(`/activities/${id}`, { method: 'PUT', body });
    }

    /** Suspend l'activité, ou la supprime si personne ne s'y est jamais inscrit. */
    function remove(id: string) {
        return api(`/activities/${id}`, { method: 'DELETE' });
    }

    /** Remplace l'affectation entière : l'écran présente des cases à cocher. */
    function assignClasses(id: string, body: { openToAll: boolean; classIds: string[] }) {
        return api<Activity>(`/activities/${id}/classes`, { method: 'PUT', body });
    }

    function enrollments() {
        return api<ActivityEnrollment[]>('/activities/enrollments');
    }

    function enroll(id: string, studentIds: string[]) {
        return api<ActivityEnrollment[]>(`/activities/${id}/enrollments`, {
            method: 'POST', body: { studentIds },
        });
    }

    function cancel(id: string, studentId: string) {
        return api(`/activities/${id}/enrollments/${studentId}`, { method: 'DELETE' });
    }

    return {
        list, findById, create, update, remove, assignClasses,
        enrollments, enroll, cancel,
    };
}
