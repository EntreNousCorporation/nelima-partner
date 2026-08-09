import type { GuardianContact, Page } from '~/composables/useStudents';

/**
 * Enfant rattaché à un parent, tel que le sert `/parents/search`.
 *
 * C'est une vue allégée de l'élève : juste de quoi identifier l'enfant et savoir où il est
 * scolarisé. La fiche complète reste du côté de l'écran Élèves ; ici on ne montre que le lien.
 */
export type ParentChild = {
    id: string;
    firstName: string;
    lastName: string;
    registrationNumber: string;
    className?: string;
    levelLabel?: string;
    establishmentName?: string;
};

/**
 * Parent / tuteur de l'établissement, servi par `/parents/search`.
 *
 * On réutilise `GuardianContact` de `useStudents` plutôt que d'en redéclarer un jumeau : c'est la
 * même forme de contact partout, et deux définitions divergentes finiraient par se contredire.
 */
export type Parent = {
    id: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    contacts?: GuardianContact[];
    childrenCount?: number;
    children?: ParentChild[];
};

export function useParents() {
    const api = useApi();

    /**
     * L'établissement n'est jamais passé en paramètre : le serveur l'impose à partir du compte
     * connecté. La recherche est faite par le serveur, sur toutes les pages, et non sur la page
     * affichée — filtrer localement laisserait croire qu'on a cherché partout.
     */
    function search(params: { page: number; size: number; keyword?: string }) {
        const query: Record<string, any> = { page: params.page, size: params.size };
        if (params.keyword?.trim()) query.keyword = params.keyword.trim();
        return api<Page<Parent>>('/parents/search', { query });
    }

    return { search };
}
