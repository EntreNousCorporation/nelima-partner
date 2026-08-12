<script setup lang="ts">
/**
 * Le panneau de gauche des écrans d'authentification.
 *
 * <p>Il disait à qui s'adresse la page de connexion ; les écrans de mot de passe en ont le même
 * besoin, et davantage : définir son mot de passe est le tout premier écran qu'une école voit de
 * Nelima, avant même d'être entrée. Le laisser nu en ferait une page d'erreur d'apparence.
 *
 * <p>Masqué sous 1024 px, où toute la place doit aller au formulaire.
 */
</script>

<template>
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
</template>
