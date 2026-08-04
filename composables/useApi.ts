import { useAuthStore } from '~/stores/auth';

/**
 * Client HTTP du portail. Même origine, sans en-tête d'autorisation : c'est le serveur
 * Nuxt qui ajoute le jeton. Le navigateur ne connaît pas l'URL du backend.
 */
export function useApi() {
    return $fetch.create({
        baseURL: '/api/v1',
        onResponseError({ response }) {
            if (response.status !== 401) return;

            // Vider le profil avant de rediriger, et pas seulement rediriger.
            //
            // Le proxy purge la session dès que le backend rejette le jeton. Sans cette ligne,
            // le magasin continuait d'affirmer que l'utilisateur est connecté : le middleware
            // le renvoyait de /connexion vers /app, dont les appels échouaient en 401, qui
            // renvoyait vers /connexion — une boucle de redirection qui fige l'onglet et rend
            // tout le portail inutilisable, pas seulement la page en cours. Elle se déclenche
            // seule à l'expiration du jeton, en cours de session, sans qu'aucun code n'ait changé.
            useAuthStore().clear();

            // Déjà sur l'écran de connexion : y renvoyer relancerait une navigation pour rien.
            if (useRoute().path !== '/connexion') {
                navigateTo('/connexion');
            }
        },
    });
}
