import "tailwindcss/index.css";
import { mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");

if (target) mount(App, { target });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
