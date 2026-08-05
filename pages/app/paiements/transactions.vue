<script setup lang="ts">
import {
    TRANSACTION_STATUSES, paymentMeanLabel, transactionStatusLabel, transactionStatusTone,
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
            title="Transactions"
            sub="Ce que l'agrégateur a encaissé, face aux reçus émis"
        />

        <PaymentsTabs />

        <p v-if="error" class="alert-danger mb-3.5" role="alert">{{ error }}</p>

        <div class="grid-12 mb-3.5">
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">Encaissé net</span>
                <span class="kpi-value">
                    {{ Math.round(Number(totals?.collectedNet ?? 0)).toLocaleString('fr-FR') }}<small>FCFA</small>
                </span>
                <span class="kpi-foot">
                    {{ totals?.transactionCount ?? 0 }} opération(s) sur la période
                </span>
            </div>
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">À réconcilier</span>
                <!-- Le chiffre passe en rouge dès qu'il n'est plus nul : c'est une pièce
                     comptable manquante, pas une statistique. -->
                <span
                    class="kpi-value"
                    :style="totals?.toReconcile ? 'color: var(--danger)' : ''"
                >{{ totals?.toReconcile ?? 0 }}</span>
                <span class="kpi-foot">encaissées sans reçu émis</span>
            </div>
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">En attente opérateur</span>
                <span class="kpi-value">{{ totals?.awaitingProvider ?? 0 }}</span>
                <span class="kpi-foot">confirmation non reçue</span>
            </div>
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">Frais collectés</span>
                <span class="kpi-value">
                    {{ Math.round(Number(totals?.commissionCollected ?? 0)).toLocaleString('fr-FR') }}<small>FCFA</small>
                </span>
                <span class="kpi-foot">à la charge du payeur</span>
            </div>
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

                <div class="flex items-center gap-2 flex-wrap">
                    <button class="chip" :aria-pressed="!selectedStatus" @click="selectedStatus = ''">
                        Toutes
                    </button>
                    <button
                        v-for="status in TRANSACTION_STATUSES" :key="status.value" class="chip"
                        :aria-pressed="selectedStatus === status.value"
                        @click="selectedStatus = status.value"
                    >{{ status.label }}</button>
                </div>

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
                            <th>Motif</th>
                            <th>Moyen</th>
                            <th class="text-right">Net école</th>
                            <th class="text-right">Frais</th>
                            <th>Statut</th>
                            <th>Rappr.</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="loading">
                            <td colspan="8" class="py-8 text-center" style="color: var(--text-faint)">
                                Chargement…
                            </td>
                        </tr>
                        <tr v-for="row in filtered" v-else :key="row.id">
                            <td>
                                <b class="nu text-[12.5px]" style="color: var(--navy)">
                                    {{ row.reference ?? 'Guichet' }}
                                </b>
                                <div class="text-[11px]" style="color: var(--text-faint)">
                                    {{ new Date(row.createdAt).toLocaleDateString('fr-FR') }}
                                </div>
                            </td>
                            <td>
                                <b class="text-[12.5px]" style="color: var(--navy)">
                                    {{ row.studentLabel }}
                                </b>
                                <div class="nu text-[11px]" style="color: var(--text-faint)">
                                    {{ row.studentRegistrationNumber ?? '—' }}
                                </div>
                            </td>
                            <td class="text-[12.5px]" style="color: var(--text-muted)">
                                {{ row.installmentLabel ?? '—' }}
                            </td>
                            <td><span class="tag">{{ paymentMeanLabel(row) }}</span></td>
                            <td class="num">
                                {{ Math.round(Number(row.amountSchool ?? 0)).toLocaleString('fr-FR') }} F
                            </td>
                            <td class="num" style="color: var(--text-faint)">
                                {{ Math.round(Number(row.amountCommission ?? 0)).toLocaleString('fr-FR') }} F
                            </td>
                            <td>
                                <span
                                    class="text-[12.5px] font-semibold"
                                    :style="{ color: transactionStatusTone(row.status) }"
                                >{{ transactionStatusLabel(row.status) }}</span>
                            </td>
                            <td>
                                <span
                                    v-if="row.reconciled" class="nu text-[11.5px]"
                                    style="color: var(--text-muted)"
                                >{{ row.receiptNumber }}</span>
                                <span
                                    v-else-if="row.status === 'SUCCEEDED'"
                                    class="text-[12px] font-semibold" style="color: var(--danger)"
                                >à réconcilier</span>
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
    </div>
</template>
