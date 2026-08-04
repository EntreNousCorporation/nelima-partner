<script setup lang="ts">
import {
    CHANNELS, channelLabel, formatAmount, formatDate, formatTime, studentOf,
    type Installment, type Receipt,
} from '~/composables/useBilling';

const { installments, collectOffline, receipts } = useBilling();

const pending = ref<Installment[]>([]);
const loading = ref(true);
const error = ref('');

/* ---- Formulaire du guichet ---- */
const query = ref('');
const selectedStudent = ref<{ name: string; matricule: string } | null>(null);
const selectedInstallment = ref<Installment | null>(null);
const channel = ref('CASH');
const reference = ref('');
const payerName = ref('');
const payerEmail = ref('');
const submitting = ref(false);
const formError = ref('');
const issued = ref<Receipt | null>(null);

/**
 * Élèves ayant au moins une tranche due, dédoublonnés.
 *
 * La liste part des tranches et non des élèves : au guichet, on n'encaisse jamais un élève, on
 * encaisse une échéance. Proposer un élève sans rien à régler mènerait à une impasse.
 */
const matches = computed(() => {
    const q = query.value.trim().toLowerCase();
    if (q.length < 2) return [];
    const byMatricule = new Map<string, { name: string; matricule: string; due: number; count: number }>();
    for (const installment of pending.value) {
        const student = studentOf(installment);
        if (!student.name.toLowerCase().includes(q) && !student.matricule.toLowerCase().includes(q)) {
            continue;
        }
        const entry = byMatricule.get(student.matricule)
            ?? { ...student, due: 0, count: 0 };
        entry.due += Number(installment.amount ?? 0);
        entry.count += 1;
        byMatricule.set(student.matricule, entry);
    }
    return [...byMatricule.values()].slice(0, 4);
});

/** Tranches dues de l'élève retenu, de la plus ancienne à la plus récente. */
const dueOfStudent = computed(() => {
    if (!selectedStudent.value) return [];
    return pending.value
        .filter((i) => studentOf(i).matricule === selectedStudent.value?.matricule)
        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
});

function pickStudent(student: { name: string; matricule: string }) {
    selectedStudent.value = { name: student.name, matricule: student.matricule };
    query.value = student.name;
    // Une seule tranche due : la choisir d'office évite un clic qui n'apporte rien.
    selectedInstallment.value = dueOfStudent.value.length === 1 ? dueOfStudent.value[0] : null;
}

function reset() {
    query.value = '';
    selectedStudent.value = null;
    selectedInstallment.value = null;
    reference.value = '';
    payerName.value = '';
    payerEmail.value = '';
    formError.value = '';
    issued.value = null;
}

async function submit() {
    if (!selectedInstallment.value) return;
    formError.value = '';
    submitting.value = true;
    try {
        issued.value = await collectOffline({
            installmentId: selectedInstallment.value.id,
            channel: channel.value,
            reference: reference.value || undefined,
            payerName: payerName.value || undefined,
            payerEmail: payerEmail.value || undefined,
        });
        await load();
    } catch (e: any) {
        formError.value = e?.data?.debugMessage
            ?? "L'encaissement n'a pas pu être enregistré.";
    } finally {
        submitting.value = false;
    }
}

/* ---- Caisse du jour ---- */
const dayReceipts = ref<Receipt[]>([]);

const midnight = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
};

const dayTotal = computed(() =>
    dayReceipts.value.reduce((sum, r) => sum + Number(r.amount ?? 0), 0));

function totalFor(channels: string[]) {
    return dayReceipts.value
        .filter((r) => channels.includes(r.channel ?? ''))
        .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
}

const todayLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

async function load() {
    loading.value = true;
    error.value = '';
    try {
        const start = midnight();
        const end = new Date(start.getTime() + 86_400_000);
        const [due, issuedToday] = await Promise.all([
            installments({ status: 'PENDING', size: 200 }),
            receipts({
                issuedFrom: start.toISOString(), issuedTo: end.toISOString(), size: 200,
            }),
        ]);
        pending.value = due.content ?? [];
        dayReceipts.value = issuedToday.content ?? [];
    } catch {
        error.value = "Les données du guichet n'ont pas pu être chargées.";
    } finally {
        loading.value = false;
    }
}

onMounted(load);
</script>

<template>
    <div>
        <PageHead title="Encaissement" :sub="`Guichet · ${todayLabel}`">
            <template #actions>
                <NuxtLink to="/app/recus" class="btn-secondary">Tous les reçus</NuxtLink>
            </template>
        </PageHead>

        <p v-if="error" class="alert-danger mb-4" role="alert">{{ error }}</p>

        <div class="grid-12">
            <UiCard
                class="col-span-5" style="grid-column: span 5"
                title="Encaissement au guichet"
                sub="Règlement reçu en espèces, par chèque ou par virement"
            >
                <div v-if="issued" class="text-center py-4">
                    <div
                        class="w-14 h-14 rounded-full grid place-items-center mx-auto mb-3.5"
                        style="background: var(--success-soft); color: var(--success)"
                    >
                        <svg
                            class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
                        >
                            <path d="M20 6L9 17l-5-5" />
                        </svg>
                    </div>
                    <h4 class="text-[17px] font-black" style="color: var(--navy)">
                        Encaissement enregistré
                    </h4>
                    <p class="text-[13px] mt-2 mx-auto max-w-xs" style="color: var(--text-muted)">
                        Reçu <b class="nu">{{ issued.number }}</b> émis pour
                        {{ formatAmount(issued.amount) }} et envoyé au tuteur de l'élève.
                    </p>
                    <div class="flex gap-2 justify-center mt-4">
                        <a
                            :href="`/api/v1/receipts/${issued.id}/pdf`"
                            :download="`recu-${issued.number}.pdf`"
                            class="btn-primary"
                        >Télécharger le reçu</a>
                        <button class="btn-secondary" @click="reset">Nouvel encaissement</button>
                    </div>
                </div>

                <div v-else class="flex flex-col gap-4">
                    <div class="relative">
                        <label class="field-label" for="student">Élève</label>
                        <input
                            id="student" v-model="query" type="search" class="input"
                            placeholder="Nom ou matricule"
                            @input="selectedStudent = null; selectedInstallment = null"
                        />

                        <div
                            v-if="matches.length && !selectedStudent"
                            class="mt-1.5 rounded-lg overflow-hidden"
                            style="border: 1px solid var(--border)"
                        >
                            <button
                                v-for="student in matches" :key="student.matricule"
                                class="flex items-center gap-2.5 px-3 py-2 w-full text-left"
                                style="border-bottom: 1px solid var(--border)"
                                @click="pickStudent(student)"
                            >
                                <AvatarBadge :name="student.name" :size="26" />
                                <div class="nm flex-1 min-w-0">
                                    <b>{{ student.name }}</b>
                                    <span class="nu">
                                        {{ student.matricule }} ·
                                        {{ student.count }} tranche{{ student.count > 1 ? 's' : '' }}
                                    </span>
                                </div>
                                <UiPill tone="late">{{ formatAmount(student.due) }}</UiPill>
                            </button>
                        </div>

                        <p
                            v-else-if="query.trim().length >= 2 && !selectedStudent && !loading"
                            class="text-[12px] mt-1.5" style="color: var(--text-faint)"
                        >
                            Aucun élève avec une tranche due ne correspond. Un élève à jour
                            n'apparaît pas ici.
                        </p>
                    </div>

                    <div v-if="selectedStudent">
                        <label class="field-label">Tranche à régler</label>
                        <!-- Le montant n'est pas saisi : il est celui de la tranche. Un règlement
                             partiel n'est pas encore prévu, et laisser taper un montant libre
                             donnerait un reçu qui ne correspondrait à aucune échéance. -->
                        <div class="rounded-lg overflow-hidden" style="border: 1px solid var(--border)">
                            <label
                                v-for="installment in dueOfStudent" :key="installment.id"
                                class="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer"
                                style="border-bottom: 1px solid var(--border)"
                                :style="selectedInstallment?.id === installment.id
                                    ? 'background: var(--brand-50)' : ''"
                            >
                                <input
                                    v-model="selectedInstallment" type="radio" :value="installment"
                                    name="installment"
                                />
                                <div class="nm flex-1 min-w-0">
                                    <b>{{ installment.label ?? 'Tranche' }}</b>
                                    <span class="nu">Échéance {{ formatDate(installment.dueDate) }}</span>
                                </div>
                                <b class="nu text-[12.5px]" style="color: var(--navy)">
                                    {{ formatAmount(installment.amount) }}
                                </b>
                            </label>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="field-label" for="channel">Mode</label>
                            <select id="channel" v-model="channel" class="select">
                                <option v-for="c in CHANNELS" :key="c.value" :value="c.value">
                                    {{ c.label }}
                                </option>
                            </select>
                        </div>
                        <div>
                            <label class="field-label" for="reference">
                                {{ channel === 'CHECK' ? 'N° de chèque' : 'Référence interne' }}
                            </label>
                            <input
                                id="reference" v-model="reference" type="text" class="input"
                                :placeholder="channel === 'CHECK' ? '004513' : 'Facultatif'"
                            />
                        </div>
                    </div>

                    <div>
                        <p class="field-label mb-1">Personne qui règle</p>
                        <!-- Le reçu part toujours au tuteur enregistré ; ces champs servent au cas
                             où quelqu'un d'autre se présente au comptoir. -->
                        <p class="text-[12px] mb-2.5" style="color: var(--text-faint)">
                            Le reçu part au tuteur de l'élève. Renseignez ces champs si un tiers
                            règle : le reçu portera son nom et lui sera également envoyé.
                        </p>
                        <div class="grid grid-cols-2 gap-3">
                            <input
                                v-model="payerName" type="text" class="input" placeholder="Nom"
                                aria-label="Nom du payeur"
                            />
                            <input
                                v-model="payerEmail" type="email" class="input" placeholder="Email"
                                aria-label="Email du payeur"
                            />
                        </div>
                    </div>

                    <div
                        class="rounded-xl p-3.5"
                        style="background: var(--surface-sunken); border: 1px solid var(--border)"
                    >
                        <dl class="kv">
                            <dt>Montant</dt>
                            <dd class="nu">
                                {{ selectedInstallment ? formatAmount(selectedInstallment.amount) : '—' }}
                            </dd>
                            <dt>Commission</dt>
                            <dd>Aucune au guichet</dd>
                            <dt>Mode</dt>
                            <dd>{{ channelLabel(channel) }}</dd>
                        </dl>
                    </div>

                    <p v-if="formError" class="alert-danger" role="alert">{{ formError }}</p>

                    <div class="flex gap-2">
                        <button
                            class="btn-primary flex-1" :disabled="!selectedInstallment || submitting"
                            @click="submit"
                        >
                            {{ submitting ? 'Enregistrement…' : "Valider l'encaissement" }}
                        </button>
                        <button class="btn-secondary" @click="reset">Annuler</button>
                    </div>
                </div>
            </UiCard>

            <UiCard
                style="grid-column: span 7" :pad="false"
                title="Caisse du jour" :sub="todayLabel"
            >
                <template #action>
                    <NuxtLink to="/app/recus" class="btn-secondary btn-sm">Historique</NuxtLink>
                </template>

                <div class="flex flex-wrap" style="border-bottom: 1px solid var(--border)">
                    <div
                        v-for="(cell, index) in [
                            { label: 'Total encaissé', value: formatAmount(dayTotal) },
                            { label: 'Opérations', value: String(dayReceipts.length) },
                            { label: 'Espèces et chèques', value: formatAmount(totalFor(['CASH', 'CHECK', 'BANK_TRANSFER'])) },
                            { label: 'En ligne', value: formatAmount(totalFor(['ONLINE'])) },
                        ]" :key="cell.label"
                        class="flex-1 px-4 py-3 min-w-[140px]"
                        :style="index < 3 ? 'border-right: 1px solid var(--border)' : ''"
                    >
                        <div class="kpi-label">{{ cell.label }}</div>
                        <div
                            class="nu font-black text-[17px] mt-1.5 tabular-nums"
                            style="color: var(--navy); letter-spacing: -.4px"
                        >{{ cell.value }}</div>
                    </div>
                </div>

                <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Heure</th>
                                <th>Élève</th>
                                <th>Payeur</th>
                                <th>Mode</th>
                                <th class="text-right">Montant</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="loading">
                                <td colspan="6" class="py-8 text-center" style="color: var(--text-faint)">
                                    Chargement…
                                </td>
                            </tr>
                            <tr v-for="row in dayReceipts" v-else :key="row.id">
                                <td class="nu text-[12.5px] font-semibold" style="color: var(--text-muted)">
                                    {{ formatTime(row.issuedAt) }}
                                </td>
                                <td>
                                    <div class="nm min-w-0">
                                        <b>{{ row.studentLabel ?? '—' }}</b>
                                        <span class="nu">{{ row.studentRegistrationNumber ?? '—' }}</span>
                                    </div>
                                </td>
                                <td class="text-[12.5px]" style="color: var(--text-muted)">
                                    {{ row.payerLabel || '—' }}
                                </td>
                                <td><span class="tag">{{ channelLabel(row.channel) }}</span></td>
                                <td class="num" style="color: var(--navy)">
                                    {{ formatAmount(row.amount) }}
                                </td>
                                <td class="text-right">
                                    <a
                                        :href="`/api/v1/receipts/${row.id}/pdf`"
                                        :download="`recu-${row.number}.pdf`"
                                        class="btn-secondary btn-sm"
                                    >Reçu</a>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <EmptyState
                    v-if="!loading && !dayReceipts.length"
                    title="Aucun encaissement aujourd'hui"
                    text="Les règlements saisis au guichet et les paiements réglés par les parents depuis l'application apparaîtront ici au fil de la journée."
                />
            </UiCard>
        </div>
    </div>
</template>
