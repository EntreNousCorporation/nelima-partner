<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';
import type { Site } from '~/composables/useSites';

/**
 * Le site affiché, dans la barre du haut.
 *
 * Pour une direction de groupe, c'est un sélecteur : choisir un site fait basculer tout l'espace
 * école sur lui (la page est rechargée, chaque écran relit ses données). « Tous les sites » ouvre la
 * vue consolidée. Pour les autres comptes, c'est le nom de l'école, comme avant.
 */
const auth = useAuthStore();
const sitesApi = useSites();
const open = ref(false);
const sites = ref<Site[]>([]);
const currentId = ref('');
const switching = ref(false);

const groupWide = computed(() => !!auth.user?.groupWide);

async function toggle() {
    open.value = !open.value;
    if (open.value && !sites.value.length) {
        try {
            const data = await sitesApi.sites();
            sites.value = data.sites;
            currentId.value = data.currentId;
        } catch {
            open.value = false;
        }
    }
}

async function choose(site: Site) {
    if (site.id === currentId.value) {
        open.value = false;
        return;
    }
    switching.value = true;
    try {
        await sitesApi.switchTo(site.id);
        await $fetch('/api/me', { query: { refresh: '1' } });
        window.location.assign('/app');
    } finally {
        switching.value = false;
    }
}

function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') open.value = false;
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
    <span
        v-if="!groupWide"
        class="hidden md:flex items-center h-[34px] px-2.5 rounded-lg text-[13px] font-semibold truncate max-w-xs"
        style="background: rgba(255,255,255,.09)"
    >{{ auth.user?.establishmentName ?? 'Établissement' }}</span>
    <div v-else class="relative hidden md:block">
        <button
            type="button" class="flex items-center gap-1.5 h-[34px] px-2.5 rounded-lg text-[13px] font-semibold max-w-xs"
            style="background: rgba(255,255,255,.09)" :aria-expanded="open" aria-haspopup="listbox" @click="toggle"
        >
            <span class="truncate">{{ auth.user?.establishmentName ?? 'Établissement' }}</span>
            <BoIcon name="chevron-down" :size="14" />
        </button>
        <div v-if="open" class="fixed inset-0 z-40" @click="open = false" />
        <div
            v-if="open" role="listbox"
            class="absolute left-0 top-[40px] z-50 w-72 rounded-xl py-1.5 shadow-lg"
            style="background: var(--surface-raised); border: 1px solid var(--border); color: var(--text)"
        >
            <p class="px-3 pt-1 pb-2 text-[11px] font-bold uppercase" style="letter-spacing: .08em; color: var(--text-faint)">
                {{ auth.user?.schoolGroupName ?? 'Sites du groupe' }}
            </p>
            <button
                v-for="site in sites" :key="site.id" type="button" role="option" :aria-selected="site.id === currentId"
                class="flex items-center justify-between w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-sunken)]"
                :disabled="switching" @click="choose(site)"
            >
                <span>
                    <b class="block font-semibold">{{ site.name }}</b>
                    <span v-if="site.city" class="text-[11.5px]" style="color: var(--text-faint)">{{ site.city }}</span>
                </span>
                <BoIcon v-if="site.id === currentId" name="check" :size="16" style="color: var(--brand-600)" />
            </button>
            <div style="border-top: 1px solid var(--border)" class="mt-1.5 pt-1.5">
                <NuxtLink
                    to="/app/groupe" class="flex items-center gap-2 px-3 py-2 text-[13px] font-semibold hover:bg-[var(--surface-sunken)]"
                    style="color: var(--brand-600)" @click="open = false"
                ><BoIcon name="layers" :size="16" />Tous les sites</NuxtLink>
            </div>
        </div>
    </div>
</template>
