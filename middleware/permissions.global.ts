import { useAuthStore } from '~/stores/auth';

/**
 * Chaque écran de l'espace école, avec les permissions qui l'ouvrent (une seule suffit).
 *
 * Le menu masque déjà ce qu'un profil ne peut pas ouvrir ; cette garde couvre l'adresse tapée ou
 * un lien reçu : sans elle, l'écran s'ouvrait vide, le serveur refusant ses données. Ce n'est pas
 * la protection — elle reste côté serveur —, c'est ne pas promettre une page qui ne viendra pas.
 *
 * Du plus précis au plus général : la première entrée qui correspond décide.
 */
const GUARDS: [string, string[]][] = [
    ['/app/paiements/transactions', ['accounting:read']],
    ['/app/paiements/recus', ['accounting:read', 'fee:read']],
    ['/app/paiements/frais', ['fee:read']],
    ['/app/paiements/relances', ['fee:read']],
    ['/app/paiements/guichet', ['collection:write']],
    ['/app/paiements/pertes', ['writeoff:propose', 'writeoff:approve']],
    ['/app/paiements', ['fee:read', 'collection:write']],
    ['/app/calendrier', ['calendar:read']],
    ['/app/classes', ['class:read']],
    ['/app/rentree', ['class:read']],
    ['/app/activites', ['activity:read']],
    ['/app/cantine', ['canteen:read']],
    ['/app/transport', ['transport:read']],
    ['/app/eleves', ['student:read']],
    ['/app/parents', ['student:read']],
    ['/app/personnel', ['staff:read']],
    ['/app/groupe', ['accounting:read']],
];

export default defineNuxtRouteMiddleware((to) => {
    const auth = useAuthStore();
    if (!auth.user || !to.path.startsWith('/app')) return;
    // « Tous les sites » est à la direction du groupe seule, quelle que soit sa comptabilité.
    if ((to.path === '/app/groupe' || to.path.startsWith('/app/groupe/')) && !auth.user.groupWide) {
        return navigateTo('/app', { replace: true });
    }
    const guard = GUARDS.find(([prefix]) => to.path === prefix || to.path.startsWith(`${prefix}/`));
    if (!guard) return;
    const { canAny } = usePermissions();
    // Une permission d'écriture tombe sur une année clôturée : la garde ne regarde que la
    // lecture, qui elle reste ouverte. canAny gère déjà cela pour les seules écritures.
    if (!canAny(guard[1])) {
        return navigateTo('/app', { replace: true });
    }
});
