<script setup lang="ts">
import {
    ENTRY_KINDS, MONTHS, WEEK_DAY_LABELS, isoDate, kindLabel, kindTone, monthCells,
    type CalendarEntry, type CalendarEntryKind, type SchoolEventKind,
} from '~/composables/useCalendar';
import { CYCLES, type EducationCycle } from '~/composables/useStudents';
import type { SchoolClass } from '~/composables/useClasses';

/**
 * Calendrier scolaire : la vie scolaire, les examens et les échéances d'argent sur une grille.
 *
 * Les échéances ne se saisissent pas — elles viennent des tranches dues. Une école qui n'a rien
 * créé voit donc déjà son calendrier rempli, et c'est voulu.
 */
const { list, create, update, remove, notifyFamilies, exportUrl } = useCalendar();
const { list: listClasses } = useClasses();
const { can } = usePermissions();

const today = new Date();
const year = ref(today.getFullYear());
const month = ref(today.getMonth());

const entries = ref<CalendarEntry[]>([]);
const classes = ref<SchoolClass[]>([]);
const loading = ref(true);
const error = ref('');

const shownKinds = ref<CalendarEntryKind[]>(['SCHOOL_LIFE', 'FEE_DUE', 'EXAM']);
const opened = ref<CalendarEntry | null>(null);

const canWrite = computed(() => can('calendar:write'));
const canReadAmounts = computed(() => can('fee:read'));

const cells = computed(() => monthCells(year.value, month.value));

/** Bornes envoyées au serveur : la grille déborde sur les mois voisins, la requête aussi. */
const range = computed(() => ({
    from: cells.value[0]?.date ?? isoDate(new Date(year.value, month.value, 1)),
    to: cells.value[cells.value.length - 1]?.date
        ?? isoDate(new Date(year.value, month.value + 1, 0)),
}));

const visible = computed(() => entries.value.filter((e) => shownKinds.value.includes(e.kind)));

const byDate = computed(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of visible.value) {
        const bucket = map.get(entry.date) ?? [];
        bucket.push(entry);
        map.set(entry.date, bucket);
    }
    return map;
});

/** Entrées du mois affiché seulement : les débords voisins n'ont rien à faire dans « À venir ». */
const inMonth = computed(() => visible.value
    .filter((entry) => Number(entry.date.slice(5, 7)) === month.value + 1
        && Number(entry.date.slice(0, 4)) === year.value));

const feeEntries = computed(() => inMonth.value.filter((e) => e.kind === 'FEE_DUE'));

const monthLabel = computed(() => `${MONTHS[month.value]} ${year.value}`);

function shift(delta: number) {
    const next = new Date(year.value, month.value + delta, 1);
    year.value = next.getFullYear();
    month.value = next.getMonth();
}

function backToToday() {
    year.value = today.getFullYear();
    month.value = today.getMonth();
}

function toggleKind(kind: CalendarEntryKind) {
    shownKinds.value = shownKinds.value.includes(kind)
        ? shownKinds.value.filter((k) => k !== kind)
        : [...shownKinds.value, kind];
}

/* ---- Formulaire ---- */
const showForm = ref(false);
const editing = ref<CalendarEntry | null>(null);
const saving = ref(false);
const formError = ref('');
const form = reactive({
    title: '',
    kind: 'SCHOOL_LIFE' as SchoolEventKind,
    date: isoDate(today),
    allDay: true,
    startTime: '',
    endTime: '',
    details: '',
    wholeSchool: true,
    classIds: [] as string[],
    visibleToFamilies: false,
});

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

function openCreate(date?: string) {
    editing.value = null;
    Object.assign(form, {
        title: '', kind: 'SCHOOL_LIFE', date: date ?? isoDate(today), allDay: true,
        startTime: '', endTime: '', details: '', wholeSchool: true, classIds: [],
        visibleToFamilies: false,
    });
    formError.value = '';
    showForm.value = true;
}

function openEdit(entry: CalendarEntry) {
    editing.value = entry;
    Object.assign(form, {
        title: entry.title,
        kind: (entry.kind === 'EXAM' ? 'EXAM' : 'SCHOOL_LIFE') as SchoolEventKind,
        date: entry.date,
        allDay: entry.allDay,
        startTime: entry.startTime?.slice(0, 5) ?? '',
        endTime: entry.endTime?.slice(0, 5) ?? '',
        details: entry.details ?? '',
        wholeSchool: entry.wholeSchool,
        classIds: entry.classes.map((c) => c.id),
        visibleToFamilies: entry.visibleToFamilies ?? false,
    });
    formError.value = '';
    showForm.value = true;
}

function toggleClass(id: string) {
    form.wholeSchool = false;
    form.classIds = form.classIds.includes(id)
        ? form.classIds.filter((x) => x !== id)
        : [...form.classIds, id];
}

async function load() {
    loading.value = true;
    error.value = '';
    try {
        entries.value = await list(range.value.from, range.value.to);
    } catch {
        error.value = "Le calendrier n'a pas pu être chargé.";
    } finally {
        loading.value = false;
    }
}

async function submit() {
    formError.value = '';
    saving.value = true;
    try {
        const body = {
            title: form.title,
            kind: form.kind,
            date: form.date,
            allDay: form.allDay,
            startTime: form.allDay ? undefined : (form.startTime || undefined),
            endTime: form.allDay ? undefined : (form.endTime || undefined),
            details: form.details || undefined,
            wholeSchool: form.wholeSchool,
            classIds: form.wholeSchool ? [] : form.classIds,
            visibleToFamilies: form.visibleToFamilies,
        };
        if (editing.value) await update(editing.value.id, body);
        else await create(body);
        showForm.value = false;
        await load();
    } catch (e: any) {
        formError.value = e?.data?.debugMessage ?? "L'événement n'a pas pu être enregistré.";
    } finally {
        saving.value = false;
    }
}

async function destroy(entry: CalendarEntry) {
    error.value = '';
    try {
        await remove(entry.id);
        if (opened.value?.id === entry.id) opened.value = null;
        await load();
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "L'événement n'a pas pu être supprimé.";
    }
}

async function notify(entry: CalendarEntry) {
    error.value = '';
    try {
        const result = await notifyFamilies(entry.id);
        await load();
        opened.value = entries.value.find((e) => e.id === entry.id) ?? null;
        error.value = '';
        notified.value = result.notified;
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "La notification n'a pas pu être envoyée.";
    }
}

const notified = ref<number | null>(null);

watch([year, month], load);

onMounted(async () => {
    try {
        classes.value = await listClasses();
    } catch {
        classes.value = [];
    }
    await load();
});
</script>

<template>
    <div>
        <PageHead
            title="Calendrier"
            sub="Vie scolaire, examens et échéances financières"
        >
            <template #actions>
                <a class="btn-secondary" :href="exportUrl(range.from, range.to)" download>
                    Exporter (iCal)
                </a>
                <button v-if="canWrite" class="btn-primary" @click="openCreate()">
                    Nouvel événement
                </button>
            </template>
        </PageHead>

        <p v-if="error" class="alert-danger mb-3.5" role="alert">{{ error }}</p>
        <p
            v-if="notified !== null" class="alert-success mb-3.5" role="status"
            @click="notified = null"
        >
            {{ notified }} famille(s) prévenue(s).
        </p>

        <UiCard
            v-if="showForm" class="mb-3.5"
            :title="editing ? `Modifier ${editing.title}` : 'Nouvel événement'"
            sub="Rendre un événement visible des familles ne les prévient pas : l'envoi se fait depuis sa fiche"
        >
            <form @submit.prevent="submit">
                <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                    <div class="sm:col-span-2">
                        <label class="field-label" for="title">Titre</label>
                        <input
                            id="title" v-model="form.title" type="text" required
                            placeholder="Conseil de classe CM2" class="input"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="kind">Nature</label>
                        <select id="kind" v-model="form.kind" class="select">
                            <option value="SCHOOL_LIFE">Vie scolaire</option>
                            <option value="EXAM">Examen</option>
                        </select>
                    </div>
                    <div>
                        <label class="field-label" for="date">Date</label>
                        <input id="date" v-model="form.date" type="date" required class="input" />
                    </div>
                    <div v-if="!form.allDay">
                        <label class="field-label" for="start">Début</label>
                        <input id="start" v-model="form.startTime" type="time" class="input" />
                    </div>
                    <div v-if="!form.allDay">
                        <label class="field-label" for="end">Fin</label>
                        <input id="end" v-model="form.endTime" type="time" class="input" />
                    </div>
                    <div class="sm:col-span-2">
                        <label class="field-label" for="details">Précision</label>
                        <input
                            id="details" v-model="form.details" type="text"
                            placeholder="Équipe pédagogique · salle polyvalente" class="input"
                        />
                    </div>
                </div>

                <div class="flex flex-wrap gap-4 mt-4">
                    <label class="flex items-center gap-2 text-[12.5px]">
                        <input v-model="form.allDay" type="checkbox" />
                        Toute la journée
                    </label>
                    <label class="flex items-center gap-2 text-[12.5px]">
                        <input v-model="form.wholeSchool" type="checkbox" />
                        Tout l'établissement
                    </label>
                    <label class="flex items-center gap-2 text-[12.5px]">
                        <input v-model="form.visibleToFamilies" type="checkbox" />
                        Visible des familles
                        <span style="color: var(--text-faint)">(n'envoie aucune notification)</span>
                    </label>
                </div>

                <template v-if="!form.wholeSchool">
                    <p class="sec mt-4">Classes concernées</p>
                    <div v-for="group in classesByCycle" :key="group.key" class="mb-2.5">
                        <span class="text-[11.5px] font-bold" style="color: var(--text-faint)">
                            {{ group.label }}
                        </span>
                        <div class="flex gap-1.5 flex-wrap mt-1">
                            <button
                                v-for="schoolClass in group.items" :key="schoolClass.id" type="button"
                                class="chip" :aria-pressed="form.classIds.includes(schoolClass.id)"
                                @click="toggleClass(schoolClass.id)"
                            >{{ schoolClass.name }}</button>
                        </div>
                    </div>
                </template>

                <p v-if="formError" class="alert-danger mt-4" role="alert">{{ formError }}</p>

                <div class="flex gap-2 mt-4">
                    <button type="submit" class="btn-primary" :disabled="saving || !form.title">
                        {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
                    </button>
                    <button type="button" class="btn-secondary" @click="showForm = false">
                        Annuler
                    </button>
                </div>
            </form>
        </UiCard>

        <div class="grid-12">
            <UiCard :pad="false" style="grid-column: span 9">
                <div class="tbar">
                    <div class="flex items-center gap-1">
                        <button class="btn-ghost btn-sm" aria-label="Mois précédent" @click="shift(-1)">
                            ‹
                        </button>
                        <button class="btn-ghost btn-sm" aria-label="Mois suivant" @click="shift(1)">
                            ›
                        </button>
                    </div>
                    <h3
                        class="text-[16px] font-black capitalize" style="color: var(--navy); min-width: 150px"
                    >{{ monthLabel }}</h3>
                    <button class="btn-secondary btn-sm" @click="backToToday">Aujourd'hui</button>

                    <div class="flex-1" />

                    <div class="flex items-center gap-2 flex-wrap">
                        <button
                            v-for="kind in ENTRY_KINDS" :key="kind.value" class="chip"
                            :aria-pressed="shownKinds.includes(kind.value)"
                            @click="toggleKind(kind.value)"
                        >
                            <i
                                class="inline-block w-2 h-2 rounded-full mr-1.5"
                                :style="{ background: kind.tone }"
                            />{{ kind.label }}
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-7" style="border-top: 1px solid var(--border)">
                    <div
                        v-for="day in WEEK_DAY_LABELS" :key="day"
                        class="py-2 text-center text-[11.5px] font-bold uppercase"
                        style="color: var(--text-faint); border-bottom: 1px solid var(--border)"
                    >{{ day }}</div>

                    <div
                        v-for="cell in cells" :key="cell.date"
                        class="p-1.5 flex flex-col gap-1"
                        style="min-height: 92px; border-bottom: 1px solid var(--border); border-right: 1px solid var(--border)"
                        :style="cell.outside ? 'background: var(--surface-sunken)' : ''"
                    >
                        <div class="flex items-center justify-between">
                            <span
                                class="nu text-[12px] font-bold"
                                :style="cell.today
                                    ? 'color: #fff; background: var(--brand-600); border-radius: 999px; padding: 1px 6px'
                                    : cell.outside ? 'color: var(--text-faint)' : 'color: var(--navy)'"
                            >{{ cell.day }}</span>
                            <button
                                v-if="canWrite && !cell.outside" class="text-[13px] leading-none"
                                style="color: var(--text-faint)" title="Ajouter un événement"
                                @click="openCreate(cell.date)"
                            >+</button>
                        </div>

                        <button
                            v-for="entry in byDate.get(cell.date) ?? []" :key="entry.id"
                            class="text-left text-[11px] px-1.5 py-1 rounded truncate"
                            :style="{
                                borderLeft: `3px solid ${kindTone(entry.kind)}`,
                                background: 'var(--surface-sunken)',
                                color: 'var(--text)',
                            }"
                            @click="opened = entry"
                        >
                            <template v-if="entry.kind === 'FEE_DUE' && canReadAmounts && entry.amountExpected">
                                {{ Math.round(Number(entry.amountExpected) / 1000) }}k ·
                            </template>
                            {{ entry.title }}
                        </button>
                    </div>
                </div>
            </UiCard>

            <div style="grid-column: span 3; display: flex; flex-direction: column; gap: 14px">
                <UiCard
                    title="À venir"
                    :sub="inMonth.length ? `${inMonth.length} entrée(s) ce mois` : 'Rien ce mois'"
                    :pad="false"
                >
                    <div v-if="loading" class="p-4 text-[12.5px]" style="color: var(--text-faint)">
                        Chargement…
                    </div>
                    <div v-else-if="inMonth.length">
                        <button
                            v-for="entry in inMonth.slice(0, 8)" :key="entry.id"
                            class="flex items-center gap-2.5 px-3 py-2 w-full text-left"
                            style="border-bottom: 1px solid var(--border)"
                            @click="opened = entry"
                        >
                            <div
                                class="w-9 rounded-lg text-center py-1 shrink-0"
                                :style="{ background: 'var(--surface-sunken)', color: kindTone(entry.kind) }"
                            >
                                <div class="nu font-black text-[15px] leading-none">
                                    {{ Number(entry.date.slice(8, 10)) }}
                                </div>
                                <div class="text-[9px] font-bold uppercase mt-0.5">
                                    {{ MONTHS[Number(entry.date.slice(5, 7)) - 1].slice(0, 3) }}
                                </div>
                            </div>
                            <div class="flex-1 min-w-0">
                                <b class="block text-[12.5px] truncate" style="color: var(--navy)">
                                    {{ entry.title }}
                                </b>
                                <span class="text-[11px]" style="color: var(--text-faint)">
                                    {{ entry.allDay ? 'Toute la journée'
                                        : `${entry.startTime?.slice(0, 5) ?? ''}` }}
                                    · {{ kindLabel(entry.kind) }}
                                </span>
                            </div>
                        </button>
                    </div>
                    <EmptyState
                        v-else title="Mois vide"
                        text="Aucun événement ni échéance sur cette période."
                    />
                </UiCard>

                <UiCard v-if="canReadAmounts && feeEntries.length" title="Échéances du mois" sub="Montants attendus">
                    <div v-for="entry in feeEntries" :key="entry.id" class="mb-3.5">
                        <div class="flex justify-between gap-2 mb-1">
                            <b class="text-[12px]" style="color: var(--navy)">{{ entry.title }}</b>
                            <span class="nu text-[12px] font-bold" style="color: var(--brand-700)">
                                {{ Math.round(Number(entry.amountExpected ?? 0)).toLocaleString('fr-FR') }} F
                            </span>
                        </div>
                        <div class="h-1.5 rounded-full overflow-hidden" style="background: var(--surface-sunken)">
                            <i
                                class="block h-full rounded-full"
                                :style="{
                                    width: `${Math.min(100, Number(entry.amountExpected)
                                        ? Number(entry.amountCollected ?? 0) / Number(entry.amountExpected) * 100
                                        : 0)}%`,
                                    background: 'var(--brand-600)',
                                }"
                            />
                        </div>
                        <div class="text-[11px] mt-1" style="color: var(--text-faint)">
                            {{ Number(entry.date.slice(8, 10)) }}
                            {{ MONTHS[Number(entry.date.slice(5, 7)) - 1] }} ·
                            {{ entry.studentsSettled }} / {{ entry.studentsConcerned }} élève(s) à jour
                        </div>
                    </div>
                </UiCard>
            </div>
        </div>

        <CalendarEntryDrawer
            v-if="opened" :entry="opened"
            @close="opened = null" @edit="openEdit" @delete="destroy" @notify="notify"
        />
    </div>
</template>
