<script setup lang="ts">
import { formatAmount, formatDate, channelLabel, type Installment, type Receipt } from '~/composables/useBilling';
import { genderLabel, levelLabel, type Gender, type LevelOfStudy, type Student, type Guardian } from '~/composables/useStudents';
import { useAuthStore } from '~/stores/auth';

/**
 * Fiche élève.
 *
 * Elle répond à la question qu'on se pose au comptoir devant un parent : où en est-il ? D'où
 * l'ordre — ce qui reste dû d'abord, l'échéancier ensuite, les reçus déjà émis en dernier.
 */
const props = defineProps<{ student: Student }>();
const emit = defineEmits<{ close: []; updated: [] }>();

const { installments, receipts } = useBilling();
const { update: updateStudent, establishmentLevels } = useStudents();
const { can } = usePermissions();
const auth = useAuthStore();

/**
 * Modification de l'état civil.
 *
 * <p>Le sexe se réglait par une liste déroulante posée au milieu de lignes en lecture seule : le
 * testeur ne l'a pas trouvée, et il avait raison — rien ne disait que cette fiche était modifiable.
 * Un bouton « Modifier » ouvre maintenant l'ensemble des champs, ce qui répond aussi à la demande
 * plus large : corriger un prénom mal orthographié, un matricule, un niveau.
 *
 * <p>Les valeurs modifiées sont tenues localement après enregistrement : la liste qui a ouvert ce
 * tiroir ne se recharge pas d'elle-même, et lire la propriété afficherait la valeur d'avant.
 */
const canWrite = computed(() => can('student:write'));
const editing = ref(false);
const saving = ref(false);
const editError = ref('');
const levelOptions = ref<LevelOfStudy[]>([]);

/** Ce que la fiche affiche : la propriété, ou ce qu'on vient d'enregistrer par-dessus. */
const shown = ref<Student>({ ...props.student });

const form = reactive({
    firstName: '', lastName: '', registrationNumber: '',
    birthDay: '', placeOfBirth: '', levelOfStudyCode: '', gender: '' as Gender | '',
});

watch(() => props.student.id, () => {
    shown.value = { ...props.student };
    editing.value = false;
    editError.value = '';
});

function openEdit() {
    Object.assign(form, {
        firstName: shown.value.firstName ?? '',
        lastName: shown.value.lastName ?? '',
        registrationNumber: shown.value.registrationNumber ?? '',
        birthDay: (shown.value.birthDay ?? '').slice(0, 10),
        placeOfBirth: shown.value.placeOfBirth ?? '',
        levelOfStudyCode: shown.value.levelOfStudy?.code ?? '',
        gender: shown.value.gender ?? '',
    });
    editError.value = '';
    editing.value = true;
}

async function save() {
    saving.value = true;
    editError.value = '';
    try {
        const updated = await updateStudent(shown.value.id, {
            firstName: form.firstName,
            lastName: form.lastName,
            registrationNumber: form.registrationNumber,
            birthDay: form.birthDay || undefined,
            placeOfBirth: form.placeOfBirth || undefined,
            levelOfStudyCode: form.levelOfStudyCode || undefined,
            // Vide vaut « non renseigné » : on n'envoie pas une chaîne que le serveur refuserait.
            gender: (form.gender || undefined) as Gender | undefined,
        });
        // La réponse du serveur fait foi — le matricule qu'il rend est celui qu'il a retenu.
        shown.value = { ...shown.value, ...updated };
        editing.value = false;
        // La liste derrière doit suivre : sans cela, elle porterait encore l'ancien nom.
        emit('updated');
    } catch (e: any) {
        editError.value = e?.data?.debugMessage
            ?? (e?.response?.status === 409
                ? 'Un élève porte déjà ce matricule dans votre établissement.'
                : "La fiche n'a pas pu être enregistrée.");
    } finally {
        saving.value = false;
    }
}

onMounted(async () => {
    if (!canWrite.value) return;
    try {
        levelOptions.value = await establishmentLevels(auth.user?.establishmentId);
    } catch {
        levelOptions.value = [];
    }
});

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
        :title="`${shown.lastName} ${shown.firstName}`"
        :sub="`${shown.registrationNumber} · ${levelLabel(shown.levelOfStudy)}`"
        @close="$emit('close')"
    >
        <template #avatar>
            <AvatarBadge :name="`${shown.firstName} ${shown.lastName}`" :size="42" />
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

        <div class="flex items-center justify-between">
            <p class="sec">État civil</p>
            <button
                v-if="canWrite && !editing" class="btn-ghost btn-sm mb-2"
                @click="openEdit"
            >Modifier</button>
        </div>

        <!-- En lecture : la fiche telle qu'elle est. -->
        <dl v-if="!editing" class="kv mb-5">
            <dt>Matricule</dt><dd class="nu">{{ shown.registrationNumber }}</dd>
            <dt>Niveau</dt><dd>{{ levelLabel(shown.levelOfStudy) }}</dd>
            <dt>Classe</dt>
            <dd>
                {{ shown.schoolClass?.name ?? 'Sans classe' }}
                <span v-if="shown.schoolClass?.room" style="color: var(--text-faint)">
                    · salle {{ shown.schoolClass.room }}
                </span>
            </dd>
            <dt>Naissance</dt><dd class="nu">{{ formatDate(shown.birthDay) }}</dd>
            <dt>Lieu</dt><dd>{{ shown.placeOfBirth || '—' }}</dd>
            <dt>Sexe</dt><dd>{{ genderLabel(shown.gender) }}</dd>
        </dl>

        <!-- En modification : les mêmes champs, saisissables.
             La classe n'y figure pas — elle se change depuis la liste des élèves, où l'on peut en
             affecter plusieurs d'un coup, et deux chemins pour le même acte finiraient par
             diverger. -->
        <form v-else class="mb-5" @submit.prevent="save">
            <div class="grid gap-3 sm:grid-cols-2">
                <div>
                    <label class="field-label" for="editFirstName">Prénom</label>
                    <input id="editFirstName" v-model="form.firstName" type="text" required class="input" />
                </div>
                <div>
                    <label class="field-label" for="editLastName">Nom</label>
                    <input id="editLastName" v-model="form.lastName" type="text" required class="input" />
                </div>
                <div>
                    <label class="field-label" for="editRegistration">Matricule</label>
                    <input id="editRegistration" v-model="form.registrationNumber" type="text" required class="input" />
                </div>
                <div>
                    <label class="field-label" for="editBirthDay">Date de naissance</label>
                    <NelimaDateField id="editBirthDay" v-model="form.birthDay" required />
                </div>
                <div>
                    <label class="field-label" for="editPlace">Lieu de naissance</label>
                    <input id="editPlace" v-model="form.placeOfBirth" type="text" class="input" />
                </div>
                <div>
                    <label class="field-label" for="editLevel">Niveau</label>
                    <select id="editLevel" v-model="form.levelOfStudyCode" required class="select">
                        <option v-for="level in levelOptions" :key="level.id" :value="level.code">
                            {{ levelLabel(level) }}
                        </option>
                    </select>
                </div>
                <div>
                    <label class="field-label" for="editGender">Sexe</label>
                    <select id="editGender" v-model="form.gender" class="select">
                        <option value="">Non renseigné</option>
                        <option value="FEMALE">Fille</option>
                        <option value="MALE">Garçon</option>
                    </select>
                </div>
            </div>

            <p v-if="editError" class="alert-danger mt-3" role="alert">{{ editError }}</p>

            <div class="flex gap-2 mt-3.5">
                <button type="submit" class="btn-primary btn-sm" :disabled="saving">
                    {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
                </button>
                <button type="button" class="btn-ghost btn-sm" @click="editing = false">Annuler</button>
            </div>
        </form>

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
