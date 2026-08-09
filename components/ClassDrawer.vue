<script setup lang="ts">
import { fillingRate, type SchoolClass } from '~/composables/useClasses';
import { formatAmount } from '~/composables/useBilling';
import { type Student } from '~/composables/useStudents';

/**
 * Détail d'une classe : ses attributs, son remplissage, ce que ses familles doivent, et la liste
 * des élèves avec de quoi les affecter ou les en retirer.
 *
 * <p>C'est l'écran de la rentrée : on y répartit, et on doit voir en même temps qui n'a pas encore
 * de classe. D'où la recherche parmi les élèves non affectés, dans le même tiroir.
 */
const props = defineProps<{ schoolClass: SchoolClass }>();
const emit = defineEmits<{ close: []; changed: [] }>();

const { assign, unassign } = useClasses();
const { search } = useStudents();

const members = ref<Student[]>([]);
const loading = ref(true);
const working = ref(false);
const error = ref('');

/* ---- Ajout d'élèves ---- */
const query = ref('');
const candidates = ref<Student[]>([]);
const searching = ref(false);

const filling = computed(() => fillingRate(props.schoolClass));
const over = computed(() => props.schoolClass.studentCount > props.schoolClass.capacity);

const recovery = computed(() => {
    const collected = Number(props.schoolClass.collectedAmount ?? 0);
    const outstanding = Number(props.schoolClass.outstandingAmount ?? 0);
    const total = collected + outstanding;
    return total > 0 ? (collected / total) * 100 : null;
});

async function loadMembers() {
    loading.value = true;
    try {
        const result = await search({ page: 0, size: 200, schoolClassId: props.schoolClass.id });
        members.value = result.content ?? [];
    } finally {
        loading.value = false;
    }
}

let debounce: ReturnType<typeof setTimeout> | undefined;

watch(query, (value) => {
    clearTimeout(debounce);
    if (value.trim().length < 2) {
        candidates.value = [];
        return;
    }
    debounce = setTimeout(async () => {
        searching.value = true;
        try {
            // Seuls les élèves sans classe sont proposés : déplacer un élève d'une classe à une
            // autre est une autre opération, qui se fait depuis sa fiche et se voit.
            const result = await search({
                page: 0, size: 5, keyword: value, unassignedOnly: true,
            });
            candidates.value = result.content ?? [];
        } finally {
            searching.value = false;
        }
    }, 280);
});

async function add(student: Student) {
    error.value = '';
    working.value = true;
    try {
        await assign(props.schoolClass.id, [student.id]);
        query.value = '';
        candidates.value = [];
        await loadMembers();
        emit('changed');
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "L'élève n'a pas pu être affecté.";
    } finally {
        working.value = false;
    }
}

async function remove(student: Student) {
    error.value = '';
    working.value = true;
    try {
        await unassign(props.schoolClass.id, student.id);
        await loadMembers();
        emit('changed');
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "L'élève n'a pas pu être retiré.";
    } finally {
        working.value = false;
    }
}

onMounted(loadMembers);
</script>

<template>
    <SideDrawer
        :title="schoolClass.name"
        :sub="[schoolClass.levelLabel ?? 'Niveau non renseigné',
               schoolClass.room ? `salle ${schoolClass.room}` : null,
               schoolClass.mainTeacherName ?? 'titulaire à désigner'].filter(Boolean).join(' · ')"
        @close="emit('close')"
    >
        <template #avatar>
            <div
                class="w-11 h-11 rounded-xl grid place-items-center shrink-0 nu font-black text-[13px]"
                style="background: var(--brand-50); color: var(--brand-700)"
            >{{ schoolClass.name.replace(/\s/g, '').slice(0, 3) }}</div>
        </template>

        <div class="grid grid-cols-2 gap-3 mb-5">
            <div class="card p-3.5">
                <div class="kpi-label">Effectif</div>
                <div class="kpi-value text-[22px]">
                    {{ schoolClass.studentCount }}<small>/ {{ schoolClass.capacity }}</small>
                </div>
                <div class="h-1.5 rounded-full mt-2.5 overflow-hidden" style="background: var(--surface-sunken)">
                    <i
                        class="block h-full rounded-full"
                        :style="{
                            width: `${Math.min(100, filling)}%`,
                            background: over ? 'var(--danger-solid)'
                                : filling > 92 ? 'var(--warning-solid)' : 'var(--brand-600)',
                        }"
                    />
                </div>
                <p v-if="over" class="text-[11.5px] mt-1.5 font-semibold" style="color: var(--danger)">
                    Capacité dépassée
                </p>
            </div>

            <div class="card p-3.5">
                <div class="kpi-label">Recouvrement</div>
                <div class="kpi-value text-[22px]">
                    <template v-if="recovery !== null">
                        <!-- Arrondi vers le bas : à 99,7 %, afficher 100 % à côté d'un solde encore
                             dû se lit comme une contradiction. -->
                        {{ Math.floor(recovery) }}<small>%</small>
                    </template>
                    <template v-else>—</template>
                </div>
                <p class="text-[11.5px] mt-2" style="color: var(--text-faint)">
                    {{ formatAmount(schoolClass.outstandingAmount) }} encore dus
                </p>
            </div>
        </div>

        <p class="sec">Affecter un élève</p>
        <div class="mb-1.5">
            <input
                v-model="query" type="search" class="input"
                placeholder="Nom ou matricule d'un élève sans classe"
                aria-label="Rechercher un élève sans classe"
            />
        </div>
        <p v-if="searching" class="text-[12px] mb-4" style="color: var(--text-faint)">Recherche…</p>
        <div
            v-else-if="candidates.length" class="rounded-xl overflow-hidden mb-4"
            style="border: 1px solid var(--border)"
        >
            <button
                v-for="candidate in candidates" :key="candidate.id"
                class="flex items-center gap-2.5 px-3 py-2 w-full text-left"
                style="border-bottom: 1px solid var(--border)"
                :disabled="working" @click="add(candidate)"
            >
                <AvatarBadge :name="`${candidate.firstName} ${candidate.lastName}`" :size="26" />
                <div class="nm flex-1 min-w-0">
                    <b>{{ candidate.lastName }} {{ candidate.firstName }}</b>
                    <span class="nu">{{ candidate.registrationNumber }}</span>
                </div>
                <span class="btn-secondary btn-sm">Affecter</span>
            </button>
        </div>
        <p
            v-else-if="query.trim().length >= 2" class="text-[12px] mb-4"
            style="color: var(--text-faint)"
        >
            Aucun élève sans classe ne correspond. Un élève déjà affecté ailleurs se déplace depuis
            sa fiche.
        </p>

        <p v-if="error" class="alert-danger mb-4" role="alert">{{ error }}</p>

        <p class="sec">Élèves de la classe</p>
        <div v-if="loading" class="flex flex-col gap-2.5">
            <i v-for="n in 4" :key="n" class="sk h-6" />
        </div>
        <div v-else-if="members.length" class="rounded-xl overflow-hidden" style="border: 1px solid var(--border)">
            <div
                v-for="student in members" :key="student.id"
                class="flex items-center gap-2.5 px-3 py-2"
                style="border-bottom: 1px solid var(--border)"
            >
                <AvatarBadge :name="`${student.firstName} ${student.lastName}`" :size="26" tone="mute" />
                <div class="nm flex-1 min-w-0">
                    <b>{{ student.lastName }} {{ student.firstName }}</b>
                    <span class="nu">{{ student.registrationNumber }}</span>
                </div>
                <button class="btn-ghost btn-sm" :disabled="working" @click="remove(student)">
                    Retirer
                </button>
            </div>
        </div>
        <p v-else class="text-[12.5px]" style="color: var(--text-faint)">
            Classe vide. Affectez-y des élèves depuis le champ ci-dessus.
        </p>
    </SideDrawer>
</template>
