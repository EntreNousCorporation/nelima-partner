<script setup lang="ts">
import {
    NOTIFICATION_CHANNELS, NOTIFICATION_CHANNEL_LABELS, NOTIFICATION_EVENT_LABELS,
    auditActionLabel, primaryContact,
    type AcademicYear, type AuditEvent, type YearClosure, type Establishment, type NotificationChannel,
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

/* ---------------- Logo ---------------- */

/**
 * Le logo de l'établissement, l'image qui le représente dans Nelima.
 *
 * L'image est réduite dans le navigateur (512 px au plus, PNG) avant l'envoi : une photo de
 * téléphone pèse plusieurs mégaoctets pour un affichage de quelques dizaines de pixels, et le
 * passage par un canevas retire au passage les métadonnées (position GPS comprise).
 */
const LOGO_MAX = 512;
const logoInput = ref<HTMLInputElement | null>(null);
const logoPreview = ref<string | null>(null);
const savingLogo = ref(false);
const logoError = ref('');

function readImage(file: File) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible')); };
        image.src = url;
    });
}

async function onLogoChosen(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    (event.target as HTMLInputElement).value = '';
    logoError.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        logoError.value = 'Choisissez une image PNG, JPEG ou WebP.';
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        logoError.value = 'Cette image dépasse 10 Mo.';
        return;
    }
    try {
        const image = await readImage(file);
        const scale = Math.min(1, LOGO_MAX / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        logoPreview.value = canvas.toDataURL('image/png');
    } catch {
        logoError.value = "Cette image n'a pas pu être lue.";
    }
}

async function saveLogo() {
    if (!logoPreview.value || !establishment.value) return;
    savingLogo.value = true;
    try {
        await settings.updateEstablishment(establishmentId.value, {
            name: establishment.value.name,
            coverImage: { name: 'logo.png', base64: logoPreview.value.split(',')[1] ?? '', extension: 'png' },
        });
        logoPreview.value = null;
        await loadEstablishment();
        done('Logo enregistré.');
    } catch (e) {
        fail(e, "Le logo n'a pas pu être enregistré.");
    } finally {
        savingLogo.value = false;
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

/*
 * Les années sont définies par la plateforme, communes à toutes les écoles. L'école y pose ses
 * trimestres ; chaque utilisateur choisit l'année qu'il consulte, sans faire basculer ses
 * collègues.
 */
const consultedYear = useConsultedYear();
const years = consultedYear.years;
const chosenYear = ref('');
const switchingYear = ref(false);
const editingPeriods = ref(false);
const savingYear = ref(false);
const periodsForm = ref<{ label: string; startDate: string; endDate: string }[]>([]);

async function loadYears() {
    await consultedYear.refresh();
    chosenYear.value = consultedYear.consulted.value?.id ?? '';
    await loadClosure();
}

/** Changer d'année recharge l'application : tous les écrans doivent la suivre, sans exception. */
async function switchYear() {
    if (!chosenYear.value || chosenYear.value === consultedYear.consulted.value?.id) return;
    switchingYear.value = true;
    try {
        await settings.consult(chosenYear.value);
        window.location.reload();
    } catch (e) {
        fail(e, "L'année n'a pas pu être changée.");
        switchingYear.value = false;
    }
}

function openPeriods() {
    periodsForm.value = (consultedYear.consulted.value?.periods ?? []).map((period) => ({
        label: period.label, startDate: period.startDate, endDate: period.endDate,
    }));
    editingPeriods.value = true;
}

function addPeriod() {
    const rank = periodsForm.value.length + 1;
    periodsForm.value.push({
        label: `${rank === 1 ? '1er' : `${rank}e`} trimestre`,
        startDate: '', endDate: '',
    });
}

function removePeriod(index: number) {
    periodsForm.value.splice(index, 1);
}

/* Clôture de l'année consultée. */
const closure = ref<YearClosure | null>(null);
const confirmingClose = ref(false);
const closing = ref(false);

async function loadClosure() {
    const year = consultedYear.consulted.value;
    if (!year) return;
    try {
        closure.value = await settings.closure(year.id);
    } catch {
        closure.value = null;
    }
}

async function closeYear() {
    const year = consultedYear.consulted.value;
    if (!year) return;
    closing.value = true;
    try {
        closure.value = await settings.closeYear(year.id);
        confirmingClose.value = false;
        await loadYears();
        done(`L'année ${year.label} est clôturée.`);
    } catch (e) {
        fail(e, "L'année n'a pas pu être clôturée.");
    } finally {
        closing.value = false;
    }
}

async function submitPeriods() {
    const year = consultedYear.consulted.value;
    if (!year) return;
    savingYear.value = true;
    try {
        await settings.definePeriods(year.id, periodsForm.value);
        editingPeriods.value = false;
        await loadYears();
        done('Trimestres enregistrés.');
    } catch (e) {
        fail(e, "Les trimestres n'ont pas pu être enregistrés.");
    } finally {
        savingYear.value = false;
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
                    <!-- Un seul formulaire pour les deux cartes.

                         Les contacts sont enregistrés par la même route que l'identité, mais
                         vivaient hors du formulaire : le bouton tombait donc au milieu de l'écran,
                         au-dessus de champs qu'il enregistre pourtant. On voyait « Enregistrer »,
                         puis deux champs de plus, et rien pour les valider. -->
                    <UiCard title="Logo" sub="L'image qui représente l'établissement dans Nelima">
                        <div class="flex flex-wrap items-center gap-4">
                            <div
                                class="grid place-items-center shrink-0 overflow-hidden"
                                style="width: 96px; height: 96px; border-radius: 16px; border: 1px solid var(--border); background: var(--surface-sunken)"
                            >
                                <img
                                    v-if="logoPreview || establishment?.logo" :src="logoPreview ?? establishment?.logo ?? undefined"
                                    alt="Logo de l'établissement" style="max-width: 100%; max-height: 100%; object-fit: contain"
                                />
                                <BoIcon v-else name="building" :size="32" style="color: var(--text-faint)" />
                            </div>
                            <div class="flex flex-col gap-2 min-w-0">
                                <p class="hint" style="margin: 0">
                                    PNG, JPEG ou WebP. L'image est réduite à 512 px ; un logo carré sur fond clair rend le mieux.
                                </p>
                                <p v-if="logoError" class="text-[12.5px]" style="color: var(--danger)" role="alert">{{ logoError }}</p>
                                <div v-if="canWrite" class="flex flex-wrap gap-2">
                                    <input ref="logoInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="onLogoChosen" />
                                    <button type="button" class="btn-secondary" @click="logoInput?.click()">
                                        <BoIcon name="upload" :size="16" />
                                        {{ establishment?.logo || logoPreview ? 'Changer le logo' : 'Choisir une image' }}
                                    </button>
                                    <template v-if="logoPreview">
                                        <button type="button" class="btn-primary" :disabled="savingLogo" @click="saveLogo">
                                            <BoIcon name="check" :size="16" />
                                            {{ savingLogo ? 'Enregistrement…' : 'Enregistrer le logo' }}
                                        </button>
                                        <button type="button" class="btn-ghost" @click="logoPreview = null">Annuler</button>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </UiCard>

                    <form class="contents" @submit.prevent="submitIdentity">
                        <UiCard
                            title="Identité de l'établissement"
                            sub="Ces informations figurent sur les reçus envoyés aux familles"
                        >
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

                        </UiCard>

                        <UiCard title="Contacts">
                            <!-- Modifiables ici : ce sont les coordonnées de l'établissement, pas
                                 celles de son compte de direction, et l'école est la mieux placée
                                 pour les tenir à jour. -->
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
                                Ces coordonnées servent aux familles pour joindre l'établissement,
                                et figurent sur les reçus.
                            </p>

                            <!-- Le bouton clôt le formulaire, après le dernier champ qu'il
                                 enregistre — identité et contacts partent ensemble. -->
                            <div v-if="canWrite" class="flex gap-2 mt-4">
                                <button type="submit" class="btn-primary" :disabled="savingIdentity">
                                    <BoIcon name="check" :size="16" />
                                    {{ savingIdentity ? 'Enregistrement…' : 'Enregistrer' }}
                                </button>
                            </div>
                        </UiCard>
                    </form>
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
                                class="chip chip--pick" :disabled="!canWrite"
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
                        title="Année consultée"
                        sub="Tous vos écrans affichent cette année. Les autres utilisateurs ne sont pas concernés."
                    >
                        <div v-if="years.length" class="flex flex-wrap items-end gap-3">
                            <div>
                                <label class="field-label" for="consultedYear">Année</label>
                                <select id="consultedYear" v-model="chosenYear" class="select">
                                    <option v-for="year in years" :key="year.id" :value="year.id">
                                        {{ year.label }}{{ year.active ? ' — en cours' : '' }}{{ year.status === 'CLOSED' ? ' — clôturée' : '' }}
                                    </option>
                                </select>
                            </div>
                            <button
                                class="btn-primary" :disabled="switchingYear || chosenYear === consultedYear.consulted.value?.id"
                                @click="switchYear"
                            >
                                {{ switchingYear ? 'Changement…' : 'Afficher cette année' }}
                            </button>
                        </div>
                        <EmptyState
                            v-else
                            title="Aucune année scolaire"
                            text="Les années sont définies par l'équipe Nelima. Contactez-la si l'année en cours n'apparaît pas."
                        />
                    </UiCard>

                    <UiCard
                        v-if="consultedYear.consulted.value"
                        :title="`Trimestres ${consultedYear.consulted.value.label}`"
                        sub="Les dates de votre école : elles paraissent au calendrier de l'école et à celui des familles"
                    >
                        <template #action>
                            <button v-if="canWrite && !editingPeriods" class="btn-secondary btn-sm" @click="openPeriods">
                                <BoIcon name="edit" :size="15" /> Modifier
                            </button>
                        </template>

                        <template v-if="!editingPeriods">
                            <p class="text-[13px]">
                                Année du {{ formatDay(consultedYear.consulted.value.startDate) }} au
                                {{ formatDay(consultedYear.consulted.value.endDate) }}
                            </p>
                            <ul v-if="consultedYear.consulted.value.periods.length" class="mt-2 text-[13px]">
                                <li v-for="period in consultedYear.consulted.value.periods" :key="period.id">
                                    <b>{{ period.label }}</b> — du {{ formatDay(period.startDate) }} au {{ formatDay(period.endDate) }}
                                </li>
                            </ul>
                            <p v-else class="hint mt-2">
                                Aucun trimestre saisi : seules la rentrée et la fin d'année paraissent au calendrier.
                            </p>
                        </template>

                        <form v-else @submit.prevent="submitPeriods">
                            <p class="hint mb-2">
                                Trimestres ou semestres, autant que l'école en tient, dans les bornes de l'année.
                            </p>
                            <div
                                v-for="(period, index) in periodsForm" :key="index"
                                class="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] items-end mb-2"
                            >
                                <div>
                                    <label class="field-label">Libellé</label>
                                    <input v-model="period.label" type="text" required placeholder="1er trimestre" class="input" />
                                </div>
                                <div>
                                    <label class="field-label">Début</label>
                                    <NelimaDateField v-model="period.startDate" required />
                                </div>
                                <div>
                                    <label class="field-label">Fin</label>
                                    <NelimaDateField v-model="period.endDate" required />
                                </div>
                                <button type="button" class="btn-ghost btn-sm" @click="removePeriod(index)">Retirer</button>
                            </div>
                            <button type="button" class="btn-secondary btn-sm" @click="addPeriod">
                                <BoIcon name="plus" :size="15" /> Ajouter une période
                            </button>
                            <div class="flex gap-2 mt-4">
                                <button type="submit" class="btn-primary" :disabled="savingYear">
                                    <BoIcon name="check" :size="16" />
                                    {{ savingYear ? 'Enregistrement…' : 'Enregistrer' }}
                                </button>
                                <button type="button" class="btn-secondary" @click="editingPeriods = false">Annuler</button>
                            </div>
                        </form>
                    </UiCard>

                    <UiCard
                        v-if="closure" :title="`Clôture ${closure.label}`"
                        sub="Une année clôturée se consulte et ne se modifie plus. Il faut que tout ce qu'elle a engagé soit encaissé."
                    >
                        <template v-if="closure.status === 'CLOSED'">
                            <p class="text-[13px]">
                                <UiPill tone="mute">Clôturée</UiPill>
                                <span class="ml-2">
                                    le {{ closure.closedAt ? new Date(closure.closedAt).toLocaleDateString('fr-FR') : '—' }}
                                    <template v-if="closure.closedBy"> par {{ closure.closedBy }}</template>
                                </span>
                            </p>
                        </template>
                        <template v-else-if="closure.current">
                            <p class="text-[13px]">
                                C'est l'année en cours : elle se clôturera une fois l'année suivante commencée,
                                quand tout ce qu'elle a engagé sera encaissé.
                            </p>
                        </template>
                        <template v-else>
                            <div class="flex flex-wrap gap-6 text-[13px] mb-3">
                                <div>
                                    <div class="kpi-label">Reste à encaisser</div>
                                    <div class="kpi-value text-[20px]">{{ Number(closure.pendingAmount).toLocaleString('fr-FR') }}<small>F</small></div>
                                </div>
                                <div>
                                    <div class="kpi-label">Tranches dues</div>
                                    <div class="kpi-value text-[20px]">{{ closure.pendingCount }}</div>
                                </div>
                                <div v-if="closure.paymentsInProgress">
                                    <div class="kpi-label">Paiements en ligne en attente</div>
                                    <div class="kpi-value text-[20px]">{{ closure.paymentsInProgress }}</div>
                                </div>
                            </div>
                            <p v-if="closure.blocker" class="alert-danger mb-3">{{ closure.blocker }}</p>

                            <div v-if="closure.outstanding.length" class="table-wrap mb-3">
                                <table class="table">
                                    <thead>
                                        <tr><th>Élève</th><th>Matricule</th><th class="r">Tranches</th><th class="r">Montant</th><th /></tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="row in closure.outstanding" :key="row.studentId">
                                            <td><b>{{ row.studentName }}</b></td>
                                            <td class="nu">{{ row.registrationNumber }}</td>
                                            <td class="num">{{ row.installmentCount }}</td>
                                            <td class="num">{{ Number(row.amount).toLocaleString('fr-FR') }} F</td>
                                            <td class="text-right">
                                                <NuxtLink :to="`/app/paiements/guichet?eleve=${row.studentId}`" class="btn-ghost btn-sm">
                                                    Encaisser
                                                </NuxtLink>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <template v-if="canWrite">
                                <button
                                    v-if="!confirmingClose" class="btn-primary" :disabled="!closure.closable"
                                    @click="confirmingClose = true"
                                >Clôturer l'année {{ closure.label }}</button>
                                <div v-else class="flex flex-wrap items-center gap-2">
                                    <span class="text-[13px] font-semibold" style="color: var(--danger)">
                                        Clôture définitive : plus rien ne pourra être créé ni modifié dans {{ closure.label }}.
                                    </span>
                                    <button class="btn-primary" :disabled="closing" @click="closeYear">
                                        {{ closing ? 'Clôture…' : 'Confirmer la clôture' }}
                                    </button>
                                    <button class="btn-secondary" @click="confirmingClose = false">Annuler</button>
                                </div>
                            </template>
                        </template>
                    </UiCard>

                    <UiCard
                        v-if="years.length" title="Années scolaires" sub="Définies par la plateforme Nelima, communes à toutes les écoles"
                        :pad="false"
                    >
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Année</th>
                                    <th>Du</th>
                                    <th>Au</th>
                                    <th>Vos trimestres</th>
                                    <th>Statut</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="year in years" :key="year.id">
                                    <td><b>{{ year.label }}</b></td>
                                    <td>{{ formatDay(year.startDate) }}</td>
                                    <td>{{ formatDay(year.endDate) }}</td>
                                    <td>
                                        <span v-if="!year.periods.length" style="color: var(--text-faint)">aucun</span>
                                        <span v-else>{{ year.periods.map((p) => p.label).join(' · ') }}</span>
                                    </td>
                                    <td class="flex gap-1.5">
                                        <UiPill v-if="year.active" tone="ok">En cours</UiPill>
                                        <UiPill v-if="year.status === 'CLOSED'" tone="mute">Clôturée</UiPill>
                                        <UiPill v-if="year.consulted" tone="info">Affichée</UiPill>
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
