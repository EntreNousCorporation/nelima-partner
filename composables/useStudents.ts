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
    /** Photo d'identité courante ; nulle tant qu'aucune n'est versée au dossier. */
    photoId?: string | null;
    /** Mêmes règles que le filtre et les statistiques, calculées par le serveur. */
    paymentStatus?: PaymentStatus;
    /** Extrait de naissance et photo au dossier. */
    dossierComplete?: boolean;
};

export type PaymentStatus = 'UP_TO_DATE' | 'DEPOSIT' | 'OVERDUE';

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string; tone: 'ok' | 'warn' | 'late' }[] = [
    { value: 'UP_TO_DATE', label: 'À jour', tone: 'ok' },
    { value: 'DEPOSIT', label: 'Acompte', tone: 'warn' },
    { value: 'OVERDUE', label: 'En retard', tone: 'late' },
];

export type StudentStats = {
    total: number;
    newThisMonth: number;
    incompleteDossier: number;
    withoutClass: number;
    overdueCount: number;
    overdueAmount: number;
    classCount: number;
    byCycle: { cycle: EducationCycle | null; count: number }[];
    female: number;
    male: number;
    genderUnknown: number;
    statusIncomplete: number;
    statusOverdue: number;
    statusDeposit: number;
    statusUpToDate: number;
};

/** Filtres de la liste, partagés par la recherche et l'export : le fichier suit l'écran. */
export type StudentFilters = {
    levelOfStudies?: string[]; keyword?: string; schoolClassId?: string; unassignedOnly?: boolean;
    paymentStatus?: PaymentStatus; incompleteDossier?: boolean; gender?: Gender;
};

function filterQuery(params: StudentFilters) {
    const query: Record<string, any> = {};
    if (params.levelOfStudies?.length) query.levelOfStudies = params.levelOfStudies;
    // La recherche est faite par le serveur et non sur la page affichée : filtrer localement
    // aurait ignoré les élèves des pages suivantes, en donnant l'air d'avoir cherché partout.
    if (params.keyword?.trim()) query.keyword = params.keyword.trim();
    if (params.schoolClassId) query.schoolClassId = params.schoolClassId;
    if (params.unassignedOnly) query.unassignedOnly = true;
    if (params.paymentStatus) query.paymentStatus = params.paymentStatus;
    if (params.incompleteDossier !== undefined) query.incompleteDossier = params.incompleteDossier;
    if (params.gender) query.gender = params.gender;
    return query;
}

/**
 * Adresse de la photo d'un élève, ou rien s'il n'en a pas.
 *
 * L'identifiant de la photo est dans l'adresse : le navigateur peut la garder en cache, et une
 * nouvelle photo change l'adresse au lieu d'attendre l'expiration du cache.
 */
export function studentPhotoUrl(student?: { id: string; photoId?: string | null } | null) {
    return student?.photoId ? `/api/v1/students/${student.id}/photo?v=${student.photoId}` : null;
}

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

export type StudentDocumentKind =
    'BIRTH_CERTIFICATE' | 'PHOTO' | 'VACCINATION_RECORD' | 'MEDICAL_CERTIFICATE'
    | 'PREVIOUS_REPORT_CARD' | 'OTHER';

/** Dans l'ordre où une école les réclame à l'inscription. */
export const DOCUMENT_KINDS: { value: StudentDocumentKind; label: string }[] = [
    { value: 'BIRTH_CERTIFICATE', label: 'Extrait de naissance' },
    { value: 'PHOTO', label: "Photo d'identité" },
    { value: 'VACCINATION_RECORD', label: 'Carnet de vaccination' },
    { value: 'MEDICAL_CERTIFICATE', label: 'Certificat médical' },
    { value: 'PREVIOUS_REPORT_CARD', label: "Bulletin de l'année précédente" },
    { value: 'OTHER', label: 'Autre pièce' },
];

export function documentKindLabel(kind: StudentDocumentKind) {
    return DOCUMENT_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export type StudentDocument = {
    id: string;
    kind: StudentDocumentKind;
    label?: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    createdAt?: string;
    createdBy?: string;
};

/** Plafond du serveur, rappelé ici pour refuser avant l'envoi plutôt qu'après. */
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

export function useStudents() {
    const api = useApi();

    /**
     * L'établissement n'est jamais passé en paramètre : le serveur l'impose à partir du compte
     * connecté. L'envoyer depuis le client ne servirait qu'à laisser croire qu'il est modifiable.
     */
    function search(params: StudentFilters & { page: number; size: number }) {
        const query = { ...filterQuery(params), page: params.page, size: params.size };
        return api<Page<Student>>('/students/search', { query });
    }

    /** Chiffres de tout l'effectif : cartes, graphiques et compteurs des onglets. */
    function stats() {
        return api<StudentStats>('/students/stats');
    }

    /** Lien du fichier tableur : mêmes filtres que la liste, servi par le proxy avec la session. */
    function exportUrl(params: StudentFilters) {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(filterQuery(params))) {
            for (const item of Array.isArray(value) ? value : [value]) query.append(key, String(item));
        }
        const qs = query.toString();
        return `/api/v1/students/export${qs ? `?${qs}` : ''}`;
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

    function documents(id: string) {
        return api<StudentDocument[]>(`/students/${id}/documents`);
    }

    function uploadDocument(id: string, kind: StudentDocumentKind, file: File, label?: string) {
        const body = new FormData();
        body.append('kind', kind);
        if (label) body.append('label', label);
        body.append('file', file);
        // Pas de Content-Type explicite : le navigateur pose lui-même la frontière multipart.
        return api<StudentDocument>(`/students/${id}/documents`, { method: 'POST', body });
    }

    function removeDocument(id: string, documentId: string) {
        return api(`/students/${id}/documents/${documentId}`, { method: 'DELETE' });
    }

    /** Lien servi par le proxy : la session suffit, aucune URL de stockage n'arrive au navigateur. */
    function documentUrl(id: string, documentId: string, download = false) {
        return `/api/v1/students/${id}/documents/${documentId}/file${download ? '?download=true' : ''}`;
    }

    return {
        search, stats, exportUrl, catalogue, establishmentLevels, create, update,
        documents, uploadDocument, removeDocument, documentUrl,
    };
}
