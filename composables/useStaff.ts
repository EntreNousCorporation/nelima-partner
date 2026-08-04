import type { SchoolClass } from '~/composables/useClasses';

export type StaffRole = 'TEACHER' | 'ADMINISTRATION' | 'DIRECTION' | 'SUPPORT';
export type ContractType = 'CDI' | 'CDD' | 'VACATAIRE' | 'STAGE';
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE';

export type StaffMember = {
    id: string;
    firstName: string;
    lastName: string;
    role: StaffRole;
    jobTitle?: string;
    phone?: string;
    email?: string;
    contractType?: ContractType;
    /** Absent de la réponse quand l'appelant n'a pas le droit de lire les rémunérations. */
    monthlySalary?: number;
    weeklyHours?: number;
    hiredAt?: string;
    active: boolean;
    classes: Pick<SchoolClass, 'id' | 'name' | 'room'>[];
    userId?: string;
    username?: string;
    roleCode?: string;
    accessEnabled: boolean;
    todayStatus?: AttendanceStatus;
};

export type StaffForm = {
    firstName: string;
    lastName: string;
    role: StaffRole;
    jobTitle?: string;
    phone?: string;
    email?: string;
    contractType?: ContractType;
    monthlySalary?: number | string;
    weeklyHours?: number | string;
    hiredAt?: string;
};

/**
 * Familles de fonction.
 *
 * <p>C'est la maille à laquelle une direction compte son personnel — « combien d'enseignants » —
 * là où l'intitulé du poste reste libre parce qu'aucune liste fermée ne couvrirait les usages d'un
 * établissement à l'autre.
 */
export const STAFF_ROLES: { value: StaffRole; label: string; plural: string }[] = [
    { value: 'TEACHER', label: 'Enseignant', plural: 'Enseignants' },
    { value: 'ADMINISTRATION', label: 'Administration', plural: 'Administration' },
    { value: 'DIRECTION', label: 'Direction', plural: 'Direction' },
    { value: 'SUPPORT', label: 'Personnel de service', plural: 'Personnel de service' },
];

export const CONTRACT_TYPES: { value: ContractType; label: string }[] = [
    { value: 'CDI', label: 'CDI' },
    { value: 'CDD', label: 'CDD' },
    { value: 'VACATAIRE', label: 'Vacataire' },
    { value: 'STAGE', label: 'Stage' },
];

export const ATTENDANCE_STATUSES: { value: AttendanceStatus; label: string; tone: string }[] = [
    { value: 'PRESENT', label: 'Présent', tone: 'ok' },
    { value: 'LATE', label: 'En retard', tone: 'warning' },
    { value: 'ABSENT', label: 'Absent', tone: 'danger' },
    { value: 'LEAVE', label: 'Congé', tone: 'muted' },
];

export function staffRoleLabel(role?: StaffRole | null) {
    return STAFF_ROLES.find((r) => r.value === role)?.label ?? 'Non renseignée';
}

export function contractLabel(contract?: ContractType | null) {
    return CONTRACT_TYPES.find((c) => c.value === contract)?.label ?? '—';
}

export function attendanceLabel(status?: AttendanceStatus | null) {
    return ATTENDANCE_STATUSES.find((s) => s.value === status)?.label ?? 'Non pointé';
}

export function fullName(member: StaffMember) {
    return `${member.lastName} ${member.firstName}`;
}

/** Ancienneté en années révolues. Une date d'embauche absente ne se compare à rien. */
export function seniorityYears(member: StaffMember) {
    if (!member.hiredAt) return null;
    const hired = new Date(member.hiredAt);
    const now = new Date();
    let years = now.getFullYear() - hired.getFullYear();
    const monthDelta = now.getMonth() - hired.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < hired.getDate())) years -= 1;
    return years;
}

export type AttendanceLine = {
    staffId: string;
    firstName: string;
    lastName: string;
    role: StaffRole;
    jobTitle?: string;
    day: string;
    /** Nul tant que la personne n'a pas été pointée : c'est elle qu'on cherche le matin. */
    status?: AttendanceStatus;
    note?: string;
};

export type AttendanceSummary = {
    from: string;
    to: string;
    present: number;
    late: number;
    absent: number;
    leave: number;
    /** Nul quand rien n'a été pointé du mois — distinct de zéro, qui dirait « personne n'est venu ». */
    presenceRate?: number;
};

export function useStaff() {
    const api = useApi();

    function list(includeInactive = false) {
        return api<StaffMember[]>('/staff', { query: { includeInactive } });
    }

    function findById(id: string) {
        return api<StaffMember>(`/staff/${id}`);
    }

    function create(body: StaffForm) {
        return api<StaffMember>('/staff', { method: 'POST', body });
    }

    function update(id: string, body: StaffForm) {
        return api<StaffMember>(`/staff/${id}`, { method: 'PUT', body });
    }

    /** Retire le membre : la fiche est désactivée dès qu'un historique existe, supprimée sinon. */
    function remove(id: string) {
        return api(`/staff/${id}`, { method: 'DELETE' });
    }

    function assignClasses(id: string, classIds: string[]) {
        return api<StaffMember>(`/staff/${id}/classes`, { method: 'POST', body: { classIds } });
    }

    function unassignClass(id: string, classId: string) {
        return api<StaffMember>(`/staff/${id}/classes/${classId}`, { method: 'DELETE' });
    }

    /** Feuille d'une journée. Sans date, la journée courante. */
    function attendanceSheet(day?: string) {
        return api<AttendanceLine[]>('/staff/attendance', { query: day ? { day } : {} });
    }

    /** Pointe une journée. Repointer la même corrige la ligne au lieu d'en créer une seconde. */
    function recordAttendance(id: string, body: { day: string; status: AttendanceStatus; note?: string }) {
        return api<AttendanceLine>(`/staff/${id}/attendance`, { method: 'PUT', body });
    }

    /** Bilan d'un mois, au format `2026-08`. */
    function attendanceSummary(month?: string) {
        return api<AttendanceSummary>('/staff/attendance/summary', {
            query: month ? { month } : {},
        });
    }

    return {
        list, findById, create, update, remove, assignClasses, unassignClass,
        attendanceSheet, recordAttendance, attendanceSummary,
    };
}
