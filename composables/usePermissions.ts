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

    function can(permission: string) {
        const granted = auth.user?.permissions;
        if (!granted) return true;
        return granted.includes(permission);
    }

    return { can };
}
