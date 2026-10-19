<script setup lang="ts">
import { DIETS, dietLabel, isAllergy, type Diet, type DietKind } from '~/composables/useCanteen';

/**
 * Régimes et allergies de l'élève, tels que la cantine et la cuisine les reçoivent.
 *
 * Une case par régime plutôt qu'un champ libre : la fiche cuisine regroupe les élèves par régime,
 * et « sans porc », « pas de porc » et « porc interdit » feraient trois lignes pour un seul plat.
 */
const props = defineProps<{ studentId: string }>();
const { diets, saveDiets } = useCanteen();
const { can } = usePermissions();

const items = ref<Diet[]>([]);
const editing = ref(false);
const selected = reactive(new Set<DietKind>());
const otherLabel = ref('');
const error = ref('');

async function load() {
    try {
        items.value = await diets(props.studentId);
    } catch {
        items.value = [];
    }
}

function open() {
    selected.clear();
    items.value.forEach((d) => selected.add(d.kind));
    otherLabel.value = items.value.find((d) => d.kind === 'ALLERGY_OTHER')?.label ?? '';
    editing.value = true;
}

function toggle(kind: DietKind) {
    if (selected.has(kind)) selected.delete(kind);
    else selected.add(kind);
}

async function save() {
    error.value = '';
    try {
        items.value = await saveDiets(props.studentId, [...selected].map((kind) => ({
            kind, label: kind === 'ALLERGY_OTHER' ? otherLabel.value.trim() || null : null,
        })));
        editing.value = false;
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "Les régimes n'ont pas pu être enregistrés.";
    }
}

watch(() => props.studentId, () => { editing.value = false; load(); });
onMounted(load);
</script>

<template>
    <div class="mb-5">
        <div class="flex items-center justify-between">
            <p class="sec">Régimes & allergies</p>
            <button v-if="can('student:write') && !editing" class="btn-ghost btn-sm mb-2" @click="open">Modifier</button>
        </div>
        <template v-if="!editing">
            <div v-if="items.length" class="flex flex-wrap gap-1.5">
                <UiPill v-for="d in items" :key="d.kind" :tone="isAllergy(d.kind) ? 'late' : 'info'">{{ dietLabel(d.kind, d.label) }}</UiPill>
            </div>
            <p v-else class="text-[12.5px]" style="color: var(--text-faint)">Aucun régime ni allergie déclaré.</p>
        </template>
        <div v-else class="card p-3.5">
            <div class="grid grid-cols-2 gap-2 text-[12.5px]">
                <label v-for="d in DIETS" :key="d.value" class="flex items-center gap-2">
                    <input type="checkbox" :checked="selected.has(d.value)" @change="toggle(d.value)" />
                    <span :style="d.allergy ? 'color: var(--danger)' : ''">{{ d.label }}</span>
                </label>
            </div>
            <input
                v-if="selected.has('ALLERGY_OTHER')" v-model="otherLabel" type="text" maxlength="128"
                class="input mt-2" placeholder="Laquelle ? (ex. : crustacés)" aria-label="Autre allergie"
            />
            <p v-if="error" class="alert-danger mt-2">{{ error }}</p>
            <div class="flex gap-2 mt-3">
                <button class="btn-primary btn-sm" @click="save">Enregistrer</button>
                <button class="btn-secondary btn-sm" @click="editing = false">Annuler</button>
            </div>
        </div>
    </div>
</template>
