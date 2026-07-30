<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';
import { levelLabel, type LevelOfStudy } from '~/composables/useStudents';

/**
 * Les niveaux enseignés conditionnent tout le reste : on ne peut inscrire un élève que dans un
 * niveau déclaré par l'établissement, et les frais se ciblent par niveau. C'est donc le premier
 * écran à remplir après la création du compte.
 */
const auth = useAuthStore();
const api = useApi();

const catalogue = ref<LevelOfStudy[]>([]);
const selected = ref<string[]>([]);
const initial = ref<string[]>([]);
const loading = ref(true);
const saving = ref(false);
const message = ref('');
const error = ref('');

const dirty = computed(() =>
    JSON.stringify([...selected.value].sort()) !== JSON.stringify([...initial.value].sort()));

async function load() {
    loading.value = true;
    error.value = '';
    try {
        const all = await api<{ content: LevelOfStudy[] }>('/level-of-studies', { query: { size: 100 } });
        catalogue.value = (all.content ?? []).slice()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

        const establishmentId = auth.user?.establishmentId;
        if (establishmentId) {
            const mine = await api<{ levelOfStudies?: LevelOfStudy[] }>(`/establishments/${establishmentId}`);
            const codes = (mine.levelOfStudies ?? []).map((l) => l.code);
            selected.value = [...codes];
            initial.value = [...codes];
        }
    } catch {
        error.value = "Les niveaux n'ont pas pu être chargés.";
    } finally {
        loading.value = false;
    }
}

async function save() {
    const establishmentId = auth.user?.establishmentId;
    if (!establishmentId) return;
    saving.value = true;
    message.value = '';
    error.value = '';
    try {
        await api(`/establishments/${establishmentId}/level-of-studies`, {
            method: 'POST',
            body: { levelOfStudiesCodes: selected.value },
        });
        initial.value = [...selected.value];
        message.value = 'Niveaux enregistrés.';
    } catch {
        error.value = "Les niveaux n'ont pas pu être enregistrés.";
    } finally {
        saving.value = false;
    }
}

function toggle(code: string) {
    const index = selected.value.indexOf(code);
    if (index === -1) selected.value.push(code);
    else selected.value.splice(index, 1);
}

onMounted(load);
</script>

<template>
    <div>
        <h1 class="page-title">Niveaux enseignés</h1>
        <p class="mt-1 opacity-70 max-w-2xl">
            Sélectionnez les niveaux proposés par votre établissement. Un élève ne peut être inscrit
            que dans un niveau déclaré ici, et les frais se ciblent par niveau.
        </p>

        <p v-if="error" class="alert-danger mt-4" role="alert">{{ error }}</p>
        <p v-if="message" class="alert-success mt-4">{{ message }}</p>

        <p v-if="loading" class="mt-6 opacity-70">Chargement…</p>

        <div v-else class="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
            <label
                v-for="level in catalogue" :key="level.id"
                class="flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer" style="border: 1px solid var(--border)"
                :class="selected.includes(level.code) ? 'bg-nelima-50 dark:bg-white/10 border-nelima-300' : ''"
            >
                <input
                    type="checkbox" :checked="selected.includes(level.code)"
                    @change="toggle(level.code)"
                />
                <span>{{ levelLabel(level) }}</span>
            </label>
        </div>

        <div v-if="!loading" class="mt-6 flex items-center gap-3">
            <button
                class="btn-primary"
                :disabled="saving || !dirty || !selected.length"
                @click="save"
            >
                {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
            </button>
            <span class="text-sm opacity-70">{{ selected.length }} niveau(x) sélectionné(s)</span>
        </div>
    </div>
</template>
