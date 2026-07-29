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
        <h1 class="text-2xl font-semibold">Reçus</h1>
        <p class="mt-1 opacity-70 max-w-2xl">
            Tous les encaissements quittancés, guichet et paiements en ligne confondus. La
            numérotation est continue et propre à votre établissement.
        </p>

        <p v-if="!loading && rows.length" class="mt-4 text-lg">
            {{ rows.length }} reçu{{ rows.length > 1 ? 's' : '' }} — <strong>{{ formatAmount(total) }}</strong>
        </p>

        <p v-if="error" class="mt-4 text-sm text-red-600" role="alert">{{ error }}</p>

        <div class="mt-4 overflow-x-auto">
            <table class="w-full text-sm border-collapse">
                <thead>
                    <tr class="text-left border-b border-black/10 dark:border-white/15">
                        <th class="py-2 pr-4 font-medium">Numéro</th>
                        <th class="py-2 pr-4 font-medium">Date</th>
                        <th class="py-2 pr-4 font-medium">Élève</th>
                        <th class="py-2 pr-4 font-medium">Matricule</th>
                        <th class="py-2 pr-4 font-medium">Payeur</th>
                        <th class="py-2 pr-4 font-medium">Montant</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="6" class="py-6 opacity-70">Chargement…</td></tr>
                    <tr v-else-if="!rows.length">
                        <td colspan="6" class="py-6 opacity-70">Aucun reçu émis pour l'instant.</td>
                    </tr>
                    <tr v-for="row in rows" :key="row.id" class="border-b border-black/5 dark:border-white/10">
                        <td class="py-2 pr-4 font-mono">{{ row.number }}</td>
                        <td class="py-2 pr-4">{{ formatDate(row.issuedAt) }}</td>
                        <td class="py-2 pr-4">{{ row.studentLabel ?? '—' }}</td>
                        <td class="py-2 pr-4 font-mono">{{ row.studentRegistrationNumber ?? '—' }}</td>
                        <td class="py-2 pr-4">{{ row.payerLabel || '—' }}</td>
                        <td class="py-2 pr-4">{{ formatAmount(row.amount) }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
