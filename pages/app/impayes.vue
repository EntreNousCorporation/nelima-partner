<script setup lang="ts">
import { formatAmount, formatDate, studentOf, type Installment } from '~/composables/useBilling';

const { installments } = useBilling();

const rows = ref<Installment[]>([]);
const loading = ref(true);
const error = ref('');

/** Un impayé est une tranche encore due dont l'échéance est passée. */
const today = new Date().toISOString().slice(0, 10);

const total = computed(() => rows.value.reduce((sum, i) => sum + Number(i.amount ?? 0), 0));

function daysLate(dueDate?: string) {
    if (!dueDate) return 0;
    const diff = Date.now() - new Date(dueDate).getTime();
    return Math.max(0, Math.floor(diff / 86_400_000));
}

onMounted(async () => {
    try {
        rows.value = (await installments({ status: 'PENDING', dueBefore: today, size: 200 })).content ?? [];
    } catch {
        error.value = "Les impayés n'ont pas pu être chargés.";
    } finally {
        loading.value = false;
    }
});
</script>

<template>
    <div>
        <h1 class="text-2xl font-semibold">Impayés</h1>
        <p class="mt-1 opacity-70 max-w-2xl">
            Tranches dont l'échéance est dépassée et qui restent dues.
        </p>

        <p v-if="!loading && rows.length" class="mt-4 text-lg">
            {{ rows.length }} tranche{{ rows.length > 1 ? 's' : '' }} en retard —
            <strong>{{ formatAmount(total) }}</strong>
        </p>

        <p v-if="error" class="mt-4 text-sm text-red-600" role="alert">{{ error }}</p>

        <div class="mt-4 overflow-x-auto">
            <table class="w-full text-sm border-collapse">
                <thead>
                    <tr class="text-left border-b border-black/10 dark:border-white/15">
                        <th class="py-2 pr-4 font-medium">Matricule</th>
                        <th class="py-2 pr-4 font-medium">Élève</th>
                        <th class="py-2 pr-4 font-medium">Tranche</th>
                        <th class="py-2 pr-4 font-medium">Montant</th>
                        <th class="py-2 pr-4 font-medium">Échéance</th>
                        <th class="py-2 pr-4 font-medium">Retard</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="6" class="py-6 opacity-70">Chargement…</td></tr>
                    <tr v-else-if="!rows.length">
                        <td colspan="6" class="py-6 opacity-70">Aucun impayé. Tout est à jour.</td>
                    </tr>
                    <tr v-for="row in rows" :key="row.id" class="border-b border-black/5 dark:border-white/10">
                        <td class="py-2 pr-4 font-mono">{{ studentOf(row).matricule }}</td>
                        <td class="py-2 pr-4">{{ studentOf(row).name }}</td>
                        <td class="py-2 pr-4">{{ row.label ?? '—' }}</td>
                        <td class="py-2 pr-4">{{ formatAmount(row.amount) }}</td>
                        <td class="py-2 pr-4">{{ formatDate(row.dueDate) }}</td>
                        <td class="py-2 pr-4 text-red-600">{{ daysLate(row.dueDate) }} j</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
