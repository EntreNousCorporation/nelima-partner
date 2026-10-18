export type SchoolClass = {
    id: string;
    name: string;
    room?: string;
    capacity: number;
    /** Membre du personnel désigné titulaire ; nul tant qu'aucun ne l'est. */
    mainTeacherId?: string;
    /** Servi depuis la référence quand elle existe, depuis le nom hérité sinon. */
    mainTeacherName?: string;
    /**
     * Les enseignants rattachés à la classe depuis l'écran Personnel.
     *
     * <p>Distinct du titulaire : une classe n'en a qu'un, et peut compter plusieurs intervenants.
     * Le titulaire y figure aussi — le serveur le rattache quand on le désigne.
     */
    teacherNames?: string[];
    levelCode?: string;
    levelLabel?: string;
    cycle?: import('~/composables/useStudents').EducationCycle;
    studentCount: number;
    outstandingAmount: number;
    collectedAmount: number;
};

export type SchoolClassForm = {
    name: string;
    room?: string;
    capacity: number | string;
    /** Nul retire le titulaire : une classe entre deux enseignants n'en a pas. */
    mainTeacherId?: string;
    /**
     * Nom hérité, pour les classes créées avant le répertoire du personnel.
     *
     * Ignoré par le serveur dès qu'un titulaire est désigné.
     */
    mainTeacherName?: string;
    levelOfStudyCode?: string;
};

/** Créneau de la semaine type d'une classe. */
export type TimetableSlot = {
    id: string;
    /** Nom anglais du jour, tel que `java.time.DayOfWeek` le rend : MONDAY, TUESDAY… */
    dayOfWeek: string;
    /** « HH:mm:ss » tel que le serveur le rend. */
    startTime: string;
    endTime: string;
    subject: string;
    teacherId?: string;
    teacherName?: string;
    room?: string;
};

export type TimetableSlotForm = {
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    subject: string;
    teacherId?: string;
    room?: string;
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

    function timetable(id: string) {
        return api<TimetableSlot[]>(`/classes/${id}/timetable`);
    }

    function addSlot(id: string, body: TimetableSlotForm) {
        return api<TimetableSlot>(`/classes/${id}/timetable`, { method: 'POST', body });
    }

    function updateSlot(id: string, slotId: string, body: TimetableSlotForm) {
        return api<TimetableSlot>(`/classes/${id}/timetable/${slotId}`, { method: 'PUT', body });
    }

    function removeSlot(id: string, slotId: string) {
        return api(`/classes/${id}/timetable/${slotId}`, { method: 'DELETE' });
    }

    return {
        list, create, update, remove, assign, unassign,
        timetable, addSlot, updateSlot, removeSlot,
    };
}
