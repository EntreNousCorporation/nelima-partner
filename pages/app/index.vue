<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
</script>

<template>
    <div>
        <h1 class="text-2xl font-semibold">Tableau de bord</h1>
        <p class="mt-2 opacity-70">
            Bonjour {{ auth.fullName }}, bienvenue sur l'espace de
            {{ auth.user?.establishmentName ?? 'votre établissement' }}.
        </p>
        <p class="mt-8 text-sm opacity-60">
            Les indicateurs (effectifs, encaissements du mois, impayés) arrivent avec les écrans
            correspondants.
        </p>
    </div>
</template>
