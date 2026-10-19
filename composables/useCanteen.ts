import type { PaymentStatus } from '~/composables/useStudents';
import type { BoTone } from '~/composables/useBoTones';

export type DietKind =
    | 'NO_PORK' | 'VEGETARIAN' | 'NO_GLUTEN'
    | 'ALLERGY_PEANUT' | 'ALLERGY_LACTOSE' | 'ALLERGY_EGG' | 'ALLERGY_FISH' | 'ALLERGY_OTHER';

/** Régimes d'abord, allergies ensuite : la cuisine lit une allergie comme un danger. */
export const DIETS: { value: DietKind; label: string; allergy: boolean }[] = [
    { value: 'NO_PORK', label: 'Sans porc', allergy: false },
    { value: 'VEGETARIAN', label: 'Végétarien', allergy: false },
    { value: 'NO_GLUTEN', label: 'Sans gluten', allergy: false },
    { value: 'ALLERGY_PEANUT', label: 'Allergie arachide', allergy: true },
    { value: 'ALLERGY_LACTOSE', label: 'Allergie lactose', allergy: true },
    { value: 'ALLERGY_EGG', label: 'Allergie œuf', allergy: true },
    { value: 'ALLERGY_FISH', label: 'Allergie poisson', allergy: true },
    { value: 'ALLERGY_OTHER', label: 'Autre allergie', allergy: true },
];

export function dietLabel(kind: DietKind, label?: string | null) {
    const base = DIETS.find((d) => d.value === kind)?.label ?? kind;
    return kind === 'ALLERGY_OTHER' && label ? `Allergie ${label}` : base;
}

export function isAllergy(kind: DietKind) {
    return DIETS.find((d) => d.value === kind)?.allergy ?? false;
}

export const WEEKDAYS = [
    { value: 'MONDAY', label: 'Lundi', short: 'Lun' },
    { value: 'TUESDAY', label: 'Mardi', short: 'Mar' },
    { value: 'WEDNESDAY', label: 'Mercredi', short: 'Mer' },
    { value: 'THURSDAY', label: 'Jeudi', short: 'Jeu' },
    { value: 'FRIDAY', label: 'Vendredi', short: 'Ven' },
    { value: 'SATURDAY', label: 'Samedi', short: 'Sam' },
];

export type CanteenFormula = {
    id: string; name: string; days: string[]; monthlyPrice: number; active: boolean; subscribers: number;
};
export type Diet = { kind: DietKind; label?: string | null };
export type CanteenOverview = {
    day: string; subscribers: number; shareOfEnrollment: number; expectedToday: number; servedToday: number;
    absentToday: number; studentsWithDiet: number; allergies: number; unpaidAmount: number; unpaidStudents: number;
    nextDueDate?: string | null; diets: { kind: DietKind; count: number }[];
};
export type CanteenSubscriber = {
    subscriptionId: string; studentId: string; studentName: string; registrationNumber: string; photoId?: string | null;
    className?: string | null; formulaId: string; formulaName: string; startDate: string; endDate?: string | null;
    diets: Diet[]; paymentStatus: PaymentStatus; today?: 'SERVED' | 'ABSENT' | null; expectedToday: boolean;
};
export type MenuDay = {
    day: string; starter?: string | null; mainCourse?: string | null; dessert?: string | null;
    vegetarianAlternative?: string | null; allergens: string[]; published: boolean; closed: boolean;
};
export type KitchenLine = { kind: DietKind; students: { name: string; className?: string | null; label?: string | null }[] };

/** Formule ponctuelle : sans jour fixe, servie quand on la pointe. */
export function formulaDays(formula: { days: string[] }) {
    if (!formula.days.length) return 'Ponctuel';
    return formula.days.map((d) => WEEKDAYS.find((w) => w.value === d)?.short ?? d).join(' · ');
}

export function useCanteen() {
    const api = useApi();
    return {
        overview: (day?: string) => api<CanteenOverview>('/canteen/overview', { query: day ? { day } : {} }),
        formulas: () => api<CanteenFormula[]>('/canteen/formulas'),
        createFormula: (body: Omit<CanteenFormula, 'id' | 'subscribers'>) => api<CanteenFormula>('/canteen/formulas', { method: 'POST', body }),
        updateFormula: (id: string, body: Omit<CanteenFormula, 'id' | 'subscribers'>) => api<CanteenFormula>(`/canteen/formulas/${id}`, { method: 'PUT', body }),
        subscribers: (day?: string) => api<CanteenSubscriber[]>('/canteen/subscriptions', { query: day ? { day } : {} }),
        subscribe: (body: { studentId: string; formulaId: string; startDate?: string; notifyFamily?: boolean }) => api<CanteenSubscriber>('/canteen/subscriptions', { method: 'POST', body }),
        end: (id: string, endDate?: string) => api(`/canteen/subscriptions/${id}/end`, { method: 'POST', body: { endDate } }),
        mark: (studentId: string, day: string, status: 'SERVED' | 'ABSENT' | null) => api('/canteen/attendance', { method: 'PUT', body: { studentId, day, status } }),
        kitchenSheet: (day?: string) => api<KitchenLine[]>('/canteen/kitchen-sheet', { query: day ? { day } : {} }),
        menu: (day?: string) => api<MenuDay[]>('/canteen/menu', { query: day ? { day } : {} }),
        saveMenu: (days: Omit<MenuDay, 'published'>[]) => api<MenuDay[]>('/canteen/menu', { method: 'PUT', body: { days } }),
        publishMenu: (day: string, published: boolean) => api<MenuDay[]>('/canteen/menu/publish', { method: 'POST', query: { day, published } }),
        diets: (studentId: string) => api<Diet[]>(`/canteen/students/${studentId}/diets`),
        saveDiets: (studentId: string, diets: Diet[]) => api<Diet[]>(`/canteen/students/${studentId}/diets`, { method: 'PUT', body: diets }),
    };
}

/** Date locale au format ISO (AAAA-MM-JJ), sans décalage de fuseau. */
export function isoDay(date: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Allergènes du menu, et le régime des élèves qu'ils mettent en danger. */
export const MENU_ALLERGENS: { label: string; diet: DietKind; of: string }[] = [
    { label: 'Arachide', diet: 'ALLERGY_PEANUT', of: 'à l’arachide' },
    { label: 'Lactose', diet: 'ALLERGY_LACTOSE', of: 'au lactose' },
    { label: 'Gluten', diet: 'NO_GLUTEN', of: 'au gluten' },
    { label: 'Poisson', diet: 'ALLERGY_FISH', of: 'au poisson' },
    { label: 'Œuf', diet: 'ALLERGY_EGG', of: 'à l’œuf' },
];

/** Teinte de pastille d'un régime, celle de la maquette : arachide en rouge, autres allergies en ambre. */
export function dietTone(kind: DietKind): BoTone {
    if (kind === 'NO_PORK') return 'info';
    if (kind === 'VEGETARIAN') return 'ok';
    if (kind === 'ALLERGY_PEANUT') return 'late';
    return 'warn';
}

/** Jours d'une formule en toutes lettres, comme sur les cartes de la maquette. */
export function formulaDaysLong(formula: { days: string[] }) {
    const school = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
    if (!formula.days.length) return 'Repas à l’unité';
    if (school.every((d) => formula.days.includes(d)) && formula.days.length === 5) return 'Lundi au vendredi';
    const missing = school.filter((d) => !formula.days.includes(d));
    if (missing.length === 1 && formula.days.length === 4) {
        return `Hors ${WEEKDAYS.find((w) => w.value === missing[0])?.label.toLowerCase()}`;
    }
    return formulaDays(formula);
}
