<script setup lang="ts">
import { formatAmount, formatDate, studentOf, type Installment } from '~/composables/useBilling';

const { installments } = useBilling();

const rows = ref<Installment[]>([]);
const loading = ref(true);
const error = ref('');
const keyword = ref('');
/** Palier de retard sélectionné, en jours. `0` affiche tout ce qui est échu. */
const threshold = ref(0);

const THRESHOLDS = [
    { days: 0, label: 'Tous les retards' },
    { days: 7, label: 'Plus de 7 jours' },
    { days: 30, label: 'Plus de 30 jours' },
];

/** Un impayé est une tranche encore due dont l'échéance est passée. */
const today = new Date().toISOString().slice(0, 10);

function daysLate(dueDate?: string) {
    if (!dueDate) return 0;
    const diff = Date.now() - new Date(dueDate).getTime();
    return Math.max(0, Math.floor(diff / 86_400_000));
}

const filtered = computed(() => {
    const q = keyword.value.trim().toLowerCase();
    return rows.value.filter((i) => {
        if (daysLate(i.dueDate) < threshold.value) return false;
        if (!q) return true;
        const s = studentOf(i);
        return s.name.toLowerCase().includes(q) || s.matricule.toLowerCase().includes(q);
    });
});

const total = computed(() =>
    filtered.value.reduce((sum, i) => sum + Number(i.amount ?? 0), 0));

/** Un élève peut cumuler plusieurs tranches en retard : c'est le nombre de familles qui compte. */
const familyCount = computed(() =>
    new Set(filtered.value.map((i) => studentOf(i).matricule)).size);

const oldest = computed(() =>
    filtered.value.reduce((max, i) => Math.max(max, daysLate(i.dueDate)), 0));

const overThirty = computed(() =>
    filtered.value.filter((i) => daysLate(i.dueDate) > 30).length);

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
        <PageHead
            title="Impayés"
            sub="Tranches dont l'échéance est dépassée et qui restent dues"
        >
            <template #actions>
                <NuxtLink to="/app/encaissement" class="btn-primary">
                    Encaisser au guichet
                </NuxtLink>
            </template>
        </PageHead>

        <p v-if="error" class="alert-danger mb-4" role="alert">{{ error }}</p>

        <div class="grid-12 mb-3.5">
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">Reste à recouvrer</span>
                <span class="kpi-value">{{ formatAmount(total).replace(' FCFA', '') }}<small>FCFA</small></span>
                <span class="kpi-foot">sur les échéances dépassées</span>
            </div>
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">Familles concernées</span>
                <span class="kpi-value">{{ familyCount }}</span>
                <span class="kpi-foot">
                    {{ filtered.length }} tranche{{ filtered.length > 1 ? 's' : '' }} en retard
                </span>
            </div>
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">Retard le plus ancien</span>
                <span class="kpi-value">{{ oldest }}<small>jours</small></span>
                <span class="kpi-foot">depuis la date d'échéance</span>
            </div>
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">Au-delà d'un mois</span>
                <span class="kpi-value">{{ overThirty }}</span>
                <!-- Le seuil n'est pas décoratif : passé un mois, un rappel écrit ne suffit
                     généralement plus et l'école reprend contact directement. -->
                <span class="kpi-foot">à traiter par un contact direct</span>
            </div>
        </div>

        <UiCard :pad="false">
            <div class="tbar">
                <label class="inp" style="flex: 0 1 260px">
                    <svg
                        class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        stroke-width="2" stroke-linecap="round"
                    >
                        <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                    </svg>
                    <input
                        v-model="keyword" type="search" class="w-full"
                        placeholder="Nom ou matricule…" aria-label="Rechercher un élève"
                    />
                </label>

                <div class="flex items-center gap-2">
                    <button
                        v-for="t in THRESHOLDS" :key="t.days" class="chip"
                        :aria-pressed="threshold === t.days" @click="threshold = t.days"
                    >{{ t.label }}</button>
                </div>
            </div>

            <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Élève</th>
                            <th>Tranche</th>
                            <th>Échéance</th>
                            <th>Retard</th>
                            <th class="text-right">Montant dû</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="loading">
                            <td colspan="5" class="py-8 text-center" style="color: var(--text-faint)">
                                Chargement…
                            </td>
                        </tr>
                        <tr v-for="row in filtered" v-else :key="row.id">
                            <td>
                                <div class="flex items-center gap-2.5">
                                    <AvatarBadge :name="studentOf(row).name" :size="28" tone="mute" />
                                    <div class="nm min-w-0">
                                        <b>{{ studentOf(row).name }}</b>
                                        <span class="nu">{{ studentOf(row).matricule }}</span>
                                    </div>
                                </div>
                            </td>
                            <td class="text-[12.5px]" style="color: var(--text-muted)">
                                {{ row.label ?? '—' }}
                            </td>
                            <td class="nu text-[12.5px]" style="color: var(--text-muted)">
                                {{ formatDate(row.dueDate) }}
                            </td>
                            <td>
                                <UiPill :tone="daysLate(row.dueDate) > 30 ? 'late' : 'warn'">
                                    {{ daysLate(row.dueDate) }} j
                                </UiPill>
                            </td>
                            <td class="num" style="color: var(--navy)">{{ formatAmount(row.amount) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <EmptyState
                v-if="!loading && !filtered.length && (keyword || threshold)"
                title="Aucun résultat"
                text="Aucune tranche en retard ne correspond à ce filtre."
            />
            <EmptyState
                v-else-if="!loading && !filtered.length"
                title="Aucun impayé"
                text="Toutes les échéances passées ont été réglées. Les nouvelles apparaîtront ici le lendemain de leur date limite."
            />

            <template #footer>
                <span class="text-[12px]" style="color: var(--text-faint)">
                    <b class="nu" style="color: var(--navy)">{{ filtered.length }}</b>
                    tranche{{ filtered.length > 1 ? 's' : '' }} ·
                    <b class="nu" style="color: var(--danger)">{{ formatAmount(total) }}</b>
                </span>
                <!-- Les campagnes de relance du prototype (SMS, push, e-mail) supposent un envoi
                     de masse que la plateforme ne sait pas encore faire ; le rappel automatique
                     par notification, lui, part déjà à J-7 et J-1. -->
                <span class="text-[12px]" style="color: var(--text-faint)">
                    Un rappel automatique part aux parents 7 jours puis 1 jour avant l'échéance
                </span>
            </template>
        </UiCard>
    </div>
</template>
