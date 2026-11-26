import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from "react-router";
import './index.css'
import AppProvider from "./components/AppProvider.tsx";


createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter>
            <AppProvider/>
        </BrowserRouter>
    </StrictMode>,
)
