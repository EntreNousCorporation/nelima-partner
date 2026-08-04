<script setup lang="ts">
import {
    fillingRate, kindLabel, slotLabel, statusLabel, type Activity, type ActivityEnrollment,
} from '~/composables/useActivities';

/**
 * Fiche d'une activité : son organisation, qui elle convie, où en est son remplissage, et la liste
 * de ses inscrits.
 *
 * La liste d'attente y figure à part, dans son ordre d'arrivée : c'est cet ordre qui décide à qui
 * revient la prochaine place, et l'afficher évite qu'on croie pouvoir choisir.
 */
const props = defineProps<{ activity: Activity }>();
const emit = defineEmits<{ close: []; changed: [] }>();

const { enrollments, cancel } = useActivities();
const { can } = usePermissions();

const lines = ref<ActivityEnrollment[]>([]);
const loading = ref(true);
const working = ref(false);
const error = ref('');

const canWrite = computed(() => can('activity:write'));

const mine = computed(() => lines.value
    .filter((line) => line.activityId === props.activity.id));
const enrolled = computed(() => mine.value.filter((line) => line.status === 'ENROLLED'));
const waiting = computed(() => mine.value
    .filter((line) => line.status === 'WAITLISTED')
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)));

const filling = computed(() => fillingRate(props.activity));
const full = computed(() => props.activity.enrolledCount >= props.activity.capacity);

async function load() {
    loading.value = true;
    try {
        lines.value = await enrollments();
    } catch {
        error.value = "Les inscriptions n'ont pas pu être chargées.";
    } finally {
        loading.value = false;
    }
}

async function remove(line: ActivityEnrollment) {
    error.value = '';
    working.value = true;
    try {
        await cancel(props.activity.id, line.studentId);
        await load();
        emit('changed');
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "L'inscription n'a pas pu être annulée.";
    } finally {
        working.value = false;
    }
}

onMounted(load);
</script>

<template>
    <SideDrawer
        :title="activity.name"
        :sub="[kindLabel(activity.kind), slotLabel(activity), activity.place].filter(Boolean).join(' · ')"
        @close="emit('close')"
    >
        <div class="grid grid-cols-2 gap-3 mb-5">
            <div class="card p-3.5">
                <div class="kpi-label">Places</div>
                <div class="kpi-value text-[22px]">
                    {{ activity.enrolledCount }}<small>/ {{ activity.capacity }}</small>
                </div>
                <div class="h-1.5 rounded-full mt-2.5 overflow-hidden" style="background: var(--surface-sunken)">
                    <i
                        class="block h-full rounded-full"
                        :style="{
                            width: `${Math.min(100, filling)}%`,
                            background: full ? 'var(--danger-solid)'
                                : filling > 85 ? 'var(--warning-solid)' : 'var(--brand-600)',
                        }"
                    />
                </div>
                <p class="text-[11.5px] mt-1.5" style="color: var(--text-faint)">
                    <template v-if="full">
                        Complet — les demandes partent en liste d'attente
                    </template>
                    <template v-else>{{ activity.remainingSeats }} place(s) restante(s)</template>
                </p>
            </div>

            <div class="card p-3.5">
                <div class="kpi-label">Recettes attendues</div>
                <div class="kpi-value text-[22px]">
                    <template v-if="activity.price">
                        {{ Math.round(Number(activity.expectedRevenue ?? 0)).toLocaleString('fr-FR') }}<small>F</small>
                    </template>
                    <template v-else>—</template>
                </div>
                <p class="text-[11.5px] mt-2" style="color: var(--text-faint)">
                    <template v-if="activity.price">
                        {{ Math.round(Number(activity.price)).toLocaleString('fr-FR') }} F par élève
                    </template>
                    <template v-else>activité gratuite</template>
                </p>
            </div>
        </div>

        <p class="sec">Organisation</p>
        <dl class="rounded-xl overflow-hidden mb-5" style="border: 1px solid var(--border)">
            <div class="flex px-3 py-2" style="border-bottom: 1px solid var(--border)">
                <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">Encadrant</dt>
                <dd class="text-[12.5px] font-semibold">{{ activity.coachName ?? 'à désigner' }}</dd>
            </div>
            <div class="flex px-3 py-2" style="border-bottom: 1px solid var(--border)">
                <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">Créneau</dt>
                <dd class="text-[12.5px] font-semibold">{{ slotLabel(activity) }}</dd>
            </div>
            <div class="flex px-3 py-2" style="border-bottom: 1px solid var(--border)">
                <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">Période</dt>
                <dd class="text-[12.5px] font-semibold">{{ activity.periodLabel ?? '—' }}</dd>
            </div>
            <div class="flex px-3 py-2">
                <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">État</dt>
                <dd class="text-[12.5px] font-semibold">{{ statusLabel(activity.status) }}</dd>
            </div>
        </dl>

        <p class="sec">Classes conviées</p>
        <p class="text-[12.5px] mb-5" style="color: var(--text)">
            <template v-if="activity.openToAll">
                <b style="color: var(--navy)">Tout l'établissement</b>
            </template>
            <template v-else-if="activity.eligibleClasses.length">
                {{ activity.eligibleClasses.map((c) => c.name).join(' · ') }}
            </template>
            <span v-else style="color: var(--text-faint)">
                Aucune classe conviée : personne ne peut s'inscrire.
            </span>
        </p>

        <p v-if="error" class="alert-danger mb-4" role="alert">{{ error }}</p>

        <p class="sec">Inscrits</p>
        <p v-if="loading" class="text-[12.5px]" style="color: var(--text-faint)">Chargement…</p>
        <div
            v-else-if="enrolled.length" class="rounded-xl overflow-hidden mb-5"
            style="border: 1px solid var(--border)"
        >
            <div
                v-for="line in enrolled" :key="line.id"
                class="flex items-center gap-2.5 px-3 py-2"
                style="border-bottom: 1px solid var(--border)"
            >
                <AvatarBadge :name="`${line.studentLastName} ${line.studentFirstName}`" :size="26" />
                <div class="flex-1 min-w-0">
                    <b class="text-[13px]" style="color: var(--navy)">
                        {{ line.studentLastName }} {{ line.studentFirstName }}
                    </b>
                    <span class="block text-[11.5px]" style="color: var(--text-faint)">
                        {{ line.className ?? 'sans classe' }}
                    </span>
                </div>
                <button
                    v-if="canWrite && !line.partiallyPaid" class="btn-ghost btn-sm"
                    :disabled="working" @click="remove(line)"
                >Retirer</button>
                <span v-else-if="line.partiallyPaid" class="text-[11.5px]" style="color: var(--text-faint)">
                    encaissée
                </span>
            </div>
        </div>
        <p v-else class="text-[12.5px] mb-5" style="color: var(--text-faint)">
            Personne n'est encore inscrit.
        </p>

        <template v-if="waiting.length">
            <p class="sec">Liste d'attente</p>
            <div class="rounded-xl overflow-hidden" style="border: 1px solid var(--border)">
                <div
                    v-for="(line, index) in waiting" :key="line.id"
                    class="flex items-center gap-2.5 px-3 py-2"
                    style="border-bottom: 1px solid var(--border)"
                >
                    <!-- Le rang est affiché : c'est l'ordre d'arrivée qui décide à qui revient la
                         prochaine place, et le montrer évite qu'on croie pouvoir choisir. -->
                    <span class="nu text-[12px] font-bold" style="color: var(--text-faint); width: 18px">
                        {{ index + 1 }}
                    </span>
                    <div class="flex-1 min-w-0">
                        <b class="text-[13px]" style="color: var(--navy)">
                            {{ line.studentLastName }} {{ line.studentFirstName }}
                        </b>
                        <span class="block text-[11.5px]" style="color: var(--text-faint)">
                            {{ line.className ?? 'sans classe' }}
                        </span>
                    </div>
                    <button
                        v-if="canWrite" class="btn-ghost btn-sm" :disabled="working"
                        @click="remove(line)"
                    >Retirer</button>
                </div>
            </div>
        </template>
    </SideDrawer>
</template>
