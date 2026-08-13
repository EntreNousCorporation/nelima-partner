<script setup lang="ts">
import {
    NOTIFICATION_CHANNELS, NOTIFICATION_CHANNEL_LABELS, NOTIFICATION_EVENT_LABELS,
    auditActionLabel, primaryContact,
    type AcademicYear, type AuditEvent, type Establishment, type NotificationChannel,
    type NotificationEvent, type NotificationPreference,
} from '~/composables/useSettings';
import { isoDate } from '~/composables/useCalendar';
import { levelLabel, type LevelOfStudy } from '~/composables/useStudents';

/**
 * Réglages de l'établissement.
 *
 * Quatre sections seulement, contre sept à la maquette. Un réglage qui ne règle rien est pire que
 * pas de réglage : il se découvre à l'usage et fait douter du reste. Les moyens de paiement et la
 * commission sont pilotés par YPYit, les utilisateurs se gèrent depuis Personnel, et l'abonnement
 * relève de la facturation.
 */
const settings = useSettings();
const { can } = usePermissions();
const auth = useAuthStore();

const SECTIONS = [
    { id: 'etab', label: 'Établissement' },
    { id: 'niveaux', label: 'Niveaux enseignés' },
    { id: 'annee', label: 'Année scolaire' },
    { id: 'notifs', label: 'Notifications' },
    { id: 'audit', label: "Journal d'audit" },
] as const;
type SectionId = typeof SECTIONS[number]['id'];

const route = useRoute();
const router = useRouter();
const current = ref<SectionId>(
    (SECTIONS.find((s) => s.id === route.query.section)?.id ?? 'etab') as SectionId);

const canWrite = computed(() => can('settings:write'));
const canReadAudit = computed(() => can('audit:read'));
const establishmentId = computed(() => auth.user?.establishmentId ?? '');

const shownSections = computed(() =>
    SECTIONS.filter((section) => section.id !== 'audit' || canReadAudit.value));

function go(section: SectionId) {
    current.value = section;
    router.replace({ query: { ...route.query, section } });
}

const error = ref('');
const saved = ref('');

function fail(e: any, fallback: string) {
    error.value = e?.data?.debugMessage ?? e?.data?.message ?? fallback;
    saved.value = '';
}

function done(message: string) {
    saved.value = message;
    error.value = '';
}

/* ---------------- Établissement ---------------- */

const establishment = ref<Establishment | null>(null);
const identity = reactive({
    name: '', shortName: '', accreditationNumber: '', webSite: '', addressName: '',
    phone: '', email: '',
});
const savingIdentity = ref(false);

async function loadEstablishment() {
    if (!establishmentId.value) return;
    try {
        const data = await settings.establishment(establishmentId.value);
        establishment.value = data;
        syncLevelsFrom(data as Establishment & { levelOfStudies?: LevelOfStudy[] });
        Object.assign(identity, {
            name: data.name ?? '',
            shortName: data.shortName ?? '',
            accreditationNumber: data.accreditationNumber ?? '',
            webSite: data.webSite ?? '',
            addressName: data.address?.name ?? '',
            phone: primaryContact(data, 'PHONE_NUMBER')?.value ?? '',
            email: primaryContact(data, 'EMAIL')?.value ?? '',
        });
    } catch (e) {
        fail(e, "La fiche de l'établissement n'a pas pu être chargée.");
    }
}

/**
 * Les contacts à écrire, avec l'`id` de l'existant quand il y en a un.
 *
 * <p>Sans cet `id`, chaque enregistrement créerait un contact de plus au lieu de corriger celui
 * qui est là, et la contrainte d'unicité applicative finirait par refuser la fiche. Un champ vidé
 * n'est pas envoyé : effacer un contact se fait ailleurs, et le confondre avec « ne rien changer »
 * ferait disparaître un numéro sur une simple faute de frappe.
 *
 * <p>Le drapeau « principal » n'est <strong>jamais posé sur les deux</strong> : un établissement
 * n'a qu'un seul contact principal, tous types confondus, et le serveur refuse la fiche entière
 * sinon. On conserve donc celui qui l'est déjà ; à défaut, le premier renseigné le devient.
 */
function contactsPayload() {
    const existingPrimaryId = (establishment.value?.contacts ?? [])
        .find((contact) => contact.isPrimary)?.id;

    const wanted: { id?: string; type: 'EMAIL' | 'PHONE_NUMBER'; value: string; isPrimary: boolean }[] = [];
    for (const [type, value] of [
        ['PHONE_NUMBER', identity.phone] as const,
        ['EMAIL', identity.email] as const,
    ]) {
        const trimmed = (value ?? '').trim();
        if (!trimmed) continue;
        const existing = primaryContact(establishment.value, type);
        wanted.push({
            id: existing?.id,
            type,
            value: trimmed,
            isPrimary: existingPrimaryId
                ? existing?.id === existingPrimaryId
                : wanted.length === 0,
        });
    }
    return wanted.length ? wanted : undefined;
}

async function submitIdentity() {
    savingIdentity.value = true;
    try {
        await settings.updateEstablishment(establishmentId.value, {
            name: identity.name,
            shortName: identity.shortName || undefined,
            accreditationNumber: identity.accreditationNumber || undefined,
            webSite: identity.webSite || undefined,
            addressName: identity.addressName || undefined,
            contacts: contactsPayload(),
        });
        await loadEstablishment();
        done('Identité enregistrée.');
    } catch (e) {
        fail(e, "L'identité n'a pas pu être enregistrée.");
    } finally {
        savingIdentity.value = false;
    }
}

/* ---------------- Niveaux enseignés ---------------- */

/**
 * Les niveaux conditionnent tout le reste : un élève ne s'inscrit que dans un niveau déclaré, et
 * les frais s'y ciblent. C'est un réglage d'établissement, pas un écran de travail quotidien —
 * d'où son passage de la barre de navigation aux paramètres.
 */
const api = useApi();
const levelCatalogue = ref<LevelOfStudy[]>([]);
const levelSelection = ref<string[]>([]);
const levelInitial = ref<string[]>([]);
const savingLevels = ref(false);

const levelsDirty = computed(() => JSON.stringify([...levelSelection.value].sort())
    !== JSON.stringify([...levelInitial.value].sort()));

async function loadLevels() {
    try {
        const all = await api<{ content: LevelOfStudy[] }>('/level-of-studies', { query: { size: 100 } });
        levelCatalogue.value = (all.content ?? []).slice()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    } catch (e) {
        fail(e, "Le catalogue des niveaux n'a pas pu être chargé.");
    }
}

function syncLevelsFrom(data: Establishment & { levelOfStudies?: LevelOfStudy[] }) {
    const codes = (data.levelOfStudies ?? []).map((level) => level.code);
    levelSelection.value = [...codes];
    levelInitial.value = [...codes];
}

function toggleLevel(code: string) {
    const index = levelSelection.value.indexOf(code);
    if (index === -1) levelSelection.value.push(code);
    else levelSelection.value.splice(index, 1);
}

async function saveLevels() {
    if (!establishmentId.value) return;
    savingLevels.value = true;
    try {
        await api(`/establishments/${establishmentId.value}/level-of-studies`, {
            method: 'POST',
            body: { levelOfStudiesCodes: levelSelection.value },
        });
        levelInitial.value = [...levelSelection.value];
        done('Niveaux enregistrés.');
    } catch (e) {
        fail(e, "Les niveaux n'ont pas pu être enregistrés.");
    } finally {
        savingLevels.value = false;
    }
}

/* ---------------- Année scolaire ---------------- */

const years = ref<AcademicYear[]>([]);
const editingYear = ref<AcademicYear | null>(null);
const showYearForm = ref(false);
const savingYear = ref(false);
const yearForm = reactive({
    label: '',
    startDate: '',
    endDate: '',
    active: true,
    periods: [] as { label: string; startDate: string; endDate: string }[],
});

const activeYear = computed(() => years.value.find((year) => year.active) ?? null);

async function loadYears() {
    try {
        years.value = await settings.years();
    } catch (e) {
        fail(e, "Les années scolaires n'ont pas pu être chargées.");
    }
}

function openYearCreate() {
    editingYear.value = null;
    const now = new Date();
    Object.assign(yearForm, {
        label: `${now.getFullYear()}-${now.getFullYear() + 1}`,
        startDate: '', endDate: '', active: true, periods: [],
    });
    showYearForm.value = true;
}

function openYearEdit(year: AcademicYear) {
    editingYear.value = year;
    Object.assign(yearForm, {
        label: year.label,
        startDate: year.startDate,
        endDate: year.endDate,
        active: year.active,
        periods: year.periods.map((period) => ({
            label: period.label, startDate: period.startDate, endDate: period.endDate,
        })),
    });
    showYearForm.value = true;
}

function addPeriod() {
    const rank = yearForm.periods.length + 1;
    yearForm.periods.push({
        label: `${rank === 1 ? '1er' : `${rank}e`} trimestre`,
        startDate: '', endDate: '',
    });
}

function removePeriod(index: number) {
    yearForm.periods.splice(index, 1);
}

async function submitYear() {
    savingYear.value = true;
    try {
        const body = {
            label: yearForm.label,
            startDate: yearForm.startDate,
            endDate: yearForm.endDate,
            active: yearForm.active,
            periods: yearForm.periods,
        };
        if (editingYear.value) await settings.updateYear(editingYear.value.id, body);
        else await settings.createYear(body);
        showYearForm.value = false;
        await loadYears();
        done('Année scolaire enregistrée.');
    } catch (e) {
        fail(e, "L'année scolaire n'a pas pu être enregistrée.");
    } finally {
        savingYear.value = false;
    }
}

async function destroyYear(year: AcademicYear) {
    try {
        await settings.removeYear(year.id);
        await loadYears();
        done('Année supprimée.');
    } catch (e) {
        fail(e, "L'année n'a pas pu être supprimée.");
    }
}

/* ---------------- Notifications ---------------- */

const preferences = ref<NotificationPreference[]>([]);
const togglingChannel = ref('');

async function loadPreferences() {
    try {
        preferences.value = await settings.notifications();
    } catch (e) {
        fail(e, "Les préférences de notification n'ont pas pu être chargées.");
    }
}

function settingOf(preference: NotificationPreference, channel: NotificationChannel) {
    return preference.channels.find((entry) => entry.channel === channel) ?? null;
}

async function toggleChannel(event: NotificationEvent, channel: NotificationChannel,
                             enabled: boolean) {
    togglingChannel.value = `${event}-${channel}`;
    try {
        preferences.value = await settings.setNotification({ event, channel, enabled });
        done(enabled ? 'Canal ouvert.' : 'Canal coupé.');
    } catch (e) {
        fail(e, "Le réglage n'a pas pu être enregistré.");
    } finally {
        togglingChannel.value = '';
    }
}

/* ---------------- Journal d'audit ---------------- */

const auditEntries = ref<AuditEvent[]>([]);
const auditLoading = ref(false);
const auditFilters = reactive({
    from: isoDate(new Date(new Date().setDate(new Date().getDate() - 30))),
    to: isoDate(new Date()),
    actorId: '',
});

/** Auteurs présents dans la période chargée : le filtre ne propose que ce qu'il peut rendre. */
const auditActors = computed(() => {
    const map = new Map<string, string>();
    for (const entry of auditEntries.value) {
        if (entry.actorId && entry.actorName) map.set(entry.actorId, entry.actorName);
    }
    return [...map].map(([id, name]) => ({ id, name }));
});

async function loadAudit() {
    if (!canReadAudit.value) return;
    auditLoading.value = true;
    try {
        auditEntries.value = await settings.audit(
            auditFilters.from, auditFilters.to, auditFilters.actorId);
    } catch (e) {
        fail(e, "Le journal n'a pas pu être chargé.");
    } finally {
        auditLoading.value = false;
    }
}

function formatMoment(value: string) {
    const date = new Date(value);
    return date.toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function formatDay(value?: string) {
    if (!value) return '—';
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
}

watch(current, (section) => {
    if (section === 'audit') loadAudit();
});

onMounted(async () => {
    await Promise.all([loadEstablishment(), loadLevels(), loadYears(), loadPreferences()]);
    if (current.value === 'audit') await loadAudit();
});
</script>

<template>
    <div>
        <PageHead
            title="Paramètres"
            :sub="establishment?.name ?? auth.user?.establishmentName ?? 'Réglages de l’établissement'"
        />

        <p v-if="error" class="alert-danger mb-3.5" role="alert">{{ error }}</p>
        <p v-if="saved" class="alert-success mb-3.5" role="status" @click="saved = ''">
            {{ saved }}
        </p>
        <p v-if="!canWrite" class="alert-success mb-3.5" role="status" style="background: var(--warning-soft); color: var(--warning)">
            Votre rôle donne accès aux réglages en consultation seule.
        </p>

        <div class="settings-layout">
            <nav class="settings-nav">
                <button
                    v-for="section in shownSections" :key="section.id"
                    class="settings-nav-item" :aria-current="current === section.id"
                    @click="go(section.id)"
                >{{ section.label }}</button>
            </nav>

            <div class="flex flex-col gap-3.5 min-w-0">
                <!-- ================= Établissement ================= -->
                <template v-if="current === 'etab'">
                    <UiCard
                        title="Identité de l'établissement"
                        sub="Ces informations figurent sur les reçus envoyés aux familles"
                    >
                        <form @submit.prevent="submitIdentity">
                            <div class="grid gap-3.5 sm:grid-cols-2">
                                <div>
                                    <label class="field-label" for="name">Nom de l'établissement</label>
                                    <input
                                        id="name" v-model="identity.name" type="text" required
                                        class="input" :disabled="!canWrite"
                                    />
                                </div>
                                <div>
                                    <label class="field-label" for="shortName">Sigle</label>
                                    <input
                                        id="shortName" v-model="identity.shortName" type="text"
                                        placeholder="GSD" class="input" :disabled="!canWrite"
                                    />
                                </div>
                                <div class="sm:col-span-2">
                                    <label class="field-label" for="address">Adresse</label>
                                    <input
                                        id="address" v-model="identity.addressName" type="text"
                                        placeholder="Rue des Jardins, Cocody II Plateaux — Abidjan"
                                        class="input" :disabled="!canWrite"
                                    />
                                </div>
                                <div>
                                    <label class="field-label" for="accreditation">
                                        Numéro d'agrément
                                    </label>
                                    <input
                                        id="accreditation" v-model="identity.accreditationNumber"
                                        type="text" placeholder="MENA/DRENA-ABJ4/2019-0442"
                                        class="input" :disabled="!canWrite"
                                    />
                                </div>
                                <div>
                                    <label class="field-label" for="website">Site web</label>
                                    <input
                                        id="website" v-model="identity.webSite" type="text"
                                        placeholder="https://…" class="input" :disabled="!canWrite"
                                    />
                                </div>
                                <div>
                                    <label class="field-label" for="currency">Devise</label>
                                    <input
                                        id="currency" type="text" value="Franc CFA (XOF)"
                                        class="input" disabled
                                    />
                                    <p class="hint">
                                        Le multi-devises n'est pas proposé : toute la comptabilité
                                        de la plateforme est tenue en francs CFA.
                                    </p>
                                </div>
                            </div>

                            <div v-if="canWrite" class="flex gap-2 mt-4">
                                <button type="submit" class="btn-primary" :disabled="savingIdentity">
                                    <BoIcon name="check" :size="16" />
                                    {{ savingIdentity ? 'Enregistrement…' : 'Enregistrer' }}
                                </button>
                            </div>
                        </form>
                    </UiCard>

                    <UiCard title="Contacts">
                        <!-- Modifiables ici : ce sont les coordonnées de l'établissement, pas
                             celles de son compte de direction, et l'école est la mieux placée
                             pour les tenir à jour. Enregistrées avec le formulaire d'identité
                             ci-dessus, dont elles font partie côté serveur. -->
                        <div class="grid gap-3.5 sm:grid-cols-2">
                            <div>
                                <label class="field-label" for="schoolPhone">Téléphone</label>
                                <input
                                    id="schoolPhone" v-model="identity.phone" type="tel"
                                    placeholder="+225 07 00 00 00 00" class="input"
                                    :disabled="!canWrite"
                                />
                            </div>
                            <div>
                                <label class="field-label" for="schoolEmail">E-mail</label>
                                <input
                                    id="schoolEmail" v-model="identity.email" type="email"
                                    placeholder="contact@votre-ecole.ci" class="input"
                                    :disabled="!canWrite"
                                />
                            </div>
                        </div>
                        <p class="hint mt-3">
                            Ces coordonnées servent aux familles pour joindre l'établissement, et
                            figurent sur les reçus. Elles s'enregistrent avec l'identité ci-dessus.
                        </p>
                    </UiCard>
                </template>

                <!-- ================= Niveaux enseignés ================= -->
                <template v-if="current === 'niveaux'">
                    <UiCard
                        title="Catalogue du système éducatif ivoirien"
                        sub="Un élève ne peut être inscrit que dans un niveau retenu ici, et les frais s'y ciblent"
                    >
                        <div class="flex flex-wrap gap-2">
                            <!-- `aria-pressed` porte l'état retenu : la couleur seule ne le dirait
                                 pas à un lecteur d'écran, et c'est toute l'information de l'écran. -->
                            <button
                                v-for="level in levelCatalogue" :key="level.id" type="button"
                                class="chip" :disabled="!canWrite"
                                :aria-pressed="levelSelection.includes(level.code)"
                                @click="toggleLevel(level.code)"
                            >{{ levelLabel(level) }}</button>
                        </div>

                        <template #footer>
                            <span class="text-[12px]" style="color: var(--text-faint)">
                                <b class="nu" style="color: var(--navy)">{{ levelSelection.length }}</b>
                                niveau{{ levelSelection.length > 1 ? 'x' : '' }}
                                retenu{{ levelSelection.length > 1 ? 's' : '' }}
                                sur {{ levelCatalogue.length }}
                            </span>
                            <button
                                v-if="canWrite" class="btn-primary btn-sm"
                                :disabled="savingLevels || !levelsDirty || !levelSelection.length"
                                @click="saveLevels"
                            >
                                <BoIcon name="check" :size="15" />
                                {{ savingLevels ? 'Enregistrement…' : 'Enregistrer' }}
                            </button>
                        </template>
                    </UiCard>
                </template>

                <!-- ================= Année scolaire ================= -->
                <template v-if="current === 'annee'">
                    <UiCard
                        title="Année scolaire et périodes"
                        sub="Les bornes de l'année active paraissent au calendrier de l'école et à celui des familles"
                    >
                        <template #action>
                            <button v-if="canWrite" class="btn-primary btn-sm" @click="openYearCreate">
                                <BoIcon name="plus" :size="15" />
                                Déclarer une année
                            </button>
                        </template>

                        <p v-if="activeYear" class="text-[13px]">
                            <b>Année en cours — {{ activeYear.label }}</b><br />
                            Du {{ formatDay(activeYear.startDate) }} au
                            {{ formatDay(activeYear.endDate) }} ·
                            {{ activeYear.periods.length }} période(s)
                        </p>
                        <EmptyState
                            v-else
                            title="Aucune année déclarée"
                            text="Déclarez l'année en cours pour que ses bornes apparaissent au calendrier."
                        />
                    </UiCard>

                    <UiCard v-if="showYearForm" :title="editingYear ? `Modifier ${editingYear.label}` : 'Nouvelle année scolaire'">
                        <form @submit.prevent="submitYear">
                            <div class="grid gap-3.5 sm:grid-cols-3">
                                <div>
                                    <label class="field-label" for="yearLabel">Libellé</label>
                                    <input
                                        id="yearLabel" v-model="yearForm.label" type="text" required
                                        placeholder="2025-2026" class="input"
                                    />
                                </div>
                                <div>
                                    <label class="field-label" for="yearStart">Début</label>
                                    <NelimaDateField id="yearStart" v-model="yearForm.startDate"
                                        required />
                                </div>
                                <div>
                                    <label class="field-label" for="yearEnd">Fin</label>
                                    <NelimaDateField id="yearEnd" v-model="yearForm.endDate" required />
                                </div>
                            </div>

                            <label class="flex items-center gap-2 text-[12.5px] mt-4">
                                <input v-model="yearForm.active" type="checkbox" />
                                Année en cours
                                <span style="color: var(--text-faint)">
                                    (l'activer désactive la précédente)
                                </span>
                            </label>

                            <p class="sec mt-4">Périodes</p>
                            <p class="hint mb-2">
                                Trimestres ou semestres, autant que l'école en tient. Chaque période
                                pose deux repères au calendrier : son début et sa fin.
                            </p>

                            <div
                                v-for="(period, index) in yearForm.periods" :key="index"
                                class="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] items-end mb-2"
                            >
                                <div>
                                    <label class="field-label">Libellé</label>
                                    <input
                                        v-model="period.label" type="text" required
                                        placeholder="1er trimestre" class="input"
                                    />
                                </div>
                                <div>
                                    <label class="field-label">Début</label>
                                    <NelimaDateField v-model="period.startDate" required />
                                </div>
                                <div>
                                    <label class="field-label">Fin</label>
                                    <NelimaDateField v-model="period.endDate" required />
                                </div>
                                <button
                                    type="button" class="btn-ghost btn-sm" @click="removePeriod(index)"
                                >Retirer</button>
                            </div>

                            <button type="button" class="btn-secondary btn-sm" @click="addPeriod">
                                <BoIcon name="plus" :size="15" />
                                Ajouter une période
                            </button>

                            <div class="flex gap-2 mt-4">
                                <button type="submit" class="btn-primary" :disabled="savingYear">
                                    <BoIcon name="check" :size="16" />
                                    {{ savingYear ? 'Enregistrement…' : 'Enregistrer' }}
                                </button>
                                <button
                                    type="button" class="btn-secondary" @click="showYearForm = false"
                                >Annuler</button>
                            </div>
                        </form>
                    </UiCard>

                    <UiCard v-if="years.length" title="Années déclarées" :pad="false">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Année</th>
                                    <th>Du</th>
                                    <th>Au</th>
                                    <th>Périodes</th>
                                    <th>Statut</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="year in years" :key="year.id">
                                    <td><b>{{ year.label }}</b></td>
                                    <td>{{ formatDay(year.startDate) }}</td>
                                    <td>{{ formatDay(year.endDate) }}</td>
                                    <td>
                                        <span v-if="!year.periods.length" style="color: var(--text-faint)">
                                            aucune
                                        </span>
                                        <span v-else>
                                            {{ year.periods.map((p) => p.label).join(' · ') }}
                                        </span>
                                    </td>
                                    <td>
                                        <UiPill :tone="year.active ? 'ok' : 'mute'">
                                            {{ year.active ? 'En cours' : 'Archivée' }}
                                        </UiPill>
                                    </td>
                                    <td class="text-right">
                                        <button
                                            v-if="canWrite" class="btn-ghost btn-sm"
                                            @click="openYearEdit(year)"
                                        ><BoIcon name="edit" :size="15" />Modifier</button>
                                        <button
                                            v-if="canWrite && !year.active" class="btn-ghost btn-sm"
                                            @click="destroyYear(year)"
                                        >Supprimer</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </UiCard>
                </template>

                <!-- ================= Notifications ================= -->
                <template v-if="current === 'notifs'">
                    <UiCard
                        title="Notifications aux familles"
                        sub="Les canaux ouverts ici sont ceux qu'utilisent les rappels et l'annonce des reçus"
                        :pad="false"
                    >
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Événement</th>
                                    <th
                                        v-for="channel in NOTIFICATION_CHANNELS" :key="channel"
                                        class="text-center"
                                    >{{ NOTIFICATION_CHANNEL_LABELS[channel] }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="preference in preferences" :key="preference.event">
                                    <td>
                                        <b>{{ NOTIFICATION_EVENT_LABELS[preference.event] }}</b>
                                    </td>
                                    <td
                                        v-for="channel in NOTIFICATION_CHANNELS" :key="channel"
                                        class="text-center"
                                    >
                                        <template v-if="settingOf(preference, channel)">
                                            <input
                                                type="checkbox"
                                                :checked="settingOf(preference, channel)!.enabled"
                                                :disabled="!canWrite
                                                    || settingOf(preference, channel)!.locked
                                                    || togglingChannel === `${preference.event}-${channel}`"
                                                :title="settingOf(preference, channel)!.lockedReason"
                                                @change="toggleChannel(preference.event, channel,
                                                                       ($event.target as HTMLInputElement).checked)"
                                            />
                                        </template>
                                        <span v-else style="color: var(--text-faint)">—</span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </UiCard>

                    <UiCard title="Ce que ces cases changent">
                        <ul class="text-[12.5px] flex flex-col gap-2" style="color: var(--text-2)">
                            <li>
                                <b>Le courriel du reçu ne se coupe pas.</b> Il porte la pièce
                                comptable ; la notification ne fait que l'annoncer. La case est
                                montrée cochée et inactive plutôt que retirée, pour qu'on ne la
                                croie pas oubliée.
                            </li>
                            <li>
                                <b>Le SMS est fermé par défaut</b>, parce qu'il se facture à
                                l'envoi. L'ouvrir engage le rappel d'échéance quotidien, pas
                                seulement les campagnes.
                            </li>
                            <li>
                                <b>Un tiret signifie qu'aucun envoi n'existe</b> pour ce couple —
                                un reçu ne tient pas dans un SMS, et aucun rappel d'échéance ne part
                                par courriel. Une case y serait un réglage sans effet.
                            </li>
                        </ul>
                    </UiCard>
                </template>

                <!-- ================= Journal d'audit ================= -->
                <template v-if="current === 'audit' && canReadAudit">
                    <UiCard
                        title="Journal d'audit"
                        sub="Encaissements au guichet, échéanciers redéfinis, exports, campagnes et accès au portail"
                    >
                        <div class="grid gap-3.5 sm:grid-cols-4 items-end">
                            <div>
                                <label class="field-label" for="auditFrom">Du</label>
                                <NelimaDateField id="auditFrom" v-model="auditFilters.from" />
                            </div>
                            <div>
                                <label class="field-label" for="auditTo">Au</label>
                                <NelimaDateField id="auditTo" v-model="auditFilters.to" />
                            </div>
                            <div>
                                <label class="field-label" for="auditActor">Auteur</label>
                                <select id="auditActor" v-model="auditFilters.actorId" class="select">
                                    <option value="">Tous</option>
                                    <option
                                        v-for="actor in auditActors" :key="actor.id" :value="actor.id"
                                    >{{ actor.name }}</option>
                                </select>
                            </div>
                            <button class="btn-secondary" @click="loadAudit">Filtrer</button>
                        </div>
                    </UiCard>

                    <UiCard :pad="false">
                        <div v-if="auditLoading" class="table-wrap" style="border: 0; box-shadow: none">
                            <table class="table">
                                <tbody><TableSkeleton :columns="5" :rows="4" /></tbody>
                            </table>
                        </div>
                        <EmptyState
                            v-else-if="!auditEntries.length"
                            title="Aucun acte sur la période"
                            text="Le journal ne consigne que les actes sensibles : l'argent, la dette, les exports et les accès."
                        />
                        <table v-else class="table">
                            <thead>
                                <tr>
                                    <th>Quand</th>
                                    <th>Auteur</th>
                                    <th>Action</th>
                                    <th>Objet</th>
                                    <th>Détail</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="entry in auditEntries" :key="entry.id">
                                    <td style="white-space: nowrap" class="tabular-nums">
                                        {{ formatMoment(entry.occurredAt) }}
                                    </td>
                                    <td><b>{{ entry.actorName ?? 'Système' }}</b></td>
                                    <td>{{ auditActionLabel(entry.action) }}</td>
                                    <td style="color: var(--text-2)">{{ entry.target ?? '—' }}</td>
                                    <td style="color: var(--text-2)">{{ entry.details ?? '—' }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </UiCard>
                </template>
            </div>
        </div>
    </div>
</template>

<style scoped>
.settings-layout {
    display: grid;
    grid-template-columns: 210px minmax(0, 1fr);
    gap: 14px;
}

@media (max-width: 900px) {
    .settings-layout {
        grid-template-columns: minmax(0, 1fr);
    }
}

.settings-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-self: start;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
}

.settings-nav-item {
    text-align: left;
    padding: 8px 10px;
    border-radius: 8px;
    font: 700 12.8px/1 'Inter', sans-serif;
    color: var(--text-2);
}

.settings-nav-item:hover {
    background: var(--surface-sunken);
}

.settings-nav-item[aria-current='true'] {
    background: var(--brand-50, var(--surface-sunken));
    color: var(--brand-600);
}

.hint {
    font: 500 11.5px/1.45 'Inter', sans-serif;
    color: var(--text-faint);
}
</style>
