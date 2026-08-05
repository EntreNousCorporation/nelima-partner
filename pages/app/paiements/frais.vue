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

/** Frais dont on consulte ou édite l'échéancier, affiché dans la colonne de droite. */
const selected = ref<Fee | null>(null);
const schedules = ref<Schedule[]>([]);
const editing = ref(false);
const savingSchedules = ref(false);
const scheduleError = ref('');
const scheduleMessage = ref('');
const scheduleCounts = ref<Record<string, number>>({});

const scheduledTotal = computed(() =>
    schedules.value.reduce((sum, s) => sum + (Number(s.amount) || 0), 0));

const totalMatches = computed(() =>
    selected.value ? Math.round(scheduledTotal.value) === Math.round(Number(selected.value.price)) : false);

function formatAmount(value?: number | string) {
    const n = Number(value ?? 0);
    return n.toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';
}

function formatDate(value?: string) {
    if (!value) return '—';
    const [y, m, d] = value.slice(0, 10).split('-');
    return d && m && y ? `${d}/${m}/${y}` : value;
}

async function load() {
    loading.value = true;
    error.value = '';
    try {
        const result = await api<{ content: Fee[] }>('/fees', { query: { size: 100 } });
        fees.value = result.content ?? [];
        // Le nombre de tranches se lit sur la liste : sans lui, la cadence d'un frais n'apparaît
        // qu'après avoir cliqué dessus, et l'école ne voit pas d'un coup d'œil ce qui reste à
        // découper.
        await Promise.all(fees.value.map(async (fee) => {
            try {
                const existing = await api<Schedule[]>(`/fees/${fee.id}/schedules`);
                scheduleCounts.value[fee.id] = existing.length;
            } catch {
                scheduleCounts.value[fee.id] = 0;
            }
        }));
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

async function select(fee: Fee) {
    selected.value = fee;
    editing.value = false;
    scheduleError.value = '';
    scheduleMessage.value = '';
    try {
        const existing = await api<Schedule[]>(`/fees/${fee.id}/schedules`);
        schedules.value = existing.map((s) => ({ ...s, dueDate: s.dueDate?.slice(0, 10) ?? '' }));
        scheduleCounts.value[fee.id] = existing.length;
    } catch {
        schedules.value = [];
    }
}

function startEditing() {
    editing.value = true;
    scheduleMessage.value = '';
    if (!schedules.value.length && selected.value) {
        schedules.value = [{ label: '1er versement', amount: selected.value.price, dueDate: '' }];
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
    if (!selected.value) return;
    scheduleError.value = '';
    scheduleMessage.value = '';
    savingSchedules.value = true;
    try {
        await api(`/fees/${selected.value.id}/schedules`, {
            method: 'PUT',
            body: schedules.value.map((s) => ({
                label: s.label,
                amount: Number(s.amount),
                dueDate: s.dueDate,
            })),
        });
        scheduleMessage.value = 'Échéancier enregistré. Les élèves concernés ont reçu leurs tranches.';
        scheduleCounts.value[selected.value.id] = schedules.value.length;
        editing.value = false;
    } catch (e: any) {
        // Le service refuse la refonte d'un échéancier déjà encaissé, et impose que la somme
        // des tranches vaille le prix du frais.
        scheduleError.value = e?.data?.errors?.[0]?.defaultMessage
            ?? e?.data?.debugMessage
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

const totalExpected = computed(() =>
    fees.value.reduce((sum, f) => sum + Number(f.price ?? 0), 0));

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
            title="Frais et échéanciers"
            sub="Définis par niveau, appliqués automatiquement aux élèves concernés"
        >
            <template #actions>
                <button class="btn-primary" @click="showForm = !showForm">
                    {{ showForm ? 'Annuler' : 'Nouveau frais' }}
                </button>
            </template>
        </PageHead>

        <PaymentsTabs />

        <p v-if="error" class="alert-danger mb-3.5" role="alert">{{ error }}</p>

        <UiCard v-if="showForm" class="mb-3.5" title="Nouveau frais" sub="Montant total, avant découpage en tranches">
            <form @submit.prevent="submit">
                <p v-if="!levelOptions.length" class="alert-danger mb-4">
                    Aucun niveau déclaré. Renseignez d'abord
                    <NuxtLink to="/app/niveaux" class="underline">Niveaux enseignés</NuxtLink>.
                </p>
                <div class="grid gap-3.5 sm:grid-cols-2">
                    <div>
                        <label class="field-label" for="name">Libellé</label>
                        <input
                            id="name" v-model="form.name" type="text" required
                            placeholder="Scolarité annuelle" class="input"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="price">Montant total (FCFA)</label>
                        <input id="price" v-model="form.price" type="number" min="1" required class="input" />
                    </div>
                </div>

                <fieldset class="mt-4">
                    <legend class="field-label">Niveaux concernés</legend>
                    <div class="flex flex-wrap gap-2">
                        <button
                            v-for="level in levelOptions" :key="level.id" type="button" class="chip"
                            :aria-pressed="form.levelOfStudiesCodes.includes(level.code)"
                            @click="toggleLevel(level.code)"
                        >{{ levelLabel(level) }}</button>
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

                <p v-if="formError" class="alert-danger mt-4" role="alert">{{ formError }}</p>

                <button
                    type="submit" class="btn-primary mt-4"
                    :disabled="saving || !form.name || !form.price || !form.levelOfStudiesCodes.length"
                >
                    {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
                </button>
            </form>
        </UiCard>

        <div class="grid-12">
            <UiCard
                style="grid-column: span 8" :pad="false"
                title="Frais de l'établissement"
                sub="Cliquez sur une ligne pour voir la répartition en tranches"
            >
                <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Frais</th>
                                <th>Niveaux</th>
                                <th class="text-right">Montant total</th>
                                <th>Échéancier</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="loading">
                                <td colspan="4" class="py-8 text-center" style="color: var(--text-faint)">
                                    Chargement…
                                </td>
                            </tr>
                            <tr
                                v-for="fee in fees" v-else :key="fee.id" class="cursor-pointer"
                                :style="selected?.id === fee.id ? 'background: var(--brand-50)' : ''"
                                @click="select(fee)"
                            >
                                <td>
                                    <div class="nm">
                                        <b>{{ fee.name }}</b>
                                        <span>{{ fee.optional ? 'Optionnel' : 'Obligatoire' }}</span>
                                    </div>
                                </td>
                                <td>
                                    <span
                                        v-for="level in (fee.levelOfStudies ?? []).slice(0, 3)"
                                        :key="level.id" class="tag mr-1"
                                    >{{ levelLabel(level) }}</span>
                                    <span
                                        v-if="(fee.levelOfStudies ?? []).length > 3"
                                        class="text-[11.5px]" style="color: var(--text-faint)"
                                    >+{{ (fee.levelOfStudies ?? []).length - 3 }}</span>
                                    <span
                                        v-if="!(fee.levelOfStudies ?? []).length"
                                        class="text-[11.5px]" style="color: var(--text-faint)"
                                    >Aucun niveau</span>
                                </td>
                                <td class="num" style="color: var(--navy)">{{ formatAmount(fee.price) }}</td>
                                <td>
                                    <UiPill :tone="scheduleCounts[fee.id] ? 'ok' : 'warn'">
                                        {{ scheduleCounts[fee.id]
                                            ? `${scheduleCounts[fee.id]} tranche${scheduleCounts[fee.id] > 1 ? 's' : ''}`
                                            : 'À découper' }}
                                    </UiPill>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <EmptyState
                    v-if="!loading && !fees.length"
                    title="Aucun frais défini"
                    text="Créez vos frais de scolarité, de cantine ou de transport, puis répartissez-les en tranches datées."
                />

                <template #footer>
                    <span class="text-[12px]" style="color: var(--text-faint)">
                        <b class="nu" style="color: var(--navy)">{{ fees.length }}</b>
                        frais · <b class="nu" style="color: var(--navy)">{{ formatAmount(totalExpected) }}</b>
                        par élève concerné, tous frais cumulés
                    </span>
                </template>
            </UiCard>

            <UiCard
                style="grid-column: span 4" :pad="false"
                :title="selected ? selected.name : 'Détail de l\'échéancier'"
                :sub="selected ? formatAmount(selected.price) : 'Sélectionnez un frais dans la liste'"
            >
                <template v-if="selected" #action>
                    <button v-if="!editing" class="btn-secondary btn-sm" @click="startEditing">
                        {{ schedules.length ? 'Modifier' : 'Découper' }}
                    </button>
                    <button v-else class="btn-secondary btn-sm" @click="select(selected)">
                        Annuler
                    </button>
                </template>

                <EmptyState
                    v-if="!selected"
                    title="Aucun frais sélectionné"
                    text="La répartition en tranches et leurs échéances s'affichent ici."
                />

                <template v-else-if="!editing">
                    <div v-if="schedules.length" class="lst">
                        <div
                            v-for="(schedule, index) in schedules" :key="schedule.id ?? index"
                            class="flex items-center gap-3"
                        >
                            <div
                                class="w-7 h-7 rounded-lg grid place-items-center text-[12px] font-extrabold nu shrink-0"
                                style="background: var(--brand-50); color: var(--brand-700)"
                            >{{ index + 1 }}</div>
                            <div class="nm flex-1 min-w-0">
                                <b>{{ schedule.label }}</b>
                                <span class="nu">Échéance {{ formatDate(schedule.dueDate) }}</span>
                            </div>
                            <b class="nu text-[12.5px]" style="color: var(--navy)">
                                {{ formatAmount(schedule.amount) }}
                            </b>
                        </div>
                    </div>

                    <EmptyState
                        v-else
                        title="Frais non découpé"
                        text="Sans échéancier, aucune tranche n'est due par les familles et le frais reste sans effet."
                    />

                    <p v-if="scheduleMessage" class="alert-success m-4">{{ scheduleMessage }}</p>
                </template>

                <div v-else class="card-b">
                    <div
                        v-for="(schedule, index) in schedules" :key="index"
                        class="grid gap-2 mb-3" style="grid-template-columns: 1fr 110px auto"
                    >
                        <input v-model="schedule.label" type="text" class="input" aria-label="Libellé" />
                        <input
                            v-model="schedule.amount" type="number" min="1" class="input text-right"
                            aria-label="Montant"
                        />
                        <input v-model="schedule.dueDate" type="date" class="input" aria-label="Échéance" />
                        <button
                            type="button" class="text-[12px] underline col-span-3 text-left"
                            style="color: var(--text-faint)" @click="removeSchedule(index)"
                        >Retirer la tranche {{ index + 1 }}</button>
                    </div>

                    <button type="button" class="btn-secondary btn-sm" @click="addSchedule">
                        Ajouter une tranche
                    </button>

                    <!-- La somme doit valoir le prix du frais : le serveur le refuse sinon, autant
                         le dire pendant la saisie plutôt qu'après l'envoi. -->
                    <p
                        class="mt-3 text-[12.5px]"
                        :style="totalMatches ? 'color: var(--text-faint)' : 'color: var(--danger)'"
                    >
                        Total des tranches : <b class="nu">{{ formatAmount(scheduledTotal) }}</b>
                        <span v-if="!totalMatches"> — doit valoir {{ formatAmount(selected.price) }}</span>
                    </p>

                    <p v-if="scheduleError" class="alert-danger mt-3" role="alert">{{ scheduleError }}</p>

                    <button
                        type="button" class="btn-primary mt-3 w-full"
                        :disabled="savingSchedules || !schedules.length || !totalMatches"
                        @click="saveSchedules"
                    >
                        {{ savingSchedules ? 'Enregistrement…' : "Enregistrer l'échéancier" }}
                    </button>
                </div>
            </UiCard>
        </div>
    </div>
</template>
