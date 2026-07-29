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
        <h1 class="text-2xl font-semibold">Encaissement</h1>
        <p class="mt-1 opacity-70 max-w-2xl">
            Enregistrez un règlement reçu au guichet. Le reçu est émis immédiatement et numéroté.
            Aucune commission n'est prélevée sur ce canal.
        </p>

        <div class="mt-6 flex flex-wrap items-end gap-4">
            <label class="text-sm">Rechercher
                <input v-model="search" type="search" placeholder="Nom ou matricule"
                       class="mt-1 block w-64 rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2" />
            </label>
            <label class="text-sm">Mode de règlement
                <select v-model="channel"
                        class="mt-1 block rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2">
                    <option v-for="c in CHANNELS" :key="c.value" :value="c.value">{{ c.label }}</option>
                </select>
            </label>
            <label class="text-sm">Référence
                <input v-model="reference" type="text" placeholder="N° de chèque, virement…"
                       class="mt-1 block w-56 rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2" />
            </label>
        </div>

        <div class="mt-4 rounded border border-black/10 dark:border-white/15 p-4">
            <p class="text-sm font-medium">Personne qui règle</p>
            <p class="text-sm opacity-70 mt-1 mb-3">
                Le reçu est toujours envoyé au tuteur enregistré de l'élève. Renseignez ces champs
                si quelqu'un d'autre règle : le reçu portera son nom et lui sera également envoyé.
            </p>
            <div class="flex flex-wrap gap-4">
                <label class="text-sm">Nom
                    <input v-model="payerName" type="text" placeholder="Jean Kouassi"
                           class="mt-1 block w-56 rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2" />
                </label>
                <label class="text-sm">Email
                    <input v-model="payerEmail" type="email" placeholder="parent@example.com"
                           class="mt-1 block w-72 rounded border border-black/20 dark:border-white/20 bg-transparent px-3 py-2" />
                </label>
            </div>
        </div>

        <p v-if="feedback" class="mt-4 text-sm text-nelima-600">{{ feedback }}</p>
        <p v-if="feedbackError" class="mt-4 text-sm text-red-600" role="alert">{{ feedbackError }}</p>
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
                        <th class="py-2 pr-4 font-medium"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading"><td colspan="6" class="py-6 opacity-70">Chargement…</td></tr>
                    <tr v-else-if="!filtered.length">
                        <td colspan="6" class="py-6 opacity-70">Aucune tranche à encaisser.</td>
                    </tr>
                    <tr v-for="row in filtered" :key="row.id" class="border-b border-black/5 dark:border-white/10">
                        <td class="py-2 pr-4 font-mono">{{ studentOf(row).matricule }}</td>
                        <td class="py-2 pr-4">{{ studentOf(row).name }}</td>
                        <td class="py-2 pr-4">{{ row.label ?? '—' }}</td>
                        <td class="py-2 pr-4">{{ formatAmount(row.amount) }}</td>
                        <td class="py-2 pr-4">{{ formatDate(row.dueDate) }}</td>
                        <td class="py-2 pr-4">
                            <button class="rounded bg-nelima-600 px-3 py-1.5 text-white disabled:opacity-50"
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
