<script setup lang="ts">
import { formatAmount, formatDate, channelLabel, type Installment, type Receipt } from '~/composables/useBilling';
import { genderLabel, levelLabel, type Student, type Guardian } from '~/composables/useStudents';

/**
 * Fiche élève.
 *
 * Elle répond à la question qu'on se pose au comptoir devant un parent : où en est-il ? D'où
 * l'ordre — ce qui reste dû d'abord, l'échéancier ensuite, les reçus déjà émis en dernier.
 */
const props = defineProps<{ student: Student }>();
defineEmits<{ close: [] }>();

const { installments, receipts } = useBilling();
const { update: updateStudent } = useStudents();
const { can } = usePermissions();

/**
 * Le sexe, renseigné depuis la fiche.
 *
 * <p>Tenu localement plutôt que par la propriété : la liste qui a ouvert ce tiroir ne se recharge
 * pas à chaque enregistrement, et lire la propriété afficherait la valeur d'avant jusqu'à la
 * fermeture — l'école croirait que rien n'a été pris.
 */
const canWrite = computed(() => can('student:write'));
const gender = ref(props.student.gender ?? '');
const savingGender = ref(false);
const genderError = ref('');

watch(() => props.student.id, () => {
    gender.value = props.student.gender ?? '';
    genderError.value = '';
});

async function saveGender(value: string) {
    const previous = gender.value;
    gender.value = value;
    savingGender.value = true;
    genderError.value = '';
    try {
        await updateStudent(props.student.id, { gender: (value || null) as any });
    } catch (e: any) {
        gender.value = previous;
        genderError.value = e?.data?.debugMessage ?? "Le sexe n'a pas pu être enregistré.";
    } finally {
        savingGender.value = false;
    }
}

const dues = ref<Installment[]>([]);
const paid = ref<Receipt[]>([]);
const loading = ref(true);

const outstanding = computed(() => dues.value
    .filter((i) => i.status === 'PENDING')
    .reduce((sum, i) => sum + Number(i.amount ?? 0), 0));

// Échéancier regroupé par frais : on lit « scolarité : 3 tranches, cantine : 2 » au lieu d'une
// liste plate où les tranches de plusieurs frais s'entremêlent sans qu'on sache à quoi elles tiennent.
const duesByFee = computed(() => {
    const groups = new Map<string, { fee: string; items: Installment[]; remaining: number }>();
    for (const d of dues.value) {
        const fee = d.studentFee?.fee?.name ?? 'Autres frais';
        let g = groups.get(fee);
        if (!g) {
            g = { fee, items: [], remaining: 0 };
            groups.set(fee, g);
        }
        g.items.push(d);
        if (d.status === 'PENDING') g.remaining += Number(d.amount ?? 0);
    }
    return [...groups.values()];
});

const collected = computed(() => paid.value.reduce((sum, r) => sum + Number(r.amount ?? 0), 0));

const today = new Date().toISOString().slice(0, 10);

function isLate(installment: Installment) {
    return installment.status === 'PENDING'
        && Boolean(installment.dueDate) && installment.dueDate! < today;
}

/** Nom affichable d'un tuteur : prénom + nom, à défaut l'identifiant de connexion. */
function guardianName(g: Guardian): string {
    const full = `${g.firstName ?? ''} ${g.lastName ?? ''}`.trim();
    return full || g.username || '—';
}

/** Coordonnées lisibles : téléphone principal d'abord, puis e-mail, à défaut l'identifiant. */
function guardianContact(g: Guardian): string {
    const contacts = g.contacts ?? [];
    const phone = contacts.find((c) => c.type === 'PHONE' && c.isPrimary)
        ?? contacts.find((c) => c.type === 'PHONE');
    const email = contacts.find((c) => c.type === 'EMAIL' && c.isPrimary)
        ?? contacts.find((c) => c.type === 'EMAIL');
    const parts = [phone?.value, email?.value].filter(Boolean);
    return parts.length ? parts.join(' · ') : (g.username ?? '—');
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
            <dt>Classe</dt>
            <dd>
                {{ student.schoolClass?.name ?? 'Sans classe' }}
                <span v-if="student.schoolClass?.room" style="color: var(--text-faint)">
                    · salle {{ student.schoolClass.room }}
                </span>
            </dd>
            <dt>Naissance</dt><dd class="nu">{{ formatDate(student.birthDay) }}</dd>
            <dt>Lieu</dt><dd>{{ student.placeOfBirth || '—' }}</dd>
            <!-- Modifiable sur place : les élèves inscrits avant que le sexe ne soit demandé
                 doivent pouvoir être complétés sans être recréés. -->
            <dt>Sexe</dt>
            <dd>
                <template v-if="canWrite">
                    <select
                        :value="gender" :disabled="savingGender" class="select"
                        style="height: 30px; max-width: 190px"
                        @change="saveGender(($event.target as HTMLSelectElement).value)"
                    >
                        <option value="">Non renseigné</option>
                        <option value="FEMALE">Fille</option>
                        <option value="MALE">Garçon</option>
                    </select>
                    <span v-if="genderError" class="block text-[12px]" style="color: var(--danger)">
                        {{ genderError }}
                    </span>
                </template>
                <span v-else>{{ genderLabel(student.gender) }}</span>
            </dd>
        </dl>

        <p class="sec">Parents / Tuteurs</p>
        <div
            v-if="student.parentUsers?.length"
            class="rounded-xl overflow-hidden mb-5" style="border: 1px solid var(--border)"
        >
            <div
                v-for="parent in student.parentUsers" :key="parent.id"
                class="flex items-center gap-3 px-3 py-2.5"
                style="border-bottom: 1px solid var(--border)"
            >
                <AvatarBadge :name="guardianName(parent)" :size="28" />
                <div class="flex-1 min-w-0">
                    <b class="block text-[12.5px]" style="color: var(--navy)">
                        {{ guardianName(parent) }}
                    </b>
                    <div class="nu text-[11px]" style="color: var(--text-faint)">
                        {{ guardianContact(parent) }}
                    </div>
                </div>
            </div>
        </div>
        <p v-else class="text-[12.5px] mb-5" style="color: var(--text-faint)">
            Aucun parent rattaché à cet élève pour le moment.
        </p>

        <p class="sec">Échéancier</p>
        <div v-if="loading" class="flex flex-col gap-2.5 mb-5">
            <i v-for="n in 4" :key="n" class="sk h-6" />
        </div>
        <div v-else-if="duesByFee.length" class="flex flex-col gap-3 mb-5">
            <div
                v-for="group in duesByFee" :key="group.fee"
                class="rounded-xl overflow-hidden" style="border: 1px solid var(--border)"
            >
                <div
                    class="flex items-center gap-2 px-3 py-2"
                    style="border-bottom: 1px solid var(--border); background: rgba(0, 0, 0, .025)"
                >
                    <b class="flex-1 min-w-0 text-[12.5px]" style="color: var(--navy)">{{ group.fee }}</b>
                    <span class="nu text-[11.5px]" style="color: var(--text-faint)">
                        <template v-if="group.remaining > 0">{{ formatAmount(group.remaining) }} à régler</template>
                        <template v-else>Soldé</template>
                    </span>
                </div>
                <div
                    v-for="installment in group.items" :key="installment.id"
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
                ><BoIcon name="download" :size="15" />PDF</a>
            </div>
        </div>
        <p v-else-if="!loading" class="text-[12.5px]" style="color: var(--text-faint)">
            Aucun règlement enregistré pour cet élève.
        </p>

        <template #footer>
            <NuxtLink to="/app/paiements/guichet" class="btn-primary flex-1">
                <BoIcon name="cash" :size="16" />
                Encaisser au guichet
            </NuxtLink>
            <NuxtLink :to="`/app/paiements/recus?q=${student.registrationNumber}`" class="btn-secondary">
                Ses reçus
            </NuxtLink>
        </template>
    </SideDrawer>
</template>
