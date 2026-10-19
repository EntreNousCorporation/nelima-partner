<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';
import { WEEKDAYS, isoDay } from '~/composables/useCanteen';
import { boAmount, fmtNumber as fmt, pillStyle } from '~/composables/useBoTones';
import { PAYMENT_STATUSES, studentPhotoUrl, type Student } from '~/composables/useStudents';
import {
    DRIVER_DOCUMENTS, LICENSE_CATEGORIES, LINE_STATUSES, hhmm,
    type LineBody, type LineStatus, type TransportDriver, type TransportLine, type TransportOverview,
    type TransportRider, type TransportStop,
} from '~/composables/useTransport';

/**
 * Le transport scolaire, au dessin de la maquette : les lignes et leur suivi du matin, les cars,
 * les chauffeurs, les élèves transportés et ce qu'ils doivent.
 *
 * Le suivi est saisi par l'école (sans application chauffeur, c'est la seule source fiable) ; un
 * retard ou un incident prévient d'office les familles de la ligne.
 */
const transport = useTransport();
const { search } = useStudents();
const { can } = usePermissions();
const consultedYear = useConsultedYear();
const auth = useAuthStore();

const today = isoDay(new Date());
const schoolName = computed(() => auth.user?.establishmentName ?? 'École');
const overview = ref<TransportOverview | null>(null);
const lines = ref<TransportLine[]>([]);
const drivers = ref<TransportDriver[]>([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');

const plural = (n: number | undefined, word: string) => `${word}${(n ?? 0) > 1 ? 's' : ''}`;
const ddmm = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
const statusOf = (status: LineStatus) => LINE_STATUSES.find((s) => s.value === status) ?? LINE_STATUSES[0]!;
const statusLabel = (line: TransportLine) => (line.status === 'DELAYED' && line.delayMinutes
    ? `En retard · +${line.delayMinutes} min` : statusOf(line.status).label);
const paymentOf = (status: string) => PAYMENT_STATUSES.find((p) => p.value === status) ?? PAYMENT_STATUSES[0]!;
const telHref = (phone?: string | null) => (phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined);
const activeLines = computed(() => lines.value.filter((l) => l.active));
const availableDrivers = computed(() => drivers.value.filter((d) => d.active && !d.lines.length));

/** Arrivée à l'école : le dernier arrêt, plus l'écart moyen entre deux arrêts (10 min à défaut). */
function schoolArrival(stops: { pickupTime?: string | null }[]) {
    const times = stops.map((s) => hhmm(s.pickupTime)).filter(Boolean).map((t) => {
        const [h, m] = t.split(':').map(Number);
        return h! * 60 + m!;
    });
    if (!times.length) return '';
    const gap = times.length > 1 ? Math.max(1, Math.round((times[times.length - 1]! - times[0]!) / (times.length - 1))) : 10;
    const minutes = times[times.length - 1]! + gap;
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

async function load() {
    loading.value = true;
    error.value = '';
    try {
        const [o, l, d] = await Promise.all([transport.overview(), transport.lines(), transport.drivers()]);
        overview.value = o;
        lines.value = l;
        drivers.value = d;
        if (opened.value) opened.value = l.find((x) => x.id === opened.value!.id) ?? null;
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "Le transport n'a pas pu être chargé.";
    } finally {
        loading.value = false;
    }
}

function fail(e: any, message: string) {
    error.value = e?.data?.debugMessage ?? message;
}

function exportCsv() {
    const header = ['Ligne', 'Itinéraire', 'Car', 'Chauffeur', 'Téléphone', 'Aller', 'Retour', 'Élèves', 'Places', 'Statut'];
    const rowsCsv = lines.value.map((l) => [l.name, l.itinerary, l.vehiclePlate ?? '', l.driverName ?? '', l.driverPhone ?? '',
        hhmm(l.morningDeparture), hhmm(l.eveningDeparture), l.riders, l.capacity, statusLabel(l)]);
    const csv = '﻿' + [header, ...rowsCsv].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'transport.csv';
    link.click();
}

/** Corps d'enregistrement d'une ligne telle qu'elle est, pour n'en changer qu'une partie. */
const bodyOf = (line: TransportLine, stops: TransportStop[] = line.stops): LineBody => ({
    name: line.name, vehiclePlate: line.vehiclePlate, capacity: line.capacity, driverId: line.driverId,
    morningDeparture: hhmm(line.morningDeparture) || null, eveningDeparture: hhmm(line.eveningDeparture) || null,
    days: line.days, attendant: line.attendant, startDate: line.startDate, monthlyPrice: line.monthlyPrice, active: line.active,
    stops: stops.map((s) => ({ id: s.id, name: s.name, pickupTime: hhmm(s.pickupTime) || null, latitude: s.latitude, longitude: s.longitude })),
});

/* ---------------- Détail d'une ligne ---------------- */
const opened = ref<TransportLine | null>(null);
const riders = ref<TransportRider[]>([]);
const statusForm = reactive({ status: 'NOT_STARTED' as LineStatus, delayMinutes: '' as string | number, note: '' });
const savingStatus = ref(false);
const ending = ref<string | null>(null);

async function openLine(line: TransportLine) {
    opened.value = line;
    Object.assign(statusForm, { status: line.status, delayMinutes: line.delayMinutes ?? '', note: line.note ?? '' });
    ending.value = null;
    riders.value = [];
    try {
        riders.value = await transport.riders(line.id);
    } catch (e) {
        fail(e, 'Les élèves de la ligne n’ont pas pu être chargés.');
    }
}

async function saveStatus(notifyFamilies?: boolean) {
    const line = opened.value;
    if (!line) return;
    savingStatus.value = true;
    try {
        await transport.setStatus(line.id, {
            status: statusForm.status,
            delayMinutes: statusForm.status === 'DELAYED' && statusForm.delayMinutes !== '' ? Number(statusForm.delayMinutes) : null,
            note: statusForm.note || null,
            notifyFamilies: notifyFamilies ?? null,
        });
        const warned = notifyFamilies || statusForm.status === 'DELAYED' || statusForm.status === 'INCIDENT';
        notice.value = `${line.name} : ${statusOf(statusForm.status).label.toLowerCase()}${warned ? ' — les familles de la ligne ont été prévenues.' : '.'}`;
        await load();
    } catch (e) {
        fail(e, "Le statut n'a pas pu être enregistré.");
    } finally {
        savingStatus.value = false;
    }
}

async function endRide(rider: TransportRider) {
    try {
        await transport.end(rider.subscriptionId, today);
        notice.value = `${rider.studentName} ne prend plus la ${rider.lineName} : les mois suivants ne sont plus dus.`;
        ending.value = null;
        if (opened.value) riders.value = await transport.riders(opened.value.id);
        await load();
    } catch (e) {
        fail(e, "L'abonnement n'a pas pu être arrêté.");
    }
}

/* ---------------- Ligne : création et modification ---------------- */
type StopRow = { id?: string; name: string; pickupTime: string; latitude?: number | null; longitude?: number | null };
const lineOpen = ref(false);
const editingLine = ref<TransportLine | null>(null);
const lineForm = reactive({
    name: '', startDate: today, monthlyPrice: '' as string | number, vehiclePlate: '', capacity: 50, driverId: '',
    attendant: '', morningDeparture: '06:30', eveningDeparture: '16:45',
    days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as string[], stops: [] as StopRow[], announce: false, active: true,
});
const lineTried = ref(false);
const savingLine = ref(false);
const CAPACITIES = [30, 40, 50, 60, 70];
const capacityOptions = computed(() => [...new Set([...CAPACITIES, Number(lineForm.capacity)])].sort((a, b) => a - b));

function openLineForm(line?: TransportLine) {
    editingLine.value = line ?? null;
    lineTried.value = false;
    Object.assign(lineForm, line ? {
        name: line.name, startDate: line.startDate ?? today, monthlyPrice: line.monthlyPrice, vehiclePlate: line.vehiclePlate ?? '',
        capacity: line.capacity, driverId: line.driverId ?? '', attendant: line.attendant ?? '',
        morningDeparture: hhmm(line.morningDeparture), eveningDeparture: hhmm(line.eveningDeparture), days: [...line.days],
        stops: line.stops.map((s) => ({ id: s.id, name: s.name, pickupTime: hhmm(s.pickupTime), latitude: s.latitude, longitude: s.longitude })),
        announce: false, active: line.active,
    } : {
        name: `Ligne ${lines.value.length + 1}`, startDate: today, monthlyPrice: '', vehiclePlate: '', capacity: 50, driverId: '',
        attendant: '', morningDeparture: '06:30', eveningDeparture: '16:45', days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        stops: [{ name: '', pickupTime: '06:30' }], announce: false, active: true,
    });
    lineOpen.value = true;
}

function addMinutes(time: string, minutes: number) {
    const [h, m] = (time || '06:30').split(':').map(Number);
    const total = h! * 60 + m! + minutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function addStop() {
    const last = lineForm.stops[lineForm.stops.length - 1];
    lineForm.stops.push({ name: '', pickupTime: last ? addMinutes(last.pickupTime, 12) : lineForm.morningDeparture });
}

function moveStop(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= lineForm.stops.length) return;
    const stops = [...lineForm.stops];
    [stops[index], stops[target]] = [stops[target]!, stops[index]!];
    lineForm.stops = stops;
}

function toggleLineDay(day: string) {
    lineForm.days = lineForm.days.includes(day) ? lineForm.days.filter((d) => d !== day) : [...lineForm.days, day];
}

const lineValid = computed(() => lineForm.name.trim() && lineForm.vehiclePlate.trim() && lineForm.driverId
    && lineForm.monthlyPrice !== '' && lineForm.stops.length > 0 && lineForm.stops.every((s) => s.name.trim()));

function onDriverSelect(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (value === '__new') {
        lineForm.driverId = '';
        (event.target as HTMLSelectElement).value = '';
        openDriverForm(undefined, true);
    }
}

async function saveLine() {
    lineTried.value = true;
    if (!lineValid.value) return;
    savingLine.value = true;
    const body: LineBody = {
        name: lineForm.name.trim(), vehiclePlate: lineForm.vehiclePlate.trim(), capacity: Number(lineForm.capacity),
        driverId: lineForm.driverId || null, morningDeparture: lineForm.morningDeparture || null,
        eveningDeparture: lineForm.eveningDeparture || null, days: lineForm.days, attendant: lineForm.attendant.trim() || null,
        startDate: lineForm.startDate || null, announce: !editingLine.value && lineForm.announce,
        monthlyPrice: Number(lineForm.monthlyPrice), active: lineForm.active,
        stops: lineForm.stops.map((s) => ({ id: s.id, name: s.name.trim(), pickupTime: s.pickupTime || null, latitude: s.latitude, longitude: s.longitude })),
    };
    try {
        if (editingLine.value) await transport.updateLine(editingLine.value.id, body);
        else await transport.createLine(body);
        notice.value = editingLine.value ? `${body.name} enregistrée.` : `${body.name} créée${body.announce ? ' et annoncée aux familles' : ''}.`;
        lineOpen.value = false;
        await load();
    } catch (e) {
        fail(e, "La ligne n'a pas pu être enregistrée.");
    } finally {
        savingLine.value = false;
    }
}

/* ---------------- Chauffeur ---------------- */
const driverOpen = ref(false);
const editingDriver = ref<TransportDriver | null>(null);
const driverForAssignment = ref(false);
const driverForm = reactive({ fullName: '', phone: '', licenseCategory: 'D', licenseExpiry: '', documents: [] as string[], active: true });
const driverTried = ref(false);

function openDriverForm(driver?: TransportDriver, forLine = false) {
    editingDriver.value = driver ?? null;
    driverForAssignment.value = forLine;
    driverTried.value = false;
    Object.assign(driverForm, driver ? {
        fullName: `${driver.lastName} ${driver.firstName}`, phone: driver.phone ?? '', licenseCategory: driver.licenseCategory ?? 'D',
        licenseExpiry: driver.licenseExpiry ?? '', documents: [...driver.documents], active: driver.active,
    } : { fullName: '', phone: '', licenseCategory: 'D', licenseExpiry: '', documents: [], active: true });
    driverOpen.value = true;
}

function toggleDocument(value: string) {
    driverForm.documents = driverForm.documents.includes(value)
        ? driverForm.documents.filter((d) => d !== value) : [...driverForm.documents, value];
}

/** « KOFFI Jean-Marc » : le nom d'abord, en capitales, comme partout dans Nelima. */
const nameParts = computed(() => {
    const parts = driverForm.fullName.trim().split(/\s+/).filter(Boolean);
    return { lastName: parts[0] ?? '', firstName: parts.slice(1).join(' ') };
});
const driverValid = computed(() => !!nameParts.value.lastName && !!nameParts.value.firstName
    && !!driverForm.phone.trim() && !!driverForm.licenseExpiry);

async function saveDriver() {
    driverTried.value = true;
    if (!driverValid.value) return;
    const body = {
        firstName: nameParts.value.firstName, lastName: nameParts.value.lastName, phone: driverForm.phone.trim(),
        licenseCategory: driverForm.licenseCategory, licenseExpiry: driverForm.licenseExpiry, documents: driverForm.documents, active: driverForm.active,
    };
    try {
        const saved = editingDriver.value
            ? await transport.updateDriver(editingDriver.value.id, body)
            : await transport.createDriver(body);
        drivers.value = await transport.drivers();
        if (driverForAssignment.value) lineForm.driverId = saved.id;
        driverOpen.value = false;
        notice.value = `${saved.lastName} ${saved.firstName} enregistré.`;
    } catch (e) {
        fail(e, "Le chauffeur n'a pas pu être enregistré.");
    }
}

/* ---------------- Inscription d'un élève ---------------- */
const rideOpen = ref(false);
const studentQuery = ref('');
const candidates = ref<Student[]>([]);
const picked = ref<Student | null>(null);
const rideStop = ref('');
const rideStart = ref(today);
const subscribing = ref(false);
let debounce: ReturnType<typeof setTimeout> | undefined;

async function findCandidates(value: string) {
    try {
        const taken = new Set(riders.value.map((r) => r.studentId));
        candidates.value = ((await search({ page: 0, size: 12, keyword: value.trim() || undefined })).content ?? [])
            .filter((s) => !taken.has(s.id)).slice(0, 5);
    } catch {
        candidates.value = [];
    }
}

watch(studentQuery, (value) => {
    clearTimeout(debounce);
    if (picked.value) return;
    debounce = setTimeout(() => findCandidates(value), 250);
});

function openRide() {
    picked.value = null;
    studentQuery.value = '';
    rideStop.value = opened.value?.stops[0]?.id ?? '';
    rideStart.value = opened.value?.startDate && opened.value.startDate > today ? opened.value.startDate : today;
    rideOpen.value = true;
    findCandidates('');
}

const rideBilling = computed(() => {
    const line = opened.value;
    const end = consultedYear.consulted.value?.endDate;
    if (!line || !end || !rideStart.value) return null;
    const start = new Date(`${rideStart.value}T12:00:00`);
    const last = new Date(`${end}T12:00:00`);
    const months = Math.max(0, (last.getFullYear() - start.getFullYear()) * 12 + last.getMonth() - start.getMonth() + 1);
    const firstDue = start.getDate() > 5 ? rideStart.value : isoDay(new Date(start.getFullYear(), start.getMonth(), 5));
    return { months, total: months * Number(line.monthlyPrice), firstDue };
});

async function subscribe() {
    const line = opened.value;
    if (!line || !picked.value) return;
    subscribing.value = true;
    try {
        await transport.subscribe({ studentId: picked.value.id, lineId: line.id, stopId: rideStop.value || null, startDate: rideStart.value });
        notice.value = `${picked.value.lastName} ${picked.value.firstName} prend la ${line.name} ; ses mois sont facturés jusqu'à la fin de l'année.`;
        rideOpen.value = false;
        riders.value = await transport.riders(line.id);
        await load();
    } catch (e) {
        fail(e, "L'inscription n'a pas pu être enregistrée.");
    } finally {
        subscribing.value = false;
    }
}

/* ---------------- Carte des arrêts ---------------- */
const LINE_COLORS = ['#0061FF', '#12996A', '#E5484D', '#F5A524', '#8A5BFF', '#0B2E66', '#1FCC85', '#C4363B'];
const mapOpen = ref(false);
const mapLines = ref<{ line: TransportLine; stops: TransportStop[]; dirty: boolean }[]>([]);
const mapSelected = ref<string | null>(null);
const savingMap = ref(false);

function openMap() {
    mapLines.value = activeLines.value.map((line) => ({ line, stops: line.stops.map((s) => ({ ...s })), dirty: false }));
    mapSelected.value = mapLines.value[0]?.stops[0]?.id ?? null;
    mapOpen.value = true;
}

const mapPoints = computed(() => mapLines.value.flatMap((entry, index) => entry.stops.map((stop) => ({
    key: stop.id!, name: stop.name, line: entry.line.name, color: LINE_COLORS[index % LINE_COLORS.length]!,
    latitude: stop.latitude, longitude: stop.longitude,
}))));

function place(latitude: number, longitude: number) {
    for (const entry of mapLines.value) {
        const stop = entry.stops.find((s) => s.id === mapSelected.value);
        if (stop) {
            stop.latitude = Math.round(latitude * 1e6) / 1e6;
            stop.longitude = Math.round(longitude * 1e6) / 1e6;
            entry.dirty = true;
            // On enchaîne sur l'arrêt suivant de la ligne : placer un itinéraire se fait d'un trait.
            const next = entry.stops[entry.stops.indexOf(stop) + 1];
            if (next) mapSelected.value = next.id!;
            return;
        }
    }
}

async function saveMap() {
    savingMap.value = true;
    try {
        for (const entry of mapLines.value.filter((e) => e.dirty)) {
            await transport.updateLine(entry.line.id, bodyOf(entry.line, entry.stops));
        }
        mapOpen.value = false;
        notice.value = 'Emplacements des arrêts enregistrés.';
        await load();
    } catch (e) {
        fail(e, "Les emplacements n'ont pas pu être enregistrés.");
    } finally {
        savingMap.value = false;
    }
}

/** Anneau du taux de remplissage, celui de la maquette (rayon 27, trait 8). */
const RING = 2 * Math.PI * 27;

onMounted(load);
</script>

<template>
    <div class="bo-page">
        <div class="ph">
            <div>
                <h1>Transport scolaire</h1>
                <p>
                    {{ activeLines.length }} {{ plural(activeLines.length, 'ligne') }} · {{ fmt(overview?.riders) }} {{ plural(overview?.riders, 'élève') }} {{ plural(overview?.riders, 'transporté') }}<template v-if="consultedYear.consulted.value"> · Année {{ consultedYear.consulted.value.label }}</template>
                </p>
            </div>
            <div class="acts">
                <button type="button" class="btn out" :disabled="!activeLines.length" @click="openMap"><BoIcon name="map-pin" :size="16" />Carte des arrêts</button>
                <button v-if="can('transport:write')" type="button" class="btn out" @click="openDriverForm()"><BoIcon name="user-check" :size="16" />Ajouter un chauffeur</button>
                <button v-if="can('transport:write')" type="button" class="btn pr" @click="openLineForm()"><BoIcon name="plus" :size="16" />Nouvelle ligne</button>
            </div>
        </div>

        <p v-if="error" class="alert-danger" style="margin-bottom: 14px" role="alert">{{ error }}</p>
        <p v-if="notice" class="alert-success" style="margin-bottom: 14px">{{ notice }}</p>

        <!-- ============ Alertes du matin ============ -->
        <div
            v-for="alert in overview?.alerts ?? []" :key="alert.id" class="bnr"
            :style="alert.status === 'INCIDENT'
                ? 'background: var(--rd-t); border-color: rgba(196, 54, 59, 0.2)'
                : 'background: var(--am-t); border-color: rgba(150, 98, 10, 0.2)'"
        >
            <div
                style="width: 34px; height: 34px; border-radius: 10px; background: var(--surface-raised); display: grid; place-items: center; flex-shrink: 0"
                :style="{ color: alert.status === 'INCIDENT' ? 'var(--rd-d)' : 'var(--am-d)' }"
            >
                <BoIcon :name="alert.status === 'INCIDENT' ? 'alert' : 'clock'" :size="18" />
            </div>
            <div style="flex: 1 1 0%; min-width: 0">
                <b class="nu" style="font-size: 14px; letter-spacing: -0.1px" :style="{ color: alert.status === 'INCIDENT' ? 'var(--rd-d)' : 'var(--am-d)' }">
                    <template v-if="alert.status === 'INCIDENT'">Incident sur la {{ alert.name }}</template>
                    <template v-else>{{ alert.name }} en retard{{ alert.delayMinutes ? ` de ${alert.delayMinutes} min` : '' }}</template>
                </b>
                <div style="font: 500 12.5px / 1.45 Inter; color: var(--tx2); margin-top: 2px">
                    {{ alert.itinerary }}<template v-if="alert.driverName"> · chauffeur {{ alert.driverName }}</template><template v-if="alert.note"> · {{ alert.note }}</template> · les familles concernées ont été prévenues par notification.
                </div>
            </div>
            <a v-if="alert.driverPhone" class="btn out sm" :href="telHref(alert.driverPhone)"><BoIcon name="phone" :size="15" />Appeler le chauffeur</a>
        </div>

        <!-- ============ Chiffres ============ -->
        <div class="grid" style="margin-bottom: 14px">
            <div class="card kpi c3">
                <div class="lb"><BoIcon name="students" :size="14" :stroke-width="2" />Élèves transportés</div>
                <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 10px">
                    <div style="min-width: 0">
                        <div class="vl">{{ fmt(overview?.riders) }}</div>
                        <div class="ft">{{ overview?.shareOfEnrollment ?? 0 }} % de l’effectif</div>
                    </div>
                </div>
            </div>
            <div class="card kpi c3">
                <div class="lb">
                    <BoIcon name="bus" :size="14" :stroke-width="2" />Cars en service
                    <span class="info-dot" data-tip="Lignes en service, chacune avec son car. Les lignes suspendues ne sont pas comptées." tabindex="0" role="note" aria-label="Lignes en service, chacune avec son car. Les lignes suspendues ne sont pas comptées.">?</span>
                </div>
                <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 10px">
                    <div style="min-width: 0">
                        <div class="vl">{{ overview?.linesInService ?? 0 }}</div>
                        <div class="ft">{{ overview?.arrivedToday ?? 0 }} {{ plural(overview?.arrivedToday, 'arrivé') }} ce matin</div>
                    </div>
                </div>
            </div>
            <div class="card kpi c3">
                <div class="lb"><BoIcon name="percent-ring" :size="14" :stroke-width="2" />Taux de remplissage</div>
                <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 10px">
                    <div style="min-width: 0">
                        <div class="vl">{{ overview?.fillRate ?? 0 }}<small>%</small></div>
                        <div class="ft">{{ overview?.seatsFree ?? 0 }} {{ plural(overview?.seatsFree, 'place') }} {{ plural(overview?.seatsFree, 'disponible') }}</div>
                    </div>
                    <div style="position: relative; width: 62px; height: 62px; flex-shrink: 0">
                        <svg width="62" height="62" style="transform: rotate(-90deg)" aria-hidden="true">
                            <circle cx="31" cy="31" r="27" fill="none" stroke="#EAEEF4" stroke-width="8" />
                            <circle
                                v-if="(overview?.fillRate ?? 0) > 0"
                                cx="31" cy="31" r="27" fill="none" stroke="var(--pr)" stroke-width="8" stroke-linecap="round"
                                :stroke-dasharray="`${(RING * Math.min(100, overview?.fillRate ?? 0)) / 100} ${RING}`"
                                style="transition: stroke-dasharray 0.6s cubic-bezier(0.3, 0.8, 0.3, 1)"
                            />
                        </svg>
                        <div style="position: absolute; inset: 0; display: grid; place-content: center; text-align: center">
                            <div class="nu" style="font-weight: 900; font-size: 15.5px; letter-spacing: -0.6px; color: var(--nv)">{{ overview?.fillRate ?? 0 }}%</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card kpi c3">
                <div class="lb"><BoIcon name="card" :size="14" :stroke-width="2" />Impayés transport</div>
                <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 10px">
                    <div style="min-width: 0">
                        <div class="vl">{{ boAmount(overview?.unpaidAmount) }}<small>FCFA</small></div>
                        <div class="ft">{{ overview?.unpaidStudents ?? 0 }} {{ plural(overview?.unpaidStudents, 'élève') }}</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ============ Lignes ============ -->
        <section class="card">
            <div class="card-h">
                <div>
                    <h3>Lignes &amp; suivi du matin</h3>
                    <div class="sub">Cliquez sur une ligne pour voir ses arrêts</div>
                </div>
                <button type="button" class="btn out sm" @click="exportCsv"><BoIcon name="download" :size="15" />Exporter</button>
            </div>
            <div style="overflow-x: auto">
                <table class="tb">
                    <thead>
                        <tr>
                            <th>Ligne</th><th>Itinéraire</th><th>Car</th><th>Chauffeur</th><th>Horaires</th>
                            <th style="width: 160px">Remplissage</th><th>Statut</th><th />
                        </tr>
                    </thead>
                    <tbody>
                        <TableSkeleton v-if="loading && !lines.length" :columns="8" />
                        <tr v-for="l in lines" v-else :key="l.id" class="cl" :style="l.active ? undefined : 'opacity: 0.55'" @click="openLine(l)">
                            <td>
                                <div class="nm">
                                    <div class="sv-bus"><BoIcon name="bus" :size="16" /></div>
                                    <div><b>{{ l.name }}</b><span>{{ l.stops.length }} {{ plural(l.stops.length, 'arrêt') }}{{ l.active ? '' : ' · suspendue' }}</span></div>
                                </div>
                            </td>
                            <td style="font: 500 12.5px / 1.35 Inter; color: var(--tx)">{{ l.itinerary }}</td>
                            <td class="nu" style="font: 600 12px / 1 Inter; color: var(--tx2)">{{ l.vehiclePlate || '—' }}</td>
                            <td>
                                <template v-if="l.driverName">
                                    <b style="display: block; font: 600 12.5px / 1.3 Inter; color: var(--tx)">{{ l.driverName }}</b>
                                    <span class="nu" style="font: 500 11.5px / 1.3 Inter; color: var(--tx3)">{{ l.driverPhone }}</span>
                                </template>
                                <span v-else style="color: var(--tx3)">—</span>
                            </td>
                            <td class="nu" style="font: 500 12.5px / 1.4 Inter; color: var(--tx2); white-space: nowrap">
                                Aller {{ hhmm(l.morningDeparture) || '—' }}<br>Retour {{ hhmm(l.eveningDeparture) || '—' }}
                            </td>
                            <td>
                                <div style="display: flex; align-items: center; gap: 8px">
                                    <div class="pg" style="height: 6px"><i :style="{ width: `${Math.min(100, (l.riders / l.capacity) * 100)}%`, background: 'var(--pr)' }" /></div>
                                    <span class="nu" style="font: 700 12px / 1 Inter; color: var(--nv); white-space: nowrap">{{ l.riders }}/{{ l.capacity }}</span>
                                </div>
                            </td>
                            <td><span class="pill" :style="pillStyle(statusOf(l.status).tone)">{{ statusLabel(l) }}</span></td>
                            <td class="r"><BoIcon name="chevron-right" :size="16" style="color: var(--tx3)" /></td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-if="!loading && !lines.length" class="empty">
                <h4>Aucune ligne</h4>
                <p>Créez la première ligne avec le bouton « Nouvelle ligne » : itinéraire, car, chauffeur et tarif.</p>
            </div>
        </section>

        <!-- ============ Chauffeurs ============ -->
        <section class="card" style="margin-top: 14px">
            <div class="card-h">
                <div>
                    <h3>Chauffeurs</h3>
                    <div class="sub">{{ drivers.length }} {{ plural(drivers.length, 'chauffeur') }} · {{ availableDrivers.length }} {{ plural(availableDrivers.length, 'disponible') }}</div>
                </div>
                <button v-if="can('transport:write')" type="button" class="btn out sm" @click="openDriverForm()"><BoIcon name="plus" :size="15" />Ajouter un chauffeur</button>
            </div>
            <div style="overflow-x: auto">
                <table class="tb">
                    <thead>
                        <tr><th>Chauffeur</th><th>Téléphone</th><th>Permis</th><th>Dossier</th><th>Affectation</th></tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="d in drivers" :key="d.id" :class="{ cl: can('transport:write') }"
                            :style="d.active ? undefined : 'opacity: 0.55'" @click="can('transport:write') && openDriverForm(d)"
                        >
                            <td>
                                <div class="nm">
                                    <BoAvatar :name="`${d.lastName} ${d.firstName}`" tone="#BFD8FF" :size="32" />
                                    <div><b>{{ d.lastName }} {{ d.firstName }}</b></div>
                                </div>
                            </td>
                            <td class="nu" style="font: 500 12.5px / 1 Inter; color: var(--tx2)">{{ d.phone || '—' }}</td>
                            <td style="font: 500 12.5px / 1 Inter; color: var(--tx2)">
                                Permis {{ d.licenseCategory || '—' }}<template v-if="d.licenseExpiry"> · exp. {{ d.licenseExpiry.slice(0, 4) }}</template>
                            </td>
                            <td><span class="pill" :style="pillStyle(d.dossierComplete ? 'ok' : 'warn')">{{ d.dossierComplete ? 'Complet' : 'Incomplet' }}</span></td>
                            <td>
                                <template v-if="d.lines.length"><span v-for="name in d.lines" :key="name" class="tag" style="margin-right: 4px">{{ name }}</span></template>
                                <span v-else-if="d.active" class="pill" :style="pillStyle('info')">Disponible</span>
                                <span v-else class="pill" :style="pillStyle('mute')">Inactif</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-if="!loading && !drivers.length" class="empty">
                <h4>Aucun chauffeur</h4>
                <p>Ajoutez les chauffeurs avant de leur confier une ligne.</p>
            </div>
        </section>

        <!-- ============ Détail d'une ligne ============ -->
        <BoDrawer v-if="opened" :title="opened.name" :sub="opened.itinerary" @close="opened = null">
            <div style="margin-bottom: 20px">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px"><p class="sec">Véhicule &amp; équipage</p></div>
                <dl class="kv">
                    <dt>Car</dt><dd>{{ opened.vehiclePlate || '—' }}</dd>
                    <dt>Chauffeur</dt><dd>{{ opened.driverName ? `${opened.driverName}${opened.driverPhone ? ` · ${opened.driverPhone}` : ''}` : '—' }}</dd>
                    <template v-if="opened.attendant"><dt>Accompagnateur</dt><dd>{{ opened.attendant }}</dd></template>
                    <dt>Départ aller</dt><dd>{{ hhmm(opened.morningDeparture) || '—' }}</dd>
                    <dt>Départ retour</dt><dd>{{ hhmm(opened.eveningDeparture) || '—' }}</dd>
                    <dt>Jours</dt><dd>{{ WEEKDAYS.filter((w) => opened!.days.includes(w.value)).map((w) => w.short).join(' · ') }}</dd>
                    <dt>Élèves</dt><dd>{{ opened.riders }} / {{ opened.capacity }} places</dd>
                    <dt>Tarif</dt><dd>{{ fmt(opened.monthlyPrice) }} FCFA / mois</dd>
                </dl>
            </div>

            <div v-if="can('transport:write')" style="margin-bottom: 20px">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px"><p class="sec">Suivi du jour</p></div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap">
                    <button
                        v-for="s in LINE_STATUSES" :key="s.value" type="button" class="chip"
                        :aria-pressed="statusForm.status === s.value" @click="statusForm.status = s.value"
                    >{{ s.label }}</button>
                </div>
                <div class="frm" style="margin-top: 12px">
                    <div v-if="statusForm.status === 'DELAYED'" class="fld">
                        <label for="line-delay">Retard (minutes)</label>
                        <input id="line-delay" v-model="statusForm.delayMinutes" inputmode="numeric" placeholder="Ex. 12" />
                    </div>
                    <div class="fld" :style="statusForm.status === 'DELAYED' ? undefined : 'grid-column: span 2'">
                        <label for="line-note">Précision</label>
                        <input id="line-note" v-model="statusForm.note" maxlength="255" placeholder="Ex. embouteillage au carrefour Duncan" />
                    </div>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px">
                    <span style="font: 500 12px / 1.45 Inter; color: var(--tx3)">Un retard ou un incident prévient les familles de la ligne.</span>
                    <button type="button" class="btn pr sm" :disabled="savingStatus" @click="saveStatus()"><BoIcon name="check" :size="15" />Enregistrer</button>
                </div>
            </div>

            <div style="margin-bottom: 20px">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px"><p class="sec">Arrêts · {{ opened.stops.length }}</p></div>
                <div class="sv-stops">
                    <div v-for="(s, i) in opened.stops" :key="s.id" :class="{ on: opened.status === 'ARRIVED' }">
                        <i />
                        <b>Arrêt {{ i + 1 }} · {{ s.name }}</b>
                        <span class="nu">{{ hhmm(s.pickupTime) || '—' }} · {{ s.riders ?? 0 }} {{ plural(s.riders, 'élève') }}</span>
                    </div>
                    <div :class="{ on: opened.status === 'ARRIVED' }">
                        <i />
                        <b>École</b>
                        <span class="nu">{{ schoolArrival(opened.stops) || '—' }} · {{ opened.riders }} {{ plural(opened.riders, 'élève') }}</span>
                    </div>
                </div>
            </div>

            <div>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px">
                    <p class="sec">Élèves · {{ riders.length }}</p>
                    <button
                        v-if="can('transport:write')" type="button" class="btn out sm" style="margin-top: -10px"
                        :disabled="!opened.active || opened.riders >= opened.capacity" @click="openRide"
                    ><BoIcon name="plus" :size="15" />Inscrire un élève</button>
                </div>
                <div v-if="riders.length" class="sv-list" style="margin-top: 0">
                    <div v-for="r in riders" :key="r.subscriptionId" class="sv-pick">
                        <div class="nm">
                            <BoAvatar :name="r.studentName" :src="studentPhotoUrl({ id: r.studentId, photoId: r.photoId })" :size="30" />
                            <div>
                                <b>{{ r.studentName }}</b>
                                <span>{{ r.className ? `${r.className} · ` : '' }}{{ r.stopName ?? 'Sans arrêt' }}{{ r.endDate ? ` · jusqu’au ${ddmm(r.endDate)}` : '' }}</span>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px">
                            <span class="pill" :style="pillStyle(paymentOf(r.paymentStatus).tone)">{{ paymentOf(r.paymentStatus).label }}</span>
                            <template v-if="can('transport:write') && !r.endDate">
                                <button v-if="ending !== r.subscriptionId" type="button" class="ic-btn" style="width: 28px; height: 28px; color: var(--tx3)" :aria-label="`Arrêter le transport de ${r.studentName}`" @click="ending = r.subscriptionId">
                                    <BoIcon name="close" :size="15" />
                                </button>
                                <button v-else type="button" class="btn dn sm" @click="endRide(r)">Arrêter</button>
                            </template>
                        </div>
                    </div>
                </div>
                <p v-else style="margin: 0; font: 500 12.5px / 1.45 Inter; color: var(--tx3)">Aucun élève sur cette ligne pour l’instant.</p>
            </div>

            <template #footer>
                <a v-if="opened.driverPhone" class="btn out" :href="telHref(opened.driverPhone)"><BoIcon name="phone" :size="16" />Appeler le chauffeur</a>
                <button v-if="can('transport:write')" type="button" class="btn out" @click="openLineForm(opened)"><BoIcon name="edit" :size="16" />Modifier</button>
                <div style="flex: 1 1 0%" />
                <button v-if="can('transport:write')" type="button" class="btn pr" :disabled="savingStatus" @click="saveStatus(true)"><BoIcon name="bell" :size="16" />Prévenir les familles</button>
            </template>
        </BoDrawer>

        <!-- ============ Ligne ============ -->
        <BoModal
            v-if="lineOpen" :title="editingLine ? editingLine.name : 'Nouvelle ligne de transport'" icon="bus" :width="760"
            sub="Itinéraire, véhicule et horaires · les familles pourront y inscrire leurs enfants" @close="lineOpen = false"
        >
            <div style="margin-bottom: 20px">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px"><p class="sec">Ligne</p></div>
                <div class="frm">
                    <div class="fld" :class="{ bad: lineTried && !lineForm.name.trim() }">
                        <label for="line-name">Nom de la ligne *</label>
                        <input id="line-name" v-model="lineForm.name" placeholder="Ex. Ligne 7" maxlength="64" />
                    </div>
                    <div class="fld">
                        <label for="line-school">Établissement desservi</label>
                        <select id="line-school" disabled><option>{{ schoolName }}</option></select>
                    </div>
                    <div class="fld">
                        <label for="line-start">Mise en service</label>
                        <NelimaDateField id="line-start" v-model="lineForm.startDate" />
                    </div>
                    <div class="fld" :class="{ bad: lineTried && lineForm.monthlyPrice === '' }">
                        <label for="line-price">Tarif mensuel (FCFA) *</label>
                        <input id="line-price" v-model="lineForm.monthlyPrice" inputmode="numeric" placeholder="30000" />
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 20px">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px"><p class="sec">Véhicule &amp; équipage</p></div>
                <div class="frm">
                    <div class="fld" :class="{ bad: lineTried && !lineForm.vehiclePlate.trim() }">
                        <label for="line-plate">Immatriculation du car *</label>
                        <input id="line-plate" v-model="lineForm.vehiclePlate" placeholder="Ex. AB 1234 CI" maxlength="16" />
                    </div>
                    <div class="fld">
                        <label for="line-capacity">Nombre de places</label>
                        <select id="line-capacity" v-model.number="lineForm.capacity">
                            <option v-for="c in capacityOptions" :key="c" :value="c">{{ c }} places</option>
                        </select>
                    </div>
                    <div class="fld" :class="{ bad: lineTried && !lineForm.driverId }">
                        <label for="line-driver">Chauffeur *</label>
                        <select id="line-driver" v-model="lineForm.driverId" @change="onDriverSelect">
                            <option value="">Choisir un chauffeur disponible</option>
                            <option
                                v-for="d in drivers.filter((x) => x.active && (!x.lines.length || x.id === editingLine?.driverId || x.id === lineForm.driverId))"
                                :key="d.id" :value="d.id"
                            >{{ d.lastName }} {{ d.firstName }}</option>
                            <option value="__new">+ Ajouter un nouveau chauffeur…</option>
                        </select>
                    </div>
                    <div class="fld">
                        <label for="line-attendant">Accompagnateur</label>
                        <input id="line-attendant" v-model="lineForm.attendant" placeholder="Facultatif · obligatoire en maternelle" maxlength="96" />
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 20px">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px"><p class="sec">Horaires</p></div>
                <div class="frm">
                    <div class="fld"><label for="line-morning">Départ aller (1er arrêt)</label><input id="line-morning" v-model="lineForm.morningDeparture" type="time" /></div>
                    <div class="fld"><label for="line-evening">Départ retour (de l’école)</label><input id="line-evening" v-model="lineForm.eveningDeparture" type="time" /></div>
                </div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px">
                    <button
                        v-for="d in WEEKDAYS" :key="d.value" type="button" class="chip"
                        :aria-pressed="lineForm.days.includes(d.value)" @click="toggleLineDay(d.value)"
                    >{{ d.short }}</button>
                </div>
            </div>

            <div style="margin-bottom: 20px">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px">
                    <p class="sec">Arrêts · {{ lineForm.stops.length }}</p>
                    <button type="button" class="btn out sm" style="margin-top: -10px" @click="addStop"><BoIcon name="plus" :size="15" />Ajouter un arrêt</button>
                </div>
                <div class="sv-st" :class="{ bad: lineTried && (!lineForm.stops.length || lineForm.stops.some((s) => !s.name.trim())) }">
                    <div v-for="(s, i) in lineForm.stops" :key="i" class="sv-st-r">
                        <span class="sv-st-n nu">{{ i + 1 }}</span>
                        <input v-model="s.name" placeholder="Nom de l’arrêt · quartier, repère" maxlength="96" :aria-label="`Arrêt ${i + 1}`" />
                        <input v-model="s.pickupTime" type="time" style="width: 104px; flex: 0 0 auto" :aria-label="`Heure de l’arrêt ${i + 1}`" />
                        <button type="button" class="ic-btn" :disabled="i === 0" aria-label="Monter" :style="{ transform: 'rotate(-90deg)', opacity: i === 0 ? 0.3 : 1 }" @click="moveStop(i, -1)"><BoIcon name="chevron-right" :size="15" /></button>
                        <button type="button" class="ic-btn" :disabled="i === lineForm.stops.length - 1" aria-label="Descendre" :style="{ transform: 'rotate(90deg)', opacity: i === lineForm.stops.length - 1 ? 0.3 : 1 }" @click="moveStop(i, 1)"><BoIcon name="chevron-right" :size="15" /></button>
                        <button type="button" class="ic-btn" aria-label="Supprimer" style="color: var(--tx3)" @click="lineForm.stops.splice(i, 1)"><BoIcon name="close" :size="15" /></button>
                    </div>
                    <div class="sv-st-r end">
                        <span class="sv-st-n"><BoIcon name="school" :size="13" /></span>
                        <b>École · {{ schoolName }}</b>
                        <span class="nu">{{ schoolArrival(lineForm.stops) }}</span>
                    </div>
                </div>
            </div>

            <section v-if="!editingLine" class="card">
                <div class="srow">
                    <div class="sic"><BoIcon name="bell" :size="17" /></div>
                    <div style="flex: 1 1 0%; min-width: 0">
                        <b>Annoncer la ligne aux familles</b>
                        <p>Notification aux familles de l’école · inscriptions ouvertes{{ lineForm.startDate ? ` dès le ${new Date(`${lineForm.startDate}T12:00:00`).toLocaleDateString('fr-FR')}` : '' }}.</p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0">
                        <button
                            type="button" class="sw" role="switch" :aria-checked="lineForm.announce" :aria-pressed="lineForm.announce"
                            aria-label="Annoncer la ligne aux familles" @click="lineForm.announce = !lineForm.announce"
                        ><i /></button>
                    </div>
                </div>
            </section>
            <section v-else class="card">
                <div class="srow">
                    <div class="sic"><BoIcon name="bus" :size="17" /></div>
                    <div style="flex: 1 1 0%; min-width: 0">
                        <b>Ligne en service</b>
                        <p>Une ligne suspendue garde ses élèves mais n’en accueille plus de nouveaux.</p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0">
                        <button
                            type="button" class="sw" role="switch" :aria-checked="lineForm.active" :aria-pressed="lineForm.active"
                            aria-label="Ligne en service" @click="lineForm.active = !lineForm.active"
                        ><i /></button>
                    </div>
                </div>
            </section>
            <template #footer>
                <button type="button" class="btn gh" @click="lineOpen = false">Annuler</button>
                <div style="flex: 1 1 0%" />
                <button type="button" class="btn pr" :disabled="savingLine" @click="saveLine">{{ editingLine ? 'Enregistrer' : 'Créer la ligne' }}</button>
            </template>
        </BoModal>

        <!-- ============ Chauffeur ============ -->
        <BoModal
            v-if="driverOpen" :title="editingDriver ? `${editingDriver.lastName} ${editingDriver.firstName}` : 'Ajouter un chauffeur'"
            icon="user-check" :width="620" sub="Il pourra ensuite être affecté à une ligne" @close="driverOpen = false"
        >
            <div class="frm">
                <div class="fld" :class="{ bad: driverTried && (!nameParts.lastName || !nameParts.firstName) }">
                    <label for="driver-name">Nom et prénom *</label>
                    <input id="driver-name" v-model="driverForm.fullName" placeholder="Ex. KOFFI Jean-Marc" maxlength="128" />
                </div>
                <div class="fld" :class="{ bad: driverTried && !driverForm.phone.trim() }">
                    <label for="driver-phone">Téléphone *</label>
                    <input id="driver-phone" v-model="driverForm.phone" placeholder="07 00 00 00 00" inputmode="tel" maxlength="32" />
                </div>
                <div class="fld">
                    <label for="driver-category">Catégorie de permis</label>
                    <select id="driver-category" v-model="driverForm.licenseCategory">
                        <option v-for="c in LICENSE_CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
                    </select>
                </div>
                <div class="fld" :class="{ bad: driverTried && !driverForm.licenseExpiry }">
                    <label for="driver-expiry">Expiration du permis *</label>
                    <NelimaDateField id="driver-expiry" v-model="driverForm.licenseExpiry" />
                </div>
            </div>
            <div style="margin-top: 12px">
                <div style="font: 600 12px / 1 Inter; color: var(--tx2); margin-bottom: 8px">Pièces fournies · {{ driverForm.documents.length }}/{{ DRIVER_DOCUMENTS.length }}</div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap">
                    <button
                        v-for="d in DRIVER_DOCUMENTS" :key="d.value" type="button" class="chip"
                        :aria-pressed="driverForm.documents.includes(d.value)" @click="toggleDocument(d.value)"
                    >{{ d.label }}</button>
                </div>
            </div>
            <section v-if="editingDriver" class="card" style="margin-top: 14px">
                <div class="srow">
                    <div class="sic"><BoIcon name="user-check" :size="17" /></div>
                    <div style="flex: 1 1 0%; min-width: 0">
                        <b>Chauffeur actif</b>
                        <p>Un chauffeur inactif n’est plus proposé pour une ligne.</p>
                    </div>
                    <button
                        type="button" class="sw" role="switch" :aria-checked="driverForm.active" :aria-pressed="driverForm.active"
                        aria-label="Chauffeur actif" @click="driverForm.active = !driverForm.active"
                    ><i /></button>
                </div>
            </section>
            <p style="margin: 14px 0 0; font: 500 12px / 1.5 Inter; color: var(--tx3)">
                Le dossier est complet quand le téléphone, un permis en cours de validité et les quatre pièces sont renseignés.
            </p>
            <template #footer>
                <button type="button" class="btn gh" @click="driverOpen = false">Annuler</button>
                <div style="flex: 1 1 0%" />
                <button type="button" class="btn pr" @click="saveDriver">{{ editingDriver ? 'Enregistrer' : 'Ajouter le chauffeur' }}</button>
            </template>
        </BoModal>

        <!-- ============ Inscription d'un élève ============ -->
        <BoModal
            v-if="rideOpen && opened" title="Inscrire un élève au transport" icon="bus" :width="640"
            :sub="`${opened.name} · ${opened.itinerary}`" @close="rideOpen = false"
        >
            <div style="margin-bottom: 20px">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px"><p class="sec">1 · Élève</p></div>
                <div v-if="picked" class="sv-pick on">
                    <div class="nm">
                        <BoAvatar :name="`${picked.lastName} ${picked.firstName}`" :src="studentPhotoUrl(picked)" :size="30" />
                        <div><b>{{ picked.lastName }} {{ picked.firstName }}</b><span>{{ picked.schoolClass?.name ? `${picked.schoolClass.name} · ` : '' }}{{ picked.registrationNumber }}</span></div>
                    </div>
                    <button type="button" class="ic-btn" style="width: 28px; height: 28px; color: var(--tx2)" aria-label="Changer d’élève" @click="picked = null; findCandidates(studentQuery)"><BoIcon name="close" :size="15" /></button>
                </div>
                <template v-else>
                    <div class="inp" style="flex: 0 1 600px">
                        <BoIcon name="search" :size="15" />
                        <input v-model="studentQuery" placeholder="Nom, matricule ou classe…" aria-label="Rechercher un élève" style="width: 100%" />
                    </div>
                    <div v-if="candidates.length" class="sv-list">
                        <button v-for="s in candidates" :key="s.id" type="button" class="sv-pick" @click="picked = s; candidates = []">
                            <div class="nm">
                                <BoAvatar :name="`${s.lastName} ${s.firstName}`" :src="studentPhotoUrl(s)" :size="30" />
                                <div><b>{{ s.lastName }} {{ s.firstName }}</b><span>{{ s.schoolClass?.name ? `${s.schoolClass.name} · ` : '' }}{{ s.registrationNumber }}</span></div>
                            </div>
                            <BoIcon name="plus" :size="16" style="color: var(--pr)" />
                        </button>
                    </div>
                </template>
            </div>
            <div style="margin-bottom: 20px">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px"><p class="sec">2 · Arrêt</p></div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap">
                    <button
                        v-for="s in opened.stops" :key="s.id" type="button" class="chip"
                        :aria-pressed="rideStop === s.id" @click="rideStop = s.id!"
                    >{{ s.name }}{{ s.pickupTime ? ` · ${hhmm(s.pickupTime)}` : '' }}</button>
                </div>
                <div class="frm" style="margin-top: 12px">
                    <div class="fld">
                        <label for="ride-start">Premier trajet</label>
                        <NelimaDateField id="ride-start" v-model="rideStart" />
                    </div>
                    <div class="fld">
                        <label for="ride-billing">Facturation</label>
                        <select id="ride-billing" disabled><option>Mensuel</option></select>
                    </div>
                </div>
            </div>
            <div v-if="rideBilling" style="background: rgb(250, 251, 253); border: 1px solid var(--bd); border-radius: 12px; padding: 14px">
                <dl class="kv">
                    <dt>{{ opened.name }}</dt>
                    <dd><span class="nu">{{ fmt(opened.monthlyPrice) }} FCFA / mois</span></dd>
                    <dt>Reste de l’année ({{ rideBilling.months }} mois)</dt>
                    <dd><span class="nu">{{ fmt(rideBilling.total) }} FCFA</span></dd>
                    <dt>Facturation</dt>
                    <dd>{{ rideBilling.months }} {{ plural(rideBilling.months, 'échéance') }}, la première le {{ ddmm(rideBilling.firstDue) }}</dd>
                    <dt>Places</dt>
                    <dd>{{ opened.capacity - opened.riders }} {{ plural(opened.capacity - opened.riders, 'libre') }} sur {{ opened.capacity }}</dd>
                </dl>
            </div>
            <template #footer>
                <button type="button" class="btn gh" @click="rideOpen = false">Annuler</button>
                <button type="button" class="btn pr" :disabled="!picked || subscribing" @click="subscribe"><BoIcon name="check" :size="16" />Inscrire</button>
            </template>
        </BoModal>

        <!-- ============ Carte des arrêts ============ -->
        <BoModal
            v-if="mapOpen" title="Carte des arrêts" icon="map-pin" :width="1080"
            sub="Choisissez un arrêt à gauche, puis cliquez son emplacement sur la carte" @close="mapOpen = false"
        >
            <div class="sv-ed">
                <nav style="max-height: 460px; overflow-y: auto">
                    <template v-for="(entry, index) in mapLines" :key="entry.line.id">
                        <p class="sec" :style="{ margin: index ? '10px 0 4px' : '0 0 4px', color: LINE_COLORS[index % LINE_COLORS.length] }">{{ entry.line.name }}</p>
                        <button
                            v-for="s in entry.stops" :key="s.id" type="button" class="sv-day"
                            :aria-current="mapSelected === s.id ? 'page' : undefined" @click="mapSelected = s.id!"
                        >
                            <span><b>{{ s.name }}</b><em class="nu">{{ hhmm(s.pickupTime) || '—' }}</em></span>
                            <BoIcon v-if="s.latitude != null" name="map-pin" :size="16" style="color: var(--gr)" />
                            <span v-else class="sv-dot" />
                        </button>
                    </template>
                </nav>
                <ClientOnly>
                    <BoStopsMap :points="mapPoints" :selected="mapSelected" @place="place" />
                </ClientOnly>
            </div>
            <template #footer>
                <button type="button" class="btn gh" @click="mapOpen = false">Fermer</button>
                <div style="flex: 1 1 0%" />
                <button
                    v-if="can('transport:write')" type="button" class="btn pr"
                    :disabled="savingMap || !mapLines.some((e) => e.dirty)" @click="saveMap"
                ><BoIcon name="check" :size="16" />Enregistrer les emplacements</button>
            </template>
        </BoModal>
    </div>
</template>
