import useTime from "../time/useTime.ts";
import useTimer from "../timer/useTimer.ts";
import {useState} from "react";
import {TIMER_TYPE_ENUM} from "../timer/time.types.ts";
import PlayLogo from "../assets/icons/play.svg";
import PauseLogo from "../assets/icons/pause.svg";
import TimerIcon from "../assets/icons/timer.svg";
import HistoryIcon from "../assets/icons/history.svg";
import StopIcon from "../assets/icons/stop.svg";
import {BREAK_TIME_SECONDS, TODO_TIME_SECONDS} from "./header.constants.ts";

interface IButtonItem {
    handler: () => void,
    icon: string;
    label: string;
}

interface IListItem {
    handler: () => void,
    label: string;
}

function OpenToolTip({item, isOpen}: { item: IListItem[], isOpen: boolean }) {
    return (
        <div
            className={`${isOpen ? "absolute" : "hidden"} open-tool-tip`}>
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
    const {setTime} = useTime();
    const {timer, setTimer} = useTimer()
    const [isOpenTodoMenu, setIsOpenTodoMenu] = useState(false)

    const handleTodoMenu = () => {
        setIsOpenTodoMenu(!isOpenTodoMenu)
    }

    const handleBreakTime = () => {
        setTime(BREAK_TIME_SECONDS)
        // setTime(3)
        handleTodoMenu()
        setTimer(TIMER_TYPE_ENUM.PAUSE)
    }

    const handleTodoTime = () => {
        setTime(TODO_TIME_SECONDS)
        handleTodoMenu()
        setTimer(TIMER_TYPE_ENUM.PAUSE)
    }

    const handleBreakTime5 = () => {
        const BREAK_TIME_FIVE_SECODNS = 5 * 60
         setTime(BREAK_TIME_FIVE_SECODNS)
        handleTodoMenu()
        setTimer(TIMER_TYPE_ENUM.PAUSE)
    }

    const handleStop = () => {
        setTimer(TIMER_TYPE_ENUM.STOP)
    }

    const handleHistory = () => {
        // TODO: provides line chart for the user
    }

    const handlePlay = () => {
        if (timer === TIMER_TYPE_ENUM.PAUSE) {
            setTimer(TIMER_TYPE_ENUM.PLAY)
        } else if (timer === TIMER_TYPE_ENUM.PLAY) {
            setTimer(TIMER_TYPE_ENUM.PAUSE)
        }
    }

    const LIST_ITEM: IListItem[] = [
        {
            handler: handleTodoTime,
            label: "Lock in Time: 25 Minutes"
        },
        {
            handler: handleBreakTime,
            label: "Break Time: 10 Minutes"
        },
         {
            handler: handleBreakTime5,
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
            <OpenToolTip isOpen={isOpenTodoMenu} item={LIST_ITEM}/>
        </div>
    )
}

export default Header;