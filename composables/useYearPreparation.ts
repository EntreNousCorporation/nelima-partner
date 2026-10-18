/** La rentrée d'une année : classes à ouvrir, élèves à réinscrire. */
export type YearPreparation = {
    targetYearId: string;
    targetLabel: string;
    previousYearId?: string | null;
    previousLabel?: string | null;
    classes: {
        classId: string;
        name: string;
        levelCode?: string | null;
        levelLabel?: string | null;
        openedInPrevious: boolean;
        openedInTarget: boolean;
        previousTeacherName?: string | null;
        targetTeacherName?: string | null;
        enrolledInTarget: number;
    }[];
    groups: {
        sourceClassId?: string | null;
        sourceClassName: string;
        levelLabel?: string | null;
        suggestedTargetClassId?: string | null;
        students: { studentId: string; name: string; registrationNumber: string }[];
    }[];
};

export function useYearPreparation() {
    const api = useApi();

    function preparation(yearId: string) {
        return api<YearPreparation>(`/academic-years/${yearId}/preparation`);
    }

    function openClasses(yearId: string, classIds: string[]) {
        return api(`/academic-years/${yearId}/preparation/classes`, { method: 'POST', body: classIds });
    }

    function closeClass(yearId: string, classId: string) {
        return api(`/academic-years/${yearId}/preparation/classes/${classId}`, { method: 'DELETE' });
    }

    function reenroll(yearId: string, items: { studentId: string; schoolClassId?: string | null }[]) {
        return api<{ reenrolled: number }>(`/academic-years/${yearId}/reenrollments`, { method: 'POST', body: { items } });
    }

    return { preparation, openClasses, closeClass, reenroll };
}
