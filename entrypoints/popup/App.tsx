import { useState } from "react";
import { useEffect } from "react";
interface bg {
  isActive: boolean;
  mode: string;
  startedAt:number;
}
function App() {
  let [isActive, setisActive] = useState(false);
  let [mode, setMode] = useState("block");
  const [elapsedTime, setElapsedTime] = useState(0);
  const handleClick = async() => {
    const nextState = !isActive;
    if (nextState) {
      browser.runtime.sendMessage({
        message: "start_session",
        mode: mode,
      });
      // window.close();
    } else {
      browser.runtime.sendMessage({
        message: "stop_session",
        mode: mode,            
      });
      setElapsedTime(0); 
    }
    setisActive(!isActive);
  };

  useEffect(() => {
    const getResult = async () => {
     const result = (await browser.storage.local.get([
  "isActive",
  "mode",
])) as bg;
      setisActive(result.isActive || false);
    if (result.mode) {
  setMode(result.mode);
}
    };
    getResult();
  }, []);
function msToTime(duration: number) {
  const seconds = Math.floor((duration / 1000) % 60);
  const minutes = Math.floor((duration / (1000 * 60)) % 60);
  const hours = Math.floor(duration / (1000 * 60 * 60));

  const h = String(hours).padStart(2, "0");
  const m = String(minutes).padStart(2, "0");
  const s = String(seconds).padStart(2, "0");

  return `${h}:${m}:${s}`;
}
useEffect(()=>{
  if(!isActive)return;
  const getSession=()=>{
      browser.runtime.sendMessage({message:"get_session",mode:mode},(response)=>{
      setElapsedTime(response.elapsedTime);
  });
  };
  getSession();
   const inter = setInterval(() => {
    getSession();
  }, 1000);
  return ()=>clearInterval(inter);
},[isActive])

const time = msToTime(elapsedTime);
  return (
    <div className="w-[360px] min-h-[420px] bg-zinc-950 text-white p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Nudge</h1>

        <span className="text-sm text-zinc-400">Focus</span>
      </div>

      <div className="mt-10 text-center">
        <p className="text-zinc-400 text-sm">Ready to focus?</p>

        <h2 className="mt-3 text-5xl font-semibold tracking-tight">{time}</h2>

        <p className="mt-3 text-sm text-zinc-500">
          Start a session to begin tracking
        </p>
      </div>

      <div className="mt-10">
        <p className="mb-3 text-sm text-zinc-400">Mode</p>

        <div className="grid grid-cols-2 gap-2">
          <button
            className={
              mode === "block"
                ? "rounded-xl bg-white text-black py-3 font-medium"
                : "rounded-xl bg-zinc-800 text-zinc-300 py-3 font-medium"
            }
            onClick={() => setMode("block")}
          >
            Block
          </button>

          <button
            className={
              mode === "restrict"
                ? "rounded-xl bg-white text-black py-3 font-medium"
                : "rounded-xl bg-zinc-800 text-zinc-300 py-3 font-medium"
            }
            onClick={() => setMode("restrict")}
          >
            Restrict
          </button>
        </div>
      </div>

   <button
       className="mt-6 w-full rounded-xl bg-white py-3.5 cursor-pointer text-black font-semibold"
         onClick={handleClick}
       >
       {isActive ? "Stop Focus" : "Start Focus"}
     </button>
    </div>
  );
}

export default App;

  //
