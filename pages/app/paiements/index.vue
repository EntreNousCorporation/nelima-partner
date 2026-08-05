<script setup lang="ts">
/**
 * L'entrée « Paiements » de la barre principale n'a pas d'écran à elle.
 *
 * Elle mène au premier sous-onglet que le rôle peut ouvrir, plutôt qu'à une page fixe : un
 * comptable et un secrétariat n'ont pas les mêmes droits, et envoyer l'un sur un écran qui lui
 * répond 403 serait une drôle de page d'accueil.
 */
const { can } = usePermissions();

const landing = computed(() => {
    if (can('accounting:read')) return '/app/paiements/transactions';
    if (can('collection:write')) return '/app/paiements/guichet';
    if (can('fee:read')) return '/app/paiements/frais';
    return '/app/paiements/recus';
});

await navigateTo(landing.value, { replace: true });
</script>

<template>
    <div />
</template>
