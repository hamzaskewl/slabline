'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="route-loading"><h1>This view couldn’t load.</h1><p>Retry the request to reconnect to the market.</p><button onClick={reset}>Try again</button></main>;}
