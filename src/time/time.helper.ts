export function multiplierMinutes(time: number) {
    return Math.floor((time % 3600) / 60);
}

export function multiplierSeconds(time: number) {
    return time % 60;
}

// Whole seconds left until endsAt (epoch ms), rounded up so 0 only shows when time is really up.
export function remainingSeconds(endsAt: number, now: number) {
    return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
