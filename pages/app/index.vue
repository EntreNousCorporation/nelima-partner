<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();

type ReceiptSummary = {
    id: string;
    number: string;
    amount: number;
    studentLabel: string;
    issuedAt: string;
};

type Summary = {
    studentCount: number;
    collectedThisMonth: number;
    receiptsThisMonth: number;
    pendingAmount: number;
    pendingCount: number;
    overdueAmount: number;
    overdueCount: number;
    recentReceipts: ReceiptSummary[];
};

// `useRequestFetch` et non `$fetch` : en rendu serveur, seul le premier réémet le cookie de
// session, sans quoi l'appel repartirait sans authentification et l'écran s'afficherait vide.
const request = useRequestFetch();
const { data: summary, pending, error } = await useAsyncData<Summary>(
    'dashboard-summary',
    () => request('/api/v1/dashboard/summary') as Promise<Summary>,
);

/** Les montants sont rendus par le serveur : ici on ne fait que les mettre en forme. */
function xof(amount?: number | null) {
    return `${Math.round(amount ?? 0).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;
}

function day(iso?: string) {
    return iso ? new Date(iso).toLocaleDateString('fr-FR') : '—';
}

const monthLabel = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
</script>

<template>
    <div>
        <div class="page-header">
            <div>
                <h1 class="page-title">Tableau de bord</h1>
                <p class="page-subtitle">
                    Bonjour {{ auth.fullName }} — {{ auth.user?.establishmentName ?? 'votre établissement' }}
                </p>
            </div>
            <NuxtLink to="/app/encaissement" class="btn-primary">
                <svg
                    class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round"
                >
                    <path d="M12 5v14M5 12h14" />
                </svg>
                Encaisser
            </NuxtLink>
        </div>

        <p v-if="error" class="alert-danger mb-6">
            Les indicateurs n'ont pas pu être chargés. Rechargez la page dans un instant.
        </p>

        <!-- Squelettes plutôt qu'un « Chargement… » : la page garde sa forme et ne saute pas
             lorsque les chiffres arrivent. -->
        <div v-if="pending" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-8">
            <div v-for="n in 4" :key="n" class="stat">
                <div class="h-3 w-24 rounded animate-pulse" style="background: var(--surface-sunken)" />
                <div class="h-7 w-28 rounded animate-pulse mt-2" style="background: var(--surface-sunken)" />
            </div>
        </div>

        <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-8">
            <div class="stat">
                <span class="stat-label">Élèves inscrits</span>
                <span class="stat-value">{{ summary?.studentCount ?? 0 }}</span>
                <span class="stat-hint">Effectif de l'établissement</span>
            </div>

            <div class="stat">
                <span class="stat-label">Encaissé en {{ monthLabel }}</span>
                <span class="stat-value">{{ xof(summary?.collectedThisMonth) }}</span>
                <span class="stat-hint">
                    {{ summary?.receiptsThisMonth ?? 0 }}
                    reçu{{ (summary?.receiptsThisMonth ?? 0) > 1 ? 's' : '' }} émis
                </span>
            </div>

            <div class="stat">
                <span class="stat-label">Reste à encaisser</span>
                <span class="stat-value">{{ xof(summary?.pendingAmount) }}</span>
                <span class="stat-hint">
                    {{ summary?.pendingCount ?? 0 }}
                    tranche{{ (summary?.pendingCount ?? 0) > 1 ? 's' : '' }} en attente
                </span>
            </div>

            <!-- Le retard est le seul chiffre qui appelle une action : il est le seul coloré. -->
            <div class="stat">
                <span class="stat-label">Échéances dépassées</span>
                <span
                    class="stat-value"
                    :style="(summary?.overdueCount ?? 0) > 0 ? 'color: var(--danger)' : ''"
                >{{ xof(summary?.overdueAmount) }}</span>
                <NuxtLink
                    v-if="(summary?.overdueCount ?? 0) > 0"
                    to="/app/impayes"
                    class="stat-hint underline"
                >
                    {{ summary?.overdueCount }} à relancer
                </NuxtLink>
                <span v-else class="stat-hint">Rien en retard</span>
            </div>
        </div>

        <section>
            <div class="flex items-center justify-between mb-3">
                <h2 class="section-title mb-0">Derniers encaissements</h2>
                <NuxtLink to="/app/recus" class="text-sm font-medium" style="color: var(--brand-600)">
                    Tous les reçus
                </NuxtLink>
            </div>

            <div class="table-wrap">
                <table v-if="summary?.recentReceipts?.length" class="table">
                    <thead>
                        <tr>
                            <th>Reçu</th>
                            <th>Élève</th>
                            <th>Date</th>
                            <th class="text-right">Montant</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="receipt in summary.recentReceipts" :key="receipt.id">
                            <td class="font-medium tabular-nums">{{ receipt.number }}</td>
                            <td>{{ receipt.studentLabel }}</td>
                            <td style="color: var(--text-muted)">{{ day(receipt.issuedAt) }}</td>
                            <td class="num">{{ xof(receipt.amount) }}</td>
                        </tr>
                    </tbody>
                </table>

                <div v-else class="empty">
                    <p class="empty-title">Aucun encaissement pour l'instant</p>
                    <p class="empty-text">
                        Les règlements enregistrés au guichet et les paiements en ligne des parents
                        apparaîtront ici, avec leur reçu numéroté.
                    </p>
                    <NuxtLink to="/app/encaissement" class="btn-secondary btn-sm mt-2">
                        Enregistrer un encaissement
                    </NuxtLink>
                </div>
            </div>
        </section>
    </div>
</template>
