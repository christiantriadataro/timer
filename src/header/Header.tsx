import useTime from "../time/useTime.ts";
import useTimer from "../timer/useTimer.ts";
import {useState, useSyncExternalStore} from "react";
import {sessionTracker} from "../db/sessionTracker.ts";
import {type SessionKind, TAG_MAX_LENGTH} from "../db/sessions.ts";
import {TIMER_TYPE_ENUM} from "../timer/time.types.ts";
import PlayLogo from "../assets/icons/play.svg";
import PauseLogo from "../assets/icons/pause.svg";
import TimerIcon from "../assets/icons/timer.svg";
import HistoryIcon from "../assets/icons/history.svg";
import StopIcon from "../assets/icons/stop.svg";
import {BREAK_TIME_SECONDS, SHORT_BREAK_TIME_SECONDS, TODO_TIME_SECONDS} from "./header.constants.ts";

interface IButtonItem {
    handler: () => void,
    icon: string;
    label: string;
}

interface IListItem {
    handler: () => void,
    label: string;
}

function OpenToolTip({item, isOpen, tag, setTag}: { item: IListItem[], isOpen: boolean, tag: string, setTag: (tag: string) => void }) {
    return (
        <div
            className={`${isOpen ? "absolute" : "hidden"} open-tool-tip`}>
            <input
                aria-label="Session tag (optional)"
                placeholder="Tag (optional), e.g. DSA"
                value={tag}
                maxLength={TAG_MAX_LENGTH}
                onChange={(e) => setTag(e.target.value)}
                className="tag-input"
            />
            {item.map((item: IListItem, index: number) => (
                <ListItem key={index} handler={item.handler} label={item.label}/>
            ))}
        </div>
    )
}

function ButtonGroup({item}: { item: IButtonItem[] }) {
    return (
        <div className="button-container">
            {item.map((item, index) => (
                <ButtonIcon key={index} {...item}/>
            ))}
        </div>
    )
}


function Logo({handlePlay}: { handlePlay: () => void }) {
    const {timer} = useTimer()
    return (
        <img onClick={handlePlay} src={timer === "PAUSE" ? PlayLogo : PauseLogo} className="h-[30px] lg:h-[48px]" alt=""/>
    )
}

function ButtonIcon({icon, handler, label}: IButtonItem) {
    return (
        <button type="button" aria-label={label} title={label} className="button-icon" onClick={handler}>
            <img src={icon} alt="" className="h-[26px] lg:h-[35px] lg:w-[35px]"/>
        </button>
    )
}

function ListItem({handler, label}: IListItem) {
    return (
        <div
            onClick={handler}
            className="List-item">{label}
        </div>
    )
}

function Header() {
    const {time, setTime} = useTime();
    const {timer, setTimer, kind, setKind, tag, setTag} = useTimer()
    const [isOpenTodoMenu, setIsOpenTodoMenu] = useState(false)
    const storageError = useSyncExternalStore(sessionTracker.subscribe, sessionTracker.getError)

    const handleTodoMenu = () => {
        setIsOpenTodoMenu(!isOpenTodoMenu)
    }

    // Picking a preset mid-session ends that session as stopped (spec Q2).
    const choosePreset = (seconds: number, presetKind: SessionKind) => () => {
        sessionTracker.stop()
        setKind(presetKind)
        setTime(seconds)
        handleTodoMenu()
        setTimer(TIMER_TYPE_ENUM.PAUSE)
    }

    const handleStop = () => {
        sessionTracker.stop()
        setTimer(TIMER_TYPE_ENUM.STOP)
    }

    const handleHistory = () => {
        // TODO: provides line chart for the user
    }

    const handlePlay = () => {
        if (timer === TIMER_TYPE_ENUM.PAUSE) {
            sessionTracker.play(kind, time, tag)
            setTimer(TIMER_TYPE_ENUM.PLAY)
        } else if (timer === TIMER_TYPE_ENUM.PLAY) {
            sessionTracker.pause()
            setTimer(TIMER_TYPE_ENUM.PAUSE)
        }
    }

    const LIST_ITEM: IListItem[] = [
        {
            handler: choosePreset(TODO_TIME_SECONDS, "focus"),
            label: "Lock in Time: 25 Minutes"
        },
        {
            handler: choosePreset(BREAK_TIME_SECONDS, "break"),
            label: "Break Time: 10 Minutes"
        },
        {
            handler: choosePreset(SHORT_BREAK_TIME_SECONDS, "break"),
            label: "Break Time: 5 Minutes"
        },
    ]

    const BUTTON_ITEM: IButtonItem[] = [
        ...(timer === TIMER_TYPE_ENUM.STOP ? [] : [{
            handler: handleStop,
            icon: StopIcon,
            label: "Stop session"
        }]),
        {
            handler: handleTodoMenu,
            icon: TimerIcon,
            label: "Choose a timer"
        },
        {
            handler: handleHistory,
            icon: HistoryIcon,
            label: "History"
        }
    ]


    return (
        <div className="header-container">
            <Logo handlePlay={handlePlay}/>
            <ButtonGroup item={BUTTON_ITEM}/>
            <OpenToolTip isOpen={isOpenTodoMenu} item={LIST_ITEM} tag={tag} setTag={setTag}/>
            {storageError && <p role="status" className="storage-error">Stats not saving: {storageError}</p>}
        </div>
    )
}

export default Header;