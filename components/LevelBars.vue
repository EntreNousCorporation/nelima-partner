<script setup lang="ts">
/**
 * Histogramme vertical : une barre par cycle, l'effectif au-dessus, la part en dessous.
 *
 * Les hauteurs se rapportent à la plus grande barre et non au total : quatre cycles d'un quart
 * chacun dessineraient sinon quatre barres basses dans un grand vide.
 */
export type LevelBar = { label: string; value: number; color: string };

const props = defineProps<{ bars: LevelBar[] }>();

const max = computed(() => Math.max(1, ...props.bars.map((bar) => bar.value)));
const total = computed(() => props.bars.reduce((sum, bar) => sum + bar.value, 0));
const fmt = (value: number) => value.toLocaleString('fr-FR');
</script>

<template>
    <div class="flex items-end justify-around gap-3 h-[200px] pt-2">
        <div v-for="bar in bars" :key="bar.label" class="flex flex-col items-center gap-1.5 flex-1 h-full">
            <b class="nu text-[13px]" style="color: var(--navy)">{{ fmt(bar.value) }}</b>
            <div class="flex-1 w-full flex items-end justify-center">
                <div
                    class="w-full max-w-[64px] rounded-t-md"
                    :style="{ height: `${Math.max(2, (bar.value / max) * 100)}%`, background: bar.color }"
                />
            </div>
            <span class="text-[12px] font-semibold" style="color: var(--text-muted)">{{ bar.label }}</span>
            <span class="nu text-[11px]" style="color: var(--text-faint)">
                {{ total ? Math.round((bar.value / total) * 100) : 0 }} %
            </span>
        </div>
    </div>
</template>
