import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import './index.css'
import AppProvider from "./components/AppProvider.tsx";


createRoot(document.getElementById('root')!).render(
    <StrictMode>
       <AppProvider/>
    </StrictMode>,
)
