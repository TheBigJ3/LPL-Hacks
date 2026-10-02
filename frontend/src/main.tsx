import { createRoot } from 'react-dom/client'
import App from './components/template/App/App'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')
createRoot(root).render(<App />)
