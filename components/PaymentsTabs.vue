<script setup lang="ts">
/**
 * Sous-navigation de l'espace Paiements.
 *
 * La maquette ne donne qu'un onglet « Paiements » à la barre principale, avec ses sous-onglets.
 * Le portail avait éclaté les quatre en entrées de premier niveau, ce qui portait la barre à onze
 * onglets — au point qu'on ne voyait plus ce qui relevait de l'argent.
 *
 * L'ordre est celui du prototype. « Reçus » s'y ajoute : le prototype range la quittance dans le
 * tiroir d'une transaction, mais c'est de cet écran que part **l'export du journal comptable**,
 * un acte journalisé qui n'a pas d'autre porte d'entrée.
 */
const items = [
    { label: 'Transactions', to: '/app/paiements/transactions', permission: 'accounting:read' },
    { label: 'Reçus', to: '/app/paiements/recus' },
    { label: 'Frais & échéanciers', to: '/app/paiements/frais', permission: 'fee:read' },
    { label: 'Relances', to: '/app/paiements/relances' },
    { label: 'Guichet', to: '/app/paiements/guichet', permission: 'collection:write' },
];
</script>

<template>
    <SubNav :items="items" />
</template>
