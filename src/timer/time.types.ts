import {Dispatch, SetStateAction} from "react";
import type {SessionKind} from "../db/sessions.ts";

export enum TIMER_TYPE_ENUM {
    PLAY = "PLAY",
    PAUSE = "PAUSE",
    STOP = "STOP"
}


export type TIMER_TYPE = TIMER_TYPE_ENUM.PLAY | TIMER_TYPE_ENUM.PAUSE | TIMER_TYPE_ENUM.STOP

export interface ITimerContext {
    timer: TIMER_TYPE;
    setTimer: Dispatch<SetStateAction<TIMER_TYPE>>
    kind: SessionKind;
    setKind: Dispatch<SetStateAction<SessionKind>>
    tag: string;
    setTag: Dispatch<SetStateAction<string>>
}