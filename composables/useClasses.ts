export type SchoolClass = {
    id: string;
    name: string;
    room?: string;
    capacity: number;
    mainTeacherName?: string;
    levelCode?: string;
    levelLabel?: string;
    studentCount: number;
    outstandingAmount: number;
    collectedAmount: number;
};

export type SchoolClassForm = {
    name: string;
    room?: string;
    capacity: number | string;
    mainTeacherName?: string;
    levelOfStudyCode?: string;
};

/** Part de la capacité occupée. Une classe sans capacité déclarée ne se compare à rien. */
export function fillingRate(schoolClass: SchoolClass) {
    if (!schoolClass.capacity) return 0;
    return (schoolClass.studentCount / schoolClass.capacity) * 100;
}

export function useClasses() {
    const api = useApi();

    function list() {
        return api<SchoolClass[]>('/classes');
    }

    function create(body: SchoolClassForm) {
        return api<SchoolClass>('/classes', { method: 'POST', body });
    }

    function update(id: string, body: SchoolClassForm) {
        return api<SchoolClass>(`/classes/${id}`, { method: 'PUT', body });
    }

    function remove(id: string) {
        return api(`/classes/${id}`, { method: 'DELETE' });
    }

    /** Affecte des élèves : ceux qui étaient ailleurs changent de classe, sans étape de retrait. */
    function assign(id: string, studentIds: string[]) {
        return api(`/classes/${id}/students`, { method: 'POST', body: { studentIds } });
    }

    function unassign(id: string, studentId: string) {
        return api(`/classes/${id}/students/${studentId}`, { method: 'DELETE' });
    }

    return { list, create, update, remove, assign, unassign };
}
