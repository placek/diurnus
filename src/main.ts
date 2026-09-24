// Czcionki i style wchodzą do bundla: strona na GitHub Pages nie może zależeć
// od CDN-u, bo traci typografię i ikony w trybie offline.
import '@fontsource/ibm-plex-sans-condensed/400.css';
import '@fontsource/ibm-plex-sans-condensed/500.css';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import './app.css';

import { mount } from 'svelte';
import App from './App.svelte';

export default mount(App, { target: document.body });
