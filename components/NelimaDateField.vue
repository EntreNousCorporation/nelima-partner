<script setup lang="ts">
/**
 * Une date saisie et lue en français, quelle que soit la langue du navigateur.
 *
 * <p>`<input type="date">` affiche son format d'après la **langue du navigateur**, pas celle de la
 * page : `lang="fr"` est posé sur le document depuis toujours, et un poste réglé en anglais montre
 * pourtant `mm/dd/yyyy`. Sur une date d'échéance, l'ambiguïté n'est pas cosmétique — `08/09/2026`
 * désigne deux mois différents selon qui le lit.
 *
 * <p>D'où un champ texte masqué : on tape les chiffres, les barres s'insèrent, et l'ordre est
 * toujours jour-mois-année. Le calendrier natif reste accessible par le bouton — c'est une grille,
 * elle se lit sans langue.
 *
 * <p>La valeur échangée reste l'ISO `AAAA-MM-JJ` que le serveur attend : seul l'affichage change.
 */
const props = withDefaults(defineProps<{
    modelValue?: string;
    id?: string;
    required?: boolean;
    disabled?: boolean;
    min?: string;
    max?: string;
    ariaLabel?: string;
}>(), { modelValue: '' });

const emit = defineEmits<{ 'update:modelValue': [string] }>();

const picker = ref<HTMLInputElement | null>(null);

function toDisplay(iso?: string): string {
    const [year, month, day] = (iso ?? '').slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : '';
}

/** Rend l'ISO, ou une chaîne vide si la saisie n'est pas une date réelle. */
function toIso(display: string): string {
    const parts = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!parts) return '';
    const [, day, month, year] = parts;
    // `new Date(2026, 1, 31)` bascule au 3 mars sans se plaindre : on vérifie que la date rendue
    // est bien celle demandée, sinon le 31 février passerait pour valide.
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    const faithful = date.getFullYear() === Number(year)
        && date.getMonth() === Number(month) - 1
        && date.getDate() === Number(day);
    return faithful ? `${year}-${month}-${day}` : '';
}

const text = ref(toDisplay(props.modelValue));

// Suivre la propriété quand elle change ailleurs — un formulaire vidé, une fiche rouverte — sans
// écraser la frappe en cours, dont l'ISO correspond déjà à la valeur du modèle.
watch(() => props.modelValue, (value) => {
    if (toIso(text.value) !== (value ?? '')) text.value = toDisplay(value);
});

const invalid = computed(() => text.value.length === 10 && !toIso(text.value));

function onInput(event: Event) {
    const digits = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8);
    let masked = digits.slice(0, 2);
    if (digits.length > 2) masked += `/${digits.slice(2, 4)}`;
    if (digits.length > 4) masked += `/${digits.slice(4, 8)}`;
    text.value = masked;
    emit('update:modelValue', toIso(masked));
}

function onPick(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    text.value = toDisplay(value);
    emit('update:modelValue', value);
}

/**
 * `showPicker` demande un geste de l'utilisateur : le clic sur le bouton en est un.
 *
 * <p>Sur un navigateur qui ne le connaît pas, on ne fait rien plutôt que d'échouer bruyamment —
 * la saisie au clavier suffit.
 */
function openPicker() {
    try {
        picker.value?.showPicker?.();
    } catch {
        /* le champ texte reste utilisable */
    }
}
</script>

<template>
    <div class="relative">
        <input
            :id="id" :value="text" type="text" inputmode="numeric" maxlength="10"
            :required="required" :disabled="disabled"
            :aria-label="ariaLabel" :aria-invalid="invalid || undefined"
            placeholder="jj/mm/aaaa" class="input" style="padding-right: 2.25rem"
            :style="invalid ? 'border-color: var(--danger)' : ''"
            @input="onInput"
        />

        <!-- Le calendrier natif, gardé pour ceux qui préfèrent pointer que taper. Il est hors du
             parcours de tabulation : le champ texte est la voie principale. -->
        <button
            type="button" tabindex="-1" :disabled="disabled"
            class="absolute top-0 right-0 h-full px-2.5 flex items-center"
            style="color: var(--text-faint)" aria-label="Ouvrir le calendrier"
            @click="openPicker"
        >
            <BoIcon name="calendar" :size="16" />
        </button>

        <input
            ref="picker" type="date" :value="modelValue" :min="min" :max="max"
            tabindex="-1" aria-hidden="true"
            class="absolute right-0 bottom-0 opacity-0 pointer-events-none"
            style="width: 1px; height: 1px"
            @change="onPick"
        />

        <p v-if="invalid" class="mt-1 text-[12px]" style="color: var(--danger)">
            Date incomplète ou inexistante.
        </p>
    </div>
</template>
