<script setup lang="ts">
/**
 * Sous-navigation de l'espace Paiements.
 *
 * La maquette ne donne qu'un onglet « Paiements » à la barre principale, avec ses sous-onglets.
 * Le portail avait éclaté les quatre en entrées de premier niveau, ce qui portait la barre à onze
 * onglets — au point qu'on ne voyait plus ce qui relevait de l'argent.
 *
 * Un onglet dont le rôle n'a pas la permission n'est pas affiché : le serveur refuserait l'appel,
 * et proposer une page qui répond 403 est une promesse que l'écran ne tient pas.
 */
const route = useRoute();
const { can } = usePermissions();

const allTabs = [
    { label: 'Transactions', to: '/app/paiements/transactions', permission: 'accounting:read' },
    { label: 'Reçus', to: '/app/paiements/recus' },
    { label: 'Frais & échéanciers', to: '/app/paiements/frais', permission: 'fee:read' },
    { label: 'Relances', to: '/app/paiements/relances' },
    { label: 'Guichet', to: '/app/paiements/guichet', permission: 'collection:write' },
];

const tabs = computed(() => allTabs.filter((tab) => !tab.permission || can(tab.permission)));
</script>

<template>
    <div class="flex items-center gap-2 flex-wrap mb-3.5">
        <NuxtLink
            v-for="tab in tabs" :key="tab.to" :to="tab.to" class="chip"
            :aria-pressed="route.path === tab.to"
        >{{ tab.label }}</NuxtLink>
    </div>
</template>
