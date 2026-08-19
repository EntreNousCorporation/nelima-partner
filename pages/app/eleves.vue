<script setup lang="ts">
import { levelLabel, type Gender, type LevelOfStudy, type Student } from '~/composables/useStudents';

/**
 * Statut de règlement d'un élève, déduit de son solde.
 *
 * Trois états et pas deux : devoir une somme échue n'est pas devoir une somme à venir. Le premier
 * appelle une relance, le second se règle tout seul.
 */
function paymentState(student: Student) {
    const outstanding = Number(student.outstandingAmount ?? 0);
    const overdue = Number(student.overdueAmount ?? 0);
    if (overdue > 0) return { label: 'En retard', tone: 'late' as const };
    if (outstanding > 0) return { label: 'À échoir', tone: 'warn' as const };
    return { label: 'À jour', tone: 'ok' as const };
}
import { type SchoolClass } from '~/composables/useClasses';

import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
const { search, establishmentLevels, create } = useStudents();
const { assign: assignToClass } = useClasses();

const students = ref<Student[]>([]);
const levelOptions = ref<LevelOfStudy[]>([]);
const page = ref(0);
const size = 20;
const totalElements = ref(0);
const totalPages = ref(0);
const selectedLevel = ref<string>('');
const selectedClass = ref<string>('');
const keyword = ref('');
const classOptions = ref<SchoolClass[]>([]);
const formClass = ref<string>('');
const loading = ref(false);
const loadError = ref('');

/** Élève dont la fiche est ouverte en tiroir. */
const opened = ref<Student | null>(null);

const { can } = usePermissions();

/**
 * Cartes de tête.
 *
 * Les trois premières se déduisent de ce que l'écran charge déjà ; la quatrième vient du tableau
 * de bord, seul endroit qui agrège les retards. Aucune n'est inventée : une carte « départs
 * depuis la rentrée », proposée par la maquette, supposerait une notion de radiation que le
 * produit n'a pas — elle est donc absente plutôt que remplie d'un zéro trompeur.
 */
const withoutClass = computed(() => students.value.filter((row) => !row.schoolClass).length);
const overdue = ref<{ count: number; amount: number } | null>(null);

async function loadOverdue() {
    if (!can('accounting:read')) return;
    try {
        const summary = await useApi()<{ overdueCount: number; overdueAmount: number }>(
            '/dashboard/summary');
        overdue.value = { count: summary.overdueCount, amount: summary.overdueAmount };
    } catch {
        overdue.value = null;
    }
}

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
        await load();
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
        await load();
    } catch (e: any) {
        assignError.value = e?.data?.debugMessage ?? "L'affectation n'a pas pu être enregistrée.";
    } finally {
        assigning.value = false;
    }
}

const showForm = ref(false);
const saving = ref(false);
const formError = ref('');
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
        const result = await search({
            page: page.value,
            size,
            levelOfStudies: selectedLevel.value ? [selectedLevel.value] : undefined,
            keyword: keyword.value || undefined,
            schoolClassId: selectedClass.value && selectedClass.value !== 'none'
                ? selectedClass.value : undefined,
            unassignedOnly: selectedClass.value === 'none',
        });
        students.value = result.content ?? [];
        totalElements.value = result.totalElements ?? 0;
        totalPages.value = result.totalPages ?? 0;
    } catch (e: any) {
        loadError.value = "La liste n'a pas pu être chargée.";
        students.value = [];
    } finally {
        loading.value = false;
    }
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
        await load();
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

watch([selectedLevel, selectedClass], () => { page.value = 0; load(); });

onMounted(async () => {
    // La barre supérieure envoie ici avec sa recherche : la reprendre évite de la retaper.
    const requested = useRoute().query.q;
    if (typeof requested === 'string' && requested) keyword.value = requested;

    try {
        levelOptions.value = await establishmentLevels(auth.user?.establishmentId);
    } catch {
        levelOptions.value = [];
    }
    try {
        classOptions.value = await useClasses().list();
    } catch {
        classOptions.value = [];
    }
    await load();
    await loadOverdue();
});
</script>

<template>
    <div>
        <PageHead
            title="Élèves"
            :sub="`${totalElements} élève${totalElements > 1 ? 's' : ''} inscrit${totalElements > 1 ? 's' : ''}`"
        >
            <template #actions>
                <button class="btn-secondary" @click="showImport = !showImport; showForm = false">
                    <BoIcon :name="showImport ? 'close' : 'upload'" :size="16" />
                    {{ showImport ? 'Annuler' : 'Importer / exporter' }}
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

        <div class="grid-12 mb-3.5">
            <KpiCard
                class="c3" label="Effectif total" icon="students"
                tip="Élèves inscrits dans l'établissement, affectés à une classe ou non."
                :value="fm(totalElements)"
                :foot="`${classOptions.length} classe(s) ouverte(s)`"
            />
            <KpiCard
                class="c3" label="Niveaux déclarés" icon="layers"
                tip="Niveaux retenus dans les paramètres. Un élève ne peut être inscrit que dans l'un d'eux, et les frais s'y ciblent."
                :value="String(levelOptions.length)"
                foot="un élève ne s'inscrit que dans un niveau déclaré"
            />
            <KpiCard
                class="c3" label="Sans classe" icon="alert"
                tip="Élèves de la page affichée qui ne sont affectés à aucune classe. C'est le reliquat de la rentrée, qu'il reste à répartir."
                :value="String(withoutClass)"
                :value-tone="withoutClass ? 'var(--warning)' : undefined"
                foot="à répartir sur la page affichée"
            />
            <KpiCard
                v-if="overdue" class="c3" label="Familles en retard" icon="cash"
                tip="Élèves dont au moins une échéance est dépassée. La relance groupée se lance depuis Paiements → Relances."
                :value="String(overdue.count)"
                :foot="`${fm(overdue.amount)} F à recouvrer`"
            />
            <KpiCard
                v-else class="c3" label="Classes" icon="layers"
                :value="String(classOptions.length)"
                foot="salles ouvertes cette année"
            />
        </div>

        <p v-if="loadError" class="alert-danger mb-3.5" role="alert">{{ loadError }}</p>

        <UiCard :pad="false">
            <div class="tbar">
                <label class="inp" style="flex: 0 1 260px">
                    <BoIcon name="search" :size="15" />
                    <input
                        v-model="keyword" type="search" class="w-full"
                        placeholder="Nom, prénom ou matricule…" aria-label="Rechercher un élève"
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
                        <!-- « Sans classe » est le filtre utile de la rentrée : ce sont les élèves
                             qu'il reste à répartir. -->
                        <option value="none">Sans classe</option>
                        <option v-for="schoolClass in classOptions" :key="schoolClass.id" :value="schoolClass.id">
                            {{ schoolClass.name }}
                        </option>
                    </select>
                </label>
            </div>

            <!-- La barre de répartition.
                 Après un import, une école a des dizaines d'élèves sans classe : les affecter un
                 par un depuis leur fiche serait la même corvée que l'import devait éviter. -->
            <div
                v-if="selected.size"
                class="flex flex-wrap items-center gap-3 px-3.5 py-3 mb-3"
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
                            <th class="r">Solde dû</th>
                            <th>Statut</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <TableSkeleton v-if="loading" :columns="8" />
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
                                    <AvatarBadge :name="`${student.firstName} ${student.lastName}`" :size="28" />
                                    <div class="nm min-w-0">
                                        <b>{{ student.lastName }} {{ student.firstName }}</b>
                                        <span class="nu">{{ formatDate(student.birthDay) }}</span>
                                    </div>
                                </div>
                            </td>
                            <td class="nu text-[12px]" style="color: var(--text-faint)">
                                {{ student.registrationNumber }}
                            </td>
                            <td><span class="tag">{{ levelLabel(student.levelOfStudy) }}</span></td>
                            <td>
                                <span v-if="student.schoolClass" class="tag">
                                    {{ student.schoolClass.name }}
                                </span>
                                <span v-else class="text-[11.5px]" style="color: var(--text-faint)">
                                    Sans classe
                                </span>
                            </td>
                            <!-- Le solde en rouge dès qu'une échéance est passée : c'est ce qui
                                 distingue la famille à relancer de celle qui a un acompte en cours. -->
                            <td
                                class="num" :style="Number(student.overdueAmount ?? 0) > 0
                                    ? 'color: var(--danger)' : 'color: var(--text-faint)'"
                            >
                                {{ Number(student.outstandingAmount ?? 0) > 0
                                    ? `${fm(Number(student.outstandingAmount))} F` : '—' }}
                            </td>
                            <td>
                                <UiPill :tone="paymentState(student).tone">
                                    {{ paymentState(student).label }}
                                </UiPill>
                            </td>
                            <td class="text-right">
                                <BoIcon name="chevron-right" :size="16" />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <EmptyState
                v-if="!loading && !students.length && (keyword || selectedLevel)"
                title="Aucun résultat"
                text="Aucun élève ne correspond à cette recherche."
            />
            <EmptyState
                v-else-if="!loading && !students.length"
                title="Aucun élève inscrit"
                text="Ajoutez vos élèves un par un, ou importez la liste complète depuis un fichier CSV."
            />

            <template #footer>
                <span class="text-[12px]" style="color: var(--text-faint)">
                    <b class="nu" style="color: var(--navy)">{{ students.length }}</b> affichés sur
                    <b class="nu" style="color: var(--navy)">{{ totalElements }}</b>
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

        <!-- `@updated` : la fiche modifiée doit se répercuter sur la liste, qui porterait sinon
             encore l'ancien nom. -->
        <StudentDrawer
            v-if="opened" :student="opened"
            @close="opened = null" @updated="load"
        />
    </div>
</template>
