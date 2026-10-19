<script setup lang="ts">
import {
    DIETS, MENU_ALLERGENS, WEEKDAYS, dietLabel, dietTone, formulaDays, formulaDaysLong, isoDay,
    type CanteenFormula, type CanteenOverview, type CanteenSubscriber, type DietKind, type MenuDay,
} from '~/composables/useCanteen';
import { boAmount, fmtNumber as fmt, pillStyle } from '~/composables/useBoTones';
import { PAYMENT_STATUSES, studentPhotoUrl, type Student } from '~/composables/useStudents';

/**
 * La cantine de l'école, au dessin de la maquette : qui mange, ce qu'on sert, ce que la cuisine
 * doit savoir, ce qui reste dû.
 *
 * Le pointage ne demande que les exceptions : un abonné est servi les jours de sa formule ; on
 * signale un absent, ou on marque servi un élève ponctuel. Le reste du midi se fait sans clic.
 */
const canteen = useCanteen();
const { search } = useStudents();
const { can } = usePermissions();
const consultedYear = useConsultedYear();

const today = isoDay(new Date());
const overview = ref<CanteenOverview | null>(null);
const rows = ref<CanteenSubscriber[]>([]);
const formulas = ref<CanteenFormula[]>([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const keyword = ref('');
const page = ref(0);
const PAGE_SIZE = 12;

const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const ddmm = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
const paymentOf = (status: string) => PAYMENT_STATUSES.find((p) => p.value === status) ?? PAYMENT_STATUSES[0]!;
const plural = (n: number | undefined, word: string) => `${word}${(n ?? 0) > 1 ? 's' : ''}`;

const filtered = computed(() => {
    const q = keyword.value.trim().toLowerCase();
    if (!q) return rows.value;
    return rows.value.filter((r) => r.studentName.toLowerCase().includes(q)
        || r.registrationNumber.toLowerCase().includes(q) || (r.className ?? '').toLowerCase().includes(q));
});
const pageRows = computed(() => filtered.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE));
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)));
watch(keyword, () => { page.value = 0; });

async function load() {
    loading.value = true;
    error.value = '';
    try {
        const [o, s, f] = await Promise.all([canteen.overview(today), canteen.subscribers(today), canteen.formulas()]);
        overview.value = o;
        rows.value = s;
        formulas.value = f;
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "La cantine n'a pas pu être chargée.";
    } finally {
        loading.value = false;
    }
}

function fail(e: any, message: string) {
    error.value = e?.data?.debugMessage ?? message;
}

/* ---------------- Pointage ---------------- */
async function toggleToday(row: CanteenSubscriber) {
    if (!can('canteen:write')) return;
    // Servi → absent ; absent → retour à la règle ; non attendu (ponctuel) → servi.
    const next = row.today === 'SERVED' ? (row.expectedToday ? 'ABSENT' : null)
        : row.today === 'ABSENT' ? null : 'SERVED';
    try {
        await canteen.mark(row.studentId, today, next);
        await load();
    } catch (e) {
        fail(e, "Le pointage n'a pas pu être enregistré.");
    }
}

/* ---------------- Menu ---------------- */
function mondayOf(iso: string) {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return isoDay(d);
}
function plusDays(iso: string, days: number) {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + days);
    return isoDay(d);
}

const week = ref<MenuDay[]>([]);
const weekStart = ref(mondayOf(today));
const selectedDay = ref(0);
const weekPublished = computed(() => week.value.some((d) => d.published));
function weekLabel(monday: string) {
    const start = new Date(`${monday}T12:00:00`);
    const end = new Date(`${plusDays(monday, 4)}T12:00:00`);
    const month = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'long' });
    return start.getMonth() === end.getMonth()
        ? `du ${start.getDate()} au ${end.getDate()} ${month(end)}`
        : `du ${start.getDate()} ${month(start)} au ${end.getDate()} ${month(end)}`;
}
const shownDay = computed(() => week.value[selectedDay.value]);

async function loadMenu() {
    try {
        week.value = await canteen.menu(weekStart.value);
        const index = week.value.findIndex((d) => d.day === today);
        selectedDay.value = index >= 0 ? index : 0;
    } catch (e) {
        fail(e, "Le menu n'a pas pu être chargé.");
    }
}

type MenuForm = { day: string; starter: string; mainCourse: string; dessert: string; vegetarianAlternative: string; allergens: string[]; closed: boolean };
const menuOpen = ref(false);
const menuWeek = ref(weekStart.value);
const menuForm = ref<MenuForm[]>([]);
const menuDay = ref(0);
const savingMenu = ref(false);
const editedDay = computed(() => menuForm.value[menuDay.value]);

const toForm = (days: MenuDay[]): MenuForm[] => days.map((d) => ({
    day: d.day, starter: d.starter ?? '', mainCourse: d.mainCourse ?? '', dessert: d.dessert ?? '',
    vegetarianAlternative: d.vegetarianAlternative ?? '', allergens: [...d.allergens], closed: d.closed,
}));

async function openMenu(monday = weekStart.value) {
    try {
        const current = monday === weekStart.value;
        menuForm.value = toForm(current ? week.value : await canteen.menu(monday));
        menuWeek.value = monday;
        menuDay.value = current ? selectedDay.value : 0;
        menuOpen.value = true;
    } catch (e) {
        fail(e, "Le menu n'a pas pu être chargé.");
    }
}

/** Reprend le menu de la semaine précédente, jour pour jour ; rien n'est enregistré avant validation. */
async function copyPreviousWeek() {
    try {
        const previous = await canteen.menu(plusDays(menuWeek.value, -7));
        menuForm.value = toForm(previous).map((d, i) => ({ ...d, day: menuForm.value[i]?.day ?? d.day }));
    } catch (e) {
        fail(e, "La semaine précédente n'a pas pu être chargée.");
    }
}

const dayFilled = (d: MenuForm) => d.closed || !!d.mainCourse.trim();

function toggleAllergen(label: string) {
    const day = editedDay.value;
    if (!day) return;
    day.allergens = day.allergens.includes(label) ? day.allergens.filter((a) => a !== label) : [...day.allergens, label];
}

const dietCount = (kind: DietKind) => overview.value?.diets.find((d) => d.kind === kind)?.count ?? 0;
const allergyWarnings = computed(() => (editedDay.value?.closed ? [] : MENU_ALLERGENS
    .filter((a) => editedDay.value?.allergens.includes(a.label) && dietCount(a.diet) > 0)
    .map((a) => ({ count: dietCount(a.diet), of: a.of }))));

async function saveMenu(publish: boolean) {
    savingMenu.value = true;
    try {
        await canteen.saveMenu(menuForm.value);
        await canteen.publishMenu(menuWeek.value, publish);
        menuOpen.value = false;
        notice.value = publish ? 'Menu publié : les familles le voient dans l’application.' : 'Brouillon enregistré : les familles ne le voient pas encore.';
        await Promise.all([loadMenu(), load()]);
    } catch (e) {
        fail(e, "Le menu n'a pas pu être enregistré.");
    } finally {
        savingMenu.value = false;
    }
}

function escapeHtml(value?: string | null) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

function printWindow(title: string, body: string) {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8">'
        + `<title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111}`
        + 'h1{font-size:18px}table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border:1px solid #999;padding:6px 8px;text-align:left;vertical-align:top}'
        + 'th{background:#f0f0f0}.s{color:#555;font-size:12px}h2{font-size:14px;margin:16px 0 6px}</style></head><body>'
        + body + '</body></html>');
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 150);
}

function printMenu() {
    const rowsHtml = week.value.map((d, i) => `<tr><th>${escapeHtml(WEEKDAYS[i]?.label)} ${escapeHtml(shortDay(d.day))}</th>`
        + (d.closed ? '<td colspan="5">Pas de service</td>'
            : `<td>${escapeHtml(d.starter)}</td><td>${escapeHtml(d.mainCourse)}</td><td>${escapeHtml(d.dessert)}</td>`
            + `<td>${escapeHtml(d.vegetarianAlternative)}</td><td>${escapeHtml(d.allergens.join(', '))}</td>`) + '</tr>').join('');
    printWindow('Menu de la semaine', `<h1>Menu de la semaine ${escapeHtml(weekLabel(weekStart.value))}</h1>`
        + '<table><thead><tr><th>Jour</th><th>Entrée</th><th>Plat</th><th>Dessert</th><th>Alternative végétarienne</th><th>Allergènes</th></tr></thead>'
        + `<tbody>${rowsHtml}</tbody></table>`);
}

async function printKitchen() {
    try {
        const lines = await canteen.kitchenSheet(today);
        const body = lines.length ? lines.map((line) => `<h2>${escapeHtml(dietLabel(line.kind))} (${line.students.length})</h2><table><tbody>`
            + line.students.map((s) => `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.className)}</td><td>${escapeHtml(s.label)}</td></tr>`).join('')
            + '</tbody></table>').join('') : '<p>Aucun régime particulier parmi les élèves servis.</p>';
        printWindow('Fiche cuisine', `<h1>Fiche cuisine — ${escapeHtml(shortDay(today))}</h1>`
            + `<p class="s">${fmt(overview.value?.servedToday)} repas attendus. Les allergies sont à traiter comme des dangers.</p>${body}`);
    } catch (e) {
        fail(e, "La fiche cuisine n'a pas pu être préparée.");
    }
}

/* ---------------- Formules ---------------- */
const formulasOpen = ref(false);
const editingFormula = ref<CanteenFormula | null>(null);
const formulaForm = reactive({ name: '', days: [] as string[], monthlyPrice: '' as string | number, active: true });

function editFormula(formula?: CanteenFormula) {
    editingFormula.value = formula ?? null;
    Object.assign(formulaForm, formula
        ? { name: formula.name, days: [...formula.days], monthlyPrice: formula.monthlyPrice, active: formula.active }
        : { name: '', days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'], monthlyPrice: '', active: true });
}

function toggleFormulaDay(day: string) {
    formulaForm.days = formulaForm.days.includes(day) ? formulaForm.days.filter((d) => d !== day) : [...formulaForm.days, day];
}

async function saveFormula() {
    const body = { name: formulaForm.name, days: formulaForm.days, monthlyPrice: Number(formulaForm.monthlyPrice), active: formulaForm.active };
    try {
        if (editingFormula.value) await canteen.updateFormula(editingFormula.value.id, body);
        else await canteen.createFormula(body);
        formulas.value = await canteen.formulas();
        if (!pickedFormula.value) pickedFormula.value = activeFormulas.value[0]?.id ?? '';
        editFormula();
        notice.value = 'Formule enregistrée.';
    } catch (e) {
        fail(e, "La formule n'a pas pu être enregistrée.");
    }
}

/* ---------------- Inscription ---------------- */
const subscribeOpen = ref(false);
const studentQuery = ref('');
const candidates = ref<Student[]>([]);
const picked = ref<Student | null>(null);
const pickedFormula = ref('');
const startDate = ref(today);
const pickedDiets = ref<DietKind[]>([]);
const initialDiets = ref<DietKind[]>([]);
const notifyFamily = ref(true);
const subscribing = ref(false);
let debounce: ReturnType<typeof setTimeout> | undefined;

const activeFormulas = computed(() => formulas.value.filter((f) => f.active));
const chosenFormula = computed(() => formulas.value.find((f) => f.id === pickedFormula.value));

async function findCandidates(value: string) {
    try {
        const subscribed = new Set(rows.value.map((r) => r.studentId));
        candidates.value = ((await search({ page: 0, size: 12, keyword: value.trim() || undefined })).content ?? [])
            .filter((s) => !subscribed.has(s.id)).slice(0, 5);
    } catch {
        candidates.value = [];
    }
}

watch(studentQuery, (value) => {
    clearTimeout(debounce);
    if (picked.value) return;
    debounce = setTimeout(() => findCandidates(value), 250);
});

function openSubscribe() {
    picked.value = null;
    studentQuery.value = '';
    pickedFormula.value = activeFormulas.value[0]?.id ?? '';
    startDate.value = today;
    pickedDiets.value = [];
    initialDiets.value = [];
    notifyFamily.value = true;
    subscribeOpen.value = true;
    findCandidates('');
}

async function pick(student: Student) {
    picked.value = student;
    candidates.value = [];
    try {
        pickedDiets.value = (await canteen.diets(student.id)).map((d) => d.kind);
    } catch {
        pickedDiets.value = [];
    }
    initialDiets.value = [...pickedDiets.value];
}

function unpick() {
    picked.value = null;
    findCandidates(studentQuery.value);
}

function toggleDiet(kind: DietKind) {
    pickedDiets.value = pickedDiets.value.includes(kind) ? pickedDiets.value.filter((d) => d !== kind) : [...pickedDiets.value, kind];
}

/** Les mois facturés, du mois d'arrivée à la fin de l'année : la règle du serveur. */
const billing = computed(() => {
    const price = Number(chosenFormula.value?.monthlyPrice ?? 0);
    const end = consultedYear.consulted.value?.endDate;
    if (!startDate.value || !end) return null;
    const start = new Date(`${startDate.value}T12:00:00`);
    const last = new Date(`${end}T12:00:00`);
    const months = Math.max(0, (last.getFullYear() - start.getFullYear()) * 12 + last.getMonth() - start.getMonth() + 1);
    const firstDue = start.getDate() > 5 ? startDate.value : isoDay(new Date(start.getFullYear(), start.getMonth(), 5));
    return { months, total: months * price, firstDue };
});

async function subscribe() {
    if (!picked.value || !pickedFormula.value) return;
    subscribing.value = true;
    try {
        const student = picked.value;
        const dietsChanged = pickedDiets.value.length !== initialDiets.value.length
            || pickedDiets.value.some((d) => !initialDiets.value.includes(d));
        if (dietsChanged) await canteen.saveDiets(student.id, pickedDiets.value.map((kind) => ({ kind })));
        await canteen.subscribe({ studentId: student.id, formulaId: pickedFormula.value, startDate: startDate.value, notifyFamily: notifyFamily.value });
        notice.value = `${student.lastName} ${student.firstName} est inscrit à la cantine ; ses mois sont facturés jusqu'à la fin de l'année.`;
        subscribeOpen.value = false;
        await load();
    } catch (e) {
        fail(e, "L'inscription n'a pas pu être enregistrée.");
    } finally {
        subscribing.value = false;
    }
}

/* ---------------- Abonnement d'un élève ---------------- */
const opened = ref<CanteenSubscriber | null>(null);
async function endSubscription() {
    const row = opened.value;
    if (!row) return;
    try {
        await canteen.end(row.subscriptionId, today);
        opened.value = null;
        notice.value = `Abonnement de ${row.studentName} arrêté : les mois suivants ne sont plus dus.`;
        await load();
    } catch (e) {
        fail(e, "L'abonnement n'a pas pu être arrêté.");
    }
}

function exportCsv() {
    const header = ['Élève', 'Matricule', 'Classe', 'Formule', 'Régime', 'Paiement'];
    const lines = filtered.value.map((r) => [r.studentName, r.registrationNumber, r.className ?? '', r.formulaName,
        r.diets.map((d) => dietLabel(d.kind, d.label)).join(' / '), paymentOf(r.paymentStatus).label]);
    const csv = '﻿' + [header, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'cantine.csv';
    link.click();
}

onMounted(() => Promise.all([load(), loadMenu()]));
</script>

<template>
    <div class="bo-page">
        <div class="ph">
            <div>
                <h1>Cantine</h1>
                <p>
                    {{ fmt(overview?.subscribers) }} {{ plural(overview?.subscribers, 'élève') }} {{ plural(overview?.subscribers, 'inscrit') }}<template v-if="consultedYear.consulted.value"> · Année {{ consultedYear.consulted.value.label }}</template> · semaine {{ weekLabel(weekStart) }}
                </p>
            </div>
            <div class="acts">
                <button type="button" class="btn out" @click="printMenu"><BoIcon name="printer" :size="16" />Imprimer le menu</button>
                <button v-if="can('canteen:write')" type="button" class="btn out" @click="openMenu()"><BoIcon name="edit" :size="16" />Définir le menu</button>
                <button v-if="can('canteen:write')" type="button" class="btn pr" @click="openSubscribe"><BoIcon name="plus" :size="16" />Inscrire un élève</button>
            </div>
        </div>

        <p v-if="error" class="alert-danger" style="margin-bottom: 14px" role="alert">{{ error }}</p>
        <p v-if="notice" class="alert-success" style="margin-bottom: 14px">{{ notice }}</p>

        <!-- ============ Chiffres ============ -->
        <div class="grid" style="margin-bottom: 14px">
            <div class="card kpi c3">
                <div class="lb">
                    <BoIcon name="utensils" :size="14" :stroke-width="2" />Inscrits cantine
                    <span class="info-dot" data-tip="Élèves abonnés à une formule cantine aujourd’hui." tabindex="0" role="note" aria-label="Élèves abonnés à une formule cantine aujourd’hui.">?</span>
                </div>
                <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 10px">
                    <div style="min-width: 0">
                        <div class="vl">{{ fmt(overview?.subscribers) }}</div>
                        <div class="ft">{{ overview?.shareOfEnrollment ?? 0 }} % de l’effectif</div>
                    </div>
                </div>
            </div>
            <div class="card kpi c3">
                <div class="lb">
                    <BoIcon name="circle-check" :size="14" :stroke-width="2" />Repas servis aujourd’hui
                    <span class="info-dot" data-tip="Abonnés attendus aujourd’hui, moins les absents signalés, plus les repas ponctuels pointés." tabindex="0" role="note" aria-label="Abonnés attendus aujourd’hui, moins les absents signalés, plus les repas ponctuels pointés.">?</span>
                </div>
                <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 10px">
                    <div style="min-width: 0">
                        <div class="vl">{{ fmt(overview?.servedToday) }}</div>
                        <div class="ft">{{ overview?.absentToday ?? 0 }} {{ plural(overview?.absentToday, 'absent') }} {{ plural(overview?.absentToday, 'signalé') }}</div>
                    </div>
                </div>
            </div>
            <div class="card kpi c3">
                <div class="lb">
                    <BoIcon name="alert" :size="14" :stroke-width="2" />Régimes particuliers
                    <span class="info-dot" data-tip="Élèves inscrits avec un régime ou une allergie au dossier. La liste part chaque matin en cuisine (fiche cuisine)." tabindex="0" role="note" aria-label="Élèves inscrits avec un régime ou une allergie au dossier. La liste part chaque matin en cuisine (fiche cuisine).">?</span>
                </div>
                <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 10px">
                    <div style="min-width: 0">
                        <div class="vl">{{ fmt(overview?.studentsWithDiet) }}</div>
                        <div class="ft">{{ overview?.allergies ?? 0 }} {{ plural(overview?.allergies, 'allergie') }} {{ plural(overview?.allergies, 'déclarée') }}</div>
                    </div>
                </div>
            </div>
            <div class="card kpi c3">
                <div class="lb"><BoIcon name="card" :size="14" :stroke-width="2" />Impayés cantine</div>
                <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 10px">
                    <div style="min-width: 0">
                        <div class="vl">{{ boAmount(overview?.unpaidAmount) }}<small>FCFA</small></div>
                        <div class="ft">
                            {{ overview?.unpaidStudents ?? 0 }} {{ plural(overview?.unpaidStudents, 'élève') }}<template v-if="overview?.nextDueDate"> · échéance le {{ ddmm(overview.nextDueDate) }}</template>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ============ Menu & régimes ============ -->
        <div class="grid" style="margin-bottom: 14px">
            <section class="card c8">
                <div class="card-h">
                    <div>
                        <h3>Menu de la semaine</h3>
                        <div class="sub">{{ weekPublished ? 'Publié · visible par les familles dans l’application' : 'Brouillon · les familles ne le voient pas encore' }}</div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center">
                        <span class="pill" :style="pillStyle(weekPublished ? 'ok' : 'warn')">{{ weekPublished ? 'Publié' : 'Brouillon' }}</span>
                        <button v-if="can('canteen:write')" type="button" class="btn out sm" @click="openMenu()"><BoIcon name="edit" :size="15" />Modifier</button>
                    </div>
                </div>
                <div class="sv-days">
                    <button
                        v-for="(d, i) in week" :key="d.day" type="button"
                        :aria-current="selectedDay === i ? 'page' : undefined" @click="selectedDay = i"
                    >
                        <b>{{ WEEKDAYS[i]?.label }}</b>
                        <span class="nu">{{ shortDay(d.day) }}</span>
                    </button>
                </div>
                <template v-if="shownDay">
                    <div v-if="shownDay.closed" class="sv-menu">
                        <div style="grid-column: span 2"><span>Pas de service</span><b>Aucun repas ce jour-là</b></div>
                    </div>
                    <div v-else class="sv-menu">
                        <div><span>Entrée</span><b>{{ shownDay.starter || '—' }}</b></div>
                        <div><span>Plat</span><b>{{ shownDay.mainCourse || '—' }}</b></div>
                        <div><span>Dessert</span><b>{{ shownDay.dessert || '—' }}</b></div>
                        <div><span>Alternative végétarienne</span><b>{{ shownDay.vegetarianAlternative || '—' }}</b></div>
                    </div>
                    <div v-if="!shownDay.closed && shownDay.allergens.length" style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 11px 15px; border-top: 1px solid var(--bd)">
                        <span style="font: 600 12px / 1 Inter; color: var(--tx3)">Allergènes :</span>
                        <span v-for="a in shownDay.allergens" :key="a" class="pill" :style="pillStyle('warn')">{{ a }}</span>
                    </div>
                </template>
            </section>

            <section class="card c4">
                <div class="card-h">
                    <div>
                        <h3>Régimes &amp; allergies</h3>
                        <div class="sub">Liste du jour transmise à la cuisine</div>
                    </div>
                </div>
                <div v-for="d in overview?.diets ?? []" :key="d.kind" class="sv-row">
                    <span class="pill" :style="pillStyle(dietTone(d.kind))">{{ dietLabel(d.kind) }}</span>
                    <b class="nu">{{ d.count }}</b>
                </div>
                <div v-if="overview && !overview.diets.length" class="sv-row">
                    <span style="font: 500 12.5px / 1.4 Inter; color: var(--tx3)">Aucun régime déclaré. Ils se saisissent dans la fiche de l’élève.</span>
                </div>
                <div class="card-f">
                    <span style="font: 500 12px / 1.4 Inter; color: var(--tx3)">Mis à jour depuis les dossiers élèves</span>
                    <button type="button" class="btn out sm" @click="printKitchen"><BoIcon name="printer" :size="15" />Fiche cuisine</button>
                </div>
            </section>
        </div>

        <!-- ============ Inscrits ============ -->
        <section class="card">
            <div class="card-h">
                <div><h3>Élèves inscrits</h3></div>
                <div style="display: flex; gap: 8px">
                    <button v-if="can('canteen:write')" type="button" class="btn out sm" @click="openSubscribe"><BoIcon name="plus" :size="15" />Inscrire</button>
                    <button type="button" class="btn out sm" @click="exportCsv"><BoIcon name="download" :size="15" />Exporter</button>
                </div>
            </div>
            <div class="tbar">
                <div class="inp" style="flex: 0 1 280px">
                    <BoIcon name="search" :size="15" />
                    <input v-model="keyword" placeholder="Élève ou classe…" aria-label="Rechercher un inscrit" style="width: 100%" />
                </div>
            </div>
            <div style="overflow-x: auto">
                <table class="tb">
                    <thead>
                        <tr><th>Élève</th><th>Classe</th><th>Formule</th><th>Régime</th><th>Paiement</th><th class="r">Aujourd’hui</th></tr>
                    </thead>
                    <tbody>
                        <TableSkeleton v-if="loading && !rows.length" :columns="6" />
                        <tr v-for="r in pageRows" v-else :key="r.subscriptionId" class="cl" @click="opened = r">
                            <td>
                                <div class="nm">
                                    <BoAvatar :name="r.studentName" :src="studentPhotoUrl({ id: r.studentId, photoId: r.photoId })" :size="32" />
                                    <div><b>{{ r.studentName }}</b><span class="nu">{{ r.registrationNumber }}</span></div>
                                </div>
                            </td>
                            <td><span v-if="r.className" class="tag">{{ r.className }}</span><span v-else style="color: var(--tx3)">—</span></td>
                            <td style="font: 500 12.5px / 1 Inter; color: var(--tx2)">{{ r.formulaName }}</td>
                            <td>
                                <span v-if="!r.diets.length" style="color: var(--tx3)">—</span>
                                <span v-for="d in r.diets" :key="d.kind" class="pill" :style="{ ...pillStyle(dietTone(d.kind)), marginRight: '4px' }">{{ dietLabel(d.kind, d.label) }}</span>
                            </td>
                            <td><span class="pill" :style="pillStyle(paymentOf(r.paymentStatus).tone)">{{ paymentOf(r.paymentStatus).label }}</span></td>
                            <td class="r" @click.stop="toggleToday(r)">
                                <span
                                    v-if="r.today === 'SERVED'" class="pill" :style="pillStyle('ok')"
                                    :title="can('canteen:write') ? 'Signaler absent' : undefined"
                                ><BoIcon name="check" :size="12" :stroke-width="2.2" />Servi</span>
                                <span
                                    v-else-if="r.today === 'ABSENT'" class="pill" :style="pillStyle('mute')"
                                    :title="can('canteen:write') ? 'Revenir à la règle' : undefined"
                                >Absent</span>
                                <span v-else style="color: var(--tx3)" :title="can('canteen:write') ? 'Marquer servi' : undefined">—</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-if="!loading && !filtered.length" class="empty">
                <h4>Aucun inscrit</h4>
                <p>Inscrivez les élèves à la cantine avec le bouton « Inscrire un élève ».</p>
            </div>
            <div class="card-f">
                <span style="font: 500 12px / 1 Inter; color: var(--tx3)">
                    <b class="nu" style="color: var(--nv)">{{ pageRows.length }}</b> {{ plural(pageRows.length, 'inscrit') }} sur <b class="nu" style="color: var(--nv)">{{ filtered.length }}</b>
                </span>
                <div style="display: flex; gap: 6px">
                    <button type="button" class="btn out sm" :disabled="page === 0" @click="page -= 1"><BoIcon name="chevron-left" :size="15" />Précédent</button>
                    <button type="button" class="btn out sm" :disabled="page >= pages - 1" @click="page += 1">Suivant</button>
                </div>
            </div>
        </section>

        <!-- ============ Menu : édition ============ -->
        <BoModal
            v-if="menuOpen" title="Menu de la semaine" icon="utensils" :width="820"
            :sub="`Semaine ${weekLabel(menuWeek)}${consultedYear.consulted.value ? ` · Année ${consultedYear.consulted.value.label}` : ''}`"
            @close="menuOpen = false"
        >
            <div class="sv-ed">
                <nav>
                    <button
                        v-for="(d, i) in menuForm" :key="d.day" type="button" class="sv-day"
                        :aria-current="menuDay === i ? 'page' : undefined" @click="menuDay = i"
                    >
                        <span><b>{{ WEEKDAYS[i]?.label }}</b><em class="nu">{{ shortDay(d.day) }}</em></span>
                        <BoIcon v-if="d.closed" name="ban" :size="16" style="color: var(--tx3)" />
                        <BoIcon v-else-if="dayFilled(d)" name="circle-check" :size="16" style="color: var(--gr)" />
                        <span v-else class="sv-dot" />
                    </button>
                    <button type="button" class="btn gh sm" style="margin-top: 8px" @click="copyPreviousWeek"><BoIcon name="refresh" :size="15" />Reprendre la semaine précédente</button>
                    <button type="button" class="btn gh sm" @click="openMenu(plusDays(menuWeek, 7))"><BoIcon name="chevron-right" :size="15" />Semaine suivante</button>
                </nav>
                <div v-if="editedDay">
                    <section class="card" style="margin-bottom: 14px">
                        <div class="srow">
                            <div class="sic"><BoIcon name="ban" :size="17" /></div>
                            <div style="flex: 1 1 0%; min-width: 0">
                                <b>Pas de service ce jour</b>
                                <p>Jour férié, sortie scolaire… Aucun repas n’est attendu ni pointé.</p>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0">
                                <button
                                    type="button" class="sw" role="switch" :aria-checked="editedDay.closed" :aria-pressed="editedDay.closed"
                                    aria-label="Pas de service ce jour" @click="editedDay.closed = !editedDay.closed"
                                ><i /></button>
                            </div>
                        </div>
                    </section>
                    <template v-if="!editedDay.closed">
                        <div class="frm">
                            <div class="fld"><label for="menu-starter">Entrée *</label><input id="menu-starter" v-model="editedDay.starter" placeholder="Ex. Salade de crudités" maxlength="128" /></div>
                            <div class="fld"><label for="menu-dessert">Dessert *</label><input id="menu-dessert" v-model="editedDay.dessert" placeholder="Ex. Fruit de saison" maxlength="128" /></div>
                            <div class="fld" style="grid-column: span 2"><label for="menu-main">Plat principal *</label><input id="menu-main" v-model="editedDay.mainCourse" placeholder="Ex. Riz sauce arachide, poulet" maxlength="128" /></div>
                            <div class="fld" style="grid-column: span 2"><label for="menu-veg">Alternative végétarienne</label><input id="menu-veg" v-model="editedDay.vegetarianAlternative" placeholder="Servie aux élèves inscrits « Végétarien »" maxlength="128" /></div>
                        </div>
                        <div style="margin: 16px 0 0">
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px">
                                <p class="sec">Allergènes présents</p>
                            </div>
                            <div style="display: flex; gap: 6px; flex-wrap: wrap">
                                <button
                                    v-for="a in MENU_ALLERGENS" :key="a.label" type="button" class="chip"
                                    :aria-pressed="editedDay.allergens.includes(a.label)" @click="toggleAllergen(a.label)"
                                >{{ a.label }}</button>
                            </div>
                            <div v-for="w in allergyWarnings" :key="w.of" style="margin-top: 10px">
                                <div class="bnr" style="background: var(--am-t); border-color: rgba(150, 98, 10, 0.2)">
                                    <div style="width: 34px; height: 34px; border-radius: 10px; background: var(--surface-raised); display: grid; place-items: center; color: var(--am-d); flex-shrink: 0">
                                        <BoIcon name="alert" :size="18" />
                                    </div>
                                    <div style="flex: 1 1 0%; min-width: 0">
                                        <b class="nu" style="font-size: 14px; color: var(--am-d); letter-spacing: -0.1px">{{ w.count }} {{ plural(w.count, 'élève') }} {{ plural(w.count, 'allergique') }} {{ w.of }}</b>
                                        <div style="font: 500 12.5px / 1.45 Inter; color: var(--tx2); margin-top: 2px">Un repas de substitution est à prévoir : ils figurent sur la fiche cuisine.</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
            <template #footer>
                <button type="button" class="btn gh" @click="menuOpen = false">Annuler</button>
                <div style="flex: 1 1 0%" />
                <button type="button" class="btn out" :disabled="savingMenu" @click="saveMenu(false)">Enregistrer le brouillon</button>
                <button type="button" class="btn pr" :disabled="savingMenu" @click="saveMenu(true)"><BoIcon name="bell" :size="16" />Publier aux familles</button>
            </template>
        </BoModal>

        <!-- ============ Inscription ============ -->
        <BoModal
            v-if="subscribeOpen" title="Inscrire un élève à la cantine" icon="utensils" :width="640"
            :sub="`${consultedYear.consulted.value ? `Année ${consultedYear.consulted.value.label} · ` : ''}facturation mensuelle jusqu’à la fin de l’année`"
            @close="subscribeOpen = false"
        >
            <div style="margin-bottom: 20px">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px"><p class="sec">1 · Élève</p></div>
                <div v-if="picked" class="sv-pick on">
                    <div class="nm">
                        <BoAvatar :name="`${picked.lastName} ${picked.firstName}`" :src="studentPhotoUrl(picked)" :size="30" />
                        <div><b>{{ picked.lastName }} {{ picked.firstName }}</b><span>{{ picked.schoolClass?.name ? `${picked.schoolClass.name} · ` : '' }}{{ picked.registrationNumber }}</span></div>
                    </div>
                    <button type="button" class="ic-btn" style="width: 28px; height: 28px; color: var(--tx2)" aria-label="Changer d’élève" @click="unpick"><BoIcon name="close" :size="15" /></button>
                </div>
                <template v-else>
                    <div class="inp" style="flex: 0 1 600px">
                        <BoIcon name="search" :size="15" />
                        <input v-model="studentQuery" placeholder="Nom, matricule ou classe…" aria-label="Rechercher un élève" style="width: 100%" />
                    </div>
                    <div v-if="candidates.length" class="sv-list">
                        <button v-for="s in candidates" :key="s.id" type="button" class="sv-pick" @click="pick(s)">
                            <div class="nm">
                                <BoAvatar :name="`${s.lastName} ${s.firstName}`" :src="studentPhotoUrl(s)" :size="30" />
                                <div><b>{{ s.lastName }} {{ s.firstName }}</b><span>{{ s.schoolClass?.name ? `${s.schoolClass.name} · ` : '' }}{{ s.registrationNumber }}</span></div>
                            </div>
                            <BoIcon name="plus" :size="16" style="color: var(--pr)" />
                        </button>
                    </div>
                </template>
            </div>

            <div style="margin-bottom: 20px">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px">
                    <p class="sec">2 · Formule</p>
                    <button v-if="can('canteen:write')" type="button" class="btn gh sm" style="margin-top: -10px" @click="editFormula(); formulasOpen = true">Gérer les formules</button>
                </div>
                <div v-if="activeFormulas.length" class="sv-forms">
                    <button
                        v-for="f in activeFormulas" :key="f.id" type="button"
                        :aria-pressed="pickedFormula === f.id" @click="pickedFormula = f.id"
                    >
                        <b>{{ f.name }}</b>
                        <span>{{ formulaDaysLong(f) }}</span>
                        <em class="nu">{{ fmt(f.monthlyPrice) }} F <small>/ mois</small></em>
                    </button>
                </div>
                <p v-else style="margin: 0; font: 500 12.5px / 1.45 Inter; color: var(--tx3)">Aucune formule : créez-en une avec « Gérer les formules ».</p>
                <div class="frm" style="margin-top: 12px">
                    <div class="fld">
                        <label for="canteen-start">Premier repas</label>
                        <NelimaDateField id="canteen-start" v-model="startDate" />
                    </div>
                    <div class="fld">
                        <label for="canteen-billing">Facturation</label>
                        <select id="canteen-billing" disabled><option>Mensuel</option></select>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 20px">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px"><p class="sec">3 · Régime &amp; allergies</p></div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap">
                    <button
                        v-for="d in DIETS.filter((x) => x.value !== 'ALLERGY_OTHER')" :key="d.value" type="button" class="chip"
                        :aria-pressed="pickedDiets.includes(d.value)" :disabled="!picked" @click="toggleDiet(d.value)"
                    >{{ d.label }}</button>
                </div>
                <section class="card" style="margin-top: 12px">
                    <div class="srow">
                        <div class="sic"><BoIcon name="bell" :size="17" /></div>
                        <div style="flex: 1 1 0%; min-width: 0">
                            <b>Prévenir la famille</b>
                            <p>Notification avec la formule, le montant mensuel et le menu dans l’application.</p>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0">
                            <button
                                type="button" class="sw" role="switch" :aria-checked="notifyFamily" :aria-pressed="notifyFamily"
                                aria-label="Prévenir la famille" @click="notifyFamily = !notifyFamily"
                            ><i /></button>
                        </div>
                    </div>
                </section>
            </div>

            <div v-if="chosenFormula && billing" style="background: rgb(250, 251, 253); border: 1px solid var(--bd); border-radius: 12px; padding: 14px">
                <dl class="kv">
                    <dt>Formule {{ chosenFormula.name }}</dt>
                    <dd><span class="nu">{{ fmt(chosenFormula.monthlyPrice) }} FCFA / mois</span></dd>
                    <dt>Reste de l’année ({{ billing.months }} mois)</dt>
                    <dd><span class="nu">{{ fmt(billing.total) }} FCFA</span></dd>
                    <dt>Facturation</dt>
                    <dd>{{ billing.months }} {{ plural(billing.months, 'échéance') }}, la première le {{ ddmm(billing.firstDue) }}</dd>
                </dl>
            </div>
            <template #footer>
                <button type="button" class="btn gh" @click="subscribeOpen = false">Annuler</button>
                <button type="button" class="btn pr" :disabled="!picked || !pickedFormula || subscribing" @click="subscribe"><BoIcon name="check" :size="16" />Inscrire</button>
            </template>
        </BoModal>

        <!-- ============ Formules ============ -->
        <BoModal
            v-if="formulasOpen" title="Formules de cantine" icon="utensils" :width="640"
            sub="Un tarif mensuel par formule ; une formule sans jour fixe est ponctuelle" @close="formulasOpen = false"
        >
            <div v-if="formulas.length" class="sv-list" style="margin: 0 0 20px">
                <div v-for="f in formulas" :key="f.id" class="sv-pick">
                    <div class="nm">
                        <div>
                            <b>{{ f.name }}<template v-if="!f.active"> · retirée</template></b>
                            <span>{{ formulaDays(f) }} · {{ fmt(f.monthlyPrice) }} F / mois · {{ f.subscribers }} {{ plural(f.subscribers, 'abonné') }}</span>
                        </div>
                    </div>
                    <button type="button" class="btn out sm" @click="editFormula(f)"><BoIcon name="edit" :size="15" />Modifier</button>
                </div>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px">
                <p class="sec">{{ editingFormula ? `Modifier ${editingFormula.name}` : 'Nouvelle formule' }}</p>
            </div>
            <div class="frm">
                <div class="fld"><label for="formula-name">Nom *</label><input id="formula-name" v-model="formulaForm.name" placeholder="Ex. 5 jours" maxlength="64" /></div>
                <div class="fld"><label for="formula-price">Tarif mensuel (FCFA) *</label><input id="formula-price" v-model="formulaForm.monthlyPrice" inputmode="numeric" placeholder="45000" /></div>
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px">
                <button
                    v-for="d in WEEKDAYS" :key="d.value" type="button" class="chip"
                    :aria-pressed="formulaForm.days.includes(d.value)" @click="toggleFormulaDay(d.value)"
                >{{ d.short }}</button>
            </div>
            <section class="card" style="margin-top: 12px">
                <div class="srow">
                    <div class="sic"><BoIcon name="check" :size="17" /></div>
                    <div style="flex: 1 1 0%; min-width: 0">
                        <b>Proposée aux inscriptions</b>
                        <p>Une formule retirée garde ses abonnés, mais n’en accueille plus de nouveaux.</p>
                    </div>
                    <button
                        type="button" class="sw" role="switch" :aria-checked="formulaForm.active" :aria-pressed="formulaForm.active"
                        aria-label="Proposée aux inscriptions" @click="formulaForm.active = !formulaForm.active"
                    ><i /></button>
                </div>
            </section>
            <template #footer>
                <button type="button" class="btn gh" @click="formulasOpen = false">Fermer</button>
                <div style="flex: 1 1 0%" />
                <button v-if="editingFormula" type="button" class="btn out" @click="editFormula()">Nouvelle formule</button>
                <button type="button" class="btn pr" :disabled="!formulaForm.name.trim() || formulaForm.monthlyPrice === ''" @click="saveFormula">
                    <BoIcon name="check" :size="16" />Enregistrer
                </button>
            </template>
        </BoModal>

        <!-- ============ Abonnement d'un élève ============ -->
        <BoModal
            v-if="opened" :title="opened.studentName" icon="utensils" :width="520"
            :sub="`Formule ${opened.formulaName} · depuis le ${ddmm(opened.startDate)}`" @close="opened = null"
        >
            <dl class="kv">
                <dt>Classe</dt><dd>{{ opened.className ?? '—' }}</dd>
                <dt>Formule</dt><dd>{{ opened.formulaName }}</dd>
                <dt>Début</dt><dd class="nu">{{ ddmm(opened.startDate) }}</dd>
                <dt>Fin</dt><dd class="nu">{{ opened.endDate ? ddmm(opened.endDate) : 'Fin de l’année' }}</dd>
                <dt>Régime</dt><dd>{{ opened.diets.length ? opened.diets.map((d) => dietLabel(d.kind, d.label)).join(', ') : '—' }}</dd>
                <dt>Paiement</dt><dd><span class="pill" :style="pillStyle(paymentOf(opened.paymentStatus).tone)">{{ paymentOf(opened.paymentStatus).label }}</span></dd>
            </dl>
            <p v-if="can('canteen:write') && !opened.endDate" style="margin: 16px 0 0; font: 500 12px / 1.5 Inter; color: var(--tx3)">
                Arrêter l’abonnement annule les mois qui suivent ; le mois en cours reste dû.
            </p>
            <template #footer>
                <button type="button" class="btn gh" @click="opened = null">Fermer</button>
                <div style="flex: 1 1 0%" />
                <button v-if="can('canteen:write') && !opened.endDate" type="button" class="btn dn" @click="endSubscription">Arrêter l’abonnement</button>
            </template>
        </BoModal>
    </div>
</template>
