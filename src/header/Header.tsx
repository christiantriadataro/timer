import useTime from "../time/useTime.ts";
import useTimer from "../timer/useTimer.ts";
import {useState} from "react";
import {TIMER_TYPE_ENUM} from "../timer/time.types.ts";
import PlayLogo from "../assets/icons/play.svg";
import PauseLogo from "../assets/icons/pause.svg";
import TimerIcon from "../assets/icons/timer.svg";
import HistoryIcon from "../assets/icons/history.svg";
import {TODO_TIME_SECONDS} from "./header.constants.ts";

interface IButtonItem {
    handler: () => void,
    icon: string;
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
                <ButtonIcon key={index} icon={item.icon} handler={item.handler}/>
            ))}
        </div>
    )
}


function Logo({handlePlay}: { handlePlay: () => void }) {
    const {timer} = useTimer()
    return (
        <img onClick={handlePlay} src={timer === "PAUSE" ? PlayLogo : PauseLogo} className="h-[48px]" alt=""/>
    )
}

function ButtonIcon({icon, handler}: { icon: string, handler?: () => void }) {
    return (
        <div className="button-icon" onClick={handler}>
            <img src={icon} alt="" className="h-[26px]"/>
        </div>
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
        // setTime(BREAK_TIME_SECONDS)
        setTime(3)
        handleTodoMenu()
        setTimer(TIMER_TYPE_ENUM.PAUSE)
    }

    const handleTodoTime = () => {
        setTime(TODO_TIME_SECONDS)
        handleTodoMenu()
        setTimer(TIMER_TYPE_ENUM.PAUSE)
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
    ]

    const BUTTON_ITEM: IButtonItem[] = [
        {
            handler: handleTodoMenu,
            icon: TimerIcon
        },
        {
            handler: handleHistory,
            icon: HistoryIcon
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