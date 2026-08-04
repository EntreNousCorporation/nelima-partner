<script setup lang="ts">
import {
    CONTRACT_TYPES, STAFF_ROLES, attendanceLabel, contractLabel, fullName, staffRoleLabel,
    type ContractType, type StaffMember, type StaffRole,
} from '~/composables/useStaff';
import type { SchoolClass } from '~/composables/useClasses';

/**
 * Répertoire du personnel.
 *
 * Deux onglets ici : l'annuaire, et les affectations vues depuis la classe. Les présences, les
 * contrats et les accès viennent ensuite, et la barre d'onglets est faite pour les accueillir.
 */
const { list, create, update, remove } = useStaff();
const { list: listClasses } = useClasses();
const { can } = usePermissions();

const rows = ref<StaffMember[]>([]);
const classes = ref<SchoolClass[]>([]);
const loading = ref(true);
const error = ref('');

const tab = ref<'directory' | 'assignments'>('directory');
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

const payroll = computed(() => rows.value
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
                    Nouveau membre
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
                    >{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
                    <button type="button" class="btn-secondary" @click="showForm = false">
                        Annuler
                    </button>
                </div>
            </form>
        </UiCard>

        <div class="grid-12 mb-3.5">
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">Effectif du personnel</span>
                <span class="kpi-value">{{ rows.length }}<small>membres</small></span>
                <span class="kpi-foot">
                    {{ teachers.length }} enseignant{{ teachers.length > 1 ? 's' : '' }} ·
                    {{ rows.length - teachers.length }} autre{{ rows.length - teachers.length > 1 ? 's' : '' }}
                </span>
            </div>
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">Pointés aujourd'hui</span>
                <span class="kpi-value">{{ presentToday }}<small>/ {{ rows.length }}</small></span>
                <span class="kpi-foot">
                    <template v-if="pointedToday">
                        {{ pointedToday - presentToday }} absence(s) relevée(s)
                    </template>
                    <template v-else>aucun pointage enregistré</template>
                </span>
            </div>
            <div class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">Heures enseignées / sem.</span>
                <span class="kpi-value">{{ weeklyHours }}<small>h</small></span>
                <span class="kpi-foot">
                    {{ teachers.length ? Math.round(weeklyHours / teachers.length) : 0 }} h en moyenne
                </span>
            </div>
            <div v-if="canReadSalary" class="card p-4" style="grid-column: span 3">
                <span class="kpi-label">Masse salariale / mois</span>
                <span class="kpi-value">
                    {{ Math.round(payroll).toLocaleString('fr-FR') }}<small>FCFA</small>
                </span>
                <span class="kpi-foot">
                    {{ rows.filter((r) => r.monthlySalary).length }} salarié(s) renseigné(s)
                </span>
            </div>
        </div>

        <UiCard :pad="false">
            <div class="tbar">
                <div class="flex items-center gap-2">
                    <button class="chip" :aria-pressed="tab === 'directory'" @click="tab = 'directory'">
                        Annuaire
                    </button>
                    <button
                        class="chip" :aria-pressed="tab === 'assignments'"
                        @click="tab = 'assignments'"
                    >Affectations</button>
                </div>
            </div>

            <template v-if="tab === 'directory'">
                <div class="tbar">
                    <label class="inp" style="flex: 0 1 240px">
                        <svg
                            class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round"
                        >
                            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
                        </svg>
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
                                <th>Contrat</th>
                                <th>Aujourd'hui</th>
                                <th v-if="canReadSalary" class="text-right">Brut mensuel</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="loading">
                                <td :colspan="canReadSalary ? 8 : 7" class="py-8 text-center" style="color: var(--text-faint)">
                                    Chargement…
                                </td>
                            </tr>
                            <tr
                                v-for="row in filtered" v-else :key="row.id" class="cursor-pointer"
                                @click="opened = row"
                            >
                                <td>
                                    <div class="flex items-center gap-2.5">
                                        <AvatarBadge :name="fullName(row)" :size="34" />
                                        <div>
                                            <b class="text-sm font-extrabold" style="color: var(--navy)">
                                                {{ fullName(row) }}
                                            </b>
                                            <div
                                                v-if="row.jobTitle" class="text-[11.5px]"
                                                style="color: var(--text-faint)"
                                            >{{ row.jobTitle }}</div>
                                        </div>
                                    </div>
                                </td>
                                <td><span class="tag">{{ staffRoleLabel(row.role) }}</span></td>
                                <td class="text-[12.5px]" style="color: var(--text-muted)">
                                    {{ row.classes.length
                                        ? row.classes.map((c) => c.name).join(', ')
                                        : '—' }}
                                </td>
                                <td class="nu text-[12px]" style="color: var(--text-faint)">
                                    {{ row.phone ?? '—' }}
                                </td>
                                <td class="text-[12.5px]" style="color: var(--text-muted)">
                                    {{ contractLabel(row.contractType) }}
                                </td>
                                <td class="text-[12.5px]" :style="row.todayStatus
                                    ? 'color: var(--text)' : 'color: var(--text-faint)'">
                                    {{ attendanceLabel(row.todayStatus) }}
                                </td>
                                <td v-if="canReadSalary" class="num">
                                    {{ row.monthlySalary
                                        ? `${Math.round(Number(row.monthlySalary)).toLocaleString('fr-FR')} F`
                                        : '—' }}
                                </td>
                                <td class="text-right whitespace-nowrap">
                                    <span
                                        v-if="!row.active" class="tag"
                                        style="color: var(--text-faint)"
                                    >Désactivée</span>
                                    <button
                                        v-if="canWrite" class="btn-ghost btn-sm"
                                        @click.stop="openEdit(row)"
                                    >Modifier</button>
                                    <button
                                        v-if="canWrite && row.active" class="btn-ghost btn-sm"
                                        @click.stop="destroy(row)"
                                    >Retirer</button>
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

            <template v-else>
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

            <template #footer>
                <span class="text-[12px]" style="color: var(--text-faint)">
                    <b class="nu" style="color: var(--navy)">
                        {{ tab === 'directory' ? filtered.length : assignments.length }}
                    </b>
                    {{ tab === 'directory' ? 'membre(s) affiché(s)' : 'classe(s)' }}
                </span>
            </template>
        </UiCard>

        <StaffDrawer
            v-if="opened" :member="opened" :classes="classes"
            @close="opened = null" @changed="refresh"
        />
    </div>
</template>
