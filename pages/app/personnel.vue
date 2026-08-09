<script setup lang="ts">
import {
    ATTENDANCE_STATUSES, CONTRACT_TYPES, PORTAL_ROLES, STAFF_ROLES, attendanceLabel, contractLabel,
    fullName, portalRoleLabel, seniorityYears, staffRoleLabel,
    type AttendanceLine, type AttendanceStatus, type AttendanceSummary, type ContractType,
    type PayrollSummary, type PortalRole, type StaffMember, type StaffRole,
} from '~/composables/useStaff';
import type { SchoolClass } from '~/composables/useClasses';

/**
 * Répertoire du personnel.
 *
 * Deux onglets ici : l'annuaire, et les affectations vues depuis la classe. Les présences, les
 * contrats et les accès viennent ensuite, et la barre d'onglets est faite pour les accueillir.
 */
const {
    list, create, update, remove,
    attendanceSheet, recordAttendance, attendanceSummary, payrollSummary,
    grantAccess, revokeAccess,
} = useStaff();
const { list: listClasses } = useClasses();
const { can } = usePermissions();

const rows = ref<StaffMember[]>([]);
const classes = ref<SchoolClass[]>([]);
const loading = ref(true);
const error = ref('');

const tab = ref<'directory' | 'assignments' | 'attendance' | 'contracts' | 'access'>('directory');
const keyword = ref('');
const selectedRole = ref<StaffRole | ''>('');
const includeInactive = ref(false);

const opened = ref<StaffMember | null>(null);

const showForm = ref(false);
const editing = ref<StaffMember | null>(null);
const saving = ref(false);
const formError = ref('');
const form = reactive({
    firstName: '',
    lastName: '',
    role: 'TEACHER' as StaffRole,
    jobTitle: '',
    phone: '',
    email: '',
    contractType: '' as ContractType | '',
    monthlySalary: '' as string | number,
    weeklyHours: '' as string | number,
    hiredAt: '',
});

const canWrite = computed(() => can('staff:write'));
const canReadSalary = computed(() => can('staff:read_salary'));
const canPoint = computed(() => can('attendance:write'));

/* ---- Présences ---- */
/** Journée pointée. Aujourd'hui par défaut : c'est la feuille du matin qu'on vient chercher. */
const day = ref(new Date().toISOString().slice(0, 10));
const sheet = ref<AttendanceLine[]>([]);
const summary = ref<AttendanceSummary | null>(null);
const sheetLoading = ref(false);
const pointing = ref('');

const today = new Date().toISOString().slice(0, 10);

const sheetCounts = computed(() => ({
    present: sheet.value.filter((line) => line.status === 'PRESENT').length,
    late: sheet.value.filter((line) => line.status === 'LATE').length,
    absent: sheet.value.filter((line) => line.status === 'ABSENT').length,
    leave: sheet.value.filter((line) => line.status === 'LEAVE').length,
    pending: sheet.value.filter((line) => !line.status).length,
}));

async function loadSheet() {
    sheetLoading.value = true;
    error.value = '';
    try {
        const [lines, bilan] = await Promise.all([
            attendanceSheet(day.value),
            attendanceSummary(day.value.slice(0, 7)),
        ]);
        sheet.value = lines;
        summary.value = bilan;
    } catch {
        error.value = "La feuille de pointage n'a pas pu être chargée.";
    } finally {
        sheetLoading.value = false;
    }
}

async function point(line: AttendanceLine, status: AttendanceStatus) {
    error.value = '';
    pointing.value = line.staffId;
    try {
        await recordAttendance(line.staffId, { day: day.value, status });
        await loadSheet();
        // L'annuaire affiche le statut du jour : le laisser périmé donnerait deux réponses
        // différentes à la même question sur le même écran.
        if (day.value === today) await load();
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "Le pointage n'a pas pu être enregistré.";
    } finally {
        pointing.value = '';
    }
}

/* ---- Contrats ---- */
const payroll = ref<PayrollSummary | null>(null);
const payrollLoading = ref(false);

async function loadPayroll() {
    payrollLoading.value = true;
    error.value = '';
    try {
        payroll.value = await payrollSummary();
    } catch {
        error.value = "La masse salariale n'a pas pu être chargée.";
    } finally {
        payrollLoading.value = false;
    }
}

/* ---- Accès au portail ---- */
const canGrantAccess = computed(() => can('user_access:write'));
const granting = ref<StaffMember | null>(null);
const grantForm = reactive({ username: '', role: 'SECRETARIAT' as PortalRole });
const grantError = ref('');
const grantWorking = ref(false);

function openGrant(member: StaffMember) {
    granting.value = member;
    // L'adresse de la fiche est proposée, pas imposée : elle sert à joindre la personne, celle du
    // compte à l'identifier, et ce n'est pas toujours la même.
    grantForm.username = member.email ?? '';
    grantForm.role = 'SECRETARIAT';
    grantError.value = '';
}

async function confirmGrant() {
    if (!granting.value) return;
    grantError.value = '';
    grantWorking.value = true;
    try {
        await grantAccess(granting.value.id, { ...grantForm });
        granting.value = null;
        await load();
    } catch (e: any) {
        grantError.value = e?.data?.debugMessage ?? "L'accès n'a pas pu être ouvert.";
    } finally {
        grantWorking.value = false;
    }
}

async function revoke(member: StaffMember) {
    error.value = '';
    try {
        await revokeAccess(member.id);
        await load();
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "L'accès n'a pas pu être fermé.";
    }
}

watch([tab, day], () => {
    if (tab.value === 'attendance') loadSheet();
    if (tab.value === 'contracts') loadPayroll();
});

const filtered = computed(() => {
    const q = keyword.value.trim().toLowerCase();
    return rows.value.filter((row) => {
        if (selectedRole.value && row.role !== selectedRole.value) return false;
        if (!q) return true;
        return fullName(row).toLowerCase().includes(q)
            || (row.jobTitle ?? '').toLowerCase().includes(q)
            || (row.phone ?? '').includes(q);
    });
});

const teachers = computed(() => rows.value.filter((row) => row.role === 'TEACHER'));

const weeklyHours = computed(() => teachers.value
    .reduce((sum, row) => sum + (row.weeklyHours ?? 0), 0));

/** Masse salariale déduite de l'annuaire déjà chargé, pour l'indicateur d'en-tête. */
const payrollFromDirectory = computed(() => rows.value
    .reduce((sum, row) => sum + Number(row.monthlySalary ?? 0), 0));

const pointedToday = computed(() => rows.value.filter((row) => row.todayStatus).length);
const presentToday = computed(() => rows.value
    .filter((row) => row.todayStatus === 'PRESENT' || row.todayStatus === 'LATE').length);

/**
 * Classes vues depuis leurs intervenants.
 *
 * Toutes les classes figurent, y compris celles où personne n'intervient encore : c'est
 * précisément celles-là qu'une direction cherche sur cet onglet.
 */
const assignments = computed(() => classes.value.map((schoolClass) => {
    const members = rows.value.filter((row) => row.classes.some((c) => c.id === schoolClass.id));
    return {
        schoolClass,
        members,
        hours: members.reduce((sum, row) => sum + (row.weeklyHours ?? 0), 0),
    };
}));

function openCreate() {
    editing.value = null;
    Object.assign(form, {
        firstName: '', lastName: '', role: 'TEACHER', jobTitle: '', phone: '', email: '',
        contractType: '', monthlySalary: '', weeklyHours: '', hiredAt: '',
    });
    formError.value = '';
    showForm.value = true;
}

function openEdit(member: StaffMember) {
    editing.value = member;
    Object.assign(form, {
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.role,
        jobTitle: member.jobTitle ?? '',
        phone: member.phone ?? '',
        email: member.email ?? '',
        contractType: member.contractType ?? '',
        monthlySalary: member.monthlySalary ?? '',
        weeklyHours: member.weeklyHours ?? '',
        hiredAt: member.hiredAt ?? '',
    });
    formError.value = '';
    showForm.value = true;
}

async function load() {
    loading.value = true;
    error.value = '';
    try {
        rows.value = await list(includeInactive.value);
    } catch {
        error.value = "Le personnel n'a pas pu être chargé.";
    } finally {
        loading.value = false;
    }
}

async function submit() {
    formError.value = '';
    saving.value = true;
    try {
        const body = {
            firstName: form.firstName,
            lastName: form.lastName,
            role: form.role,
            jobTitle: form.jobTitle || undefined,
            phone: form.phone || undefined,
            email: form.email || undefined,
            contractType: form.contractType || undefined,
            // Le salaire n'est envoyé que par quelqu'un qui a le droit de le lire : sinon le
            // formulaire, qui ne l'a jamais reçu, l'effacerait en le renvoyant vide.
            monthlySalary: canReadSalary.value && form.monthlySalary !== ''
                ? Number(form.monthlySalary) : undefined,
            weeklyHours: form.weeklyHours !== '' ? Number(form.weeklyHours) : undefined,
            hiredAt: form.hiredAt || undefined,
        };
        if (editing.value) await update(editing.value.id, body);
        else await create(body);
        showForm.value = false;
        await load();
    } catch (e: any) {
        formError.value = e?.data?.debugMessage ?? "La fiche n'a pas pu être enregistrée.";
    } finally {
        saving.value = false;
    }
}

async function destroy(member: StaffMember) {
    error.value = '';
    try {
        await remove(member.id);
        await load();
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "La fiche n'a pas pu être retirée.";
    }
}

async function refresh() {
    await load();
    if (opened.value) {
        opened.value = rows.value.find((row) => row.id === opened.value?.id) ?? null;
    }
}

watch(includeInactive, load);

onMounted(async () => {
    try {
        classes.value = await listClasses();
    } catch {
        classes.value = [];
    }
    await load();
});
</script>

<template>
    <div>
        <PageHead
            title="Personnel"
            :sub="rows.length
                ? `${rows.length} membre${rows.length > 1 ? 's' : ''} · ${teachers.length} enseignant${teachers.length > 1 ? 's' : ''}`
                : 'Enseignants, administration et personnel de service'"
        >
            <template #actions>
                <button v-if="canWrite" class="btn-primary" @click="openCreate">
                    <BoIcon name="plus" :size="16" />Nouveau membre
                </button>
            </template>
        </PageHead>

        <p v-if="error" class="alert-danger mb-3.5" role="alert">{{ error }}</p>

        <UiCard
            v-if="showForm" class="mb-3.5"
            :title="editing ? `Modifier ${fullName(editing)}` : 'Nouveau membre'"
            sub="La fonction sert à filtrer et à compter ; l'intitulé du poste reste libre"
        >
            <form @submit.prevent="submit">
                <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                        <label class="field-label" for="lastName">Nom</label>
                        <input
                            id="lastName" v-model="form.lastName" type="text" required
                            placeholder="KOUAMÉ" class="input"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="firstName">Prénom</label>
                        <input
                            id="firstName" v-model="form.firstName" type="text" required
                            placeholder="Adjoua" class="input"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="role">Fonction</label>
                        <select id="role" v-model="form.role" class="select">
                            <option v-for="role in STAFF_ROLES" :key="role.value" :value="role.value">
                                {{ role.label }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label class="field-label" for="jobTitle">Intitulé du poste</label>
                        <input
                            id="jobTitle" v-model="form.jobTitle" type="text"
                            placeholder="Instituteur CM2" class="input"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="phone">Téléphone</label>
                        <input
                            id="phone" v-model="form.phone" type="tel"
                            placeholder="01 33 87 21 06" class="input"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="email">E-mail</label>
                        <input id="email" v-model="form.email" type="email" class="input" />
                    </div>
                    <div>
                        <label class="field-label" for="contract">Contrat</label>
                        <select id="contract" v-model="form.contractType" class="select">
                            <option value="">Non renseigné</option>
                            <option
                                v-for="contract in CONTRACT_TYPES" :key="contract.value"
                                :value="contract.value"
                            >{{ contract.label }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="field-label" for="hiredAt">Embauché le</label>
                        <input id="hiredAt" v-model="form.hiredAt" type="date" class="input" />
                    </div>
                    <div>
                        <label class="field-label" for="hours">Heures / semaine</label>
                        <input
                            id="hours" v-model="form.weeklyHours" type="number" min="0" max="60"
                            class="input"
                        />
                    </div>
                    <div v-if="canReadSalary">
                        <label class="field-label" for="salary">Brut mensuel (FCFA)</label>
                        <input
                            id="salary" v-model="form.monthlySalary" type="number" min="0"
                            class="input"
                        />
                    </div>
                </div>

                <p v-if="formError" class="alert-danger mt-4" role="alert">{{ formError }}</p>

                <div class="flex gap-2 mt-4">
                    <button
                        type="submit" class="btn-primary"
                        :disabled="saving || !form.lastName || !form.firstName"
                    >
                        <BoIcon name="check" :size="16" />{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
                    <button type="button" class="btn-secondary" @click="showForm = false">
                        Annuler
                    </button>
                </div>
            </form>
        </UiCard>

        <nav class="sub-nav">
            <button
                :aria-current="tab === 'directory' ? 'page' : undefined" @click="tab = 'directory'"
            >Annuaire</button>
            <button
                :aria-current="tab === 'assignments' ? 'page' : undefined"
                @click="tab = 'assignments'"
            >Affectations</button>
            <button
                :aria-current="tab === 'attendance' ? 'page' : undefined"
                @click="tab = 'attendance'"
            >Présences</button>
            <button
                v-if="canReadSalary" :aria-current="tab === 'contracts' ? 'page' : undefined"
                @click="tab = 'contracts'"
            >Contrats</button>
            <button
                v-if="canGrantAccess" :aria-current="tab === 'access' ? 'page' : undefined"
                @click="tab = 'access'"
            >Accès au portail</button>
        </nav>

        <div class="grid-12 mb-3.5">
            <KpiCard
                class="c3" label="Effectif du personnel" icon="briefcase"
                tip="Fiches actives du répertoire. Une fiche désactivée n'est pas supprimée : les reçus qu'elle a émis gardent son nom."
                :value="String(rows.length)" unit="membres"
                :foot="`${teachers.length} enseignant(s) · ${rows.length - teachers.length} autre(s)`"
            />
            <KpiCard
                class="c3" label="Pointés aujourd'hui" icon="user-check"
                tip="Membres pointés présents ce matin. Les retards sont comptés comme présents."
                :value="String(presentToday)" :unit="`/ ${rows.length}`"
                :foot="pointedToday
                    ? `${pointedToday - presentToday} absence(s) relevée(s)`
                    : 'aucun pointage enregistré'"
            />
            <KpiCard
                class="c3" label="Heures enseignées / sem." icon="clock"
                tip="Somme des heures hebdomadaires déclarées sur les fiches des enseignants."
                :value="String(weeklyHours)" unit="h"
                :foot="`${teachers.length ? Math.round(weeklyHours / teachers.length) : 0} h en moyenne`"
            />
            <KpiCard
                v-if="canReadSalary" class="c3" label="Masse salariale / mois" icon="cash"
                tip="Somme des salaires bruts renseignés. Les fiches sans salaire n'y figurent pas — le total ne couvre donc pas nécessairement tout l'effectif."
                :value="fm(payrollFromDirectory)" unit="FCFA"
                :foot="`${rows.filter((r) => r.monthlySalary).length} salarié(s) renseigné(s)`"
            />
        </div>


        <UiCard :pad="false">

            <template v-if="tab === 'directory'">
                <div class="tbar">
                    <label class="inp" style="flex: 0 1 240px">
                        <BoIcon name="search" :size="15" />
                        <input
                            v-model="keyword" type="search" class="w-full"
                            placeholder="Nom, poste ou téléphone…" aria-label="Rechercher un membre"
                        />
                    </label>

                    <div class="flex items-center gap-2 flex-wrap">
                        <button class="chip" :aria-pressed="!selectedRole" @click="selectedRole = ''">
                            Toutes fonctions
                        </button>
                        <button
                            v-for="role in STAFF_ROLES" :key="role.value" class="chip"
                            :aria-pressed="selectedRole === role.value"
                            @click="selectedRole = role.value"
                        >{{ role.plural }}</button>
                    </div>

                    <div class="flex-1" />

                    <label class="flex items-center gap-2 text-[12.5px]" style="color: var(--text-muted)">
                        <input v-model="includeInactive" type="checkbox" />
                        Afficher les fiches désactivées
                    </label>
                </div>

                <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Membre</th>
                                <th>Fonction</th>
                                <th>Classes</th>
                                <th>Téléphone</th>
                                <th>Aujourd'hui</th>
                                <th>Accès</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <TableSkeleton v-if="loading" :columns="canReadSalary ? 8 : 7" />
                            <tr
                                v-for="row in filtered" v-else :key="row.id" class="cl"
                                @click="opened = row"
                            >
                                <td>
                                    <div class="flex items-center gap-2.5">
                                        <AvatarBadge :name="fullName(row)" :size="34" />
                                        <div class="nm min-w-0">
                                            <b>{{ fullName(row) }}</b>
                                            <span>
                                                {{ staffRoleLabel(row.role) }}
                                                <template v-if="seniorityYears(row) !== null">
                                                    · depuis {{ seniorityYears(row) }} an(s)
                                                </template>
                                            </span>
                                        </div>
                                    </div>
                                </td>
                                <td class="text-[12.5px] font-semibold" style="color: var(--text)">
                                    {{ row.jobTitle ?? staffRoleLabel(row.role) }}
                                </td>
                                <td>
                                    <div v-if="row.classes.length" class="flex gap-1 flex-wrap">
                                        <span
                                            v-for="schoolClass in row.classes.slice(0, 2)"
                                            :key="schoolClass.id" class="tag"
                                        >{{ schoolClass.name }}</span>
                                        <span v-if="row.classes.length > 2" class="tag">
                                            +{{ row.classes.length - 2 }}
                                        </span>
                                    </div>
                                    <span v-else style="color: var(--text-faint)">—</span>
                                </td>
                                <td class="nu text-[12px]" style="color: var(--text-faint)">
                                    {{ row.phone ?? '—' }}
                                </td>
                                <td>
                                    <UiPill
                                        v-if="row.todayStatus"
                                        :tone="row.todayStatus === 'PRESENT' ? 'ok'
                                            : row.todayStatus === 'LATE' ? 'warn'
                                                : row.todayStatus === 'LEAVE' ? 'info' : 'late'"
                                    >{{ attendanceLabel(row.todayStatus) }}</UiPill>
                                    <span v-else class="text-[12px]" style="color: var(--text-faint)">
                                        Non pointé
                                    </span>
                                </td>
                                <!-- L'accès au portail se lit ici et se règle dans l'onglet dédié :
                                     savoir qui peut entrer fait partie de l'annuaire. -->
                                <td>
                                    <span v-if="row.userId && row.accessEnabled" class="tag">
                                        {{ portalRoleLabel(row.roleCode) }}
                                    </span>
                                    <!-- Un accès fermé n'est pas un accès absent : le compte existe
                                         encore et porte les reçus déjà émis. -->
                                    <UiPill v-else-if="row.userId" tone="mute">Fermé</UiPill>
                                    <span v-else class="text-[12px]" style="color: var(--text-faint)">
                                        Aucun
                                    </span>
                                </td>
                                <td class="text-right whitespace-nowrap">
                                    <span
                                        v-if="!row.active" class="tag"
                                        style="color: var(--text-faint)"
                                    >Désactivée</span>
                                    <button
                                        v-if="canWrite" class="btn-ghost btn-sm"
                                        title="Modifier la fiche" @click.stop="openEdit(row)"
                                    ><BoIcon name="edit" :size="15" /></button>
                                    <button
                                        v-if="canWrite && row.active" class="btn-ghost btn-sm"
                                        title="Désactiver la fiche" @click.stop="destroy(row)"
                                    ><BoIcon name="ban" :size="15" /></button>
                                    <BoIcon
                                        name="chevron-right" :size="16"
                                        style="color: var(--text-faint); vertical-align: middle"
                                    />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <EmptyState
                    v-if="!loading && !filtered.length && (keyword || selectedRole)"
                    title="Aucun résultat"
                    text="Aucun membre ne correspond à ce filtre."
                />
                <EmptyState
                    v-else-if="!loading && !filtered.length"
                    title="Aucun membre"
                    text="Créez les fiches de vos enseignants et de votre administration : les affectations aux classes et le pointage en découlent."
                />
            </template>

            <template v-else-if="tab === 'assignments'">
                <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Classe</th>
                                <th>Titulaire</th>
                                <th>Intervenants</th>
                                <th class="text-right">Heures / sem.</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in assignments" :key="row.schoolClass.id">
                                <td>
                                    <b class="text-sm font-extrabold" style="color: var(--navy)">
                                        {{ row.schoolClass.name }}
                                    </b>
                                </td>
                                <td class="text-[12.5px] font-semibold" style="color: var(--text)">
                                    {{ row.schoolClass.mainTeacherName ?? 'à désigner' }}
                                </td>
                                <td class="text-[12.5px]" style="color: var(--text-muted)">
                                    <template v-if="row.members.length">
                                        {{ row.members.map(fullName).join(' · ') }}
                                    </template>
                                    <span v-else style="color: var(--text-faint)">
                                        aucun intervenant rattaché
                                    </span>
                                </td>
                                <td class="num">{{ row.hours || '—' }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <EmptyState
                    v-if="!assignments.length"
                    title="Aucune classe"
                    text="Les affectations se lisent par classe : créez vos classes pour y rattacher des intervenants."
                />
            </template>

            <template v-else-if="tab === 'attendance'">
                <div class="tbar">
                    <label class="inp" style="flex: 0 0 auto">
                        <span class="text-[12.5px]" style="color: var(--text-faint)">Journée</span>
                        <input v-model="day" type="date" :max="today" aria-label="Journée pointée" />
                    </label>

                    <div class="flex items-center gap-2 flex-wrap text-[12.5px]" style="color: var(--text-muted)">
                        <span><b class="nu" style="color: var(--navy)">{{ sheetCounts.present }}</b> présents</span>
                        <span><b class="nu" style="color: var(--navy)">{{ sheetCounts.late }}</b> en retard</span>
                        <span><b class="nu" style="color: var(--danger)">{{ sheetCounts.absent }}</b> absents</span>
                        <span><b class="nu" style="color: var(--navy)">{{ sheetCounts.leave }}</b> en congé</span>
                        <span v-if="sheetCounts.pending" style="color: var(--text-faint)">
                            {{ sheetCounts.pending }} non pointé(s)
                        </span>
                    </div>

                    <div class="flex-1" />

                    <span class="text-[12.5px]" style="color: var(--text-faint)">
                        Taux du mois
                        <b class="nu" style="color: var(--navy)">
                            <!-- Pas de taux plutôt qu'un zéro : zéro se lirait « personne n'est
                                 venu » là où il faut lire « on n'a pas pointé ». -->
                            {{ summary?.presenceRate != null ? `${summary.presenceRate} %` : '—' }}
                        </b>
                    </span>
                </div>

                <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Membre</th>
                                <th>Fonction</th>
                                <th>Statut</th>
                                <th>Motif</th>
                                <th class="text-right">Pointer</th>
                            </tr>
                        </thead>
                        <tbody>
                            <TableSkeleton v-if="sheetLoading" :columns="5" />
                            <tr v-for="line in sheet" v-else :key="line.staffId">
                                <td>
                                    <div class="flex items-center gap-2.5">
                                        <AvatarBadge :name="`${line.lastName} ${line.firstName}`" :size="34" />
                                        <b class="text-sm font-extrabold" style="color: var(--navy)">
                                            {{ line.lastName }} {{ line.firstName }}
                                        </b>
                                    </div>
                                </td>
                                <td><span class="tag">{{ line.jobTitle ?? staffRoleLabel(line.role) }}</span></td>
                                <td
                                    class="text-[12.5px] font-semibold"
                                    :style="line.status === 'ABSENT' ? 'color: var(--danger)'
                                        : line.status ? 'color: var(--text)' : 'color: var(--text-faint)'"
                                >{{ attendanceLabel(line.status) }}</td>
                                <td class="text-[12px]" style="color: var(--text-faint)">
                                    {{ line.note ?? '—' }}
                                </td>
                                <td class="text-right whitespace-nowrap">
                                    <button
                                        v-for="status in ATTENDANCE_STATUSES" :key="status.value"
                                        class="btn-ghost btn-sm"
                                        :disabled="!canPoint || pointing === line.staffId"
                                        :aria-pressed="line.status === status.value"
                                        @click="point(line, status.value)"
                                    >{{ status.label }}</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <EmptyState
                    v-if="!sheetLoading && !sheet.length"
                    title="Personne à pointer"
                    text="La feuille reprend le personnel actif : créez des fiches pour pouvoir pointer."
                />
            </template>

            <template v-else-if="tab === 'contracts'">
                <div v-if="payrollLoading" class="grid-12 p-4">
                    <i v-for="n in 4" :key="n" class="sk h-[74px] c3" />
                </div>
                <template v-else-if="payroll">
                    <div class="grid-12 p-4">
                        <div class="card p-4" style="grid-column: span 3">
                            <span class="kpi-label">Masse salariale / mois</span>
                            <span class="kpi-value">
                                {{ fm(payroll.monthlyPayroll) }}<small>FCFA</small>
                            </span>
                            <!-- Le dénominateur est dit : sans lui, ce total se lirait comme
                                 couvrant tout l'effectif alors qu'il ne couvre que les fiches
                                 complétées. -->
                            <span class="kpi-foot">
                                sur {{ payroll.paidHeadcount }} fiche(s) renseignée(s)
                                / {{ payroll.headcount }}
                            </span>
                        </div>
                        <div class="card p-4" style="grid-column: span 3">
                            <span class="kpi-label">Salaire moyen</span>
                            <span class="kpi-value">
                                <template v-if="payroll.averageSalary != null">
                                    {{ fm(payroll.averageSalary) }}<small>FCFA</small>
                                </template>
                                <template v-else>—</template>
                            </span>
                            <span class="kpi-foot">hors fiches sans salaire</span>
                        </div>
                        <div class="card p-4" style="grid-column: span 3">
                            <span class="kpi-label">Ancienneté moyenne</span>
                            <span class="kpi-value">
                                <template v-if="payroll.averageSeniorityYears != null">
                                    {{ payroll.averageSeniorityYears }}<small>ans</small>
                                </template>
                                <template v-else>—</template>
                            </span>
                            <span class="kpi-foot">sur les dates d'embauche connues</span>
                        </div>
                        <div class="card p-4" style="grid-column: span 3">
                            <span class="kpi-label">Heures enseignées / sem.</span>
                            <span class="kpi-value">{{ payroll.weeklyTeachingHours }}<small>h</small></span>
                            <span class="kpi-foot">assurées par les enseignants</span>
                        </div>
                    </div>

                    <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Contrat</th>
                                    <th class="text-right">Effectif</th>
                                    <th class="text-right">Part de l'effectif</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="contract in CONTRACT_TYPES" :key="contract.value">
                                    <td><span class="tag">{{ contract.label }}</span></td>
                                    <td class="num">{{ payroll.byContract[contract.value] ?? 0 }}</td>
                                    <td class="num">
                                        {{ payroll.headcount
                                            ? Math.round((payroll.byContract[contract.value] ?? 0)
                                                / payroll.headcount * 100)
                                            : 0 }} %
                                    </td>
                                </tr>
                                <tr v-if="payroll.withoutContract">
                                    <td style="color: var(--text-faint)">Contrat non renseigné</td>
                                    <td class="num">{{ payroll.withoutContract }}</td>
                                    <td class="num">
                                        {{ Math.round(payroll.withoutContract / payroll.headcount * 100) }} %
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Membre</th>
                                    <th>Contrat</th>
                                    <th>Ancienneté</th>
                                    <th class="text-right">Heures / sem.</th>
                                    <th class="text-right">Brut mensuel</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="row in rows" :key="row.id">
                                    <td>
                                        <b class="text-sm font-extrabold" style="color: var(--navy)">
                                            {{ fullName(row) }}
                                        </b>
                                    </td>
                                    <td><span class="tag">{{ contractLabel(row.contractType) }}</span></td>
                                    <td class="text-[12.5px]" style="color: var(--text-muted)">
                                        {{ seniorityYears(row) !== null
                                            ? `${seniorityYears(row)} an(s)` : '—' }}
                                    </td>
                                    <td class="num">{{ row.weeklyHours ?? '—' }}</td>
                                    <td class="num">
                                        {{ row.monthlySalary
                                            ? `${fm(Number(row.monthlySalary))} F`
                                            : '—' }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </template>
            </template>

            <template v-else>
                <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Membre</th>
                                <th>Identifiant</th>
                                <th>Rôle</th>
                                <th>État</th>
                                <th class="text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in rows" :key="row.id">
                                <td>
                                    <div class="flex items-center gap-2.5">
                                        <AvatarBadge :name="fullName(row)" :size="34" />
                                        <b class="text-sm font-extrabold" style="color: var(--navy)">
                                            {{ fullName(row) }}
                                        </b>
                                    </div>
                                </td>
                                <td class="text-[12.5px]" style="color: var(--text-muted)">
                                    {{ row.username ?? '—' }}
                                </td>
                                <td>
                                    <span v-if="row.roleCode" class="tag">
                                        {{ portalRoleLabel(row.roleCode) }}
                                    </span>
                                    <span v-else style="color: var(--text-faint)">—</span>
                                </td>
                                <td class="text-[12.5px] font-semibold" :style="row.userId
                                    ? (row.accessEnabled ? 'color: var(--text)' : 'color: var(--danger)')
                                    : 'color: var(--text-faint)'">
                                    {{ row.userId
                                        ? (row.accessEnabled ? 'Actif' : 'Fermé')
                                        : 'Aucun accès' }}
                                </td>
                                <td class="text-right whitespace-nowrap">
                                    <button
                                        v-if="!row.userId" class="btn-ghost btn-sm"
                                        @click="openGrant(row)"
                                    ><BoIcon name="plus" :size="15" />Ouvrir un accès</button>
                                    <button
                                        v-else-if="row.accessEnabled" class="btn-ghost btn-sm"
                                        @click="revoke(row)"
                                    >Fermer l'accès</button>
                                    <!-- Rouvrir un accès fermé passe par la réactivation du compte,
                                         qui n'existe pas encore : mieux vaut ne rien proposer que
                                         proposer un bouton sans effet. -->
                                    <span v-else class="text-[12px]" style="color: var(--text-faint)">
                                        compte désactivé
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <EmptyState
                    v-if="!rows.length"
                    title="Aucun membre"
                    text="Les accès s'ouvrent depuis une fiche du personnel : commencez par créer les fiches."
                />
            </template>

            <template #footer>
                <span class="text-[12px]" style="color: var(--text-faint)">
                    <b class="nu" style="color: var(--navy)">
                        {{ tab === 'directory' ? filtered.length
                            : tab === 'assignments' ? assignments.length
                                : tab === 'attendance' ? sheet.length : rows.length }}
                    </b>
                    {{ tab === 'directory' ? 'membre(s) affiché(s)'
                        : tab === 'assignments' ? 'classe(s)'
                            : tab === 'attendance' ? 'ligne(s) de pointage'
                                : tab === 'contracts' ? 'contrat(s)' : 'compte(s) possible(s)' }}
                </span>
            </template>
        </UiCard>

        <SideDrawer
            v-if="granting"
            :title="`Ouvrir un accès pour ${fullName(granting)}`"
            sub="Un courriel de bienvenue portant le lien de définition du mot de passe part aussitôt"
            @close="granting = null"
        >
            <label class="field-label" for="grant-username">Identifiant de connexion</label>
            <input
                id="grant-username" v-model="grantForm.username" type="email" class="input mb-4"
                placeholder="prenom.nom@ecole.ci"
            />

            <p class="sec">Rôle</p>
            <div class="rounded-xl overflow-hidden mb-4" style="border: 1px solid var(--border)">
                <label
                    v-for="role in PORTAL_ROLES" :key="role.value"
                    class="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer"
                    style="border-bottom: 1px solid var(--border)"
                >
                    <input v-model="grantForm.role" type="radio" :value="role.value" />
                    <span class="flex-1">
                        <b class="text-[13px]" style="color: var(--navy)">{{ role.label }}</b>
                        <span class="block text-[11.5px]" style="color: var(--text-faint)">
                            {{ role.hint }}
                        </span>
                    </span>
                </label>
            </div>

            <p v-if="grantError" class="alert-danger" role="alert">{{ grantError }}</p>

            <template #footer>
                <button
                    class="btn-primary" :disabled="grantWorking || !grantForm.username"
                    @click="confirmGrant"
                >
                    <BoIcon name="plus" :size="16" />{{ grantWorking ? 'Ouverture…' : 'Ouvrir l’accès' }}</button>
                <button class="btn-secondary" @click="granting = null">Annuler</button>
            </template>
        </SideDrawer>

        <StaffDrawer
            v-if="opened" :member="opened" :classes="classes"
            @close="opened = null" @changed="refresh"
        />
    </div>
</template>
