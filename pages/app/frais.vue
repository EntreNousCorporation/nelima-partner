<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';
import { levelLabel, type LevelOfStudy } from '~/composables/useStudents';

type Fee = {
    id: string;
    name: string;
    price: number;
    optional: boolean;
    academical: boolean;
    levelOfStudies?: LevelOfStudy[];
};

type Schedule = {
    id?: string;
    label: string;
    amount: number | string;
    dueDate: string;
    position?: number;
};

const auth = useAuthStore();
const api = useApi();
const { establishmentLevels } = useStudents();

const fees = ref<Fee[]>([]);
const levelOptions = ref<LevelOfStudy[]>([]);
const loading = ref(true);
const error = ref('');

const showForm = ref(false);
const saving = ref(false);
const formError = ref('');
const form = reactive({
    name: '',
    price: '' as string | number,
    optional: false,
    academical: true,
    levelOfStudiesCodes: [] as string[],
});

/** Frais dont on édite l'échéancier. */
const editing = ref<Fee | null>(null);
const schedules = ref<Schedule[]>([]);
const savingSchedules = ref(false);
const scheduleError = ref('');
const scheduleMessage = ref('');

const scheduledTotal = computed(() =>
    schedules.value.reduce((sum, s) => sum + (Number(s.amount) || 0), 0));

const totalMatches = computed(() =>
    editing.value ? Math.round(scheduledTotal.value) === Math.round(Number(editing.value.price)) : false);

function formatAmount(value?: number | string) {
    const n = Number(value ?? 0);
    return n.toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';
}

async function load() {
    loading.value = true;
    error.value = '';
    try {
        const result = await api<{ content: Fee[] }>('/fees', { query: { size: 100 } });
        fees.value = result.content ?? [];
    } catch {
        error.value = "Les frais n'ont pas pu être chargés.";
    } finally {
        loading.value = false;
    }
}

async function submit() {
    formError.value = '';
    saving.value = true;
    try {
        await api('/fees', {
            method: 'POST',
            body: {
                name: form.name,
                price: Number(form.price),
                optional: form.optional,
                academical: form.academical,
                levelOfStudiesCodes: form.levelOfStudiesCodes,
            },
        });
        showForm.value = false;
        Object.assign(form, { name: '', price: '', optional: false, academical: true, levelOfStudiesCodes: [] });
        await load();
    } catch (e: any) {
        formError.value = e?.response?.status === 409
            ? 'Un frais porte déjà ce nom dans votre établissement.'
            : "Le frais n'a pas pu être enregistré.";
    } finally {
        saving.value = false;
    }
}

async function openSchedules(fee: Fee) {
    editing.value = fee;
    scheduleError.value = '';
    scheduleMessage.value = '';
    try {
        const existing = await api<Schedule[]>(`/fees/${fee.id}/schedules`);
        schedules.value = existing.length
            ? existing.map((s) => ({ ...s, dueDate: s.dueDate?.slice(0, 10) ?? '' }))
            : [{ label: '1er versement', amount: fee.price, dueDate: '' }];
    } catch {
        schedules.value = [{ label: '1er versement', amount: fee.price, dueDate: '' }];
    }
}

function addSchedule() {
    schedules.value.push({
        label: `${schedules.value.length + 1}e versement`,
        amount: '',
        dueDate: '',
    });
}

function removeSchedule(index: number) {
    schedules.value.splice(index, 1);
}

async function saveSchedules() {
    if (!editing.value) return;
    scheduleError.value = '';
    scheduleMessage.value = '';
    savingSchedules.value = true;
    try {
        await api(`/fees/${editing.value.id}/schedules`, {
            method: 'PUT',
            body: schedules.value.map((s) => ({
                label: s.label,
                amount: Number(s.amount),
                dueDate: s.dueDate,
            })),
        });
        scheduleMessage.value = 'Échéancier enregistré. Les élèves concernés ont reçu leurs tranches.';
    } catch (e: any) {
        // Le service refuse la refonte d'un échéancier déjà encaissé, et impose que la somme
        // des tranches vaille le prix du frais.
        scheduleError.value = e?.response?._data?.errors?.[0]?.defaultMessage
            ?? "L'échéancier n'a pas pu être enregistré.";
    } finally {
        savingSchedules.value = false;
    }
}

function toggleLevel(code: string) {
    const i = form.levelOfStudiesCodes.indexOf(code);
    if (i === -1) form.levelOfStudiesCodes.push(code);
    else form.levelOfStudiesCodes.splice(i, 1);
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
        <div class="flex items-start justify-between gap-4 flex-wrap">
            <div>
                <h1 class="text-2xl font-semibold">Frais</h1>
                <p class="mt-1 opacity-70 max-w-2xl">
                    Un frais s'applique aux élèves des niveaux ciblés. Son échéancier détermine
                    les tranches que les familles auront à régler.
                </p>
            </div>
            <button class="rounded bg-nelima-600 px-4 py-2 text-white" @click="showForm = !showForm">
                {{ showForm ? 'Annuler' : 'Nouveau frais' }}
            </button>
        </div>

        <form v-if="showForm" class="mt-6 rounded border border-black/10 dark:border-white/15 p-4"
              @submit.prevent="submit">
            <h2 class="font-medium mb-4">Nouveau frais</h2>
            <p v-if="!levelOptions.length" class="mb-4 text-sm">
                Aucun niveau déclaré. Renseignez d'abord
                <NuxtLink to="/app/niveaux" class="underline">Niveaux enseignés</NuxtLink>.
            </p>
            <div class="grid gap-4 sm:grid-cols-2">
                <label class="text-sm">Libellé
                    <input v-model="form.name" type="text" required placeholder="Scolarité annuelle"
                           class="mt-1 w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2" />
                </label>
                <label class="text-sm">Montant total (FCFA)
                    <input v-model="form.price" type="number" min="1" required
                           class="mt-1 w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2" />
                </label>
            </div>

            <fieldset class="mt-4">
                <legend class="text-sm mb-2">Niveaux concernés</legend>
                <div class="flex flex-wrap gap-2">
                    <label v-for="level in levelOptions" :key="level.id"
                           class="flex items-center gap-2 rounded border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm cursor-pointer"
                           :class="form.levelOfStudiesCodes.includes(level.code) ? 'bg-nelima-50 dark:bg-white/10 border-nelima-300' : ''">
                        <input type="checkbox" :checked="form.levelOfStudiesCodes.includes(level.code)"
                               @change="toggleLevel(level.code)" />
                        {{ levelLabel(level) }}
                    </label>
                </div>
            </fieldset>

            <div class="mt-4 flex gap-6 text-sm">
                <label class="flex items-center gap-2">
                    <input v-model="form.optional" type="checkbox" /> Frais optionnel
                </label>
                <label class="flex items-center gap-2">
                    <input v-model="form.academical" type="checkbox" /> Frais de scolarité
                </label>
            </div>

            <p v-if="formError" class="mt-4 text-sm text-red-600" role="alert">{{ formError }}</p>

            <button type="submit"
                    :disabled="saving || !form.name || !form.price || !form.levelOfStudiesCodes.length"
                    class="mt-4 rounded bg-nelima-600 px-4 py-2 text-white disabled:opacity-50">
                {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
            </button>
        </form>

        <p v-if="error" class="mt-4 text-sm text-red-600" role="alert">{{ error }}</p>
        <p v-if="loading" class="mt-6 opacity-70">Chargement…</p>

        <div v-else-if="!fees.length" class="mt-6 opacity-70">
            Aucun frais défini. Créez-en un pour commencer à facturer les familles.
        </div>

        <div v-else class="mt-6 space-y-3">
            <div v-for="fee in fees" :key="fee.id"
                 class="rounded border border-black/10 dark:border-white/15 p-4">
                <div class="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <p class="font-medium">
                            {{ fee.name }}
                            <span v-if="fee.optional" class="ml-2 text-xs opacity-60">optionnel</span>
                        </p>
                        <p class="text-sm opacity-70">{{ formatAmount(fee.price) }}</p>
                        <p class="text-sm opacity-60 mt-1">
                            {{ (fee.levelOfStudies ?? []).map(levelLabel).join(', ') || 'Aucun niveau' }}
                        </p>
                    </div>
                    <button class="rounded border border-black/20 dark:border-white/20 px-3 py-1.5 text-sm"
                            @click="editing?.id === fee.id ? (editing = null) : openSchedules(fee)">
                        {{ editing?.id === fee.id ? 'Fermer' : 'Échéancier' }}
                    </button>
                </div>

                <div v-if="editing?.id === fee.id" class="mt-4 border-t border-black/10 dark:border-white/15 pt-4">
                    <div v-for="(schedule, index) in schedules" :key="index"
                         class="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] items-end mb-3">
                        <label class="text-sm">Libellé
                            <input v-model="schedule.label" type="text"
                                   class="mt-1 w-full rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2" />
                        </label>
                        <label class="text-sm">Montant
                            <input v-model="schedule.amount" type="number" min="1"
                                   class="mt-1 w-36 rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2" />
                        </label>
                        <label class="text-sm">Échéance
                            <input v-model="schedule.dueDate" type="date"
                                   class="mt-1 rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2" />
                        </label>
                        <button type="button" class="text-sm underline opacity-70 pb-2"
                                @click="removeSchedule(index)">Retirer</button>
                    </div>

                    <button type="button" class="text-sm underline" @click="addSchedule">
                        Ajouter une tranche
                    </button>

                    <p class="mt-3 text-sm" :class="totalMatches ? 'opacity-70' : 'text-red-600'">
                        Total des tranches : {{ formatAmount(scheduledTotal) }}
                        <span v-if="!totalMatches">
                            — doit valoir {{ formatAmount(fee.price) }}
                        </span>
                    </p>

                    <p v-if="scheduleError" class="mt-2 text-sm text-red-600" role="alert">{{ scheduleError }}</p>
                    <p v-if="scheduleMessage" class="mt-2 text-sm text-nelima-600">{{ scheduleMessage }}</p>

                    <button type="button" :disabled="savingSchedules || !schedules.length || !totalMatches"
                            class="mt-3 rounded bg-nelima-600 px-4 py-2 text-white disabled:opacity-50"
                            @click="saveSchedules">
                        {{ savingSchedules ? 'Enregistrement…' : "Enregistrer l'échéancier" }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
