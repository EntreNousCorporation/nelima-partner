<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

/**
 * Mon profil.
 *
 * Le portail n'offrait aucun moyen de changer son mot de passe : la direction restait sur celui
 * reçu par courriel à la création du compte, partagé au secrétariat, et sans recours.
 */
const auth = useAuthStore();
const api = useApi();

const current = ref('');
const next = ref('');
const confirmation = ref('');
const saving = ref(false);
const error = ref('');
const saved = ref(false);

/** Même exigence que le serveur, dite avant l'envoi plutôt qu'après le refus. */
const MIN_LENGTH = 8;

const mismatch = computed(() =>
    Boolean(confirmation.value) && next.value !== confirmation.value);

const ready = computed(() =>
    Boolean(current.value) && next.value.length >= MIN_LENGTH
    && next.value === confirmation.value && next.value !== current.value);

async function submit() {
    error.value = '';
    saved.value = false;
    saving.value = true;
    try {
        await api('/users/change-password', {
            method: 'PUT',
            body: {
                username: auth.user?.username,
                oldPassword: current.value,
                newPassword: next.value,
            },
        });
        saved.value = true;
        current.value = '';
        next.value = '';
        confirmation.value = '';
    } catch (e: any) {
        // Le serveur distingue le mot de passe actuel erroné du reste : le dire évite de chercher
        // une faute dans le nouveau alors que c'est l'ancien qui est mal saisi.
        error.value = e?.response?.status === 400 || e?.response?.status === 401
            ? 'Le mot de passe actuel ne correspond pas.'
            : "Le mot de passe n'a pas pu être changé.";
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <div>
        <PageHead title="Mon profil" sub="Vos informations et l'accès à votre compte" />

        <div class="grid-12">
            <UiCard
                style="grid-column: span 5"
                title="Informations"
                sub="Renseignées par YPYit à la création du compte"
            >
                <div class="flex items-center gap-3 mb-4">
                    <AvatarBadge :name="auth.fullName" :size="48" />
                    <div class="min-w-0">
                        <b class="block text-[15px] font-extrabold" style="color: var(--navy)">
                            {{ auth.fullName }}
                        </b>
                        <span class="text-[12.5px]" style="color: var(--text-faint)">
                            Direction de l'établissement
                        </span>
                    </div>
                </div>

                <dl class="kv">
                    <dt>Identifiant</dt><dd>{{ auth.user?.username ?? '—' }}</dd>
                    <dt>Établissement</dt><dd>{{ auth.user?.establishmentName ?? '—' }}</dd>
                </dl>

                <p class="text-[12px] mt-4 leading-relaxed" style="color: var(--text-faint)">
                    Le nom de l'établissement et l'identifiant de connexion sont posés par YPYit.
                    Écrivez-nous pour les faire modifier.
                </p>
            </UiCard>

            <UiCard
                style="grid-column: span 7"
                title="Mot de passe"
                sub="Il protège les données de paiement de toutes vos familles"
            >
                <form class="flex flex-col gap-3.5 max-w-md" @submit.prevent="submit">
                    <div>
                        <label class="field-label" for="current">Mot de passe actuel</label>
                        <input
                            id="current" v-model="current" type="password" class="input"
                            autocomplete="current-password"
                        />
                    </div>
                    <div>
                        <label class="field-label" for="next">Nouveau mot de passe</label>
                        <input
                            id="next" v-model="next" type="password" class="input"
                            autocomplete="new-password"
                        />
                        <p class="text-[12px] mt-1" style="color: var(--text-faint)">
                            {{ MIN_LENGTH }} caractères au minimum.
                        </p>
                    </div>
                    <div>
                        <label class="field-label" for="confirmation">Confirmation</label>
                        <input
                            id="confirmation" v-model="confirmation" type="password" class="input"
                            autocomplete="new-password"
                        />
                        <p v-if="mismatch" class="text-[12px] mt-1" style="color: var(--danger)">
                            Les deux saisies diffèrent.
                        </p>
                    </div>

                    <p v-if="error" class="alert-danger" role="alert">{{ error }}</p>
                    <p v-else-if="saved" class="alert-success">
                        Mot de passe changé. Il sera demandé à votre prochaine connexion.
                    </p>

                    <div>
                        <button type="submit" class="btn-primary" :disabled="saving || !ready">
                            {{ saving ? 'Enregistrement…' : 'Changer le mot de passe' }}
                        </button>
                    </div>
                </form>
            </UiCard>
        </div>
    </div>
</template>
