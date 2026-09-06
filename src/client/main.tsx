import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';
import type { Bootstrap } from '../shared/types';
import './styles.css';
import 'maplibre-gl/dist/maplibre-gl.css';

declare global { interface Window { __BOOTSTRAP__?: Bootstrap; } }
const root=document.getElementById('root')!;
const props={path:location.pathname,search:location.search};
if(window.__BOOTSTRAP__)hydrateRoot(root,<App initial={window.__BOOTSTRAP__} {...props}/>);
else fetch(`/api/bootstrap?path=${encodeURIComponent(location.pathname)}`).then(async r=>{if(!r.ok)throw new Error('Unable to load the directory');return r.json() as Promise<Bootstrap>;}).then(initial=>createRoot(root).render(<App initial={initial} {...props}/>)).catch(()=>{root.innerHTML='<main style="max-width:600px;margin:15vh auto;padding:24px;font-family:system-ui"><h1>The directory is temporarily unavailable.</h1><p>Check your connection and try again.</p><button onclick="location.reload()">Try again</button></main>';});
if('serviceWorker'in navigator&&!import.meta.env.DEV)window.addEventListener('load',()=>{void navigator.serviceWorker.register('/sw.js');});
