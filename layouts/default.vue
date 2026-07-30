<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
const route = useRoute();

/**
 * Navigation groupée par nature de travail.
 *
 * Sept entrées à plat se lisent comme une liste à parcourir ; groupées, elles se retrouvent d'un
 * coup d'œil — ce qui compte sur un poste occupé toute la journée.
 *
 * Les pictogrammes sont des tracés SVG et non une police d'icônes : charger une police entière
 * retarderait le premier rendu pour sept symboles.
 */
const sections = [
    {
        label: 'Pilotage',
        items: [
            { label: 'Tableau de bord', to: '/app', icon: 'M3 12h4l3 8 4-16 3 8h4' },
        ],
    },
    {
        label: 'Établissement',
        items: [
            { label: 'Niveaux', to: '/app/niveaux', icon: 'M4 7h16M4 12h16M4 17h10' },
            { label: 'Élèves', to: '/app/eleves', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0' },
            { label: 'Frais', to: '/app/frais', icon: 'M12 3v18M8 7h6a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7' },
        ],
    },
    {
        label: 'Caisse',
        items: [
            { label: 'Encaissement', to: '/app/encaissement', icon: 'M3 8h18v10H3zM3 8l2-4h14l2 4M8 13h8' },
            { label: 'Impayés', to: '/app/impayes', icon: 'M12 8v5M12 16.5v.5M3.5 19h17L12 4z' },
            { label: 'Reçus', to: '/app/recus', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6' },
        ],
    },
];

const initials = computed(() => (auth.fullName ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join('') || '—');

async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' });
    auth.clear();
    await navigateTo('/connexion');
}
</script>

<template>
    <div v-if="auth.isAuthenticated" class="min-h-screen flex">
        <aside
            class="w-64 shrink-0 flex flex-col"
            style="background-color: var(--surface-raised); border-right: 1px solid var(--border)"
        >
            <div class="px-5 py-5 flex items-center gap-3">
                <NelimaMark :size="32" />
                <div class="min-w-0">
                    <p class="text-sm font-semibold leading-tight">Nelima</p>
                    <p class="text-xs truncate" style="color: var(--text-muted)">
                        {{ auth.user?.establishmentName ?? 'Établissement' }}
                    </p>
                </div>
            </div>

            <nav class="flex-1 px-3 pb-4 space-y-6 overflow-y-auto">
                <div v-for="section in sections" :key="section.label">
                    <p
                        class="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider"
                        style="color: var(--text-faint)"
                    >
                        {{ section.label }}
                    </p>
                    <NuxtLink
                        v-for="item in section.items"
                        :key="item.to"
                        :to="item.to"
                        class="nav-link"
                        :class="route.path === item.to ? 'nav-link-active' : ''"
                    >
                        <svg
                            class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="1.8"
                            stroke-linecap="round" stroke-linejoin="round"
                        >
                            <path :d="item.icon" />
                        </svg>
                        {{ item.label }}
                    </NuxtLink>
                </div>
            </nav>

            <div class="px-3 py-4" style="border-top: 1px solid var(--border)">
                <div class="flex items-center gap-3 px-2">
                    <span
                        class="w-8 h-8 shrink-0 rounded-full grid place-items-center text-xs font-semibold"
                        style="background-color: var(--brand-50); color: var(--brand-700)"
                    >{{ initials }}</span>
                    <p class="text-sm font-medium truncate">{{ auth.fullName }}</p>
                </div>
                <button class="btn-ghost btn-sm w-full mt-2 justify-start" @click="logout">
                    <svg
                        class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
                    >
                        <path d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" />
                    </svg>
                    Se déconnecter
                </button>
            </div>
        </aside>

        <main class="flex-1 min-w-0 overflow-x-auto">
            <div class="max-w-[1400px] px-8 py-7">
                <slot />
            </div>
        </main>
    </div>

    <div v-else class="min-h-screen">
        <slot />
    </div>
</template>
