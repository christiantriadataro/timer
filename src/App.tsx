import useTime from "./time/useTime.ts";
import {multiplierMinutes, multiplierSeconds} from "./time/time.helper.ts";
import Header from "./header/Header.tsx";


function Num({value}: { value: number }) {
    return (
        <div className="flex justify-center w-[90px] sm:w-[120px] md:w-[180px] xl:w-[350px] rounded-xl items-center text-[#E1E1E6]">{value}</div>
    )
}

function Timer() {
    const {time} = useTime()
    return (
        <>
          <div className="timer-container">
                    <div className="flex gap-5">
                        <Num value={Math.floor(multiplierMinutes(time) / 10)}/>
                        <Num value={multiplierMinutes(time) % 10}/>
                    </div>
                    <div className="flex gap-5">
                        <Num value={Math.floor(multiplierSeconds(time) / 10)}/>
                        <Num value={multiplierSeconds(time) % 10}/>
                    </div>
                </div>
                <div className="black-line"></div>
        </>
    )
}


function App() {
    return (
        <div className="app-container">
            <Header/>
            <div className="content">
                <Timer/>
            </div>
        </div>
    )
}

export default App
