import { createError, defineEventHandler } from 'h3';
import { getSchoolSession } from '~~/server/utils/auth';

/** Délai au-delà duquel le profil est relu auprès du backend. */
const PROFILE_TTL_MS = 5 * 60 * 1000;

/**
 * Source de vérité de l'état connecté. Le store client est éphémère : c'est cet appel
 * qui le repeuple à chaque démarrage, en SSR comme au rafraîchissement.
 *
 * Le profil (rôle, permissions, nom de l'établissement) est relu au backend au plus toutes les
 * cinq minutes. Sans cela, une permission ajoutée au rôle n'apparaissait qu'après une
 * reconnexion : le portail gardait celles du jour de la connexion pendant 24 h.
 */
export default defineEventHandler(async (event) => {
    const session = await getSchoolSession(event);
    const { user, accessToken, profileCheckedAt } = session.data;
    if (!user) {
        throw createError({ statusCode: 401 });
    }
    if (accessToken && Date.now() - (profileCheckedAt ?? 0) > PROFILE_TTL_MS) {
        const config = useRuntimeConfig();
        const profile = await $fetch.raw<Record<string, any>>(`${config.backendUrl}/users/me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            ignoreResponseError: true,
        });
        if (profile.status === 401) {
            // Jeton révoqué ou expiré côté backend : la session ne vaut plus rien.
            await session.clear();
            throw createError({ statusCode: 401 });
        }
        if (profile.status === 200 && profile._data) {
            const raw = profile._data;
            const refreshed = {
                ...user,
                firstName: raw.firstName ?? user.firstName,
                lastName: raw.lastName ?? user.lastName,
                establishmentName: raw.establishmentName ?? user.establishmentName,
                roleCode: raw.roleCode ?? user.roleCode,
                permissions: raw.permissions ?? user.permissions,
            };
            await session.update({ user: refreshed, profileCheckedAt: Date.now() });
            return { user: refreshed };
        }
        // Backend momentanément injoignable : on garde le profil connu plutôt que de déconnecter.
    }
    return { user };
});
