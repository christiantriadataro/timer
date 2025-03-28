import {Dispatch, SetStateAction} from "react";

export interface ITimeContext {
    time: number;
    setTime: Dispatch<SetStateAction<number>>
}