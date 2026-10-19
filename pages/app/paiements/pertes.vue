<script setup lang="ts">
import { formatAmount, formatDate } from '~/composables/useBilling';
import { WRITE_OFF_STATUSES, type WriteOff, type WriteOffStatus } from '~/composables/useWriteOffs';

/**
 * Passages en perte : les dettes que la comptabilité juge irrécouvrables.
 *
 * La comptabilité les propose depuis les relances ; la direction les valide ou les refuse ici.
 * Celui qui propose ne tranche jamais sa propre demande : renoncer à une créance se décide à deux.
 */
const writeOffs = useWriteOffs();
const { can } = usePermissions();

const rows = ref<WriteOff[]>([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const filter = ref<WriteOffStatus | 'ALL'>('PROPOSED');

const FILTERS: { value: WriteOffStatus | 'ALL'; label: string }[] = [
    { value: 'PROPOSED', label: 'À valider' },
    { value: 'APPROVED', label: 'Passées en perte' },
    { value: 'REJECTED', label: 'Refusées' },
    { value: 'ALL', label: 'Toutes' },
];

const shown = computed(() => rows.value.filter((r) => filter.value === 'ALL' || r.status === filter.value));
const pendingCount = computed(() => rows.value.filter((r) => r.status === 'PROPOSED').length);
const writtenOffTotal = computed(() => rows.value.filter((r) => r.status === 'APPROVED')
    .reduce((sum, r) => sum + Number(r.amount ?? 0), 0));
const photoOf = (r: WriteOff) => (r.studentPhotoId ? `/api/v1/students/${r.studentId}/photo?v=${r.studentPhotoId}` : null);
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

async function load() {
    loading.value = true;
    try {
        rows.value = await writeOffs.list();
        if (!rows.value.some((r) => r.status === 'PROPOSED') && filter.value === 'PROPOSED' && rows.value.length) {
            filter.value = 'ALL';
        }
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "Les passages en perte n'ont pas pu être chargés.";
    } finally {
        loading.value = false;
    }
}

/* ---- Décision ---- */
const deciding = ref<WriteOff | null>(null);
const decision = ref<'approve' | 'reject'>('approve');
const note = ref('');
const saving = ref(false);

function open(row: WriteOff, kind: 'approve' | 'reject') {
    deciding.value = row;
    decision.value = kind;
    note.value = '';
}

async function decide() {
    const row = deciding.value;
    if (!row) return;
    if (decision.value === 'reject' && !note.value.trim()) return;
    saving.value = true;
    try {
        if (decision.value === 'approve') await writeOffs.approve(row.id, note.value.trim() || undefined);
        else await writeOffs.reject(row.id, note.value.trim());
        notice.value = decision.value === 'approve'
            ? `${row.studentName} : ${formatAmount(row.amount)} passés en perte.`
            : `Demande refusée : la tranche de ${row.studentName} reste due.`;
        error.value = '';
        deciding.value = null;
        await load();
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "La décision n'a pas pu être enregistrée.";
        deciding.value = null;
        await load();
    } finally {
        saving.value = false;
    }
}

onMounted(load);
</script>

<template>
    <div>
        <PageHead title="Paiements" sub="Dettes irrécouvrables : proposées par la comptabilité, validées par la direction" />

        <PaymentsTabs />

        <p v-if="error" class="alert-danger mb-4" role="alert">{{ error }}</p>
        <p v-if="notice" class="alert-success mb-4">{{ notice }}</p>

        <UiCard
            title="Passages en perte" :pad="false"
            :sub="`${pendingCount} demande${pendingCount > 1 ? 's' : ''} à valider · ${formatAmount(writtenOffTotal)} passés en perte`"
            tip="Une demande se fait depuis l'onglet Relances. Tant qu'elle n'est pas validée, la tranche reste due et relancée. Personne ne valide sa propre demande."
        >
            <div class="tbar">
                <button
                    v-for="f in FILTERS" :key="f.value" type="button" class="chip"
                    :aria-pressed="filter === f.value" @click="filter = f.value"
                >{{ f.label }}</button>
            </div>
            <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Élève</th>
                            <th>Tranche</th>
                            <th>Motif</th>
                            <th>Proposée par</th>
                            <th>Statut</th>
                            <th class="text-right">Montant</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        <TableSkeleton v-if="loading" :columns="7" />
                        <tr v-for="row in shown" v-else :key="row.id">
                            <td>
                                <div class="flex items-center gap-2.5">
                                    <AvatarBadge :name="row.studentName" :size="28" tone="mute" :src="photoOf(row)" />
                                    <div class="nm min-w-0">
                                        <b>{{ row.studentName }}</b>
                                        <span class="nu">{{ row.registrationNumber }}</span>
                                    </div>
                                </div>
                            </td>
                            <td class="text-[12.5px]" style="color: var(--text-muted)">
                                {{ row.installmentLabel }}
                                <span v-if="row.dueDate" class="block text-[11.5px]" style="color: var(--text-faint)">échéance {{ formatDate(row.dueDate) }}</span>
                            </td>
                            <td class="text-[12.5px]" style="max-width: 320px; white-space: normal">
                                {{ row.reason }}
                                <span v-if="row.decisionNote" class="block text-[11.5px] mt-1" style="color: var(--text-faint)">
                                    Décision : {{ row.decisionNote }}
                                </span>
                            </td>
                            <td class="text-[12.5px]" style="color: var(--text-muted)">
                                {{ row.proposedBy }}
                                <span class="block text-[11.5px]" style="color: var(--text-faint)">{{ when(row.proposedAt) }}</span>
                            </td>
                            <td>
                                <UiPill :tone="WRITE_OFF_STATUSES[row.status].tone">{{ WRITE_OFF_STATUSES[row.status].label }}</UiPill>
                                <span v-if="row.decidedBy" class="block text-[11.5px] mt-1" style="color: var(--text-faint)">
                                    par {{ row.decidedBy }}, {{ when(row.decidedAt) }}
                                </span>
                            </td>
                            <td class="num" style="color: var(--navy)">{{ formatAmount(row.amount) }}</td>
                            <td class="text-right" style="white-space: nowrap">
                                <template v-if="row.decidable">
                                    <button type="button" class="btn-ghost btn-sm" @click="open(row, 'reject')">Refuser</button>
                                    <button type="button" class="btn-primary btn-sm" @click="open(row, 'approve')">Valider</button>
                                </template>
                                <span
                                    v-else-if="row.status === 'PROPOSED' && can('writeoff:approve')"
                                    class="text-[11.5px]" style="color: var(--text-faint)"
                                >Votre demande : à valider par une autre personne</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <EmptyState
                v-if="!loading && !shown.length"
                title="Aucune demande"
                text="Une dette irrécouvrable se propose depuis l'onglet Relances, bouton « Passer en perte »."
            />
        </UiCard>

        <SideDrawer
            v-if="deciding" :title="decision === 'approve' ? 'Valider le passage en perte' : 'Refuser la demande'"
            :sub="`${deciding.studentName} · ${deciding.installmentLabel} · ${formatAmount(deciding.amount)}`"
            @close="deciding = null"
        >
            <p class="field-label">Motif de la comptabilité</p>
            <p class="text-[13px] mb-4">{{ deciding.reason }}</p>
            <p class="text-[12.5px] mb-4" style="color: var(--text-muted)">
                <template v-if="decision === 'approve'">
                    La tranche ne sera plus réclamée ni relancée, et figurera comme perte. La décision est
                    inscrite au journal d'audit.
                </template>
                <template v-else>
                    La tranche reste due et continue d'être relancée. Votre motif est transmis à la comptabilité.
                </template>
            </p>
            <label class="field-label" for="decision-note">
                {{ decision === 'approve' ? 'Commentaire (facultatif)' : 'Motif du refus' }}
            </label>
            <textarea id="decision-note" v-model="note" rows="3" maxlength="500" class="input" style="height: auto; padding-top: 8px" />
            <template #footer>
                <button type="button" class="btn-secondary" @click="deciding = null">Annuler</button>
                <button
                    type="button" class="btn-primary"
                    :style="decision === 'reject' ? 'background: var(--danger-solid); border-color: var(--danger-solid)' : undefined"
                    :disabled="saving || (decision === 'reject' && !note.trim())" @click="decide"
                >
                    <BoIcon :name="decision === 'approve' ? 'check' : 'close'" :size="16" />
                    {{ decision === 'approve' ? 'Passer en perte' : 'Refuser' }}
                </button>
            </template>
        </SideDrawer>
    </div>
</template>
