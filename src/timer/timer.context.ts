import {createContext} from "react";
import {ITimerContext} from "./time.types.ts";


export const TimerContext = createContext<ITimerContext | null>(null)