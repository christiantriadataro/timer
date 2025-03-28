import EffectContext from "./effect.context.ts";
import {IProvider} from "../vite-env";
import {useEffect} from "react";
import {TIMER_TYPE_ENUM} from "../timer/time.types.ts";
import {INITIAL_SECOND_VALUE, MILLISECOND_CONSTANT, SECOND_CONSTANT} from "../time/time.constants.ts";
import useTime from "../time/useTime.ts";
import useTimer from "../timer/useTimer.ts";

const EffectProvider = ({children}: IProvider) => {
    const {time, setTime} = useTime()
    const {timer, setTimer} = useTimer()
    useEffect(() => {
        if (time === 0) {
            setTimer(TIMER_TYPE_ENUM.STOP)
        }
    }, [time]);

    useEffect(() => {
        if (timer == TIMER_TYPE_ENUM.PLAY) {
            const interval = setInterval(() => {
                setTime(prevTime => prevTime - SECOND_CONSTANT);
            }, MILLISECOND_CONSTANT);
            return () => clearInterval(interval);
        } else if (timer === TIMER_TYPE_ENUM.STOP) {
            setTime(INITIAL_SECOND_VALUE)
        }
    }, [timer]);
    return (
        <EffectContext.Provider value={null}>
            {children}
        </EffectContext.Provider>
    )
}

export default EffectProvider