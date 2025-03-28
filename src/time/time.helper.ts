export function multiplierMinutes(time: number) {
    return Math.floor((time % 3600) / 60);
}

export function multiplierSeconds(time: number) {
    return time % 60;
}