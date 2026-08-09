<script setup lang="ts">
import { formatAmount } from '~/composables/useBilling';
import { type Student } from '~/composables/useStudents';
import type { Receipt } from '~/composables/useBilling';

/**
 * Recherche de la barre supérieure.
 *
 * Elle cherche là où l'école cherche vraiment : un élève dont on a le nom sur un carnet, un reçu
 * dont on a le numéro sur un papier. Les deux d'un coup, parce qu'au comptoir on ne sait pas
 * toujours ce qu'on tient.
 */
const { search } = useStudents();
const { receipts } = useBilling();

const term = ref('');
const open = ref(false);
const searching = ref(false);
const students = ref<Student[]>([]);
const found = ref<Receipt[]>([]);

const hasResults = computed(() => students.value.length > 0 || found.value.length > 0);

let debounce: ReturnType<typeof setTimeout> | undefined;

watch(term, (value) => {
    clearTimeout(debounce);
    // Deux caractères au moins : une seule lettre ramènerait la moitié de l'école.
    if (value.trim().length < 2) {
        students.value = [];
        found.value = [];
        open.value = false;
        return;
    }
    debounce = setTimeout(run, 280);
});

async function run() {
    searching.value = true;
    open.value = true;
    try {
        const [byName, byNumber] = await Promise.all([
            search({ page: 0, size: 4, keyword: term.value }),
            receipts({ page: 0, size: 3, keyword: term.value }),
        ]);
        students.value = byName.content ?? [];
        found.value = byNumber.content ?? [];
    } catch {
        students.value = [];
        found.value = [];
    } finally {
        searching.value = false;
    }
}

function go(path: string) {
    open.value = false;
    term.value = '';
    navigateTo(path);
}
</script>

<template>
    <div class="relative flex-1 max-w-[400px] hidden md:block">
        <label
            class="flex items-center gap-2.5 h-[34px] px-3 rounded-lg"
            style="background: rgba(255,255,255,.09); color: #9FBDE9"
        >
            <BoIcon name="search" :size="15" />
            <input
                v-model="term" type="search"
                class="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-white"
                placeholder="Rechercher un élève, un reçu…"
                aria-label="Rechercher un élève ou un reçu"
                @focus="term.trim().length >= 2 && (open = true)"
                @keydown.escape="open = false"
            />
        </label>

        <template v-if="open">
            <!-- Voile transparent : un clic hors du panneau le referme, sans capturer le clavier. -->
            <div class="fixed inset-0 z-40" @click="open = false" />

            <div
                class="absolute left-0 top-[42px] z-50 w-full rounded-xl overflow-hidden"
                style="background: var(--surface-raised); border: 1px solid var(--border);
                       box-shadow: 0 18px 46px rgba(11,46,102,.22)"
            >
                <p v-if="searching" class="px-3.5 py-3 text-[12.5px]" style="color: var(--text-faint)">
                    Recherche…
                </p>

                <template v-else-if="hasResults">
                    <template v-if="students.length">
                        <p class="sec px-3.5 pt-3 pb-1.5">Élèves</p>
                        <button
                            v-for="student in students" :key="student.id"
                            class="flex items-center gap-2.5 px-3.5 py-2 w-full text-left hover:bg-[var(--surface-sunken)]"
                            @click="go(`/app/eleves?q=${encodeURIComponent(student.registrationNumber)}`)"
                        >
                            <AvatarBadge :name="`${student.firstName} ${student.lastName}`" :size="26" />
                            <div class="nm min-w-0">
                                <b>{{ student.lastName }} {{ student.firstName }}</b>
                                <span class="nu">{{ student.registrationNumber }}</span>
                            </div>
                        </button>
                    </template>

                    <template v-if="found.length">
                        <p class="sec px-3.5 pt-3 pb-1.5">Reçus</p>
                        <button
                            v-for="receipt in found" :key="receipt.id"
                            class="flex items-center gap-2.5 px-3.5 py-2 w-full text-left hover:bg-[var(--surface-sunken)]"
                            @click="go(`/app/paiements/recus?q=${encodeURIComponent(receipt.number)}`)"
                        >
                            <div class="nm flex-1 min-w-0">
                                <b class="nu">{{ receipt.number }}</b>
                                <span>{{ receipt.studentLabel ?? '—' }}</span>
                            </div>
                            <b class="nu text-[12px]" style="color: var(--success)">
                                {{ formatAmount(receipt.amount) }}
                            </b>
                        </button>
                    </template>
                </template>

                <p v-else class="px-3.5 py-3 text-[12.5px]" style="color: var(--text-faint)">
                    Aucun élève ni reçu ne correspond à « {{ term }} ».
                </p>
            </div>
        </template>
    </div>
</template>
