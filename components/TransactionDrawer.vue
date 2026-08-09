<script setup lang="ts">
import {
    paymentMeanLabel, transactionStatusLabel, transactionStatusTone, type Transaction,
} from '~/composables/useTransactions';

/**
 * Fiche d'une transaction, ouverte au clic sur une ligne.
 *
 * Le tableau tient huit colonnes ; la fiche répond aux questions qu'elles ne peuvent pas porter :
 * qui a payé, par quel canal, avec quelle référence chez l'opérateur, et si la quittance est
 * partie. C'est ce qu'on vient chercher quand une famille conteste un règlement.
 *
 * La **décomposition du montant** est donnée telle que la base la porte : le net de l'école et les
 * frais du payeur sont deux colonnes distinctes, jamais un total qu'on recomposerait à partir d'un
 * taux — un taux qui change laisserait les anciennes lignes fausses.
 */
const props = defineProps<{ transaction: Transaction }>();
const emit = defineEmits<{ close: [] }>();

function moment(iso?: string) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

const total = computed(() =>
    Number(props.transaction.amountSchool ?? 0) + Number(props.transaction.amountCommission ?? 0));

/**
 * Journal de l'opération, construit des seules dates réellement portées par la transaction.
 *
 * Une étape dont on n'a pas l'horodatage n'est pas inventée : afficher « confirmation reçue » sans
 * date laisserait croire à une confirmation qui n'a peut-être jamais eu lieu.
 */
const timeline = computed(() => {
    const steps: { label: string; at?: string }[] = [
        { label: 'Paiement initié', at: props.transaction.createdAt },
    ];
    if (props.transaction.settledAt) {
        steps.push({
            label: props.transaction.channel === 'ONLINE'
                ? 'Confirmation opérateur reçue'
                : 'Encaissement enregistré au guichet',
            at: props.transaction.settledAt,
        });
    }
    if (props.transaction.receiptNumber) {
        steps.push({ label: `Reçu ${props.transaction.receiptNumber} émis`, at: props.transaction.settledAt });
    }
    return steps;
});
</script>

<template>
    <SideDrawer
        :title="transaction.installmentLabel ?? 'Transaction'"
        :sub="`${transaction.reference ?? 'Encaissement au guichet'} · ${moment(transaction.createdAt)}`"
        @close="emit('close')"
    >
        <template #avatar>
            <div
                class="w-10 h-10 rounded-xl grid place-items-center shrink-0"
                style="background: var(--brand-50); color: var(--brand-600)"
            >
                <BoIcon name="receipt" :size="20" />
            </div>
        </template>

        <div
            class="rounded-xl p-4 mb-5"
            style="background: var(--surface-sunken); border: 1px solid var(--border)"
        >
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="kpi-label">Montant réglé</div>
                    <div class="nu mt-2 text-[30px] font-black leading-none" style="color: var(--navy)">
                        {{ fm(total) }}<span class="text-[15px] ml-1">FCFA</span>
                    </div>
                </div>
                <span
                    class="pill"
                    :style="{ color: transactionStatusTone(transaction.status), background: 'var(--surface-raised)' }"
                >{{ transactionStatusLabel(transaction.status) }}</span>
            </div>

            <div
                class="flex flex-wrap gap-5 mt-3.5 pt-3 text-[12px] font-semibold"
                style="border-top: 1px dashed var(--border-strong); color: var(--text-muted)"
            >
                <span>
                    Frais famille
                    <b class="nu ml-1" style="color: var(--navy)">
                        {{ fm(transaction.amountCommission) }}
                    </b>
                </span>
                <span>
                    Net école
                    <b class="nu ml-1" style="color: var(--success)">
                        {{ fm(transaction.amountSchool) }}
                    </b>
                </span>
            </div>
        </div>

        <p class="sec">Élève</p>
        <dl class="kv mb-5">
            <dt>Nom</dt>
            <dd>{{ transaction.studentLabel }}</dd>
            <dt>Matricule</dt>
            <dd class="nu">{{ transaction.studentRegistrationNumber ?? '—' }}</dd>
            <dt>Motif</dt>
            <dd>{{ transaction.installmentLabel ?? '—' }}</dd>
        </dl>

        <p class="sec">Paiement</p>
        <dl class="kv mb-5">
            <dt>Moyen</dt>
            <dd>{{ paymentMeanLabel(transaction) }}</dd>
            <dt>Référence</dt>
            <dd class="nu">{{ transaction.reference ?? '—' }}</dd>
            <dt>Payeur</dt>
            <dd>{{ transaction.payerName ?? '—' }}</dd>
            <dt>Rapprochement</dt>
            <dd>
                <UiPill v-if="transaction.reconciled" tone="ok">
                    Reçu {{ transaction.receiptNumber }}
                </UiPill>
                <UiPill v-else-if="transaction.status === 'SUCCEEDED'" tone="late">
                    À réconcilier
                </UiPill>
                <span v-else style="color: var(--text-faint)">—</span>
            </dd>
        </dl>

        <p class="sec">Journal</p>
        <div class="flex flex-col">
            <div v-for="(step, index) in timeline" :key="step.label" class="flex gap-3">
                <div class="flex flex-col items-center">
                    <i
                        class="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style="background: var(--brand-600)"
                    />
                    <i
                        v-if="index < timeline.length - 1" class="flex-1 w-px"
                        style="background: var(--border-strong)"
                    />
                </div>
                <div :class="index < timeline.length - 1 ? 'pb-3.5' : ''">
                    <b class="block text-[12.5px] font-bold" style="color: var(--navy)">
                        {{ step.label }}
                    </b>
                    <span class="nu text-[11.5px]" style="color: var(--text-faint)">
                        {{ moment(step.at) }}
                    </span>
                </div>
            </div>
        </div>

        <p
            v-if="!transaction.reconciled && transaction.status === 'SUCCEEDED'"
            class="alert-danger mt-5"
        >
            Cette opération est encaissée mais aucun reçu n'a été émis. L'écart se corrige à la
            source — en réémettant la quittance —, jamais en cochant une case ici.
        </p>

        <template v-if="transaction.reconciled" #footer>
            <NuxtLink to="/app/paiements/recus" class="btn-primary btn-sm">
                <BoIcon name="receipt" :size="15" />Voir le reçu
            </NuxtLink>
        </template>
    </SideDrawer>
</template>
