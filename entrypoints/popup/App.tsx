import { useState, useEffect } from "react";

interface BgData {
  isActive: boolean;
  mode: string;
  startedAt?: number;
}

function App() {
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState("block");
  const [elapsedTime, setElapsedTime] = useState(0);

  const handleClick = async () => {
    if (!isActive) {
      const response = await browser.runtime.sendMessage({
        message: "start_session",
        mode,
      });

      if (!response?.success) {
        console.error("Could not start session:", response?.error);
        return;
      }
      setIsActive(true);
    } else {
      await browser.runtime.sendMessage({
        message: "stop_session",
        mode,
      });
      setElapsedTime(0);
      setIsActive(false);
    }
  };

  useEffect(() => {
    const getResult = async () => {
      const result = (await browser.storage.local.get([
        "isActive",
        "mode",
      ])) as BgData;

      setIsActive(Boolean(result.isActive));
      if (result.mode) {
        setMode(result.mode);
      }
    };
    getResult();
  }, []);

  function msToTime(duration: number) {
    const totalSec = Math.max(0, Math.floor(duration / 1000));
    const seconds = totalSec % 60;
    const minutes = Math.floor(totalSec / 60) % 60;
    const hours = Math.floor(totalSec / 3600);

    const h = String(hours).padStart(2, "0");
    const m = String(minutes).padStart(2, "0");
    const s = String(seconds).padStart(2, "0");

    return `${h}:${m}:${s}`;
  }

  useEffect(() => {
    if (!isActive) return;

    const fetchSession = async () => {
      try {
        const response = await browser.runtime.sendMessage({
          message: "get_session",
        });
        if (response?.elapsedTime !== undefined) {
          setElapsedTime(response.elapsedTime);
        }
      } catch (e) {
        console.error("Error fetching session:", e);
      }
    };

    void fetchSession();
    const interval = setInterval(fetchSession, 1000);
    return () => clearInterval(interval);
  }, [isActive]);

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