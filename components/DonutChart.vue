<script setup lang="ts">
/**
 * Anneau découpé en segments, avec sa légende chiffrée.
 *
 * Les segments se dessinent avec `stroke-dasharray`, sans bibliothèque : trois ou quatre parts ne
 * justifient pas d'embarquer un moteur de graphiques, et l'anneau suit les jetons du mode sombre.
 */
export type DonutSegment = { label: string; value: number; color: string };

const props = withDefaults(defineProps<{
    segments: DonutSegment[];
    size?: number;
    stroke?: number;
    /** Texte au centre : le total, en général. */
    centerValue?: string;
    centerLabel?: string;
}>(), { size: 150, stroke: 22 });

const radius = computed(() => (props.size - props.stroke) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);
const total = computed(() => props.segments.reduce((sum, segment) => sum + segment.value, 0));

/** Chaque segment commence où le précédent s'arrête. */
const arcs = computed(() => {
    let offset = 0;
    return props.segments.filter((segment) => segment.value > 0).map((segment) => {
        const length = total.value ? (segment.value / total.value) * circumference.value : 0;
        const arc = { ...segment, dash: `${length} ${circumference.value - length}`, offset: -offset };
        offset += length;
        return arc;
    });
});

function share(value: number) {
    return total.value ? Math.round((value / total.value) * 100) : 0;
}

const fmt = (value: number) => value.toLocaleString('fr-FR');
</script>

<template>
    <div class="flex flex-wrap items-center justify-center gap-6">
        <svg
            :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="shrink-0"
            role="img" :aria-label="segments.map((s) => `${s.label} ${s.value}`).join(', ')"
        >
            <circle
                :cx="size / 2" :cy="size / 2" :r="radius" fill="none"
                stroke="var(--border)" :stroke-width="stroke"
            />
            <circle
                v-for="arc in arcs" :key="arc.label"
                :cx="size / 2" :cy="size / 2" :r="radius" fill="none"
                :stroke="arc.color" :stroke-width="stroke"
                :stroke-dasharray="arc.dash" :stroke-dashoffset="arc.offset"
                :transform="`rotate(-90 ${size / 2} ${size / 2})`"
            />
            <template v-if="centerValue">
                <text
                    :x="size / 2" :y="size / 2 - 6" text-anchor="middle" dominant-baseline="central"
                    style="font: 900 22px Nunito, sans-serif; fill: var(--navy)"
                >{{ centerValue }}</text>
                <text
                    :x="size / 2" :y="size / 2 + 15" text-anchor="middle" dominant-baseline="central"
                    style="font: 600 11.5px Inter, sans-serif; fill: var(--text-faint)"
                >{{ centerLabel }}</text>
            </template>
        </svg>
        <ul class="flex flex-col gap-2.5 min-w-[180px] flex-1">
            <li v-for="segment in segments" :key="segment.label" class="flex items-center gap-2 text-[12.5px]">
                <i class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: segment.color }" />
                <span class="flex-1" style="color: var(--text)">{{ segment.label }}</span>
                <b class="nu" style="color: var(--navy)">{{ fmt(segment.value) }}</b>
                <span class="nu w-[46px] text-right" style="color: var(--text-faint)">({{ share(segment.value) }} %)</span>
            </li>
        </ul>
    </div>
</template>
