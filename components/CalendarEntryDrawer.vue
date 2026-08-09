<script setup lang="ts">
import {
    MONTHS, collectionRate, entryKindLabel, entryKindTone, type CalendarEntry,
} from '~/composables/useCalendar';

/**
 * Fiche d'une entrée du calendrier.
 *
 * Deux natures partagent ce tiroir : un événement saisi, qu'on peut modifier et dont on peut
 * prévenir les familles ; et une échéance déduite des tranches dues, qu'on ne peut que regarder —
 * elle se modifie depuis le frais dont elle vient, jamais ici.
 */
const props = defineProps<{ entry: CalendarEntry }>();
const emit = defineEmits<{
    close: []; edit: [entry: CalendarEntry]; delete: [entry: CalendarEntry];
    notify: [entry: CalendarEntry];
}>();

const { can } = usePermissions();

const canWrite = computed(() => can('calendar:write'));
const canReadAmounts = computed(() => can('fee:read'));

const isFeeDue = computed(() => props.entry.kind === 'FEE_DUE');
const rate = computed(() => collectionRate(props.entry));

const dateLabel = computed(() => {
    const [y, m, d] = props.entry.date.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
});

const timeLabel = computed(() => {
    if (props.entry.allDay || !props.entry.startTime) return 'Toute la journée';
    const start = props.entry.startTime.slice(0, 5);
    const end = props.entry.endTime?.slice(0, 5);
    return end ? `${start} – ${end}` : start;
});

const notifiedLabel = computed(() => {
    if (!props.entry.lastNotifiedAt) return 'Aucune notification envoyée';
    return `Dernier envoi le ${new Date(props.entry.lastNotifiedAt).toLocaleDateString('fr-FR')}`;
});
</script>

<template>
    <SideDrawer
        :title="entry.title"
        :sub="`${entryKindLabel(entry.kind)} · ${dateLabel}`"
        @close="emit('close')"
    >
        <template #avatar>
            <div
                class="w-11 h-11 rounded-xl shrink-0"
                :style="{ background: 'var(--surface-sunken)', borderLeft: `4px solid ${entryKindTone(entry.kind)}` }"
            />
        </template>

        <p class="sec">Informations</p>
        <dl class="rounded-xl overflow-hidden mb-5" style="border: 1px solid var(--border)">
            <div class="flex px-3 py-2" style="border-bottom: 1px solid var(--border)">
                <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">Nature</dt>
                <dd class="text-[12.5px] font-semibold">{{ entryKindLabel(entry.kind) }}</dd>
            </div>
            <div class="flex px-3 py-2" style="border-bottom: 1px solid var(--border)">
                <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">Date</dt>
                <dd class="text-[12.5px] font-semibold">{{ dateLabel }}</dd>
            </div>
            <div class="flex px-3 py-2" style="border-bottom: 1px solid var(--border)">
                <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">Horaire</dt>
                <dd class="text-[12.5px] font-semibold">{{ timeLabel }}</dd>
            </div>
            <div class="flex px-3 py-2" :style="entry.details ? 'border-bottom: 1px solid var(--border)' : ''">
                <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">Concerne</dt>
                <dd class="text-[12.5px] font-semibold">{{ entry.scope ?? '—' }}</dd>
            </div>
            <div v-if="entry.details" class="flex px-3 py-2">
                <dt class="flex-1 text-[12.5px]" style="color: var(--text-faint)">Précision</dt>
                <dd class="text-[12.5px] font-semibold">{{ entry.details }}</dd>
            </div>
        </dl>

        <template v-if="isFeeDue">
            <p class="sec">Suivi du recouvrement</p>
            <div class="card p-3.5 mb-5">
                <template v-if="canReadAmounts">
                    <div class="flex justify-between text-[12.5px] font-semibold mb-2">
                        <span style="color: var(--text-muted)">Déjà réglé</span>
                        <b class="nu" style="color: var(--navy)">
                            {{ fm(Number(entry.amountCollected ?? 0)) }}
                            / {{ fm(Number(entry.amountExpected ?? 0)) }} F
                        </b>
                    </div>
                    <div class="h-1.5 rounded-full overflow-hidden" style="background: var(--surface-sunken)">
                        <i
                            class="block h-full rounded-full"
                            :style="{ width: `${Math.min(100, rate ?? 0)}%`, background: 'var(--brand-600)' }"
                        />
                    </div>
                </template>
                <p class="text-[12px] mt-2.5" style="color: var(--text-faint)">
                    <b class="nu" style="color: var(--navy)">{{ entry.studentsSettled }}</b>
                    élève(s) à jour ·
                    <b class="nu" style="color: var(--danger)">
                        {{ (entry.studentsConcerned ?? 0) - (entry.studentsSettled ?? 0) }}
                    </b>
                    restant(s)
                </p>
            </div>

            <!-- Le rappel automatique part déjà à J-7 et J-1 : ouvrir un second canal ici ferait
                 deux relances sans garde-fou contre le doublon. -->
            <p class="text-[12px]" style="color: var(--text-faint)">
                Les familles concernées reçoivent automatiquement un rappel sept jours puis un jour
                avant l'échéance. Cette échéance vient d'un frais : elle se modifie depuis l'écran
                Frais, pas ici.
            </p>
        </template>

        <template v-else>
            <p class="sec">Communication</p>
            <div class="card p-3.5 mb-5">
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <b class="block text-[12.5px]" style="color: var(--navy)">
                            {{ entry.visibleToFamilies ? 'Visible des familles' : 'Événement interne' }}
                        </b>
                        <span class="text-[11.5px]" style="color: var(--text-faint)">
                            {{ entry.visibleToFamilies
                                ? notifiedLabel
                                : "L'application des familles ne l'affiche pas" }}
                        </span>
                    </div>
                    <button
                        v-if="canWrite && entry.visibleToFamilies" class="btn-secondary btn-sm"
                        @click="emit('notify', entry)"
                    >
                        <BoIcon name="send" :size="15" />{{ entry.lastNotifiedAt ? 'Prévenir à nouveau' : 'Prévenir les familles' }}</button>
                </div>
            </div>
        </template>

        <template v-if="!isFeeDue && canWrite" #footer>
            <button class="btn-primary" @click="emit('edit', entry); emit('close')">
                <BoIcon name="edit" :size="16" />Modifier</button>
            <button class="btn-secondary" @click="emit('delete', entry)">Supprimer</button>
        </template>
    </SideDrawer>
</template>
