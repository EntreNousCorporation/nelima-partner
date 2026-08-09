<script setup lang="ts">
import { channelLabel, formatAmount, formatDate, formatTime, type Receipt } from '~/composables/useBilling';

/**
 * Détail d'un reçu.
 *
 * Tout est déjà porté par la ligne du tableau : un reçu fige ce qu'il affiche à l'émission, il n'y
 * a donc rien à recharger — ni risque de montrer autre chose que ce que dit la pièce.
 */
defineProps<{ receipt: Receipt }>();
defineEmits<{ close: [] }>();
</script>

<template>
    <SideDrawer
        :title="`Reçu ${receipt.number}`"
        :sub="`${formatDate(receipt.issuedAt)} à ${formatTime(receipt.issuedAt)}`"
        @close="$emit('close')"
    >
        <template #avatar>
            <div
                class="w-10 h-10 rounded-xl grid place-items-center shrink-0"
                style="background: var(--brand-50); color: var(--brand-700)"
            >
                <BoIcon name="receipt" :size="20" />
            </div>
        </template>

        <div
            class="rounded-xl p-4 mb-5"
            style="background: var(--surface-sunken); border: 1px solid var(--border)"
        >
            <div class="flex items-start justify-between gap-4">
                <div>
                    <div class="kpi-label">Montant réglé</div>
                    <div
                        class="nu font-black text-[30px] leading-none mt-2 tabular-nums"
                        style="color: var(--navy); letter-spacing: -1px"
                    >{{ formatAmount(receipt.amount) }}</div>
                </div>
                <UiPill tone="ok">Encaissé</UiPill>
            </div>
            <!-- La commission n'apparaît pas ici : elle est prélevée en sus par la plateforme et
                 ne fait pas partie de ce que l'école a encaissé. -->
            <p
                class="mt-3.5 pt-3 text-[12px]"
                style="border-top: 1px dashed var(--border-strong); color: var(--text-muted)"
            >
                Montant revenant à l'établissement, hors commission de la plateforme.
            </p>
        </div>

        <p class="sec">Élève</p>
        <dl class="kv mb-5">
            <dt>Nom</dt><dd>{{ receipt.studentLabel ?? '—' }}</dd>
            <dt>Matricule</dt><dd class="nu">{{ receipt.studentRegistrationNumber ?? '—' }}</dd>
        </dl>

        <p class="sec">Règlement</p>
        <dl class="kv mb-5">
            <dt>Payeur</dt><dd>{{ receipt.payerLabel || 'Tuteur de l\'élève' }}</dd>
            <dt>Mode</dt><dd>{{ channelLabel(receipt.channel) }}</dd>
            <dt>Numéro de pièce</dt><dd class="nu">{{ receipt.number }}</dd>
            <dt>Date et heure</dt>
            <dd class="nu">{{ formatDate(receipt.issuedAt) }} à {{ formatTime(receipt.issuedAt) }}</dd>
        </dl>

        <p class="sec">Journal</p>
        <div class="flex flex-col gap-3">
            <div
                v-for="(step, index) in [
                    receipt.channel === 'ONLINE'
                        ? 'Paiement réglé par le parent depuis l\'application'
                        : 'Règlement reçu au guichet et saisi par l\'établissement',
                    'Tranche soldée et reçu numéroté',
                    // Pas « envoyé au tuteur » : le courriel n'est adressé que si la famille a un
                    // contact joignable, et le journal affirmerait un envoi qui n'a pas eu lieu.
                    'Pièce disponible au téléchargement et dans l\'application du parent',
                ]" :key="index" class="flex gap-3"
            >
                <div class="flex flex-col items-center">
                    <i class="w-2 h-2 rounded-full mt-1.5 shrink-0" style="background: var(--brand-600)" />
                    <i v-if="index < 2" class="flex-1 w-px" style="background: var(--border-strong)" />
                </div>
                <div class="pb-1">
                    <b class="block text-[12.5px] font-bold" style="color: var(--navy)">{{ step }}</b>
                    <span class="nu text-[11.5px]" style="color: var(--text-faint)">
                        {{ formatDate(receipt.issuedAt) }} · {{ formatTime(receipt.issuedAt) }}
                    </span>
                </div>
            </div>
        </div>

        <template #footer>
            <a
                :href="`/api/v1/receipts/${receipt.id}/pdf`"
                :download="`recu-${receipt.number}.pdf`" class="btn-primary flex-1"
            ><BoIcon name="download" :size="16" />Télécharger le reçu</a>
        </template>
    </SideDrawer>
</template>
