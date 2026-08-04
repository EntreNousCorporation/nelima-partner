import type { H3Event } from 'h3';

/**
 * Profil affiché dans l'interface. Volontairement pauvre : rien de sensible ne doit
 * transiter jusqu'au navigateur, et surtout aucun jeton.
 */
export type SchoolUser = {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    establishmentId?: string;
    establishmentName?: string;
    roleCode?: string;
    /**
     * Permissions du rôle, telles que le backend les déclare.
     *
     * Sert à ne pas proposer une action qui sera refusée. Ce n'est pas une protection : le refus
     * réel se joue côté serveur, et les champs qu'on n'a pas le droit de lire sont absents des
     * réponses, pas seulement masqués à l'écran.
     */
    permissions?: string[];
};

export type SessionData = {
    user?: SchoolUser;
    accessToken?: string;
    accessExpiresAt?: number;
};

const SESSION_COOKIE_NAME = 'nelima_portal_session';

/**
 * Aligné sur la durée de vie du jeton émis par le backend (24 h). Au-delà, la session
 * scellée ne servirait plus à rien puisque le jeton qu'elle porte serait expiré.
 */
const SESSION_MAX_AGE_SECONDS = 24 * 3600;

/**
 * Session scellée côté serveur : le cookie est HttpOnly, le navigateur ne peut donc pas
 * le lire en JavaScript. C'est ce qui rend une faille XSS incapable de voler le jeton,
 * contrairement à un stockage en localStorage.
 */
export async function getSchoolSession(event: H3Event) {
    const config = useRuntimeConfig();
    return await useSession<SessionData>(event, {
        password: config.sessionSecret,
        name: SESSION_COOKIE_NAME,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: SESSION_MAX_AGE_SECONDS,
            path: '/',
        },
    });
}
