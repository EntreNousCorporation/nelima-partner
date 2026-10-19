import type { PaymentStatus } from '~/composables/useStudents';
import type { BoTone } from '~/composables/useBoTones';

export type LineStatus = 'NOT_STARTED' | 'EN_ROUTE' | 'ARRIVED' | 'DELAYED' | 'INCIDENT';

/** Statuts du suivi du matin, avec la pastille de la maquette. */
export const LINE_STATUSES: { value: LineStatus; label: string; tone: BoTone }[] = [
    { value: 'NOT_STARTED', label: 'Pas encore parti', tone: 'mute' },
    { value: 'EN_ROUTE', label: 'En route', tone: 'info' },
    { value: 'ARRIVED', label: 'Arrivé à l’école', tone: 'ok' },
    { value: 'DELAYED', label: 'En retard', tone: 'late' },
    { value: 'INCIDENT', label: 'Incident', tone: 'late' },
];

/** Pièces du dossier d'un chauffeur, dans l'ordre de la maquette. */
export const DRIVER_DOCUMENTS = [
    { value: 'LICENSE', label: 'Permis de conduire' },
    { value: 'ID', label: 'Pièce d’identité' },
    { value: 'RECORD', label: 'Casier judiciaire' },
    { value: 'MEDICAL', label: 'Certificat médical' },
];

export const LICENSE_CATEGORIES = [
    { value: 'D', label: 'D · transport de personnes' },
    { value: 'C', label: 'C · poids lourd' },
    { value: 'B', label: 'B · minibus ≤ 9 places' },
];

export type TransportStop = {
    id?: string; position?: number; name: string; pickupTime?: string | null;
    latitude?: number | null; longitude?: number | null; riders?: number;
};
export type TransportLine = {
    id: string; name: string; itinerary: string; vehiclePlate?: string | null; capacity: number;
    driverId?: string | null; driverName?: string | null; driverPhone?: string | null;
    morningDeparture?: string | null; eveningDeparture?: string | null; days: string[];
    attendant?: string | null; startDate?: string | null; monthlyPrice: number; active: boolean;
    riders: number; stops: TransportStop[]; status: LineStatus; delayMinutes?: number | null; note?: string | null;
};
export type TransportDriver = {
    id: string; firstName: string; lastName: string; phone?: string | null; licenseCategory?: string | null;
    licenseExpiry?: string | null; documents: string[]; active: boolean; dossierComplete: boolean; lines: string[];
};
export type TransportOverview = {
    riders: number; shareOfEnrollment: number; linesInService: number; arrivedToday: number; seats: number;
    seatsFree: number; fillRate: number; unpaidAmount: number; unpaidStudents: number; alerts: TransportLine[];
};
export type TransportRider = {
    subscriptionId: string; studentId: string; studentName: string; registrationNumber: string; photoId?: string | null;
    className?: string | null; lineId: string; lineName: string; stopId?: string | null; stopName?: string | null;
    pickupTime?: string | null; startDate: string; endDate?: string | null; paymentStatus: PaymentStatus;
};
export type LineBody = {
    name: string; vehiclePlate?: string | null; capacity: number; driverId?: string | null;
    morningDeparture?: string | null; eveningDeparture?: string | null; days: string[]; attendant?: string | null;
    startDate?: string | null; announce?: boolean; monthlyPrice: number; active: boolean; stops: TransportStop[];
};
export type DriverBody = {
    firstName: string; lastName: string; phone?: string | null; licenseCategory?: string | null;
    licenseExpiry?: string | null; documents: string[]; active: boolean;
};

/** « 06:35:00 » → « 06:35 ». */
export const hhmm = (time?: string | null) => (time ? time.slice(0, 5) : '');

export function useTransport() {
    const api = useApi();
    return {
        overview: () => api<TransportOverview>('/transport/overview'),
        lines: () => api<TransportLine[]>('/transport/lines'),
        createLine: (body: LineBody) => api<TransportLine>('/transport/lines', { method: 'POST', body }),
        updateLine: (id: string, body: LineBody) => api<TransportLine>(`/transport/lines/${id}`, { method: 'PUT', body }),
        setStatus: (id: string, body: { status: LineStatus; delayMinutes?: number | null; note?: string | null; notifyFamilies?: boolean | null }) =>
            api<TransportLine>(`/transport/lines/${id}/status`, { method: 'PUT', body }),
        drivers: () => api<TransportDriver[]>('/transport/drivers'),
        createDriver: (body: DriverBody) => api<TransportDriver>('/transport/drivers', { method: 'POST', body }),
        updateDriver: (id: string, body: DriverBody) => api<TransportDriver>(`/transport/drivers/${id}`, { method: 'PUT', body }),
        riders: (lineId?: string) => api<TransportRider[]>('/transport/subscriptions', { query: lineId ? { lineId } : {} }),
        subscribe: (body: { studentId: string; lineId: string; stopId?: string | null; startDate?: string }) =>
            api<TransportRider>('/transport/subscriptions', { method: 'POST', body }),
        end: (id: string, endDate?: string) => api(`/transport/subscriptions/${id}/end`, { method: 'POST', body: { endDate } }),
    };
}
