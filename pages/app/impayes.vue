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
        <h1 class="page-title">Impayés</h1>
        <p class="mt-1 opacity-70 max-w-2xl">
            Tranches dont l'échéance est dépassée et qui restent dues.
        </p>

        <p v-if="!loading && rows.length" class="mt-4 text-lg">
            {{ rows.length }} tranche{{ rows.length > 1 ? 's' : '' }} en retard —
            <strong>{{ formatAmount(total) }}</strong>
        </p>

        <p v-if="error" class="alert-danger mt-4" role="alert">{{ error }}</p>

        <div class="table-wrap mt-4">
            <table class="table">
                <thead>
                    <tr>
                        <th>Matricule</th>
                        <th>Élève</th>
                        <th>Tranche</th>
                        <th>Montant</th>
                        <th>Échéance</th>
                        <th>Retard</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="6" class="py-8 text-center" style="color: var(--text-muted)">Chargement…</td></tr>
                    <tr v-else-if="!rows.length">
                        <td colspan="6" class="py-8 text-center" style="color: var(--text-muted)">Aucun impayé. Tout est à jour.</td>
                    </tr>
                    <tr v-for="row in rows" :key="row.id" >
                        <td class="font-mono">{{ studentOf(row).matricule }}</td>
                        <td>{{ studentOf(row).name }}</td>
                        <td>{{ row.label ?? '—' }}</td>
                        <td>{{ formatAmount(row.amount) }}</td>
                        <td>{{ formatDate(row.dueDate) }}</td>
                        <td class="py-2 pr-4 text-red-600">{{ daysLate(row.dueDate) }} j</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
