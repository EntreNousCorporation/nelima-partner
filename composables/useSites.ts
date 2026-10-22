/** Groupes scolaires à plusieurs sites : le site affiché, et la vue « Tous les sites ». */
export type Site = { id: string; name: string; city?: string | null; logo?: string | null };
export type Sites = { groupName?: string | null; groupWide: boolean; homeId: string; currentId: string; sites: Site[] };
export type SiteFigures = {
    site: Site; students: number; staff: number; expected: number; collected: number; overdue: number; collectionRate: number;
};
export type SitesOverview = { groupName: string; asOf: string; sites: SiteFigures[] };

export function useSites() {
    const api = useApi();
    return {
        sites: () => api<Sites>('/sites'),
        /** Change le site affiché ; sans identifiant, retour au site de rattachement. */
        switchTo: (establishmentId?: string | null) =>
            api<Sites>('/sites/current', { method: 'PUT', query: establishmentId ? { establishmentId } : {} }),
        overview: () => api<SitesOverview>('/sites/overview'),
    };
}
