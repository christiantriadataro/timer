import {useContext} from "react";
import {TIMERPROVIDER_ERROR_MESSAGE} from "./timer.constants.ts";
import {TimerContext} from "./timer.context.ts";

const useTimer = () => {
    const context = useContext(TimerContext)

    if (!context) {
        throw new Error(TIMERPROVIDER_ERROR_MESSAGE)
    }

    return context;
}

export default useTimer