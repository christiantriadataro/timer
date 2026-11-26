import useTime from "./time/useTime.ts";
import {multiplierMinutes, multiplierSeconds} from "./time/time.helper.ts";
import Header from "./header/Header.tsx";
import Dashboard from "./dashboard/Dashboard.tsx";
import {Route, Routes} from "react-router";


function Num({value}: { value: number }) {
    return (
        <div className="flex justify-center w-[70px] sm:w-[120px] md:w-[180px] xl:w-[350px] rounded-xl items-center text-[#E1E1E6]">{value}</div>
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


// Providers sit above the routes (AppProvider), so a running countdown keeps going on /dashboard.
function App() {
    return (
        <Routes>
            <Route path="/" element={
                <div className="app-container">
                    <Header/>
                    <div className="content">
                        <Timer/>
                    </div>
                </div>
            }/>
            <Route path="/dashboard" element={<Dashboard/>}/>
        </Routes>
    )
}

export default App
