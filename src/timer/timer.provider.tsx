import {ReactNode, useState} from "react";
import {TimerContext} from "./timer.context.ts";

import {TIMER_TYPE, TIMER_TYPE_ENUM} from "./time.types.ts";
import type {SessionKind} from "../db/sessions.ts";


const TimerProvider = ({children}: {children: ReactNode}) => {
    const [timer, setTimer] = useState<TIMER_TYPE>(TIMER_TYPE_ENUM.STOP)
    const [kind, setKind] = useState<SessionKind>("focus")
    const [tag, setTag] = useState("")

    return (
        <TimerContext.Provider value={{
            timer,
            setTimer,
            kind,
            setKind,
            tag,
            setTag
        }}>
            {children}
        </TimerContext.Provider>
    )
}

export default TimerProvider