<script setup lang="ts">
import { pillStyle, type BoTone } from '~/composables/useBoTones';

/** Bandeau de la maquette (`Banner`) : pastille d'icône, titre, texte, actions à droite. */
const props = withDefaults(defineProps<{ tone?: BoTone; icon: string; title: string; text?: string | null }>(), { tone: 'info' });

/** Bordure : la couleur du ton à 20 %, comme `fg + '33'` dans la maquette. */
const BORDERS: Record<BoTone, string> = {
    ok: 'rgba(18, 153, 106, 0.2)',
    warn: 'rgba(150, 98, 10, 0.2)',
    late: 'rgba(196, 54, 59, 0.2)',
    info: 'rgba(3, 68, 173, 0.2)',
    mute: 'rgba(90, 107, 130, 0.2)',
};
const tone = computed(() => pillStyle(props.tone));
</script>

<template>
    <div class="bnr" :style="{ background: tone.background, borderColor: BORDERS[props.tone] }">
        <div style="width: 34px; height: 34px; border-radius: 10px; background: var(--surface-raised); display: grid; place-items: center; flex-shrink: 0" :style="{ color: tone.color }">
            <BoIcon :name="icon" :size="18" />
        </div>
        <div style="flex: 1 1 0%; min-width: 0">
            <b class="nu" style="font-size: 14px; letter-spacing: -0.1px" :style="{ color: tone.color }">{{ title }}</b>
            <div v-if="text" style="font: 500 12.5px / 1.45 Inter; color: var(--tx2); margin-top: 2px">{{ text }}</div>
        </div>
        <slot name="action" />
    </div>
</template>
