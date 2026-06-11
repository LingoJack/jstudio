import { createRoot } from 'react-dom/client'
import './reader.css'
import { StudioApp } from './app/studio/StudioApp'

const root = document.getElementById('reader-root')
if (root) {
  createRoot(root).render(<StudioApp />)
}
