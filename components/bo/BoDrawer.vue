<script setup lang="ts">
/** Tiroir de la maquette (`.dw`), ouvert à droite par-dessus la page. */
defineProps<{ title: string; sub?: string | null }>();
const emit = defineEmits<{ close: [] }>();

function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
    <div>
        <div class="dw-back" @click="emit('close')" />
        <aside class="dw" role="dialog" aria-modal="true" :aria-label="title">
            <div class="dw-h">
                <div style="flex: 1 1 0%; min-width: 0">
                    <h3 class="nu" style="margin: 0; font-size: 17px; font-weight: 900; letter-spacing: -0.3px; color: var(--nv)">{{ title }}</h3>
                    <div v-if="sub" style="font: 500 12.5px / 1.4 Inter; color: var(--tx3); margin-top: 3px">{{ sub }}</div>
                </div>
                <button type="button" class="ic-btn" style="color: var(--tx2)" aria-label="Fermer" @click="emit('close')">
                    <BoIcon name="close" :size="19" />
                </button>
            </div>
            <div class="dw-b"><slot /></div>
            <div v-if="$slots.footer" class="dw-f"><slot name="footer" /></div>
        </aside>
    </div>
</template>
