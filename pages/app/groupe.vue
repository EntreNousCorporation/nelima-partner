<script setup lang="ts">
import { formatAmount } from '~/composables/useBilling';
import type { SitesOverview, Site } from '~/composables/useSites';

/**
 * « Tous les sites » : les chiffres de l'année consultée, site par site, pour la direction du groupe.
 *
 * En lecture : on agit toujours dans un site. « Afficher » bascule l'espace école sur celui-là.
 */
const sitesApi = useSites();
const consultedYear = useConsultedYear();

const data = ref<SitesOverview | null>(null);
const loading = ref(true);
const error = ref('');

const totals = computed(() => {
    const rows = data.value?.sites ?? [];
    const sum = (pick: (r: SitesOverview['sites'][number]) => number) => rows.reduce((acc, r) => acc + Number(pick(r) ?? 0), 0);
    const expected = sum((r) => r.expected);
    const collected = sum((r) => r.collected);
    return {
        students: sum((r) => r.students), staff: sum((r) => r.staff), expected, collected,
        overdue: sum((r) => r.overdue), rate: expected ? Math.round((collected * 100) / expected) : 0,
    };
});

async function load() {
    loading.value = true;
    try {
        data.value = await sitesApi.overview();
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? 'La vue « Tous les sites » est réservée à la direction du groupe.';
    } finally {
        loading.value = false;
    }
}

async function show(site: Site) {
    await sitesApi.switchTo(site.id);
    await $fetch('/api/me', { query: { refresh: '1' } });
    window.location.assign('/app');
}

onMounted(load);
</script>

<template>
    <div>
        <PageHead
            title="Tous les sites"
            :sub="[data?.groupName, consultedYear.consulted.value ? `Année ${consultedYear.consulted.value.label}` : null].filter(Boolean).join(' · ')"
        />

        <p v-if="error" class="alert-danger mb-4" role="alert">{{ error }}</p>

        <div v-if="data" class="grid gap-3.5 mb-3.5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Élèves inscrits" icon="students" tone="var(--brand-600)" soft="var(--brand-50)"
                :value="totals.students.toLocaleString('fr-FR')" :foot="`${data.sites.length} site${data.sites.length > 1 ? 's' : ''}`" />
            <StatTile label="Encaissé" icon="cash" tone="var(--success)" soft="var(--success-soft)"
                :value="formatAmount(totals.collected)" :foot="`${totals.rate} % de l'attendu`" />
            <StatTile label="Attendu sur l'année" icon="receipt" tone="var(--navy)" soft="var(--surface-sunken)"
                :value="formatAmount(totals.expected)" foot="Tranches dues et réglées" />
            <StatTile label="Impayés échus" icon="alert" tone="var(--danger)" soft="var(--danger-soft)"
                :value="formatAmount(totals.overdue)" foot="Échéances dépassées non réglées" />
        </div>

        <UiCard title="Sites du groupe" sub="Chiffres de l'année consultée ; on agit toujours dans un site" :pad="false">
            <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Site</th>
                            <th class="text-right">Élèves</th>
                            <th class="text-right">Personnel</th>
                            <th class="text-right">Attendu</th>
                            <th class="text-right">Encaissé</th>
                            <th class="text-right">Recouvrement</th>
                            <th class="text-right">Impayés échus</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        <TableSkeleton v-if="loading" :columns="8" />
                        <tr v-for="row in data?.sites ?? []" v-else :key="row.site.id">
                            <td>
                                <b class="block text-[13px]" style="color: var(--navy)">{{ row.site.name }}</b>
                                <span v-if="row.site.city" class="text-[11.5px]" style="color: var(--text-faint)">{{ row.site.city }}</span>
                            </td>
                            <td class="num">{{ row.students.toLocaleString('fr-FR') }}</td>
                            <td class="num">{{ row.staff }}</td>
                            <td class="num">{{ formatAmount(row.expected) }}</td>
                            <td class="num" style="color: var(--success)">{{ formatAmount(row.collected) }}</td>
                            <td class="num">
                                <UiPill :tone="row.collectionRate >= 80 ? 'ok' : row.collectionRate >= 50 ? 'warn' : 'late'">{{ row.collectionRate }} %</UiPill>
                            </td>
                            <td class="num" :style="{ color: row.overdue > 0 ? 'var(--danger)' : 'var(--text-faint)' }">{{ formatAmount(row.overdue) }}</td>
                            <td class="text-right">
                                <button type="button" class="btn-ghost btn-sm" @click="show(row.site)">Afficher</button>
                            </td>
                        </tr>
                        <tr v-if="!loading && data && data.sites.length > 1" style="background: var(--surface-sunken)">
                            <td><b>Total groupe</b></td>
                            <td class="num"><b>{{ totals.students.toLocaleString('fr-FR') }}</b></td>
                            <td class="num"><b>{{ totals.staff }}</b></td>
                            <td class="num"><b>{{ formatAmount(totals.expected) }}</b></td>
                            <td class="num"><b>{{ formatAmount(totals.collected) }}</b></td>
                            <td class="num"><b>{{ totals.rate }} %</b></td>
                            <td class="num"><b>{{ formatAmount(totals.overdue) }}</b></td>
                            <td />
                        </tr>
                    </tbody>
                </table>
            </div>
        </UiCard>
    </div>
</template>
