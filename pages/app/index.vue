<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();

type ReceiptSummary = {
    id: string; number: string; amount: number; studentLabel: string; issuedAt: string;
};
type OverdueStudent = {
    studentId: string; label: string; registrationNumber: string;
    levelCode: string | null; daysLate: number; amount: number;
};
type MonthlyPoint = { month: string; expected: number; collected: number };

type Summary = {
    studentCount: number;
    collectedThisMonth: number;
    receiptsThisMonth: number;
    collectedToday: number;
    paymentsToday: number;
    expectedThisMonth: number;
    collectedPreviousMonth: number;
    monthly: MonthlyPoint[];
    pendingAmount: number;
    pendingCount: number;
    overdueAmount: number;
    overdueCount: number;
    topOverdue: OverdueStudent[];
    recentReceipts: ReceiptSummary[];
};

// `useRequestFetch` et non `$fetch` : en rendu serveur, seul le premier réémet le cookie de
// session, sans quoi l'appel repartirait sans authentification et l'écran s'afficherait vide.
const request = useRequestFetch();
const { data: summary, pending, error } = await useAsyncData<Summary>(
    'dashboard-summary',
    () => request('/api/v1/dashboard/summary') as Promise<Summary>,
);

/** Les montants viennent du serveur : ici on ne fait que les mettre en forme. */
function xof(amount?: number | null) {
    return Math.round(amount ?? 0).toLocaleString('fr-FR').replace(/ | /g, ' ');
}

/** Au-delà du million, l'unité compacte évite de faire lire neuf chiffres d'un coup d'œil. */
function compact(amount?: number | null) {
    const value = Math.round(amount ?? 0);
    if (value >= 1_000_000) {
        return { value: (value / 1_000_000).toFixed(1).replace('.', ','), unit: 'M FCFA' };
    }
    return { value: value.toLocaleString('fr-FR').replace(/ | /g, ' '), unit: 'FCFA' };
}

function day(iso?: string) {
    return iso ? new Date(iso).toLocaleDateString('fr-FR') : '—';
}

function hour(iso?: string) {
    return iso
        ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '—';
}

function initials(name?: string | null) {
    return (name ?? '').split(' ').filter(Boolean).slice(0, 2)
        .map((part) => part[0]?.toUpperCase()).join('') || '—';
}

const monthLabel = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

/** Part de l'attendu du mois effectivement encaissée. */
const recoveryRate = computed(() => {
    const expected = summary.value?.expectedThisMonth ?? 0;
    if (!expected) return null;
    return ((summary.value?.collectedThisMonth ?? 0) / expected) * 100;
});

/**
 * Écart avec le mois précédent, en pourcentage.
 *
 * Rendu nul quand le mois précédent est à zéro : une progression « infinie » ne veut rien dire, et
 * afficher `+∞ %` ou `+100 %` sur un premier mois d'activité serait trompeur.
 */
const deltaCollected = computed(() => {
    const previous = summary.value?.collectedPreviousMonth ?? 0;
    if (!previous) return null;
    return (((summary.value?.collectedThisMonth ?? 0) - previous) / previous) * 100;
});

const collected = computed(() => compact(summary.value?.collectedThisMonth));
const outstanding = computed(() => compact(summary.value?.overdueAmount));
const today = computed(() => compact(summary.value?.collectedToday));
</script>

<template>
    <div>
        <div class="page-header">
            <div>
                <h1 class="text-[22px] font-black tracking-tight" style="color: var(--navy)">
                    Tableau de bord
                </h1>
                <p class="mt-1 text-[13px]" style="color: var(--text-faint)">
                    {{ auth.user?.establishmentName ?? 'Votre établissement' }} · {{ monthLabel }}
                </p>
            </div>
            <NuxtLink to="/app/encaissement" class="btn-primary">
                <svg
                    class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2" stroke-linecap="round"
                >
                    <path d="M12 5v14M5 12h14" />
                </svg>
                Encaisser au guichet
            </NuxtLink>
        </div>

        <p v-if="error" class="alert-danger mb-4">
            Les indicateurs n'ont pas pu être chargés. Rechargez la page dans un instant.
        </p>

        <!-- Squelettes plutôt qu'un « Chargement… » : la page garde sa forme et ne saute pas
             lorsque les chiffres arrivent. -->
        <div v-if="pending" class="grid-12">
            <div v-for="n in 4" :key="n" class="card p-4" style="grid-column: span 3">
                <div class="h-3 w-24 rounded animate-pulse" style="background: var(--surface-sunken)" />
                <div class="h-7 w-28 rounded animate-pulse mt-3" style="background: var(--surface-sunken)" />
            </div>
        </div>

        <template v-else>
            <div class="grid-12 mb-3.5">
                <div class="card p-4" style="grid-column: span 3">
                    <span class="kpi-label">Encaissé · {{ monthLabel.split(' ')[0] }}</span>
                    <span class="kpi-value">
                        {{ collected.value }}<small>{{ collected.unit }}</small>
                    </span>
                    <span class="kpi-foot">
                        <span
                            v-if="deltaCollected !== null"
                            class="delta" :class="deltaCollected >= 0 ? 'delta-up' : 'delta-down'"
                        >
                            {{ deltaCollected >= 0 ? '↗' : '↘' }}
                            {{ Math.abs(deltaCollected).toFixed(1).replace('.', ',') }} %
                        </span>
                        sur {{ xof(summary?.expectedThisMonth) }} attendus
                    </span>
                </div>

                <div class="card p-4 flex items-start justify-between gap-3" style="grid-column: span 3">
                    <div class="min-w-0">
                        <span class="kpi-label">Taux de recouvrement</span>
                        <span class="kpi-value">
                            <template v-if="recoveryRate !== null">
                                {{ recoveryRate.toFixed(1).replace('.', ',') }}<small>%</small>
                            </template>
                            <template v-else>—</template>
                        </span>
                        <span class="kpi-foot">
                            {{ recoveryRate !== null
                                ? 'de l\'attendu du mois'
                                : 'aucune échéance ce mois' }}
                        </span>
                    </div>
                    <StatDonut
                        v-if="recoveryRate !== null"
                        :percent="recoveryRate"
                        :tone="recoveryRate < 80 ? 'var(--warning-solid)' : 'var(--success-solid)'"
                    />
                </div>

                <div class="card p-4" style="grid-column: span 3">
                    <span class="kpi-label">Reste à recouvrer</span>
                    <span class="kpi-value">
                        {{ outstanding.value }}<small>{{ outstanding.unit }}</small>
                    </span>
                    <span class="kpi-foot">
                        <b class="nu" style="color: var(--danger)">{{ summary?.overdueCount ?? 0 }}</b>
                        échéance{{ (summary?.overdueCount ?? 0) > 1 ? 's' : '' }} dépassée{{ (summary?.overdueCount ?? 0) > 1 ? 's' : '' }}
                        · {{ xof(summary?.pendingAmount) }} dus au total
                    </span>
                </div>

                <div class="card p-4" style="grid-column: span 3">
                    <span class="kpi-label">Encaissé aujourd'hui</span>
                    <span class="kpi-value">{{ today.value }}<small>{{ today.unit }}</small></span>
                    <span class="kpi-foot">
                        <i class="live-dot" />
                        {{ summary?.paymentsToday ?? 0 }}
                        paiement{{ (summary?.paymentsToday ?? 0) > 1 ? 's' : '' }} aujourd'hui
                    </span>
                </div>
            </div>

            <div class="grid-12">
                <section class="card" style="grid-column: span 8">
                    <div class="px-4 py-3" style="border-bottom: 1px solid var(--border)">
                        <h3 class="text-sm font-extrabold" style="color: var(--navy)">
                            Recouvrement mensuel
                        </h3>
                        <p class="text-[11.5px] mt-0.5" style="color: var(--text-faint)">
                            Attendu selon les échéanciers, comparé à ce qui est réellement rentré
                        </p>
                    </div>
                    <div class="p-4">
                        <MonthlyBars :points="summary?.monthly ?? []" />
                    </div>
                </section>

                <section class="card" style="grid-column: span 4">
                    <div
                        class="px-4 py-3 flex items-start justify-between gap-3"
                        style="border-bottom: 1px solid var(--border)"
                    >
                        <div>
                            <h3 class="text-sm font-extrabold" style="color: var(--navy)">
                                Derniers encaissements
                            </h3>
                            <p class="text-[11.5px] mt-0.5" style="color: var(--text-faint)">
                                Guichet et paiements en ligne confondus
                            </p>
                        </div>
                        <span
                            class="badge" style="background: var(--success-soft); color: var(--success)"
                        ><i class="live-dot" /> À jour</span>
                    </div>

                    <div v-if="summary?.recentReceipts?.length">
                        <div v-for="receipt in summary.recentReceipts" :key="receipt.id" class="feed-row">
                            <span
                                class="avatar w-[30px] h-[30px]"
                                style="background: var(--brand-50); color: var(--brand-700)"
                            >{{ initials(receipt.studentLabel) }}</span>
                            <div class="flex-1 min-w-0">
                                <b class="block text-[12.5px] font-bold truncate" style="color: var(--navy)">
                                    {{ receipt.studentLabel }}
                                </b>
                                <span class="text-[11.5px]" style="color: var(--text-faint)">
                                    Reçu {{ receipt.number }}
                                </span>
                            </div>
                            <div class="text-right">
                                <b class="nu block text-[12.5px] font-extrabold" style="color: var(--success)">
                                    +{{ xof(receipt.amount) }}
                                </b>
                                <span class="nu text-[11px]" style="color: var(--text-faint)">
                                    {{ hour(receipt.issuedAt) }} · {{ day(receipt.issuedAt) }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div v-else class="empty">
                        <p class="empty-title">Aucun encaissement</p>
                        <p class="empty-text">
                            Les règlements au guichet et les paiements en ligne des parents
                            apparaîtront ici.
                        </p>
                    </div>

                    <div
                        class="px-4 py-2.5 flex items-center justify-between"
                        style="border-top: 1px solid var(--border)"
                    >
                        <span class="text-[12px]" style="color: var(--text-faint)">
                            {{ summary?.receiptsThisMonth ?? 0 }} ce mois-ci
                        </span>
                        <NuxtLink to="/app/recus" class="btn-secondary btn-sm">Tout voir</NuxtLink>
                    </div>
                </section>

                <section class="card" style="grid-column: span 7">
                    <div
                        class="px-4 py-3 flex items-start justify-between gap-3"
                        style="border-bottom: 1px solid var(--border)"
                    >
                        <div>
                            <h3 class="text-sm font-extrabold" style="color: var(--navy)">
                                Impayés à relancer
                            </h3>
                            <p class="text-[11.5px] mt-0.5" style="color: var(--text-faint)">
                                Retards les plus élevés, un élève par ligne
                            </p>
                        </div>
                        <NuxtLink to="/app/impayes" class="btn-secondary btn-sm">Tous les impayés</NuxtLink>
                    </div>

                    <div v-if="summary?.topOverdue?.length" class="table-wrap" style="border: 0; box-shadow: none">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Élève</th>
                                    <th>Retard</th>
                                    <th class="text-right">Solde dû</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="student in summary.topOverdue" :key="student.studentId">
                                    <td>
                                        <div class="flex items-center gap-2.5">
                                            <span
                                                class="avatar w-7 h-7"
                                                style="background: var(--surface-sunken); color: var(--text-muted)"
                                            >{{ initials(student.label) }}</span>
                                            <div class="min-w-0">
                                                <b class="block text-[12.5px]" style="color: var(--navy)">
                                                    {{ student.label }}
                                                </b>
                                                <span class="text-[11.5px]" style="color: var(--text-faint)">
                                                    {{ student.levelCode ?? 'Niveau non renseigné' }}
                                                    · {{ student.registrationNumber }}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <!-- Au-delà d'un mois, le rappel écrit ne suffit plus :
                                             l'étiquette change de ton pour le signaler. -->
                                        <span
                                            class="badge"
                                            :class="student.daysLate > 30 ? 'badge-danger' : 'badge-warning'"
                                        >{{ student.daysLate }} j</span>
                                    </td>
                                    <td class="num">{{ xof(student.amount) }} F</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div v-else class="empty">
                        <p class="empty-title">Aucun retard</p>
                        <p class="empty-text">Toutes les échéances passées ont été réglées.</p>
                    </div>
                </section>

                <section class="card p-4" style="grid-column: span 5">
                    <h3 class="text-sm font-extrabold mb-3" style="color: var(--navy)">
                        Effectif
                    </h3>
                    <div class="flex items-baseline gap-2">
                        <span class="kpi-value">{{ summary?.studentCount ?? 0 }}</span>
                        <span class="text-[13px]" style="color: var(--text-muted)">élèves inscrits</span>
                    </div>
                    <p class="text-[12.5px] mt-3 leading-relaxed" style="color: var(--text-muted)">
                        Le remplissage par classe et les présences du jour, prévus par la maquette,
                        arriveront avec la gestion des classes.
                    </p>
                    <NuxtLink to="/app/eleves" class="btn-secondary btn-sm mt-3">
                        Voir les élèves
                    </NuxtLink>
                </section>
            </div>
        </template>
    </div>
</template>
