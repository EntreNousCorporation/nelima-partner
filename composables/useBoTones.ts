/**
 * Couleurs des pastilles de la maquette (`.pill`), en variables : identiques en clair, et elles
 * suivent le mode sombre.
 */
export type BoTone = 'ok' | 'warn' | 'late' | 'info' | 'mute';

export const BO_TONES: Record<BoTone, { color: string; background: string }> = {
    ok: { color: 'var(--gr-d)', background: 'var(--gr-t)' },
    warn: { color: 'var(--am-d)', background: 'var(--am-t)' },
    late: { color: 'var(--rd-d)', background: 'var(--rd-t)' },
    info: { color: 'var(--pr-d)', background: 'var(--pr-t)' },
    mute: { color: 'var(--tx2)', background: 'var(--mute-t)' },
};

export function pillStyle(tone: BoTone) {
    return BO_TONES[tone];
}

/** Montant court de la maquette : « 3,0 M », « 450 000 ». */
export function boAmount(value?: number | null) {
    const n = Number(value ?? 0);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} M`;
    return n.toLocaleString('fr-FR').replace(/ /g, ' ');
}

export function fmtNumber(value?: number | null) {
    return Number(value ?? 0).toLocaleString('fr-FR').replace(/ /g, ' ');
}
