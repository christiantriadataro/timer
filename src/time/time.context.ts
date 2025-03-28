import {createContext} from "react";
import {ITimeContext} from "./time.types.ts";


export const TimeContext = createContext<ITimeContext | null>(null)