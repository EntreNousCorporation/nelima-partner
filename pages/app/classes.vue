<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';
import { fillingRate, type SchoolClass } from '~/composables/useClasses';
import { levelLabel, type LevelOfStudy } from '~/composables/useStudents';

const auth = useAuthStore();
const { list, create, update, remove } = useClasses();
const { establishmentLevels } = useStudents();

const rows = ref<SchoolClass[]>([]);
const levelOptions = ref<LevelOfStudy[]>([]);
const loading = ref(true);
const error = ref('');

const keyword = ref('');
const selectedLevel = ref('');

const opened = ref<SchoolClass | null>(null);

const showForm = ref(false);
/** Classe en cours de modification ; nulle quand le formulaire sert à en créer une. */
const editing = ref<SchoolClass | null>(null);
const saving = ref(false);
const formError = ref('');
const form = reactive({
    name: '',
    room: '',
    capacity: '' as string | number,
    mainTeacherName: '',
    levelOfStudyCode: '',
});

const filtered = computed(() => {
    const q = keyword.value.trim().toLowerCase();
    return rows.value.filter((row) => {
        if (selectedLevel.value && row.levelCode !== selectedLevel.value) return false;
        if (!q) return true;
        return row.name.toLowerCase().includes(q)
            || (row.mainTeacherName ?? '').toLowerCase().includes(q);
    });
});

const totalStudents = computed(() => rows.value.reduce((sum, r) => sum + r.studentCount, 0));
const totalCapacity = computed(() => rows.value.reduce((sum, r) => sum + (r.capacity ?? 0), 0));

/** Remplissage par niveau, comme le prototype le présente en tête d'écran. */
const byLevel = computed(() => {
    const groups = new Map<string, { label: string; students: number; capacity: number; count: number }>();
    for (const row of rows.value) {
        const key = row.levelCode ?? '—';
        const group = groups.get(key)
            ?? { label: row.levelLabel ?? 'Niveau non renseigné', students: 0, capacity: 0, count: 0 };
        group.students += row.studentCount;
        group.capacity += row.capacity ?? 0;
        group.count += 1;
        groups.set(key, group);
    }
    return [...groups.values()].slice(0, 4);
});

function openCreate() {
    editing.value = null;
    Object.assign(form, { name: '', room: '', capacity: '', mainTeacherName: '', levelOfStudyCode: '' });
    formError.value = '';
    showForm.value = true;
}

function openEdit(schoolClass: SchoolClass) {
    editing.value = schoolClass;
    Object.assign(form, {
        name: schoolClass.name,
        room: schoolClass.room ?? '',
        capacity: schoolClass.capacity,
        mainTeacherName: schoolClass.mainTeacherName ?? '',
        levelOfStudyCode: schoolClass.levelCode ?? '',
    });
    formError.value = '';
    showForm.value = true;
}

async function load() {
    loading.value = true;
    error.value = '';
    try {
        rows.value = await list();
    } catch {
        error.value = "Les classes n'ont pas pu être chargées.";
    } finally {
        loading.value = false;
    }
}

async function submit() {
    formError.value = '';
    saving.value = true;
    try {
        const body = {
            name: form.name,
            room: form.room || undefined,
            capacity: Number(form.capacity),
            mainTeacherName: form.mainTeacherName || undefined,
            levelOfStudyCode: form.levelOfStudyCode || undefined,
        };
        if (editing.value) await update(editing.value.id, body);
        else await create(body);
        showForm.value = false;
        await load();
    } catch (e: any) {
        // Le serveur refuse un niveau non déclaré et un nom déjà pris : son message est plus
        // précis que tout ce qu'on pourrait deviner ici.
        formError.value = e?.data?.debugMessage
            ?? (e?.response?.status === 409
                ? 'Une classe porte déjà ce nom dans votre établissement.'
                : "La classe n'a pas pu être enregistrée.");
    } finally {
        saving.value = false;
    }
}

async function destroy(schoolClass: SchoolClass) {
    error.value = '';
    try {
        await remove(schoolClass.id);
        await load();
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "La classe n'a pas pu être supprimée.";
    }
}

async function refresh() {
    await load();
    if (opened.value) {
        opened.value = rows.value.find((row) => row.id === opened.value?.id) ?? null;
    }
}

onMounted(async () => {
    try {
        levelOptions.value = await establishmentLevels(auth.user?.establishmentId);
    } catch {
        levelOptions.value = [];
    }
    await load();
});
</script>

<template>
    <div>
        <PageHead
            title="Classes"
            :sub="rows.length
                ? `${rows.length} classe${rows.length > 1 ? 's' : ''} · ${totalStudents} élèves répartis sur ${totalCapacity} places`
                : 'Répartition des élèves et remplissage des salles'"
        >
            <template #actions>
                <button class="btn-primary" @click="openCreate">Nouvelle classe</button>
            </template>
        </PageHead>

        <p v-if="error" class="alert-danger mb-3.5" role="alert">{{ error }}</p>

        <UiCard
            v-if="showForm" class="mb-3.5"
            :title="editing ? `Modifier ${editing.name}` : 'Nouvelle classe'"
            sub="Le niveau doit faire partie de ceux que votre établissement a déclarés"
        >
            <form @submit.prevent="submit">
                <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                        <label class="field-label" for="name">Nom</label>
                        <input
                            id="name" v-model="form.name" type="text" required
                            placeholder="CM1 A" class="input"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="level">Niveau</label>
                        <select id="level" v-model="form.levelOfStudyCode" class="select">
                            <option value="">Aucun</option>
                            <option v-for="level in levelOptions" :key="level.id" :value="level.code">
                                {{ levelLabel(level) }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="field-label" for="capacity">Places</label>
                        <input
                            id="capacity" v-model="form.capacity" type="number" min="1" max="300"
                            required class="input"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="room">Salle</label>
                        <input id="room" v-model="form.room" type="text" placeholder="B-04" class="input" />
                    </div>
                    <div class="sm:col-span-2">
                        <label class="field-label" for="teacher">Titulaire</label>
                        <input
                            id="teacher" v-model="form.mainTeacherName" type="text"
                            placeholder="Nom de l'enseignant" class="input"
                        />
                    </div>
                </div>

                <p v-if="formError" class="alert-danger mt-4" role="alert">{{ formError }}</p>

                <div class="flex gap-2 mt-4">
                    <button type="submit" class="btn-primary" :disabled="saving || !form.name || !form.capacity">
                        {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
                    </button>
                    <button type="button" class="btn-secondary" @click="showForm = false">Annuler</button>
                </div>
            </form>
        </UiCard>

        <div v-if="byLevel.length" class="grid-12 mb-3.5">
            <div
                v-for="group in byLevel" :key="group.label" class="card p-4"
                :style="`grid-column: span ${Math.max(3, Math.floor(12 / byLevel.length))}`"
            >
                <span class="kpi-label">{{ group.label }}</span>
                <span class="kpi-value">{{ group.students }}<small>élèves</small></span>
                <span class="kpi-foot">
                    {{ group.count }} classe{{ group.count > 1 ? 's' : '' }} ·
                    {{ group.capacity ? Math.round(group.students / group.capacity * 100) : 0 }} % de remplissage
                </span>
            </div>
        </div>

        <UiCard :pad="false">
            <div class="tbar">
                <label class="inp" style="flex: 0 1 240px">
                    <svg
                        class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2" stroke-linecap="round"
                    >
                        <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                    </svg>
                    <input
                        v-model="keyword" type="search" class="w-full"
                        placeholder="Classe ou titulaire…" aria-label="Rechercher une classe"
                    />
                </label>

                <div class="flex items-center gap-2 flex-wrap">
                    <button class="chip" :aria-pressed="!selectedLevel" @click="selectedLevel = ''">
                        Tous niveaux
                    </button>
                    <button
                        v-for="level in levelOptions" :key="level.id" class="chip"
                        :aria-pressed="selectedLevel === level.code" @click="selectedLevel = level.code"
                    >{{ levelLabel(level) }}</button>
                </div>
            </div>

            <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Classe</th>
                            <th>Niveau</th>
                            <th>Titulaire</th>
                            <th>Salle</th>
                            <th style="width: 180px">Remplissage</th>
                            <th class="text-right">Reste dû</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="loading">
                            <td colspan="7" class="py-8 text-center" style="color: var(--text-faint)">
                                Chargement…
                            </td>
                        </tr>
                        <tr
                            v-for="row in filtered" v-else :key="row.id" class="cursor-pointer"
                            @click="opened = row"
                        >
                            <td>
                                <div class="flex items-center gap-2.5">
                                    <div
                                        class="w-[34px] h-[34px] rounded-lg grid place-items-center shrink-0 nu font-black text-[12px]"
                                        style="background: var(--brand-50); color: var(--brand-700)"
                                    >{{ row.name.replace(/\s/g, '').slice(0, 3) }}</div>
                                    <b class="text-sm font-extrabold" style="color: var(--navy)">
                                        {{ row.name }}
                                    </b>
                                </div>
                            </td>
                            <td><span class="tag">{{ row.levelLabel ?? '—' }}</span></td>
                            <td class="text-[12.5px] font-semibold" style="color: var(--text)">
                                {{ row.mainTeacherName ?? '—' }}
                            </td>
                            <td class="nu text-[12px]" style="color: var(--text-faint)">
                                {{ row.room ?? '—' }}
                            </td>
                            <td>
                                <div class="flex items-center gap-2.5">
                                    <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background: var(--surface-sunken)">
                                        <!-- Rouge au-delà de la capacité, orange à l'approche : c'est
                                             la seule information que l'école lit dans cette barre. -->
                                        <i
                                            class="block h-full rounded-full"
                                            :style="{
                                                width: `${Math.min(100, fillingRate(row))}%`,
                                                background: row.studentCount > row.capacity
                                                    ? 'var(--danger-solid)'
                                                    : fillingRate(row) > 92
                                                        ? 'var(--warning-solid)' : 'var(--brand-600)',
                                            }"
                                        />
                                    </div>
                                    <span
                                        class="nu text-[12px] font-bold" style="min-width: 44px; text-align: right"
                                        :style="row.studentCount > row.capacity ? 'color: var(--danger)' : 'color: var(--text-muted)'"
                                    >{{ row.studentCount }}/{{ row.capacity }}</span>
                                </div>
                            </td>
                            <td class="num" :style="Number(row.outstandingAmount) > 0
                                ? 'color: var(--danger)' : 'color: var(--text-faint)'">
                                {{ Math.round(Number(row.outstandingAmount ?? 0)).toLocaleString('fr-FR') }} F
                            </td>
                            <td class="text-right whitespace-nowrap">
                                <button class="btn-ghost btn-sm" @click.stop="openEdit(row)">Modifier</button>
                                <button
                                    v-if="row.studentCount === 0" class="btn-ghost btn-sm"
                                    @click.stop="destroy(row)"
                                >Supprimer</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <EmptyState
                v-if="!loading && !filtered.length && (keyword || selectedLevel)"
                title="Aucun résultat"
                text="Aucune classe ne correspond à ce filtre."
            />
            <EmptyState
                v-else-if="!loading && !filtered.length"
                title="Aucune classe"
                text="Créez vos classes pour y répartir les élèves : le remplissage, le recouvrement et les affectations en découlent."
            />

            <template #footer>
                <span class="text-[12px]" style="color: var(--text-faint)">
                    <b class="nu" style="color: var(--navy)">{{ filtered.length }}</b>
                    classe{{ filtered.length > 1 ? 's' : '' }} affichée{{ filtered.length > 1 ? 's' : '' }}
                </span>
                <span class="text-[12px]" style="color: var(--text-faint)">
                    Remplissage global
                    <b class="nu" style="color: var(--navy)">
                        {{ totalCapacity ? Math.round(totalStudents / totalCapacity * 100) : 0 }} %
                    </b>
                </span>
            </template>
        </UiCard>

        <ClassDrawer
            v-if="opened" :school-class="opened"
            @close="opened = null" @changed="refresh"
        />
    </div>
</template>
