<script setup lang="ts">
/**
 * Une heure choisie dans un panneau, jamais tapée.
 *
 * <p>Le champ tapé qu'on avait laissait passer deux fautes. La faute de frappe d'abord — quatre
 * chiffres à l'aveugle, `07:30` pour `17:30`. La saisie inachevée ensuite : `09:3` ne fait pas une
 * heure, le modèle repassait à vide et l'activité s'enregistrait sans créneau, sans que rien ne le
 * dise. Deux colonnes ne produisent que des heures qui existent, ou rien du tout.
 *
 * <p>Le choix n'est pas retenu tant qu'« OK » n'est pas pressé : ouvrir le panneau pour aller voir,
 * puis se raviser, ne doit pas modifier la fiche. « Effacer » est le seul autre chemin qui écrit,
 * et il écrit le vide — l'école qui a posé un horaire par erreur doit pouvoir le retirer.
 *
 * <p>L'heure reste sur 24 heures, quelle que soit la langue du navigateur. C'est la raison d'être
 * de ce composant : `<input type="time">` suit la locale et affiche `02:30 PM` sur un poste réglé
 * en anglais, là où une école ivoirienne écrit `14:30`. Un sélecteur AM/PM rejouerait ce défaut de
 * son plein gré.
 *
 * <p>La valeur échangée reste `HH:mm`, toujours complète, celle que le serveur attend.
 */
const props = withDefaults(defineProps<{
    modelValue?: string;
    id?: string;
    required?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
}>(), { modelValue: '' });

const emit = defineEmits<{ 'update:modelValue': [string] }>();

/** Pas de cinq minutes : les créneaux d'une école tombent dessus, et la colonne reste parcourable. */
const MINUTE_STEP = 5;

/** Là où le panneau se pose quand rien n'est encore choisi — l'heure d'ouverture d'une école. */
const DEFAULT_TIME = '08:00';

/** Hauteur approchée du panneau, pour décider s'il s'ouvre vers le haut. */
const PANEL_HEIGHT = 290;

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) =>
    String(i * MINUTE_STEP).padStart(2, '0'));

const open = ref(false);
const above = ref(false);
const draftHour = ref('');
const draftMinute = ref('');

const root = ref<HTMLElement | null>(null);
const hourList = ref<HTMLElement | null>(null);
const minuteList = ref<HTMLElement | null>(null);

/** L'heure retenue, `HH:mm` ou rien. Une valeur tronquée venue du serveur est ramenée à cinq caractères. */
const display = computed(() => (/^\d{2}:\d{2}/.test(props.modelValue ?? '')
    ? (props.modelValue as string).slice(0, 5)
    : ''));

const draft = computed(() => `${draftHour.value}:${draftMinute.value}`);

/**
 * Minutes proposées.
 *
 * <p>Un horaire déjà enregistré hors du pas de cinq — repris d'un import ou de l'ancien champ
 * tapé — s'ajoute à la colonne, sinon l'ouvrir puis valider l'arrondirait à l'insu de l'école.
 */
const minuteOptions = computed(() => (draftMinute.value && !MINUTES.includes(draftMinute.value)
    ? [...MINUTES, draftMinute.value].sort()
    : MINUTES));

/**
 * Amène la ligne retenue au milieu de sa colonne.
 *
 * <p>`scrollIntoView` ferait aussi défiler la page derrière le panneau : on ne bouge que le
 * conteneur.
 */
function center(list: HTMLElement | null) {
    const selected = list?.querySelector<HTMLElement>('[data-selected="true"]');
    if (!list || !selected) return;
    // « instant » et non le défilement doux de la feuille de style : animer depuis le haut au
    // moment où le panneau paraît laissait les colonnes sur 00.
    list.scrollTo({
        top: selected.offsetTop - (list.clientHeight - selected.clientHeight) / 2,
        behavior: 'instant' as ScrollBehavior,
    });
}

function openPanel() {
    if (props.disabled) return;
    const start = display.value || DEFAULT_TIME;
    draftHour.value = start.slice(0, 2);
    draftMinute.value = start.slice(3, 5);

    // Près du bas de la fenêtre, le panneau se retourne : sinon il sort de l'écran et la moitié
    // des heures devient inatteignable.
    const box = root.value?.getBoundingClientRect();
    above.value = Boolean(box) && box!.bottom + PANEL_HEIGHT > window.innerHeight
        && box!.top > PANEL_HEIGHT;

    open.value = true;
    // Après la trame, pas seulement après `nextTick` : la colonne doit être posée pour que sa
    // hauteur et celle de ses lignes se mesurent.
    nextTick(() => requestAnimationFrame(() => {
        center(hourList.value);
        center(minuteList.value);
    }));
}

function cancel() {
    open.value = false;
}

function commit() {
    emit('update:modelValue', draft.value);
    open.value = false;
}

function clear() {
    emit('update:modelValue', '');
    open.value = false;
}

function onDocumentPointerDown(event: PointerEvent) {
    // Cliquer ailleurs revient à renoncer : rien n'est écrit sans « OK ».
    if (!root.value?.contains(event.target as Node)) cancel();
}

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
        event.stopPropagation();
        cancel();
    } else if (event.key === 'Enter') {
        event.preventDefault();
        commit();
    }
}

watch(open, (value) => {
    if (value) document.addEventListener('pointerdown', onDocumentPointerDown);
    else document.removeEventListener('pointerdown', onDocumentPointerDown);
});

onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown));
</script>

<template>
    <div ref="root" class="time-root">
        <button
            :id="id" type="button" class="input time-trigger"
            :disabled="disabled" :aria-required="required || undefined"
            :aria-label="ariaLabel ?? 'Heure'"
            aria-haspopup="dialog" :aria-expanded="open"
            @click="open ? cancel() : openPanel()"
        >
            <span :class="display ? '' : 'time-empty'">{{ display || '--:--' }}</span>
            <BoIcon name="clock" :size="16" :class="open ? 'time-icon-on' : 'time-icon'" />
        </button>

        <div
            v-if="open" class="time-panel" :class="{ 'time-panel-above': above }"
            role="dialog" aria-label="Choisir une heure" @keydown="onKeydown"
        >
            <p class="time-preview">{{ draft }}</p>

            <div class="time-cols">
                <div class="time-col">
                    <p class="time-head">Heure</p>
                    <div ref="hourList" class="time-scroll" role="listbox" aria-label="Heures">
                        <button
                            v-for="h in HOURS" :key="h" type="button" role="option"
                            class="time-opt" :data-selected="h === draftHour"
                            :aria-selected="h === draftHour"
                            @click="draftHour = h"
                        >{{ h }}</button>
                    </div>
                </div>
                <div class="time-col">
                    <p class="time-head">Minute</p>
                    <div ref="minuteList" class="time-scroll" role="listbox" aria-label="Minutes">
                        <button
                            v-for="m in minuteOptions" :key="m" type="button" role="option"
                            class="time-opt" :data-selected="m === draftMinute"
                            :aria-selected="m === draftMinute"
                            @click="draftMinute = m"
                        >{{ m }}</button>
                    </div>
                </div>
            </div>

            <div class="time-actions">
                <button type="button" class="time-link" @click="clear">Effacer</button>
                <button type="button" class="time-link" @click="cancel">Annuler</button>
                <button type="button" class="time-ok" @click="commit">OK</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.time-root {
    position: relative;
}

.time-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .5rem;
    text-align: left;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
}

.time-trigger:disabled {
    cursor: not-allowed;
    opacity: .6;
}

.time-empty {
    color: var(--text-faint);
}

.time-icon {
    color: var(--text-faint);
    flex: none;
}

.time-icon-on {
    color: var(--brand-500);
    flex: none;
}

.time-panel {
    position: absolute;
    z-index: 40;
    top: calc(100% + 6px);
    left: 0;
    width: 15rem;
    max-width: calc(100vw - 2rem);
    padding: .75rem;
    background-color: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: 0 12px 28px rgba(11, 46, 102, .16);
}

.time-panel-above {
    top: auto;
    bottom: calc(100% + 6px);
}

.time-preview {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: .01em;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    text-align: center;
    padding-bottom: .5rem;
}

.time-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: .5rem;
}

.time-head {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--text-faint);
    text-align: center;
    padding-bottom: .25rem;
}

.time-scroll {
    /* Repère des lignes : sans quoi leur `offsetTop` se mesure depuis `.time-root`, seul ancêtre
       positionné, et le calcul du milieu vise soixante-dix pixels trop bas. */
    position: relative;
    /* Cinq lignes entières, pas cinq et demie : une ligne coupée en deux se lit comme un défaut
       d'affichage, pas comme une invitation à défiler. */
    height: calc(5 * 32px + .5rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    scroll-snap-type: y proximity;
    background-color: var(--surface-sunken);
    border-radius: var(--radius);
    padding: .25rem;
}

.time-scroll::-webkit-scrollbar {
    width: 4px;
}

.time-scroll::-webkit-scrollbar-thumb {
    background-color: var(--border-strong);
    border-radius: 4px;
}

.time-scroll {
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
}

.time-opt {
    display: block;
    width: 100%;
    height: 32px;
    line-height: 32px;
    scroll-snap-align: center;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    border-radius: 6px;
    transition: background-color .12s, color .12s;
}

.time-opt:hover {
    background-color: var(--brand-50);
    color: var(--text);
}

.time-opt[data-selected="true"] {
    background-color: var(--brand-500);
    color: #fff;
    font-weight: 600;
}

.time-actions {
    display: flex;
    align-items: center;
    gap: .25rem;
    padding-top: .6rem;
}

.time-link {
    font-size: 13px;
    padding: .3rem .5rem;
    border-radius: 6px;
    color: var(--text-muted);
}

.time-link:hover {
    background-color: var(--surface-sunken);
    color: var(--text);
}

/* « Effacer » d'un côté, « Annuler » et « OK » de l'autre : le geste qui écrit le vide ne doit
   pas voisiner celui qui valide. */
.time-link:first-child {
    margin-right: auto;
}

.time-ok {
    font-size: 13px;
    font-weight: 600;
    padding: .3rem .9rem;
    border-radius: 6px;
    background-color: var(--brand-500);
    color: #fff;
}

.time-ok:hover {
    background-color: var(--brand-700);
}
</style>
