<script setup lang="ts">
import type { SchoolClass, TimetableSlot } from '~/composables/useClasses';
import { WEEK_DAYS } from '~/composables/useActivities';
import { fullName, type StaffMember } from '~/composables/useStaff';
import { useAuthStore } from '~/stores/auth';

/**
 * Emploi du temps d'une classe : sa semaine type, jour par jour.
 *
 * <p>Une liste par jour plutôt qu'une grille : le tiroir fait 560 pixels, et six colonnes de
 * jours y rendraient chaque cours illisible. La grille complète existe — c'est la version
 * imprimable, celle qu'on affiche au mur de la classe.
 *
 * <p>Les chevauchements (deux cours à la fois, un enseignant à deux endroits) sont refusés par le
 * serveur, qui seul voit toutes les classes : l'écran se contente d'afficher sa réponse.
 */
const props = defineProps<{ schoolClass: SchoolClass }>();

const { timetable, addSlot, updateSlot, removeSlot } = useClasses();
const { list: listStaff } = useStaff();
const { can } = usePermissions();
const auth = useAuthStore();

const canWrite = computed(() => can('class:write'));

const slots = ref<TimetableSlot[]>([]);
const teachers = ref<StaffMember[]>([]);
const loading = ref(true);
const error = ref('');

const showForm = ref(false);
const editing = ref<TimetableSlot | null>(null);
const saving = ref(false);
const formError = ref('');
const form = reactive({
    dayOfWeek: 'MONDAY', startTime: '', endTime: '', subject: '', teacherId: '', room: '',
});

const hhmm = (time?: string) => (time ?? '').slice(0, 5);

/** Les jours qui ont au moins un cours, dans l'ordre de la semaine. */
const days = computed(() => WEEK_DAYS
    .map((day) => ({ ...day, slots: slots.value.filter((slot) => slot.dayOfWeek === day.value) }))
    .filter((day) => day.slots.length));

/** Matières déjà saisies, proposées à la frappe : « Mathématiques » s'écrit ainsi une seule fois. */
const knownSubjects = computed(() => [...new Set(slots.value.map((slot) => slot.subject))].sort());

async function load() {
    loading.value = true;
    error.value = '';
    try {
        slots.value = await timetable(props.schoolClass.id);
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "L'emploi du temps n'a pas pu être chargé.";
    } finally {
        loading.value = false;
    }
}

function openCreate(dayOfWeek = 'MONDAY') {
    editing.value = null;
    // On propose de reprendre là où la journée s'arrête : c'est presque toujours le créneau suivant.
    const last = slots.value.filter((slot) => slot.dayOfWeek === dayOfWeek).at(-1);
    Object.assign(form, {
        dayOfWeek, startTime: hhmm(last?.endTime), endTime: '', subject: '', teacherId: '',
        room: '',
    });
    formError.value = '';
    showForm.value = true;
}

function openEdit(slot: TimetableSlot) {
    if (!canWrite.value) return;
    editing.value = slot;
    Object.assign(form, {
        dayOfWeek: slot.dayOfWeek, startTime: hhmm(slot.startTime), endTime: hhmm(slot.endTime),
        subject: slot.subject, teacherId: slot.teacherId ?? '', room: slot.room ?? '',
    });
    formError.value = '';
    showForm.value = true;
}

async function save() {
    formError.value = '';
    if (!form.startTime || !form.endTime) {
        formError.value = "Indiquez l'heure de début et l'heure de fin.";
        return;
    }
    if (form.endTime <= form.startTime) {
        formError.value = "L'heure de fin doit suivre l'heure de début.";
        return;
    }
    if (!form.subject.trim()) {
        formError.value = 'Indiquez la matière.';
        return;
    }
    saving.value = true;
    const body = {
        dayOfWeek: form.dayOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
        subject: form.subject.trim(),
        teacherId: form.teacherId || undefined,
        room: form.room.trim() || undefined,
    };
    try {
        if (editing.value) {
            await updateSlot(props.schoolClass.id, editing.value.id, body);
        } else {
            await addSlot(props.schoolClass.id, body);
        }
        showForm.value = false;
        await load();
    } catch (e: any) {
        // Le message du serveur nomme le cours ou la classe en conflit : c'est lui qu'il faut lire.
        formError.value = e?.data?.debugMessage ?? "Le créneau n'a pas pu être enregistré.";
    } finally {
        saving.value = false;
    }
}

async function remove() {
    if (!editing.value) return;
    saving.value = true;
    try {
        await removeSlot(props.schoolClass.id, editing.value.id);
        showForm.value = false;
        await load();
    } catch (e: any) {
        formError.value = e?.data?.debugMessage ?? "Le créneau n'a pas pu être supprimé.";
    } finally {
        saving.value = false;
    }
}

function escapeHtml(value: string | undefined | null): string {
    return String(value ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

/**
 * Grille imprimable : les jours en colonnes, les plages horaires en lignes.
 *
 * <p>Une ligne par plage distincte : une école dont les cours ne commencent pas tous aux mêmes
 * heures aura plus de lignes, mais aucun cours n'est jamais déformé pour tenir dans une case.
 */
function printGrid() {
    const cls = props.schoolClass;
    const school = auth.user?.establishmentName ?? 'Établissement';
    const usedDays = WEEK_DAYS.filter((day) => day.value !== 'SATURDAY'
        || slots.value.some((slot) => slot.dayOfWeek === 'SATURDAY'));
    const ranges = [...new Set(slots.value.map((s) => `${hhmm(s.startTime)}–${hhmm(s.endTime)}`))].sort();
    const cell = (day: string, range: string) => slots.value
        .filter((s) => s.dayOfWeek === day && `${hhmm(s.startTime)}–${hhmm(s.endTime)}` === range)
        .map((s) => `<b>${escapeHtml(s.subject)}</b>`
            + (s.teacherName ? `<br><span>${escapeHtml(s.teacherName)}</span>` : '')
            + (s.room ? `<br><span>${escapeHtml(s.room)}</span>` : ''))
        .join('');
    const rows = ranges.map((range) => `<tr><th class="h">${range}</th>`
        + usedDays.map((day) => `<td>${cell(day.value, range)}</td>`).join('') + '</tr>').join('');
    const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
        + `<title>Emploi du temps — ${escapeHtml(cls.name)}</title><style>`
        + 'body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px}'
        + '.s{font-size:13px;color:#444}h1{font-size:18px;margin:2px 0 12px}'
        + 'table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}'
        + 'th,td{border:1px solid #999;padding:6px;text-align:center;vertical-align:middle}'
        + 'thead th{background:#f0f0f0}th.h{width:90px;background:#f7f7f7;white-space:nowrap}'
        + 'td span{color:#555;font-size:11px}'
        + '@page{size:landscape;margin:12mm}@media print{body{margin:0}}'
        + '</style></head><body>'
        + `<div class="s">${escapeHtml(school)}</div>`
        + `<h1>Emploi du temps — ${escapeHtml(cls.name)}</h1>`
        + `<table><thead><tr><th class="h">Horaire</th>${usedDays.map((d) => `<th>${d.label}</th>`).join('')}</tr></thead>`
        + `<tbody>${rows}</tbody></table></body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 150);
}

onMounted(async () => {
    try {
        teachers.value = (await listStaff()).filter((member) => member.role === 'TEACHER');
    } catch {
        // Sans droit de lecture sur le personnel, le créneau s'enregistre sans enseignant.
        teachers.value = [];
    }
    await load();
});
</script>

<template>
    <div>
        <div class="flex items-center justify-between" style="margin-bottom: 6px">
            <p class="sec" style="margin: 0">Semaine type</p>
            <span class="flex items-center gap-2">
                <button
                    class="btn-secondary btn-sm" :disabled="loading || !slots.length"
                    title="Imprimer la grille de la semaine" @click="printGrid"
                >
                    <BoIcon name="printer" :size="14" /> Imprimer
                </button>
                <button v-if="canWrite && !showForm" class="btn-primary btn-sm" @click="openCreate()">
                    Ajouter un cours
                </button>
            </span>
        </div>

        <!-- ---- Formulaire de créneau ---- -->
        <div v-if="showForm" class="card p-3.5 mb-4">
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="field-label" for="slot-day">Jour</label>
                    <select id="slot-day" v-model="form.dayOfWeek" class="select">
                        <option v-for="day in WEEK_DAYS" :key="day.value" :value="day.value">
                            {{ day.label }}
                        </option>
                    </select>
                </div>
                <div>
                    <label class="field-label field-label--required" for="slot-subject">Matière</label>
                    <input
                        id="slot-subject" v-model="form.subject" type="text" class="input"
                        list="slot-subjects" maxlength="96" placeholder="Mathématiques"
                    />
                    <datalist id="slot-subjects">
                        <option v-for="subject in knownSubjects" :key="subject" :value="subject" />
                    </datalist>
                </div>
                <div>
                    <label class="field-label field-label--required" for="slot-start">Début</label>
                    <NelimaTimeField id="slot-start" v-model="form.startTime" />
                </div>
                <div>
                    <label class="field-label field-label--required" for="slot-end">Fin</label>
                    <NelimaTimeField id="slot-end" v-model="form.endTime" />
                </div>
                <div>
                    <label class="field-label" for="slot-teacher">Enseignant</label>
                    <select id="slot-teacher" v-model="form.teacherId" class="select">
                        <option value="">À désigner</option>
                        <option v-for="member in teachers" :key="member.id" :value="member.id">
                            {{ fullName(member) }}
                        </option>
                    </select>
                </div>
                <div>
                    <label class="field-label" for="slot-room">Salle</label>
                    <input
                        id="slot-room" v-model="form.room" type="text" class="input" maxlength="64"
                        :placeholder="schoolClass.room ?? 'Salle de la classe'"
                    />
                </div>
            </div>
            <p v-if="formError" class="alert-danger mt-3" role="alert">{{ formError }}</p>
            <div class="flex items-center gap-2 mt-3">
                <button class="btn-primary btn-sm" :disabled="saving" @click="save">
                    <BoIcon name="check" :size="14" /> Enregistrer
                </button>
                <button class="btn-secondary btn-sm" :disabled="saving" @click="showForm = false">
                    Annuler
                </button>
                <button
                    v-if="editing" class="btn-ghost btn-sm ml-auto" style="color: var(--danger)"
                    :disabled="saving" @click="remove"
                >Supprimer ce cours</button>
            </div>
        </div>

        <p v-if="error" class="alert-danger mb-4" role="alert">{{ error }}</p>

        <div v-if="loading" class="flex flex-col gap-2.5">
            <i v-for="n in 4" :key="n" class="sk h-6" />
        </div>
        <div v-else-if="days.length" class="flex flex-col gap-3">
            <div v-for="day in days" :key="day.value">
                <div class="flex items-center justify-between mb-1">
                    <b class="text-[12.5px]" style="color: var(--navy)">{{ day.label }}</b>
                    <button
                        v-if="canWrite" class="btn-ghost btn-sm"
                        :title="`Ajouter un cours le ${day.label.toLowerCase()}`"
                        @click="openCreate(day.value)"
                    >+ cours</button>
                </div>
                <div class="rounded-xl overflow-hidden" style="border: 1px solid var(--border)">
                    <component
                        :is="canWrite ? 'button' : 'div'"
                        v-for="slot in day.slots" :key="slot.id"
                        class="flex items-center gap-3 px-3 py-2 w-full text-left"
                        style="border-bottom: 1px solid var(--border)"
                        :aria-label="canWrite ? `Modifier ${slot.subject}` : undefined"
                        @click="openEdit(slot)"
                    >
                        <span class="nu text-[12px] font-bold tabular-nums w-[92px] shrink-0" style="color: var(--navy)">
                            {{ hhmm(slot.startTime) }} – {{ hhmm(slot.endTime) }}
                        </span>
                        <div class="nm flex-1 min-w-0">
                            <b>{{ slot.subject }}</b>
                            <span>
                                {{ slot.teacherName ?? 'Enseignant à désigner'
                                }}<template v-if="slot.room"> · {{ slot.room }}</template>
                            </span>
                        </div>
                    </component>
                </div>
            </div>
        </div>
        <p v-else-if="!showForm" class="text-[12.5px]" style="color: var(--text-faint)">
            Aucun cours saisi pour cette classe.
            <template v-if="canWrite">Commencez par « Ajouter un cours ».</template>
        </p>
    </div>
</template>
