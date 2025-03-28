import {ReactNode, useState} from "react";
import {TimerContext} from "./timer.context.ts";

import {TIMER_TYPE, TIMER_TYPE_ENUM} from "./time.types.ts";


const TimerProvider = ({children}: {children: ReactNode}) => {
    const [timer, setTimer] = useState<TIMER_TYPE>(TIMER_TYPE_ENUM.STOP)

    return (
        <TimerContext.Provider value={{
            timer,
            setTimer
        }}>
            {children}
        </TimerContext.Provider>
    )
}

export default TimerProvider