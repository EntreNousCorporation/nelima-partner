<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

definePageMeta({ layout: 'default' });

const auth = useAuthStore();
const username = ref('');
const password = ref('');
const error = ref('');
const submitting = ref(false);

async function submit() {
    error.value = '';
    submitting.value = true;
    try {
        // La réponse ne contient que le profil : le jeton reste scellé côté serveur.
        const { user } = await $fetch<{ user: any }>('/api/auth/login', {
            method: 'POST',
            body: { username: username.value, password: password.value },
        });
        auth.setUser(user);
        await navigateTo('/app');
    } catch (e: any) {
        error.value = e?.data?.statusMessage ?? 'Identifiant ou mot de passe incorrect';
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <div class="min-h-screen grid lg:grid-cols-2">
        <!--
            Panneau de gauche : il dit à qui s'adresse cet écran. Le portail école et l'application
            parent partagent la même marque, et rien ne les distinguait à l'ouverture.
            Masqué sous 1024 px, où toute la place doit aller au formulaire.
        -->
        <aside
            class="hidden lg:flex flex-col justify-between p-12 text-white"
            style="background: linear-gradient(150deg, var(--brand-700) 0%, var(--brand-900) 100%)"
        >
            <div class="flex items-center gap-3">
                <NelimaMark :size="36" />
                <span class="text-lg font-semibold tracking-tight">Nelima</span>
            </div>

            <div class="max-w-md">
                <p class="text-3xl font-semibold leading-tight tracking-tight">
                    La scolarité de votre établissement, tenue au jour le jour.
                </p>
                <p class="mt-4 text-white/70 leading-relaxed">
                    Élèves, frais et échéanciers, encaissements au guichet comme en ligne,
                    reçus numérotés — au même endroit.
                </p>
            </div>

            <p class="text-sm text-white/50">Édité par YPYit · Abidjan</p>
        </aside>

        <main class="flex items-center justify-center p-6">
            <form class="w-full max-w-sm" @submit.prevent="submit">
                <div class="lg:hidden flex items-center gap-3 mb-8">
                    <NelimaMark :size="32" />
                    <span class="text-lg font-semibold">Nelima</span>
                </div>

                <h1 class="text-2xl font-semibold tracking-tight">Espace établissement</h1>
                <p class="page-subtitle mb-8">Connectez-vous pour accéder à votre école.</p>

                <div class="space-y-4">
                    <div>
                        <label for="username" class="field-label">Identifiant</label>
                        <input
                            id="username" v-model="username" type="text"
                            autocomplete="username" required class="input"
                            placeholder="direction@votre-ecole.ci"
                        />
                    </div>

                    <div>
                        <label for="password" class="field-label">Mot de passe</label>
                        <input
                            id="password" v-model="password" type="password"
                            autocomplete="current-password" required class="input"
                        />
                    </div>

                    <p v-if="error" class="alert-danger" role="alert">{{ error }}</p>

                    <button
                        type="submit" :disabled="submitting || !username || !password"
                        class="btn-primary w-full"
                    >
                        {{ submitting ? 'Connexion…' : 'Se connecter' }}
                    </button>
                </div>

                <p class="mt-8 text-xs" style="color: var(--text-faint)">
                    Votre compte est créé par Nelima. En cas d'oubli, contactez votre
                    administrateur.
                </p>
            </form>
        </main>
    </div>
</template>
