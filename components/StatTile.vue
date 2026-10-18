<script setup lang="ts">
/**
 * Carte d'indicateur de l'écran Élèves : l'icône dans sa pastille, le libellé, le chiffre, un pied.
 *
 * Distincte de KpiCard, qui porte un écart chiffré et un anneau : ici la teinte de la pastille
 * suffit à dire de quoi l'on parle, et le pied peut prendre la couleur d'un état (à réclamer, fait).
 */
defineProps<{
    label: string;
    icon: string;
    value: string;
    /** Couleur de l'icône ; la pastille en prend la version douce. */
    tone: string;
    soft: string;
    foot?: string;
    footTone?: string;
    footIcon?: string;
    tip?: string;
}>();
</script>

<template>
    <div class="card p-[14px_15px] flex items-start gap-3">
        <span
            class="w-10 h-10 rounded-xl grid place-items-center shrink-0"
            :style="{ background: soft, color: tone }"
        >
            <BoIcon :name="icon" :size="18" :stroke-width="2" />
        </span>
        <div class="min-w-0">
            <div class="flex items-center gap-1.5 text-[12.5px] font-bold" style="color: var(--text)">
                {{ label }}<InfoDot v-if="tip" :tip="tip" />
            </div>
            <div class="kpi-value" style="margin-top: 4px">{{ value }}</div>
            <div
                v-if="foot" class="flex items-center gap-1 mt-1.5 text-[11.5px] font-semibold"
                :style="{ color: footTone ?? 'var(--text-faint)' }"
            >
                <BoIcon v-if="footIcon" :name="footIcon" :size="12" :stroke-width="2.3" />
                {{ foot }}
            </div>
        </div>
    </div>
</template>
