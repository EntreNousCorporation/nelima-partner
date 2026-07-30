<script setup lang="ts">
import { formatAmount, formatDate, type Receipt } from '~/composables/useBilling';

const { receipts } = useBilling();

const rows = ref<Receipt[]>([]);
const loading = ref(true);
const error = ref('');
const total = computed(() => rows.value.reduce((sum, r) => sum + Number(r.amount ?? 0), 0));

onMounted(async () => {
    try {
        rows.value = (await receipts(0, 100)).content ?? [];
    } catch {
        error.value = "Les reçus n'ont pas pu être chargés.";
    } finally {
        loading.value = false;
    }
});
</script>

<template>
    <div>
        <h1 class="page-title">Reçus</h1>
        <p class="mt-1 opacity-70 max-w-2xl">
            Tous les encaissements quittancés, guichet et paiements en ligne confondus. La
            numérotation est continue et propre à votre établissement.
        </p>

        <p v-if="!loading && rows.length" class="mt-4 text-lg">
            {{ rows.length }} reçu{{ rows.length > 1 ? 's' : '' }} — <strong>{{ formatAmount(total) }}</strong>
        </p>

        <p v-if="error" class="alert-danger mt-4" role="alert">{{ error }}</p>

        <div class="table-wrap mt-4">
            <table class="table">
                <thead>
                    <tr>
                        <th>Numéro</th>
                        <th>Date</th>
                        <th>Élève</th>
                        <th>Matricule</th>
                        <th>Payeur</th>
                        <th>Montant</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="7" class="py-8 text-center" style="color: var(--text-muted)">Chargement…</td></tr>
                    <tr v-else-if="!rows.length">
                        <td colspan="7" class="py-8 text-center" style="color: var(--text-muted)">Aucun reçu émis pour l'instant.</td>
                    </tr>
                    <tr v-for="row in rows" :key="row.id" >
                        <td class="font-mono">{{ row.number }}</td>
                        <td>{{ formatDate(row.issuedAt) }}</td>
                        <td>{{ row.studentLabel ?? '—' }}</td>
                        <td class="font-mono">{{ row.studentRegistrationNumber ?? '—' }}</td>
                        <td>{{ row.payerLabel || '—' }}</td>
                        <td>{{ formatAmount(row.amount) }}</td>
                        <td>
                            <a :href="`/api/v1/receipts/${row.id}/pdf`" target="_blank"
                               class="underline text-sm">PDF</a>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
