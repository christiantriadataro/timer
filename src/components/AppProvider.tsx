import {compose} from "../effects/effect.helper.tsx";
import App from "../App.tsx";
import EffectProvider from "../effects/effect.provider.tsx";
import TimerProvider from "../timer/timer.provider.tsx";
import TimeProvider from "../time/time.provider.tsx";

function AppProvider() {
    const Providers = compose([
        TimerProvider,
        TimeProvider,
        EffectProvider
    ])

    return <Providers><App/></Providers>
}

export default AppProvider