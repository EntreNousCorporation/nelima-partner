<script setup lang="ts">
import { type Parent, type ParentChild } from '~/composables/useParents';

const { search } = useParents();

const parents = ref<Parent[]>([]);
const page = ref(0);
const size = 20;
const totalElements = ref(0);
const totalPages = ref(0);
const keyword = ref('');
const loading = ref(false);
const loadError = ref('');

/** Famille dont la fiche est ouverte en tiroir. */
const opened = ref<Parent | null>(null);

/** Nom affichable d'un parent : prénom + nom, à défaut l'identifiant de connexion. */
function parentName(parent: Parent): string {
    const full = `${parent.firstName ?? ''} ${parent.lastName ?? ''}`.trim();
    return full || parent.username || '—';
}

/**
 * Coordonnée principale : téléphone principal d'abord, puis e-mail, à défaut l'identifiant.
 *
 * On privilégie le téléphone : au comptoir comme pour une relance, c'est par lui qu'on joint la
 * famille. Le contact marqué principal prime sur les autres du même type.
 */
function parentContact(parent: Parent): string {
    const contacts = parent.contacts ?? [];
    const phone = contacts.find((c) => c.type === 'PHONE_NUMBER' && c.isPrimary)
        ?? contacts.find((c) => c.type === 'PHONE_NUMBER');
    const email = contacts.find((c) => c.type === 'EMAIL' && c.isPrimary)
        ?? contacts.find((c) => c.type === 'EMAIL');
    const primary = phone ?? email;
    return primary?.value ?? (parent.username ?? '—');
}

/** Le nombre d'enfants annoncé par le serveur, à défaut la longueur de la liste servie. */
function childrenCount(parent: Parent): number {
    return parent.childrenCount ?? parent.children?.length ?? 0;
}

/** Puce d'un enfant : « Prénom Nom · classe », la classe cédant la place au matricule si absente. */
function childChip(child: ParentChild): string {
    const name = `${child.firstName} ${child.lastName}`.trim();
    const suffix = child.className || child.levelLabel || child.registrationNumber;
    return suffix ? `${name} · ${suffix}` : name;
}

async function load() {
    loading.value = true;
    loadError.value = '';
    try {
        const result = await search({
            page: page.value,
            size,
            keyword: keyword.value || undefined,
        });
        parents.value = result.content ?? [];
        totalElements.value = result.totalElements ?? 0;
        totalPages.value = result.totalPages ?? 0;
    } catch (e: any) {
        loadError.value = "La liste n'a pas pu être chargée.";
        parents.value = [];
    } finally {
        loading.value = false;
    }
}

function changePage(delta: number) {
    const next = page.value + delta;
    if (next < 0 || next >= totalPages.value) return;
    page.value = next;
    load();
}

/** La recherche part au serveur : on attend une pause de frappe pour ne pas la relancer par lettre. */
let debounce: ReturnType<typeof setTimeout> | undefined;

watch(keyword, () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { page.value = 0; load(); }, 300);
});

onMounted(async () => {
    // La barre supérieure envoie ici avec sa recherche : la reprendre évite de la retaper.
    const requested = useRoute().query.q;
    if (typeof requested === 'string' && requested) keyword.value = requested;

    await load();
});
</script>

<template>
    <div>
        <PageHead
            title="Familles"
            :sub="`${totalElements} parent${totalElements > 1 ? 's' : ''} / tuteur${totalElements > 1 ? 's' : ''} rattaché${totalElements > 1 ? 's' : ''}`"
        />

        <p v-if="loadError" class="alert-danger mb-3.5" role="alert">{{ loadError }}</p>

        <UiCard :pad="false">
            <div class="tbar">
                <label class="inp" style="flex: 0 1 320px">
                    <BoIcon name="search" :size="15" />
                    <input
                        v-model="keyword" type="search" class="w-full"
                        placeholder="Nom, prénom, téléphone ou enfant…"
                        aria-label="Rechercher une famille"
                    />
                </label>
            </div>

            <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Parent / Tuteur</th>
                            <th>Contact principal</th>
                            <th>Enfants</th>
                            <th class="r">Nb</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <TableSkeleton v-if="loading" :columns="5" />
                        <tr
                            v-for="parent in parents" v-else :key="parent.id"
                            class="cl" @click="opened = parent"
                        >
                            <td>
                                <div class="flex items-center gap-2.5">
                                    <AvatarBadge :name="parentName(parent)" :size="28" />
                                    <div class="nm min-w-0">
                                        <b>{{ parentName(parent) }}</b>
                                        <span v-if="parent.username" class="nu">{{ parent.username }}</span>
                                    </div>
                                </div>
                            </td>
                            <td class="nu text-[12px]" style="color: var(--text-faint)">
                                {{ parentContact(parent) }}
                            </td>
                            <td>
                                <div v-if="parent.children?.length" class="flex flex-wrap gap-1.5">
                                    <span
                                        v-for="child in parent.children" :key="child.id" class="tag"
                                    >{{ childChip(child) }}</span>
                                </div>
                                <span v-else class="text-[11.5px]" style="color: var(--text-faint)">
                                    Aucun enfant rattaché
                                </span>
                            </td>
                            <td class="num" style="color: var(--navy)">
                                {{ childrenCount(parent) }}
                            </td>
                            <td class="text-right">
                                <BoIcon name="chevron-right" :size="16" />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <EmptyState
                v-if="!loading && !parents.length && keyword"
                title="Aucun résultat"
                text="Aucune famille ne correspond à cette recherche."
            />
            <EmptyState
                v-else-if="!loading && !parents.length"
                title="Aucun parent rattaché"
                text="Les parents apparaissent ici dès qu'ils sont rattachés à un élève de l'établissement."
            />

            <template #footer>
                <span class="text-[12px]" style="color: var(--text-faint)">
                    <b class="nu" style="color: var(--navy)">{{ parents.length }}</b> affichés sur
                    <b class="nu" style="color: var(--navy)">{{ totalElements }}</b>
                </span>
                <span v-if="totalPages > 1" class="flex items-center gap-2">
                    <button class="btn-secondary btn-sm" :disabled="page === 0" @click="changePage(-1)">
                        Précédent
                    </button>
                    <span class="text-[12px]" style="color: var(--text-faint)">
                        {{ page + 1 }} / {{ totalPages }}
                    </span>
                    <button
                        class="btn-secondary btn-sm" :disabled="page >= totalPages - 1"
                        @click="changePage(1)"
                    >Suivant</button>
                </span>
            </template>
        </UiCard>

        <SideDrawer
            v-if="opened"
            :title="parentName(opened)"
            :sub="opened.username ?? `${childrenCount(opened)} enfant${childrenCount(opened) > 1 ? 's' : ''}`"
            @close="opened = null"
        >
            <template #avatar>
                <AvatarBadge :name="parentName(opened)" :size="42" />
            </template>

            <p class="sec">Coordonnées</p>
            <div
                v-if="opened.contacts?.length"
                class="rounded-xl overflow-hidden mb-5" style="border: 1px solid var(--border)"
            >
                <div
                    v-for="(contact, index) in opened.contacts" :key="index"
                    class="flex items-center gap-3 px-3 py-2.5"
                    style="border-bottom: 1px solid var(--border)"
                >
                    <BoIcon :name="contact.type === 'PHONE_NUMBER' ? 'phone' : 'mail'" :size="16" />
                    <div class="flex-1 min-w-0">
                        <b class="block nu text-[12.5px]" style="color: var(--navy)">
                            {{ contact.value }}
                        </b>
                    </div>
                    <UiPill v-if="contact.isPrimary" tone="info">Principal</UiPill>
                    <UiPill v-if="contact.whatsApp" tone="ok">WhatsApp</UiPill>
                </div>
            </div>
            <p v-else class="text-[12.5px] mb-5" style="color: var(--text-faint)">
                Aucune coordonnée enregistrée pour ce parent.
            </p>

            <p class="sec">Enfants</p>
            <div
                v-if="opened.children?.length"
                class="rounded-xl overflow-hidden" style="border: 1px solid var(--border)"
            >
                <div
                    v-for="child in opened.children" :key="child.id"
                    class="flex items-center gap-3 px-3 py-2.5"
                    style="border-bottom: 1px solid var(--border)"
                >
                    <AvatarBadge :name="`${child.firstName} ${child.lastName}`" :size="28" />
                    <div class="nm flex-1 min-w-0">
                        <b>{{ child.lastName }} {{ child.firstName }}</b>
                        <span class="nu">
                            {{ child.registrationNumber }}
                            <template v-if="child.className || child.levelLabel">
                                · {{ child.className || child.levelLabel }}
                            </template>
                        </span>
                    </div>
                </div>
            </div>
            <p v-else class="text-[12.5px]" style="color: var(--text-faint)">
                Aucun enfant rattaché à ce parent.
            </p>
        </SideDrawer>
    </div>
</template>
