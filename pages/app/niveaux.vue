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
        <PageHead
            title="Niveaux enseignés"
            sub="Un élève ne peut être inscrit que dans un niveau déclaré ici, et les frais se ciblent par niveau"
        />

        <p v-if="error" class="alert-danger mb-3.5" role="alert">{{ error }}</p>
        <p v-if="message" class="alert-success mb-3.5">{{ message }}</p>

        <UiCard
            class="max-w-4xl"
            title="Catalogue du système éducatif ivoirien"
            sub="Sélectionnez les niveaux que votre établissement propose"
        >
            <p v-if="loading" class="text-[13px]" style="color: var(--text-faint)">Chargement…</p>

            <div v-else class="flex flex-wrap gap-2">
                <!-- `aria-pressed` porte l'état retenu : la couleur seule ne le dirait pas à un
                     lecteur d'écran, et c'est ici toute l'information de l'écran. -->
                <button
                    v-for="level in catalogue" :key="level.id" type="button" class="chip"
                    :aria-pressed="selected.includes(level.code)" @click="toggle(level.code)"
                >{{ levelLabel(level) }}</button>
            </div>

            <template #footer>
                <span class="text-[12px]" style="color: var(--text-faint)">
                    <b class="nu" style="color: var(--navy)">{{ selected.length }}</b>
                    niveau{{ selected.length > 1 ? 'x' : '' }} retenu{{ selected.length > 1 ? 's' : '' }}
                    sur {{ catalogue.length }}
                </span>
                <button
                    class="btn-primary btn-sm" :disabled="saving || !dirty || !selected.length"
                    @click="save"
                >
                    {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
                </button>
            </template>
        </UiCard>
    </div>
</template>
