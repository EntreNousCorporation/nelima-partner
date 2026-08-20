<script setup lang="ts">
/**
 * Une heure choisie dans deux listes, jamais tapée.
 *
 * <p>Le champ tapé qu'on avait avant laissait passer deux fautes. La faute de frappe d'abord —
 * quatre chiffres à l'aveugle, `07:30` pour `17:30`. La saisie inachevée ensuite : `09:3` ne fait
 * pas une heure, le modèle repassait à vide et l'activité s'enregistrait sans créneau, sans que
 * rien ne le dise. Deux listes ne produisent que des heures qui existent, ou rien du tout.
 *
 * <p>Même raison qu'auparavant de ne pas prendre `<input type="time">` : il suit la langue du
 * navigateur et affiche `02:30 PM` sur un poste réglé en anglais, là où une école ivoirienne écrit
 * `14:30`.
 *
 * <p>La valeur échangée reste `HH:mm`, celle que le serveur attend. Elle est désormais toujours
 * complète : l'heure choisie sans les minutes vaut l'heure pile.
 */
const props = withDefaults(defineProps<{
    modelValue?: string;
    id?: string;
    required?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
}>(), { modelValue: '' });

const emit = defineEmits<{ 'update:modelValue': [string] }>();

/** Pas de cinq minutes : les créneaux d'une école tombent dessus, et la liste reste lisible. */
const MINUTE_STEP = 5;

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) =>
    String(i * MINUTE_STEP).padStart(2, '0'));

const hour = ref('');
const minute = ref('');

function read(value?: string) {
    const parts = (value ?? '').match(/^(\d{2}):(\d{2})/);
    hour.value = parts ? parts[1] : '';
    minute.value = parts ? parts[2] : '';
}

read(props.modelValue);

watch(() => props.modelValue, (value) => {
    if (`${hour.value}:${minute.value}` !== (value ?? '')) read(value);
});

/**
 * Minutes proposées.
 *
 * <p>Un horaire déjà enregistré hors du pas de cinq — repris d'un import ou de l'ancien champ
 * tapé — s'ajoute à la liste, sinon l'ouverture du formulaire l'effacerait à l'insu de l'école.
 */
const minuteOptions = computed(() => (minute.value && !MINUTES.includes(minute.value)
    ? [...MINUTES, minute.value].sort()
    : MINUTES));

function onHour(event: Event) {
    hour.value = (event.target as HTMLSelectElement).value;
    if (!hour.value) minute.value = '';
    // L'heure sans les minutes vaut l'heure pile : personne ne veut choisir « 00 » deux fois par jour.
    else if (!minute.value) minute.value = '00';
    emit('update:modelValue', hour.value ? `${hour.value}:${minute.value}` : '');
}

function onMinute(event: Event) {
    // « -- » remis sur les minutes seules ne veut rien dire : c'est l'heure pile qu'on entend.
    minute.value = (event.target as HTMLSelectElement).value || '00';
    emit('update:modelValue', hour.value ? `${hour.value}:${minute.value}` : '');
}
</script>

<template>
    <div class="flex items-center gap-1.5">
        <select
            :id="id" :value="hour" class="select" style="flex: 1 1 0"
            :required="required" :disabled="disabled"
            :aria-label="ariaLabel ? `${ariaLabel} — heure` : 'Heure'"
            @change="onHour"
        >
            <option value="">--</option>
            <option v-for="h in HOURS" :key="h" :value="h">{{ h }}</option>
        </select>
        <span class="nu text-sm" aria-hidden="true">:</span>
        <select
            :value="minute" class="select" style="flex: 1 1 0"
            :disabled="disabled || !hour"
            :aria-label="ariaLabel ? `${ariaLabel} — minutes` : 'Minutes'"
            @change="onMinute"
        >
            <option value="">--</option>
            <option v-for="m in minuteOptions" :key="m" :value="m">{{ m }}</option>
        </select>
    </div>
</template>
