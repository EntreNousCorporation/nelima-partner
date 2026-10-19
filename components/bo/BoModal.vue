<script setup lang="ts">
/**
 * Fenêtre de la maquette (`.mdl`) : pastille d'icône, titre, sous-titre, corps, pied.
 *
 * Elle reste dans la page plutôt que d'être téléportée : les styles de la maquette sont limités au
 * conteneur `.bo-page`, et une fenêtre sortie de ce conteneur perdrait son dessin.
 */
withDefaults(defineProps<{ title: string; sub?: string | null; icon?: string; width?: number }>(), { width: 640 });
const emit = defineEmits<{ close: [] }>();

function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
    <div class="mdl-back" @click.self="emit('close')">
        <div class="mdl" role="dialog" aria-modal="true" :aria-label="title" :style="{ maxWidth: `${width}px` }">
            <div class="mdl-h">
                <div v-if="icon" class="sic" style="width: 38px; height: 38px; border-radius: 11px">
                    <BoIcon :name="icon" :size="19" />
                </div>
                <div style="flex: 1 1 0%; min-width: 0">
                    <h3>{{ title }}</h3>
                    <p v-if="sub">{{ sub }}</p>
                </div>
                <button type="button" class="ic-btn" style="color: var(--tx2)" aria-label="Fermer" @click="emit('close')">
                    <BoIcon name="close" :size="19" />
                </button>
            </div>
            <div class="mdl-b"><slot /></div>
            <div v-if="$slots.footer" class="mdl-f"><slot name="footer" /></div>
        </div>
    </div>
</template>
