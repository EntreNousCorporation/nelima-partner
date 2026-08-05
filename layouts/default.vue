<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
const route = useRoute();

/**
 * Coquille reprise du prototype : barre bleu nuit fixe, onglets horizontaux sous elle.
 *
 * La barre latérale précédente coûtait 256 px de largeur en permanence, sur des écrans où l'on
 * consulte des tableaux de sept colonnes. Le prototype rend cette place au contenu et regroupe
 * l'identité, la recherche et le compte dans une bande de 56 px.
 */
/**
 * Onglets, avec la permission qui commande l'écran auquel ils mènent.
 *
 * Un onglet sans permission requise reste toujours visible : le tableau de bord et les impayés
 * n'appellent que des points d'entrée que tout compte d'établissement peut lire.
 *
 * Masquer n'est pas protéger — le serveur refuse l'appel de toute façon. Mais un onglet qui mène à
 * une page vide et à une erreur est une promesse que l'application ne tient pas.
 */
const allTabs = [
    { label: 'Tableau de bord', to: '/app', icon: 'M4 19V10M9.5 19V5M15 19v-7M20.5 19v-11' },
    { label: 'Paiements', to: '/app/paiements', icon: 'M3 8h18v10H3zM3 8l2-4h14l2 4M8 13h8' },
    { label: 'Classes', to: '/app/classes', icon: 'M3 7l9-4 9 4-9 4zM7 11v5l5 3 5-3v-5', permission: 'class:read' },
    { label: 'Calendrier', to: '/app/calendrier', icon: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4', permission: 'calendar:read' },
    { label: 'Activités', to: '/app/activites', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 9h17M3.5 15h17M12 3a14 14 0 0 0 0 18M12 3a14 14 0 0 1 0 18', permission: 'activity:read' },
    { label: 'Élèves', to: '/app/eleves', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0', permission: 'student:read' },
    { label: 'Personnel', to: '/app/personnel', icon: 'M4 7h16v13H4zM9 7V4h6v3M4 12h16', permission: 'staff:read' },
    { label: 'Niveaux', to: '/app/niveaux', icon: 'M4 7h16M4 12h16M4 17h10', permission: 'fee:read' },
];

const { can } = usePermissions();
const tabs = computed(() => allTabs.filter((tab) => !tab.permission || can(tab.permission)));

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
    <div v-if="auth.isAuthenticated" class="min-h-screen flex flex-col">
        <header class="app-top">
            <NuxtLink to="/app" class="flex items-center gap-2.5 shrink-0">
                <NelimaMark :size="26" />
                <span class="text-[17px] font-black tracking-tight" style="font-family: Nunito, sans-serif">
                    Nelima
                </span>
                <em
                    class="not-italic text-[10px] font-bold uppercase pl-2.5 ml-px"
                    style="letter-spacing: .14em; color: var(--brand-300); border-left: 1px solid rgba(255,255,255,.2)"
                >Écoles</em>
            </NuxtLink>

            <span
                class="hidden md:flex items-center h-[34px] px-2.5 rounded-lg text-[13px] font-semibold truncate max-w-xs"
                style="background: rgba(255,255,255,.09)"
            >{{ auth.user?.establishmentName ?? 'Établissement' }}</span>

            <GlobalSearch />

            <div class="flex-1" />

            <div class="flex items-center gap-2.5 pl-1">
                <NuxtLink
                    to="/app/profil" class="flex items-center gap-2.5"
                    title="Mon profil"
                >
                    <span
                        class="w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold shrink-0"
                        style="background: rgba(255,255,255,.16)"
                    >{{ initials }}</span>
                    <div class="hidden sm:block leading-tight">
                        <b class="block text-[12.5px] font-bold">{{ auth.fullName }}</b>
                        <span class="block text-[11px]" style="color: var(--brand-300)">Mon profil</span>
                    </div>
                </NuxtLink>
                <button
                    class="w-[34px] h-[34px] rounded-lg grid place-items-center shrink-0"
                    title="Se déconnecter" @click="logout"
                >
                    <svg
                        class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
                    >
                        <path d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" />
                    </svg>
                </button>
            </div>
        </header>

        <nav class="app-tabs">
            <NuxtLink
                v-for="tab in tabs" :key="tab.to" :to="tab.to"
                class="app-tab" :class="route.path === tab.to ? 'app-tab-active' : ''"
                :aria-current="route.path === tab.to ? 'page' : undefined"
            >
                <svg
                    class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
                >
                    <path :d="tab.icon" />
                </svg>
                {{ tab.label }}
            </NuxtLink>
        </nav>

        <main class="flex-1 w-full max-w-[1620px] mx-auto p-5">
            <slot />
        </main>
    </div>

    <div v-else class="min-h-screen">
        <slot />
    </div>
</template>
