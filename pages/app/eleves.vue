<script setup lang="ts">
import { levelLabel, type LevelOfStudy, type Student } from '~/composables/useStudents';

import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
const { search, establishmentLevels, create } = useStudents();

const students = ref<Student[]>([]);
const levelOptions = ref<LevelOfStudy[]>([]);
const page = ref(0);
const size = 20;
const totalElements = ref(0);
const totalPages = ref(0);
const selectedLevel = ref<string>('');
const loading = ref(false);
const loadError = ref('');

const showImport = ref(false);
const importing = ref(false);
const importError = ref('');
const importMessage = ref('');
const importFile = ref<File | null>(null);

function onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    importFile.value = input.files?.[0] ?? null;
}

async function submitImport() {
    if (!importFile.value) return;
    importError.value = '';
    importMessage.value = '';
    importing.value = true;
    try {
        const body = new FormData();
        body.append('file', importFile.value);
        // Pas de Content-Type explicite : le navigateur doit poser lui-même la frontière
        // multipart, la fixer à la main casserait la requête.
        const report = await $fetch<{ imported: number }>('/api/v1/students/import-csv', {
            method: 'POST', body,
        });
        importMessage.value = `${report.imported} élève(s) importé(s).`;
        importFile.value = null;
        showImport.value = false;
        page.value = 0;
        await load();
    } catch (e: any) {
        // Le rapport du serveur désigne les lignes fautives : on le montre tel quel, c'est la
        // seule information qui permet à l'école de corriger son fichier.
        importError.value = e?.response?._data?.debugMessage
            ?? "Le fichier n'a pas pu être importé.";
    } finally {
        importing.value = false;
    }
}

const showForm = ref(false);
const saving = ref(false);
const formError = ref('');
const form = reactive({
    firstName: '',
    lastName: '',
    registrationNumber: '',
    birthDay: '',
    placeOfBirth: '',
    levelOfStudyCode: '',
});

const formComplete = computed(() =>
    Boolean(form.firstName && form.lastName && form.registrationNumber
        && form.birthDay && form.placeOfBirth && form.levelOfStudyCode));

async function load() {
    loading.value = true;
    loadError.value = '';
    try {
        const result = await search({
            page: page.value,
            size,
            levelOfStudies: selectedLevel.value ? [selectedLevel.value] : undefined,
        });
        students.value = result.content ?? [];
        totalElements.value = result.totalElements ?? 0;
        totalPages.value = result.totalPages ?? 0;
    } catch (e: any) {
        loadError.value = "La liste n'a pas pu être chargée.";
        students.value = [];
    } finally {
        loading.value = false;
    }
}

async function submit() {
    formError.value = '';
    saving.value = true;
    try {
        await create({ ...form });
        showForm.value = false;
        Object.assign(form, {
            firstName: '', lastName: '', registrationNumber: '',
            birthDay: '', placeOfBirth: '', levelOfStudyCode: '',
        });
        // On revient en première page : l'élève créé n'est pas nécessairement sur la page courante.
        page.value = 0;
        await load();
    } catch (e: any) {
        // Le backend renvoie un 409 sur matricule déjà pris, cas de loin le plus fréquent.
        formError.value = e?.response?.status === 409
            ? 'Ce matricule est déjà attribué dans votre établissement.'
            : "L'élève n'a pas pu être enregistré.";
    } finally {
        saving.value = false;
    }
}

function changePage(delta: number) {
    const next = page.value + delta;
    if (next < 0 || next >= totalPages.value) return;
    page.value = next;
    load();
}

function formatDate(value?: string) {
    if (!value) return '—';
    const [y, m, d] = value.split('-');
    return d && m && y ? `${d}/${m}/${y}` : value;
}

watch(selectedLevel, () => { page.value = 0; load(); });

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
        <div class="flex items-start justify-between gap-4 flex-wrap">
            <div>
                <h1 class="text-2xl font-semibold">Élèves</h1>
                <p class="mt-1 opacity-70">
                    {{ totalElements }} élève{{ totalElements > 1 ? 's' : '' }} inscrit{{ totalElements > 1 ? 's' : '' }}
                </p>
            </div>
            <div class="flex gap-2">
                <button class="rounded border border-black/20 dark:border-white/20 px-4 py-2"
                        @click="showImport = !showImport; showForm = false">
                    {{ showImport ? 'Annuler' : 'Importer un fichier' }}
                </button>
                <button class="rounded bg-nelima-600 px-4 py-2 text-white"
                        @click="showForm = !showForm; showImport = false">
                    {{ showForm ? 'Annuler' : 'Nouvel élève' }}
                </button>
            </div>
        </div>

        <form v-if="showImport" class="mt-6 rounded border border-black/10 dark:border-white/15 p-4"
              @submit.prevent="submitImport">
            <h2 class="font-medium mb-2">Importer une liste d'élèves</h2>
            <p class="text-sm opacity-70 mb-4">
                Fichier CSV séparé par des points-virgules, avec cet en-tête exact :<br />
                <code class="text-xs">matricule;nom;prenom;date_naissance;lieu_naissance;niveau</code><br />
                Les dates s'écrivent AAAA-MM-JJ, et le niveau doit être l'un de ceux que vous avez
                déclarés. L'import est tout ou rien : si une ligne est invalide, rien n'est enregistré.
            </p>
            <input type="file" accept=".csv,text/csv" required
                   class="block text-sm" @change="onFileChange" />
            <p v-if="importError" class="mt-3 text-sm text-red-600" role="alert">{{ importError }}</p>
            <button type="submit" :disabled="importing || !importFile"
                    class="mt-4 rounded bg-nelima-600 px-4 py-2 text-white disabled:opacity-50">
                {{ importing ? 'Import en cours…' : 'Importer' }}
            </button>
        </form>

        <p v-if="importMessage" class="mt-4 text-sm text-nelima-600">{{ importMessage }}</p>

        <form
            v-if="showForm"
            class="mt-6 rounded border border-black/10 dark:border-white/15 p-4"
            @submit.prevent="submit"
        >
            <h2 class="font-medium mb-4">Nouvel élève</h2>
            <p v-if="!levelOptions.length" class="mb-4 text-sm">
                Aucun niveau n'est déclaré pour votre établissement. Renseignez-les d'abord dans
                <NuxtLink to="/app/niveaux" class="underline">Niveaux enseignés</NuxtLink>.
            </p>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label class="text-sm">Prénom
                    <input v-model="form.firstName" type="text" required
                           class="mt-1 w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2" />
                </label>
                <label class="text-sm">Nom
                    <input v-model="form.lastName" type="text" required
                           class="mt-1 w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2" />
                </label>
                <label class="text-sm">Matricule
                    <input v-model="form.registrationNumber" type="text" required
                           class="mt-1 w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2" />
                </label>
                <label class="text-sm">Date de naissance
                    <input v-model="form.birthDay" type="date" required
                           class="mt-1 w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2" />
                </label>
                <label class="text-sm">Lieu de naissance
                    <input v-model="form.placeOfBirth" type="text" required
                           class="mt-1 w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2" />
                </label>
                <label class="text-sm">Niveau
                    <select v-model="form.levelOfStudyCode" required
                            class="mt-1 w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2">
                        <option value="" disabled>Choisir…</option>
                        <option v-for="level in levelOptions" :key="level.id" :value="level.code">
                            {{ levelLabel(level) }}
                        </option>
                    </select>
                </label>
            </div>

            <p v-if="formError" class="mt-4 text-sm text-red-600" role="alert">{{ formError }}</p>

            <div class="mt-4">
                <button type="submit" :disabled="saving || !formComplete"
                        class="rounded bg-nelima-600 px-4 py-2 text-white disabled:opacity-50">
                    {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
                </button>
            </div>
        </form>

        <div class="mt-6 flex items-center gap-3">
            <label class="text-sm">Niveau
                <select v-model="selectedLevel"
                        class="ml-2 rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-1.5">
                    <option value="">Tous</option>
                    <option v-for="level in levelOptions" :key="level.id" :value="level.code">
                        {{ levelLabel(level) }}
                    </option>
                </select>
            </label>
        </div>

        <p v-if="loadError" class="mt-4 text-sm text-red-600" role="alert">{{ loadError }}</p>

        <div class="mt-4 overflow-x-auto">
            <table class="w-full text-sm border-collapse">
                <thead>
                    <tr class="text-left border-b border-black/10 dark:border-white/15">
                        <th class="py-2 pr-4 font-medium">Matricule</th>
                        <th class="py-2 pr-4 font-medium">Nom</th>
                        <th class="py-2 pr-4 font-medium">Prénom</th>
                        <th class="py-2 pr-4 font-medium">Niveau</th>
                        <th class="py-2 pr-4 font-medium">Naissance</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading">
                        <td colspan="5" class="py-6 opacity-70">Chargement…</td>
                    </tr>
                    <tr v-else-if="!students.length">
                        <td colspan="5" class="py-6 opacity-70">
                            Aucun élève pour l'instant. Utilisez « Nouvel élève » pour en ajouter un.
                        </td>
                    </tr>
                    <tr v-for="student in students" :key="student.id"
                        class="border-b border-black/5 dark:border-white/10">
                        <td class="py-2 pr-4 font-mono">{{ student.registrationNumber }}</td>
                        <td class="py-2 pr-4">{{ student.lastName }}</td>
                        <td class="py-2 pr-4">{{ student.firstName }}</td>
                        <td class="py-2 pr-4">{{ levelLabel(student.levelOfStudy) }}</td>
                        <td class="py-2 pr-4">{{ formatDate(student.birthDay) }}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-if="totalPages > 1" class="mt-4 flex items-center gap-3 text-sm">
            <button class="rounded border border-black/20 dark:border-white/20 px-3 py-1 disabled:opacity-40"
                    :disabled="page === 0" @click="changePage(-1)">Précédent</button>
            <span class="opacity-70">Page {{ page + 1 }} sur {{ totalPages }}</span>
            <button class="rounded border border-black/20 dark:border-white/20 px-3 py-1 disabled:opacity-40"
                    :disabled="page >= totalPages - 1" @click="changePage(1)">Suivant</button>
        </div>
    </div>
</template>
