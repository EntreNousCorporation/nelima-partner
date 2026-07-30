<script setup lang="ts">
import { CHANNELS, formatAmount, formatDate, studentOf, type Installment } from '~/composables/useBilling';

const { installments, collectOffline } = useBilling();

const rows = ref<Installment[]>([]);
const loading = ref(true);
const error = ref('');
const search = ref('');

const collecting = ref<string | null>(null);
const channel = ref('CASH');
const reference = ref('');
const payerName = ref('');
const payerEmail = ref('');
const feedback = ref('');
const feedbackError = ref('');

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return rows.value;
    return rows.value.filter((i) => {
        const s = studentOf(i);
        return s.name.toLowerCase().includes(q) || s.matricule.toLowerCase().includes(q);
    });
});

async function load() {
    loading.value = true;
    error.value = '';
    try {
        // Seules les tranches encore dues sont encaissables ; afficher les autres n'exposerait
        // qu'à des doubles saisies.
        rows.value = (await installments({ status: 'PENDING', size: 200 })).content ?? [];
    } catch {
        error.value = "Les tranches n'ont pas pu être chargées.";
    } finally {
        loading.value = false;
    }
}

async function collect(installment: Installment) {
    feedback.value = '';
    feedbackError.value = '';
    collecting.value = installment.id;
    try {
        const receipt = await collectOffline({
            installmentId: installment.id,
            channel: channel.value,
            reference: reference.value || undefined,
            payerName: payerName.value || undefined,
            payerEmail: payerEmail.value || undefined,
        });
        feedback.value = `Encaissement enregistré. Reçu ${receipt.number}.`;
        reference.value = '';
        payerName.value = '';
        payerEmail.value = '';
        await load();
    } catch (e: any) {
        feedbackError.value = e?.response?._data?.debugMessage
            ?? "L'encaissement n'a pas pu être enregistré.";
    } finally {
        collecting.value = null;
    }
}

onMounted(load);
</script>

<template>
    <div>
        <h1 class="page-title">Encaissement</h1>
        <p class="mt-1 opacity-70 max-w-2xl">
            Enregistrez un règlement reçu au guichet. Le reçu est émis immédiatement et numéroté.
            Aucune commission n'est prélevée sur ce canal.
        </p>

        <div class="mt-6 flex flex-wrap items-end gap-4">
            <label class="field-label">Rechercher
                <input v-model="search" type="search" placeholder="Nom ou matricule"
                       class="input mt-1 w-64" />
            </label>
            <label class="field-label">Mode de règlement
                <select v-model="channel"
                        class="select mt-1 w-auto">
                    <option v-for="c in CHANNELS" :key="c.value" :value="c.value">{{ c.label }}</option>
                </select>
            </label>
            <label class="field-label">Référence
                <input v-model="reference" type="text" placeholder="N° de chèque, virement…"
                       class="input mt-1 w-56" />
            </label>
        </div>

        <div class="card-pad mt-4">
            <p class="text-sm font-medium">Personne qui règle</p>
            <p class="text-sm opacity-70 mt-1 mb-3">
                Le reçu est toujours envoyé au tuteur enregistré de l'élève. Renseignez ces champs
                si quelqu'un d'autre règle : le reçu portera son nom et lui sera également envoyé.
            </p>
            <div class="flex flex-wrap gap-4">
                <label class="field-label">Nom
                    <input v-model="payerName" type="text" placeholder="Jean Kouassi"
                           class="input mt-1 w-56" />
                </label>
                <label class="field-label">Email
                    <input v-model="payerEmail" type="email" placeholder="parent@example.com"
                           class="input mt-1 w-72" />
                </label>
            </div>
        </div>

        <p v-if="feedback" class="alert-success mt-4">{{ feedback }}</p>
        <p v-if="feedbackError" class="alert-danger mt-4" role="alert">{{ feedbackError }}</p>
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
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="6" class="py-8 text-center" style="color: var(--text-muted)">Chargement…</td></tr>
                    <tr v-else-if="!filtered.length">
                        <td colspan="6" class="py-8 text-center" style="color: var(--text-muted)">Aucune tranche à encaisser.</td>
                    </tr>
                    <tr v-for="row in filtered" :key="row.id" >
                        <td class="font-mono">{{ studentOf(row).matricule }}</td>
                        <td>{{ studentOf(row).name }}</td>
                        <td>{{ row.label ?? '—' }}</td>
                        <td>{{ formatAmount(row.amount) }}</td>
                        <td>{{ formatDate(row.dueDate) }}</td>
                        <td>
                            <button class="btn-primary btn-sm"
                                    :disabled="collecting === row.id" @click="collect(row)">
                                {{ collecting === row.id ? 'En cours…' : 'Encaisser' }}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
