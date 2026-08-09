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
 * Les sept onglets du prototype, dans son ordre, avec la permission qui commande l'écran.
 *
 * **Ce qui relève du paramétrage n'y figure pas** : les réglages s'ouvrent par l'icône de la barre
 * supérieure, et les niveaux enseignés y sont devenus une section. Un réglage rangé à deux
 * endroits finit par diverger, et la barre gagne deux entrées qu'on ne consulte que trois fois
 * l'an.
 *
 * Masquer n'est pas protéger — le serveur refuse l'appel de toute façon. Mais un onglet qui mène à
 * une page vide et à une erreur est une promesse que l'application ne tient pas.
 */
const allTabs = [
    { label: 'Tableau de bord', to: '/app', icon: 'chart-bar' },
    { label: 'Paiements', to: '/app/paiements', icon: 'wallet', permission: 'fee:read' },
    { label: 'Calendrier', to: '/app/calendrier', icon: 'calendar', permission: 'calendar:read' },
    { label: 'Classes', to: '/app/classes', icon: 'layers', permission: 'class:read' },
    { label: 'Activités', to: '/app/activites', icon: 'ball', permission: 'activity:read' },
    { label: 'Élèves', to: '/app/eleves', icon: 'students', permission: 'student:read' },
    { label: 'Familles', to: '/app/parents', icon: 'user', permission: 'student:read' },
    { label: 'Personnel', to: '/app/personnel', icon: 'briefcase', permission: 'staff:read' },
];

const { can } = usePermissions();
const tabs = computed(() => allTabs.filter((tab) => !tab.permission || can(tab.permission)));

/**
 * Un onglet reste souligné sur ses sous-écrans.
 *
 * `/app/paiements/transactions` relève de Paiements ; comparer les chemins à l'identique laissait
 * la barre sans repère dès qu'on ouvrait un sous-onglet. Le tableau de bord fait exception : son
 * chemin est le préfixe de tous les autres.
 */
function isCurrent(to: string) {
    return to === '/app' ? route.path === '/app' : route.path.startsWith(to);
}

/**
 * Fonction du compte, montrée sous son nom.
 *
 * Elle dit ce que l'application va montrer — un comptable et une secrétaire n'ont pas le même
 * tableau de bord. Sans elle, on ne sait pas au nom de quel rôle on regarde l'écran.
 */
const ROLE_LABELS: Record<string, string> = {
    ESTABLISHMENT_ROOT: 'Compte principal',
    DIRECTEUR: 'Direction',
    COMPTABLE: 'Économat · Comptabilité',
    SECRETARIAT: 'Secrétariat · Scolarité',
    ADMIN: 'YPYit · Administration',
};

const jobLabel = computed(() =>
    ROLE_LABELS[auth.user?.roleCode ?? ''] ?? 'Établissement');

const initials = computed(() => (auth.fullName ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join('') || '—');

const canSettings = computed(() => can('settings:read'));
const canCollect = computed(() => can('collection:write'));

/* ---- Menu de compte ---- */
const accountOpen = ref(false);

/** Une navigation ferme le menu : le laisser ouvert par-dessus l'écran suivant est déroutant. */
watch(() => route.fullPath, () => { accountOpen.value = false; });

function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') accountOpen.value = false;
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

async function logout() {
    accountOpen.value = false;
    await $fetch('/api/auth/logout', { method: 'POST' });
    auth.clear();
    await navigateTo('/connexion');
}
</script>

<template>
    <div v-if="auth.isAuthenticated" class="min-h-screen flex flex-col">
        <header class="app-top">
            <NuxtLink to="/app" class="flex items-center gap-2.5 shrink-0">
                <NelimaMark :size="26" color="#fff" />
                <span class="text-[17px] font-black tracking-tight" style="font-family: Nunito, sans-serif">
                    Nelima
                </span>
                <em
                    class="hidden lg:inline not-italic text-[10px] font-bold uppercase pl-2.5 ml-px"
                    style="letter-spacing: .14em; color: var(--brand-300); border-left: 1px solid rgba(255,255,255,.2)"
                >Écoles</em>
            </NuxtLink>

            <span
                class="hidden md:flex items-center h-[34px] px-2.5 rounded-lg text-[13px] font-semibold truncate max-w-xs"
                style="background: rgba(255,255,255,.09)"
            >{{ auth.user?.establishmentName ?? 'Établissement' }}</span>

            <GlobalSearch />

            <div class="flex-1" />

            <NuxtLink
                v-if="canCollect" to="/app/paiements/guichet" class="ic-btn"
                title="Encaisser au guichet"
                data-tip="Encaisser un règlement au guichet et émettre le reçu"
                data-tip-pos="bottom"
            >
                <BoIcon name="plus" :size="20" />
            </NuxtLink>

            <NotificationBell />

            <NuxtLink
                v-if="canSettings" to="/app/parametres" class="ic-btn" title="Réglages"
                data-tip="Réglages de l'établissement : identité, année scolaire, notifications"
                data-tip-pos="bottom"
                :aria-current="route.path.startsWith('/app/parametres') ? 'page' : undefined"
            >
                <BoIcon name="settings" :size="19" />
            </NuxtLink>

            <div class="relative">
                <button
                    class="me" :aria-expanded="accountOpen" aria-haspopup="menu"
                    @click="accountOpen = !accountOpen"
                >
                    <span
                        class="w-[30px] h-[30px] rounded-full grid place-items-center text-[11px] font-bold shrink-0"
                        style="background: rgba(255,255,255,.16)"
                    >{{ initials }}</span>
                    <div class="hidden sm:block text-left">
                        <b>{{ auth.fullName }}</b>
                        <span>{{ jobLabel }}</span>
                    </div>
                    <BoIcon name="chevron-down" :size="15" />
                </button>

                <template v-if="accountOpen">
                    <div class="fixed inset-0 z-40" @click="accountOpen = false" />
                    <div class="acc-menu" role="menu">
                        <div class="px-2.5 py-2">
                            <b class="block text-[13px] font-bold" style="color: var(--navy)">
                                {{ auth.fullName }}
                            </b>
                            <span class="block text-[11.5px]" style="color: var(--text-faint)">
                                {{ jobLabel }}
                            </span>
                        </div>
                        <div class="acc-sep" />
                        <NuxtLink to="/app/profil" role="menuitem">
                            <BoIcon name="user" :size="16" />Mon profil
                        </NuxtLink>
                        <NuxtLink to="/app/profil#securite" role="menuitem">
                            <BoIcon name="shield-check" :size="16" />Changer mon mot de passe
                        </NuxtLink>
                        <NuxtLink v-if="canSettings" to="/app/parametres" role="menuitem">
                            <BoIcon name="settings" :size="16" />Réglages de l'établissement
                        </NuxtLink>
                        <div class="acc-sep" />
                        <button role="menuitem" style="color: var(--danger)" @click="logout">
                            <BoIcon name="logout" :size="16" />Se déconnecter
                        </button>
                    </div>
                </template>
            </div>
        </header>

        <nav class="app-tabs">
            <NuxtLink
                v-for="tab in tabs" :key="tab.to" :to="tab.to"
                class="app-tab" :class="isCurrent(tab.to) ? 'app-tab-active' : ''"
                :aria-current="isCurrent(tab.to) ? 'page' : undefined"
            >
                <BoIcon :name="tab.icon" :size="16" :stroke-width="isCurrent(tab.to) ? 2 : 1.7" />
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
