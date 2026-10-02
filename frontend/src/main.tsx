import './index.css'
import { createRoot } from 'react-dom/client'
import App from './components/template/App/App'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')
createRoot(root).render(<App />)
