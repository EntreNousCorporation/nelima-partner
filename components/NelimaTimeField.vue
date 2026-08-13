<script setup lang="ts">
/**
 * Une heure saisie et lue sur 24 heures, quelle que soit la langue du navigateur.
 *
 * <p>Même cause que {@link NelimaDateField} : `<input type="time">` suit la langue du navigateur,
 * si bien qu'un poste réglé en anglais affiche `02:30 PM` là où une école ivoirienne écrit
 * `14:30`. Le retour de test disait simplement « l'heure est en anglais ».
 *
 * <p>La valeur échangée reste `HH:mm`, celle que le serveur attend et que l'`input type="time"`
 * produisait déjà : seul l'affichage change.
 */
const props = withDefaults(defineProps<{
    modelValue?: string;
    id?: string;
    required?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
}>(), { modelValue: '' });

const emit = defineEmits<{ 'update:modelValue': [string] }>();

function toDisplay(value?: string): string {
    const parts = (value ?? '').match(/^(\d{2}):(\d{2})/);
    return parts ? `${parts[1]}:${parts[2]}` : '';
}

/** Rend `HH:mm`, ou une chaîne vide si l'heure n'existe pas. */
function normalize(display: string): string {
    const parts = display.match(/^(\d{2}):(\d{2})$/);
    if (!parts) return '';
    const hours = Number(parts[1]);
    const minutes = Number(parts[2]);
    return hours <= 23 && minutes <= 59 ? `${parts[1]}:${parts[2]}` : '';
}

const text = ref(toDisplay(props.modelValue));

watch(() => props.modelValue, (value) => {
    if (normalize(text.value) !== (value ?? '')) text.value = toDisplay(value);
});

const invalid = computed(() => text.value.length === 5 && !normalize(text.value));

function onInput(event: Event) {
    const digits = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4);
    text.value = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2, 4)}` : digits;
    emit('update:modelValue', normalize(text.value));
}
</script>

<template>
    <div>
        <input
            :id="id" :value="text" type="text" inputmode="numeric" maxlength="5"
            :required="required" :disabled="disabled"
            :aria-label="ariaLabel" :aria-invalid="invalid || undefined"
            placeholder="hh:mm" class="input"
            :style="invalid ? 'border-color: var(--danger)' : ''"
            @input="onInput"
        />
        <p v-if="invalid" class="mt-1 text-[12px]" style="color: var(--danger)">
            Heure inexistante — de 00:00 à 23:59.
        </p>
    </div>
</template>
