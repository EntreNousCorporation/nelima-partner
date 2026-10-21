import { useAuthStore } from '~/stores/auth';

/**
 * Ce que le rôle de l'utilisateur autorise, pour ne pas proposer une action qui sera refusée.
 *
 * Ce n'est pas une protection : masquer un bouton n'interdit rien. Le refus réel vient du serveur,
 * qui rejette l'appel et omet des réponses les champs qu'on n'a pas le droit de lire.
 *
 * Une session ouverte avant l'introduction des rôles fins ne porte pas la liste. On considère alors
 * tout permis : ces sessions sont celles des comptes d'amorçage, qui cumulent toutes les
 * permissions, et le serveur reste de toute façon le seul à trancher.
 */
export function usePermissions() {
    const auth = useAuthStore();

    const { readOnly } = useConsultedYear();

    function can(permission: string) {
        // Une année clôturée se consulte, elle ne se modifie plus : toute écriture tombe, et avec
        // elle chaque bouton qui en dépend. Le serveur le refuse aussi, mais un bouton qui mène à
        // un refus est une promesse que l'écran ne tient pas.
        if (readOnly.value && /:(write|manage)$/.test(permission)) return false;
        const granted = auth.user?.permissions;
        if (!granted) return true;
        return granted.includes(permission);
    }

    /** Au moins une de ces permissions. */
    function canAny(permissions: string | string[]) {
        return (Array.isArray(permissions) ? permissions : [permissions]).some((permission) => can(permission));
    }

    return { can, canAny };
}
