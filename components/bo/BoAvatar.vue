<script setup lang="ts">
/**
 * Pastille `.av` de la maquette : initiales sur une teinte déduite du nom, ou la photo.
 * Mêmes teintes et même règle que `AvatarBadge`, au gabarit exact de la maquette.
 */
const props = withDefaults(defineProps<{ name?: string | null; size?: number; src?: string | null; tone?: string }>(), { size: 32 });

const TONES = ['#9DC8FF', '#C9F5C5', '#FFD9A0', '#D6C8FF', '#A9E7E0', '#FFB7C0', '#BFD4FF', '#FFC2E2'];

const failed = ref(false);
watch(() => props.src, () => { failed.value = false; });

const initials = computed(() => (props.name ?? '').split(' ').filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase()).join('') || '—');
const background = computed(() => {
    if (props.tone) return props.tone;
    let sum = 0;
    for (const char of props.name ?? '') sum += char.charCodeAt(0);
    return TONES[sum % TONES.length];
});
</script>

<template>
    <div
        class="av"
        :style="{ width: `${size}px`, height: `${size}px`, background, fontSize: `${size * 0.38}px`, color: 'var(--nv)', overflow: 'hidden' }"
    >
        <img v-if="src && !failed" :src="src" alt="" style="width: 100%; height: 100%; object-fit: cover" @error="failed = true" />
        <template v-else>{{ initials }}</template>
    </div>
</template>
