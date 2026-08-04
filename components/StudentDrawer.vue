<script setup lang="ts">
import { formatAmount, formatDate, channelLabel, type Installment, type Receipt } from '~/composables/useBilling';
import { levelLabel, type Student } from '~/composables/useStudents';

/**
 * Fiche élève.
 *
 * Elle répond à la question qu'on se pose au comptoir devant un parent : où en est-il ? D'où
 * l'ordre — ce qui reste dû d'abord, l'échéancier ensuite, les reçus déjà émis en dernier.
 */
const props = defineProps<{ student: Student }>();
defineEmits<{ close: [] }>();

const { installments, receipts } = useBilling();

const dues = ref<Installment[]>([]);
const paid = ref<Receipt[]>([]);
const loading = ref(true);

const outstanding = computed(() => dues.value
    .filter((i) => i.status === 'PENDING')
    .reduce((sum, i) => sum + Number(i.amount ?? 0), 0));

const collected = computed(() => paid.value.reduce((sum, r) => sum + Number(r.amount ?? 0), 0));

const today = new Date().toISOString().slice(0, 10);

function isLate(installment: Installment) {
    return installment.status === 'PENDING'
        && Boolean(installment.dueDate) && installment.dueDate! < today;
}

onMounted(async () => {
    try {
        const [due, issued] = await Promise.all([
            installments({ studentId: props.student.id, size: 100 }),
            receipts({ studentId: props.student.id, size: 100 }),
        ]);
        dues.value = due.content ?? [];
        paid.value = issued.content ?? [];
    } finally {
        loading.value = false;
    }
});
</script>

<template>
    <SideDrawer
        :title="`${student.lastName} ${student.firstName}`"
        :sub="`${student.registrationNumber} · ${levelLabel(student.levelOfStudy)}`"
        @close="$emit('close')"
    >
        <template #avatar>
            <AvatarBadge :name="`${student.firstName} ${student.lastName}`" :size="42" />
        </template>

        <div
            class="rounded-xl p-4 mb-5"
            style="background: var(--surface-sunken); border: 1px solid var(--border)"
        >
            <div class="flex items-start justify-between gap-4">
                <div>
                    <div class="kpi-label">Reste à régler</div>
                    <div class="nu font-black text-[30px] leading-none mt-2 tabular-nums"
                         style="color: var(--navy); letter-spacing: -1px">
                        {{ formatAmount(outstanding) }}
                    </div>
                </div>
                <UiPill :tone="outstanding > 0 ? 'late' : 'ok'">
                    {{ outstanding > 0 ? 'Solde ouvert' : 'À jour' }}
                </UiPill>
            </div>
            <div
                class="flex gap-5 mt-3.5 pt-3 text-[12px] font-semibold"
                style="border-top: 1px dashed var(--border-strong); color: var(--text-muted)"
            >
                <span>Déjà réglé <b class="nu" style="color: var(--success)">{{ formatAmount(collected) }}</b></span>
                <span>{{ paid.length }} reçu{{ paid.length > 1 ? 's' : '' }}</span>
            </div>
        </div>

        <p class="sec">État civil</p>
        <dl class="kv mb-5">
            <dt>Matricule</dt><dd class="nu">{{ student.registrationNumber }}</dd>
            <dt>Niveau</dt><dd>{{ levelLabel(student.levelOfStudy) }}</dd>
            <dt>Naissance</dt><dd class="nu">{{ formatDate(student.birthDay) }}</dd>
            <dt>Lieu</dt><dd>{{ student.placeOfBirth || '—' }}</dd>
        </dl>

        <p class="sec">Échéancier</p>
        <p v-if="loading" class="text-[12.5px] mb-5" style="color: var(--text-faint)">Chargement…</p>
        <div v-else-if="dues.length" class="rounded-xl overflow-hidden mb-5" style="border: 1px solid var(--border)">
            <div
                v-for="installment in dues" :key="installment.id"
                class="flex items-center gap-3 px-3 py-2.5"
                style="border-bottom: 1px solid var(--border)"
            >
                <div class="nm flex-1 min-w-0">
                    <b>{{ installment.label ?? 'Tranche' }}</b>
                    <span class="nu">Échéance {{ formatDate(installment.dueDate) }}</span>
                </div>
                <b class="nu text-[12.5px]" style="color: var(--navy)">
                    {{ formatAmount(installment.amount) }}
                </b>
                <UiPill :tone="installment.status === 'PAID' ? 'ok' : isLate(installment) ? 'late' : 'warn'">
                    {{ installment.status === 'PAID' ? 'Réglée' : isLate(installment) ? 'En retard' : 'À venir' }}
                </UiPill>
            </div>
        </div>
        <p v-else class="text-[12.5px] mb-5" style="color: var(--text-faint)">
            Aucune tranche : cet élève n'est rattaché à aucun frais découpé en échéances.
        </p>

        <p class="sec">Reçus</p>
        <div v-if="paid.length" class="rounded-xl overflow-hidden" style="border: 1px solid var(--border)">
            <div
                v-for="receipt in paid" :key="receipt.id"
                class="flex items-center gap-3 px-3 py-2.5"
                style="border-bottom: 1px solid var(--border)"
            >
                <div class="nm flex-1 min-w-0">
                    <b class="nu">{{ receipt.number }}</b>
                    <span class="nu">
                        {{ formatDate(receipt.issuedAt) }} · {{ channelLabel(receipt.channel) }}
                    </span>
                </div>
                <b class="nu text-[12.5px]" style="color: var(--success)">
                    {{ formatAmount(receipt.amount) }}
                </b>
                <a
                    :href="`/api/v1/receipts/${receipt.id}/pdf`"
                    :download="`recu-${receipt.number}.pdf`" class="btn-secondary btn-sm"
                >PDF</a>
            </div>
        </div>
        <p v-else-if="!loading" class="text-[12.5px]" style="color: var(--text-faint)">
            Aucun règlement enregistré pour cet élève.
        </p>

        <template #footer>
            <NuxtLink to="/app/encaissement" class="btn-primary flex-1">
                Encaisser au guichet
            </NuxtLink>
            <NuxtLink :to="`/app/recus?q=${student.registrationNumber}`" class="btn-secondary">
                Ses reçus
            </NuxtLink>
        </template>
    </SideDrawer>
</template>
