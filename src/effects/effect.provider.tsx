import EffectContext from "./effect.context.ts";
import {IProvider} from "../vite-env";
import {useEffect, useRef} from "react";
import {TIMER_TYPE_ENUM} from "../timer/time.types.ts";
import {INITIAL_SECOND_VALUE, TICK_MILLISECONDS} from "../time/time.constants.ts";
import {remainingSeconds} from "../time/time.helper.ts";
import useTime from "../time/useTime.ts";
import useTimer from "../timer/useTimer.ts";
import {sessionTracker} from "../db/sessionTracker.ts";

const EffectProvider = ({children}: IProvider) => {
    const {time, setTime} = useTime()
    const {timer, setTimer, setKind, setTag} = useTimer()
    // Exact ms left when paused, so pause/resume never loses or gains the sub-second part.
    const remainingMsRef = useRef<number | null>(null)

    // Pick up a session left open by a reload or a closed tab (one that ran out is finished in the db).
    useEffect(() => {
        sessionTracker.restore().then((s) => {
            if (!s) return
            setKind(s.kind)
            setTag(s.tag ?? "")
            remainingMsRef.current = s.remaining_ms
            setTime(Math.ceil(s.remaining_ms / 1000))
            setTimer(s.status === "running" ? TIMER_TYPE_ENUM.PLAY : TIMER_TYPE_ENUM.PAUSE)
        })
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once on mount

    // Declared before the time effect: when a preset is picked mid-run, this captures the old
    // remainder first and the time effect below then discards it.
    useEffect(() => {
        if (timer === TIMER_TYPE_ENUM.PLAY) {
            const endsAt = Date.now() + (remainingMsRef.current ?? time * 1000)
            remainingMsRef.current = null
            const tick = () => {
                const left = remainingSeconds(endsAt, Date.now())
                // Record the real end time, not when a throttled background tick noticed it.
                if (left === 0) sessionTracker.finish(endsAt)
                setTime(left)
            }
            const interval = setInterval(tick, TICK_MILLISECONDS)
            // Background tabs throttle intervals; correct the display the moment the tab is visible again.
            document.addEventListener("visibilitychange", tick)
            return () => {
                remainingMsRef.current = Math.max(0, endsAt - Date.now())
                clearInterval(interval)
                document.removeEventListener("visibilitychange", tick)
            }
        } else if (timer === TIMER_TYPE_ENUM.STOP) {
            setTime(INITIAL_SECOND_VALUE)
        }
    }, [timer]); // eslint-disable-line react-hooks/exhaustive-deps -- runs on timer transitions only; time is read once at start

    useEffect(() => {
        if (time === 0) {
            setTimer(TIMER_TYPE_ENUM.STOP)
        }
        // Any time change while not running is a new preset or a stop: forget the paused remainder.
        if (timer !== TIMER_TYPE_ENUM.PLAY) {
            remainingMsRef.current = null
        }
    }, [time]); // eslint-disable-line react-hooks/exhaustive-deps -- reacts to time only

    return (
        <EffectContext.Provider value={null}>
            {children}
        </EffectContext.Provider>
    )
}

export default EffectProvider
