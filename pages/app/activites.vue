<script setup lang="ts">
import {
    ACTIVITY_KINDS, ACTIVITY_STATUSES, WEEK_DAYS, activityFillingRate, kindLabel, slotLabel, statusLabel,
    type Activity, type ActivityEnrollment, type ActivityKind, type ActivityStatus,
} from '~/composables/useActivities';
import { CYCLES, cycleLabel, type EducationCycle } from '~/composables/useStudents';
import { fullName, type StaffMember } from '~/composables/useStaff';
import type { SchoolClass } from '~/composables/useClasses';

/**
 * Activités extra-scolaires.
 *
 * Deux onglets, comme la maquette : le catalogue avec l'affectation aux classes à droite, et les
 * inscriptions.
 */
const { list, create, update, remove, assignClasses, enrollments, cancel } = useActivities();
const { list: listClasses } = useClasses();
const { list: listStaff } = useStaff();
const { can } = usePermissions();

const rows = ref<Activity[]>([]);
const classes = ref<SchoolClass[]>([]);
const coaches = ref<StaffMember[]>([]);
const lines = ref<ActivityEnrollment[]>([]);
const loading = ref(true);
const linesLoading = ref(false);
const error = ref('');

const tab = ref<'catalog' | 'enrollments'>('catalog');
const keyword = ref('');
const selectedKind = ref<ActivityKind | ''>('');

/** Activité dont on règle l'affectation, à droite du catalogue. */
const selected = ref<Activity | null>(null);
const opened = ref<Activity | null>(null);

const canWrite = computed(() => can('activity:write'));

const showForm = ref(false);
const editing = ref<Activity | null>(null);
const saving = ref(false);
const formError = ref('');
const form = reactive({
    name: '',
    kind: 'SPORT' as ActivityKind,
    place: '',
    dayOfWeek: '',
    startTime: '',
    endTime: '',
    periodLabel: '',
    capacity: '' as string | number,
    status: 'ACTIVE' as ActivityStatus,
    coachId: '',
    price: '' as string | number,
});

const filtered = computed(() => {
    const q = keyword.value.trim().toLowerCase();
    return rows.value.filter((row) => {
        if (selectedKind.value && row.kind !== selectedKind.value) return false;
        if (!q) return true;
        return row.name.toLowerCase().includes(q)
            || (row.coachName ?? '').toLowerCase().includes(q);
    });
});

const openCount = computed(() => rows.value.filter((r) => r.status === 'ACTIVE').length);
const draftCount = computed(() => rows.value.filter((r) => r.status === 'DRAFT').length);
const totalEnrolled = computed(() => rows.value.reduce((sum, r) => sum + r.enrolledCount, 0));
const totalWaitlisted = computed(() => rows.value.reduce((sum, r) => sum + r.waitlistedCount, 0));
const totalSeats = computed(() => rows.value.reduce((sum, r) => sum + r.capacity, 0));
const expectedRevenue = computed(() => rows.value
    .reduce((sum, r) => sum + Number(r.expectedRevenue ?? 0), 0));

/* ---- Affectation aux classes ---- */
const assignAll = ref(false);
const assignIds = ref<string[]>([]);
const assignSaving = ref(false);

/** Classes groupées par cycle, comme sur l'écran Classes — c'est la maille qu'on a retenue. */
const classesByCycle = computed(() => {
    const groups = CYCLES.map((cycle) => ({
        key: cycle.value as string,
        label: cycle.label,
        items: classes.value.filter((c) => c.cycle === cycle.value),
    })).filter((group) => group.items.length);

    const orphans = classes.value.filter((c) => !c.cycle);
    if (orphans.length) groups.push({ key: 'other', label: 'Autres niveaux', items: orphans });
    return groups;
});

const eligibleStudents = computed(() => {
    if (assignAll.value) return null;
    return classes.value
        .filter((c) => assignIds.value.includes(c.id))
        .reduce((sum, c) => sum + c.studentCount, 0);
});

function selectActivity(activity: Activity) {
    selected.value = activity;
    assignAll.value = activity.openToAll;
    assignIds.value = activity.eligibleClasses.map((c) => c.id);
}

function toggleClass(id: string) {
    assignAll.value = false;
    assignIds.value = assignIds.value.includes(id)
        ? assignIds.value.filter((x) => x !== id)
        : [...assignIds.value, id];
}

function toggleCycle(items: SchoolClass[]) {
    assignAll.value = false;
    const ids = items.map((c) => c.id);
    const complete = ids.every((id) => assignIds.value.includes(id));
    assignIds.value = complete
        ? assignIds.value.filter((id) => !ids.includes(id))
        : [...new Set([...assignIds.value, ...ids])];
}

async function saveAssignment() {
    if (!selected.value) return;
    error.value = '';
    assignSaving.value = true;
    try {
        await assignClasses(selected.value.id, {
            openToAll: assignAll.value,
            classIds: assignAll.value ? [] : assignIds.value,
        });
        await load();
        selected.value = rows.value.find((r) => r.id === selected.value?.id) ?? null;
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "L'affectation n'a pas pu être enregistrée.";
    } finally {
        assignSaving.value = false;
    }
}

/* ---- Catalogue ---- */
function openCreate() {
    editing.value = null;
    Object.assign(form, {
        name: '', kind: 'SPORT', place: '', dayOfWeek: '', startTime: '', endTime: '',
        periodLabel: '', capacity: '', status: 'ACTIVE', coachId: '', price: '',
    });
    formError.value = '';
    showForm.value = true;
}

function openEdit(activity: Activity) {
    editing.value = activity;
    Object.assign(form, {
        name: activity.name,
        kind: activity.kind,
        place: activity.place ?? '',
        dayOfWeek: activity.dayOfWeek ?? '',
        startTime: activity.startTime?.slice(0, 5) ?? '',
        endTime: activity.endTime?.slice(0, 5) ?? '',
        periodLabel: activity.periodLabel ?? '',
        capacity: activity.capacity,
        status: activity.status,
        coachId: activity.coachId ?? '',
        price: activity.price ?? '',
    });
    formError.value = '';
    showForm.value = true;
}

async function load() {
    loading.value = true;
    error.value = '';
    try {
        rows.value = await list();
        if (selected.value) {
            const again = rows.value.find((r) => r.id === selected.value?.id);
            if (again) selectActivity(again);
        }
    } catch {
        error.value = "Les activités n'ont pas pu être chargées.";
    } finally {
        loading.value = false;
    }
}

async function loadEnrollments() {
    linesLoading.value = true;
    try {
        lines.value = await enrollments();
    } catch {
        error.value = "Les inscriptions n'ont pas pu être chargées.";
    } finally {
        linesLoading.value = false;
    }
}

async function submit() {
    formError.value = '';
    saving.value = true;
    try {
        const body = {
            name: form.name,
            kind: form.kind,
            place: form.place || undefined,
            dayOfWeek: form.dayOfWeek || undefined,
            startTime: form.startTime || undefined,
            endTime: form.endTime || undefined,
            periodLabel: form.periodLabel || undefined,
            capacity: Number(form.capacity),
            status: form.status,
            coachId: form.coachId || undefined,
            price: form.price !== '' ? Number(form.price) : undefined,
        };
        if (editing.value) await update(editing.value.id, body);
        else await create(body);
        showForm.value = false;
        await load();
    } catch (e: any) {
        formError.value = e?.data?.debugMessage ?? "L'activité n'a pas pu être enregistrée.";
    } finally {
        saving.value = false;
    }
}

async function destroy(activity: Activity) {
    error.value = '';
    try {
        await remove(activity.id);
        if (selected.value?.id === activity.id) selected.value = null;
        await load();
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "L'activité n'a pas pu être retirée.";
    }
}

async function cancelEnrollment(line: ActivityEnrollment) {
    error.value = '';
    try {
        await cancel(line.activityId, line.studentId);
        await Promise.all([load(), loadEnrollments()]);
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "L'inscription n'a pas pu être annulée.";
    }
}

async function refresh() {
    await load();
    if (opened.value) {
        opened.value = rows.value.find((r) => r.id === opened.value?.id) ?? null;
    }
    if (tab.value === 'enrollments') await loadEnrollments();
}

watch(tab, (value) => {
    if (value === 'enrollments') loadEnrollments();
});

onMounted(async () => {
    try {
        classes.value = await listClasses();
    } catch {
        classes.value = [];
    }
    try {
        coaches.value = (await listStaff()).filter((m) => m.role !== 'SUPPORT');
    } catch {
        coaches.value = [];
    }
    await load();
});
</script>

<template>
    <div>
        <PageHead
            title="Activités extra-scolaires"
            :sub="rows.length
                ? `${rows.length} activité${rows.length > 1 ? 's' : ''} · ${totalEnrolled} inscription${totalEnrolled > 1 ? 's' : ''}`
                : 'Sport, art et culture, langues, soutien scolaire'"
        >
            <template #actions>
                <button v-if="canWrite" class="btn-primary" @click="openCreate">
                    Nouvelle activité
                </button>
            </template>
        </PageHead>

        <p v-if="error" class="alert-danger mb-3.5" role="alert">{{ error }}</p>

        <UiCard
            v-if="showForm" class="mb-3.5"
            :title="editing ? `Modifier ${editing.name}` : 'Nouvelle activité'"
            sub="Le tarif est facultatif : une activité gratuite ne crée aucune dette"
        >
            <form @submit.prevent="submit">
                <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                        <label class="field-label" for="name">Intitulé</label>
                        <input
                            id="name" v-model="form.name" type="text" required
                            placeholder="Judo" class="input"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="kind">Famille</label>
                        <select id="kind" v-model="form.kind" class="select">
                            <option v-for="kind in ACTIVITY_KINDS" :key="kind.value" :value="kind.value">
                                {{ kind.label }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="field-label" for="coach">Encadrant</label>
                        <select id="coach" v-model="form.coachId" class="select">
                            <option value="">À désigner</option>
                            <option v-for="coach in coaches" :key="coach.id" :value="coach.id">
                                {{ fullName(coach) }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="field-label" for="place">Lieu</label>
                        <input
                            id="place" v-model="form.place" type="text"
                            placeholder="Gymnase" class="input"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="day">Jour</label>
                        <select id="day" v-model="form.dayOfWeek" class="select">
                            <option value="">À fixer</option>
                            <option v-for="day in WEEK_DAYS" :key="day.value" :value="day.value">
                                {{ day.label }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="field-label" for="start">Début</label>
                        <input id="start" v-model="form.startTime" type="time" class="input" />
                    </div>
                    <div>
                        <label class="field-label" for="end">Fin</label>
                        <input id="end" v-model="form.endTime" type="time" class="input" />
                    </div>
                    <div>
                        <label class="field-label" for="period">Période</label>
                        <input
                            id="period" v-model="form.periodLabel" type="text"
                            placeholder="Année complète" class="input"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="capacity">Places</label>
                        <input
                            id="capacity" v-model="form.capacity" type="number" min="1" max="500"
                            required class="input"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="price">Tarif (FCFA)</label>
                        <input
                            id="price" v-model="form.price" type="number" min="0" class="input"
                            placeholder="gratuite si vide"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="status">État</label>
                        <select id="status" v-model="form.status" class="select">
                            <option
                                v-for="status in ACTIVITY_STATUSES" :key="status.value"
                                :value="status.value"
                            >{{ status.label }}</option>
                        </select>
                    </div>
                </div>

                <p v-if="formError" class="alert-danger mt-4" role="alert">{{ formError }}</p>

                <div class="flex gap-2 mt-4">
                    <button
                        type="submit" class="btn-primary" :disabled="saving || !form.name || !form.capacity"
                    >{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
                    <button type="button" class="btn-secondary" @click="showForm = false">
                        Annuler
                    </button>
                </div>
            </form>
        </UiCard>

        <div class="grid-12 mb-3.5">
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">Activités proposées</span>
                <span class="kpi-value">{{ openCount }}<small>ouvertes</small></span>
                <span class="kpi-foot">
                    {{ draftCount }} en brouillon
                    <!-- Les brouillons ne sont pas visibles des familles : le dire évite de croire
                         qu'une activité préparée est déjà proposée. -->
                </span>
            </div>
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">Élèves inscrits</span>
                <span class="kpi-value">{{ totalEnrolled }}<small>inscrits</small></span>
                <span class="kpi-foot">
                    <template v-if="totalWaitlisted">{{ totalWaitlisted }} en liste d'attente</template>
                    <template v-else>aucune attente</template>
                </span>
            </div>
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">Taux de remplissage</span>
                <span class="kpi-value">
                    {{ totalSeats ? Math.round(totalEnrolled / totalSeats * 100) : 0 }}<small>%</small>
                </span>
                <span class="kpi-foot">{{ totalEnrolled }} places sur {{ totalSeats }}</span>
            </div>
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">Recettes attendues</span>
                <span class="kpi-value">
                    {{ Math.round(expectedRevenue).toLocaleString('fr-FR') }}<small>FCFA</small>
                </span>
                <span class="kpi-foot">sur les inscriptions en cours</span>
            </div>
        </div>

        <UiCard :pad="false">
            <div class="tbar">
                <div class="flex items-center gap-2">
                    <button class="chip" :aria-pressed="tab === 'catalog'" @click="tab = 'catalog'">
                        Catalogue
                    </button>
                    <button
                        class="chip" :aria-pressed="tab === 'enrollments'"
                        @click="tab = 'enrollments'"
                    >Inscriptions</button>
                </div>
            </div>

            <template v-if="tab === 'catalog'">
                <div class="tbar">
                    <label class="inp" style="flex: 0 1 240px">
                        <svg
                            class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round"
                        >
                            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                        </svg>
                        <input
                            v-model="keyword" type="search" class="w-full"
                            placeholder="Activité ou encadrant…" aria-label="Rechercher une activité"
                        />
                    </label>

                    <div class="flex items-center gap-2 flex-wrap">
                        <button class="chip" :aria-pressed="!selectedKind" @click="selectedKind = ''">
                            Toutes
                        </button>
                        <button
                            v-for="kind in ACTIVITY_KINDS" :key="kind.value" class="chip"
                            :aria-pressed="selectedKind === kind.value"
                            @click="selectedKind = kind.value"
                        >{{ kind.label }}</button>
                    </div>
                </div>

                <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Activité</th>
                                <th>Créneau</th>
                                <th>Encadrant</th>
                                <th>Classes</th>
                                <th style="width: 170px">Places</th>
                                <th class="text-right">Tarif</th>
                                <th>État</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="loading">
                                <td colspan="8" class="py-8 text-center" style="color: var(--text-faint)">
                                    Chargement…
                                </td>
                            </tr>
                            <tr
                                v-for="row in filtered" v-else :key="row.id" class="cursor-pointer"
                                :style="selected?.id === row.id ? 'background: var(--brand-50)' : ''"
                                @click="selectActivity(row)" @dblclick="opened = row"
                            >
                                <td>
                                    <b class="text-sm font-extrabold" style="color: var(--navy)">
                                        {{ row.name }}
                                    </b>
                                    <div class="text-[11.5px]" style="color: var(--text-faint)">
                                        {{ kindLabel(row.kind) }}{{ row.place ? ` · ${row.place}` : '' }}
                                    </div>
                                </td>
                                <td class="text-[12.5px]" style="color: var(--text-muted)">
                                    {{ slotLabel(row) }}
                                </td>
                                <td class="text-[12.5px] font-semibold" style="color: var(--text)">
                                    {{ row.coachName ?? 'à désigner' }}
                                </td>
                                <td class="text-[12.5px]" style="color: var(--text-muted)">
                                    <span v-if="row.openToAll" class="tag">Toutes</span>
                                    <template v-else-if="row.eligibleClasses.length">
                                        {{ row.eligibleClasses.map((c) => c.name).join(', ') }}
                                    </template>
                                    <span v-else style="color: var(--text-faint)">Aucune</span>
                                </td>
                                <td>
                                    <div class="flex items-center gap-2.5">
                                        <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background: var(--surface-sunken)">
                                            <i
                                                class="block h-full rounded-full"
                                                :style="{
                                                    width: `${Math.min(100, activityFillingRate(row))}%`,
                                                    background: row.enrolledCount >= row.capacity
                                                        ? 'var(--danger-solid)'
                                                        : activityFillingRate(row) > 85
                                                            ? 'var(--warning-solid)' : 'var(--brand-600)',
                                                }"
                                            />
                                        </div>
                                        <span class="nu text-[12px] font-bold" style="min-width: 44px; text-align: right">
                                            {{ row.enrolledCount }}/{{ row.capacity }}
                                        </span>
                                    </div>
                                    <div
                                        v-if="row.waitlistedCount" class="text-[11px] mt-1"
                                        style="color: var(--text-faint)"
                                    >{{ row.waitlistedCount }} en attente</div>
                                </td>
                                <td class="num">
                                    {{ row.price
                                        ? `${Math.round(Number(row.price)).toLocaleString('fr-FR')} F`
                                        : 'gratuite' }}
                                </td>
                                <td>
                                    <span
                                        class="tag"
                                        :style="row.status === 'ACTIVE' ? '' : 'color: var(--text-faint)'"
                                    >{{ statusLabel(row.status) }}</span>
                                </td>
                                <td class="text-right whitespace-nowrap">
                                    <button v-if="canWrite" class="btn-ghost btn-sm" @click.stop="openEdit(row)">
                                        Modifier
                                    </button>
                                    <button v-if="canWrite" class="btn-ghost btn-sm" @click.stop="destroy(row)">
                                        Retirer
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <EmptyState
                    v-if="!loading && !filtered.length && (keyword || selectedKind)"
                    title="Aucun résultat"
                    text="Aucune activité ne correspond à ce filtre."
                />
                <EmptyState
                    v-else-if="!loading && !filtered.length"
                    title="Aucune activité"
                    text="Créez vos activités extra-scolaires, puis désignez les classes conviées ou ouvrez-les à tout l'établissement."
                />
            </template>

            <template v-else>
                <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Élève</th>
                                <th>Classe</th>
                                <th>Activité</th>
                                <th>Demandée le</th>
                                <th>Origine</th>
                                <th class="text-right">Montant</th>
                                <th>État</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="linesLoading">
                                <td colspan="8" class="py-8 text-center" style="color: var(--text-faint)">
                                    Chargement…
                                </td>
                            </tr>
                            <tr v-for="line in lines" v-else :key="line.id">
                                <td>
                                    <div class="flex items-center gap-2.5">
                                        <AvatarBadge
                                            :name="`${line.studentLastName} ${line.studentFirstName}`"
                                            :size="34"
                                        />
                                        <div>
                                            <b class="text-sm font-extrabold" style="color: var(--navy)">
                                                {{ line.studentLastName }} {{ line.studentFirstName }}
                                            </b>
                                            <div class="nu text-[11.5px]" style="color: var(--text-faint)">
                                                {{ line.studentRegistrationNumber ?? '—' }}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td><span class="tag">{{ line.className ?? '—' }}</span></td>
                                <td class="text-[12.5px] font-semibold" style="color: var(--text)">
                                    {{ line.activityName }}
                                </td>
                                <td class="nu text-[12px]" style="color: var(--text-faint)">
                                    {{ new Date(line.requestedAt).toLocaleDateString('fr-FR') }}
                                </td>
                                <td class="text-[12.5px]" style="color: var(--text-muted)">
                                    {{ line.source === 'PARENT' ? 'Famille' : 'Secrétariat' }}
                                </td>
                                <td class="num">
                                    {{ line.amountDue
                                        ? `${Math.round(Number(line.amountDue)).toLocaleString('fr-FR')} F`
                                        : '—' }}
                                </td>
                                <td
                                    class="text-[12.5px] font-semibold"
                                    :style="line.status === 'ENROLLED' ? 'color: var(--text)'
                                        : line.status === 'WAITLISTED' ? 'color: var(--warning)'
                                            : 'color: var(--text-faint)'"
                                >
                                    {{ line.status === 'ENROLLED' ? 'Inscrit'
                                        : line.status === 'WAITLISTED' ? 'En attente' : 'Annulée' }}
                                </td>
                                <td class="text-right whitespace-nowrap">
                                    <!-- Une inscription déjà encaissée ne s'annule pas : le bouton
                                         disparaît plutôt que d'échouer une fois cliqué. -->
                                    <button
                                        v-if="canWrite && line.status !== 'CANCELLED' && !line.partiallyPaid"
                                        class="btn-ghost btn-sm" @click="cancelEnrollment(line)"
                                    >Annuler</button>
                                    <span
                                        v-else-if="line.partiallyPaid" class="text-[12px]"
                                        style="color: var(--text-faint)"
                                    >encaissée</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <EmptyState
                    v-if="!linesLoading && !lines.length"
                    title="Aucune inscription"
                    text="Les inscriptions du secrétariat et les demandes des familles apparaissent ici."
                />
            </template>

            <template #footer>
                <span class="text-[12px]" style="color: var(--text-faint)">
                    <b class="nu" style="color: var(--navy)">
                        {{ tab === 'catalog' ? filtered.length : lines.length }}
                    </b>
                    {{ tab === 'catalog' ? 'activité(s)' : 'inscription(s)' }}
                </span>
                <span
                    v-if="tab === 'catalog'" class="text-[12px]" style="color: var(--text-faint)"
                >Double-cliquez sur une activité pour ouvrir sa fiche</span>
            </template>
        </UiCard>

        <UiCard
            v-if="tab === 'catalog' && canWrite" class="mt-3.5"
            title="Affectation aux classes"
            :sub="selected ? selected.name : 'Sélectionnez une activité du catalogue'"
        >
            <template v-if="selected">
                <label
                    class="flex items-center gap-3 p-3 rounded-xl mb-3.5 cursor-pointer"
                    style="border: 1px solid var(--border)"
                    :style="assignAll ? 'background: var(--brand-50)' : ''"
                >
                    <input v-model="assignAll" type="checkbox" />
                    <span class="flex-1">
                        <b class="text-[13px]" style="color: var(--navy)">Toutes les classes</b>
                        <span class="block text-[11.5px]" style="color: var(--text-faint)">
                            L'activité est proposée à l'ensemble de l'établissement, y compris aux
                            classes créées par la suite
                        </span>
                    </span>
                </label>

                <div :style="assignAll ? 'opacity: .4; pointer-events: none' : ''">
                    <div v-for="group in classesByCycle" :key="group.key" class="mb-3.5">
                        <div class="flex items-center justify-between mb-2">
                            <span class="sec" style="margin: 0">{{ group.label }}</span>
                            <button
                                class="text-[11.5px] font-bold" style="color: var(--brand-600)"
                                @click="toggleCycle(group.items)"
                            >Tout le cycle</button>
                        </div>
                        <div class="flex gap-1.5 flex-wrap">
                            <button
                                v-for="schoolClass in group.items" :key="schoolClass.id" class="chip"
                                :aria-pressed="assignIds.includes(schoolClass.id)"
                                @click="toggleClass(schoolClass.id)"
                            >{{ schoolClass.name }}</button>
                        </div>
                    </div>
                    <p v-if="!classesByCycle.length" class="text-[12.5px]" style="color: var(--text-faint)">
                        Aucune classe déclarée : ouvrez l'activité à tout l'établissement, ou créez
                        vos classes d'abord.
                    </p>
                </div>

                <div class="flex items-center gap-3 mt-4">
                    <button class="btn-primary" :disabled="assignSaving" @click="saveAssignment">
                        {{ assignSaving ? 'Enregistrement…' : 'Enregistrer l’affectation' }}
                    </button>
                    <span class="text-[12px]" style="color: var(--text-faint)">
                        <template v-if="assignAll">tout l'établissement est convié</template>
                        <template v-else>
                            <b class="nu" style="color: var(--navy)">{{ assignIds.length }}</b>
                            classe(s) ·
                            <b class="nu" style="color: var(--navy)">{{ eligibleStudents }}</b>
                            élève(s) éligibles
                        </template>
                    </span>
                </div>
            </template>
            <EmptyState
                v-else
                title="Aucune activité sélectionnée"
                text="Cliquez sur une activité du catalogue pour choisir les classes qui peuvent y participer."
            />
        </UiCard>

        <ActivityDrawer
            v-if="opened" :activity="opened"
            @close="opened = null" @changed="refresh"
        />
    </div>
</template>
