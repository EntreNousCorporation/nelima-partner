<script setup lang="ts">
import { formatAmount, formatDate, studentOf, type Installment } from '~/composables/useBilling';
import {
    DEFAULT_TEMPLATE, REMINDER_CHANNELS, TEMPLATE_VARIABLES, reminderChannelLabel,
    type ReminderCampaign, type ReminderChannel, type ReminderTarget, type ReminderTargetCount,
} from '~/composables/useReminders';

const { installments } = useBilling();
const { targets, campaigns, send } = useReminders();
const { can } = usePermissions();

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

/* ---- Campagnes de relance ---- */
const canSend = computed(() => can('reminder:write'));

const targetCounts = ref<ReminderTargetCount[]>([]);
const history = ref<ReminderCampaign[]>([]);
const sending = ref(false);
const sendError = ref('');
const lastResult = ref<ReminderCampaign | null>(null);

const campaign = reactive({
    name: '',
    target: 'LATE_30' as ReminderTarget,
    channels: ['PUSH'] as ReminderChannel[],
    messageTemplate: DEFAULT_TEMPLATE,
});

const selectedTarget = computed(() =>
    targetCounts.value.find((t) => t.target === campaign.target) ?? null);

/**
 * Envois que la campagne représente, avant de la lancer.
 *
 * Un destinataire par canal coché : c'est ce nombre-là qui se facture quand le SMS en fait partie,
 * et non le nombre de familles.
 */
const plannedSends = computed(() =>
    (selectedTarget.value?.recipientCount ?? 0) * campaign.channels.length);

const smsPlanned = computed(() =>
    campaign.channels.includes('SMS') ? (selectedTarget.value?.recipientCount ?? 0) : 0);

function toggleChannel(channel: ReminderChannel) {
    campaign.channels = campaign.channels.includes(channel)
        ? campaign.channels.filter((c) => c !== channel)
        : [...campaign.channels, channel];
}

async function loadReminders() {
    try {
        const [counts, sent] = await Promise.all([targets(), campaigns()]);
        targetCounts.value = counts;
        history.value = sent;
    } catch {
        // Le décompte est un confort : son échec ne doit pas masquer la liste des impayés.
        targetCounts.value = [];
    }
}

async function launch() {
    sendError.value = '';
    sending.value = true;
    try {
        lastResult.value = await send({ ...campaign, channels: [...campaign.channels] });
        campaign.name = '';
        await loadReminders();
    } catch (e: any) {
        sendError.value = e?.data?.debugMessage ?? "La campagne n'a pas pu être lancée.";
    } finally {
        sending.value = false;
    }
}

onMounted(async () => {
    try {
        rows.value = (await installments({ status: 'PENDING', dueBefore: today, size: 200 })).content ?? [];
    } catch {
        error.value = "Les impayés n'ont pas pu être chargés.";
    } finally {
        loading.value = false;
    }
    await loadReminders();
});
</script>

<template>
    <div>
        <PageHead
            title="Relances"
            sub="Campagnes de relance et tranches encore dues"
        >
            <template #actions>
                <NuxtLink to="/app/paiements/guichet" class="btn-primary">
                    Encaisser au guichet
                </NuxtLink>
            </template>
        </PageHead>

        <PaymentsTabs />

        <p v-if="error" class="alert-danger mb-4" role="alert">{{ error }}</p>

        <UiCard
            v-if="canSend" class="mb-3.5" title="Nouvelle campagne"
            sub="Le décompte s'affiche avant l'envoi : un SMS se facture à la pièce"
        >
            <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                    <label class="field-label" for="campaign-name">Nom de la campagne</label>
                    <input
                        id="campaign-name" v-model="campaign.name" type="text"
                        placeholder="Relance scolarité février" class="input"
                    />
                </div>
                <div>
                    <label class="field-label" for="campaign-target">Cible</label>
                    <select id="campaign-target" v-model="campaign.target" class="select">
                        <option v-for="t in targetCounts" :key="t.target" :value="t.target">
                            {{ t.label }} — {{ t.familyCount }} famille(s)
                        </option>
                    </select>
                </div>
                <div>
                    <span class="field-label">Canaux</span>
                    <div class="flex gap-1.5 flex-wrap mt-1">
                        <button
                            v-for="channel in REMINDER_CHANNELS" :key="channel.value" type="button"
                            class="chip" :aria-pressed="campaign.channels.includes(channel.value)"
                            @click="toggleChannel(channel.value)"
                        >{{ channel.label }}</button>
                    </div>
                </div>
            </div>

            <label class="field-label mt-3.5" for="campaign-message">Message</label>
            <textarea
                id="campaign-message" v-model="campaign.messageTemplate" rows="3" maxlength="300"
                class="input" style="resize: vertical"
            />
            <p class="text-[11.5px] mt-1" style="color: var(--text-faint)">
                Variables remplacées par famille :
                <b v-for="v in TEMPLATE_VARIABLES" :key="v" class="nu mr-1.5">{{ v }}</b>
                · {{ campaign.messageTemplate.length }}/300 caractères
            </p>

            <!-- Le décompte est le garde-fou de l'écran : il dit ce qu'on s'apprête à dépenser
                 avant qu'on clique, et non après. -->
            <div
                class="card p-3.5 mt-3.5"
                :style="smsPlanned ? 'border-color: var(--warning-solid)' : ''"
            >
                <div class="text-[12.5px]" style="color: var(--text)">
                    <b class="nu" style="color: var(--navy)">{{ selectedTarget?.familyCount ?? 0 }}</b>
                    famille(s) ·
                    <b class="nu" style="color: var(--navy)">{{ selectedTarget?.recipientCount ?? 0 }}</b>
                    tuteur(s) joignable(s) ·
                    <b class="nu" style="color: var(--navy)">{{ plannedSends }}</b>
                    envoi(s)
                    <template v-if="selectedTarget">
                        · {{ Math.round(Number(selectedTarget.amountDue)).toLocaleString('fr-FR') }} F en jeu
                    </template>
                </div>
                <p v-if="smsPlanned" class="text-[12px] mt-1.5" style="color: var(--warning)">
                    Dont <b class="nu">{{ smsPlanned }}</b> SMS, facturés à l'envoi.
                </p>
                <p v-else class="text-[12px] mt-1.5" style="color: var(--text-faint)">
                    Notification seule : aucun coût d'envoi.
                </p>
            </div>

            <p v-if="sendError" class="alert-danger mt-3.5" role="alert">{{ sendError }}</p>
            <p v-if="lastResult" class="alert-success mt-3.5" role="status">
                « {{ lastResult.name }} » : {{ lastResult.sentCount }} envoi(s)<template
                    v-if="lastResult.skippedCount"
                >, {{ lastResult.skippedCount }} écarté(s) — déjà relancé(s) aujourd'hui</template>.
            </p>

            <div class="flex gap-2 mt-4">
                <button
                    class="btn-primary"
                    :disabled="sending || !campaign.name || !campaign.channels.length || !plannedSends"
                    @click="launch"
                >{{ sending ? 'Envoi…' : `Lancer la campagne (${plannedSends} envoi(s))` }}</button>
            </div>
        </UiCard>

        <UiCard v-if="history.length" class="mb-3.5" :pad="false" title="Campagnes lancées"
            sub="Une famille qui règle dans les sept jours est portée au crédit de la campagne">
            <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Campagne</th>
                            <th>Canal</th>
                            <th class="text-right">Envoyés</th>
                            <th class="text-right">Écartés</th>
                            <th class="text-right">Payés</th>
                            <th class="text-right">Recouvré</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="line in history" :key="line.id">
                            <td>
                                <b class="text-[12.5px]" style="color: var(--navy)">{{ line.name }}</b>
                                <div class="text-[11px]" style="color: var(--text-faint)">
                                    {{ line.targetLabel }} ·
                                    {{ new Date(line.sentAt).toLocaleDateString('fr-FR') }}
                                </div>
                            </td>
                            <td>
                                <span v-for="c in line.channels" :key="c" class="tag mr-1">
                                    {{ reminderChannelLabel(c) }}
                                </span>
                            </td>
                            <td class="num">{{ line.sentCount }}</td>
                            <td class="num" style="color: var(--text-faint)">
                                {{ line.skippedCount || '—' }}
                            </td>
                            <td class="num">{{ line.paidCount }}</td>
                            <td class="num">
                                {{ Math.round(Number(line.recoveredAmount ?? 0)).toLocaleString('fr-FR') }} F
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </UiCard>


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
