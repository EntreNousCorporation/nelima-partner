import { defineEventHandler } from 'h3';
import { getSchoolSession } from '~~/server/utils/auth';

/**
 * La session est détruite côté serveur, donc immédiatement inutilisable. C'est l'avantage
 * sur un jeton conservé dans le navigateur, qu'on ne peut qu'espérer voir effacé.
 */
export default defineEventHandler(async (event) => {
    const session = await getSchoolSession(event);
    await session.clear();
    return { ok: true };
});
