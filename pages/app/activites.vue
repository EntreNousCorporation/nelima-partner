<script setup lang="ts">
import {
    ACTIVITY_KINDS, ACTIVITY_STATUSES, WEEK_DAYS, activityFillingRate, dayLabel, kindIcon,
    kindLabel, kindTone, statusLabel,
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

/**
 * Nature de l'activité d'une inscription.
 *
 * La ligne d'inscription ne porte que le nom de l'activité ; la pastille de couleur se retrouve
 * donc par le catalogue déjà chargé. Faute de correspondance — une activité retirée depuis —, la
 * teinte neutre s'applique plutôt qu'une couleur prise au hasard.
 */
function activityKindOf(line: ActivityEnrollment) {
    return rows.value.find((activity) => activity.id === line.activityId)?.kind ?? null;
}

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

/**
 * Ce qui cloche dans le créneau, ou rien.
 *
 * <p>Les deux listes ne rendent que des heures qui existent ; restent les deux fautes qu'elles ne
 * peuvent pas voir. La fin avant le début, et le début seul — le catalogue afficherait « 16:00 – »
 * sans fin. Le serveur refuse les mêmes deux cas ; ici c'est pour le dire avant d'envoyer.
 */
const slotError = computed(() => {
    const { startTime: start, endTime: end } = form;
    if (!start && !end) return '';
    if (!start || !end) return 'Indiquez le début et la fin, ou laissez le créneau à fixer.';
    // Deux « HH:mm » se comparent comme deux mots : les chiffres sont à rang fixe.
    if (end <= start) return 'La fin doit venir après le début.';
    return '';
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
    if (slotError.value) {
        formError.value = slotError.value;
        return;
    }
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
                <NuxtLink to="/app/calendrier" class="btn-secondary">
                    <BoIcon name="calendar" :size="16" />Planning
                </NuxtLink>
                <button v-if="canWrite" class="btn-primary" @click="openCreate">
                    <BoIcon name="plus" :size="16" />Nouvelle activité
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
                        <select id="kind" v-model="form.kind" required class="select">
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
                        <NelimaTimeField id="start" v-model="form.startTime" />
                    </div>
                    <div>
                        <label class="field-label" for="end">Fin</label>
                        <NelimaTimeField id="end" v-model="form.endTime" />
                        <p
                            v-if="slotError" class="mt-1 text-[12px]" role="alert"
                            style="color: var(--danger)"
                        >{{ slotError }}</p>
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
                        type="submit" class="btn-primary"
                        :disabled="saving || !form.name || !form.capacity || !!slotError"
                    >
                        <BoIcon name="check" :size="16" />{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
                    <button type="button" class="btn-secondary" @click="showForm = false">
                        Annuler
                    </button>
                </div>
            </form>
        </UiCard>

        <!-- Les brouillons ne sont pas visibles des familles : le dire évite de croire qu'une
             activité préparée est déjà proposée. -->
        <nav class="sub-nav">
            <button
                :aria-current="tab === 'catalog' ? 'page' : undefined" @click="tab = 'catalog'"
            >Catalogue</button>
            <button
                :aria-current="tab === 'enrollments' ? 'page' : undefined"
                @click="tab = 'enrollments'"
            >Inscriptions</button>
        </nav>

        <div class="grid-12 mb-3.5">
            <KpiCard
                class="c3" label="Activités proposées" icon="sparkles"
                tip="Activités ouvertes aux inscriptions. Les brouillons ne sont pas visibles des familles."
                :value="String(openCount)" unit="ouvertes"
                :foot="`${draftCount} en brouillon`"
            />
            <KpiCard
                class="c3" label="Élèves inscrits" icon="students"
                tip="Inscriptions confirmées, hors liste d'attente. Une place en attente ne crée aucune dette."
                :value="String(totalEnrolled)" unit="inscrits"
                :foot="totalWaitlisted ? `${totalWaitlisted} en liste d'attente` : 'aucune attente'"
            />
            <KpiCard
                class="c3" label="Taux de remplissage" icon="percent"
                tip="Places prises rapportées aux capacités déclarées, toutes activités confondues."
                :value="String(totalSeats ? Math.round(totalEnrolled / totalSeats * 100) : 0)" unit="%"
                :foot="`${totalEnrolled} places sur ${totalSeats}`"
            >
                <template #chart>
                    <StatDonut
                        v-if="totalSeats" :percent="totalEnrolled / totalSeats * 100"
                        tone="var(--brand-600)"
                    />
                </template>
            </KpiCard>
            <KpiCard
                class="c3" label="Recettes attendues" icon="cash"
                tip="Tarif multiplié par le nombre d'inscrits, sur les seules inscriptions confirmées."
                :value="fm(expectedRevenue)" unit="FCFA"
                foot="sur les inscriptions en cours"
            />
        </div>


        <!-- ============ Catalogue ============ -->
        <!-- Deux colonnes, comme la maquette : le catalogue à gauche, l'affectation de l'activité
             sélectionnée à droite. Empilées, on perdait le lien entre la ligne cliquée et le
             panneau qui la concerne — il fallait défiler pour voir ce qu'on venait de choisir. -->
        <div v-if="tab === 'catalog'" class="grid-12">
            <UiCard
                class="c8" :pad="false"
                title="Catalogue des activités"
                sub="Cliquez sur une activité pour choisir les classes conviées"
                tip="Une activité peut être ouverte à tout l'établissement ou réservée à certaines classes. Un double-clic ouvre sa fiche complète."
            >
                <div class="tbar">
                    <label class="inp" style="flex: 0 1 240px">
                        <BoIcon name="search" :size="15" />
                        <input
                            v-model="keyword" type="search" class="w-full"
                            placeholder="Activité ou encadrant…" aria-label="Rechercher une activité"
                        />
                    </label>

                    <div class="flex items-center gap-1.5 flex-wrap">
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
                                <th style="width: 150px">Places</th>
                                <th class="r">Tarif</th>
                                <th>Statut</th>
                            </tr>
                        </thead>
                        <tbody>
                            <TableSkeleton v-if="loading" :columns="7" />
                            <tr
                                v-for="row in filtered" v-else :key="row.id" class="cl"
                                :aria-selected="selected?.id === row.id"
                                @click="selectActivity(row)" @dblclick="opened = row"
                            >
                                <td>
                                    <div class="flex items-center gap-2.5">
                                        <!-- La pastille porte la nature : sur dix lignes, on repère
                                             le sport avant d'avoir lu le libellé. -->
                                        <span
                                            class="w-8 h-8 rounded-[10px] grid place-items-center shrink-0"
                                            :style="kindTone(row.kind)"
                                        ><BoIcon :name="kindIcon(row.kind)" :size="17" /></span>
                                        <div class="min-w-0">
                                            <b class="block text-[13px] font-bold leading-tight" style="color: var(--navy)">
                                                {{ row.name }}
                                            </b>
                                            <span class="text-[11.5px]" style="color: var(--text-faint)">
                                                {{ kindLabel(row.kind) }}{{ row.place ? ` · ${row.place}` : '' }}
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <b class="block text-[12.5px] font-semibold" style="color: var(--text)">
                                        {{ dayLabel(row.dayOfWeek) }}
                                    </b>
                                    <span
                                        v-if="row.startTime" class="nu text-[11.5px]"
                                        style="color: var(--text-faint)"
                                    >{{ row.startTime.slice(0, 5) }} – {{ (row.endTime ?? '').slice(0, 5) }}</span>
                                </td>
                                <td class="text-[12.5px]" style="color: var(--text-muted)">
                                    {{ row.coachName ?? 'à désigner' }}
                                </td>
                                <td>
                                    <UiPill v-if="row.openToAll" tone="info">
                                        <BoIcon name="check" :size="12" :stroke-width="2.2" />Toutes
                                    </UiPill>
                                    <div v-else-if="row.eligibleClasses.length" class="flex gap-1 flex-wrap">
                                        <span
                                            v-for="schoolClass in row.eligibleClasses.slice(0, 2)"
                                            :key="schoolClass.id" class="tag"
                                        >{{ schoolClass.name }}</span>
                                        <span v-if="row.eligibleClasses.length > 2" class="tag">
                                            +{{ row.eligibleClasses.length - 2 }}
                                        </span>
                                    </div>
                                    <span v-else class="text-[12px]" style="color: var(--text-faint)">Aucune</span>
                                </td>
                                <td>
                                    <div class="flex items-center gap-2.5">
                                        <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background: var(--surface-sunken)">
                                            <i
                                                class="block h-full rounded-full"
                                                :style="{
                                                    width: `${Math.max(2, Math.min(100, activityFillingRate(row)))}%`,
                                                    background: row.enrolledCount >= row.capacity
                                                        ? 'var(--danger-solid)'
                                                        : activityFillingRate(row) > 85
                                                            ? 'var(--warning-solid)' : 'var(--success-solid)',
                                                }"
                                            />
                                        </div>
                                        <span
                                            class="nu text-[12px] font-bold text-right"
                                            :style="{
                                                minWidth: '42px',
                                                color: row.enrolledCount >= row.capacity
                                                    ? 'var(--danger)' : 'var(--text-muted)',
                                            }"
                                        >{{ row.enrolledCount }}/{{ row.capacity }}</span>
                                    </div>
                                    <div
                                        v-if="row.waitlistedCount" class="text-[11px] mt-1"
                                        style="color: var(--text-faint)"
                                    >{{ row.waitlistedCount }} en attente</div>
                                </td>
                                <td class="num">
                                    {{ row.price ? `${fm(Number(row.price))} F` : 'gratuite' }}
                                </td>
                                <td>
                                    <UiPill :tone="row.status === 'ACTIVE' ? 'ok' : 'mute'">
                                        {{ statusLabel(row.status) }}
                                    </UiPill>
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

                <template #footer>
                    <span class="text-[12px]" style="color: var(--text-faint)">
                        <b class="nu" style="color: var(--navy)">{{ filtered.length }}</b>
                        activité(s)
                    </span>
                    <span class="text-[12px]" style="color: var(--text-faint)">
                        Double-cliquez sur une activité pour ouvrir sa fiche
                    </span>
                </template>
            </UiCard>

            <!-- ============ Affectation aux classes ============ -->
            <UiCard
                class="c4" :pad="false"
                title="Affectation aux classes"
                :sub="selected ? selected.name : 'Sélectionnez une activité'"
            >
                <template v-if="selected && canWrite" #action>
                    <button class="btn-primary btn-sm" :disabled="assignSaving" @click="saveAssignment">
                        <BoIcon name="check" :size="15" />
                        {{ assignSaving ? 'Enregistrement…' : 'Enregistrer' }}
                    </button>
                </template>

                <EmptyState
                    v-if="!selected"
                    title="Aucune activité sélectionnée"
                    text="Cliquez sur une activité du catalogue pour choisir les classes qui peuvent y participer."
                />

                <template v-else>
                    <div
                        class="flex items-center gap-3 px-4 py-3"
                        style="border-bottom: 1px solid var(--border)"
                        :style="assignAll ? 'background: var(--brand-50)' : ''"
                    >
                        <div class="flex-1 min-w-0">
                            <b class="block text-[13px]" style="color: var(--navy)">Toutes les classes</b>
                            <span class="text-[11.5px]" style="color: var(--text-faint)">
                                L'activité est proposée à l'ensemble de l'établissement, y compris
                                aux classes créées par la suite
                            </span>
                        </div>
                        <UiSwitch v-model="assignAll" :disabled="!canWrite" />
                    </div>

                    <div
                        class="p-4 flex flex-col gap-4"
                        :style="assignAll ? 'opacity: .4; pointer-events: none' : ''"
                    >
                        <div v-for="group in classesByCycle" :key="group.key">
                            <div class="flex items-center justify-between mb-2">
                                <span class="sec" style="margin: 0">{{ group.label }}</span>
                                <button
                                    class="text-[11.5px] font-bold" style="color: var(--brand-600)"
                                    @click="toggleCycle(group.items)"
                                >Tout le niveau</button>
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
                            Aucune classe déclarée : ouvrez l'activité à tout l'établissement, ou
                            créez vos classes d'abord.
                        </p>
                    </div>

                </template>

                <template v-if="selected" #footer>
                    <span class="text-[12px]" style="color: var(--text-faint)">
                        <template v-if="assignAll">Tout l'établissement est convié</template>
                        <template v-else>
                            <b class="nu" style="color: var(--navy)">{{ assignIds.length }}</b>
                            classe(s) ·
                            <b class="nu" style="color: var(--navy)">{{ eligibleStudents }}</b>
                            élève(s) éligibles
                        </template>
                    </span>
                </template>
            </UiCard>
        </div>

        <!-- ============ Inscriptions ============ -->
        <UiCard
            v-else :pad="false"
            title="Inscriptions"
            sub="Saisies par le secrétariat et demandes reçues des familles"
        >
            <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Élève</th>
                            <th>Classe</th>
                            <th>Activité</th>
                            <th>Demandée le</th>
                            <th>Origine</th>
                            <th class="r">Montant</th>
                            <th>État</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <TableSkeleton v-if="linesLoading" :columns="8" />
                        <tr v-for="line in lines" v-else :key="line.id">
                            <td>
                                <div class="flex items-center gap-2.5">
                                    <AvatarBadge
                                        :name="`${line.studentLastName} ${line.studentFirstName}`"
                                        :size="30"
                                    />
                                    <div class="nm min-w-0">
                                        <b>{{ line.studentLastName }} {{ line.studentFirstName }}</b>
                                        <span class="nu">{{ line.studentRegistrationNumber ?? '—' }}</span>
                                    </div>
                                </div>
                            </td>
                            <td><span class="tag">{{ line.className ?? '—' }}</span></td>
                            <td>
                                <span class="inline-flex items-center gap-2 text-[12.5px] font-semibold" style="color: var(--navy)">
                                    <i
                                        class="w-2 h-2 rounded-sm shrink-0"
                                        :style="{ background: kindTone(activityKindOf(line)).color }"
                                    />{{ line.activityName }}
                                </span>
                            </td>
                            <td class="nu text-[12px]" style="color: var(--text-faint)">
                                {{ new Date(line.requestedAt).toLocaleDateString('fr-FR') }}
                            </td>
                            <td class="text-[12.5px]" style="color: var(--text-muted)">
                                {{ line.source === 'PARENT' ? 'Famille' : 'Secrétariat' }}
                            </td>
                            <td class="num">
                                {{ line.amountDue ? `${fm(Number(line.amountDue))} F` : '—' }}
                            </td>
                            <td>
                                <UiPill
                                    :tone="line.status === 'ENROLLED' ? 'ok'
                                        : line.status === 'WAITLISTED' ? 'warn' : 'mute'"
                                >
                                    {{ line.status === 'ENROLLED' ? 'Inscrit'
                                        : line.status === 'WAITLISTED' ? 'En attente' : 'Annulée' }}
                                </UiPill>
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

            <template #footer>
                <span class="text-[12px]" style="color: var(--text-faint)">
                    <b class="nu" style="color: var(--navy)">{{ lines.length }}</b> inscription(s)
                </span>
            </template>
        </UiCard>

        <ActivityDrawer
            v-if="opened" :activity="opened"
            @close="opened = null" @changed="refresh"
        />
    </div>
</template>
