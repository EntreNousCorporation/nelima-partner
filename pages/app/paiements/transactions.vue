<script setup lang="ts">
import {
    TRANSACTION_STATUSES, paymentMeanLabel, transactionStatusLabel,
    type PaymentIntentStatus, type Transaction, type TransactionSummary,
} from '~/composables/useTransactions';
import { isoDate } from '~/composables/useCalendar';

/**
 * Rapprochement : ce que l'agrégateur a encaissé face à ce que l'école a émis en reçus.
 *
 * L'écran existe pour une seule question — que manque-t-il ? Une opération réussie dont aucune
 * pièce n'est sortie est ce qu'on vient y chercher, et c'est pour cela qu'elle est signalée en
 * rouge plutôt que noyée dans la liste.
 */
const { list, summary } = useTransactions();
const { can } = usePermissions();

const today = new Date();
const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

const from = ref(isoDate(firstOfMonth));
const to = ref(isoDate(today));

const rows = ref<Transaction[]>([]);
const totals = ref<TransactionSummary | null>(null);
const loading = ref(true);
const error = ref('');

const selectedStatus = ref<PaymentIntentStatus | ''>('');
const onlyToReconcile = ref(false);

/** Transaction ouverte dans le tiroir. Le tableau ne peut pas porter la référence opérateur. */
const opened = ref<Transaction | null>(null);

const filtered = computed(() => rows.value.filter((row) => {
    if (selectedStatus.value && row.status !== selectedStatus.value) return false;
    if (onlyToReconcile.value && (row.reconciled || row.status !== 'SUCCEEDED')) return false;
    return true;
}));

async function load() {
    loading.value = true;
    error.value = '';
    try {
        const [lines, aggregate] = await Promise.all([
            list(from.value, to.value),
            summary(from.value, to.value),
        ]);
        rows.value = lines;
        totals.value = aggregate;
    } catch {
        error.value = "Les transactions n'ont pas pu être chargées.";
    } finally {
        loading.value = false;
    }
}

watch([from, to], load);
onMounted(load);
</script>

<template>
    <div>
        <PageHead
            title="Paiements"
            sub="Ce que l'agrégateur a encaissé, face aux reçus émis"
        >
            <template #actions>
                <NuxtLink to="/app/paiements/recus" class="btn-secondary">
                    <BoIcon name="download" :size="16" />Export comptable
                </NuxtLink>
                <NuxtLink v-if="can('collection:write')" to="/app/paiements/guichet" class="btn-primary">
                    <BoIcon name="cash" :size="16" />Encaisser au guichet
                </NuxtLink>
            </template>
        </PageHead>

        <PaymentsTabs />

        <p v-if="error" class="alert-danger mb-3.5" role="alert">{{ error }}</p>

        <div class="grid-12 mb-3.5">
            <KpiCard
                class="c3" label="Encaissé net" icon="cash"
                tip="Montant net revenant à l'école sur la période filtrée, frais du payeur déduits."
                :value="fm(Number(totals?.collectedNet ?? 0))"
                unit="FCFA"
                :foot="`${totals?.transactionCount ?? 0} opération(s) sur la période`"
            />
            <!-- Le chiffre passe en rouge dès qu'il n'est plus nul : c'est une pièce comptable
                 manquante, pas une statistique. -->
            <KpiCard
                class="c3" label="À réconcilier" icon="alert"
                tip="Opérations confirmées par l'agrégateur sans reçu émis dans Nelima. À traiter avant la clôture comptable : ce sont des pièces manquantes."
                :value="String(totals?.toReconcile ?? 0)"
                foot="encaissées sans reçu émis"
                :value-tone="totals?.toReconcile ? 'var(--danger)' : undefined"
            />
            <KpiCard
                class="c3" label="En attente opérateur" icon="clock"
                tip="Paiements initiés par une famille mais non encore confirmés par l'opérateur. Le solde de l'élève n'est pas encore soldé."
                :value="String(totals?.awaitingProvider ?? 0)"
                foot="confirmation non reçue"
            />
            <KpiCard
                class="c3" label="Frais collectés" icon="percent"
                tip="Commission prélevée sur les paiements en ligne. Elle est à la charge du payeur et ne revient pas à l'école."
                :value="fm(Number(totals?.commissionCollected ?? 0))"
                unit="FCFA"
                foot="à la charge du payeur"
            />
        </div>

        <UiCard :pad="false">
            <div class="tbar">
                <label class="inp" style="flex: 0 0 auto">
                    <span class="text-[12.5px]" style="color: var(--text-faint)">Du</span>
                    <input v-model="from" type="date" aria-label="Début de période" />
                </label>
                <label class="inp" style="flex: 0 0 auto">
                    <span class="text-[12.5px]" style="color: var(--text-faint)">au</span>
                    <input v-model="to" type="date" aria-label="Fin de période" />
                </label>

                <label class="inp">
                    <BoIcon name="filter" :size="15" />
                    <select v-model="selectedStatus" aria-label="Filtrer par statut">
                        <option value="">Tous les statuts</option>
                        <option v-for="status in TRANSACTION_STATUSES" :key="status.value" :value="status.value">
                            {{ status.label }}
                        </option>
                    </select>
                </label>

                <div class="flex-1" />

                <label class="flex items-center gap-2 text-[12.5px]" style="color: var(--text-muted)">
                    <input v-model="onlyToReconcile" type="checkbox" />
                    À réconcilier seulement
                </label>
            </div>

            <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Transaction</th>
                            <th>Élève</th>
                            <th>Payeur</th>
                            <th>Motif</th>
                            <th>Moyen</th>
                            <th class="r">Net école</th>
                            <th class="r">Frais</th>
                            <th>Statut</th>
                            <th>Rappr.</th>
                        </tr>
                    </thead>
                    <tbody>
                        <TableSkeleton v-if="loading" :columns="9" />
                        <tr
                            v-for="row in filtered" v-else :key="row.id" class="cl"
                            @click="opened = row"
                        >
                            <td>
                                <b class="nu text-[12.5px]" style="color: var(--navy)">
                                    {{ row.reference ?? 'Guichet' }}
                                </b>
                                <div class="text-[11px]" style="color: var(--text-faint)">
                                    {{ new Date(row.createdAt).toLocaleDateString('fr-FR') }}
                                </div>
                            </td>
                            <td>
                                <div class="flex items-center gap-2.5">
                                    <AvatarBadge :name="row.studentLabel" :size="28" />
                                    <div class="min-w-0">
                                <b class="block text-[12.5px]" style="color: var(--navy)">
                                    {{ row.studentLabel }}
                                </b>
                                <div class="nu text-[11px]" style="color: var(--text-faint)">
                                    {{ row.studentRegistrationNumber ?? '—' }}
                                </div>
                                    </div>
                                </div>
                            </td>
                            <td class="text-[12.5px]" style="color: var(--navy)">
                                {{ row.payerName ?? '—' }}
                            </td>
                            <td class="text-[12.5px]" style="color: var(--text-muted)">
                                {{ row.installmentLabel ?? '—' }}
                            </td>
                            <td>
                                <span class="inline-flex items-center gap-2 text-[12.5px] font-semibold whitespace-nowrap">
                                    <i
                                        class="w-2 h-2 rounded-sm shrink-0"
                                        :style="{ background: row.channel === 'ONLINE'
                                            ? 'var(--brand-600)' : 'var(--text-muted)' }"
                                    />{{ paymentMeanLabel(row) }}
                                </span>
                            </td>
                            <td class="num r">
                                {{ fm(Number(row.amountSchool ?? 0)) }} F
                            </td>
                            <td class="num r" style="color: var(--text-faint)">
                                {{ fm(Number(row.amountCommission ?? 0)) }} F
                            </td>
                            <td>
                                <UiPill
                                    :tone="row.status === 'SUCCEEDED' ? 'ok'
                                        : row.status === 'PENDING' ? 'warn'
                                            : row.status === 'FAILED' ? 'late' : 'mute'"
                                >{{ transactionStatusLabel(row.status) }}</UiPill>
                            </td>
                            <td>
                                <span
                                    v-if="row.reconciled" class="inline-flex items-center gap-1.5"
                                    style="color: var(--success)" :title="`Reçu ${row.receiptNumber}`"
                                >
                                    <BoIcon name="check-circle" :size="17" />
                                    <span class="nu text-[11.5px]">{{ row.receiptNumber }}</span>
                                </span>
                                <span
                                    v-else-if="row.status === 'SUCCEEDED'"
                                    class="inline-flex items-center gap-1.5 text-[12px] font-semibold"
                                    style="color: var(--danger)" title="Encaissée sans reçu émis"
                                ><BoIcon name="clock" :size="17" />à réconcilier</span>
                                <span v-else style="color: var(--text-faint)">—</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <EmptyState
                v-if="!loading && !filtered.length && (selectedStatus || onlyToReconcile)"
                title="Aucun résultat"
                text="Aucune opération ne correspond à ce filtre."
            />
            <EmptyState
                v-else-if="!loading && !filtered.length"
                title="Aucune opération"
                text="Aucun paiement n'a été enregistré sur cette période."
            />

            <template #footer>
                <span class="text-[12px]" style="color: var(--text-faint)">
                    <b class="nu" style="color: var(--navy)">{{ filtered.length }}</b>
                    opération(s) affichée(s)
                </span>
                <span class="text-[12px]" style="color: var(--text-faint)">
                    Un écart se corrige à la source, jamais en cochant une case ici
                </span>
            </template>
        </UiCard>

        <TransactionDrawer
            v-if="opened" :transaction="opened" @close="opened = null"
        />
    </div>
</template>
