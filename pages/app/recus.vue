<script setup lang="ts">
import {
    channelLabel, formatAmount, formatDate, CHANNELS, type Receipt,
} from '~/composables/useBilling';

const { receipts } = useBilling();

const rows = ref<Receipt[]>([]);
const page = ref(0);
const size = 25;
const totalElements = ref(0);
const totalPages = ref(0);
const keyword = ref('');
const channel = ref('');
const loading = ref(true);
const error = ref('');

/** Reçu dont le détail est ouvert en tiroir. */
const opened = ref<Receipt | null>(null);

/**
 * Lien d'export : mêmes filtres que la liste affichée.
 *
 * Exporter tout autre chose que ce qui est à l'écran surprendrait — on télécharge ce qu'on voit,
 * pagination mise à part, puisqu'un journal comptable se lit d'un bloc.
 */
const exportUrl = computed(() => {
    const params = new URLSearchParams();
    if (keyword.value.trim()) params.set('keyword', keyword.value.trim());
    if (channel.value) params.set('channel', channel.value);
    const query = params.toString();
    return `/api/v1/receipts/export${query ? `?${query}` : ''}`;
});

/** Total de la page affichée, et non de tout l'historique : c'est ce que le pied de carte annonce. */
const pageTotal = computed(() => rows.value.reduce((sum, r) => sum + Number(r.amount ?? 0), 0));

async function load() {
    loading.value = true;
    error.value = '';
    try {
        const result = await receipts({
            page: page.value,
            size,
            keyword: keyword.value || undefined,
            channel: channel.value || undefined,
        });
        rows.value = result.content ?? [];
        totalElements.value = result.totalElements ?? 0;
        totalPages.value = result.totalPages ?? 0;
    } catch {
        error.value = "Les reçus n'ont pas pu être chargés.";
        rows.value = [];
    } finally {
        loading.value = false;
    }
}

/**
 * La frappe ne déclenche pas une requête par caractère : on attend une pause. Sans cela, taper un
 * matricule de huit caractères lançait huit recherches dont sept étaient obsolètes à l'arrivée.
 */
let debounce: ReturnType<typeof setTimeout> | undefined;

watch([keyword, channel], () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { page.value = 0; load(); }, 300);
});

function changePage(delta: number) {
    const next = page.value + delta;
    if (next < 0 || next >= totalPages.value) return;
    page.value = next;
    load();
}

onMounted(() => {
    const requested = useRoute().query.q;
    if (typeof requested === 'string' && requested) keyword.value = requested;
    load();
});
</script>

<template>
    <div>
        <PageHead
            title="Reçus"
            :sub="`${totalElements} pièce${totalElements > 1 ? 's' : ''} émise${totalElements > 1 ? 's' : ''} · numérotation continue et propre à votre établissement`"
        >
            <template #actions>
                <a :href="exportUrl" download="encaissements.csv" class="btn-secondary">
                    <svg
                        class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2" stroke-linecap="round"
                    ><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" /></svg>
                    Export comptable
                </a>
            </template>
        </PageHead>

        <p v-if="error" class="alert-danger mb-4" role="alert">{{ error }}</p>

        <UiCard :pad="false">
            <div class="tbar">
                <label class="inp" style="flex: 0 1 260px">
                    <svg
                        class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2" stroke-linecap="round"
                    >
                        <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                    </svg>
                    <input
                        v-model="keyword" type="search" class="w-full"
                        placeholder="Numéro, élève, matricule, payeur…"
                        aria-label="Rechercher un reçu"
                    />
                </label>

                <label class="inp">
                    <select v-model="channel" aria-label="Filtrer par mode de règlement">
                        <option value="">Tous les modes</option>
                        <option value="ONLINE">En ligne</option>
                        <option v-for="c in CHANNELS" :key="c.value" :value="c.value">
                            {{ c.label }}
                        </option>
                    </select>
                </label>
            </div>

            <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Reçu</th>
                            <th>Élève</th>
                            <th>Payeur</th>
                            <th>Mode</th>
                            <th class="text-right">Montant</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="loading">
                            <td colspan="6" class="py-8 text-center" style="color: var(--text-faint)">
                                Chargement…
                            </td>
                        </tr>
                        <tr
                            v-for="row in rows" v-else :key="row.id" class="cursor-pointer"
                            @click="opened = row"
                        >
                            <td>
                                <div class="nm">
                                    <b class="nu">{{ row.number }}</b>
                                    <span class="nu">{{ formatDate(row.issuedAt) }}</span>
                                </div>
                            </td>
                            <td>
                                <div class="flex items-center gap-2.5">
                                    <AvatarBadge :name="row.studentLabel" :size="28" tone="mute" />
                                    <div class="nm min-w-0">
                                        <b>{{ row.studentLabel ?? '—' }}</b>
                                        <span class="nu">{{ row.studentRegistrationNumber ?? '—' }}</span>
                                    </div>
                                </div>
                            </td>
                            <td class="text-[12.5px]" style="color: var(--text-muted)">
                                {{ row.payerLabel || '—' }}
                            </td>
                            <td><span class="tag">{{ channelLabel(row.channel) }}</span></td>
                            <td class="num" style="color: var(--navy)">{{ formatAmount(row.amount) }}</td>
                            <td class="text-right">
                                <!--
                                    `download` et non `target="_blank"` : le serveur renvoie déjà
                                    `Content-Disposition: attachment`, si bien qu'un nouvel onglet
                                    s'ouvrait pour se refermer aussitôt. L'attribut porte le nom du
                                    fichier en secours ; l'en-tête reste la référence.
                                -->
                                <a
                                    :href="`/api/v1/receipts/${row.id}/pdf`"
                                    :download="`recu-${row.number}.pdf`"
                                    class="btn-secondary btn-sm" @click.stop
                                >
                                    <svg
                                        class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                    >
                                        <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
                                    </svg>
                                    PDF
                                </a>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <EmptyState
                v-if="!loading && !rows.length && (keyword || channel)"
                title="Aucun résultat"
                text="Aucun reçu ne correspond à cette recherche. Essayez un autre numéro, ou retirez le filtre de mode."
            />
            <EmptyState
                v-else-if="!loading && !rows.length"
                title="Aucun reçu émis"
                text="Chaque règlement, au guichet comme en ligne, produit ici une pièce numérotée et téléchargeable."
            />

            <template #footer>
                <span class="text-[12px]" style="color: var(--text-faint)">
                    <b class="nu" style="color: var(--navy)">{{ rows.length }}</b> reçus affichés
                    sur <b class="nu" style="color: var(--navy)">{{ totalElements }}</b>
                    · <b class="nu" style="color: var(--navy)">{{ formatAmount(pageTotal) }}</b> sur cette page
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

        <ReceiptDrawer v-if="opened" :receipt="opened" @close="opened = null" />
    </div>
</template>
