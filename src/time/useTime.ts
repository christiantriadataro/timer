import {useContext} from "react";

import {TIMEPROVIDER_ERROR_MESSAGE} from "./time.constants.ts";
import {TimeContext} from "./time.context.ts";

const useTime = () => {
    const context = useContext(TimeContext);

    if (!context) {
        throw new Error(TIMEPROVIDER_ERROR_MESSAGE)
    }

    return context;
}

export default useTime;