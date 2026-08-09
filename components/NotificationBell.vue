<script setup lang="ts">
import {
    notificationIcon, notificationTone, sinceLabel, type AppNotification,
} from '~/composables/useNotifications';

/**
 * Cloche de la barre supérieure.
 *
 * Elle n'annonce que ce sur quoi l'école peut agir : une inscription venue d'une famille, un
 * encaissement sans reçu, une échéance passée sans règlement. Une cloche qui annonce ce sur quoi on
 * ne peut rien se vide de son sens en une semaine — on cesse de la regarder, et le jour où elle
 * porte quelque chose d'important, personne ne la voit.
 *
 * Le compteur ne compte que le **non lu** : un badge qui ne redescend jamais n'est plus un signal.
 */
const { feed, markSeen } = useNotifications();

const items = ref<AppNotification[]>([]);
const open = ref(false);
const loading = ref(false);

const unread = computed(() => items.value.filter((item) => item.unread).length);

async function load() {
    loading.value = true;
    try {
        items.value = await feed();
    } catch {
        // Une cloche muette vaut mieux qu'un message d'erreur en travers de la barre : le reste du
        // portail n'en dépend pas.
        items.value = [];
    } finally {
        loading.value = false;
    }
}

async function toggle() {
    open.value = !open.value;
    if (!open.value) return;
    await load();
    if (unread.value === 0) return;
    try {
        await markSeen();
        // Les éléments restent affichés comme non lus tant que le panneau est ouvert : les voir
        // s'éteindre sous les yeux ferait douter de ce qu'on vient de lire.
    } catch { /* le badge se corrigera au prochain chargement */ }
}

const route = useRoute();
watch(() => route.fullPath, () => { open.value = false; });

function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') open.value = false;
}

onMounted(() => {
    window.addEventListener('keydown', onKey);
    load();
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
    <div class="relative">
        <button
            class="ic-btn" :aria-expanded="open" aria-haspopup="menu"
            :data-tip="open ? undefined : `Notifications — ${unread} non lue(s)`"
            data-tip-pos="bottom" :title="`Notifications — ${unread} non lue(s)`"
            @click="toggle"
        >
            <BoIcon name="bell" :size="19" />
            <i v-if="unread" class="notif-badge">{{ unread > 9 ? '9+' : unread }}</i>
        </button>

        <template v-if="open">
            <div class="fixed inset-0 z-40" @click="open = false" />
            <div class="notif-panel" role="menu">
                <div class="notif-head">
                    <b class="text-[13px]" style="color: var(--navy)">Notifications</b>
                    <span class="text-[11.5px]" style="color: var(--text-faint)">
                        {{ unread }} non lue(s)
                    </span>
                </div>

                <div v-if="loading" class="p-3.5 flex flex-col gap-3">
                    <i v-for="n in 3" :key="n" class="sk h-8" />
                </div>

                <EmptyState
                    v-else-if="!items.length"
                    title="Rien à traiter"
                    text="Les demandes des familles, les encaissements sans reçu et les échéances passées apparaîtront ici."
                />

                <div v-else class="notif-list">
                    <NuxtLink
                        v-for="item in items" :key="item.id" :to="item.link" class="notif-item"
                        :class="item.unread ? 'notif-item-unread' : ''"
                    >
                        <span
                            class="w-8 h-8 rounded-[10px] grid place-items-center shrink-0"
                            :style="{ color: notificationTone(item.kind), background: 'var(--surface-sunken)' }"
                        ><BoIcon :name="notificationIcon(item.kind)" :size="16" /></span>
                        <div class="nm flex-1 min-w-0">
                            <b>{{ item.title }}</b>
                            <span>{{ item.detail }}</span>
                        </div>
                        <span class="text-[11px] whitespace-nowrap" style="color: var(--text-faint)">
                            {{ sinceLabel(item.occurredAt) }}
                        </span>
                    </NuxtLink>
                </div>
            </div>
        </template>
    </div>
</template>
