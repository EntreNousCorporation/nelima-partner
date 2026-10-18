import type { AcademicYear } from '~/composables/useSettings';

/**
 * L'année que l'utilisateur consulte, partagée par tous les écrans.
 *
 * Chargée une fois par le gabarit ; Paramètres la recharge après un changement. Le bandeau qui
 * rappelle qu'on ne regarde pas l'année en cours s'en sert, comme tout écran qui doit la nommer.
 */
export function useConsultedYear() {
    const years = useState<AcademicYear[]>('academic-years', () => []);
    const loaded = useState<boolean>('academic-years-loaded', () => false);

    const consulted = computed(() => years.value.find((year) => year.consulted)
        ?? years.value.find((year) => year.active) ?? null);
    const current = computed(() => years.value.find((year) => year.active) ?? null);
    /** Vrai quand l'utilisateur regarde une autre année que l'année en cours. */
    const elsewhere = computed(() => !!consulted.value && !!current.value && consulted.value.id !== current.value.id);

    async function refresh() {
        try {
            years.value = await useSettings().years();
        } catch {
            years.value = [];
        } finally {
            loaded.value = true;
        }
    }

    return { years, consulted, current, elsewhere, loaded, refresh };
}
