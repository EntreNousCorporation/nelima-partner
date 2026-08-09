<script setup lang="ts">
import {
    attendanceLabel, contractLabel, fullName, seniorityYears, staffRoleLabel, type StaffMember,
} from '~/composables/useStaff';
import type { SchoolClass } from '~/composables/useClasses';

/**
 * Fiche d'un membre du personnel : ce qu'on sait de lui, et les classes où il intervient.
 *
 * Le rattachement se fait ici et non depuis la classe : c'est en regardant une personne qu'on se
 * demande où elle enseigne, l'inverse est bien plus rare.
 */
const props = defineProps<{ member: StaffMember; classes: SchoolClass[] }>();
const emit = defineEmits<{ close: []; changed: [] }>();

const { assignClasses, unassignClass } = useStaff();
const { can } = usePermissions();

const working = ref(false);
const error = ref('');
const picked = ref('');

const canWrite = computed(() => can('staff:write'));
const canReadSalary = computed(() => can('staff:read_salary'));

const seniority = computed(() => seniorityYears(props.member));

/** Classes où le membre n'intervient pas encore : les autres n'ont rien à faire dans la liste. */
const available = computed(() => props.classes
    .filter((schoolClass) => !props.member.classes.some((c) => c.id === schoolClass.id)));

async function add() {
    if (!picked.value) return;
    error.value = '';
    working.value = true;
    try {
        await assignClasses(props.member.id, [picked.value]);
        picked.value = '';
        emit('changed');
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "Le rattachement n'a pas pu être enregistré.";
    } finally {
        working.value = false;
    }
}

async function detach(classId: string) {
    error.value = '';
    working.value = true;
    try {
        await unassignClass(props.member.id, classId);
        emit('changed');
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "Le rattachement n'a pas pu être retiré.";
    } finally {
        working.value = false;
    }
}
</script>

<template>
    <SideDrawer
        :title="fullName(member)"
        :sub="[member.jobTitle ?? staffRoleLabel(member.role),
               member.active ? null : 'fiche désactivée'].filter(Boolean).join(' · ')"
        @close="emit('close')"
    >
        <template #avatar>
            <AvatarBadge :name="fullName(member)" :size="44" />
        </template>

        <div class="grid grid-cols-2 gap-3 mb-5">
            <div class="card p-3.5">
                <div class="kpi-label">Aujourd'hui</div>
                <div class="kpi-value text-[22px]">{{ attendanceLabel(member.todayStatus) }}</div>
            </div>
            <div class="card p-3.5">
                <div class="kpi-label">Ancienneté</div>
                <div class="kpi-value text-[22px]">
                    <template v-if="seniority !== null">{{ seniority }}<small>ans</small></template>
                    <template v-else>—</template>
                </div>
                <p class="text-[11.5px] mt-2" style="color: var(--text-faint)">
                    {{ member.hiredAt ? `depuis le ${member.hiredAt}` : 'date d’embauche non renseignée' }}
                </p>
            </div>
        </div>

        <p class="sec">Fiche</p>
        <dl class="rounded-xl overflow-hidden mb-5" style="border: 1px solid var(--border)">
            <div class="flex px-3 py-2" style="border-bottom: 1px solid var(--border)">
                <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">Fonction</dt>
                <dd class="text-[12.5px] font-semibold">{{ staffRoleLabel(member.role) }}</dd>
            </div>
            <div class="flex px-3 py-2" style="border-bottom: 1px solid var(--border)">
                <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">Contrat</dt>
                <dd class="text-[12.5px] font-semibold">{{ contractLabel(member.contractType) }}</dd>
            </div>
            <div class="flex px-3 py-2" style="border-bottom: 1px solid var(--border)">
                <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">Téléphone</dt>
                <dd class="text-[12.5px] font-semibold nu">{{ member.phone ?? '—' }}</dd>
            </div>
            <div class="flex px-3 py-2" :style="canReadSalary ? 'border-bottom: 1px solid var(--border)' : ''">
                <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">E-mail</dt>
                <dd class="text-[12.5px] font-semibold">{{ member.email ?? '—' }}</dd>
            </div>
            <template v-if="canReadSalary">
                <div class="flex px-3 py-2" style="border-bottom: 1px solid var(--border)">
                    <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">Heures / semaine</dt>
                    <dd class="text-[12.5px] font-semibold nu">{{ member.weeklyHours ?? '—' }}</dd>
                </div>
                <div class="flex px-3 py-2">
                    <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">Brut mensuel</dt>
                    <dd class="text-[12.5px] font-semibold nu">
                        {{ member.monthlySalary
                            ? `${fm(Number(member.monthlySalary))} FCFA`
                            : '—' }}
                    </dd>
                </div>
            </template>
        </dl>

        <p v-if="error" class="alert-danger mb-4" role="alert">{{ error }}</p>

        <p class="sec">Classes où il intervient</p>
        <div
            v-if="member.classes.length" class="rounded-xl overflow-hidden mb-3"
            style="border: 1px solid var(--border)"
        >
            <div
                v-for="schoolClass in member.classes" :key="schoolClass.id"
                class="flex items-center gap-2.5 px-3 py-2"
                style="border-bottom: 1px solid var(--border)"
            >
                <b class="flex-1 text-[13px] font-extrabold" style="color: var(--navy)">
                    {{ schoolClass.name }}
                </b>
                <span
                    v-if="schoolClass.room" class="nu text-[12px]"
                    style="color: var(--text-faint)"
                >salle {{ schoolClass.room }}</span>
                <button
                    v-if="canWrite" class="btn-ghost btn-sm" :disabled="working"
                    @click="detach(schoolClass.id)"
                >Retirer</button>
            </div>
        </div>
        <p v-else class="text-[12.5px] mb-3" style="color: var(--text-faint)">
            Aucune classe rattachée.
        </p>

        <div v-if="canWrite && available.length" class="flex gap-2">
            <select v-model="picked" class="select flex-1" aria-label="Classe à rattacher">
                <option value="">Rattacher à une classe…</option>
                <option v-for="schoolClass in available" :key="schoolClass.id" :value="schoolClass.id">
                    {{ schoolClass.name }}
                </option>
            </select>
            <button class="btn-secondary" :disabled="!picked || working" @click="add">
                Rattacher
            </button>
        </div>
    </SideDrawer>
</template>
