import {ReactNode, useState} from "react";
import {TimeContext} from "./time.context.ts";


const TimeProvider = ({children}: { children: ReactNode }) => {
    const [time, setTime] = useState<number>(0)

    return (
        <TimeContext.Provider value={{
            time,
            setTime
        }}>
            {children}
        </TimeContext.Provider>
    )
}

export default TimeProvider