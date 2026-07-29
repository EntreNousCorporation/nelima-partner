export type LevelOfStudy = {
    id: string;
    code: string;
    position?: number;
    name?: { fr?: string; en?: string };
};

export type Student = {
    id: string;
    firstName: string;
    lastName: string;
    registrationNumber: string;
    birthDay: string;
    placeOfBirth?: string;
    levelOfStudy?: LevelOfStudy;
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
    function search(params: { page: number; size: number; levelOfStudies?: string[] }) {
        const query: Record<string, any> = { page: params.page, size: params.size };
        if (params.levelOfStudies?.length) {
            query.levelOfStudies = params.levelOfStudies;
        }
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
    }) {
        return api<Student>('/students', { method: 'POST', body: payload });
    }

    return { search, catalogue, establishmentLevels, create };
}
