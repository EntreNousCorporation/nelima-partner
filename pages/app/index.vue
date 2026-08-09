<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';
import { isoDate, entryKindLabel, entryKindTone, type CalendarEntry } from '~/composables/useCalendar';
import { paymentMeanLabel, type Transaction } from '~/composables/useTransactions';

const auth = useAuthStore();
const { can } = usePermissions();

/**
 * Tableau de bord.
 *
 * **Il n'est pas le même pour tous.** Un comptable ouvre le portail pour savoir ce qui est rentré ;
 * une secrétaire, pour savoir qui est là et quelles classes se remplissent. Servir à la seconde
 * quatre cartes de montants qu'elle n'a pas le droit de lire lui donnerait quatre tirets, et
 * l'écran passerait pour cassé.
 *
 * La bascule suit `accounting:read` — la permission du journal des encaissements, qui est
 * exactement ce que lisent les cartes d'argent.
 */
const money = computed(() => can('accounting:read'));
const canSeeCalendar = computed(() => can('calendar:read'));
const canSeeStaff = computed(() => can('staff:read'));
const canSeeActivities = computed(() => can('activity:read'));

type ReceiptSummary = {
    id: string; number: string; amount: number; studentLabel: string; issuedAt: string;
};
type OverdueStudent = {
    studentId: string; label: string; registrationNumber: string;
    levelCode: string | null; daysLate: number; amount: number;
    /** Rappels déjà envoyés à la famille, tous canaux confondus. */
    reminderCount: number;
};
type MonthlyPoint = { month: string; expected: number; collected: number };

type ClassFilling = {
    id: string; name: string; levelLabel: string | null; studentCount: number; capacity: number;
};

type Summary = {
    studentCount: number;
    collectedThisMonth: number;
    receiptsThisMonth: number;
    collectedToday: number;
    paymentsToday: number;
    expectedThisMonth: number;
    collectedPreviousMonth: number;
    monthly: MonthlyPoint[];
    classFilling: ClassFilling[];
    pendingAmount: number;
    pendingCount: number;
    overdueAmount: number;
    overdueCount: number;
    topOverdue: OverdueStudent[];
    recentReceipts: ReceiptSummary[];
};

// `useRequestFetch` et non `$fetch` : en rendu serveur, seul le premier réémet le cookie de
// session, sans quoi l'appel repartirait sans authentification et l'écran s'afficherait vide.
const request = useRequestFetch();
const { data: summary, pending, error } = await useAsyncData<Summary>(
    'dashboard-summary',
    () => request('/api/v1/dashboard/summary') as Promise<Summary>,
);

// Les montants viennent du serveur : ici on ne fait que les mettre en forme, et toujours par
// `useMoney` — le séparateur de milliers d'Intl est une espace fine qu'il faut normaliser.
const xof = fm;
const compact = fmc;

function day(iso?: string) {
    return iso ? new Date(iso).toLocaleDateString('fr-FR') : '—';
}

function hour(iso?: string) {
    return iso
        ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '—';
}

const monthLabel = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
const monthName = monthLabel.split(' ')[0];

/** Part de l'attendu du mois effectivement encaissée. */
const recoveryRate = computed(() => {
    const expected = summary.value?.expectedThisMonth ?? 0;
    if (!expected) return null;
    return ((summary.value?.collectedThisMonth ?? 0) / expected) * 100;
});

/**
 * Écart avec le mois précédent, en pourcentage.
 *
 * Rendu nul quand le mois précédent est à zéro : une progression « infinie » ne veut rien dire, et
 * afficher `+∞ %` ou `+100 %` sur un premier mois d'activité serait trompeur.
 */
const deltaCollected = computed(() => {
    const previous = summary.value?.collectedPreviousMonth ?? 0;
    if (!previous) return null;
    const value = (((summary.value?.collectedThisMonth ?? 0) - previous) / previous) * 100;
    return Math.round(value * 10) / 10;
});

/**
 * École qui n'a pas encore démarré.
 *
 * Sans élève ni encaissement, le tableau de bord n'affiche que des zéros : il ne dit pas si la
 * plateforme est en panne ou s'il reste des étapes à franchir. Le prototype répond par une liste
 * de mise en route, et c'est la bonne réponse.
 */
const onboarding = computed(() => {
    const students = summary.value?.studentCount ?? 0;
    const receipts = summary.value?.receiptsThisMonth ?? 0;
    return students === 0 && receipts === 0;
});

/**
 * Étapes de mise en route.
 *
 * Chacune est déduite de l'état réel, jamais d'un drapeau qu'il faudrait penser à cocher : une
 * case « faite » alors que l'école n'a aucun niveau serait pire que pas de liste du tout.
 */
const steps = computed(() => [
    {
        label: 'Établissement créé',
        hint: auth.user?.establishmentName ?? 'Votre établissement',
        done: true,
        to: '/app/parametres',
    },
    {
        label: 'Déclarer les niveaux enseignés',
        hint: 'Un élève ne peut être inscrit que dans un niveau déclaré',
        done: (summary.value?.studentCount ?? 0) > 0,
        to: '/app/parametres?section=niveaux',
    },
    {
        label: 'Inscrire les élèves',
        hint: 'Saisie une par une, ou import d\'un fichier CSV',
        done: (summary.value?.studentCount ?? 0) > 0,
        to: '/app/eleves',
    },
    {
        label: 'Définir les frais et leurs échéances',
        hint: 'Scolarité, cantine, transport — puis le découpage en tranches',
        done: (summary.value?.expectedThisMonth ?? 0) > 0,
        to: '/app/paiements/frais',
    },
    {
        label: 'Encaisser un premier règlement',
        hint: 'Au guichet, ou en ligne depuis l\'application des parents',
        done: (summary.value?.receiptsThisMonth ?? 0) > 0,
        to: '/app/paiements/guichet',
    },
]);

const stepsDone = computed(() => steps.value.filter((step) => step.done).length);

const collected = computed(() => compact(summary.value?.collectedThisMonth));
const outstanding = computed(() => compact(summary.value?.overdueAmount));
const today = computed(() => compact(summary.value?.collectedToday));

/* ---------------- Compléments chargés côté client ---------------- */

/**
 * Ces cartes sont chargées après le premier rendu, et leur échec ne fait rien tomber.
 *
 * Elles complètent le tableau de bord ; elles ne le fondent pas. Les intégrer à l'appel principal
 * ferait dépendre l'affichage des chiffres d'argent de la disponibilité du calendrier.
 */
const events = ref<CalendarEntry[]>([]);
const methods = ref<{ label: string; amount: number; count: number; share: number; tone: string }[]>([]);
const staffPresence = ref<{ present: number; total: number } | null>(null);
const activityCount = ref<{ open: number; enrolled: number } | null>(null);
/** Année scolaire en cours, telle que les paramètres la déclarent. */
const academicYear = ref<string | null>(null);

async function loadExtras() {
    const from = isoDate(new Date());

    try {
        const { years } = useSettings();
        academicYear.value = (await years()).find((year) => year.active)?.label ?? null;
    } catch {
        academicYear.value = null;
    }
    const to = isoDate(new Date(new Date().setDate(new Date().getDate() + 15)));

    if (canSeeCalendar.value) {
        try {
            const { list } = useCalendar();
            events.value = (await list(from, to)).slice(0, 5);
        } catch {
            events.value = [];
        }
    }

    if (money.value) {
        try {
            const { list } = useTransactions();
            const firstOfMonth = new Date();
            firstOfMonth.setDate(1);
            const rows = await list(isoDate(firstOfMonth), from);
            methods.value = aggregateByChannel(rows);
        } catch {
            methods.value = [];
        }
    }

    if (!money.value && canSeeStaff.value) {
        try {
            const { attendanceSheet } = useStaff();
            const sheet = await attendanceSheet(from);
            staffPresence.value = {
                present: sheet.filter((line) => line.status === 'PRESENT' || line.status === 'LATE').length,
                total: sheet.length,
            };
        } catch {
            staffPresence.value = null;
        }
    }

    if (!money.value && canSeeActivities.value) {
        try {
            const { list } = useActivities();
            const rows = await list();
            activityCount.value = {
                open: rows.filter((activity) => activity.status === 'ACTIVE').length,
                enrolled: rows.reduce((total, activity) => total + (activity.enrolledCount ?? 0), 0),
            };
        } catch {
            activityCount.value = null;
        }
    }
}

/** Teintes des canaux d'encaissement, dans l'ordre du prototype. */
const CHANNEL_TONES = ['#FF7900', '#1DC4F5', '#0A4A7A', '#8A5BFF', '#5A6B82', '#12996A'];

/**
 * Répartition des encaissements du mois par canal.
 *
 * Agrégée ici et non au serveur : la liste du mois est déjà servie à l'écran Transactions, et
 * ajouter un point d'entrée pour recompter la même chose créerait deux vérités à tenir d'accord.
 */
function aggregateByChannel(rows: Transaction[]) {
    const settled = rows.filter((row) => row.status === 'SUCCEEDED');
    const total = settled.reduce((sum, row) => sum + Number(row.amountSchool ?? 0), 0);
    const buckets = new Map<string, { amount: number; count: number }>();
    for (const row of settled) {
        const label = paymentMeanLabel(row);
        const bucket = buckets.get(label) ?? { amount: 0, count: 0 };
        bucket.amount += Number(row.amountSchool ?? 0);
        bucket.count += 1;
        buckets.set(label, bucket);
    }
    return [...buckets]
        .map(([label, bucket], index) => ({
            label,
            amount: bucket.amount,
            count: bucket.count,
            share: total ? Math.round((bucket.amount / total) * 100) : 0,
            // Une teinte par canal, prise dans un ordre fixe : le même opérateur garde sa couleur
            // d'un mois à l'autre tant qu'il occupe le même rang, et la légende se lit d'un regard.
            tone: CHANNEL_TONES[index % CHANNEL_TONES.length],
        }))
        .sort((a, b) => b.amount - a.amount);
}

onMounted(loadExtras);
</script>

<template>
    <div>
        <PageHead
            title="Tableau de bord"
            :sub="[auth.user?.establishmentName ?? 'Votre établissement', monthLabel,
                   academicYear ? `année ${academicYear}` : null].filter(Boolean).join(' · ')"
        >
            <template #actions>
                <NuxtLink v-if="can('collection:write')" to="/app/paiements/guichet" class="btn-primary">
                    <BoIcon name="cash" :size="16" />
                    Encaisser au guichet
                </NuxtLink>
            </template>
        </PageHead>

        <p v-if="error" class="alert-danger mb-4">
            Les indicateurs n'ont pas pu être chargés. Rechargez la page dans un instant.
        </p>

        <!-- Squelettes plutôt qu'un « Chargement… » : la page garde sa forme et ne saute pas
             lorsque les chiffres arrivent. -->
        <div v-if="pending" class="grid-12">
            <div v-for="n in 4" :key="n" class="card p-4 c3">
                <i class="sk h-3 w-24" />
                <i class="sk h-7 w-28 mt-3" />
            </div>
        </div>

        <template v-else-if="onboarding">
            <div
                class="flex items-center gap-3.5 rounded-xl px-4 py-3.5 mb-3.5"
                style="background: var(--brand-50); border: 1px solid var(--brand-100)"
            >
                <div
                    class="w-9 h-9 rounded-xl grid place-items-center shrink-0"
                    style="background: var(--surface-raised); color: var(--brand-600)"
                >
                    <BoIcon name="sparkles" :size="18" />
                </div>
                <div class="flex-1 min-w-0">
                    <b class="text-sm" style="color: var(--brand-700)">Bienvenue sur Nelima</b>
                    <p class="text-[12.5px] mt-0.5" style="color: var(--text-muted)">
                        Il reste {{ steps.length - stepsDone }} étape{{ steps.length - stepsDone > 1 ? 's' : '' }}
                        pour que les familles puissent régler en ligne.
                    </p>
                </div>
            </div>

            <div class="grid-12">
                <UiCard
                    class="c8" :pad="false"
                    title="Mise en route"
                    :sub="`${stepsDone} étape${stepsDone > 1 ? 's' : ''} sur ${steps.length} terminée${stepsDone > 1 ? 's' : ''}`"
                >
                    <div class="lst">
                        <div v-for="step in steps" :key="step.label" class="flex items-center gap-3">
                            <div
                                class="w-[30px] h-[30px] rounded-lg grid place-items-center shrink-0"
                                :style="step.done
                                    ? 'background: var(--success-soft); color: var(--success)'
                                    : 'background: var(--brand-50); color: var(--brand-600)'"
                            >
                                <BoIcon :name="step.done ? 'check' : 'plus'" :size="16" :stroke-width="2" />
                            </div>
                            <div class="nm flex-1 min-w-0">
                                <b :style="step.done ? 'color: var(--text-muted)' : ''">{{ step.label }}</b>
                                <span>{{ step.hint }}</span>
                            </div>
                            <UiPill v-if="step.done" tone="ok">Fait</UiPill>
                            <NuxtLink v-else :to="step.to" class="btn-primary btn-sm">Commencer</NuxtLink>
                        </div>
                    </div>
                </UiCard>

                <UiCard class="c4" title="Besoin d'un coup de main ?">
                    <p class="text-[13px] leading-relaxed" style="color: var(--text-muted)">
                        L'import d'une liste d'élèves se fait à partir d'un fichier CSV séparé par
                        des points-virgules. L'écran Élèves en donne l'en-tête exact et refuse le
                        fichier entier plutôt que d'importer des lignes fausses.
                    </p>
                    <div class="flex gap-2 mt-3.5">
                        <NuxtLink to="/app/eleves" class="btn-primary btn-sm">
                            <BoIcon name="upload" :size="15" />Importer des élèves</NuxtLink>
                        <NuxtLink to="/app/parametres?section=niveaux" class="btn-secondary btn-sm">
                            <BoIcon name="layers" :size="15" />Déclarer les niveaux
                        </NuxtLink>
                    </div>
                </UiCard>
            </div>
        </template>

        <template v-else>
            <!-- ============ Chiffres clés ============ -->
            <div class="grid-12 mb-3.5">
                <template v-if="money">
                    <KpiCard
                        class="c3" :label="`Encaissé · ${monthName}`" icon="cash"
                        :value="collected.value" :unit="collected.unit" :delta="deltaCollected"
                        :foot="`sur ${xof(summary?.expectedThisMonth)} attendus`"
                        tip="Total des reçus émis ce mois, tous moyens confondus : paiement en ligne, espèces, chèque et virement au guichet. L'écart se compare au mois précédent, non à l'an dernier."
                    />

                    <KpiCard
                        class="c3" label="Taux de recouvrement" icon="percent"
                        :value="recoveryRate !== null ? recoveryRate.toFixed(1).replace('.', ',') : '—'"
                        :unit="recoveryRate !== null ? '%' : undefined"
                        :foot="recoveryRate !== null ? 'de l\'attendu du mois' : 'aucune échéance ce mois'"
                        tip="Part des sommes attendues ce mois qui est effectivement rentrée. En dessous de 80 %, une campagne de relance se justifie."
                    >
                        <template #chart>
                            <StatDonut
                                v-if="recoveryRate !== null" :percent="recoveryRate"
                                :tone="recoveryRate < 80 ? 'var(--warning-solid)' : 'var(--success-solid)'"
                            />
                        </template>
                    </KpiCard>

                    <KpiCard
                        class="c3" label="Reste à recouvrer" icon="alert"
                        :value="outstanding.value" :unit="outstanding.unit"
                        tip="Somme des tranches dont la date d'échéance est passée sans règlement. Au-delà d'un mois, un appel téléphonique est plus efficace qu'un rappel écrit."
                    >
                        <template #foot>
                            <span>
                                <b class="nu" style="color: var(--danger)">{{ summary?.overdueCount ?? 0 }}</b>
                                échéance{{ (summary?.overdueCount ?? 0) > 1 ? 's' : '' }} dépassée{{ (summary?.overdueCount ?? 0) > 1 ? 's' : '' }}
                                · {{ xof(summary?.pendingAmount) }} dus au total
                            </span>
                        </template>
                    </KpiCard>

                    <KpiCard
                        class="c3" label="Encaissé aujourd'hui" icon="zap"
                        :value="today.value" :unit="today.unit"
                        tip="Encaissements de la journée en cours, guichet compris. La journée s'entend à l'heure d'Abidjan, non à celle du serveur."
                    >
                        <template #foot>
                            <span class="flex items-center gap-1.5">
                                <i class="live-dot" />
                                {{ summary?.paymentsToday ?? 0 }}
                                paiement{{ (summary?.paymentsToday ?? 0) > 1 ? 's' : '' }} aujourd'hui
                            </span>
                        </template>
                    </KpiCard>
                </template>

                <template v-else>
                    <KpiCard
                        class="c3" label="Effectif total" icon="students"
                        :value="String(summary?.studentCount ?? 0)"
                        :foot="`${summary?.classFilling?.length ?? 0} classe(s)`"
                        tip="Élèves inscrits dans l'établissement, qu'ils soient affectés à une classe ou non."
                    />

                    <KpiCard
                        class="c3" label="Places occupées" icon="layers"
                        :value="String(summary?.classFilling?.reduce((total, k) => total + k.studentCount, 0) ?? 0)"
                        :foot="`sur ${summary?.classFilling?.reduce((total, k) => total + k.capacity, 0) ?? 0} places déclarées`"
                        tip="Effectif rapporté à la capacité déclarée des salles. Un élève sans classe n'y figure pas : il est compté dans l'effectif total."
                    />

                    <KpiCard
                        class="c3" label="Personnel pointé" icon="user-check"
                        :value="staffPresence ? `${staffPresence.present}/${staffPresence.total}` : '—'"
                        :foot="staffPresence ? 'présents ou en retard ce matin' : 'aucun pointage aujourd\'hui'"
                        tip="Pointage du personnel saisi ce matin. Les retards sont comptés comme présents. Le pointage des élèves relève de la vie scolaire, qui n'est pas encore ouverte."
                    />

                    <KpiCard
                        class="c3" label="Activités ouvertes" icon="ball"
                        :value="String(activityCount?.open ?? 0)"
                        :foot="`${activityCount?.enrolled ?? 0} inscription(s)`"
                        tip="Activités extra-scolaires proposées aux familles. Les brouillons ne leur sont pas visibles et ne sont pas comptés ici."
                    />
                </template>
            </div>

            <div class="grid-12">
                <!-- ============ Recouvrement mensuel ============ -->
                <UiCard
                    v-if="money" class="c8"
                    title="Recouvrement mensuel"
                    sub="Attendu selon les échéanciers, comparé à ce qui est réellement rentré"
                    tip="Barre claire : ce que les échéanciers attendaient ce mois-là. Barre pleine : ce qui est réellement rentré. En orange, les mois sous 80 % de recouvrement."
                >
                    <MonthlyBars :points="summary?.monthly ?? []" />
                </UiCard>

                <!-- ============ Derniers encaissements ============ -->
                <UiCard
                    v-if="money" class="c4" :pad="false"
                    title="Derniers encaissements" sub="Guichet et paiements en ligne confondus"
                    tip="Les cinq derniers reçus émis, quel que soit le canal. Un paiement en ligne n'y figure qu'une fois la confirmation de l'opérateur reçue."
                >
                    <template #action>
                        <span class="pill" style="background: var(--success-soft); color: var(--success)">
                            <i class="live-dot" /> À jour
                        </span>
                    </template>

                    <div v-if="summary?.recentReceipts?.length">
                        <div v-for="receipt in summary.recentReceipts" :key="receipt.id" class="feed-row">
                            <AvatarBadge :name="receipt.studentLabel" :size="30" />
                            <div class="flex-1 min-w-0">
                                <b class="block text-[12.5px] font-bold truncate" style="color: var(--navy)">
                                    {{ receipt.studentLabel }}
                                </b>
                                <span class="text-[11.5px]" style="color: var(--text-faint)">
                                    Reçu {{ receipt.number }}
                                </span>
                            </div>
                            <div class="text-right">
                                <b class="nu block text-[12.5px] font-extrabold" style="color: var(--success)">
                                    +{{ xof(receipt.amount) }}
                                </b>
                                <span class="nu text-[11px]" style="color: var(--text-faint)">
                                    {{ hour(receipt.issuedAt) }} · {{ day(receipt.issuedAt) }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <EmptyState
                        v-else
                        title="Aucun encaissement"
                        text="Les règlements au guichet et les paiements en ligne des parents apparaîtront ici."
                    />

                    <template #footer>
                        <span class="text-[12px]" style="color: var(--text-faint)">
                            {{ summary?.receiptsThisMonth ?? 0 }} ce mois-ci
                        </span>
                        <NuxtLink to="/app/paiements/recus" class="btn-secondary btn-sm">Tout voir</NuxtLink>
                    </template>
                </UiCard>

                <!-- ============ Impayés à relancer ============ -->
                <UiCard
                    v-if="money" class="c8" :pad="false"
                    title="Impayés à relancer" sub="Retards les plus élevés, un élève par ligne"
                    tip="Classés par montant dû. Le retard est compté depuis la plus ancienne échéance dépassée de l'élève."
                >
                    <template #action>
                        <NuxtLink to="/app/paiements/relances" class="btn-primary btn-sm">
                            <BoIcon name="send" :size="15" />Relancer
                        </NuxtLink>
                    </template>

                    <div v-if="summary?.topOverdue?.length" class="table-wrap" style="border: 0; box-shadow: none">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Élève</th>
                                    <th>Retard</th>
                                    <th class="r">Solde dû</th>
                                    <th class="r">Relances</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="student in summary.topOverdue" :key="student.studentId">
                                    <td>
                                        <div class="flex items-center gap-2.5">
                                            <AvatarBadge :name="student.label" :size="28" />
                                            <div class="nm min-w-0">
                                                <b>{{ student.label }}</b>
                                                <span>
                                                    {{ student.levelCode ?? 'Niveau non renseigné' }}
                                                    · {{ student.registrationNumber }}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <!-- Au-delà d'un mois, le rappel écrit ne suffit plus :
                                             l'étiquette change de ton pour le signaler. -->
                                        <UiPill :tone="student.daysLate > 30 ? 'late' : 'warn'">
                                            {{ student.daysLate }} j
                                        </UiPill>
                                    </td>
                                    <td class="num">{{ xof(student.amount) }} F</td>
                                    <!-- Zéro relance sur un retard de trente jours, c'est une
                                         famille qu'on a oubliée ; cinq, une famille qui ne répond
                                         pas. Les deux appellent des gestes différents. -->
                                    <td class="num" style="color: var(--text-faint)">
                                        {{ student.reminderCount ?? 0 }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <EmptyState
                        v-else
                        title="Aucun retard"
                        text="Toutes les échéances passées ont été réglées."
                    />
                </UiCard>

                <!-- ============ Remplissage des classes ============ -->
                <UiCard
                    :class="money ? 'c4' : 'c5'"
                    title="Remplissage des classes"
                    :sub="`${summary?.studentCount ?? 0} élèves inscrits`"
                    tip="Effectif rapporté à la capacité de la salle. En orange au-delà de 92 %, en rouge en cas de dépassement."
                >
                    <template #action>
                        <NuxtLink to="/app/classes" class="btn-secondary btn-sm">Gérer</NuxtLink>
                    </template>

                    <div v-if="summary?.classFilling?.length" class="flex flex-col gap-3">
                        <div v-for="klass in summary.classFilling.slice(0, 6)" :key="klass.id">
                            <div class="flex items-center justify-between gap-3 mb-1">
                                <b class="text-[12.5px]" style="color: var(--navy)">
                                    {{ klass.name }}
                                    <span class="font-medium" style="color: var(--text-faint)">
                                        {{ klass.levelLabel ?? '' }}
                                    </span>
                                </b>
                                <!-- Un effectif au-delà de la capacité se lit en rouge : c'est la
                                     classe où l'école devra ajouter une table, pas une décoration. -->
                                <span
                                    class="nu text-[12px] font-bold"
                                    :style="klass.studentCount > klass.capacity
                                        ? 'color: var(--danger)' : 'color: var(--text-muted)'"
                                >{{ klass.studentCount }}/{{ klass.capacity }}</span>
                            </div>
                            <div class="h-1.5 rounded-full overflow-hidden" style="background: var(--surface-sunken)">
                                <i
                                    class="block h-full rounded-full"
                                    :style="{
                                        width: `${Math.min(100, klass.capacity ? klass.studentCount / klass.capacity * 100 : 0)}%`,
                                        background: klass.studentCount > klass.capacity
                                            ? 'var(--danger-solid)'
                                            : (klass.capacity && klass.studentCount / klass.capacity > .92)
                                                ? 'var(--warning-solid)' : 'var(--brand-600)',
                                    }"
                                />
                            </div>
                        </div>
                    </div>

                    <EmptyState
                        v-else
                        title="Aucune classe"
                        text="Créez vos classes pour répartir les élèves et suivre le remplissage des salles."
                    />
                </UiCard>

                <!-- ============ Événements à venir ============ -->
                <UiCard
                    v-if="canSeeCalendar" :class="money ? 'c8' : 'c7'" :pad="false"
                    title="Événements à venir" sub="Vie scolaire, examens et échéances des quinze prochains jours"
                    tip="Les quinze prochains jours. Les échéances financières ne se saisissent pas : elles sont déduites des tranches dues."
                >
                    <template #action>
                        <NuxtLink to="/app/calendrier" class="btn-secondary btn-sm">Calendrier</NuxtLink>
                    </template>

                    <div v-if="events.length" class="lst">
                        <NuxtLink
                            v-for="entry in events" :key="entry.id" to="/app/calendrier"
                            class="flex items-center gap-3"
                        >
                            <div
                                class="w-[42px] rounded-lg text-center py-1 shrink-0"
                                :style="{ background: 'var(--surface-sunken)', color: entryKindTone(entry.kind) }"
                            >
                                <div class="nu font-black text-base leading-none">
                                    {{ Number(entry.date.slice(8, 10)) }}
                                </div>
                                <div class="text-[9.5px] font-bold uppercase mt-0.5" style="letter-spacing: .06em">
                                    {{ new Date(entry.date).toLocaleDateString('fr-FR', { month: 'short' }) }}
                                </div>
                            </div>
                            <div class="nm flex-1 min-w-0">
                                <b>{{ entry.title }}</b>
                                <span>{{ entry.scope ?? 'Tout l\'établissement' }}</span>
                            </div>
                            <b
                                v-if="money && entry.amountExpected"
                                class="nu text-[12.5px] font-extrabold" style="color: var(--brand-700)"
                            >{{ xof(entry.amountExpected) }}</b>
                            <UiPill
                                :tone="entry.kind === 'FEE_DUE' ? 'info'
                                    : entry.kind === 'EXAM' ? 'late' : 'ok'"
                            >{{ entryKindLabel(entry.kind) }}</UiPill>
                        </NuxtLink>
                    </div>

                    <EmptyState
                        v-else
                        title="Rien de prévu"
                        text="Aucun événement ni échéance dans les quinze prochains jours."
                    />
                </UiCard>

                <!-- ============ Moyens de paiement ============ -->
                <UiCard
                    v-if="money" class="c4"
                    title="Moyens de paiement" :sub="`${monthName} · ${xof(summary?.collectedThisMonth)} FCFA encaissés`"
                    tip="Répartition des encaissements confirmés du mois par canal d'entrée, calculée sur le net revenant à l'école."
                >
                    <div v-if="methods.length" class="flex flex-col gap-3">
                        <div v-for="method in methods" :key="method.label">
                            <div class="flex items-center justify-between gap-2 mb-1">
                                <span class="flex items-center gap-2 text-[12.5px] font-semibold" style="color: var(--text)">
                                    <i
                                        class="w-2 h-2 rounded-sm shrink-0"
                                        :style="{ background: method.tone }"
                                    />{{ method.label }}
                                </span>
                                <span class="nu text-[12.5px] font-extrabold" style="color: var(--navy)">
                                    {{ method.share }} %
                                </span>
                            </div>
                            <div class="flex items-center gap-2.5">
                                <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background: var(--surface-sunken)">
                                    <i
                                        class="block h-full rounded-full"
                                        :style="{ width: `${Math.max(2, method.share)}%`, background: method.tone }"
                                    />
                                </div>
                                <span class="nu text-[11px] text-right" style="color: var(--text-faint); min-width: 62px">
                                    {{ xof(method.amount) }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <EmptyState
                        v-else
                        title="Aucun encaissement ce mois"
                        text="La répartition par canal apparaîtra dès le premier règlement du mois."
                    />
                </UiCard>
            </div>
        </template>
    </div>
</template>
