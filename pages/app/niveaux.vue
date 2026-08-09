<script setup lang="ts">
/**
 * Les niveaux enseignés sont devenus une section des paramètres : c'est un réglage
 * d'établissement, qu'on remplit à l'ouverture du compte et qu'on ne rouvre que rarement.
 *
 * La page est conservée en redirection plutôt que supprimée : des liens et des favoris pointent
 * dessus, et un 404 se lit comme une panne.
 */
definePageMeta({
    middleware: () => navigateTo('/app/parametres?section=niveaux', { replace: true }),
});
</script>

<template>
    <div />
</template>
