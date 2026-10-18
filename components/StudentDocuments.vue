<script setup lang="ts">
import {
    DOCUMENT_KINDS, DOCUMENT_MAX_BYTES, documentKindLabel,
    type StudentDocument, type StudentDocumentKind,
} from '~/composables/useStudents';

/**
 * Dossier de l'élève : les pièces que l'école conserve.
 *
 * <p>Les fichiers ne quittent jamais le serveur sous forme d'URL de stockage : on les lit par le
 * proxy du portail, avec la session. Un lien copié hors du portail ne mène donc nulle part.
 *
 * <p>En tête, ce qui manque encore parmi les deux pièces que toutes les écoles réclament : c'est
 * la question qu'on se pose en ouvrant un dossier, avant même de regarder ce qu'il contient.
 */
const props = defineProps<{ studentId: string }>();
/** Photo courante après chaque chargement : l'avatar de la fiche et de la liste la suivent. */
const emit = defineEmits<{ photo: [photoId: string | null] }>();

const { documents, uploadDocument, removeDocument, documentUrl } = useStudents();
const { can } = usePermissions();
const canWrite = computed(() => can('student:write'));

const REQUIRED: StudentDocumentKind[] = ['BIRTH_CERTIFICATE', 'PHOTO'];

const items = ref<StudentDocument[]>([]);
const loading = ref(true);
const error = ref('');

const showForm = ref(false);
const kind = ref<StudentDocumentKind>('BIRTH_CERTIFICATE');
const label = ref('');
const file = ref<File | null>(null);
const uploading = ref(false);
const formError = ref('');
/** Pièce dont la suppression attend sa confirmation : un clic de travers ne doit rien effacer. */
const confirming = ref<string | null>(null);

const missing = computed(() => REQUIRED
    .filter((required) => !items.value.some((item) => item.kind === required))
    .map(documentKindLabel));

async function load() {
    loading.value = true;
    error.value = '';
    try {
        items.value = await documents(props.studentId);
        // Le serveur retient la dernière photo versée ; la liste arrive déjà la plus récente en tête.
        emit('photo', items.value.find((item) => item.kind === 'PHOTO')?.id ?? null);
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "Le dossier n'a pas pu être chargé.";
    } finally {
        loading.value = false;
    }
}

function openForm() {
    // On propose d'emblée la première pièce manquante : c'est presque toujours celle qu'on ajoute.
    kind.value = REQUIRED.find((required) => !items.value.some((item) => item.kind === required))
        ?? 'BIRTH_CERTIFICATE';
    label.value = '';
    file.value = null;
    formError.value = '';
    showForm.value = true;
}

function onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    file.value = input.files?.[0] ?? null;
    formError.value = file.value && file.value.size > DOCUMENT_MAX_BYTES
        ? 'Le fichier dépasse 5 Mo.' : '';
}

async function submit() {
    formError.value = '';
    if (!file.value) {
        formError.value = 'Choisissez un fichier.';
        return;
    }
    if (file.value.size > DOCUMENT_MAX_BYTES) {
        formError.value = 'Le fichier dépasse 5 Mo.';
        return;
    }
    if (kind.value === 'OTHER' && !label.value.trim()) {
        formError.value = 'Précisez de quelle pièce il s\'agit.';
        return;
    }
    uploading.value = true;
    try {
        const toSend = kind.value === 'PHOTO' ? await shrinkPhoto(file.value) : file.value;
        await uploadDocument(props.studentId, kind.value, toSend, label.value.trim() || undefined);
        showForm.value = false;
        await load();
    } catch (e: any) {
        formError.value = e?.status === 413
            ? 'Le fichier dépasse 5 Mo.'
            : e?.data?.debugMessage ?? "La pièce n'a pas pu être ajoutée.";
    } finally {
        uploading.value = false;
    }
}

async function remove(item: StudentDocument) {
    error.value = '';
    try {
        await removeDocument(props.studentId, item.id);
        confirming.value = null;
        await load();
    } catch (e: any) {
        error.value = e?.data?.debugMessage ?? "La pièce n'a pas pu être supprimée.";
    }
}

/**
 * Ramène une photo d'identité à 800 pixels de côté au plus, en JPEG.
 *
 * Une photo de téléphone pèse 3 à 4 Mo, et c'est elle que les listes affichent en vignette : trente
 * élèves par page se compteraient en centaines de mégaoctets sur une connexion mobile. 800 pixels
 * suffisent largement à une photo d'identité, imprimée comprise. Le navigateur applique au passage
 * l'orientation enregistrée par le téléphone, sans quoi la photo pourrait arriver couchée.
 *
 * En cas d'échec (format que le navigateur ne sait pas décoder), le fichier part tel quel : le
 * serveur reste juge de ce qu'il accepte.
 */
async function shrinkPhoto(original: File): Promise<File> {
    const MAX = 800;
    try {
        const bitmap = await createImageBitmap(original, { imageOrientation: 'from-image' });
        const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
        if (scale === 1 && original.size < 400 * 1024) {
            bitmap.close();
            return original;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        if (!blob) return original;
        const base = original.name.replace(/\.[^.]*$/, '') || 'photo';
        return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
    } catch {
        return original;
    }
}

function size(bytes: number) {
    return bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
        : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

function date(value?: string) {
    return value ? new Date(value).toLocaleDateString('fr-FR') : '';
}

watch(() => props.studentId, () => {
    showForm.value = false;
    load();
});
onMounted(load);
</script>

<template>
    <div class="mb-5">
        <div class="flex items-center justify-between">
            <p class="sec">Dossier</p>
            <button v-if="canWrite && !showForm" class="btn-secondary btn-sm mb-2" @click="openForm">
                <BoIcon name="upload" :size="14" /> Ajouter une pièce
            </button>
        </div>

        <p
            v-if="!loading && missing.length" class="text-[12px] mb-2.5 font-semibold"
            style="color: var(--warning)"
        >
            À fournir : {{ missing.join(', ') }}
        </p>

        <div v-if="showForm" class="card p-3.5 mb-3">
            <div class="grid grid-cols-2 gap-3">
                <div :class="kind === 'OTHER' ? '' : 'col-span-2'">
                    <label class="field-label" for="doc-kind">Pièce</label>
                    <select id="doc-kind" v-model="kind" class="select">
                        <option v-for="option in DOCUMENT_KINDS" :key="option.value" :value="option.value">
                            {{ option.label }}
                        </option>
                    </select>
                </div>
                <div v-if="kind === 'OTHER'">
                    <label class="field-label field-label--required" for="doc-label">Laquelle ?</label>
                    <input
                        id="doc-label" v-model="label" type="text" class="input" maxlength="128"
                        placeholder="Certificat de scolarité"
                    />
                </div>
                <div class="col-span-2">
                    <label class="field-label field-label--required" for="doc-file">Fichier</label>
                    <input
                        id="doc-file" type="file" class="input"
                        :accept="kind === 'PHOTO' ? 'image/jpeg,image/png,image/webp' : 'application/pdf,image/jpeg,image/png,image/webp'"
                        @change="onFile"
                    />
                    <p class="text-[11.5px] mt-1" style="color: var(--text-faint)">
                        PDF ou photo (JPEG, PNG, WebP), 5 Mo au plus.
                    </p>
                </div>
            </div>
            <p v-if="formError" class="alert-danger mt-3" role="alert">{{ formError }}</p>
            <div class="flex items-center gap-2 mt-3">
                <button class="btn-primary btn-sm" :disabled="uploading || !file" @click="submit">
                    <BoIcon name="check" :size="14" /> {{ uploading ? 'Envoi…' : 'Ajouter' }}
                </button>
                <button class="btn-secondary btn-sm" :disabled="uploading" @click="showForm = false">
                    Annuler
                </button>
            </div>
        </div>

        <p v-if="error" class="alert-danger mb-3" role="alert">{{ error }}</p>

        <div v-if="loading" class="flex flex-col gap-2.5">
            <i v-for="n in 2" :key="n" class="sk h-6" />
        </div>
        <div v-else-if="items.length" class="rounded-xl overflow-hidden" style="border: 1px solid var(--border)">
            <div
                v-for="item in items" :key="item.id"
                class="flex items-center gap-2.5 px-3 py-2"
                style="border-bottom: 1px solid var(--border)"
            >
                <img
                    v-if="item.contentType.startsWith('image/')"
                    :src="documentUrl(studentId, item.id)" alt=""
                    class="w-8 h-8 rounded-md object-cover shrink-0"
                    style="border: 1px solid var(--border)"
                />
                <span
                    v-else class="w-8 h-8 rounded-md grid place-items-center shrink-0 text-[9.5px] font-black"
                    style="background: var(--danger-soft); color: var(--danger)"
                >PDF</span>
                <div class="nm flex-1 min-w-0">
                    <b>{{ item.kind === 'OTHER' && item.label ? item.label : documentKindLabel(item.kind) }}</b>
                    <span class="truncate">{{ item.fileName }} · {{ size(item.sizeBytes) }} · {{ date(item.createdAt) }}</span>
                </div>
                <template v-if="confirming === item.id">
                    <button class="btn-ghost btn-sm" style="color: var(--danger)" @click="remove(item)">
                        Confirmer
                    </button>
                    <button class="btn-ghost btn-sm" @click="confirming = null">Garder</button>
                </template>
                <template v-else>
                    <a
                        :href="documentUrl(studentId, item.id)" target="_blank" rel="noopener"
                        class="btn-ghost btn-sm"
                    >Voir</a>
                    <a
                        :href="documentUrl(studentId, item.id, true)" class="btn-ghost btn-sm"
                        :title="`Télécharger ${item.fileName}`" :aria-label="`Télécharger ${item.fileName}`"
                    ><BoIcon name="download" :size="14" /></a>
                    <button
                        v-if="canWrite" class="btn-ghost btn-sm" :aria-label="`Supprimer ${item.fileName}`"
                        title="Supprimer" @click="confirming = item.id"
                    ><BoIcon name="close" :size="14" /></button>
                </template>
            </div>
        </div>
        <p v-else-if="!showForm" class="text-[12.5px]" style="color: var(--text-faint)">
            Aucune pièce dans le dossier.
        </p>
    </div>
</template>
