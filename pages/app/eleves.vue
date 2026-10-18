<script setup lang="ts">
import {
    levelLabel, PAYMENT_STATUSES,
    type EducationCycle, type Gender, type LevelOfStudy, type PaymentStatus, type Student,
    type StudentFilters, type StudentStats,
} from '~/composables/useStudents';
import { type SchoolClass } from '~/composables/useClasses';
import type { DonutSegment } from '~/components/DonutChart.vue';
import type { LevelBar } from '~/components/LevelBars.vue';
import { useAuthStore } from '~/stores/auth';

/**
 * Écran Élèves : l'effectif d'un coup d'œil (cartes, répartitions, statuts), puis la liste.
 *
 * Tous les chiffres du haut portent sur l'école entière et viennent de `/students/stats`, calculés
 * avec les mêmes règles que les filtres : cliquer sur l'onglet « En retard (214) » montre bien 214
 * élèves. Les compter sur la page affichée aurait donné des chiffres faux dès la deuxième page.
 */
const auth = useAuthStore();
const { search, stats: fetchStats, exportUrl, establishmentLevels, create } = useStudents();
const { assign: assignToClass } = useClasses();
const { can } = usePermissions();

const students = ref<Student[]>([]);
const levelOptions = ref<LevelOfStudy[]>([]);
const classOptions = ref<SchoolClass[]>([]);
const stats = ref<StudentStats | null>(null);
const academicYear = ref<string | null>(null);
const page = ref(0);
const size = 20;
const totalElements = ref(0);
const totalPages = ref(0);
const loading = ref(false);
const loadError = ref('');

/** Élève dont la fiche est ouverte en tiroir. */
const opened = ref<Student | null>(null);

/* ---- Onglets et filtres ---- */
type Tab = 'all' | 'overdue' | 'incomplete' | 'unassigned';
const tab = ref<Tab>('all');
const keyword = ref('');
const selectedLevel = ref('');
const selectedClass = ref('');
const selectedStatus = ref<PaymentStatus | ''>('');
const showMoreFilters = ref(false);
const selectedGender = ref<Gender | ''>('');
const selectedDossier = ref<'' | 'complete' | 'incomplete'>('');

/** Ce que l'onglet impose, puis ce que les filtres précisent : la même sélection sert la liste et l'export. */
const filters = computed<StudentFilters>(() => ({
    keyword: keyword.value || undefined,
    levelOfStudies: selectedLevel.value ? [selectedLevel.value] : undefined,
    schoolClassId: selectedClass.value || undefined,
    unassignedOnly: tab.value === 'unassigned' || undefined,
    paymentStatus: tab.value === 'overdue' ? 'OVERDUE' : selectedStatus.value || undefined,
    incompleteDossier: tab.value === 'incomplete' ? true
        : selectedDossier.value === 'incomplete' ? true
            : selectedDossier.value === 'complete' ? false : undefined,
    gender: selectedGender.value || undefined,
}));

const tabs = computed(() => [
    { key: 'all' as Tab, label: 'Tous les élèves', count: stats.value?.total },
    { key: 'overdue' as Tab, label: 'En retard de paiement', count: stats.value?.overdueCount },
    { key: 'incomplete' as Tab, label: 'Dossiers incomplets', count: stats.value?.incompleteDossier },
    { key: 'unassigned' as Tab, label: 'Sans classe', count: stats.value?.withoutClass },
]);

const fmt = (value?: number | null) => Number(value ?? 0).toLocaleString('fr-FR');

/** 86 500 000 → « 86,5 M » : le chiffre exact est dans l'onglet, la carte donne l'ordre de grandeur. */
function compactAmount(value: number) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} M`;
    return fmt(value);
}

/* ---- Graphiques ---- */
const CYCLES: { value: EducationCycle; label: string; color: string }[] = [
    { value: 'KINDERGARTEN', label: 'Maternelle', color: '#7FB8FF' },
    { value: 'PRIMARY', label: 'Primaire', color: 'var(--brand-600)' },
    { value: 'MIDDLE_SCHOOL', label: 'Collège', color: '#8A5BFF' },
    { value: 'HIGH_SCHOOL', label: 'Lycée', color: '#F0912D' },
];

/** Les cycles que l'école enseigne, plus ceux où se trouvent des élèves : pas de barre vide pour un lycée qu'elle n'a pas. */
const levelBars = computed<LevelBar[]>(() => {
    const declared = new Set(levelOptions.value.map((level) => level.cycle).filter(Boolean));
    const counts = new Map((stats.value?.byCycle ?? []).map((row) => [row.cycle, row.count]));
    const bars = CYCLES
        .filter((cycle) => declared.has(cycle.value) || (counts.get(cycle.value) ?? 0) > 0)
        .map((cycle) => ({ label: cycle.label, value: counts.get(cycle.value) ?? 0, color: cycle.color }));
    const unknown = counts.get(null) ?? 0;
    if (unknown > 0) bars.push({ label: 'Non renseigné', value: unknown, color: 'var(--border-strong)' });
    return bars;
});

const genderSegments = computed<DonutSegment[]>(() => {
    const s = stats.value;
    const segments = [
        { label: 'Filles', value: s?.female ?? 0, color: '#EF6F9A' },
        { label: 'Garçons', value: s?.male ?? 0, color: 'var(--brand-600)' },
    ];
    // Le sexe est facultatif à l'inscription : le taire fausserait la part des filles.
    if (s?.genderUnknown) segments.push({ label: 'Non renseigné', value: s.genderUnknown, color: 'var(--border-strong)' });
    return segments;
});

const statusSegments = computed<DonutSegment[]>(() => [
    { label: 'À jour', value: stats.value?.statusUpToDate ?? 0, color: 'var(--success-solid)' },
    { label: 'Acompte versé', value: stats.value?.statusDeposit ?? 0, color: '#7FB8FF' },
    { label: 'En retard', value: stats.value?.statusOverdue ?? 0, color: '#F0912D' },
    { label: 'Dossier incomplet', value: stats.value?.statusIncomplete ?? 0, color: 'var(--danger-solid)' },
]);

function paymentPill(student: Student) {
    return PAYMENT_STATUSES.find((status) => status.value === student.paymentStatus) ?? PAYMENT_STATUSES[0];
}

/* ---- Menu d'actions d'une ligne ---- */
const menuFor = ref<string | null>(null);

function closeMenu() {
    menuFor.value = null;
}

function openGuichet(student: Student) {
    closeMenu();
    navigateTo({ path: '/app/paiements/guichet', query: { eleve: student.id } });
}

onMounted(() => document.addEventListener('click', closeMenu));
onBeforeUnmount(() => document.removeEventListener('click', closeMenu));

/* ---- Import ---- */
const showImport = ref(false);
const importing = ref(false);
const importError = ref('');
const importMessage = ref('');
const importFile = ref<File | null>(null);

function onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    importFile.value = input.files?.[0] ?? null;
}

async function submitImport() {
    if (!importFile.value) return;
    importError.value = '';
    importMessage.value = '';
    importing.value = true;
    try {
        const body = new FormData();
        body.append('file', importFile.value);
        // Pas de Content-Type explicite : le navigateur doit poser lui-même la frontière
        // multipart, la fixer à la main casserait la requête.
        const report = await $fetch<{ imported: number }>('/api/v1/students/import-csv', {
            method: 'POST', body,
        });
        importMessage.value = `${report.imported} élève(s) importé(s).`;
        importFile.value = null;
        showImport.value = false;
        page.value = 0;
        await refresh();
    } catch (e: any) {
        // Le rapport du serveur désigne les lignes fautives : on le montre tel quel, c'est la
        // seule information qui permet à l'école de corriger son fichier.
        importError.value = e?.data?.debugMessage
            ?? "Le fichier n'a pas pu être importé.";
    } finally {
        importing.value = false;
    }
}

/* ---- Répartition en classe ---- */
/**
 * Les élèves cochés, et la classe où les envoyer.
 *
 * <p>Rien ne permettait d'affecter un élève déjà inscrit : la classe se choisissait à
 * l'inscription unitaire, et nulle part ailleurs. Un import de vingt élèves laissait donc vingt
 * élèves sans classe, définitivement.
 *
 * <p>La sélection est vidée après l'affectation : les élèves affectés quittent le filtre « Sans
 * classe », et garder cochés des identifiants que la liste n'affiche plus tromperait sur ce que
 * la prochaine action toucherait.
 */
const selected = reactive(new Set<string>());
const targetClass = ref('');
const assigning = ref(false);
const assignError = ref('');

const allOnPageSelected = computed(() =>
    students.value.length > 0 && students.value.every((student) => selected.has(student.id)));
const someOnPageSelected = computed(() =>
    students.value.some((student) => selected.has(student.id)));

function toggleOne(id: string) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
}

function toggleAll() {
    if (allOnPageSelected.value) students.value.forEach((student) => selected.delete(student.id));
    else students.value.forEach((student) => selected.add(student.id));
}

async function assignSelection() {
    if (!targetClass.value || !selected.size) return;
    assigning.value = true;
    assignError.value = '';
    try {
        await assignToClass(targetClass.value, [...selected]);
        selected.clear();
        targetClass.value = '';
        await refresh();
    } catch (e: any) {
        assignError.value = e?.data?.debugMessage ?? "L'affectation n'a pas pu être enregistrée.";
    } finally {
        assigning.value = false;
    }
}

/* ---- Inscription ---- */
const showForm = ref(false);
const saving = ref(false);
const formError = ref('');
const formClass = ref<string>('');
const form = reactive({
    firstName: '',
    lastName: '',
    registrationNumber: '',
    birthDay: '',
    placeOfBirth: '',
    levelOfStudyCode: '',
    gender: '' as Gender | '',
});

const formComplete = computed(() =>
    Boolean(form.firstName && form.lastName && form.registrationNumber
        && form.birthDay && form.placeOfBirth && formClass.value && form.levelOfStudyCode));

async function load() {
    loading.value = true;
    loadError.value = '';
    try {
        const result = await search({ ...filters.value, page: page.value, size });
        students.value = result.content ?? [];
        totalElements.value = result.totalElements ?? 0;
        totalPages.value = result.totalPages ?? 0;
    } catch {
        loadError.value = "La liste n'a pas pu être chargée.";
        students.value = [];
    } finally {
        loading.value = false;
    }
}

async function loadStats() {
    try {
        stats.value = await fetchStats();
    } catch {
        stats.value = null;
    }
}

/** Après une écriture : la liste et les chiffres du haut bougent ensemble. */
function refresh() {
    return Promise.all([load(), loadStats()]);
}

// Une classe appartient à un niveau : choisir la classe fixe le niveau, pour ne pas saisir deux
// fois la même information à l'inscription.
function onFormClassChange() {
    const chosen = classOptions.value.find((c) => c.id === formClass.value);
    if (chosen?.levelCode) form.levelOfStudyCode = chosen.levelCode;
}

async function submit() {
    formError.value = '';
    saving.value = true;
    try {
        // `gender` vide vaut « non renseigné » : on ne l'envoie pas plutôt que d'envoyer une
        // chaîne que le serveur refuserait de convertir en énuméré.
        const created = await create({ ...form, gender: form.gender || undefined });
        // Inscription en une étape : si une classe est choisie, on y affecte l'élève dans la foulée,
        // au lieu d'imposer une seconde manipulation depuis le tiroir de classe.
        if (formClass.value && created?.id) {
            await assignToClass(formClass.value, [created.id]);
        }
        showForm.value = false;
        Object.assign(form, {
            firstName: '', lastName: '', registrationNumber: '',
            birthDay: '', placeOfBirth: '', levelOfStudyCode: '', gender: '',
        });
        formClass.value = '';
        // On revient en première page : l'élève créé n'est pas nécessairement sur la page courante.
        page.value = 0;
        await refresh();
    } catch (e: any) {
        // Le backend renvoie un 409 sur matricule déjà pris, cas de loin le plus fréquent.
        formError.value = e?.response?.status === 409
            ? 'Ce matricule est déjà attribué dans votre établissement.'
            : "L'élève n'a pas pu être enregistré.";
    } finally {
        saving.value = false;
    }
}

function changePage(delta: number) {
    const next = page.value + delta;
    if (next < 0 || next >= totalPages.value) return;
    page.value = next;
    load();
}

function formatDate(value?: string) {
    if (!value) return '—';
    const [y, m, d] = value.split('-');
    return d && m && y ? `${d}/${m}/${y}` : value;
}

/** La recherche part au serveur : on attend une pause de frappe pour ne pas la relancer par lettre. */
let debounce: ReturnType<typeof setTimeout> | undefined;

watch(keyword, () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { page.value = 0; load(); }, 300);
});

watch([tab, selectedLevel, selectedClass, selectedStatus, selectedGender, selectedDossier], () => {
    page.value = 0;
    load();
});

onMounted(async () => {
    // La barre supérieure envoie ici avec sa recherche : la reprendre évite de la retaper.
    const requested = useRoute().query.q;
    if (typeof requested === 'string' && requested) keyword.value = requested;

    // Chargés ensemble : aucun n'a besoin d'un autre, et les enchaîner faisait attendre la liste
    // derrière des menus déroulants — la somme des allers-retours au lieu du plus long.
    await Promise.all([
        establishmentLevels(auth.user?.establishmentId)
            .then((levels) => { levelOptions.value = levels; })
            .catch(() => { levelOptions.value = []; }),
        useClasses().list()
            .then((classes) => { classOptions.value = classes; })
            .catch(() => { classOptions.value = []; }),
        useSettings().years()
            .then((years) => { academicYear.value = years.find((year) => year.active)?.label ?? null; })
            .catch(() => { academicYear.value = null; }),
        load(),
        loadStats(),
    ]);
});
</script>

<template>
    <div>
        <PageHead
            title="Élèves"
            :sub="[`${fmt(stats?.total ?? totalElements)} élève${(stats?.total ?? totalElements) > 1 ? 's' : ''} inscrit${(stats?.total ?? totalElements) > 1 ? 's' : ''}`,
                   academicYear ? `année ${academicYear}` : null].filter(Boolean).join(' · ')"
        >
            <template #actions>
                <button class="btn-secondary" @click="showImport = !showImport; showForm = false">
                    <BoIcon :name="showImport ? 'close' : 'download'" :size="16" />
                    {{ showImport ? 'Annuler' : 'Importer' }}
                </button>
                <button class="btn-primary" @click="showForm = !showForm; showImport = false">
                    <BoIcon :name="showForm ? 'close' : 'plus'" :size="16" />
                    {{ showForm ? 'Annuler' : 'Inscrire un élève' }}
                </button>
            </template>
        </PageHead>

        <UiCard
            v-if="showImport" class="mb-3.5"
            title="Importer une liste d'élèves"
            sub="Fichier CSV séparé par des points-virgules"
        >
            <form @submit.prevent="submitImport">
                <p class="text-[12.5px] mb-3 leading-relaxed" style="color: var(--text-muted)">
                    En-tête exact attendu :
                    <code class="text-[11.5px]">matricule;nom;prenom;date_naissance;lieu_naissance;niveau;sexe;classe</code><br />
                    Les dates s'écrivent JJ-MM-AAAA — <code class="text-[11.5px]">14-09-2015</code> —,
                    et le niveau doit être l'un de ceux que vous avez déclarés.
                    <strong>Les colonnes « sexe » et « classe » sont facultatives.</strong>
                    Le sexe s'écrit <code class="text-[11.5px]">M</code> ou
                    <code class="text-[11.5px]">F</code> — « garçon » et « fille » en toutes lettres
                    passent aussi ; sans lui, il restera à renseigner élève par élève. La classe
                    renseignée y affecte l'élève dès l'import ; laissée vide, il restera à répartir.
                    L'import est tout ou rien : si une ligne est invalide, rien n'est enregistré.
                </p>

                <!-- Le modèle vient du serveur, qui le construit avec les constantes du contrôle
                     d'en-tête : un modèle recopié ici aurait dérivé au premier changement de
                     format, et l'école se serait vu refuser un fichier téléchargé chez nous. -->
                <a
                    href="/api/v1/students/import-csv/template"
                    download="nelima-modele-eleves.csv" class="btn-ghost btn-sm mb-3"
                >
                    <BoIcon name="download" :size="15" />
                    Télécharger le modèle
                </a>

                <input type="file" accept=".csv,text/csv" required class="block text-sm"
                       @change="onFileChange" />
                <p v-if="importError" class="alert-danger mt-3" role="alert">{{ importError }}</p>
                <button type="submit" :disabled="importing || !importFile" class="btn-primary mt-4">
                    <BoIcon name="upload" :size="16" />
                    {{ importing ? 'Import en cours…' : 'Importer' }}
                </button>
            </form>
        </UiCard>

        <p v-if="importMessage" class="alert-success mb-3.5">{{ importMessage }}</p>

        <UiCard v-if="showForm" class="mb-3.5" title="Nouvel élève" sub="Tous les champs sont requis">
            <form @submit.prevent="submit">
                <p v-if="!classOptions.length" class="alert-danger mb-4">
                    <template v-if="!levelOptions.length">
                        Aucun niveau n'est déclaré. Renseignez-les dans
                        <NuxtLink to="/app/niveaux" class="underline">Niveaux enseignés</NuxtLink>,
                        puis ouvrez des classes.
                    </template>
                    <template v-else>
                        Aucune classe n'est ouverte : un élève s'inscrit dans une classe. Créez-en une
                        dans <NuxtLink to="/app/classes" class="underline">Classes</NuxtLink>.
                    </template>
                </p>
                <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                        <label class="field-label" for="firstName">Prénom</label>
                        <input id="firstName" v-model="form.firstName" type="text" required class="input" />
                    </div>
                    <div>
                        <label class="field-label" for="lastName">Nom</label>
                        <input id="lastName" v-model="form.lastName" type="text" required class="input" />
                    </div>
                    <div>
                        <label class="field-label" for="registrationNumber">Matricule</label>
                        <input
                            id="registrationNumber" v-model="form.registrationNumber" type="text"
                            required class="input"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="birthDay">Date de naissance</label>
                        <NelimaDateField id="birthDay" v-model="form.birthDay" required />
                    </div>
                    <div>
                        <label class="field-label" for="placeOfBirth">Lieu de naissance</label>
                        <input id="placeOfBirth" v-model="form.placeOfBirth" type="text" required class="input" />
                    </div>
                    <div>
                        <!-- Facultatif, et sans astérisque : les états scolaires le demandent, mais
                             une inscription ne doit pas buter dessus. -->
                        <label class="field-label" for="gender">Sexe (facultatif)</label>
                        <select id="gender" v-model="form.gender" class="select">
                            <option value="">Non renseigné</option>
                            <option value="FEMALE">Fille</option>
                            <option value="MALE">Garçon</option>
                        </select>
                    </div>
                    <div>
                        <label class="field-label" for="formClass">Classe</label>
                        <select id="formClass" v-model="formClass" required class="select" @change="onFormClassChange">
                            <option value="" disabled>Choisir une classe…</option>
                            <option v-for="c in classOptions" :key="c.id" :value="c.id">
                                {{ c.name }}<template v-if="c.levelLabel"> · {{ c.levelLabel }}</template>
                            </option>
                        </select>
                    </div>
                </div>

                <p v-if="formError" class="alert-danger mt-4" role="alert">{{ formError }}</p>

                <button type="submit" :disabled="saving || !formComplete" class="btn-primary mt-4">
                    <BoIcon name="check" :size="16" />
                    {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
                </button>
            </form>
        </UiCard>

        <!-- ============ Cartes ============ -->
        <div class="grid gap-3.5 mb-3.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <template v-if="stats">
                <StatTile
                    label="Effectif total" icon="students" tone="var(--brand-600)" soft="var(--brand-50)"
                    tip="Élèves inscrits dans l'établissement, affectés à une classe ou non."
                    :value="fmt(stats.total)"
                    :foot="`${stats.classCount} classe${stats.classCount > 1 ? 's' : ''} ouverte${stats.classCount > 1 ? 's' : ''}`"
                />
                <StatTile
                    label="Nouveaux inscrits" icon="clipboard" tone="var(--brand-600)" soft="var(--brand-50)"
                    tip="Élèves inscrits depuis le premier jour du mois en cours."
                    :value="fmt(stats.newThisMonth)" foot="depuis le début du mois"
                />
                <StatTile
                    label="Dossiers incomplets" icon="alert" tone="var(--danger)" soft="var(--danger-soft)"
                    tip="Élèves à qui il manque l'extrait de naissance ou la photo d'identité. Les pièces se versent depuis la fiche de l'élève."
                    :value="fmt(stats.incompleteDossier)"
                    :foot="stats.incompleteDossier ? 'Pièces à réclamer' : 'Tous les dossiers sont complets'"
                    :foot-tone="stats.incompleteDossier ? 'var(--danger)' : 'var(--success)'"
                    :foot-icon="stats.incompleteDossier ? undefined : 'check-circle'"
                />
                <StatTile
                    label="Sans classe" icon="layers" tone="var(--purple)" soft="var(--purple-soft)"
                    tip="Élèves qui ne sont affectés à aucune classe : le reliquat de la rentrée, qu'il reste à répartir."
                    :value="fmt(stats.withoutClass)"
                    :foot="stats.withoutClass ? 'À répartir' : 'Affectation complète'"
                    :foot-tone="stats.withoutClass ? 'var(--warning)' : 'var(--success)'"
                    :foot-icon="stats.withoutClass ? undefined : 'check-circle'"
                />
                <StatTile
                    label="En retard de paiement" icon="wallet" tone="var(--warning)" soft="var(--warning-soft)"
                    tip="Élèves dont au moins une échéance est dépassée. La relance groupée se lance depuis Paiements → Relances."
                    :value="fmt(stats.overdueCount)"
                    :foot="`${compactAmount(Number(stats.overdueAmount))} FCFA à recouvrer`"
                />
            </template>
            <template v-else>
                <div v-for="n in 5" :key="n" class="card p-4">
                    <i class="sk h-3 w-24" />
                    <i class="sk h-7 w-16 mt-3" />
                </div>
            </template>
        </div>

        <!-- ============ Répartitions ============ -->
        <div v-if="stats && stats.total" class="grid gap-3.5 mb-3.5 grid-cols-1 lg:grid-cols-3">
            <UiCard title="Répartition par niveau">
                <template #action>
                    <span class="text-[11.5px]" style="color: var(--text-faint)">{{ fmt(stats.total) }} élèves</span>
                </template>
                <LevelBars :bars="levelBars" />
            </UiCard>
            <UiCard title="Répartition par sexe">
                <template #action>
                    <span class="text-[11.5px]" style="color: var(--text-faint)">{{ fmt(stats.total) }} élèves</span>
                </template>
                <DonutChart :segments="genderSegments" :center-value="fmt(stats.total)" center-label="élèves" />
            </UiCard>
            <UiCard
                title="Statut des élèves"
                tip="Chaque élève compte une fois, dans ce qui demande d'abord une action : dossier incomplet, puis retard de paiement, puis acompte en cours."
            >
                <template #action>
                    <span class="text-[11.5px]" style="color: var(--text-faint)">{{ fmt(stats.total) }} élèves</span>
                </template>
                <DonutChart :segments="statusSegments" />
            </UiCard>
        </div>

        <p v-if="loadError" class="alert-danger mb-3.5" role="alert">{{ loadError }}</p>

        <!-- ============ Liste ============ -->
        <UiCard :pad="false">
            <nav class="flex flex-wrap gap-1 px-4 pt-2" style="border-bottom: 1px solid var(--border)" aria-label="Sélection d'élèves">
                <button
                    v-for="t in tabs" :key="t.key" type="button"
                    class="px-3 py-2.5 text-[13px] font-bold -mb-px"
                    :style="tab === t.key
                        ? 'color: var(--brand-600); border-bottom: 2px solid var(--brand-600)'
                        : 'color: var(--text-muted); border-bottom: 2px solid transparent'"
                    :aria-current="tab === t.key ? 'page' : undefined"
                    @click="tab = t.key"
                >
                    {{ t.label }}<template v-if="t.count !== undefined"> ({{ fmt(t.count) }})</template>
                </button>
            </nav>

            <div class="tbar">
                <label class="inp" style="flex: 0 1 300px">
                    <BoIcon name="search" :size="15" />
                    <input
                        v-model="keyword" type="search" class="w-full"
                        placeholder="Rechercher un élève, un matricule…" aria-label="Rechercher un élève"
                    />
                </label>
                <label class="inp">
                    <select v-model="selectedLevel" aria-label="Filtrer par niveau">
                        <option value="">Tous les niveaux</option>
                        <option v-for="level in levelOptions" :key="level.id" :value="level.code">
                            {{ levelLabel(level) }}
                        </option>
                    </select>
                </label>
                <label class="inp">
                    <select v-model="selectedClass" aria-label="Filtrer par classe">
                        <option value="">Toutes les classes</option>
                        <option v-for="schoolClass in classOptions" :key="schoolClass.id" :value="schoolClass.id">
                            {{ schoolClass.name }}
                        </option>
                    </select>
                </label>
                <label class="inp">
                    <select
                        v-model="selectedStatus" aria-label="Filtrer par statut de paiement"
                        :disabled="tab === 'overdue'"
                    >
                        <option value="">Tous les statuts</option>
                        <option v-for="status in PAYMENT_STATUSES" :key="status.value" :value="status.value">
                            {{ status.label }}
                        </option>
                    </select>
                </label>
                <template v-if="showMoreFilters">
                    <label class="inp">
                        <select v-model="selectedGender" aria-label="Filtrer par sexe">
                            <option value="">Filles et garçons</option>
                            <option value="FEMALE">Filles</option>
                            <option value="MALE">Garçons</option>
                        </select>
                    </label>
                    <label class="inp">
                        <select
                            v-model="selectedDossier" aria-label="Filtrer par état du dossier"
                            :disabled="tab === 'incomplete'"
                        >
                            <option value="">Tous les dossiers</option>
                            <option value="complete">Dossier complet</option>
                            <option value="incomplete">Dossier incomplet</option>
                        </select>
                    </label>
                </template>
                <span class="flex-1" />
                <button
                    type="button" class="btn-secondary btn-sm" :aria-pressed="showMoreFilters"
                    @click="showMoreFilters = !showMoreFilters"
                >
                    <BoIcon name="filter" :size="14" />
                    {{ showMoreFilters ? 'Moins de filtres' : 'Plus de filtres' }}
                </button>
                <!-- Le fichier suit la sélection affichée : onglet et filtres compris. -->
                <a :href="exportUrl(filters)" download="eleves.csv" class="btn-secondary btn-sm">
                    <BoIcon name="download" :size="14" /> Exporter
                </a>
            </div>

            <!-- La barre de répartition.
                 Après un import, une école a des dizaines d'élèves sans classe : les affecter un
                 par un depuis leur fiche serait la même corvée que l'import devait éviter. -->
            <div
                v-if="selected.size"
                class="flex flex-wrap items-center gap-3 px-3.5 py-3 mx-4 my-3"
                style="background: var(--brand-50); border: 1px solid var(--brand-200);
                       border-radius: var(--radius)"
            >
                <span class="text-[13px] font-semibold">
                    {{ selected.size }} élève{{ selected.size > 1 ? 's' : '' }} sélectionné{{ selected.size > 1 ? 's' : '' }}
                </span>
                <label class="inp">
                    <select v-model="targetClass" aria-label="Classe de destination">
                        <option value="">Affecter à la classe…</option>
                        <option v-for="schoolClass in classOptions" :key="schoolClass.id" :value="schoolClass.id">
                            {{ schoolClass.name }}
                        </option>
                    </select>
                </label>
                <button
                    class="btn-primary btn-sm" :disabled="!targetClass || assigning"
                    @click="assignSelection"
                >
                    {{ assigning ? 'Affectation…' : 'Affecter' }}
                </button>
                <button class="btn-ghost btn-sm" @click="selected.clear()">Annuler</button>
                <span v-if="assignError" class="text-[12.5px]" style="color: var(--danger)">
                    {{ assignError }}
                </span>
            </div>

            <div class="table-wrap" style="border: 0; box-shadow: none; border-radius: 0">
                <table class="table">
                    <thead>
                        <tr>
                            <th style="width: 1%">
                                <input
                                    type="checkbox" aria-label="Tout sélectionner"
                                    :checked="allOnPageSelected"
                                    :indeterminate.prop="someOnPageSelected && !allOnPageSelected"
                                    @change="toggleAll"
                                />
                            </th>
                            <th>Élève</th>
                            <th>Matricule</th>
                            <th>Niveau</th>
                            <th>Classe</th>
                            <th>Statut paiement</th>
                            <th class="r">Solde (F)</th>
                            <th>Dossier</th>
                            <th class="r">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <TableSkeleton v-if="loading" :columns="9" />
                        <tr
                            v-for="student in students" v-else :key="student.id"
                            class="cl" @click="opened = student"
                        >
                            <!-- `@click.stop` : cocher une case ne doit pas ouvrir la fiche. -->
                            <td @click.stop>
                                <input
                                    type="checkbox" :aria-label="`Sélectionner ${student.lastName}`"
                                    :checked="selected.has(student.id)"
                                    @change="toggleOne(student.id)"
                                />
                            </td>
                            <td>
                                <div class="flex items-center gap-2.5">
                                    <AvatarBadge
                                        :name="`${student.firstName} ${student.lastName}`"
                                        :src="studentPhotoUrl(student)" :size="32"
                                    />
                                    <div class="nm min-w-0">
                                        <b>{{ student.lastName }} {{ student.firstName }}</b>
                                        <span class="nu">{{ formatDate(student.birthDay) }}</span>
                                    </div>
                                </div>
                            </td>
                            <td class="nu text-[12.5px]" style="color: var(--text-muted)">
                                {{ student.registrationNumber }}
                            </td>
                            <td class="text-[12.5px]" style="color: var(--text-muted)">
                                {{ levelLabel(student.levelOfStudy) }}
                            </td>
                            <td>
                                <span v-if="student.schoolClass" class="tag">{{ student.schoolClass.name }}</span>
                                <span v-else class="text-[11.5px]" style="color: var(--text-faint)">Sans classe</span>
                            </td>
                            <td>
                                <UiPill :tone="paymentPill(student).tone">{{ paymentPill(student).label }}</UiPill>
                            </td>
                            <td
                                class="num font-extrabold"
                                :style="Number(student.outstandingAmount ?? 0) > 0 ? 'color: var(--navy)' : 'color: var(--text-faint)'"
                            >
                                {{ fmt(student.outstandingAmount) }}
                            </td>
                            <td>
                                <UiPill :tone="student.dossierComplete ? 'ok' : 'late'">
                                    {{ student.dossierComplete ? 'Complet' : 'Incomplet' }}
                                </UiPill>
                            </td>
                            <td class="text-right relative" @click.stop>
                                <button
                                    type="button" class="btn-ghost btn-sm" :aria-label="`Actions pour ${student.lastName}`"
                                    :aria-expanded="menuFor === student.id"
                                    @click.stop="menuFor = menuFor === student.id ? null : student.id"
                                >⋯</button>
                                <div
                                    v-if="menuFor === student.id"
                                    class="absolute right-2 top-full z-20 card py-1 min-w-[190px] text-left"
                                    style="box-shadow: 0 8px 24px rgba(11,46,102,.14)" role="menu"
                                >
                                    <button
                                        type="button" role="menuitem"
                                        class="block w-full text-left px-3 py-2 text-[12.5px] hover:bg-[var(--surface-sunken)]"
                                        @click="closeMenu(); opened = student"
                                    >Ouvrir la fiche</button>
                                    <button
                                        v-if="can('collection:write')" type="button" role="menuitem"
                                        class="block w-full text-left px-3 py-2 text-[12.5px] hover:bg-[var(--surface-sunken)]"
                                        @click="openGuichet(student)"
                                    >Encaisser au guichet</button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <EmptyState
                v-if="!loading && !students.length && (stats?.total ?? 0) > 0"
                title="Aucun résultat"
                text="Aucun élève ne correspond à cette sélection."
            />
            <EmptyState
                v-else-if="!loading && !students.length"
                title="Aucun élève inscrit"
                text="Ajoutez vos élèves un par un, ou importez la liste complète depuis un fichier CSV."
            />

            <template #footer>
                <span class="text-[12px]" style="color: var(--text-faint)">
                    <b class="nu" style="color: var(--navy)">{{ students.length }}</b> affichés sur
                    <b class="nu" style="color: var(--navy)">{{ fmt(totalElements) }}</b>
                </span>
                <span v-if="totalPages > 1" class="flex items-center gap-2">
                    <button class="btn-secondary btn-sm" :disabled="page === 0" @click="changePage(-1)">
                        Précédent
                    </button>
                    <span class="text-[12px]" style="color: var(--text-faint)">
                        {{ page + 1 }} / {{ totalPages }}
                    </span>
                    <button
                        class="btn-secondary btn-sm" :disabled="page >= totalPages - 1"
                        @click="changePage(1)"
                    >Suivant</button>
                </span>
            </template>
        </UiCard>

        <!-- `@updated` : la fiche modifiée doit se répercuter sur la liste et sur les chiffres. -->
        <StudentDrawer
            v-if="opened" :student="opened"
            @close="opened = null" @updated="refresh"
        />
    </div>
</template>
