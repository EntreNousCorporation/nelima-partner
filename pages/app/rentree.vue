<script setup lang="ts">
import type { YearPreparation } from '~/composables/useYearPreparation';

/**
 * La rentrée de l'année consultée, en deux temps.
 *
 * D'abord les classes : celles de l'an passé se rouvrent d'un geste, titulaire repris, et l'on
 * décoche celles qui ne fonctionneront pas (pas d'instituteur). Ensuite les élèves : chaque classe
 * de l'an passé part vers une classe du niveau suivant, proposée d'office ; on décoche ceux qui ne
 * reviennent pas, on change la classe d'un redoublant. Rien n'est à recréer.
 */
const { preparation: fetchPreparation, openClasses, closeClass, reenroll } = useYearPreparation();
const consultedYear = useConsultedYear();
const { can } = usePermissions();

const data = ref<YearPreparation | null>(null);
const loading = ref(true);
const error = ref('');
const message = ref('');
const working = ref(false);

/** Classes cochées pour ouverture. */
const toOpen = reactive(new Set<string>());
/** Élèves cochés, et la classe de rentrée de chacun. */
const chosen = reactive(new Map<string, string>());
const groupTargets = reactive(new Map<string, string>());

const targetClasses = computed(() => (data.value?.classes ?? []).filter((c) => c.openedInTarget));
const pendingStudents = computed(() => (data.value?.groups ?? []).reduce((sum, g) => sum + g.students.length, 0));

const groupKey = (sourceClassId?: string | null) => sourceClassId ?? 'none';

async function load() {
    const year = consultedYear.consulted.value;
    if (!year) return;
    loading.value = true;
    error.value = '';
    try {
        data.value = await fetchPreparation(year.id);
        toOpen.clear();
        for (const c of data.value.classes) {
            if (c.openedInPrevious && !c.openedInTarget) toOpen.add(c.classId);
        }
        chosen.clear();
        groupTargets.clear();
        for (const group of data.value.groups) {
            const target = group.suggestedTargetClassId ?? '';
            groupTargets.set(groupKey(group.sourceClassId), target);
            for (const student of group.students) chosen.set(student.studentId, target);
        }
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "La rentrée n'a pas pu être chargée.";
    } finally {
        loading.value = false;
    }
}

function toggleOpen(id: string) {
    if (toOpen.has(id)) toOpen.delete(id);
    else toOpen.add(id);
}

/** La classe de rentrée d'un groupe s'applique à tous ses élèves encore cochés. */
function setGroupTarget(sourceClassId: string | null | undefined, target: string) {
    groupTargets.set(groupKey(sourceClassId), target);
    const group = data.value?.groups.find((g) => groupKey(g.sourceClassId) === groupKey(sourceClassId));
    group?.students.forEach((s) => { if (chosen.has(s.studentId)) chosen.set(s.studentId, target); });
}

function toggleStudent(studentId: string, sourceClassId?: string | null) {
    if (chosen.has(studentId)) chosen.delete(studentId);
    else chosen.set(studentId, groupTargets.get(groupKey(sourceClassId)) ?? '');
}

async function submitClasses() {
    const year = consultedYear.consulted.value;
    if (!year || !toOpen.size) return;
    working.value = true;
    error.value = '';
    try {
        await openClasses(year.id, [...toOpen]);
        message.value = `${toOpen.size} classe(s) ouverte(s) pour ${year.label}.`;
        await load();
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "Les classes n'ont pas pu être ouvertes.";
    } finally {
        working.value = false;
    }
}

async function unopen(classId: string) {
    const year = consultedYear.consulted.value;
    if (!year) return;
    error.value = '';
    try {
        await closeClass(year.id, classId);
        await load();
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "La classe n'a pas pu être fermée.";
    }
}

async function submitReenrollment() {
    const year = consultedYear.consulted.value;
    if (!year || !chosen.size) return;
    working.value = true;
    error.value = '';
    try {
        const items = [...chosen].map(([studentId, schoolClassId]) => ({ studentId, schoolClassId: schoolClassId || null }));
        const result = await reenroll(year.id, items);
        message.value = `${result.reenrolled} élève(s) réinscrit(s) pour ${year.label}, avec les frais de leur niveau.`;
        await load();
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "La réinscription n'a pas abouti.";
    } finally {
        working.value = false;
    }
}

onMounted(async () => {
    if (!consultedYear.loaded.value) await consultedYear.refresh();
    await load();
});
</script>

<template>
    <div>
        <PageHead
            :title="`Rentrée ${consultedYear.consulted.value?.label ?? ''}`"
            :sub="data?.previousLabel ? `Depuis l'année ${data.previousLabel}` : 'Première année de l\'école sur Nelima'"
        >
            <template #actions>
                <NuxtLink to="/app/parametres?section=annee" class="btn-secondary">
                    <BoIcon name="calendar" :size="16" /> Changer d'année
                </NuxtLink>
            </template>
        </PageHead>

        <p class="hint mb-3.5">
            La rentrée se prépare depuis l'année visée : pour préparer {{ consultedYear.consulted.value?.label }},
            c'est elle que vous consultez. Ce que vous faites ici ne touche pas l'année en cours.
        </p>

        <p v-if="error" class="alert-danger mb-3.5" role="alert">{{ error }}</p>
        <p v-if="message" class="alert-success mb-3.5">{{ message }}</p>

        <div v-if="loading" class="card p-4"><i class="sk h-6 w-1/2" /></div>

        <template v-else-if="data">
            <!-- ============ 1. Classes ============ -->
            <UiCard
                :title="`1. Classes de ${data.targetLabel}`"
                sub="Les classes de l'an passé sont proposées ; décochez celles qui ne fonctionneront pas cette année"
                :pad="false" class="mb-3.5"
            >
                <template #action>
                    <button
                        v-if="can('class:write')" class="btn-primary btn-sm"
                        :disabled="working || !toOpen.size" @click="submitClasses"
                    >Ouvrir {{ toOpen.size }} classe(s)</button>
                </template>
                <table class="table">
                    <thead>
                        <tr>
                            <th style="width: 1%" />
                            <th>Classe</th><th>Niveau</th><th>{{ data.previousLabel ?? 'An passé' }}</th>
                            <th>Titulaire</th><th class="r">Inscrits</th><th />
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="c in data.classes" :key="c.classId">
                            <td>
                                <input
                                    v-if="!c.openedInTarget" type="checkbox" :checked="toOpen.has(c.classId)"
                                    :disabled="!can('class:write')" :aria-label="`Ouvrir ${c.name}`"
                                    @change="toggleOpen(c.classId)"
                                />
                            </td>
                            <td><b>{{ c.name }}</b></td>
                            <td class="text-[12.5px]" style="color: var(--text-muted)">{{ c.levelLabel ?? '—' }}</td>
                            <td><UiPill :tone="c.openedInPrevious ? 'ok' : 'mute'">{{ c.openedInPrevious ? 'Ouverte' : '—' }}</UiPill></td>
                            <td class="text-[12.5px]">
                                {{ c.openedInTarget ? (c.targetTeacherName ?? 'À désigner') : (c.previousTeacherName ? `${c.previousTeacherName} (repris)` : '—') }}
                            </td>
                            <td class="num">{{ c.openedInTarget ? c.enrolledInTarget : '' }}</td>
                            <td class="text-right">
                                <UiPill v-if="c.openedInTarget" tone="info">Ouverte</UiPill>
                                <button
                                    v-if="c.openedInTarget && !c.enrolledInTarget && can('class:write')"
                                    class="btn-ghost btn-sm" @click="unopen(c.classId)"
                                >Ne pas ouvrir</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </UiCard>

            <!-- ============ 2. Réinscriptions ============ -->
            <UiCard
                v-if="data.previousYearId"
                :title="`2. Réinscriptions depuis ${data.previousLabel}`"
                :sub="pendingStudents ? `${pendingStudents} élève(s) de l'an passé pas encore réinscrit(s). Décochez ceux qui ne reviennent pas.` : 'Tous les élèves de l\'an passé sont réinscrits.'"
                class="mb-3.5"
            >
                <template #action>
                    <button
                        v-if="can('student:write') && pendingStudents" class="btn-primary btn-sm"
                        :disabled="working || !chosen.size" @click="submitReenrollment"
                    >Réinscrire {{ chosen.size }} élève(s)</button>
                </template>

                <p v-if="!targetClasses.length && pendingStudents" class="alert-danger mb-3">
                    Ouvrez d'abord les classes de {{ data.targetLabel }} : les élèves y seront réinscrits.
                </p>

                <div v-for="group in data.groups" :key="groupKey(group.sourceClassId)" class="mb-4">
                    <div class="flex flex-wrap items-center gap-2 mb-1.5">
                        <b style="color: var(--navy)">{{ group.sourceClassName }}</b>
                        <span v-if="group.levelLabel" class="tag">{{ group.levelLabel }}</span>
                        <BoIcon name="arrow-right" :size="15" />
                        <label class="inp">
                            <select
                                :value="groupTargets.get(groupKey(group.sourceClassId)) ?? ''"
                                :aria-label="`Classe de rentrée pour ${group.sourceClassName}`"
                                @change="setGroupTarget(group.sourceClassId, ($event.target as HTMLSelectElement).value)"
                            >
                                <option value="">Sans classe (à répartir)</option>
                                <option v-for="c in targetClasses" :key="c.classId" :value="c.classId">
                                    {{ c.name }}<template v-if="c.levelLabel"> · {{ c.levelLabel }}</template>
                                </option>
                            </select>
                        </label>
                    </div>
                    <div class="rounded-xl overflow-hidden" style="border: 1px solid var(--border)">
                        <div
                            v-for="s in group.students" :key="s.studentId"
                            class="flex flex-wrap items-center gap-2.5 px-3 py-2" style="border-bottom: 1px solid var(--border)"
                        >
                            <input
                                type="checkbox" :checked="chosen.has(s.studentId)" :aria-label="`Réinscrire ${s.name}`"
                                @change="toggleStudent(s.studentId, group.sourceClassId)"
                            />
                            <div class="nm flex-1 min-w-0">
                                <b>{{ s.name }}</b>
                                <span class="nu">{{ s.registrationNumber }}</span>
                            </div>
                            <!-- Un redoublant, un changement de section : la classe se change élève par élève. -->
                            <label v-if="chosen.has(s.studentId)" class="inp">
                                <select
                                    :value="chosen.get(s.studentId) ?? ''" :aria-label="`Classe de rentrée de ${s.name}`"
                                    @change="chosen.set(s.studentId, ($event.target as HTMLSelectElement).value)"
                                >
                                    <option value="">Sans classe</option>
                                    <option v-for="c in targetClasses" :key="c.classId" :value="c.classId">{{ c.name }}</option>
                                </select>
                            </label>
                            <span v-else class="text-[12px]" style="color: var(--text-faint)">Ne revient pas</span>
                        </div>
                    </div>
                </div>
            </UiCard>
        </template>
    </div>
</template>
