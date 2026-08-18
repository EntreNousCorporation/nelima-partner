export type EducationCycle = 'KINDERGARTEN' | 'PRIMARY' | 'MIDDLE_SCHOOL' | 'HIGH_SCHOOL';

export type LevelOfStudy = {
    id: string;
    code: string;
    position?: number;
    name?: { fr?: string; en?: string };
    cycle?: EducationCycle;
};

/**
 * Cycles, dans l'ordre de la scolarité.
 *
 * C'est la maille des chiffres d'ensemble : une école compte ses effectifs par cycle, pas niveau
 * par niveau. Le libellé vient d'ici, le rattachement d'un niveau à son cycle vient du serveur.
 */
export const CYCLES: { value: EducationCycle; label: string }[] = [
    { value: 'KINDERGARTEN', label: 'Maternelle' },
    { value: 'PRIMARY', label: 'Primaire' },
    { value: 'MIDDLE_SCHOOL', label: 'Collège' },
    { value: 'HIGH_SCHOOL', label: 'Lycée' },
];

export function cycleLabel(cycle?: EducationCycle | null) {
    return CYCLES.find((c) => c.value === cycle)?.label ?? 'Autres niveaux';
}

export type GuardianContact = {
    type: 'EMAIL' | 'PHONE_NUMBER' | string;
    value: string;
    isPrimary?: boolean;
    whatsApp?: boolean;
};

/** Parent / tuteur rattaché à un élève. Servi par `/students/search` dans `parentUsers`. */
export type Guardian = {
    id: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    contacts?: GuardianContact[];
};

export type Gender = 'MALE' | 'FEMALE';

/** Ce que l'école lit, plutôt que l'énuméré du serveur. */
export function genderLabel(gender?: Gender | null) {
    if (gender === 'FEMALE') return 'Fille';
    if (gender === 'MALE') return 'Garçon';
    return 'Non renseigné';
}

export type Student = {
    id: string;
    firstName: string;
    lastName: string;
    registrationNumber: string;
    birthDay: string;
    placeOfBirth?: string;
    /** Nul tant que l'école ne l'a pas renseigné : la donnée est facultative. */
    gender?: Gender;
    levelOfStudy?: LevelOfStudy;
    schoolClass?: { id: string; name: string; room?: string };
    /** Servi sur la liste : ce que la famille doit encore, et la part déjà échue. */
    outstandingAmount?: number;
    overdueAmount?: number;
    /** Parents / tuteurs rattachés à l'élève (source : `parentUsers` de `/students/search`). */
    parentUsers?: Guardian[];
};

export type Page<T> = {
    content: T[];
    totalElements: number;
    totalPages: number;
    number: number;
    size: number;
};

/**
 * Libellé lisible d'un niveau. Le backend renvoie un code technique (CP1, 6E…) et une
 * traduction ; on préfère la traduction quand elle existe, sans jamais afficher un champ vide.
 */
export function levelLabel(level?: LevelOfStudy | null): string {
    if (!level) return '—';
    return level.name?.fr?.trim() || level.code || '—';
}

export function useStudents() {
    const api = useApi();

    /**
     * L'établissement n'est jamais passé en paramètre : le serveur l'impose à partir du compte
     * connecté. L'envoyer depuis le client ne servirait qu'à laisser croire qu'il est modifiable.
     */
    function search(params: {
        page: number; size: number; levelOfStudies?: string[]; keyword?: string;
        schoolClassId?: string; unassignedOnly?: boolean;
    }) {
        const query: Record<string, any> = { page: params.page, size: params.size };
        if (params.levelOfStudies?.length) {
            query.levelOfStudies = params.levelOfStudies;
        }
        // La recherche est faite par le serveur et non sur la page affichée : filtrer localement
        // aurait ignoré les élèves des pages suivantes, en donnant l'air d'avoir cherché partout.
        if (params.keyword?.trim()) {
            query.keyword = params.keyword.trim();
        }
        if (params.schoolClassId) query.schoolClassId = params.schoolClassId;
        if (params.unassignedOnly) query.unassignedOnly = true;
        return api<Page<Student>>('/students/search', { query });
    }

    /** Catalogue complet des niveaux du système éducatif ivoirien. */
    function catalogue() {
        return api<Page<LevelOfStudy>>('/level-of-studies', { query: { size: 100 } });
    }

    /**
     * Niveaux réellement déclarés par l'établissement. C'est cette liste, et non le catalogue,
     * qu'il faut proposer à l'inscription : le backend refuse un niveau non déclaré, et laisser
     * choisir dans le catalogue complet mènerait à un échec incompréhensible côté secrétariat.
     */
    async function establishmentLevels(establishmentId?: string) {
        if (!establishmentId) return [] as LevelOfStudy[];
        const establishment = await api<{ levelOfStudies?: LevelOfStudy[] }>(
            `/establishments/${establishmentId}`);
        return (establishment.levelOfStudies ?? []).slice()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }

    function create(payload: {
        firstName: string;
        lastName: string;
        registrationNumber: string;
        birthDay: string;
        placeOfBirth: string;
        levelOfStudyCode: string;
        gender?: Gender;
    }) {
        return api<Student>('/students', { method: 'POST', body: payload });
    }

    /**
     * Modifie la fiche d'un élève. Seuls les champs fournis sont écrits.
     *
     * <p>La route n'était exposée nulle part côté serveur : une fiche ne se corrigeait pas une
     * fois créée. C'est par elle qu'une école complète les élèves inscrits avant que le sexe ne
     * soit demandé.
     */
    function update(id: string, payload: Partial<{
        firstName: string;
        lastName: string;
        registrationNumber: string;
        birthDay: string;
        placeOfBirth: string;
        levelOfStudyCode: string;
        gender: Gender;
    }>) {
        return api<Student>(`/students/${id}`, { method: 'PUT', body: payload });
    }

    return { search, catalogue, establishmentLevels, create, update };
}
